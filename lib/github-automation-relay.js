import { forwardToCursorAutomationWebhook } from './cursor-automation-webhook.js';

export function buildGithubAutomationPayload(body) {
  const payload = body && typeof body === 'object' ? body : {};
  const type = String(payload.type || '').trim();
  if (!type) {
    throw new Error('GitHub automation payload requires type (ci-failed | dependabot-pr)');
  }

  const repository =
    payload.repository ||
    (payload.repo ? `jtlhltd/${payload.repo}` : 'jtlhltd/ai-booking-mvp');
  const dedupeId = payload.dedupeId || payload.runId || payload.pullNumber;
  if (!dedupeId) {
    throw new Error('GitHub automation payload requires dedupeId, runId, or pullNumber');
  }

  return {
    source: 'github-automation-relay',
    automation: type === 'dependabot-pr' ? 'dependabot' : 'ci-failed',
    type,
    dedupeId: String(dedupeId),
    repository,
    branch: payload.branch || 'main',
    workflow: payload.workflow || null,
    runId: payload.runId || null,
    runUrl: payload.runUrl || null,
    pullNumber: payload.pullNumber || null,
    pullUrl: payload.pullUrl || null,
    title: payload.title || null,
    commit: payload.commit || null,
    actor: payload.actor || null
  };
}

export async function forwardGithubAutomationWebhook(body, options = {}) {
  const normalized = buildGithubAutomationPayload(body);
  const automationType = normalized.automation;
  return forwardToCursorAutomationWebhook({
    automationType,
    payload: normalized,
    dedupeId: normalized.dedupeId,
    force: options.force === true
  });
}
