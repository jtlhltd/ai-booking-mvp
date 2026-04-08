// lib/database-health.js
// Database health monitoring, error handling, and connection management

import { query } from '../db.js';

let lastHealthCheck = null;
let consecutiveFailures = 0;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Check database health
 * @returns {Promise<Object>} - Health status
 */
export async function checkDatabaseHealth() {
  try {
    const startTime = Date.now();
    
    // Test basic connectivity
    const result = await query('SELECT 1 as healthy, NOW() as timestamp');
    
    const responseTime = Date.now() - startTime;
    
    // Test table accessibility
    const tables = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      LIMIT 10
    `);
    
    const health = {
      status: 'healthy',
      responseTime,
      timestamp: new Date().toISOString(),
      tablesAccessible: tables.rows.length,
      consecutiveFailures: 0
    };
    
    lastHealthCheck = health;
    consecutiveFailures = 0;
    
    return health;
    
  } catch (error) {
    consecutiveFailures++;
    
    const health = {
      status: consecutiveFailures >= 3 ? 'critical' : 'degraded',
      error: error.message,
      timestamp: new Date().toISOString(),
      consecutiveFailures
    };
    
    lastHealthCheck = health;
    
    console.error('[DB HEALTH] ❌ Database health check failed:', error.message);
    
    if (consecutiveFailures >= 3) {
      console.error('[DB HEALTH] 🚨 CRITICAL: Database has failed 3+ consecutive health checks');
    }
    
    return health;
  }
}

/**
 * Execute query with retry logic
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @param {Object} options - Retry options
 * @returns {Promise<Object>} - Query result
 */
export async function queryWithRetry(sql, params = [], options = {}) {
  const {
    maxRetries = MAX_RETRIES,
    retryDelay = RETRY_DELAY_MS,
    operationName = 'query'
  } = options;
  
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await query(sql, params);
      
      // Reset consecutive failures on success
      if (consecutiveFailures > 0) {
        console.log(`[DB] ✅ Database recovered after ${consecutiveFailures} failures`);
        consecutiveFailures = 0;
      }
      
      return result;
      
    } catch (error) {
      lastError = error;
      consecutiveFailures++;
      
      console.error(`[DB] ❌ ${operationName} failed (attempt ${attempt}/${maxRetries}):`, error.message);
      
      if (attempt < maxRetries) {
        const delay = retryDelay * attempt; // Exponential backoff
        console.log(`[DB] ⏳ Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }
  
  // All retries failed
  console.error(`[DB] 🚨 ${operationName} failed after ${maxRetries} attempts:`, lastError.message);
  throw lastError;
}

/**
 * Get database connection limit
 * @returns {Promise<Object>} - Connection limit info
 */
