// lib/connection-pool-monitor.js
// Connection pool monitoring and health checks

import { pool } from '../db.js';
import { sendCriticalAlert } from './error-monitoring.js';

let lastPoolCheck = null;
let poolMetrics = {
  total: 0,
  idle: 0,
  waiting: 0,
  lastCriticalAlert: null,
  lastWarningAlert: null,
  smallPoolAlerted: false,
  consecutiveExhaustionChecks: 0
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
    
    // Get pool max for metrics
    let poolMax = 0;
    if (pool.options && pool.options.max) {
      poolMax = pool.options.max;
    } else if (pool.max) {
      poolMax = pool.max;
    } else {
      poolMax = 25; // Default fallback (keep in sync with db.js pool max)
    }

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

    const { total, active, waiting } = status;
    const isHealthy = true;
    let message = 'Pool is healthy';
    let alerts = [];

    // Get the configured max from the pool
    // pg Pool stores max in pool.options.max, but we need to handle cases where it's not accessible
    let poolMax = 0;
    if (pool.options && pool.options.max) {
      poolMax = pool.options.max;
    } else if (pool.max) {
      poolMax = pool.max;
    } else {
      poolMax = 25;
      console.warn('[POOL MONITOR] Could not read pool.max, using default of 25');
    }
    
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
    
    // Utilization alone is not a problem if nothing is queued: all connections can be busy briefly
    // while still keeping up. Only warn when work is waiting for a free connection.
    if (utilizationOfMax >= threshold && total > 0 && waiting > 0) {
      const maxInfo = poolMax > total ? ` (configured max: ${poolMax}, only ${total} created so far)` : ` (max: ${poolMax})`;
      console.warn(
        `[POOL MONITOR] High utilization + queued: ${active}/${poolMax} active, ${waiting} waiting (${utilizationOfMax.toFixed(1)}% of max)${maxInfo}`
      );
      alerts.push({
        level: 'warning',
        message: `Pool utilization at ${utilizationOfMax.toFixed(1)}% of max with ${waiting} request(s) waiting (${active}/${poolMax} active, ${total} total created${maxInfo})`
      });
    }

    // Alert if there are waiting connections (pool exhausted)
    // Waiting spikes can be transient; require consecutive checks before paging.
    // For pools with 10+ connections, consider it "exhausted" when:
    // - pool is fully utilized (active >= poolMax), and
    // - 3+ are waiting
    // For smaller pools, waiting>=1 can be normal; still require consecutive checks.
    const isLargePool = poolMax >= 10;
    const waitingThreshold = isLargePool ? 3 : 1;
    const isExhaustedNow = waiting >= waitingThreshold && active >= poolMax;
    if (isExhaustedNow) {
      poolMetrics.consecutiveExhaustionChecks = (poolMetrics.consecutiveExhaustionChecks || 0) + 1;
    } else {
      poolMetrics.consecutiveExhaustionChecks = 0;
    }
    if (poolMetrics.consecutiveExhaustionChecks >= 2) {
      alerts.push({
        level: 'critical',
        message: `Pool exhausted for ${poolMetrics.consecutiveExhaustionChecks} checks: ${waiting} waiting (active: ${active}/${poolMax}, total: ${total})`
      });
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
        const now = Date.now();
        if (!poolMetrics.lastCriticalAlert || now - poolMetrics.lastCriticalAlert > 60 * 60 * 1000) {
          await sendCriticalAlert({
            message: `CRITICAL: Database connection pool issues detected:\n${criticalAlerts.map(a => `- ${a.message}`).join('\n')}`,
            errorType: 'Pool Exhaustion',
            severity: 'critical',
            metadata: { status, alerts: criticalAlerts }
          });
          poolMetrics.lastCriticalAlert = now;
        }
      } else if (warningAlerts.length > 0) {
        const now = Date.now();
        if (!poolMetrics.lastWarningAlert || now - poolMetrics.lastWarningAlert > 6 * 60 * 60 * 1000) {
          await sendCriticalAlert({
            message: `WARNING: Database connection pool utilization high:\n${warningAlerts.map(a => `- ${a.message}`).join('\n')}`,
            errorType: 'Pool Utilization',
            severity: 'warning',
            metadata: { status, alerts: warningAlerts }
          });
          poolMetrics.lastWarningAlert = now;
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
