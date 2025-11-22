// lib/circuit-breaker.js
// Circuit breaker pattern for external service calls

const circuitBreakerState = new Map();

const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,        // Open after 5 failures
  successThreshold: 2,        // Close after 2 successes (half-open)
  timeout: 60000,            // Stay open for 60 seconds
  resetTimeout: 300000        // Auto-reset after 5 minutes
};

/**
 * Get circuit breaker state for an operation
 */
function getCircuitBreakerState(operation) {
  if (!circuitBreakerState.has(operation)) {
    circuitBreakerState.set(operation, {
      state: 'closed', // closed, open, half-open
      failures: 0,
      successes: 0,
      lastFailure: null,
      lastSuccess: null,
      openedAt: null
    });
  }
  return circuitBreakerState.get(operation);
}

/**
 * Check if circuit breaker is open
 */
export function isCircuitBreakerOpen(operation) {
  const state = getCircuitBreakerState(operation);
  
  // Auto-recovery: if open for more than resetTimeout, try half-open
  if (state.state === 'open' && state.openedAt) {
    const timeSinceOpen = Date.now() - state.openedAt;
    if (timeSinceOpen > CIRCUIT_BREAKER_CONFIG.resetTimeout) {
      state.state = 'half-open';
      state.successes = 0;
      state.failures = 0;
      console.log(`[CIRCUIT BREAKER] ${operation} moved to half-open (auto-recovery)`);
    }
  }
  
  // Auto-recovery: if open for more than timeout, try half-open
  if (state.state === 'open' && state.openedAt) {
    const timeSinceOpen = Date.now() - state.openedAt;
    if (timeSinceOpen > CIRCUIT_BREAKER_CONFIG.timeout) {
      state.state = 'half-open';
      state.successes = 0;
      state.failures = 0;
      console.log(`[CIRCUIT BREAKER] ${operation} moved to half-open (timeout recovery)`);
    }
  }
  
  return state.state === 'open';
}

/**
 * Record a success
 */
export function recordSuccess(operation) {
  const state = getCircuitBreakerState(operation);
  state.lastSuccess = Date.now();
  
  if (state.state === 'half-open') {
    state.successes++;
    if (state.successes >= CIRCUIT_BREAKER_CONFIG.successThreshold) {
      state.state = 'closed';
      state.failures = 0;
      state.successes = 0;
      state.openedAt = null;
      console.log(`[CIRCUIT BREAKER] ${operation} closed (recovered)`);
    }
  } else if (state.state === 'closed') {
    // Reset failure count on success
    state.failures = 0;
  }
}

/**
 * Record a failure
 */
export function recordFailure(operation, error = null) {
  const state = getCircuitBreakerState(operation);
  state.lastFailure = Date.now();
  state.failures++;
  
  if (state.state === 'half-open') {
    // Any failure in half-open opens the circuit
    state.state = 'open';
    state.openedAt = Date.now();
    state.successes = 0;
    console.log(`[CIRCUIT BREAKER] ${operation} opened (failed in half-open)`);
  } else if (state.state === 'closed') {
    if (state.failures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
      state.state = 'open';
      state.openedAt = Date.now();
      console.log(`[CIRCUIT BREAKER] ${operation} opened (${state.failures} failures)`);
      
      // Send alert (async, don't await to avoid blocking)
      if (process.env.YOUR_EMAIL) {
        import('./error-monitoring.js').then(async ({ sendCriticalAlert }) => {
          try {
            await sendCriticalAlert({
              message: `Circuit breaker opened for ${operation} after ${state.failures} failures`,
              errorType: 'Circuit Breaker',
              severity: 'warning',
              metadata: { operation, failures: state.failures, error: error?.message }
            });
          } catch (e) {
            console.error('[CIRCUIT BREAKER] Failed to send alert:', e);
          }
        }).catch(e => {
          console.error('[CIRCUIT BREAKER] Failed to import error-monitoring:', e);
        });
      }
    }
  }
}

/**
 * Execute function with circuit breaker protection
 */
export async function withCircuitBreaker(operation, fn, fallback = null) {
  // Check if circuit is open
  if (isCircuitBreakerOpen(operation)) {
    console.log(`[CIRCUIT BREAKER] ${operation} is open, failing fast`);
    
    if (fallback) {
      console.log(`[CIRCUIT BREAKER] Using fallback for ${operation}`);
      try {
        return await fallback();
      } catch (fallbackError) {
        throw new Error(`Circuit breaker open and fallback failed: ${fallbackError.message}`);
      }
    }
    
    throw new Error(`Circuit breaker is open for ${operation}. Service unavailable.`);
  }
  
  try {
    const result = await fn();
    recordSuccess(operation);
    return result;
  } catch (error) {
    recordFailure(operation, error);
    throw error;
  }
}

/**
 * Get circuit breaker status for all operations
 */
export function getCircuitBreakerStatus() {
  const status = {};
  for (const [operation, state] of circuitBreakerState.entries()) {
    status[operation] = {
      state: state.state,
      failures: state.failures,
      successes: state.successes,
      lastFailure: state.lastFailure ? new Date(state.lastFailure).toISOString() : null,
      lastSuccess: state.lastSuccess ? new Date(state.lastSuccess).toISOString() : null,
      openedAt: state.openedAt ? new Date(state.openedAt).toISOString() : null
    };
  }
  return status;
}

/**
 * Reset circuit breaker for an operation
 */
export function resetCircuitBreaker(operation) {
  if (circuitBreakerState.has(operation)) {
    const state = circuitBreakerState.get(operation);
    state.state = 'closed';
    state.failures = 0;
    state.successes = 0;
    state.openedAt = null;
    console.log(`[CIRCUIT BREAKER] ${operation} manually reset`);
  }
}

