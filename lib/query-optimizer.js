// lib/query-optimizer.js
// Query optimization utilities for better performance

import { query } from '../db.js';

/**
 * Execute query with automatic retry and timeout
 */
export async function optimizedQuery(sql, params = [], options = {}) {
  const {
    timeout = 5000, // 5 second default timeout
    retries = 2,
    retryDelay = 100
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Query timeout after ${timeout}ms`)), timeout);
      });

      const queryPromise = query(sql, params);
      
      const result = await Promise.race([queryPromise, timeoutPromise]);
      return result;
    } catch (error) {
      lastError = error;
      
      // Don't retry on timeout or syntax errors
      if (error.message.includes('timeout') || error.message.includes('syntax')) {
        throw error;
      }
      
      // Wait before retry
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
      }
    }
  }
  
  throw lastError;
}

/**
 * Batch insert with optimized performance
 */
export async function batchInsert(table, records, batchSize = 100) {
  if (records.length === 0) return { inserted: 0 };
  
  const results = [];
  
  // Process in batches
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const columns = Object.keys(batch[0]);
    const placeholders = batch.map((_, idx) => {
      const start = idx * columns.length + 1;
      return `(${columns.map((_, colIdx) => `$${start + colIdx}`).join(', ')})`;
    }).join(', ');
    
    const values = batch.flatMap(record => columns.map(col => record[col]));
    
    const sql = `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES ${placeholders}
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    
    try {
      const result = await optimizedQuery(sql, values);
      results.push(...result.rows);
    } catch (error) {
      console.error(`[BATCH INSERT] Error inserting batch ${i / batchSize + 1}:`, error.message);
      // Continue with next batch
    }
  }
  
  return { inserted: results.length, ids: results.map(r => r.id) };
}

/**
 * Get client data with caching
 */
const clientCache = new Map();
const CLIENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getCachedClient(clientKey) {
  const cacheKey = `client:${clientKey}`;
  const cached = clientCache.get(cacheKey);
  
  if (cached && Date.now() < cached.expires) {
    return cached.data;
  }
  
  const result = await optimizedQuery(
    'SELECT * FROM tenants WHERE client_key = $1',
    [clientKey]
  );
  
  const client = result.rows[0] || null;
  
  if (client) {
    clientCache.set(cacheKey, {
      data: client,
      expires: Date.now() + CLIENT_CACHE_TTL
    });
  }
  
  return client;
}

/**
 * Invalidate client cache
 */
export function invalidateClientCache(clientKey) {
  clientCache.delete(`client:${clientKey}`);
  // Also clear any related caches
  for (const key of clientCache.keys()) {
    if (key.includes(clientKey)) {
      clientCache.delete(key);
    }
  }
}

/**
 * Get dashboard stats with optimized queries
 * Uses single query with CTEs for better performance
 */
export async function getDashboardStats(clientKey, startDate = null) {
  // Default to last 30 days if no start date
  if (!startDate) {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }
  
  // Use single query with CTEs for better performance
  const sql = `
    WITH 
    lead_stats AS (
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'new') as new,
        COUNT(*) FILTER (WHERE status = 'contacted') as contacted,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as last_24h
      FROM leads
      WHERE client_key = $1
        AND ($2::TIMESTAMPTZ IS NULL OR created_at >= $2)
    ),
    appointment_stats AS (
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'booked') as booked,
        COUNT(*) FILTER (WHERE start_iso >= NOW()) as upcoming,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as last_24h
      FROM appointments
      WHERE client_key = $1
        AND ($2::TIMESTAMPTZ IS NULL OR created_at >= $2)
    ),
    call_stats AS (
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE outcome = 'booked') as booked,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as last_24h
      FROM calls
      WHERE client_key = $1
        AND ($2::TIMESTAMPTZ IS NULL OR created_at >= $2)
    ),
    message_stats AS (
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as last_24h
      FROM messages
      WHERE client_key = $1
        AND ($2::TIMESTAMPTZ IS NULL OR created_at >= $2)
    )
    SELECT 
      json_build_object(
        'total', (SELECT total FROM lead_stats),
        'new', (SELECT new FROM lead_stats),
        'contacted', (SELECT contacted FROM lead_stats),
        'last_24h', (SELECT last_24h FROM lead_stats)
      ) as leads,
      json_build_object(
        'total', (SELECT total FROM appointment_stats),
        'booked', (SELECT booked FROM appointment_stats),
        'upcoming', (SELECT upcoming FROM appointment_stats),
        'last_24h', (SELECT last_24h FROM appointment_stats)
      ) as appointments,
      json_build_object(
        'total', (SELECT total FROM call_stats),
        'booked', (SELECT booked FROM call_stats),
        'last_24h', (SELECT last_24h FROM call_stats)
      ) as calls,
      json_build_object(
        'total', (SELECT total FROM message_stats),
        'delivered', (SELECT delivered FROM message_stats),
        'last_24h', (SELECT last_24h FROM message_stats)
      ) as messages
  `;
  
  const result = await optimizedQuery(sql, [clientKey, startDate]);
  const row = result.rows[0];
  
  return {
    leads: row.leads || {},
    appointments: row.appointments || {},
    calls: row.calls || {},
    messages: row.messages || {}
  };
}

/**
 * Clean up old cache entries
 */
export function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of clientCache.entries()) {
    if (now >= value.expires) {
      clientCache.delete(key);
    }
  }
}

// Cleanup cache every 10 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupCache, 10 * 60 * 1000);
}

export default {
  optimizedQuery,
  batchInsert,
  getCachedClient,
  invalidateClientCache,
  getDashboardStats,
  cleanupCache
};

