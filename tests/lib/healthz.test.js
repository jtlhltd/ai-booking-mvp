import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

beforeEach(() => {
  jest.resetModules();
});

async function appFor(deps) {
  const { handleHealthz } = await import('../../lib/healthz.js');
  const app = express();
  app.get('/healthz', (req, res) => handleHealthz(req, res, deps));
  return app;
}

describe('lib/healthz', () => {
  test('200 with tenant list', async () => {
    const app = await appFor({
      listFullClients: async () => [{ clientKey: 'c1' }, { clientKey: 'c2' }],
      getIntegrationFlags: () => ({ gcalConfigured: false, smsConfigured: true, corsOrigin: 'any', dbPath: 'x' })
    });
    const res = await request(app).get('/healthz').expect(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, tenants: ['c1', 'c2'] }));
  });

  test('500 when listFullClients throws', async () => {
    const app = await appFor({
      listFullClients: async () => {
        throw new Error('db_down');
      },
      getIntegrationFlags: () => ({ gcalConfigured: false, smsConfigured: false, corsOrigin: 'any', dbPath: 'x' })
    });
    await request(app).get('/healthz').expect(500);
  });
});

