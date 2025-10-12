// Performance Monitoring Utility
// Tracks slow queries, API response times, and system health

import { EventEmitter } from 'events';

export class PerformanceMonitor extends EventEmitter {
  constructor() {
    super();
    this.metrics = {
      queries: [],
      apiCalls: [],
      errors: []
    };
    this.thresholds = {
      slowQuery: 1000, // 1 second
      slowAPI: 2000, // 2 seconds
      maxMetricsSize: 1000
    };
  }

  /**
   * Track database query performance
   * @param {string} query - SQL query
   * @param {number} duration - Duration in ms
   * @param {Object} metadata - Additional metadata
   */
  trackQuery(query, duration, metadata = {}) {
    const metric = {
      type: 'query',
      query: query.substring(0, 200), // Truncate long queries
      duration,
      timestamp: new Date().toISOString(),
      slow: duration > this.thresholds.slowQuery,
      ...metadata
    };

    this.metrics.queries.push(metric);
    
    // Keep only recent metrics
    if (this.metrics.queries.length > this.thresholds.maxMetricsSize) {
      this.metrics.queries.shift();
    }

    // Emit slow query alert
    if (metric.slow) {
      console.warn(`[PERF] Slow query detected (${duration}ms):`, query.substring(0, 100));
      this.emit('slow-query', metric);
    }

    return metric;
  }

  /**
   * Track API endpoint performance
   * @param {string} method - HTTP method
   * @param {string} path - API path
   * @param {number} duration - Duration in ms
   * @param {number} statusCode - HTTP status code
   * @param {Object} metadata - Additional metadata
   */
  trackAPI(method, path, duration, statusCode, metadata = {}) {
    const metric = {
      type: 'api',
      method,
      path,
      duration,
      statusCode,
      timestamp: new Date().toISOString(),
      slow: duration > this.thresholds.slowAPI,
      error: statusCode >= 400,
      ...metadata
    };

    this.metrics.apiCalls.push(metric);

    if (this.metrics.apiCalls.length > this.thresholds.maxMetricsSize) {
      this.metrics.apiCalls.shift();
    }

    if (metric.slow) {
      console.warn(`[PERF] Slow API call detected (${duration}ms): ${method} ${path}`);
      this.emit('slow-api', metric);
    }

    if (metric.error) {
      this.emit('api-error', metric);
    }

    return metric;
  }

  /**
   * Track errors
   * @param {Error} error - Error object
   * @param {Object} context - Error context
   */
  trackError(error, context = {}) {
    const metric = {
      type: 'error',
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      ...context
    };

    this.metrics.errors.push(metric);

    if (this.metrics.errors.length > this.thresholds.maxMetricsSize) {
      this.metrics.errors.shift();
    }

    console.error('[PERF] Error tracked:', error.message, context);
    this.emit('error', metric);

    return metric;
  }

  /**
   * Get performance statistics
   * @param {string} type - Metric type (query, api, error, or null for all)
   * @param {number} minutes - Time window in minutes
   * @returns {Object} Performance statistics
   */
  getStats(type = null, minutes = 60) {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    let metrics;

    if (type) {
      metrics = this.metrics[type === 'query' ? 'queries' : type === 'api' ? 'apiCalls' : 'errors'];
    } else {
      metrics = [...this.metrics.queries, ...this.metrics.apiCalls, ...this.metrics.errors];
    }

    // Filter by time window
    const recentMetrics = metrics.filter(m => new Date(m.timestamp).getTime() > cutoff);

    // Calculate statistics
    const stats = {
      total: recentMetrics.length,
      timeWindow: `${minutes} minutes`,
      timestamp: new Date().toISOString()
    };

    if (type === 'query' || type === null) {
      const queries = recentMetrics.filter(m => m.type === 'query');
      stats.queries = {
        total: queries.length,
        slow: queries.filter(q => q.slow).length,
        avgDuration: queries.length > 0 
          ? Math.round(queries.reduce((sum, q) => sum + q.duration, 0) / queries.length)
          : 0,
        maxDuration: queries.length > 0
          ? Math.max(...queries.map(q => q.duration))
          : 0
      };
    }

    if (type === 'api' || type === null) {
      const apiCalls = recentMetrics.filter(m => m.type === 'api');
      stats.api = {
        total: apiCalls.length,
        slow: apiCalls.filter(a => a.slow).length,
        errors: apiCalls.filter(a => a.error).length,
        avgDuration: apiCalls.length > 0
          ? Math.round(apiCalls.reduce((sum, a) => sum + a.duration, 0) / apiCalls.length)
          : 0,
        byStatus: this.groupBy(apiCalls, 'statusCode')
      };
    }

    if (type === 'error' || type === null) {
      const errors = recentMetrics.filter(m => m.type === 'error');
      stats.errors = {
        total: errors.length,
        byType: this.groupBy(errors, 'message')
      };
    }

    return stats;
  }

