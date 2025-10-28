// Retry Logic with Exponential Backoff
// Handles transient failures gracefully with intelligent retry strategies

/**
 * Retry configuration options
 */
export class RetryConfig {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000; // 1 second
    this.maxDelay = options.maxDelay || 30000; // 30 seconds
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.jitter = options.jitter !== false; // Add randomness by default
    this.retryCondition = options.retryCondition || this.defaultRetryCondition;
  }

  /**
   * Default retry condition - retry on network errors and 5xx status codes
   */
  defaultRetryCondition(error) {
    // Retry on network errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return true;
    }
    
    // Retry on 5xx server errors
    if (error.status >= 500 && error.status < 600) {
      return true;
    }
    
    // Retry on 429 (rate limit) with exponential backoff
    if (error.status === 429) {
      return true;
    }
    
    return false;
  }

  /**
   * Calculate delay for next retry attempt
   */
  calculateDelay(attempt) {
    let delay = this.baseDelay * Math.pow(this.backoffMultiplier, attempt - 1);
    
    // Cap at max delay
    delay = Math.min(delay, this.maxDelay);
    
    // Add jitter to prevent thundering herd
    if (this.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }
    
    return Math.floor(delay);
  }
}

/**
 * Retry utility with exponential backoff
 */
export class RetryManager {
  constructor(config = {}) {
    this.config = new RetryConfig(config);
  }

  /**
   * Execute function with retry logic
   */
  async execute(fn, context = {}) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await fn();
        
        // Log successful retry
        if (attempt > 1) {
          console.log(`[RETRY] Success on attempt ${attempt} for ${context.operation || 'operation'}`);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        // Check if we should retry this error
        if (!this.config.retryCondition(error)) {
          console.log(`[RETRY] Not retrying ${context.operation || 'operation'} - error not retryable:`, error.message);
          throw error;
        }
        
        // Check if we've exhausted retries
        if (attempt === this.config.maxRetries) {
          console.error(`[RETRY] Failed after ${attempt} attempts for ${context.operation || 'operation'}:`, error.message);
          throw error;
        }
        
        // Calculate delay and wait
        const delay = this.config.calculateDelay(attempt);
        console.log(`[RETRY] Attempt ${attempt} failed for ${context.operation || 'operation'}, retrying in ${delay}ms:`, error.message);
        
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Circuit breaker pattern implementation
 */
export class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute(fn, context = {}) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(`Circuit breaker is OPEN for ${context.operation || 'operation'}. Next attempt allowed at ${new Date(this.nextAttemptTime).toISOString()}`);
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      this.onSuccess(context);
      return result;
    } catch (error) {
      this.onFailure(error, context);
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  onSuccess(context) {
    this.failureCount = 0;
    this.state = 'CLOSED';
    console.log(`[CIRCUIT_BREAKER] Success for ${context.operation || 'operation'}, circuit breaker CLOSED`);
  }

  /**
   * Handle failed execution
   */
  onFailure(error, context) {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    console.log(`[CIRCUIT_BREAKER] Failure ${this.failureCount}/${this.failureThreshold} for ${context.operation || 'operation'}:`, error.message);
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.resetTimeout;
      console.error(`[CIRCUIT_BREAKER] Circuit breaker OPEN for ${context.operation || 'operation'} until ${new Date(this.nextAttemptTime).toISOString()}`);
    }
  }

  /**
   * Get current circuit breaker status
   */
  getStatus() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      isOpen: this.state === 'OPEN'
    };
  }
}

/**
 * Timeout wrapper for async operations
 */
export class TimeoutManager {
  constructor(defaultTimeout = 30000) {
    this.defaultTimeout = defaultTimeout;
  }

