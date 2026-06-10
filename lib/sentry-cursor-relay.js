/**
 * Parse Sentry issue-alert webhook payloads and forward a normalized body to Cursor Automations.
 */

import { forwardToCursorAutomationWebhook } from './cursor-automation-webhook.js';

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
    automation: 'sentry-self-heal',
    dedupeId: issueId,
    organization: organizationSlug || defaults.organization || 'jtlh-ltd',
    project: projectSlug || defaults.project || 'ai-booking-mvp',
    issue: {
      id: issueId,
      url: issueUrl || `https://jtlh-ltd.sentry.io/issues/${issueId}`
    }
  };
}

export async function forwardToCursorSelfHealWebhook(body, options = {}) {
  const payload = buildCursorSelfHealPayload(body, options.defaults);
  return forwardToCursorAutomationWebhook({
    automationType: 'sentry-self-heal',
    payload,
    dedupeId: payload.issue.id,
    url: options.url,
    auth: options.auth,
    force: options.force === true
  });
}
