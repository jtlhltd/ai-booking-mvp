// tests/unit/test-retry-logic.js
// Test retry logic

import { RetryManager } from '../../lib/retry-logic.js';
import { describe, test, assertEqual, assertTrue, assertThrows, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Retry Logic Tests', () => {
  
  test('Retry on failure', async () => {
    const retryManager = new RetryManager({ maxRetries: 3, baseDelay: 10 });
    let attemptCount = 0;
    
    const result = await retryManager.execute(async () => {
      attemptCount++;
      if (attemptCount < 2) {
        throw new Error('Temporary failure');
      }
      return 'success';
    }, { operation: 'test' });
    
    assertEqual(result, 'success', 'Retry succeeded');
    assertEqual(attemptCount, 2, 'Retried correct number of times');
  });
  
  test('Retry exhausts after max retries', async () => {
    const retryManager = new RetryManager({ maxRetries: 2, baseDelay: 10 });
    
    await assertThrows(async () => {
      await retryManager.execute(async () => {
        throw new Error('Persistent failure');
      }, { operation: 'test' });
    }, Error, 'Retry exhausts after max attempts');
  });
  
  test('No retry on success', async () => {
    const retryManager = new RetryManager({ maxRetries: 3, baseDelay: 10 });
    let attemptCount = 0;
    
    const result = await retryManager.execute(async () => {
      attemptCount++;
      return 'success';
    }, { operation: 'test' });
    
    assertEqual(result, 'success', 'Success returned');
    assertEqual(attemptCount, 1, 'No retry on success');
  });
  
  test('Exponential backoff', () => {
    const retryManager = new RetryManager({ maxRetries: 3, baseDelay: 100 });
    const config = retryManager.config;
    
    const delay1 = config.calculateDelay(1);
    const delay2 = config.calculateDelay(2);
    const delay3 = config.calculateDelay(3);
    
    assertTrue(delay2 > delay1, 'Delay increases with attempts');
    assertTrue(delay3 > delay2, 'Delay continues to increase');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

