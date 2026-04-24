/**
 * Core API: A/B testing results.
 *
 * GET /api/ab-test-results/:clientKey
 */
import { Router } from 'express';

export function createAbTestResultsRouter() {
  const router = Router();

  router.get('/ab-test-results/:clientKey', async (req, res) => {
    try {
      const { clientKey } = req.params;
      const { getABTestResults } = await import('../lib/ab-testing.js');
      const results = await getABTestResults(clientKey);
      res.json({ ok: true, ...results });
    } catch (error) {
      console.error('[AB TEST RESULTS ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

