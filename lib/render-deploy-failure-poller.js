import { forwardToCursorAutomationWebhook } from './cursor-automation-webhook.js';

const FAILURE_STATUSES = new Set(['build_failed', 'update_failed', 'canceled']);
const recentDeployChecks = new Map();
const CHECK_COOLDOWN_MS = 60 * 60 * 1000;

function markChecked(deployId) {
  recentDeployChecks.set(deployId, Date.now());
  for (const [id, at] of recentDeployChecks) {
    if (Date.now() - at > CHECK_COOLDOWN_MS) recentDeployChecks.delete(id);
  }
}

function recentlyChecked(deployId) {
  const at = recentDeployChecks.get(deployId);
  return at != null && Date.now() - at < CHECK_COOLDOWN_MS;
}

export async function pollRenderForDeployFailures(options = {}) {
  if (process.env.RENDER_DEPLOY_FAIL_POLLER_ENABLED !== 'true') {
    return { ok: true, skipped: true, reason: 'poller_disabled' };
  }

  const token = options.token || process.env.RENDER_API_KEY;
  if (!token) {
    return { ok: false, error: 'RENDER_API_KEY not configured' };
  }

  const serviceId = options.serviceId || process.env.RENDER_SERVICE_ID || 'srv-d2vvdqbuibrs73dq57ug';
  const repository = options.repository || 'jtlhltd/ai-booking-mvp';
  const response = await fetch(`https://api.render.com/v1/services/${serviceId}/deploys?limit=5`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: `Render deploy poll failed (${response.status}): ${text}` };
  }

  const page = await response.json();
  const triggered = [];

  for (const item of page) {
    const deploy = item?.deploy;
    if (!deploy?.id || !FAILURE_STATUSES.has(deploy.status)) continue;
    if (recentlyChecked(deploy.id)) continue;

    const finishedAt = deploy.finishedAt ? Date.parse(deploy.finishedAt) : NaN;
    if (!Number.isNaN(finishedAt) && Date.now() - finishedAt > 60 * 60 * 1000) continue;

    const payload = {
      source: 'render-deploy-failure-poller',
      automation: 'deploy-failed',
      dedupeId: deploy.id,
      repository,
      serviceId,
      deploy: {
        id: deploy.id,
        status: deploy.status,
        commit: deploy.commit?.id || null,
        message: deploy.commit?.message || null,
        finishedAt: deploy.finishedAt || null,
        trigger: deploy.trigger || null
      },
      dashboardUrl: `https://dashboard.render.com/web/${serviceId}/deploys/${deploy.id}`
    };

    await forwardToCursorAutomationWebhook({
      automationType: 'deploy-failed',
      payload,
      dedupeId: deploy.id
    });

    markChecked(deploy.id);
    triggered.push(deploy.id);
  }

  return { ok: true, triggered };
}

/** Test helper */
export function resetRenderDeployFailurePollerForTests() {
  recentDeployChecks.clear();
}
