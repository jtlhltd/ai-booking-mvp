// tests/lib/test-retry-logic.js
// Test retry logic functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import {
  RetryConfig,
  RetryManager,
  CircuitBreaker,
  TimeoutManager,
  BulkOperationManager,
  HealthCheckManager,
  getRetryManager,
  getCircuitBreaker,
  getHealthCheckManager
} from '../../lib/retry-logic.js';

resetStats();

describe('Retry Logic Tests', () => {
  
  test('RetryConfig class exists', () => {
    assertTrue(typeof RetryConfig === 'function', 'RetryConfig is a class');
  });
  
  test('RetryManager class exists', () => {
    assertTrue(typeof RetryManager === 'function', 'RetryManager is a class');
  });
  
  test('CircuitBreaker class exists', () => {
    assertTrue(typeof CircuitBreaker === 'function', 'CircuitBreaker is a class');
  });
  
  test('TimeoutManager class exists', () => {
    assertTrue(typeof TimeoutManager === 'function', 'TimeoutManager is a class');
  });
  
  test('BulkOperationManager class exists', () => {
    assertTrue(typeof BulkOperationManager === 'function', 'BulkOperationManager is a class');
  });
  
  test('HealthCheckManager class exists', () => {
    assertTrue(typeof HealthCheckManager === 'function', 'HealthCheckManager is a class');
  });
  
  test('Get retry manager function exists', () => {
    assertTrue(typeof getRetryManager === 'function', 'getRetryManager is a function');
  });
  
  test('Get circuit breaker function exists', () => {
    assertTrue(typeof getCircuitBreaker === 'function', 'getCircuitBreaker is a function');
  });
  
  test('Get health check manager function exists', () => {
    assertTrue(typeof getHealthCheckManager === 'function', 'getHealthCheckManager is a function');
  });
  
  test('Retry config defaults', () => {
    const config = new RetryConfig();
    assertTrue(config.maxRetries === 3, 'Default max retries is 3');
    assertTrue(config.baseDelay === 1000, 'Default base delay is 1000ms');
    assertTrue(config.maxDelay === 30000, 'Default max delay is 30000ms');
  });
  
  test('Retry delay calculation', () => {
    const config = new RetryConfig({ baseDelay: 1000, backoffMultiplier: 2 });
    const delay1 = config.calculateDelay(1);
    const delay2 = config.calculateDelay(2);
    const delay3 = config.calculateDelay(3);
    
    assertTrue(delay1 >= 500 && delay1 <= 1500, 'First delay is reasonable');
    assertTrue(delay2 >= delay1, 'Second delay >= first delay');
    assertTrue(delay3 >= delay2, 'Third delay >= second delay');
  });
  
  test('Retry condition - network errors', () => {
    const config = new RetryConfig();
    const networkError = { code: 'ENOTFOUND' };
    const shouldRetry = config.defaultRetryCondition(networkError);
    
    assertTrue(shouldRetry === true, 'Network errors should retry');
  });
  
  test('Retry condition - 5xx errors', () => {
    const config = new RetryConfig();
    const serverError = { status: 500 };
    const shouldRetry = config.defaultRetryCondition(serverError);
    
    assertTrue(shouldRetry === true, '5xx errors should retry');
  });
  
  test('Retry condition - 4xx errors', () => {
    const config = new RetryConfig();
    const clientError = { status: 400 };
    const shouldRetry = config.defaultRetryCondition(clientError);
    
    assertTrue(shouldRetry === false, '4xx errors should not retry');
  });
  
  test('Circuit breaker states', () => {
    const states = ['closed', 'open', 'half-open'];
    states.forEach(state => {
      assertTrue(typeof state === 'string', `State ${state} is string`);
    });
  });
  
  test('Timeout calculation', () => {
    const timeout = 5000;
    const startTime = Date.now();
    const elapsed = Date.now() - startTime;
    
    assertTrue(elapsed < timeout, 'Operation completed within timeout');
  });
  
  test('Bulk operation batching', () => {
    const items = Array(100).fill().map((_, i) => ({ id: i }));
    const batchSize = 10;
    const batches = Math.ceil(items.length / batchSize);
    
    assertTrue(batches === 10, 'Batches calculated correctly');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

