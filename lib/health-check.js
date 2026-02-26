// Comprehensive Health Check System
// Provides detailed system health status for monitoring and alerting

import { query } from '../db.js';
import { getPerformanceMonitor } from './performance-monitor.js';
import { getCache } from './cache.js';

/**
 * Comprehensive health check
 * @param {Object} options - Health check options
 * @returns {Promise<Object>} Health status
 */
export async function performHealthCheck(options = {}) {
  const {
    includeDetails = false,
    checkExternalServices = true,
    timeout = 5000
  } = options;

  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    commit: process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_ID || null,
    uptime: process.uptime(),
    uptimeFormatted: formatUptime(process.uptime())
  };

  // System metrics
  const memUsage = process.memoryUsage();
  health.memory = {
    rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
    external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
    usagePercent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
  };

  // Database health
  const dbHealth = await checkDatabaseHealth(timeout);
  health.database = dbHealth;

  // Cache health
  const cache = getCache();
  const cacheStats = cache.getStats();
  health.cache = {
    status: 'healthy',
    hitRate: cacheStats.hitRate,
    size: cacheStats.size,
    maxSize: cacheStats.maxSize
  };

  // Performance monitor
  const perfMonitor = getPerformanceMonitor();
  const perfStats = perfMonitor.getStats(60); // Last 60 minutes
  health.performance = {
    status: perfStats.api?.errors > perfStats.api?.total * 0.1 ? 'degraded' : 'healthy',
    slowQueries: perfStats.queries?.slow || 0,
    slowAPIs: perfStats.api?.slow || 0,
    errorRate: perfStats.api?.total > 0 
      ? `${((perfStats.api.errors / perfStats.api.total) * 100).toFixed(2)}%`
      : '0%'
  };

  // External services configuration
  if (checkExternalServices) {
    health.services = {
      vapi: {
        configured: !!(process.env.VAPI_PRIVATE_KEY && process.env.VAPI_ASSISTANT_ID),
        status: 'not_checked' // Would require API call
      },
      googleCalendar: {
        configured: !!(process.env.GOOGLE_CLIENT_EMAIL && (process.env.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY_B64)),
        status: 'not_checked'
      },
      twilio: {
        configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
        status: 'not_checked'
      }
    };
  }

  // Determine overall status
  if (dbHealth.status === 'critical' || health.memory.usagePercent > 95) {
    health.status = 'critical';
  } else if (dbHealth.status === 'degraded' || health.performance.status === 'degraded' || health.memory.usagePercent > 85) {
    health.status = 'degraded';
  }

  // Add detailed information if requested
  if (includeDetails) {
    health.details = {
      nodeVersion: process.version,
      platform: process.platform,
      cpuUsage: process.cpuUsage(),
      activeHandles: process._getActiveHandles?.().length || 'N/A',
      activeRequests: process._getActiveRequests?.().length || 'N/A'
    };
  }

  return health;
}

/**
 * Check database health
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Object>} Database health status
 */
async function checkDatabaseHealth(timeout = 5000) {
  const startTime = Date.now();
  
  try {
    // Use Promise.race for timeout
    const queryPromise = query('SELECT 1');
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database health check timeout')), timeout);
    });
    
    await Promise.race([queryPromise, timeoutPromise]);
    
    const responseTime = Date.now() - startTime;
    
    return {
      status: responseTime > 2000 ? 'degraded' : 'healthy',
      responseTime: `${responseTime}ms`,
      connected: true,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return {
      status: 'critical',
      responseTime: `${responseTime}ms`,
      connected: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Format uptime in human-readable format
 * @param {number} seconds - Uptime in seconds
 * @returns {string} Formatted uptime
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Lightweight health check (for load balancers)
 * @returns {Object} Minimal health status
 */
export function quickHealthCheck() {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    commit: process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_ID || null,
    uptime: process.uptime()
  };
}

/**
 * Readiness check (for Kubernetes)
 * @returns {Promise<Object>} Readiness status
 */
export async function readinessCheck() {
  try {
    // Check database connection
    await query('SELECT 1');
    
    return {
      ready: true,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      ready: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Liveness check (for Kubernetes)
 * @returns {Object} Liveness status
 */
export function livenessCheck() {
  const memUsage = process.memoryUsage();
  const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  
  // If memory usage is too high, consider unhealthy
  if (heapUsagePercent > 95) {
    return {
      alive: false,
      reason: 'high_memory_usage',
      memoryUsage: `${heapUsagePercent.toFixed(2)}%`,
      timestamp: new Date().toISOString()
    };
  }
  
  return {
    alive: true,
    timestamp: new Date().toISOString()
  };
}

export default {
  performHealthCheck,
  quickHealthCheck,
  readinessCheck,
  livenessCheck
};

