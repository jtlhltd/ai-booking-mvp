// lib/logger.js
// Centralized logging with level control

const LOG_LEVEL = process.env.LOG_LEVEL || 'info'; // debug, info, warn, error
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const currentLevel = LOG_LEVELS[LOG_LEVEL] || LOG_LEVELS.info;

/**
 * Log message if level is high enough
 * @param {string} level - Log level (debug, info, warn, error)
 * @param {...any} args - Arguments to log
 */
export function log(level, ...args) {
  const messageLevel = LOG_LEVELS[level] || LOG_LEVELS.info;
  
  if (messageLevel >= currentLevel) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    switch (level) {
      case 'error':
        console.error(prefix, ...args);
        break;
      case 'warn':
        console.warn(prefix, ...args);
        break;
      default:
        console.log(prefix, ...args);
    }
  }
}

// Convenience methods
export const debug = (...args) => log('debug', ...args);
export const info = (...args) => log('info', ...args);
export const warn = (...args) => log('warn', ...args);
export const error = (...args) => log('error', ...args);

/**
 * Get current log level
 */
export function getLogLevel() {
  return LOG_LEVEL;
}

/**
 * Check if level is enabled
 */
export function isLevelEnabled(level) {
  const messageLevel = LOG_LEVELS[level] || LOG_LEVELS.info;
  return messageLevel >= currentLevel;
}

export default {
  log,
  debug,
  info,
  warn,
  error,
  getLogLevel,
  isLevelEnabled
};

