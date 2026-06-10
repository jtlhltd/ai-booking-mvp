/**
 * Parse Sentry issue-alert webhook payloads and forward a normalized body to Cursor Automations.
 */

import {
  beginSelfHealTrigger,
  completeSelfHealTrigger,
  shouldDedupeSelfHealTrigger
} from './sentry-self-heal-trigger-dedupe.js';

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function issueIdFromUrl(url) {
  if (!url) return null;
  const match = String(url).match(/\/issues\/([^/?#]+)/i);
  return match?.[1] ?? null;
}

export function extractSentryIssueContext(body) {
  const payload = body && typeof body === 'object' ? body : {};
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  const issue =
    (payload.issue && typeof payload.issue === 'object' && payload.issue) ||
    (data.issue && typeof data.issue === 'object' && data.issue) ||
    {};

  const issueId = firstNonEmpty(
    issue.id,
    issue.shortId,
    payload.issue_id,
    payload.issueId,
    data.issue_id,
    data.issueId,
    issueIdFromUrl(issue.url),
    issueIdFromUrl(issue.permalink),
    issueIdFromUrl(payload.url)
  );

  const projectSlug = firstNonEmpty(
    payload.project,
    payload.project_slug,
    issue.project?.slug,
    data.project?.slug,
    data.project_slug,
    issue.project
  );

  const organizationSlug = firstNonEmpty(
    payload.organization,
    payload.organization_slug,
    issue.organization?.slug,
    data.organization?.slug,
    data.organization_slug
  );

  const issueUrl =
    firstNonEmpty(issue.url, issue.permalink, payload.url) ||
    (issueId && organizationSlug
      ? `https://${organizationSlug}.sentry.io/issues/${issueId}`
      : null);

  return { issueId, issueUrl, projectSlug, organizationSlug };
}

export function buildCursorSelfHealPayload(body, defaults = {}) {
  const { issueId, issueUrl, projectSlug, organizationSlug } = extractSentryIssueContext(body);
  if (!issueId) {
    throw new Error('Could not resolve Sentry issue id from webhook payload');
  }

  return {
    source: 'sentry-self-heal-relay',
    organization: organizationSlug || defaults.organization || 'jtlh-ltd',
    project: projectSlug || defaults.project || 'ai-booking-mvp',
    issue: {
      id: issueId,
      url: issueUrl || `https://jtlh-ltd.sentry.io/issues/${issueId}`
    }
  };
}

export async function forwardToCursorSelfHealWebhook(body, options = {}) {
  const url = options.url || process.env.CURSOR_SELF_HEAL_WEBHOOK_URL;
  let auth = options.auth || process.env.CURSOR_SELF_HEAL_WEBHOOK_AUTH;
  if (!url || !auth) {
    throw new Error('CURSOR_SELF_HEAL_WEBHOOK_URL and CURSOR_SELF_HEAL_WEBHOOK_AUTH must be configured');
  }

  auth = String(auth).replace(/^Bearer\s+/i, '').trim();
  const payload = buildCursorSelfHealPayload(body, options.defaults);
  const issueId = payload.issue.id;

  const dedupe = shouldDedupeSelfHealTrigger(issueId, options);
  if (dedupe.dedupe) {
    return {
      status: 200,
      body: { success: true, deduped: true, reason: dedupe.reason, remainingMs: dedupe.remainingMs },
      payload,
      deduped: true
    };
  }

  if (!beginSelfHealTrigger(issueId)) {
    return {
      status: 200,
      body: { success: true, deduped: true, reason: 'in_flight' },
      payload,
      deduped: true
    };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    if (!response.ok) {
      const detail = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
      throw new Error(`Cursor webhook failed (${response.status}): ${detail}`);
    }

    completeSelfHealTrigger(issueId, { succeeded: true });
    return { status: response.status, body: parsed, payload };
  } catch (err) {
    completeSelfHealTrigger(issueId, { succeeded: false });
    throw err;
  }
}
