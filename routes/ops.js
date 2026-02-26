/**
 * Ops/observability routes: query performance, rate limit, analytics, active-indicator, perf monitor, cache.
 * Extracted from server.js to group status and metrics endpoints.
 */
import express from 'express';
import { query } from '../db.js';
import { cacheMiddleware, getCache } from '../lib/cache.js';
import { getPerformanceMonitor } from '../lib/performance-monitor.js';

const router = express.Router();

// ----- Query performance -----
router.get('/api/performance/queries/slow', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const minDuration = parseInt(req.query.minDuration) || 1000;
    const { getSlowQueries } = await import('../lib/query-performance-tracker.js');
    const slowQueries = await getSlowQueries(limit, minDuration);
    res.json({
      ok: true,
      slowQueries,
      count: slowQueries.length,
      threshold: minDuration,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[QUERY PERFORMANCE ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/api/performance/queries/stats', async (req, res) => {
  try {
    const { getQueryPerformanceStats } = await import('../lib/query-performance-tracker.js');
    const stats = await getQueryPerformanceStats();
    if (!stats) {
      return res.status(500).json({ ok: false, error: 'Failed to fetch query performance stats' });
    }
    res.json({
      ok: true,
      stats,
      thresholds: { slow: 1000, critical: 5000 },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[QUERY STATS ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/api/performance/queries/recommendations', async (req, res) => {
  try {
    const { getOptimizationRecommendations } = await import('../lib/query-performance-tracker.js');
    const recommendations = await getOptimizationRecommendations();
    res.json({
      ok: true,
      recommendations,
      count: recommendations.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[QUERY RECOMMENDATIONS ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ----- Performance monitor & cache -----
router.get('/api/performance/stats', (req, res) => {
  try {
    const stats = getPerformanceMonitor().getStats();
    res.json({ success: true, ...stats });
  } catch (error) {
    console.error('[PERF STATS ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/performance/report', (req, res) => {
  try {
    const report = getPerformanceMonitor().generateReport();
    res.json({ success: true, report });
  } catch (error) {
    console.error('[PERF REPORT ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/cache/stats', (req, res) => {
  try {
    const stats = getCache().getStats();
    res.json({ success: true, ...stats });
  } catch (error) {
    console.error('[CACHE STATS ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/cache/clear', (req, res) => {
  try {
    getCache().clear();
    res.json({ success: true, message: 'Cache cleared successfully' });
  } catch (error) {
    console.error('[CACHE CLEAR ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ----- Rate limit -----
router.get('/api/rate-limit/status', async (req, res) => {
  try {
    const identifier = req.query.identifier || req.ip || 'unknown';
    const { getRateLimitStatus, getRateLimitStats } = await import('../lib/rate-limiting.js');
    const status = await getRateLimitStatus(identifier);
    const stats = getRateLimitStats();
    res.json({
      ok: true,
      identifier,
      limits: status,
      systemStats: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[RATE LIMIT STATUS ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ----- Analytics -----
router.get('/api/analytics/call-outcomes/:clientKey', async (req, res) => {
  try {
    const { clientKey } = req.params;
    const days = parseInt(req.query.days) || 30;
    const { analyzeCallOutcomes } = await import('../lib/call-outcome-analyzer.js');
    const analysis = await analyzeCallOutcomes(clientKey, days);
    res.json({ ok: true, clientKey, analysis, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[CALL OUTCOME ANALYSIS ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/api/analytics/best-call-times/:clientKey', async (req, res) => {
  try {
    const { clientKey } = req.params;
    const days = parseInt(req.query.days) || 30;
    const { getBestCallTimes } = await import('../lib/call-outcome-analyzer.js');
    const bestTimes = await getBestCallTimes(clientKey, days);
    res.json({ ok: true, clientKey, bestTimes, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[BEST CALL TIMES ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ----- Active indicator -----
router.get('/api/active-indicator/:clientKey', cacheMiddleware({ ttl: 10000, keyPrefix: 'active-indicator:' }), async (req, res) => {
  try {
    const { clientKey } = req.params;
    const activeCalls = await query(`
      SELECT COUNT(*) AS count FROM calls
      WHERE client_key = $1 AND status IN ('ringing', 'in-progress') AND created_at >= NOW() - INTERVAL '5 minutes'
    `, [clientKey]);
    const pendingFollowups = await query(`
      SELECT COUNT(*) AS count FROM leads l
      WHERE l.client_key = $1 AND l.status = 'new' AND l.created_at >= NOW() - INTERVAL '24 hours'
    `, [clientKey]);
    const scheduledCalls = await query(`
      SELECT COUNT(*) AS count FROM call_queue
      WHERE client_key = $1 AND status = 'pending' AND scheduled_for >= NOW() AND scheduled_for <= NOW() + INTERVAL '1 hour'
    `, [clientKey]);
    const activeCount = parseInt(activeCalls.rows?.[0]?.count || 0, 10);
    const followupCount = parseInt(pendingFollowups.rows?.[0]?.count || 0, 10);
    const scheduledCount = parseInt(scheduledCalls.rows?.[0]?.count || 0, 10);
    let title = 'Your concierge is monitoring';
    let subtitle = 'Ready to handle leads as they come in';
    if (activeCount > 0 || scheduledCount > 0) {
      title = 'Your concierge is active';
      if (activeCount > 0 && followupCount > 0) {
        subtitle = `Currently calling ${activeCount} lead${activeCount !== 1 ? 's' : ''}, following up with ${followupCount}`;
      } else if (activeCount > 0) {
        subtitle = `Currently calling ${activeCount} lead${activeCount !== 1 ? 's' : ''}`;
      } else if (scheduledCount > 0) {
        subtitle = `${scheduledCount} call${scheduledCount !== 1 ? 's' : ''} scheduled in the next hour`;
      }
    } else if (followupCount > 0) {
      title = 'Your concierge is active';
      subtitle = `Following up with ${followupCount} lead${followupCount !== 1 ? 's' : ''}`;
    }
    res.json({
      ok: true,
      title,
      subtitle,
      activeCalls: activeCount,
      pendingFollowups: followupCount,
      scheduledCalls: scheduledCount
    });
  } catch (error) {
    console.error('[ACTIVE INDICATOR ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
