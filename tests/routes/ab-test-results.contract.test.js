import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

describe('routes/ab-test-results', () => {
  test('GET /api/ab-test-results/:clientKey returns ok:true with results', async () => {
    jest.unstable_mockModule('../../lib/ab-testing.js', () => ({
      getABTestResults: jest.fn(async () => ({ winner: 'a' }))
    }));
    const { createAbTestResultsRouter } = await import('../../routes/ab-test-results.js');
    const router = createAbTestResultsRouter();
    const app = createContractApp({ mounts: [{ path: '/api', router }] });

    const res = await request(app).get('/api/ab-test-results/c1').expect(200);
    expect(res.body).toEqual({ ok: true, winner: 'a' });
  });

  test('GET /api/ab-test-results/:clientKey returns 500 on error', async () => {
    jest.unstable_mockModule('../../lib/ab-testing.js', () => ({
      getABTestResults: jest.fn(async () => {
        throw new Error('boom');
      })
    }));
    const { createAbTestResultsRouter } = await import('../../routes/ab-test-results.js');
    const router = createAbTestResultsRouter();
    const app = createContractApp({ mounts: [{ path: '/api', router }] });

    await request(app).get('/api/ab-test-results/c1').expect(500);
  });
});