export async function getConnectionLimit() {
  try {
    // Get max_connections setting
    const maxConn = await query(`
      SELECT setting::int as max_connections
      FROM pg_settings
      WHERE name = 'max_connections'
    `);
    
    // Get current connection count
    const currentConn = await query(`
      SELECT count(*)::int as current_connections
      FROM pg_stat_activity
      WHERE datname = current_database()
    `);
    
    // Get connections by state
    const byState = await query(`
      SELECT state, count(*)::int as count
      FROM pg_stat_activity
      WHERE datname = current_database()
      GROUP BY state
    `);
    
    return {
      success: true,
      maxConnections: maxConn.rows[0]?.max_connections || null,
      currentConnections: currentConn.rows[0]?.current_connections || 0,
      connectionsByState: byState.rows,
      utilization: maxConn.rows[0]?.max_connections 
        ? ((currentConn.rows[0]?.current_connections || 0) / maxConn.rows[0].max_connections * 100).toFixed(1)
        : null,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[CONNECTION LIMIT ERROR]', error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get database statistics
 * @returns {Promise<Object>} - Database stats
 */
export async function getDatabaseStats() {
  try {
    // Get connection count
    const connections = await query(`
      SELECT count(*) as total_connections
      FROM pg_stat_activity
      WHERE datname = current_database()
    `);
    
    // Get table sizes
    const tableSizes = await query(`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      LIMIT 10
    `);
    
    // Get database size
    const dbSize = await query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) as database_size
    `);
    
    return {
      success: true,
      totalConnections: connections.rows[0]?.total_connections || 0,
      databaseSize: dbSize.rows[0]?.database_size || 'unknown',
      topTables: tableSizes.rows,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('[DB STATS ERROR]', error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Make reminder queue processing database-agnostic
 * Works with both Postgres and SQLite
 */
export async function getRemindersDue(intervalMinutes = 5) {
  try {
    // Try Postgres first
    try {
      // Underscores in LIKE are wildcards unless escaped — literal prefix enables
      // btree + retry_queue_pending_reason_scheduled_idx (varchar_pattern_ops).
      return await query(`
        WITH picked AS (
          SELECT id
          FROM retry_queue
          WHERE retry_reason LIKE 'appointment\\_reminder%' ESCAPE '\\'
            AND status = 'pending'
            AND scheduled_for <= NOW() + ($1::int * INTERVAL '1 minute')
          ORDER BY scheduled_for ASC
          LIMIT 50
        )
        SELECT rq.id, rq.client_key, rq.lead_phone, rq.retry_type, rq.retry_reason,
               rq.retry_data, rq.scheduled_for, rq.retry_attempt, rq.max_retries,
               rq.status, rq.created_at, rq.updated_at
        FROM retry_queue rq
        INNER JOIN picked p ON p.id = rq.id
        ORDER BY rq.scheduled_for ASC
      `, [intervalMinutes]);
    } catch (pgError) {
      // Fallback to SQLite/database-agnostic query
      console.log('[DB] Using database-agnostic reminder query');
      
      // Calculate timestamp for "now + intervalMinutes"
      const futureTime = new Date(Date.now() + intervalMinutes * 60 * 1000);
      const futureISO = futureTime.toISOString();
      
      return await query(`
        WITH picked AS (
          SELECT id FROM retry_queue
          WHERE retry_reason LIKE 'appointment\\_reminder%' ESCAPE '\\'
            AND status = 'pending'
            AND scheduled_for <= ?
          ORDER BY scheduled_for ASC
          LIMIT 50
        )
        SELECT rq.id, rq.client_key, rq.lead_phone, rq.retry_type, rq.retry_reason,
               rq.retry_data, rq.scheduled_for, rq.retry_attempt, rq.max_retries,
               rq.status, rq.created_at, rq.updated_at
        FROM retry_queue rq
        INNER JOIN picked p ON p.id = rq.id
        ORDER BY rq.scheduled_for ASC
      `, [futureISO]);
    }
  } catch (error) {
    console.error('[DB] Error getting reminders:', error);
    throw error;
  }
}

/**
 * Make follow-up queue processing database-agnostic
 */
export async function getFollowUpsDue(intervalMinutes = 5) {
  try {
    // Try Postgres first
    try {
      return await query(`
        WITH picked AS (
          SELECT id
          FROM retry_queue
          WHERE retry_reason LIKE 'follow\\_up\\_%' ESCAPE '\\'
            AND status = 'pending'
            AND scheduled_for <= NOW() + ($1::int * INTERVAL '1 minute')
          ORDER BY scheduled_for ASC
          LIMIT 50
        )
        SELECT rq.id, rq.client_key, rq.lead_phone, rq.retry_type, rq.retry_reason,
               rq.retry_data, rq.scheduled_for, rq.retry_attempt, rq.max_retries,
               rq.status, rq.created_at, rq.updated_at
        FROM retry_queue rq
        INNER JOIN picked p ON p.id = rq.id
        ORDER BY rq.scheduled_for ASC
      `, [intervalMinutes]);
    } catch (pgError) {
      // Fallback to SQLite/database-agnostic query
      console.log('[DB] Using database-agnostic follow-up query');
      
      const futureTime = new Date(Date.now() + intervalMinutes * 60 * 1000);
      const futureISO = futureTime.toISOString();
      
      return await query(`
        WITH picked AS (
          SELECT id FROM retry_queue
          WHERE retry_reason LIKE 'follow\\_up\\_%' ESCAPE '\\'
            AND status = 'pending'
            AND scheduled_for <= ?
          ORDER BY scheduled_for ASC
          LIMIT 50
        )
        SELECT rq.id, rq.client_key, rq.lead_phone, rq.retry_type, rq.retry_reason,
               rq.retry_data, rq.scheduled_for, rq.retry_attempt, rq.max_retries,
               rq.status, rq.created_at, rq.updated_at
        FROM retry_queue rq
        INNER JOIN picked p ON p.id = rq.id
        ORDER BY rq.scheduled_for ASC
      `, [futureISO]);
    }
  } catch (error) {
    console.error('[DB] Error getting follow-ups:', error);
    throw error;
  }
}

/**
 * Get last health check result
 */
export function getLastHealthCheck() {
  return lastHealthCheck || { status: 'unknown', message: 'No health check performed yet' };
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  checkDatabaseHealth,
  queryWithRetry,
  getDatabaseStats,
  getRemindersDue,
  getFollowUpsDue,
  getLastHealthCheck
};

