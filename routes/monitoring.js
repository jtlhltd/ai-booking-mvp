// Monitoring and Metrics Routes
// Provides endpoints for system monitoring, metrics, and observability

import express from 'express';
import { getPerformanceMonitor } from '../lib/performance-monitor.js';
import { getCache } from '../lib/cache.js';
import { getLogger } from '../lib/structured-logger.js';
import { query } from '../db.js';
import { asyncHandler } from '../lib/errors.js';

const router = express.Router();
const logger = getLogger({ component: 'monitoring' });

/**
 * GET /api/monitoring/metrics
 * Get system performance metrics
 */
router.get('/api/monitoring/metrics', asyncHandler(async (req, res) => {
  const perfMonitor = getPerformanceMonitor();
  const cache = getCache();
  
  const timeWindow = parseInt(req.query.window) || 60; // minutes
  
  const metrics = {
    timestamp: new Date().toISOString(),
    performance: perfMonitor.getStats(null, timeWindow),
    cache: cache.getStats(),
    system: {
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      cpuUsage: process.cpuUsage(),
      nodeVersion: process.version,
      platform: process.platform
    }
  };
  
  res.json(metrics);
}));

/**
 * GET /api/monitoring/slow-queries
 * Get slow database queries
 */
router.get('/api/monitoring/slow-queries', asyncHandler(async (req, res) => {
  const perfMonitor = getPerformanceMonitor();
  const limit = parseInt(req.query.limit) || 10;
  
  const slowQueries = perfMonitor.getSlowQueries(limit);
  
  res.json({
    timestamp: new Date().toISOString(),
    slowQueries,
    count: slowQueries.length
  });
}));

/**
 * GET /api/monitoring/slow-apis
 * Get slow API endpoints
 */
router.get('/api/monitoring/slow-apis', asyncHandler(async (req, res) => {
  const perfMonitor = getPerformanceMonitor();
  const limit = parseInt(req.query.limit) || 10;
  
  const slowAPIs = perfMonitor.getSlowAPICalls(limit);
  
  res.json({
    timestamp: new Date().toISOString(),
    slowAPIs,
    count: slowAPIs.length
  });
}));

/**
 * GET /api/monitoring/errors
 * Get recent errors
 */
router.get('/api/monitoring/errors', asyncHandler(async (req, res) => {
  const perfMonitor = getPerformanceMonitor();
  const limit = parseInt(req.query.limit) || 10;
  
  const errors = perfMonitor.getRecentErrors(limit);
  
  res.json({
    timestamp: new Date().toISOString(),
    errors,
    count: errors.length
  });
}));

/**
 * GET /api/monitoring/report
 * Get comprehensive performance report
 */
router.get('/api/monitoring/report', asyncHandler(async (req, res) => {
  const perfMonitor = getPerformanceMonitor();
  const report = perfMonitor.generateReport();
  
  res.json(report);
}));

/**
 * GET /api/monitoring/database-stats
 * Get database statistics
 */
router.get('/api/monitoring/database-stats', asyncHandler(async (req, res) => {
  try {
    const stats = await query(`
      SELECT 
        (SELECT COUNT(*) FROM tenants) as total_tenants,
        (SELECT COUNT(*) FROM leads) as total_leads,
        (SELECT COUNT(*) FROM calls) as total_calls,
        (SELECT COUNT(*) FROM appointments) as total_appointments,
        (SELECT COUNT(*) FROM leads WHERE status = 'new') as new_leads,
        (SELECT COUNT(*) FROM leads WHERE status = 'contacted') as contacted_leads,
        (SELECT COUNT(*) FROM leads WHERE status = 'converted') as converted_leads
    `);
    
    res.json({
      timestamp: new Date().toISOString(),
      database: stats.rows[0] || {}
    });
  } catch (error) {
    logger.error('Failed to get database stats', error);
    res.status(500).json({
      error: 'Failed to retrieve database statistics',
      message: error.message
    });
  }
}));

/**
 * GET /api/monitoring/cache-stats
 * Get cache statistics
 */
router.get('/api/monitoring/cache-stats', (req, res) => {
  const cache = getCache();
  const stats = cache.getStats();
  
  res.json({
    timestamp: new Date().toISOString(),
    cache: stats
  });
});

/**
 * POST /api/monitoring/cache/clear
 * Clear cache (admin only)
 */
router.post('/api/monitoring/cache/clear', asyncHandler(async (req, res) => {
  // TODO: Add admin authentication check
  const cache = getCache();
  cache.clear();
  
  logger.info('Cache cleared', { clearedBy: req.clientKey || 'system' });
  
  res.json({
    success: true,
    message: 'Cache cleared',
    timestamp: new Date().toISOString()
  });
}));

export default router;








