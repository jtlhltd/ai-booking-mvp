import { extractSentryIssueContext } from './sentry-cursor-relay.js';

function resolveAuthToken() {
  // Single SENTRY_AUTH_TOKEN should include event:write (Issue & Event → Write in Sentry UI).
  return (process.env.SENTRY_AUTH_TOKEN || process.env.SENTRY_RESOLVE_AUTH_TOKEN || '').trim();
}

export async function resolveSentryIssue(body, options = {}) {
  const token = options.token || resolveAuthToken();
  if (!token) {
    throw new Error('SENTRY_RESOLVE_AUTH_TOKEN or SENTRY_AUTH_TOKEN with event:write must be configured');
  }

  const { issueId, organizationSlug } = extractSentryIssueContext(body);
  if (!issueId) {
    throw new Error('Could not resolve Sentry issue id from request body');
  }

  const organization = organizationSlug || options.organization || 'jtlh-ltd';
  const regionHost = options.regionHost || 'de.sentry.io';
  const reason = options.reason || 'Self-heal loop verified in production';

  const response = await fetch(
    `https://${regionHost}/api/0/organizations/${organization}/issues/${issueId}/`,
    {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ status: 'resolved' })
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sentry resolve failed (${response.status}): ${text}`);
  }

  const issue = await response.json();

  if (reason) {
    await fetch(`https://${regionHost}/api/0/organizations/${organization}/issues/${issueId}/comments/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ text: reason })
    }).catch(() => {});
  }

  return { issueId, status: issue.status || 'resolved', organization };
}
