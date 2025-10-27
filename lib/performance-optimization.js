// Performance Optimization Utilities
// Provides caching, query optimization, and performance monitoring

import Redis from 'redis';
import { getCache } from './cache.js';

/**
 * Redis Cache Manager for Production
 */
export class RedisCacheManager {
  constructor(options = {}) {
    this.client = Redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      ...options
    });
    
    this.client.on('error', (err) => {
      console.error('[REDIS ERROR]', err);
    });
    
    this.client.on('connect', () => {
      console.log('[REDIS] Connected successfully');
    });
  }

  async get(key) {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('[REDIS GET ERROR]', error);
      return null;
    }
  }

  async set(key, value, ttl = 300) {
    try {
      await this.client.setEx(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('[REDIS SET ERROR]', error);
      return false;
    }
  }

  async del(key) {
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('[REDIS DEL ERROR]', error);
      return false;
    }
  }

  async exists(key) {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error('[REDIS EXISTS ERROR]', error);
      return false;
    }
  }
}

/**
 * Query Optimization Utilities
 */
export class QueryOptimizer {
  constructor(db) {
    this.db = db;
    this.queryCache = new Map();
  }

  /**
   * Optimized client stats query with single JOIN
   */
  async getClientStatsOptimized(clientKey) {
    const cacheKey = `client_stats:${clientKey}`;
    
    // Check cache first
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    const query = `
      SELECT 
        t.client_key,
        t.display_name,
        t.timezone,
        t.is_enabled,
        t.created_at,
        COUNT(DISTINCT l.id) as total_leads,
        COUNT(DISTINCT CASE WHEN l.status = 'new' THEN l.id END) as new_leads,
        COUNT(DISTINCT CASE WHEN l.status = 'booked' THEN l.id END) as booked_leads,
        COUNT(DISTINCT c.id) as total_calls,
        COUNT(DISTINCT CASE WHEN c.outcome = 'booked' THEN c.id END) as successful_calls,
        AVG(c.quality_score) as avg_quality_score,
        SUM(c.cost) as total_cost,
        COUNT(DISTINCT a.id) as total_appointments
      FROM tenants t
      LEFT JOIN leads l ON t.client_key = l.client_key
      LEFT JOIN calls c ON t.client_key = c.client_key
      LEFT JOIN appointments a ON t.client_key = a.client_key
      WHERE t.client_key = $1
      GROUP BY t.client_key, t.display_name, t.timezone, t.is_enabled, t.created_at
    `;

    const result = await this.db.query(query, [clientKey]);
    const stats = result.rows[0];

    if (stats) {
      // Calculate derived metrics
      stats.conversion_rate = stats.total_calls > 0 
        ? (stats.successful_calls / stats.total_calls * 100).toFixed(2)
        : 0;
      
      stats.avg_quality_score = parseFloat(stats.avg_quality_score || 0);
      stats.total_cost = parseFloat(stats.total_cost || 0);
    }

    // Cache for 5 minutes
    await this.setCached(cacheKey, stats, 300);
    
    return stats;
  }

  /**
   * Batch operations for multiple clients
   */
  async getMultipleClientStats(clientKeys) {
    const cacheKey = `multiple_client_stats:${clientKeys.sort().join(',')}`;
    
    // Check cache first
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    const placeholders = clientKeys.map((_, index) => `$${index + 1}`).join(',');
    
    const query = `
      SELECT 
        t.client_key,
        t.display_name,
        COUNT(DISTINCT l.id) as total_leads,
        COUNT(DISTINCT c.id) as total_calls,
        AVG(c.quality_score) as avg_quality_score
      FROM tenants t
      LEFT JOIN leads l ON t.client_key = l.client_key
      LEFT JOIN calls c ON t.client_key = c.client_key
      WHERE t.client_key IN (${placeholders})
      GROUP BY t.client_key, t.display_name
    `;

    const result = await this.db.query(query, clientKeys);
    
    // Cache for 2 minutes
    await this.setCached(cacheKey, result.rows, 120);
    
    return result.rows;
  }

  /**
   * Paginated queries with cursor-based pagination
   */
  async getPaginatedLeads(clientKey, cursor = null, limit = 50) {
    const cacheKey = `paginated_leads:${clientKey}:${cursor}:${limit}`;
    
    // Check cache first
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    let query = `
      SELECT id, name, phone, email, status, created_at
      FROM leads 
      WHERE client_key = $1
    `;
    const params = [clientKey];

    if (cursor) {
      query += ` AND created_at < $2`;
      params.push(cursor);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit + 1); // Get one extra to check if there are more

    const result = await this.db.query(query, params);
    const leads = result.rows;
    
    const hasMore = leads.length > limit;
    if (hasMore) {
      leads.pop(); // Remove the extra record
    }

    const nextCursor = hasMore ? leads[leads.length - 1].created_at : null;

    const response = {
      data: leads,
      pagination: {
        hasMore,
        nextCursor,
        limit
      }
    };

    // Cache for 1 minute
    await this.setCached(cacheKey, response, 60);
    
    return response;
  }

