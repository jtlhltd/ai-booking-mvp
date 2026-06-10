import express from 'express';
import { forwardToCursorSelfHealWebhook } from '../lib/sentry-cursor-relay.js';
import { resolveSentryIssue } from '../lib/sentry-resolve-issue.js';

function relaySecretMatches(req) {
  const expected = process.env.SENTRY_SELF_HEAL_RELAY_SECRET;
  if (!expected) return true;
  const provided =
    req.get('x-sentry-self-heal-secret') ||
    req.get('x-webhook-secret') ||
    req.query?.secret;
  return provided === expected;
}

/**
 * Sentry issue-alert relay → Cursor Automations webhook.
 * Configure Sentry "Send a webhook request" to POST here (optional shared secret header).
 */
export function createSentryCursorRelayRouter() {
  const router = express.Router();

  router.post('/webhooks/sentry-self-heal', express.json({ limit: '256kb' }), async (req, res) => {
    if (!relaySecretMatches(req)) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    try {
      const result = await forwardToCursorSelfHealWebhook(req.body);
      return res.status(200).json({
        ok: true,
        forwarded: true,
        cursor: result.body,
        issue: result.payload.issue
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes('Could not resolve Sentry issue id') ? 400 : 502;
      return res.status(status).json({ ok: false, error: message });
    }
  });

  router.post('/webhooks/sentry-self-heal/resolve', express.json({ limit: '64kb' }), async (req, res) => {
    if (!relaySecretMatches(req)) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    try {
      const result = await resolveSentryIssue(req.body, {
        reason: req.body?.reason || req.body?.comment
      });
      return res.status(200).json({ ok: true, resolved: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes('Could not resolve') ? 400 : 502;
      return res.status(status).json({ ok: false, error: message });
    }
  });

  return router;
}