  /**
   * Get slow queries
   * @param {number} limit - Max number of results
   * @returns {Array} Slow queries
   */
  getSlowQueries(limit = 10) {
    return this.metrics.queries
      .filter(q => q.slow)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Get slow API calls
   * @param {number} limit - Max number of results
   * @returns {Array} Slow API calls
   */
  getSlowAPICalls(limit = 10) {
    return this.metrics.apiCalls
      .filter(a => a.slow)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Get recent errors
   * @param {number} limit - Max number of results
   * @returns {Array} Recent errors
   */
  getRecentErrors(limit = 10) {
    return this.metrics.errors
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Clear all metrics
   */
  clearMetrics() {
    this.metrics = {
      queries: [],
      apiCalls: [],
      errors: []
    };
    console.log('[PERF] Metrics cleared');
  }

  /**
   * Helper: Group array by property
   */
  groupBy(array, property) {
    return array.reduce((acc, item) => {
      const key = item[property] || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  /**
   * Generate performance report
   * @returns {Object} Comprehensive performance report
   */
  generateReport() {
    const stats = this.getStats();
    const slowQueries = this.getSlowQueries(5);
    const slowAPIs = this.getSlowAPICalls(5);
    const recentErrors = this.getRecentErrors(5);

    return {
      summary: stats,
      topIssues: {
        slowQueries,
        slowAPIs,
        recentErrors
      },
      recommendations: this.generateRecommendations(stats),
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Generate performance recommendations
   */
  generateRecommendations(stats) {
    const recommendations = [];

    // Query performance
    if (stats.queries && stats.queries.slow > stats.queries.total * 0.1) {
      recommendations.push({
        type: 'query',
        priority: 'high',
        message: `${stats.queries.slow} slow queries detected (${(stats.queries.slow / stats.queries.total * 100).toFixed(1)}% of all queries)`,
        suggestion: 'Add database indexes, optimize query logic, or consider query result caching'
      });
    }

    // API performance
    if (stats.api && stats.api.avgDuration > 1000) {
      recommendations.push({
        type: 'api',
        priority: 'medium',
        message: `Average API response time is ${stats.api.avgDuration}ms`,
        suggestion: 'Implement caching, optimize database queries, or add CDN for static assets'
      });
    }

    // Error rate
    if (stats.errors && stats.errors.total > 10) {
      recommendations.push({
        type: 'error',
        priority: 'critical',
        message: `${stats.errors.total} errors in the last hour`,
        suggestion: 'Review error logs and implement fixes for common error patterns'
      });
    }

    // API errors
    if (stats.api && stats.api.errors > stats.api.total * 0.05) {
      recommendations.push({
        type: 'api-error',
        priority: 'high',
        message: `${(stats.api.errors / stats.api.total * 100).toFixed(1)}% API error rate`,
        suggestion: 'Improve error handling, validate input data, and add request retry logic'
      });
    }

    return recommendations;
  }
}

// Express middleware for automatic API tracking
export function performanceMiddleware(monitor) {
  return (req, res, next) => {
    const start = Date.now();

    // Capture original end function
    const originalEnd = res.end;

    // Override end function to track metrics
    res.end = function(...args) {
      const duration = Date.now() - start;
      
      // Track API call
      monitor.trackAPI(
        req.method,
        req.path,
        duration,
        res.statusCode,
        {
          clientKey: req.get('X-Client-Key'),
          userAgent: req.get('User-Agent')
        }
      );

      // Call original end function
      originalEnd.apply(res, args);
    };

    next();
  };
}

// Singleton instance
let instance = null;

export function getPerformanceMonitor() {
  if (!instance) {
    instance = new PerformanceMonitor();
  }
  return instance;
}

export default {
  PerformanceMonitor,
  performanceMiddleware,
  getPerformanceMonitor
};

