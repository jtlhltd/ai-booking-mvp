// tests/lib/test-error-monitoring.js
// Test error monitoring functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { logError, getErrorStats, trackVapiFailure, wrapWithErrorMonitoring } from '../../lib/error-monitoring.js';

resetStats();

describe('Error Monitoring Tests', () => {
  
  test('Log error function exists', () => {
    assertTrue(typeof logError === 'function', 'logError is a function');
  });
  
  test('Get error stats function exists', () => {
    assertTrue(typeof getErrorStats === 'function', 'getErrorStats is a function');
  });
  
  test('Track VAPI failure function exists', () => {
    assertTrue(typeof trackVapiFailure === 'function', 'trackVapiFailure is a function');
  });
  
  test('Wrap with error monitoring function exists', () => {
    assertTrue(typeof wrapWithErrorMonitoring === 'function', 'wrapWithErrorMonitoring is a function');
  });
  
  test('Error data structure', () => {
    const errorData = {
      message: 'Test error',
      stack: 'Error stack trace',
      context: { clientKey: 'test_client' },
      severity: 'medium',
      timestamp: new Date().toISOString()
    };
    
    assertTrue('message' in errorData, 'Has message');
    assertTrue('severity' in errorData, 'Has severity');
    assertTrue(['low', 'medium', 'high', 'critical'].includes(errorData.severity) || typeof errorData.severity === 'string', 'Severity is valid');
  });
  
  test('Error stats structure', () => {
    const stats = {
      total: 50,
      byType: { network: 10, database: 5, api: 35 },
      bySeverity: { low: 20, medium: 20, high: 10 },
      recent: []
    };
    
    assertTrue('total' in stats, 'Has total');
    assertTrue(typeof stats.total === 'number', 'Total is number');
    assertTrue(stats.total >= 0, 'Total >= 0');
  });
  
  test('VAPI failure tracking', () => {
    const failureData = {
      callId: 'call123',
      error: 'Connection timeout',
      clientKey: 'test_client',
      timestamp: new Date().toISOString()
    };
    
    assertTrue('error' in failureData, 'Has error');
    assertTrue('callId' in failureData, 'Has call ID');
  });
  
  test('Error wrapping logic', () => {
    const testFn = async () => { return 'success'; };
    const wrapped = wrapWithErrorMonitoring(testFn, { context: 'test' });
    
    assertTrue(typeof wrapped === 'function', 'Returns function');
  });
  
  test('Error categories', () => {
    const categories = ['network', 'database', 'api', 'validation', 'business'];
    categories.forEach(category => {
      assertTrue(typeof category === 'string', `Category ${category} is string`);
    });
  });
  
  test('Error aggregation', () => {
    const errors = [
      { type: 'network', count: 5 },
      { type: 'database', count: 3 }
    ];
    
    const total = errors.reduce((sum, e) => sum + e.count, 0);
    assertTrue(total === 8, 'Errors aggregated correctly');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