  /**
   * Execute function with timeout
   */
  async execute(fn, timeout = this.defaultTimeout, context = {}) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation timeout after ${timeout}ms for ${context.operation || 'operation'}`));
      }, timeout);

      try {
        const result = await fn();
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }
}

/**
 * Bulk operation manager for handling multiple operations
 */
export class BulkOperationManager {
  constructor(options = {}) {
    this.concurrency = options.concurrency || 5;
    this.retryConfig = options.retryConfig || {};
    this.circuitBreakerConfig = options.circuitBreakerConfig || {};
  }

  /**
   * Execute multiple operations with concurrency control
   */
  async executeBulk(operations, context = {}) {
    const results = [];
    const errors = [];
    
    // Process operations in batches
    for (let i = 0; i < operations.length; i += this.concurrency) {
      const batch = operations.slice(i, i + this.concurrency);
      
      const batchPromises = batch.map(async (operation, index) => {
        const retryManager = new RetryManager(this.retryConfig);
        const circuitBreaker = new CircuitBreaker(this.circuitBreakerConfig);
        
        try {
          const result = await retryManager.execute(
            () => circuitBreaker.execute(operation.fn, { ...context, operationIndex: i + index }),
            { ...context, operationIndex: i + index, operationName: operation.name }
          );
          
          return { success: true, result, index: i + index };
        } catch (error) {
          console.error(`[BULK_OPERATION] Failed operation ${i + index} (${operation.name}):`, error.message);
          return { success: false, error, index: i + index };
        }
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            results.push(result.value);
          } else {
            errors.push(result.value);
          }
        } else {
          errors.push({ success: false, error: result.reason, index: i + index });
        }
      });
    }
    
    return {
      results,
      errors,
      successCount: results.length,
      errorCount: errors.length,
      totalCount: operations.length
    };
  }
}

/**
 * Health check manager for monitoring external services
 */
export class HealthCheckManager {
  constructor() {
    this.checks = new Map();
    this.status = new Map();
  }

  /**
   * Register a health check
   */
  register(name, checkFn, options = {}) {
    this.checks.set(name, {
      fn: checkFn,
      interval: options.interval || 30000, // 30 seconds
      timeout: options.timeout || 5000, // 5 seconds
      retries: options.retries || 2
    });
  }

  /**
   * Start health monitoring
   */
  start() {
    this.checks.forEach((check, name) => {
      this.runHealthCheck(name);
      setInterval(() => this.runHealthCheck(name), check.interval);
    });
  }

  /**
   * Run a specific health check
   */
  async runHealthCheck(name) {
    const check = this.checks.get(name);
    if (!check) return;

    const timeoutManager = new TimeoutManager(check.timeout);
    const retryManager = new RetryManager({ maxRetries: check.retries });

    try {
      await retryManager.execute(
        () => timeoutManager.execute(check.fn, check.timeout, { operation: `health_check_${name}` }),
        { operation: `health_check_${name}` }
      );
      
      this.status.set(name, { status: 'healthy', lastCheck: new Date().toISOString() });
    } catch (error) {
      this.status.set(name, { 
        status: 'unhealthy', 
        lastCheck: new Date().toISOString(),
        error: error.message 
      });
      console.error(`[HEALTH_CHECK] ${name} is unhealthy:`, error.message);
    }
  }

  /**
   * Get overall health status
   */
  getStatus() {
    const checks = Array.from(this.status.entries()).map(([name, status]) => ({
      name,
      ...status
    }));

    const healthyCount = checks.filter(c => c.status === 'healthy').length;
    const totalCount = checks.length;

    return {
      overall: healthyCount === totalCount ? 'healthy' : 'degraded',
      healthyCount,
      totalCount,
      checks
    };
  }
}

// Singleton instances
let retryManager = null;
let circuitBreakers = new Map();
let healthCheckManager = null;

export function getRetryManager(config = {}) {
  if (!retryManager) {
    retryManager = new RetryManager(config);
  }
  return retryManager;
}

export function getCircuitBreaker(name, config = {}) {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker(config));
  }
  return circuitBreakers.get(name);
}

export function getHealthCheckManager() {
  if (!healthCheckManager) {
    healthCheckManager = new HealthCheckManager();
  }
  return healthCheckManager;
}

export default {
  RetryConfig,
  RetryManager,
  CircuitBreaker,
  TimeoutManager,
  BulkOperationManager,
  HealthCheckManager,
  getRetryManager,
  getCircuitBreaker,
  getHealthCheckManager
};





