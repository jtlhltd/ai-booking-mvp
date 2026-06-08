import express from 'express';
import { handleHealthz } from '../lib/healthz.js';
import { handleGcalPing } from '../lib/gcal-ping.js';

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
    if (!process.env.SENTRY_DSN?.trim()) {
      return res.status(503).json({ ok: false, error: 'sentry_not_configured' });
    }
    next(new Error('Sentry debug test error'));
  });

  return router;
}
