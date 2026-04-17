import express from 'express';
import { getCallQualityMetrics } from '../db.js';

export function createIndustryComparisonRouter(deps) {
  const { getFullClient } = deps || {};
  const router = express.Router();

  router.get('/industry-comparison/:clientKey', async (req, res) => {
    try {
      const { clientKey } = req.params;
      const days = parseInt(req.query.days) || 30;

      const client = await getFullClient(clientKey);
      if (!client) {
        return res.status(404).json({ ok: false, error: 'Client not found' });
      }

      const metrics = await getCallQualityMetrics(clientKey, days);

      if (!metrics || metrics.total_calls === 0) {
        return res.json({
          ok: true,
          message: 'No data available for comparison',
          industry: client.industry || 'default'
        });
      }

      const clientMetrics = {
        success_rate: metrics.successful_calls / metrics.total_calls,
        booking_rate: metrics.bookings / metrics.total_calls,
        avg_quality_score: parseFloat(metrics.avg_quality_score || 0),
        avg_duration: parseInt(metrics.avg_duration || 0),
        positive_sentiment_ratio: metrics.positive_sentiment_count / metrics.total_calls
      };

      const { compareToIndustry, generateInsights } = await import('../lib/industry-benchmarks.js');

      const comparison = compareToIndustry(clientMetrics, client.industry);
      const insights = generateInsights(comparison);

      res.json({
        ok: true,
        clientKey,
        industry: comparison.industry,
        comparison: comparison.metrics,
        insights,
        period: `Last ${days} days`
      });
    } catch (error) {
      console.error('[INDUSTRY COMPARISON ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

