// lib/query-monitor.js
// Performance monitoring and slow query detection

// Note: We don't import query here to avoid circular dependencies
// The query function is passed as a parameter to monitoredQuery
import { sendCriticalAlert } from './error-monitoring.js';
import crypto from 'crypto';

const SLOW_QUERY_THRESHOLD = 2000; // 2 seconds
const CRITICAL_QUERY_THRESHOLD = 5000; // 5 seconds

/**
 * Generate query hash for grouping
 */
function generateQueryHash(sql) {
  // Normalize SQL (remove values, keep structure)
  const normalized = sql
    .replace(/\$(\d+)/g, '?')
    .replace(/'[^']*'/g, "'?'")
    .replace(/"[^"]*"/g, '"?"')
    .replace(/\d+/g, '?')
    .trim();
  
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Execute query with monitoring
 * This wraps a query execution function to track performance
 */
export async function monitoredQuery(sql, params = [], queryFn) {
  if (!queryFn) {
    throw new Error('monitoredQuery requires a queryFn parameter');
  }
  
  const startTime = Date.now();
  const queryId = crypto.randomBytes(8).toString('hex');
  const queryHash = generateQueryHash(sql);
  const queryPreview = sql.substring(0, 200);
  
  try {
    const result = await queryFn(sql, params);
    const duration = Date.now() - startTime;
    
    // Log slow queries
    if (duration > SLOW_QUERY_THRESHOLD) {
      await logSlowQuery({
        queryId,
        queryHash,
        queryPreview,
        params: params.length > 0 ? params.slice(0, 5) : [],
        duration,
        timestamp: new Date()
      });
      
      // Alert on critical queries
      if (duration > CRITICAL_QUERY_THRESHOLD) {
        await sendCriticalAlert({
          message: `Critical slow query detected: ${duration}ms`,
          errorType: 'Slow Query',
          severity: 'warning',
          metadata: {
            queryId,
            queryHash,
            duration,
            preview: queryPreview
          }
        });
      }
    }
    
    // Update performance metrics
    await updateQueryPerformance(queryHash, queryPreview, duration);
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    await logQueryError({
      queryId,
      queryHash,
      queryPreview,
      error: error.message,
      duration
    });
    
    throw error;
  }
}

/**
 * Log slow query
 */
async function logSlowQuery({ queryId, queryHash, queryPreview, params, duration, timestamp }) {
  try {
    console.warn(`[SLOW QUERY] ${duration}ms - ${queryPreview.substring(0, 100)}...`);
    
    // Could also store in a slow_queries table for analysis
    // For now, just log and update performance metrics
  } catch (error) {
    console.error('[QUERY MONITOR] Failed to log slow query:', error);
  }
}

/**
 * Log query error
 */
async function logQueryError({ queryId, queryHash, queryPreview, error, duration }) {
  try {
    console.error(`[QUERY ERROR] ${error} - ${queryPreview.substring(0, 100)}...`);
  } catch (logError) {
    console.error('[QUERY MONITOR] Failed to log query error:', logError);
  }
}

/**
 * Update query performance metrics
 */
async function updateQueryPerformance(queryHash, queryPreview, duration) {
  try {
    // Upsert performance metrics
    await query(`
      INSERT INTO query_performance (query_hash, query_preview, avg_duration, max_duration, call_count, last_executed_at)
      VALUES ($1, $2, $3, $4, 1, NOW())
      ON CONFLICT (query_hash) DO UPDATE SET
        avg_duration = (query_performance.avg_duration * query_performance.call_count + $3) / (query_performance.call_count + 1),
        max_duration = GREATEST(query_performance.max_duration, $4),
        call_count = query_performance.call_count + 1,
        last_executed_at = NOW()
    `, [queryHash, queryPreview, duration, duration]);
  } catch (error) {
    // Don't fail on metrics update
    console.error('[QUERY MONITOR] Failed to update metrics:', error);
  }
}

/**
 * Get slow queries
 */
export async function getSlowQueries(limit = 20, minDuration = 1000) {
  try {
    const result = await query(`
      SELECT * FROM query_performance
      WHERE avg_duration >= $1
      ORDER BY avg_duration DESC
      LIMIT $2
    `, [minDuration, limit]);
    
    return result.rows;
  } catch (error) {
    console.error('[QUERY MONITOR] Failed to get slow queries:', error);
    return [];
  }
}

