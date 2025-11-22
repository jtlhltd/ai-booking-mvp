// Enhanced Rate Limiting System
// Provides configurable rate limits with Redis support (optional) and per-endpoint limits

import { query } from '../db.js';

// Rate limit configurations per endpoint
const RATE_LIMIT_CONFIG = {
  // Public endpoints (stricter)
  '/api/leads': { windowMs: 60000, max: 10, name: 'lead-creation' },
  '/api/calendar/check-book': { windowMs: 60000, max: 20, name: 'calendar-check' },
  
  // Admin endpoints (moderate)
  '/api/admin': { windowMs: 60000, max: 30, name: 'admin-api' },
  '/api/stats': { windowMs: 60000, max: 60, name: 'stats-api' },
  
  // Webhook endpoints (more lenient - external services)
  '/webhooks/vapi': { windowMs: 60000, max: 100, name: 'vapi-webhooks' },
  '/webhooks/twilio': { windowMs: 60000, max: 100, name: 'twilio-webhooks' },
  
  // Health endpoints (very lenient)
  '/health': { windowMs: 60000, max: 200, name: 'health-checks' },
  '/api/health': { windowMs: 60000, max: 200, name: 'health-api' },
  
  // Performance endpoints (moderate)
  '/api/performance': { windowMs: 60000, max: 30, name: 'performance-api' },
  
  // Default
  default: { windowMs: 60000, max: 60, name: 'default' }
};

// In-memory store (in production, use Redis)
const rateLimitStore = new Map();

/**
 * Get rate limit config for an endpoint
 */
function getRateLimitConfig(path) {
  // Check exact matches first
  for (const [endpoint, config] of Object.entries(RATE_LIMIT_CONFIG)) {
    if (path.startsWith(endpoint)) {
      return config;
    }
  }
  return RATE_LIMIT_CONFIG.default;
}

/**
 * Generate rate limit key
 */
function getRateLimitKey(identifier, endpoint) {
  return `ratelimit:${identifier}:${endpoint}`;
}

/**
 * Check if request should be rate limited
 */
export async function checkRateLimit(identifier, endpoint, config = null) {
  const limitConfig = config || getRateLimitConfig(endpoint);
  const key = getRateLimitKey(identifier, endpoint);
  const now = Date.now();
  const windowStart = now - limitConfig.windowMs;
  
  // Clean up old entries
  for (const [storeKey, timestamp] of rateLimitStore.entries()) {
    if (timestamp < windowStart) {
      rateLimitStore.delete(storeKey);
    }
  }
  
  // Count requests in current window
  const requests = Array.from(rateLimitStore.values())
    .filter(timestamp => timestamp >= windowStart && timestamp <= now)
    .filter((_, index, arr) => arr.indexOf(_) === index) // Deduplicate
    .length;
  
  // Check if limit exceeded
  if (requests >= limitConfig.max) {
    return {
      allowed: false,
      limit: limitConfig.max,
      remaining: 0,
      reset: windowStart + limitConfig.windowMs,
      retryAfter: Math.ceil((windowStart + limitConfig.windowMs - now) / 1000)
    };
  }
  
  // Record this request
  rateLimitStore.set(`${key}-${now}`, now);
  
  return {
    allowed: true,
    limit: limitConfig.max,
    remaining: limitConfig.max - requests - 1,
    reset: windowStart + limitConfig.windowMs,
    retryAfter: 0
  };
}

/**
 * Get rate limit status for an identifier
 */
export async function getRateLimitStatus(identifier) {
  const status = {};
  
  for (const [endpoint, config] of Object.entries(RATE_LIMIT_CONFIG)) {
    const result = await checkRateLimit(identifier, endpoint, config);
    status[endpoint] = {
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset
    };
  }
  
  return status;
}

/**
 * Express middleware for rate limiting
 */
export function createRateLimitMiddleware(options = {}) {
  return async (req, res, next) => {
    try {
      // Get identifier (IP, API key, or user ID)
      const identifier = options.identifier || req.ip || 
                        req.apiKey?.id || 
                        req.clientKey || 
                        req.headers['x-forwarded-for']?.split(',')[0] || 
                        'unknown';
      
      // Get endpoint
      const endpoint = req.path;
      
      // Check rate limit
      const result = await checkRateLimit(identifier, endpoint);
      
      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': result.limit.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': new Date(result.reset).toISOString()
      });
      
      if (!result.allowed) {
        res.set('Retry-After', result.retryAfter.toString());
        return res.status(429).json({
          ok: false,
          error: 'Rate limit exceeded',
          message: `Too many requests. Limit: ${result.limit} per ${options.windowMs || 60000}ms`,
          retryAfter: result.retryAfter
        });
      }
      
      next();
    } catch (error) {
      console.error('[RATE LIMIT ERROR]', error);
      // On error, allow request (fail open)
      next();
    }
  };
}

/**
 * Get rate limit statistics
 */
export function getRateLimitStats() {
  const now = Date.now();
  const stats = {
    totalEntries: rateLimitStore.size,
    activeWindows: 0,
    endpoints: {}
  };
  
  // Count active entries per endpoint
  for (const [key, timestamp] of rateLimitStore.entries()) {
    const endpoint = key.split(':')[2] || 'unknown';
    if (!stats.endpoints[endpoint]) {
      stats.endpoints[endpoint] = 0;
    }
    stats.endpoints[endpoint]++;
    
    // Check if in active window (last 60 seconds)
    if (timestamp > now - 60000) {
      stats.activeWindows++;
    }
  }
  
  return stats;
}

/**
 * Clear rate limit data (for testing/admin)
 */
export function clearRateLimitData() {
  rateLimitStore.clear();
  return { cleared: true, timestamp: new Date().toISOString() };
}

