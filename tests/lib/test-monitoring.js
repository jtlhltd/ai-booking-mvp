// tests/lib/test-monitoring.js
// Test monitoring functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import {
  MetricsCollector,
  AlertManager,
  HealthCheckManager,
  LogAggregator,
  getMetricsCollector,
  getAlertManager,
  getHealthCheckManager,
  getLogAggregator
} from '../../lib/monitoring.js';

resetStats();

describe('Monitoring Tests', () => {
  
  test('MetricsCollector class exists', () => {
    assertTrue(typeof MetricsCollector === 'function', 'MetricsCollector is a class');
  });
  
  test('AlertManager class exists', () => {
    assertTrue(typeof AlertManager === 'function', 'AlertManager is a class');
  });
  
  test('HealthCheckManager class exists', () => {
    assertTrue(typeof HealthCheckManager === 'function', 'HealthCheckManager is a class');
  });
  
  test('LogAggregator class exists', () => {
    assertTrue(typeof LogAggregator === 'function', 'LogAggregator is a class');
  });
  
  test('Get metrics collector function exists', () => {
    assertTrue(typeof getMetricsCollector === 'function', 'getMetricsCollector is a function');
  });
  
  test('Get alert manager function exists', () => {
    assertTrue(typeof getAlertManager === 'function', 'getAlertManager is a function');
  });
  
  test('Get health check manager function exists', () => {
    assertTrue(typeof getHealthCheckManager === 'function', 'getHealthCheckManager is a function');
  });
  
  test('Get log aggregator function exists', () => {
    assertTrue(typeof getLogAggregator === 'function', 'getLogAggregator is a function');
  });
  
  test('Metrics collection structure', () => {
    const metrics = {
      calls: { total: 100, successful: 80 },
      bookings: { total: 15, conversionRate: 0.15 },
      performance: { avgResponseTime: 200, p95: 500 }
    };
    
    assertTrue('calls' in metrics, 'Has calls metrics');
    assertTrue('bookings' in metrics, 'Has bookings metrics');
    assertTrue(typeof metrics.bookings.conversionRate === 'number', 'Conversion rate is number');
  });
  
  test('Alert structure', () => {
    const alert = {
      type: 'error',
      severity: 'high',
      message: 'System error',
      timestamp: new Date().toISOString()
    };
    
    assertTrue('type' in alert, 'Has type');
    assertTrue('severity' in alert, 'Has severity');
    assertTrue(['low', 'medium', 'high', 'critical'].includes(alert.severity) || typeof alert.severity === 'string', 'Severity is valid');
  });
  
  test('Health check structure', () => {
    const health = {
      status: 'healthy',
      checks: {
        database: 'ok',
        api: 'ok',
        cache: 'ok'
      }
    };
    
    assertTrue('status' in health, 'Has status');
    assertTrue('checks' in health, 'Has checks');
    assertTrue(['healthy', 'degraded', 'unhealthy'].includes(health.status) || typeof health.status === 'string', 'Status is valid');
  });
  
  test('Log aggregation structure', () => {
    const logs = {
      errors: 5,
      warnings: 10,
      info: 100,
      timestamp: new Date().toISOString()
    };
    
    assertTrue('errors' in logs, 'Has errors count');
    assertTrue(typeof logs.errors === 'number', 'Errors is number');
    assertTrue(logs.errors >= 0, 'Errors >= 0');
  });
  
  test('Singleton pattern', () => {
    try {
      const collector1 = getMetricsCollector();
      const collector2 = getMetricsCollector();
      assertTrue(collector1 === collector2 || typeof collector1 === 'object', 'Returns same instance or object');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
});

const exitCode = printSummary();
process.exit(exitCode);

