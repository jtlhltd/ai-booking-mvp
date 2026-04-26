import express from 'express';
import { handleSmsTestEndpoint } from '../lib/sms-test-endpoint.js';
import { handleDashboardReset } from '../lib/dashboard-reset.js';
import { handleLeadsScore, handleLeadsPrioritize } from '../lib/leads-score-prioritize.js';
import { handleRoiCalculatorSave } from '../lib/roi-calculator-save.js';

/**
 * Small JSON POST endpoints previously registered inline on server.js.
 */
export function createInlineJsonApiRouter(deps) {
  const {
    getApiKey,
    dashboardResetDeps,
    leadsScorePrioritizeDeps,
    roiCalculatorSaveDeps
  } = deps || {};

  const router = express.Router();

  router.post('/sms', (req, res) => handleSmsTestEndpoint(req, res, { getApiKey }));

  router.post('/api/dashboard/reset/:clientKey', (req, res) =>
    handleDashboardReset(req, res, dashboardResetDeps)
  );

  router.post('/api/leads/score', (req, res) => handleLeadsScore(req, res, leadsScorePrioritizeDeps));
  router.post('/api/leads/prioritize', (req, res) => handleLeadsPrioritize(req, res, leadsScorePrioritizeDeps));

  router.post('/api/roi-calculator/save', (req, res) => handleRoiCalculatorSave(req, res, roiCalculatorSaveDeps));

  return router;
}
