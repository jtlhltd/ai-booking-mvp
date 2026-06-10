import express from 'express';
import { automationRelaySecretMatches } from '../lib/automation-relay-auth.js';
import { forwardGithubAutomationWebhook } from '../lib/github-automation-relay.js';
import { forwardToCursorSelfHealWebhook } from '../lib/sentry-cursor-relay.js';
import { resolveSentryIssue } from '../lib/sentry-resolve-issue.js';

/**
 * Relay external events → Cursor Automations webhooks.
 * Sentry self-heal, GitHub CI/Dependabot, and (via poller) Render deploy failures.
 */
export function createCursorAutomationRelayRouter() {
  const router = express.Router();

  router.post('/webhooks/sentry-self-heal', express.json({ limit: '256kb' }), async (req, res) => {
    if (!automationRelaySecretMatches(req)) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    try {
      const result = await forwardToCursorSelfHealWebhook(req.body);
      return res.status(200).json({
        ok: true,
        forwarded: !result.deduped,
        deduped: result.deduped === true,
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
    if (!automationRelaySecretMatches(req)) {
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

  router.post('/webhooks/automation/github', express.json({ limit: '256kb' }), async (req, res) => {
    if (!automationRelaySecretMatches(req)) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    try {
      const result = await forwardGithubAutomationWebhook(req.body);
      return res.status(200).json({
        ok: true,
        forwarded: !result.deduped,
        deduped: result.deduped === true,
        cursor: result.body,
        automation: result.payload.automation
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes('requires') ? 400 : 502;
      return res.status(status).json({ ok: false, error: message });
    }
  });

  return router;
}

/** @deprecated alias */
export const createSentryCursorRelayRouter = createCursorAutomationRelayRouter;
