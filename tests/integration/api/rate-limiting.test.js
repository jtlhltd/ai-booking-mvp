// tests/integration/api/rate-limiting.test.js
// Integration tests for rate limiting

import { describe, test, expect } from '@jest/globals';

describe('Rate Limiting API', () => {
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

  test('GET /api/rate-limit/status returns rate limit status', async () => {
    if (!(await isServerAvailable())) {
      console.warn('Server not available, skipping integration test');
      return;
    }

    const response = await fetch(`${BASE_URL}/api/rate-limit/status`, {
      headers: {
        'X-API-Key': API_KEY
      }
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('ok', true);
    expect(data).toHaveProperty('identifier');
    expect(data).toHaveProperty('limits');
    expect(data).toHaveProperty('systemStats');
  });

  test('Rate limit headers are present in responses', async () => {
    if (!(await isServerAvailable())) {
      console.warn('Server not available, skipping integration test');
      return;
    }

    const response = await fetch(`${BASE_URL}/api/stats?clientKey=test`, {
      headers: {
        'X-API-Key': API_KEY
      }
    });

    expect(response.headers.has('X-RateLimit-Limit')).toBe(true);
    expect(response.headers.has('X-RateLimit-Remaining')).toBe(true);
    expect(response.headers.has('X-RateLimit-Reset')).toBe(true);
  });
});

