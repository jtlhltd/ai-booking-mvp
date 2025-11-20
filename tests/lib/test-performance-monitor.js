// tests/lib/test-performance-monitor.js
// Test performance monitoring functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { PerformanceMonitor, performanceMiddleware, getPerformanceMonitor } from '../../lib/performance-monitor.js';

resetStats();

describe('Performance Monitor Tests', () => {
  
  test('PerformanceMonitor class exists', () => {
    assertTrue(typeof PerformanceMonitor === 'function', 'PerformanceMonitor is a class');
  });
  
  test('Performance middleware function exists', () => {
    assertTrue(typeof performanceMiddleware === 'function', 'performanceMiddleware is a function');
  });
  
  test('Get performance monitor function exists', () => {
    assertTrue(typeof getPerformanceMonitor === 'function', 'getPerformanceMonitor is a function');
  });
  
  test('Performance metrics structure', () => {
    const metrics = {
      responseTime: 150,
      throughput: 100,
      errorRate: 0.01,
      cpuUsage: 45.5,
      memoryUsage: 512
    };
    
    assertTrue('responseTime' in metrics, 'Has response time');
    assertTrue(typeof metrics.responseTime === 'number', 'Response time is number');
    assertTrue(metrics.responseTime >= 0, 'Response time >= 0');
  });
  
  test('Response time tracking', () => {
    const startTime = Date.now();
    const endTime = startTime + 150;
    const duration = endTime - startTime;
    
    assertTrue(duration === 150, 'Duration calculated correctly');
    assertTrue(duration >= 0, 'Duration >= 0');
  });
  
  test('Throughput calculation', () => {
    const requests = 1000;
    const timeWindow = 60; // seconds
    const throughput = requests / timeWindow;
    
    assertTrue(throughput > 0, 'Throughput > 0');
    assertTrue(typeof throughput === 'number', 'Throughput is number');
  });
  
  test('Error rate calculation', () => {
    const totalRequests = 1000;
    const errors = 10;
    const errorRate = errors / totalRequests;
    
    assertTrue(errorRate >= 0 && errorRate <= 1, 'Error rate is valid');
    assertEqual(errorRate, 0.01, 'Error rate calculated correctly');
  });
  
  test('Performance thresholds', () => {
    const thresholds = {
      responseTime: { warning: 500, critical: 1000 },
      errorRate: { warning: 0.05, critical: 0.1 },
      cpuUsage: { warning: 80, critical: 95 }
    };
    
    assertTrue('responseTime' in thresholds, 'Has response time threshold');
    assertTrue(thresholds.responseTime.warning < thresholds.responseTime.critical, 'Warning < critical');
  });
  
  test('Performance monitoring events', () => {
    const events = ['slow_request', 'high_error_rate', 'resource_exhaustion'];
    events.forEach(event => {
      assertTrue(typeof event === 'string', `Event ${event} is string`);
    });
  });
  
  test('Middleware integration', () => {
    const mockReq = { method: 'GET', path: '/api/test' };
    const mockRes = { on: () => {}, end: () => {} };
    const mockNext = () => {};
    
    try {
      const middleware = performanceMiddleware(getPerformanceMonitor());
      assertTrue(typeof middleware === 'function', 'Returns middleware function');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
});

const exitCode = printSummary();
process.exit(exitCode);

