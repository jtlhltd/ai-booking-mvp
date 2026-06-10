import {
  beginAutomationTrigger,
  completeAutomationTrigger,
  shouldDedupeAutomationTrigger
} from './automation-trigger-dedupe.js';

export const CURSOR_AUTOMATION_TYPES = {
  'sentry-self-heal': {
    urlEnv: 'CURSOR_SELF_HEAL_WEBHOOK_URL',
    authEnv: 'CURSOR_SELF_HEAL_WEBHOOK_AUTH'
  },
  'ci-failed': {
    urlEnv: 'CURSOR_CI_FAIL_WEBHOOK_URL',
    authEnv: 'CURSOR_CI_FAIL_WEBHOOK_AUTH'
  },
  dependabot: {
    urlEnv: 'CURSOR_DEPENDABOT_WEBHOOK_URL',
    authEnv: 'CURSOR_DEPENDABOT_WEBHOOK_AUTH'
  },
  'deploy-failed': {
    urlEnv: 'CURSOR_DEPLOY_FAIL_WEBHOOK_URL',
    authEnv: 'CURSOR_DEPLOY_FAIL_WEBHOOK_AUTH'
  }
};

function resolveWebhookConfig(automationType, overrides = {}) {
  const spec = CURSOR_AUTOMATION_TYPES[automationType];
  if (!spec) {
    throw new Error(`Unknown automation type: ${automationType}`);
  }
  const url = overrides.url || process.env[spec.urlEnv];
  let auth = overrides.auth || process.env[spec.authEnv];
  if (!url || !auth) {
    throw new Error(`${spec.urlEnv} and ${spec.authEnv} must be configured`);
  }
  auth = String(auth).replace(/^Bearer\s+/i, '').trim();
  return { url, auth };
}

export async function forwardToCursorAutomationWebhook({
  automationType,
  payload,
  dedupeId,
  url,
  auth,
  force = false
}) {
  const { url: webhookUrl, auth: webhookAuth } = resolveWebhookConfig(automationType, { url, auth });
  const id = dedupeId || payload?.dedupeId || payload?.id;
  if (!id) {
    throw new Error('dedupeId is required for automation webhook forward');
  }

  const dedupe = shouldDedupeAutomationTrigger(automationType, id, { force });
  if (dedupe.dedupe) {
    return {
      status: 200,
      body: { success: true, deduped: true, reason: dedupe.reason, remainingMs: dedupe.remainingMs },
      payload,
      deduped: true
    };
  }

  if (!beginAutomationTrigger(automationType, id)) {
    return {
      status: 200,
      body: { success: true, deduped: true, reason: 'in_flight' },
      payload,
      deduped: true
    };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${webhookAuth}`,
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

    completeAutomationTrigger(automationType, id, { succeeded: true });
    return { status: response.status, body: parsed, payload };
  } catch (err) {
    completeAutomationTrigger(automationType, id, { succeeded: false });
    throw err;
  }
}
