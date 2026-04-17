import express from 'express';

export function createReportsRouter(deps) {
  const { authenticateApiKey } = deps || {};
  const router = express.Router();

  router.get('/reports/:clientKey', authenticateApiKey, async (req, res) => {
    try {
      const { clientKey } = req.params;
      const period = req.query.period || 'weekly';

      const { generateClientReport } = await import('../lib/automated-reporting.js');
      const report = await generateClientReport(clientKey, period);

      if (report.error) {
        return res.status(404).json({ ok: false, error: report.error });
      }

      res.json({
        ok: true,
        report,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[REPORT GENERATION ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/reports/:clientKey/send', authenticateApiKey, async (req, res) => {
    try {
      const { clientKey } = req.params;
      const { period = 'weekly', email = null } = req.body;

      const { sendClientReport } = await import('../lib/automated-reporting.js');
      const result = await sendClientReport(clientKey, period, email);

      if (!result.success) {
        return res.status(400).json({ ok: false, error: result.error });
      }

      res.json({
        ok: true,
        result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[SEND REPORT ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

