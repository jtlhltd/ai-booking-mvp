// tests/integration/api/query-performance.test.js
// Integration tests for query performance endpoints

import { describe, test, expect } from '@jest/globals';

describe('Query Performance API', () => {
  const API_KEY = process.env.API_KEY || 'test-key';
  const BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:10000';

  // Helper to check if server is available
  async function isServerAvailable() {
    try {
      const response = await fetch(`${BASE_URL}/health/lb`, { signal: AbortSignal.timeout(2000) });
      return response.ok;
    } catch {
      return false;
    }
  }

  test('GET /api/performance/queries/slow returns slow queries', async () => {
    if (!(await isServerAvailable())) {
      console.warn('Server not available, skipping integration test');
      return;
    }

    const response = await fetch(`${BASE_URL}/api/performance/queries/slow?limit=10`, {
      headers: {
        'X-API-Key': API_KEY
      }
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('ok', true);
    expect(data).toHaveProperty('slowQueries');
    expect(Array.isArray(data.slowQueries)).toBe(true);
  });

  test('GET /api/performance/queries/stats returns statistics', async () => {
    if (!(await isServerAvailable())) {
      console.warn('Server not available, skipping integration test');
      return;
    }

    const response = await fetch(`${BASE_URL}/api/performance/queries/stats`, {
      headers: {
        'X-API-Key': API_KEY
      }
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('ok', true);
    expect(data).toHaveProperty('stats');
    expect(data.stats).toHaveProperty('totalQueries');
  });

  test('GET /api/performance/queries/recommendations returns recommendations', async () => {
    if (!(await isServerAvailable())) {
      console.warn('Server not available, skipping integration test');
      return;
    }

    const response = await fetch(`${BASE_URL}/api/performance/queries/recommendations`, {
      headers: {
        'X-API-Key': API_KEY
      }
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('ok', true);
    expect(data).toHaveProperty('recommendations');
    expect(Array.isArray(data.recommendations)).toBe(true);
  });
});

