// lib/correlation-logger.js
// Enhanced logging with correlation IDs

/**
 * Log with correlation ID context
 * @param {Object} req - Express request object (with correlationId)
 * @param {string} level - Log level (error, warn, info, debug)
 * @param {string} message - Log message
 * @param {Object} data - Additional data to log
 */
export function logWithCorrelation(req, level, message, data = {}) {
  const correlationId = req?.correlationId || req?.id || 'unknown';
  const logContext = req?.logContext || {};
  
  const logData = {
    ...logContext,
    ...data,
    timestamp: new Date().toISOString(),
    level
  };
  
  const prefix = `[${correlationId}]`;
  const logMessage = `${prefix} ${message}`;
  
  switch(level) {
    case 'error':
      console.error(logMessage, logData);
      break;
    case 'warn':
      console.warn(logMessage, logData);
      break;
    case 'info':
      console.log(logMessage, logData);
      break;
    case 'debug':
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(logMessage, logData);
      }
      break;
    default:
      console.log(logMessage, logData);
  }
  
  return logData;
}

/**
 * Create a logger function bound to a request
 * @param {Object} req - Express request object
 * @returns {Function} Logger function
 */
export function createRequestLogger(req) {
  return {
    error: (message, data) => logWithCorrelation(req, 'error', message, data),
    warn: (message, data) => logWithCorrelation(req, 'warn', message, data),
    info: (message, data) => logWithCorrelation(req, 'info', message, data),
    debug: (message, data) => logWithCorrelation(req, 'debug', message, data)
  };
}

