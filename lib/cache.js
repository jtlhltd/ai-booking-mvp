// In-Memory Cache Utility with optional Redis support
// Provides fast caching for frequently accessed data
// Can be easily swapped with Redis in production

let redisClient = null;

// Try to initialize Redis if available
async function initRedis() {
  if (process.env.REDIS_URL) {
    try {
      const redis = await import('redis');
      redisClient = redis.createClient({ url: process.env.REDIS_URL });
      await redisClient.connect();
      console.log('✅ Redis cache connected');
      return true;
    } catch (error) {
      console.warn('⚠️ Redis not available, using in-memory cache:', error.message);
      return false;
    }
  }
  return false;
}

// Initialize Redis on module load
initRedis().catch(() => {});

export class CacheManager {
  constructor(options = {}) {
    this.cache = new Map();
    this.ttl = options.ttl || 300000; // Default: 5 minutes
    this.maxSize = options.maxSize || 1000; // Max items in cache
    this.useRedis = options.useRedis !== false && redisClient !== null;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or null
   */
  async get(key) {
    // Try Redis first if available
    if (this.useRedis && redisClient) {
      try {
        const value = await redisClient.get(key);
        if (value) {
          this.stats.hits++;
          return JSON.parse(value);
        }
        this.stats.misses++;
        return null;
      } catch (error) {
        console.warn('[CACHE] Redis get error, falling back to memory:', error.message);
        // Fall through to in-memory cache
      }
    }

    // Fallback to in-memory cache
    const item = this.cache.get(key);

    if (!item) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() > item.expires) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return item.value;
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttl - Time to live in ms (optional)
   * @returns {boolean} Success
   */
  async set(key, value, ttl = null) {
    const ttlMs = ttl || this.ttl;
    const ttlSeconds = Math.ceil(ttlMs / 1000);

    // Try Redis first if available
    if (this.useRedis && redisClient) {
      try {
        await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
        this.stats.sets++;
        return true;
      } catch (error) {
        console.warn('[CACHE] Redis set error, falling back to memory:', error.message);
        // Fall through to in-memory cache
      }
    }

    // Fallback to in-memory cache
    // Enforce max size (LRU eviction)
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    const expires = Date.now() + ttlMs;
    
    this.cache.set(key, {
      value,
      expires,
      createdAt: Date.now()
    });

    this.stats.sets++;
    return true;
  }

  /**
   * Delete value from cache
   * @param {string} key - Cache key
   * @returns {boolean} True if deleted
   */
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.deletes++;
    }
    return deleted;
  }

  /**
   * Check if key exists
   * @param {string} key - Cache key
   * @returns {boolean} True if exists
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
    console.log('[CACHE] Cache cleared');
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      sets: this.stats.sets,
      deletes: this.stats.deletes,
      hitRate: `${hitRate}%`,
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  /**
   * Estimate memory usage (rough approximation)
   * @returns {string} Memory usage estimate
   */
  estimateMemoryUsage() {
    const avgItemSize = 1024; // 1KB per item (rough estimate)
    const bytes = this.cache.size * avgItemSize;
    
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  }

  /**
   * Clean up expired items
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expires) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[CACHE] Cleaned up ${removed} expired items`);
    }

    return removed;
  }

  /**
   * Get or set pattern (cache-aside)
   * @param {string} key - Cache key
   * @param {Function} fetchFn - Function to fetch data if not cached
   * @param {number} ttl - Time to live (optional)
   * @returns {*} Cached or fetched value
   */
  async getOrSet(key, fetchFn, ttl = null) {
    // Try to get from cache
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch data
    const value = await fetchFn();
    
    // Store in cache
    this.set(key, value, ttl);

    return value;
  }

  /**
   * Set multiple values
   * @param {Object} items - Key-value pairs
   * @param {number} ttl - Time to live (optional)
   */
  mset(items, ttl = null) {
    for (const [key, value] of Object.entries(items)) {
      this.set(key, value, ttl);
    }
  }

  /**
   * Get multiple values
   * @param {Array} keys - Array of keys
   * @returns {Object} Key-value pairs
   */
  mget(keys) {
    const results = {};
    for (const key of keys) {
      results[key] = this.get(key);
    }
    return results;
  }

  /**
   * Invalidate cache by pattern
   * @param {string|RegExp} pattern - Pattern to match keys
   * @returns {number} Number of keys deleted
   */
  invalidatePattern(pattern) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    let deleted = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        deleted++;
      }
    }

    if (deleted > 0) {
      console.log(`[CACHE] Invalidated ${deleted} keys matching pattern: ${pattern}`);
    }

    return deleted;
  }
}

// Singleton instance
let instance = null;

export function getCache() {
  if (!instance) {
    instance = new CacheManager({
      ttl: 300000, // 5 minutes
      maxSize: parseInt(process.env.CACHE_MAX_SIZE) || 1000,
      useRedis: !!process.env.REDIS_URL
    });

    // Auto cleanup every 5 minutes (only for in-memory cache)
    if (!instance.useRedis) {
      setInterval(() => {
        instance.cleanup();
      }, 300000);
    }
  }
  return instance;
}

// Express middleware for caching API responses
export function cacheMiddleware(options = {}) {
  const cache = getCache();
  const ttl = options.ttl || 300000; // 5 minutes
  const keyPrefix = options.keyPrefix || 'api:';

  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Generate cache key
    const cacheKey = `${keyPrefix}${req.path}:${JSON.stringify(req.query)}`;

    // Try to get cached response
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log('[CACHE] Serving from cache:', cacheKey);
      return res.json(cached);
    }

    // Capture original json function
    const originalJson = res.json.bind(res);

    // Override json function to cache response
    res.json = (data) => {
      // Cache successful responses only
      if (res.statusCode === 200) {
        cache.set(cacheKey, data, ttl);
        console.log('[CACHE] Cached response:', cacheKey);
      }
      return originalJson(data);
    };

    next();
  };
}

export default {
  CacheManager,
  getCache,
  cacheMiddleware
};

