// lib/timeouts.js
// Comprehensive request timeout handling

/**
 * Timeout configuration for different operations
 */
export const TIMEOUTS = {
  database: 5000,           // 5 seconds
  vapi: 10000,              // 10 seconds
  twilio: 8000,             // 8 seconds
  googleCalendar: 15000,    // 15 seconds
  webhook: 5000,            // 5 seconds
  bulkImport: 300000,       // 5 minutes
  fetch: 10000,             // 10 seconds default
  sms: 8000                 // 8 seconds
};

/**
 * Execute promise with timeout
 */
export async function withTimeout(promise, timeoutMs, operation = 'operation') {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`${operation} timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  try {
    return await Promise.race([promise, timeoutPromise]);
  } catch (error) {
    if (error.message.includes('timeout')) {
      console.error(`[TIMEOUT] ${operation} timed out after ${timeoutMs}ms`);
      await logTimeout(operation, timeoutMs);
    }
    throw error;
  }
}

/**
 * Log timeout for monitoring
 */
async function logTimeout(operation, timeoutMs) {
  try {
    const { logError } = await import('./error-monitoring.js');
    await logError({
      errorType: 'Timeout',
      errorMessage: `${operation} timed out after ${timeoutMs}ms`,
      severity: 'warning',
      service: 'timeout-handler',
      context: { operation, timeoutMs }
    });
  } catch (error) {
    // Don't fail on logging
    console.error('[TIMEOUT] Failed to log timeout:', error);
  }
}

/**
 * Fetch with timeout
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUTS.fetch) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Database query with timeout
 */
export async function queryWithTimeout(queryFn, timeoutMs = TIMEOUTS.database) {
  return withTimeout(queryFn(), timeoutMs, 'Database query');
}

