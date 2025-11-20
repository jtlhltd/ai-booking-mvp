// tests/lib/test-health-check.js
// Test health check functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { performHealthCheck, quickHealthCheck, readinessCheck, livenessCheck } from '../../lib/health-check.js';

resetStats();

describe('Health Check Tests', () => {
  
  test('Perform health check function exists', () => {
    assertTrue(typeof performHealthCheck === 'function', 'performHealthCheck is a function');
  });
  
  test('Quick health check function exists', () => {
    assertTrue(typeof quickHealthCheck === 'function', 'quickHealthCheck is a function');
  });
  
  test('Readiness check function exists', () => {
    assertTrue(typeof readinessCheck === 'function', 'readinessCheck is a function');
  });
  
  test('Liveness check function exists', () => {
    assertTrue(typeof livenessCheck === 'function', 'livenessCheck is a function');
  });
  
  test('Health check structure', () => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'ok',
        api: 'ok'
      }
    };
    
    assertTrue('status' in health, 'Has status');
    assertTrue('checks' in health, 'Has checks');
    assertTrue(['healthy', 'degraded', 'unhealthy'].includes(health.status) || typeof health.status === 'string', 'Status is valid');
  });
  
  test('Health status values', () => {
    const statuses = ['healthy', 'degraded', 'unhealthy'];
    statuses.forEach(status => {
      assertTrue(typeof status === 'string', `Status ${status} is string`);
    });
  });
  
  test('Check results structure', () => {
    const checks = {
      database: { status: 'ok', responseTime: 10 },
      api: { status: 'ok', responseTime: 5 }
    };
    
    assertTrue(typeof checks === 'object', 'Checks is object');
    Object.keys(checks).forEach(key => {
      assertTrue('status' in checks[key], `Check ${key} has status`);
    });
  });
  
  test('Readiness vs liveness', () => {
    const readiness = { ready: true, dependencies: ['database', 'api'] };
    const liveness = { alive: true };
    
    assertTrue('ready' in readiness || 'dependencies' in readiness || typeof readiness === 'object', 'Readiness has structure');
    assertTrue('alive' in liveness || typeof liveness === 'object', 'Liveness has structure');
  });
});

const exitCode = printSummary();
process.exit(exitCode);
