import express from 'express';

export function createMonitoringDashboardRouter(deps) {
  const { authenticateApiKey } = deps || {};
  const router = express.Router();

  router.get('/monitoring/dashboard', authenticateApiKey, async (req, res) => {
    try {
      const { getSystemMonitoringData } = await import('../lib/monitoring-dashboard.js');
      const data = await getSystemMonitoringData();

      res.json({
        ok: true,
        data,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[MONITORING DASHBOARD ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/monitoring/client-usage', authenticateApiKey, async (req, res) => {
    try {
      const days = parseInt(req.query.days, 10) || 30;
      const { getClientUsageAnalytics } = await import('../lib/monitoring-dashboard.js');
      const analytics = await getClientUsageAnalytics(days);

      res.json({
        ok: true,
        analytics,
        count: analytics.length,
        period: `${days} days`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[CLIENT USAGE ANALYTICS ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/monitoring/performance-trends', authenticateApiKey, async (req, res) => {
    try {
      const days = parseInt(req.query.days, 10) || 30;
      const { getPerformanceTrends } = await import('../lib/monitoring-dashboard.js');
      const trends = await getPerformanceTrends(days);

      res.json({
        ok: true,
        trends,
        count: trends.length,
        period: `${days} days`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[PERFORMANCE TRENDS ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

