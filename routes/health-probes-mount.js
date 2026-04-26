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

  return router;
}
