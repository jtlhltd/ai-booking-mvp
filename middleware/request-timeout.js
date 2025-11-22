// middleware/request-timeout.js
// Request timeout middleware to prevent hanging requests

/**
 * Request timeout middleware
 * Automatically terminates requests that exceed the timeout duration
 * 
 * @param {number} timeoutMs - Timeout in milliseconds (default: 30000 = 30 seconds)
 * @returns {Function} Express middleware
 */
export function requestTimeout(timeoutMs = 30000) {
  return (req, res, next) => {
    // Set timeout
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        const correlationId = req.correlationId || req.id || 'unknown';
        console.error(`[REQUEST TIMEOUT] ${req.method} ${req.path} exceeded ${timeoutMs}ms`, {
          correlationId,
          timeout: timeoutMs,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
        
        res.status(504).json({
          ok: false,
          error: 'Request timeout',
          message: `Request exceeded maximum duration of ${timeoutMs}ms`,
          correlationId
        });
      }
    }, timeoutMs);
    
    // Clear timeout when response finishes
    const originalEnd = res.end;
    res.end = function(...args) {
      clearTimeout(timeout);
      originalEnd.apply(this, args);
    };
    
    // Also clear on error
    res.on('close', () => {
      clearTimeout(timeout);
    });
    
    next();
  };
}

/**
 * Per-route timeout configuration
 * Allows different timeouts for different endpoints
 */
export const TIMEOUTS = {
  // Fast endpoints
  health: 5000,        // 5 seconds
  stats: 10000,        // 10 seconds
  
  // Standard API endpoints
  default: 30000,      // 30 seconds
  
  // Long-running operations
  bulkImport: 120000,  // 2 minutes
  analytics: 60000,    // 1 minute
  reports: 90000,      // 1.5 minutes
  
  // Webhooks (should be fast)
  webhooks: 15000,     // 15 seconds
};

/**
 * Get timeout for a specific route
 * @param {string} path - Request path
 * @returns {number} Timeout in milliseconds
 */
export function getTimeoutForPath(path) {
  if (path.includes('/health') || path.includes('/ping')) {
    return TIMEOUTS.health;
  }
  if (path.includes('/stats') || path.includes('/dashboard')) {
    return TIMEOUTS.stats;
  }
  if (path.includes('/webhooks/')) {
    return TIMEOUTS.webhooks;
  }
  if (path.includes('/bulk-import') || path.includes('/import')) {
    return TIMEOUTS.bulkImport;
  }
  if (path.includes('/analytics') || path.includes('/reports')) {
    return TIMEOUTS.analytics;
  }
  return TIMEOUTS.default;
}

/**
 * Smart timeout middleware that adjusts based on route
 */
export function smartRequestTimeout() {
  return (req, res, next) => {
    const timeoutMs = getTimeoutForPath(req.path);
    return requestTimeout(timeoutMs)(req, res, next);
  };
}

