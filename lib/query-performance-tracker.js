// Query Performance Tracker
// Tracks slow queries, stores in database, and provides optimization recommendations

import crypto from 'crypto';
import { query } from '../db.js';
import { sendCriticalAlert } from './error-monitoring.js';

const SLOW_QUERY_THRESHOLD = parseInt(process.env.SLOW_QUERY_THRESHOLD) || 1000; // 1 second
const CRITICAL_QUERY_THRESHOLD = parseInt(process.env.CRITICAL_QUERY_THRESHOLD) || 5000; // 5 seconds

// In-memory cache for query hashes (to avoid DB lookups on every query)
const queryHashCache = new Map();

/**
 * Generate a hash for a query (for deduplication)
 */
function hashQuery(queryText) {
  // Normalize query (remove extra whitespace, lowercase)
  const normalized = queryText.trim().replace(/\s+/g, ' ').toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Track query performance
 * IMPORTANT: This function is fire-and-forget to avoid blocking the main query
 */
export async function trackQueryPerformance(queryText, duration, params = []) {
  try {
    // CRITICAL: Don't track queries to query_performance table (prevents feedback loop)
    const normalizedQuery = queryText.trim().toLowerCase();
    if (normalizedQuery.includes('query_performance') || normalizedQuery.includes('INSERT INTO query_performance')) {
      return null; // Skip tracking our own tracking queries
    }

    // Skip tracking for very fast queries (< 100ms) to reduce overhead
    if (duration < 100) {
      return null;
    }

    const queryHash = hashQuery(queryText);
    const queryPreview = queryText.substring(0, 200); // First 200 chars for preview

    // Check if this is a slow query
    const isSlow = duration >= SLOW_QUERY_THRESHOLD;
    const isCritical = duration >= CRITICAL_QUERY_THRESHOLD;

    // Log slow queries
    if (isSlow) {
      console.warn(`[SLOW QUERY] ${duration}ms: ${queryPreview}...`);
    }

    // Send alert for critical queries (async, don't wait)
    if (isCritical) {
      console.error(`[CRITICAL QUERY] ${duration}ms: ${queryPreview}...`);
      
      // Fire and forget - don't block on alert sending
      sendCriticalAlert({
        message: `Critical slow query detected: ${duration}ms\nQuery: ${queryPreview}...`,
        errorType: 'Slow Query',
        severity: 'critical',
        metadata: {
          duration,
          queryPreview,
          queryHash,
          threshold: CRITICAL_QUERY_THRESHOLD
        }
      }).catch(err => {
        console.warn('[QUERY TRACKER] Failed to send alert:', err.message);
      });
    }

    // Update query_performance table (async, fire-and-forget)
    // Use setImmediate to ensure this doesn't block the main query
    setImmediate(async () => {
      try {
        // Use a simpler, faster query - avoid complex calculations in ON CONFLICT
        await query(`
          INSERT INTO query_performance (query_hash, query_preview, avg_duration, max_duration, call_count, last_executed_at)
          VALUES ($1, $2, $3, $4, 1, NOW())
          ON CONFLICT (query_hash) 
          DO UPDATE SET
            avg_duration = (query_performance.avg_duration * query_performance.call_count::numeric + $3) / (query_performance.call_count + 1),
            max_duration = GREATEST(query_performance.max_duration, $4),
            call_count = query_performance.call_count + 1,
            last_executed_at = NOW()
        `, [queryHash, queryPreview, duration, duration]);
      } catch (dbError) {
        // Silently fail - don't log or alert on tracking failures
        // This prevents feedback loops
      }
    });

    return {
      queryHash,
      duration,
      isSlow,
      isCritical
    };
  } catch (error) {
    // Silently fail - don't let tracking errors break the application
    return null;
  }
}

/**
 * Get slow queries from the database
 */
export async function getSlowQueries(limit = 20, minDuration = SLOW_QUERY_THRESHOLD) {
  try {
    const { rows } = await query(`
      SELECT 
        query_hash,
        query_preview,
        avg_duration,
        max_duration,
        call_count,
        last_executed_at,
        created_at
      FROM query_performance
      WHERE avg_duration >= $1
      ORDER BY avg_duration DESC
      LIMIT $2
    `, [minDuration, limit]);

    return rows.map(row => ({
      hash: row.query_hash,
      preview: row.query_preview,
      avgDuration: parseFloat(row.avg_duration),
      maxDuration: parseFloat(row.max_duration),
      callCount: parseInt(row.call_count),
      lastExecuted: row.last_executed_at,
      createdAt: row.created_at
    }));
  } catch (error) {
    console.error('[QUERY TRACKER] Error fetching slow queries:', error.message);
    return [];
  }
}

/**
 * Get query performance statistics
 */
export async function getQueryPerformanceStats() {
  try {
    const { rows } = await query(`
      SELECT 
        COUNT(*) as total_queries,
        COUNT(CASE WHEN avg_duration >= $1 THEN 1 END) as slow_queries,
        COUNT(CASE WHEN avg_duration >= $2 THEN 1 END) as critical_queries,
        AVG(avg_duration) as avg_duration,
        MAX(max_duration) as max_duration,
        SUM(call_count) as total_calls
      FROM query_performance
    `, [SLOW_QUERY_THRESHOLD, CRITICAL_QUERY_THRESHOLD]);

    if (rows.length === 0) {
      return {
        totalQueries: 0,
        slowQueries: 0,
        criticalQueries: 0,
        avgDuration: 0,
        maxDuration: 0,
        totalCalls: 0
      };
    }

    const row = rows[0];
    return {
      totalQueries: parseInt(row.total_queries),
      slowQueries: parseInt(row.slow_queries),
      criticalQueries: parseInt(row.critical_queries),
      avgDuration: parseFloat(row.avg_duration) || 0,
      maxDuration: parseFloat(row.max_duration) || 0,
      totalCalls: parseInt(row.total_calls) || 0
    };
  } catch (error) {
    console.error('[QUERY TRACKER] Error fetching performance stats:', error.message);
    return null;
  }
}

/**
 * Generate optimization recommendations for slow queries
 */
export async function getOptimizationRecommendations() {
  try {
    const slowQueries = await getSlowQueries(10);
    const recommendations = [];

    for (const query of slowQueries) {
      const preview = query.preview.toLowerCase();
      const rec = {
        queryHash: query.hash,
        queryPreview: query.preview,
        avgDuration: query.avgDuration,
        callCount: query.callCount,
        suggestions: []
      };

      // Check for common optimization opportunities
      if (preview.includes('select') && !preview.includes('where')) {
        rec.suggestions.push('Add WHERE clause to filter results');
      }

      if (preview.includes('select *')) {
        rec.suggestions.push('Select only needed columns instead of *');
      }

      if (preview.includes('order by') && !preview.includes('limit')) {
        rec.suggestions.push('Add LIMIT clause to reduce result set size');
      }

      if (preview.includes('join') && !preview.includes('on')) {
        rec.suggestions.push('Ensure JOIN conditions are properly indexed');
      }

      if (preview.includes('like') && preview.includes('%')) {
        rec.suggestions.push('Consider full-text search or indexed search instead of LIKE with wildcards');
      }

      if (query.callCount > 100) {
        rec.suggestions.push('High call count - consider adding result caching');
      }

      if (rec.suggestions.length > 0) {
        recommendations.push(rec);
      }
    }

    return recommendations;
  } catch (error) {
    console.error('[QUERY TRACKER] Error generating recommendations:', error.message);
    return [];
  }
}

/**
 * Clean up old query performance data (older than 30 days)
 */
export async function cleanupOldQueryData(daysToKeep = 30) {
  try {
    const { rowCount } = await query(`
      DELETE FROM query_performance
      WHERE last_executed_at < NOW() - INTERVAL '${daysToKeep} days'
        AND call_count < 5
    `);

    console.log(`[QUERY TRACKER] Cleaned up ${rowCount} old query performance records`);
    return rowCount;
  } catch (error) {
    console.error('[QUERY TRACKER] Error cleaning up old data:', error.message);
    return 0;
  }
}

