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

    // Get pool stats - pg Pool creates connections lazily, so totalCount may be less than max
    const total = pool.totalCount || 0;
    const idle = pool.idleCount || 0;
    const waiting = pool.waitingCount || 0;
    const active = total - idle;
    const poolMax = pool.options?.max || pool.max || 0;

    poolMetrics = {
      total,
      idle,
      active,
      waiting,
      max: poolMax,
      utilization: total > 0 ? (active / total) * 100 : 0,
      utilizationOfMax: poolMax > 0 ? (active / poolMax) * 100 : 0,
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
    
    // pg Pool creates connections lazily - totalCount can be less than max
    // So we should check utilization against the configured max, not just current total
    const utilizationOfMax = poolMax > 0 ? (active / poolMax) * 100 : 0;
    
    // Alert if pool is near exhaustion
    // For very small pools (max <= 2), only alert if there are waiting requests
    // For small pools (max 3-5), alert at 80% of max
    // For larger pools, alert at 85% of max
    let threshold;
    if (poolMax <= 2) {
      // Very small pools: only alert if exhausted (handled below with waiting check)
      threshold = 100;
    } else if (poolMax <= 5) {
      threshold = 80;
    } else {
      threshold = 85;
    }
    
    // Alert if we're using too much of the configured max
    if (utilizationOfMax >= threshold && total > 0) {
      const maxInfo = poolMax > total ? ` (configured max: ${poolMax}, only ${total} created so far)` : ` (max: ${poolMax})`;
      alerts.push({
        level: 'warning',
        message: `Pool utilization at ${utilizationOfMax.toFixed(1)}% of max (${active}/${poolMax} connections active, ${total} total created${maxInfo})`
      });
    }

    // Alert if there are waiting connections (pool exhausted)
    // For pools with 10+ connections, only alert if 3+ are waiting (indicates real issue)
    if (waiting > 0) {
      const isLargePool = total >= 10;
      const threshold = isLargePool ? 3 : 1; // Alert if 3+ waiting for large pools, 1+ for small
      
      if (waiting >= threshold) {
        alerts.push({
          level: 'critical',
          message: `Pool exhausted! ${waiting} requests waiting for connections (pool size: ${total}, configured max: ${poolMax})`
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
