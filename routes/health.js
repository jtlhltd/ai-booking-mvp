// Health Check Routes
// Provides endpoints for health monitoring, readiness, and liveness checks

import express from 'express';
import {
  performHealthCheck,
  quickHealthCheck,
  readinessCheck,
  livenessCheck
} from '../lib/health-check.js';
import { getLogger } from '../lib/structured-logger.js';

const router = express.Router();
const logger = getLogger({ component: 'health' });

/**
 * GET /health
 * Comprehensive health check endpoint
 */
router.get('/health', async (req, res) => {
  try {
    const includeDetails = req.query.details === 'true';
    const health = await performHealthCheck({ includeDetails });
    
    const statusCode = health.status === 'critical' ? 503 
      : health.status === 'degraded' ? 200 
      : 200;
    
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Health check failed', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /health/quick
 * Lightweight health check for load balancers
 */
router.get('/health/quick', (req, res) => {
  const health = quickHealthCheck();
  res.json(health);
});

/**
 * GET /health/readiness
 * Kubernetes readiness probe
 */
router.get('/health/readiness', async (req, res) => {
  try {
    const readiness = await readinessCheck();
    const statusCode = readiness.ready ? 200 : 503;
    res.status(statusCode).json(readiness);
  } catch (error) {
    logger.error('Readiness check failed', error);
    res.status(503).json({
      ready: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /health/liveness
 * Kubernetes liveness probe
 */
router.get('/health/liveness', (req, res) => {
  const liveness = livenessCheck();
  const statusCode = liveness.alive ? 200 : 503;
  res.status(statusCode).json(liveness);
});

/**
 * GET /healthz
 * Alias for quick health check (common convention)
 */
router.get('/healthz', (req, res) => {
  const health = quickHealthCheck();
  res.json(health);
});

export default router;








