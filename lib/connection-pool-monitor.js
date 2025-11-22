// lib/connection-pool-monitor.js
// Connection pool monitoring and health checks

import { pool } from '../db.js';
import { sendCriticalAlert } from './error-monitoring.js';

let lastPoolCheck = null;
let poolMetrics = {
  total: 0,
  idle: 0,
  waiting: 0,
  lastAlert: null,
  smallPoolAlerted: false
};

/**
 * Get current pool status
 */
export async function getPoolStatus() {
  try {
    if (!pool) {
      return {
        available: false,
        error: 'Pool not initialized'
      };
    }

    const total = pool.totalCount || 0;
    const idle = pool.idleCount || 0;
    const waiting = pool.waitingCount || 0;
    const active = total - idle;

    poolMetrics = {
      total,
      idle,
      active,
      waiting,
      utilization: total > 0 ? (active / total) * 100 : 0,
      lastCheck: new Date()
    };

    return {
      available: true,
      ...poolMetrics
    };
  } catch (error) {
    console.error('[POOL MONITOR] Error checking pool status:', error);
    return {
      available: false,
      error: error.message
    };
  }
}

/**
 * Check pool health and alert if needed
 */
export async function checkPoolHealth() {
  try {
    const status = await getPoolStatus();
    
    if (!status.available) {
      return {
        healthy: false,
        message: 'Pool not available',
        status
      };
    }

    const { total, active, waiting, utilization } = status;
    const isHealthy = true;
    let message = 'Pool is healthy';
    let alerts = [];

    // Get the configured max from the pool (if available)
    const poolMax = pool.options?.max || pool.max || total;
    
    // Alert if pool is near exhaustion (80% utilization for small pools)
    // For pools with 3 or fewer connections, alert at 66% (2/3)
    // Also check if we're exceeding the configured max
    const threshold = total <= 3 ? 66 : 80;
    if (utilization >= threshold || total > poolMax) {
      const maxInfo = total > poolMax ? ` (configured max: ${poolMax})` : '';
      alerts.push({
        level: 'warning',
        message: `Pool utilization at ${utilization.toFixed(1)}% (${active}/${total} connections active${maxInfo})`
      });
    }

    // Alert if there are waiting connections (pool exhausted)
    // For small pools (1-2 connections), this is expected under load, so only alert if many are waiting
    if (waiting > 0) {
      const isSmallPool = total <= 2;
      const threshold = isSmallPool ? 5 : 1; // Only alert if 5+ waiting for small pools
      
      if (waiting >= threshold) {
        alerts.push({
          level: 'critical',
          message: `Pool exhausted! ${waiting} requests waiting for connections (pool size: ${total}, configured max: ${poolMax})`
        });
      } else if (!isSmallPool) {
        // For larger pools, alert on any waiting
        alerts.push({
          level: 'critical',
          message: `Pool exhausted! ${waiting} requests waiting for connections`
        });
      }
    }

    // Alert if pool is very small (but only once, not repeatedly)
    // This is expected for Render.com free tier databases
    if (total < 5 && !poolMetrics.smallPoolAlerted) {
      console.log(`[POOL MONITOR] Small pool detected (${total} connections). This is normal for Render.com free tier databases.`);
      poolMetrics.smallPoolAlerted = true;
    }

    // Send alerts if needed
    if (alerts.length > 0) {
      const criticalAlerts = alerts.filter(a => a.level === 'critical');
      const warningAlerts = alerts.filter(a => a.level === 'warning');

      if (criticalAlerts.length > 0) {
        // Only alert once per hour for critical issues
        const now = Date.now();
        if (!poolMetrics.lastAlert || (now - poolMetrics.lastAlert) > 60 * 60 * 1000) {
          await sendCriticalAlert({
            message: `CRITICAL: Database connection pool issues detected:\n${criticalAlerts.map(a => `- ${a.message}`).join('\n')}`,
            errorType: 'Pool Exhaustion',
            severity: 'critical',
            metadata: { status, alerts: criticalAlerts }
          });
          poolMetrics.lastAlert = now;
        }
      } else if (warningAlerts.length > 0) {
        // Only alert once per 6 hours for warnings
        const now = Date.now();
        if (!poolMetrics.lastAlert || (now - poolMetrics.lastAlert) > 6 * 60 * 60 * 1000) {
          await sendCriticalAlert({
            message: `WARNING: Database connection pool utilization high:\n${warningAlerts.map(a => `- ${a.message}`).join('\n')}`,
            errorType: 'Pool Utilization',
            severity: 'warning',
            metadata: { status, alerts: warningAlerts }
          });
          poolMetrics.lastAlert = now;
        }
      }
    }

    return {
      healthy: isHealthy,
      message,
      status,
      alerts: alerts.length > 0 ? alerts : undefined
    };
  } catch (error) {
    console.error('[POOL MONITOR] Error checking pool health:', error);
    return {
      healthy: false,
      message: `Error checking pool: ${error.message}`,
      error: error.message
    };
  }
}

/**
 * Get pool usage patterns (for analysis)
 */
export function getPoolUsagePatterns() {
  return {
    ...poolMetrics,
    recommendations: []
  };
}
