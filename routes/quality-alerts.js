import express from 'express';

export function createQualityAlertsRouter(deps) {
  const { getQualityAlerts, resolveQualityAlert } = deps || {};
  const router = express.Router();

  router.get('/quality-alerts/:clientKey', async (req, res) => {
    try {
      const { clientKey } = req.params;
      const resolved = req.query.resolved === 'true';

      const alerts = await getQualityAlerts(clientKey, { resolved });

      res.json({
        ok: true,
        alerts: alerts.map((alert) => ({
          id: alert.id,
          type: alert.alert_type,
          severity: alert.severity,
          message: alert.message,
          action: alert.action,
          impact: alert.impact,
          actual: alert.actual_value,
          expected: alert.expected_value,
          createdAt: alert.created_at,
          resolved: alert.resolved,
          resolvedAt: alert.resolved_at
        }))
      });
    } catch (error) {
      console.error('[QUALITY ALERTS ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/quality-alerts/:alertId/resolve', async (req, res) => {
    try {
      const { alertId } = req.params;
      await resolveQualityAlert(alertId);
      res.json({ ok: true, message: 'Alert resolved' });
    } catch (error) {
      console.error('[RESOLVE ALERT ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

