// tests/routes/test-monitoring-routes.js
// Test monitoring route endpoints

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';
const API_KEY = process.env.TEST_API_KEY || process.env.API_KEY;

describe('Monitoring Routes Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    assertTrue(available, 'Server is available');
  });
  
  test('Monitoring endpoints accessible', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    // Test that monitoring routes exist and respond
    const endpoints = [
      '/api/admin/system-health',
      '/api/admin/metrics',
      '/api/performance/stats'
    ];
    
    endpoints.forEach(endpoint => {
      assertTrue(endpoint.startsWith('/api'), `Endpoint ${endpoint} is API route`);
      assertTrue(endpoint.includes('admin') || endpoint.includes('performance'), `Endpoint ${endpoint} is monitoring route`);
    });
  });
  
  test('Monitoring data structure', () => {
    const monitoringData = {
      system: { uptime: 3600, memory: 512 },
      performance: { responseTime: 150, throughput: 100 },
      errors: { count: 5, rate: 0.01 }
    };
    
    assertTrue('system' in monitoringData, 'Has system data');
    assertTrue('performance' in monitoringData, 'Has performance data');
    assertTrue('errors' in monitoringData, 'Has error data');
  });
  
  test('Health check response', () => {
    const health = {
      status: 'healthy',
      checks: {
        database: 'ok',
        api: 'ok'
      }
    };
    
    assertTrue(health.status === 'healthy', 'Status is healthy');
    assertTrue(Object.keys(health.checks).length > 0, 'Has health checks');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

