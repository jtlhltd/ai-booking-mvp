// Structured Logging Utility
// Provides consistent, structured logging with context and metadata

import { performanceMonitor } from './performance-monitor.js';

/**
 * Log levels
 */
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4
};

/**
 * Structured Logger Class
 */
export class StructuredLogger {
  constructor(options = {}) {
    this.context = options.context || {};
    this.level = options.level || (process.env.LOG_LEVEL || 'INFO').toUpperCase();
    this.enablePerformanceTracking = options.enablePerformanceTracking !== false;
    this.enableErrorTracking = options.enableErrorTracking !== false;
  }

  /**
   * Create child logger with additional context
   */
  child(additionalContext) {
    return new StructuredLogger({
      context: { ...this.context, ...additionalContext },
      level: this.level,
      enablePerformanceTracking: this.enablePerformanceTracking,
      enableErrorTracking: this.enableErrorTracking
    });
  }

  /**
   * Log message with structured data
   */
  log(level, message, metadata = {}) {
    const logEntry = this.createLogEntry(level, message, metadata);
    
    // Output based on level
    if (this.shouldLog(level)) {
      const output = JSON.stringify(logEntry);
      
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(output);
          break;
        case LogLevel.INFO:
          console.info(output);
          break;
        case LogLevel.WARN:
          console.warn(output);
          break;
        case LogLevel.ERROR:
        case LogLevel.FATAL:
          console.error(output);
          break;
      }
      
      // Track errors in performance monitor
      if (this.enableErrorTracking && (level === LogLevel.ERROR || level === LogLevel.FATAL)) {
        try {
          const { getPerformanceMonitor } = await import('./performance-monitor.js');
          const monitor = getPerformanceMonitor();
          monitor.trackError(new Error(message), {
            ...metadata,
            level,
            timestamp: logEntry.timestamp
          });
        } catch (err) {
          // Fail silently if performance monitor is unavailable
        }
      }
    }
    
    return logEntry;
  }

  /**
   * Create structured log entry
   */
  createLogEntry(level, message, metadata) {
    return {
      timestamp: new Date().toISOString(),
      level: this.getLevelName(level),
      message,
      context: this.context,
      ...metadata
    };
  }

  /**
   * Check if should log at this level
   */
  shouldLog(level) {
    const currentLevel = LogLevel[this.level] || LogLevel.INFO;
    return level >= currentLevel;
  }

  /**
   * Get level name
   */
  getLevelName(level) {
    const names = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
    return names[level] || 'INFO';
  }

  /**
   * Log debug message
   */
  debug(message, metadata = {}) {
    return this.log(LogLevel.DEBUG, message, metadata);
  }

  /**
   * Log info message
   */
  info(message, metadata = {}) {
    return this.log(LogLevel.INFO, message, metadata);
  }

  /**
   * Log warning message
   */
  warn(message, metadata = {}) {
    return this.log(LogLevel.WARN, message, metadata);
  }

  /**
   * Log error message
   */
  error(message, error = null, metadata = {}) {
    const errorMetadata = {
      ...metadata,
      error: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code
      } : null
    };
    return this.log(LogLevel.ERROR, message, errorMetadata);
  }

  /**
   * Log fatal error message
   */
  fatal(message, error = null, metadata = {}) {
    const errorMetadata = {
      ...metadata,
      error: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code
      } : null
    };
    return this.log(LogLevel.FATAL, message, errorMetadata);
  }

  /**
   * Log API request
   */
  logRequest(req, res, duration = null) {
    const metadata = {
      type: 'http_request',
      method: req.method,
      path: req.path,
      url: req.url,
      statusCode: res.statusCode,
      duration: duration ? `${duration}ms` : null,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      clientKey: req.clientKey || 'anonymous',
      apiKeyId: req.apiKey?.id || null
    };
    
    const level = res.statusCode >= 500 ? LogLevel.ERROR 
      : res.statusCode >= 400 ? LogLevel.WARN 
      : LogLevel.INFO;
    
    return this.log(level, `${req.method} ${req.path} ${res.statusCode}`, metadata);
  }

  /**
   * Log database query
   */
  logQuery(query, duration, metadata = {}) {
    const level = duration > 1000 ? LogLevel.WARN : LogLevel.DEBUG;
    return this.log(level, 'Database query', {
      type: 'database_query',
      query: query.substring(0, 200), // Truncate long queries
      duration: `${duration}ms`,
      slow: duration > 1000,
      ...metadata
    });
  }

  /**
   * Log external API call
   */
  logExternalAPI(service, method, url, duration, statusCode, metadata = {}) {
    const level = statusCode >= 400 ? LogLevel.WARN : LogLevel.DEBUG;
    return this.log(level, `External API: ${service}`, {
      type: 'external_api',
      service,
      method,
      url,
      duration: `${duration}ms`,
      statusCode,
      success: statusCode < 400,
      ...metadata
    });
  }

  /**
   * Log business event
   */
  logEvent(eventType, eventData = {}) {
    return this.log(LogLevel.INFO, `Event: ${eventType}`, {
      type: 'business_event',
      eventType,
      ...eventData
    });
  }
}

// Singleton instance
let defaultLogger = null;

/**
 * Get default logger instance
 */
export function getLogger(context = {}) {
  if (!defaultLogger) {
    defaultLogger = new StructuredLogger({
      context: {
        service: 'ai-booking-system',
        ...context
      }
    });
  }
  
  if (Object.keys(context).length > 0) {
    return defaultLogger.child(context);
  }
  
  return defaultLogger;
}

/**
 * Create logger with context
 */
export function createLogger(context) {
  return new StructuredLogger({ context });
}

export default {
  StructuredLogger,
  LogLevel,
  getLogger,
  createLogger
};