  async getCached(key) {
    // Try Redis first, fallback to in-memory cache
    if (process.env.REDIS_URL) {
      const redis = new RedisCacheManager();
      return await redis.get(key);
    } else {
      const cache = getCache();
      return cache.get(key);
    }
  }

  async setCached(key, value, ttl) {
    if (process.env.REDIS_URL) {
      const redis = new RedisCacheManager();
      return await redis.set(key, value, ttl);
    } else {
      const cache = getCache();
      return cache.set(key, value, ttl * 1000); // Convert to milliseconds
    }
  }
}

/**
 * Database Connection Pool Optimization
 */
export class DatabasePoolManager {
  constructor() {
    this.pools = new Map();
  }

  getPool(name = 'default') {
    if (!this.pools.has(name)) {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
        statement_timeout: 30000,
        query_timeout: 30000
      });

      pool.on('error', (err) => {
        console.error('[DB POOL ERROR]', err);
      });

      this.pools.set(name, pool);
    }

    return this.pools.get(name);
  }

  async closeAll() {
    for (const [name, pool] of this.pools) {
      await pool.end();
      console.log(`[DB POOL] Closed pool: ${name}`);
    }
  }
}

/**
 * Performance Monitoring
 */
export class PerformanceTracker {
  constructor() {
    this.metrics = {
      queries: [],
      apiCalls: [],
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  trackQuery(query, duration, params = []) {
    this.metrics.queries.push({
      query: query.substring(0, 100),
      duration,
      params: params.length,
      timestamp: new Date().toISOString()
    });

    // Keep only last 1000 queries
    if (this.metrics.queries.length > 1000) {
      this.metrics.queries.shift();
    }

    if (duration > 1000) {
      console.warn(`[SLOW QUERY] ${duration}ms: ${query.substring(0, 50)}...`);
    }
  }

  trackAPICall(method, path, duration, statusCode) {
    this.metrics.apiCalls.push({
      method,
      path,
      duration,
      statusCode,
      timestamp: new Date().toISOString()
    });

    // Keep only last 1000 API calls
    if (this.metrics.apiCalls.length > 1000) {
      this.metrics.apiCalls.shift();
    }
  }

  trackCacheHit() {
    this.metrics.cacheHits++;
  }

  trackCacheMiss() {
    this.metrics.cacheMisses++;
  }

  getStats() {
    const queries = this.metrics.queries;
    const apiCalls = this.metrics.apiCalls;
    
    const avgQueryTime = queries.length > 0 
      ? queries.reduce((sum, q) => sum + q.duration, 0) / queries.length 
      : 0;
    
    const avgAPITime = apiCalls.length > 0 
      ? apiCalls.reduce((sum, a) => sum + a.duration, 0) / apiCalls.length 
      : 0;

    const cacheHitRate = this.metrics.cacheHits + this.metrics.cacheMisses > 0
      ? (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) * 100).toFixed(2)
      : 0;

    return {
      queries: {
        total: queries.length,
        avgDuration: Math.round(avgQueryTime),
        slowQueries: queries.filter(q => q.duration > 1000).length
      },
      apiCalls: {
        total: apiCalls.length,
        avgDuration: Math.round(avgAPITime),
        errorRate: apiCalls.filter(a => a.statusCode >= 400).length / apiCalls.length * 100
      },
      cache: {
        hits: this.metrics.cacheHits,
        misses: this.metrics.cacheMisses,
        hitRate: `${cacheHitRate}%`
      }
    };
  }
}

// Singleton instances
let queryOptimizer = null;
let dbPoolManager = null;
let performanceTracker = null;

export function getQueryOptimizer(db) {
  if (!queryOptimizer) {
    queryOptimizer = new QueryOptimizer(db);
  }
  return queryOptimizer;
}

export function getDBPoolManager() {
  if (!dbPoolManager) {
    dbPoolManager = new DatabasePoolManager();
  }
  return dbPoolManager;
}

export function getPerformanceTracker() {
  if (!performanceTracker) {
    performanceTracker = new PerformanceTracker();
  }
  return performanceTracker;
}

export default {
  RedisCacheManager,
  QueryOptimizer,
  DatabasePoolManager,
  PerformanceTracker,
  getQueryOptimizer,
  getDBPoolManager,
  getPerformanceTracker
};



