import express from 'express';
import { handleWebhooksNewLead } from '../lib/webhooks-new-lead.js';
import { handleWebhooksFacebookLead } from '../lib/webhooks-facebook-lead.js';

/**
 * Meta / Zapier-style lead webhooks mounted at repo root paths (not under /api).
 */
export function createMetaIngestWebhooksRouter(deps) {
  const { webhooksNewLeadDeps, webhooksFacebookLeadDeps } = deps || {};
  const router = express.Router();

  router.post('/webhooks/new-lead/:clientKey', (req, res) =>
    handleWebhooksNewLead(req, res, webhooksNewLeadDeps)
  );

  router.post('/webhooks/facebook-lead/:clientKey', (req, res) =>
    handleWebhooksFacebookLead(req, res, webhooksFacebookLeadDeps)
  );

  return router;
}
