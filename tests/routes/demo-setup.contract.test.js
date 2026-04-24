import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

describe('routes/demo-setup.js contracts', () => {
  test('GET /check-db returns tenants list', async () => {
    jest.unstable_mockModule('../../db.js', () => ({
      query: jest.fn(async () => ({ rows: [{ client_key: 'c1' }] }))
    }));
    const { default: router } = await import('../../routes/demo-setup.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).get('/check-db').expect(200);
    expect(res.body).toEqual(expect.objectContaining({ success: true, tenants: [{ client_key: 'c1' }] }));
  });

  test('GET /check-db returns 500 when db throws', async () => {
    jest.unstable_mockModule('../../db.js', () => ({
      query: jest.fn(async () => {
        throw new Error('db_down');
      })
    }));
    const { default: router } = await import('../../routes/demo-setup.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).get('/check-db').expect(500);
    expect(res.body).toEqual(expect.objectContaining({ success: false, error: 'db_down' }));
  });
});

