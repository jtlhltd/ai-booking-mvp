// Real-time Monitoring Dashboard
// Aggregates system metrics for monitoring dashboard

import { query } from '../db.js';
import { getAllClientsOverview, getClientsNeedingAttention } from './multi-client-manager.js';
import { getQueryPerformanceStats } from './query-performance-tracker.js';
import { getRateLimitStats } from './rate-limiting.js';
import { getCache } from './cache.js';

/**
 * Get comprehensive system monitoring data
 */
export async function getSystemMonitoringData() {
  try {
    const [
      clientsOverview,
      clientsNeedingAttention,
      queryStats,
      rateLimitStats,
      cacheStats,
      dbStats,
      recentActivity
    ] = await Promise.all([
      getAllClientsOverview(),
      getClientsNeedingAttention(),
      getQueryPerformanceStats(),
      getRateLimitStats(),
      getCacheStats(),
      getDatabaseStats(),
      getRecentActivity()
    ]);

    return {
      timestamp: new Date().toISOString(),
      clients: {
        total: clientsOverview.totalClients,
        active: clientsOverview.activeClients,
        needingAttention: clientsNeedingAttention.total,
        critical: clientsNeedingAttention.critical,
        warning: clientsNeedingAttention.warning
      },
      performance: {
        queries: queryStats,
        rateLimiting: rateLimitStats,
        cache: cacheStats
      },
      database: dbStats,
      activity: recentActivity,
      health: calculateSystemHealth({
        clients: clientsOverview,
        attention: clientsNeedingAttention,
        queries: queryStats,
        db: dbStats
      })
    };
  } catch (error) {
    console.error('[MONITORING DASHBOARD] Error:', error);
    return {
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get cache statistics
 */
function getCacheStats() {
  try {
    const cache = getCache();
    return cache.getStats();
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Get database statistics
 */
async function getDatabaseStats() {
  try {
    const { rows } = await query(`
      SELECT 
        (SELECT COUNT(*) FROM tenants) as total_clients,
        (SELECT COUNT(*) FROM leads) as total_leads,
        (SELECT COUNT(*) FROM calls WHERE created_at >= NOW() - INTERVAL '24 hours') as calls_24h,
        (SELECT COUNT(*) FROM appointments WHERE created_at >= NOW() - INTERVAL '24 hours') as bookings_24h,
        (SELECT COUNT(*) FROM messages WHERE created_at >= NOW() - INTERVAL '24 hours') as messages_24h
    `);

    const stats = rows[0] || {};
    
    return {
      totalClients: parseInt(stats.total_clients) || 0,
      totalLeads: parseInt(stats.total_leads) || 0,
      callsLast24h: parseInt(stats.calls_24h) || 0,
      bookingsLast24h: parseInt(stats.bookings_24h) || 0,
      messagesLast24h: parseInt(stats.messages_24h) || 0
    };
  } catch (error) {
    console.error('[DB STATS] Error:', error);
    return { error: error.message };
  }
}

/**
 * Get recent system activity
 */
async function getRecentActivity() {
  try {
    const { rows } = await query(`
      SELECT 
        'call' as type,
        client_key,
        created_at,
        outcome
      FROM calls
      WHERE created_at >= NOW() - INTERVAL '1 hour'
      UNION ALL
      SELECT 
        'booking' as type,
        client_key,
        created_at,
        'booked' as outcome
      FROM appointments
      WHERE created_at >= NOW() - INTERVAL '1 hour'
      ORDER BY created_at DESC
      LIMIT 20
    `);

    return rows.map(row => ({
      type: row.type,
      clientKey: row.client_key,
      timestamp: row.created_at,
      outcome: row.outcome
    }));
  } catch (error) {
    console.error('[RECENT ACTIVITY] Error:', error);
    return [];
  }
}

/**
 * Calculate overall system health
 */
function calculateSystemHealth({ clients, attention, queries, db }) {
  let score = 100;
  const issues = [];

  // Check client health
  if (attention.critical > 0) {
    score -= 20;
    issues.push(`${attention.critical} clients in critical state`);
  }
  if (attention.warning > 0) {
    score -= 10;
    issues.push(`${attention.warning} clients need attention`);
  }

  // Check query performance
  if (queries && queries.criticalQueries > 5) {
    score -= 15;
    issues.push(`${queries.criticalQueries} critical slow queries`);
  }

  // Check database activity
  if (db && db.callsLast24h === 0 && clients.activeClients > 0) {
    score -= 10;
    issues.push('No calls in last 24 hours despite active clients');
  }

  // Determine status
  let status = 'healthy';
  if (score < 50) {
    status = 'critical';
  } else if (score < 70) {
    status = 'warning';
  } else if (score >= 90) {
    status = 'excellent';
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    status,
    issues
  };
}

/**
 * Get client usage analytics
 */
export async function getClientUsageAnalytics(days = 30) {
  try {
    const { rows } = await query(`
      SELECT 
        c.client_key,
        t.display_name,
        COUNT(DISTINCT l.id) as total_leads,
        COUNT(DISTINCT cl.id) as total_calls,
        COUNT(DISTINCT a.id) as total_bookings,
        COUNT(DISTINCT m.id) as total_messages,
        AVG(CASE WHEN cl.outcome = 'booked' THEN 1 ELSE 0 END) * 100 as conversion_rate
      FROM tenants c
      LEFT JOIN leads l ON c.client_key = l.client_key AND l.created_at >= NOW() - INTERVAL '${days} days'
      LEFT JOIN calls cl ON c.client_key = cl.client_key AND cl.created_at >= NOW() - INTERVAL '${days} days'
      LEFT JOIN appointments a ON c.client_key = a.client_key AND a.created_at >= NOW() - INTERVAL '${days} days'
      LEFT JOIN messages m ON c.client_key = m.client_key AND m.created_at >= NOW() - INTERVAL '${days} days'
      WHERE c.is_enabled = true
      GROUP BY c.client_key, c.display_name
      ORDER BY total_calls DESC
    `);

      return rows.map(row => ({
        clientKey: row.client_key,
        displayName: row.display_name || row.client_key,
      totalLeads: parseInt(row.total_leads) || 0,
      totalCalls: parseInt(row.total_calls) || 0,
      totalBookings: parseInt(row.total_bookings) || 0,
      totalMessages: parseInt(row.total_messages) || 0,
      conversionRate: parseFloat(row.conversion_rate) || 0
    }));
  } catch (error) {
    console.error('[CLIENT USAGE ANALYTICS] Error:', error);
    return [];
  }
}

/**
 * Get performance trends
 */
export async function getPerformanceTrends(days = 30) {
  try {
    const { rows } = await query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as calls,
        COUNT(*) FILTER (WHERE outcome = 'booked') as bookings,
        AVG(duration) as avg_duration
      FROM calls
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    return rows.map(row => ({
      date: row.date,
      calls: parseInt(row.calls),
      bookings: parseInt(row.bookings),
      conversionRate: row.calls > 0 ? (row.bookings / row.calls * 100).toFixed(1) : 0,
      avgDuration: Math.round(parseFloat(row.avg_duration) || 0)
    }));
  } catch (error) {
    console.error('[PERFORMANCE TRENDS] Error:', error);
    return [];
  }
}

