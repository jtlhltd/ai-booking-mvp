import { forwardToCursorSelfHealWebhook } from './sentry-cursor-relay.js';

const TRIGGER_COOLDOWN_MS = 60 * 60 * 1000;
const recentTriggers = new Map();

function shouldSkipIssue(issue) {
  const status = String(issue?.status || '').toLowerCase();
  if (status === 'ignored') return true;

  const category = String(issue?.issueCategory || issue?.issue_category || '').toLowerCase();
  if (category === 'test_notification') return true;

  const issueType = String(issue?.issueType || issue?.issue_type || '').toLowerCase();
  if (issueType === 'send-test-notification') return true;

  const title = String(issue?.title || issue?.metadata?.value || '').toLowerCase();
  const culprit = String(issue?.culprit || '').toLowerCase();
  if (title.includes('sentry debug test error')) return true;
  if (title === 'test issue') return true;
  if (culprit.includes('/debug-sentry')) return true;
  if (culprit.includes('test notification')) return true;
  if (culprit.includes('/heal-test') && process.env.HEAL_TEST_ENABLED !== 'true') return true;

  return false;
}

function issueSeenRecently(issue) {
  const lastSeen = issue?.lastSeen ? Date.parse(issue.lastSeen) : NaN;
  if (Number.isNaN(lastSeen)) return true;
  return Date.now() - lastSeen <= 15 * 60 * 1000;
}

function markTriggered(issueId) {
  recentTriggers.set(issueId, Date.now());
  for (const [id, at] of recentTriggers) {
    if (Date.now() - at > TRIGGER_COOLDOWN_MS) recentTriggers.delete(id);
  }
}

function recentlyTriggered(issueId) {
  const at = recentTriggers.get(issueId);
  return at != null && Date.now() - at < TRIGGER_COOLDOWN_MS;
}

export async function pollSentryForSelfHeal(options = {}) {
  if (process.env.SENTRY_SELF_HEAL_POLLER_ENABLED !== 'true') {
    return { ok: true, skipped: true, reason: 'poller_disabled' };
  }

  const token = options.token || process.env.SENTRY_AUTH_TOKEN;
  if (!token) {
    return { ok: false, error: 'SENTRY_AUTH_TOKEN not configured' };
  }

  const organization = options.organization || 'jtlh-ltd';
  const project = options.project || 'ai-booking-mvp';
  const regionHost = options.regionHost || 'de.sentry.io';
  const url = `https://${regionHost}/api/0/projects/${organization}/${project}/issues/?query=lastSeen:-15m&limit=10`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  });
  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: `Sentry poll failed (${response.status}): ${text}` };
  }

  const issues = await response.json();
  const triggered = [];

  for (const issue of issues) {
    const issueId = issue.shortId || issue.id;
    if (!issueId || shouldSkipIssue(issue) || !issueSeenRecently(issue) || recentlyTriggered(issueId)) {
      continue;
    }

    await forwardToCursorSelfHealWebhook({
      data: {
        issue: {
          id: issueId,
          title: issue.title,
          culprit: issue.culprit,
          url: `https://${organization}.sentry.io/issues/${issueId}`,
          project: { slug: project }
        }
      },
      organization,
      project
    });

    markTriggered(issueId);
    triggered.push(issueId);
  }

  return { ok: true, triggered };
}

/** Test helper */
export function resetSelfHealPollerStateForTests() {
  recentTriggers.clear();
}
