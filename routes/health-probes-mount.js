import express from 'express';
import * as Sentry from '@sentry/node';
import { handleHealthz } from '../lib/healthz.js';
import { handleGcalPing } from '../lib/gcal-ping.js';
import { isSentryEnabled } from '../lib/sentry.js';

/**
 * Load balancer / ops probes (previously inline `app['get']` in server.js).
 */
export function createHealthProbesRouter(deps) {
  const { healthzDeps, gcalPingDeps } = deps || {};
  const router = express.Router();

  router.get('/healthz', (req, res) => handleHealthz(req, res, healthzDeps));
  router.get('/gcal/ping', (req, res) => handleGcalPing(req, res, gcalPingDeps));

  router.get('/debug-sentry', (req, res, next) => {
    if (process.env.DEBUG_SENTRY !== 'true') {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    if (!isSentryEnabled()) {
      return res.status(503).json({ ok: false, error: 'sentry_not_configured' });
    }
    next(new Error('Sentry debug test error'));
  });

  router.get('/debug-sentry-trace', async (req, res) => {
    if (process.env.DEBUG_SENTRY !== 'true') {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    if (!isSentryEnabled()) {
      return res.status(503).json({ ok: false, error: 'sentry_not_configured' });
    }

    const result = await Sentry.startSpan(
      { name: 'GET /debug-sentry-trace', op: 'test.http' },
      async (span) => {
        span.setAttribute('debug', true);
        await Sentry.flush(2000);
        return { ok: true, message: 'trace emitted' };
      }
    );

    return res.json(result);
  });

  return router;
}
