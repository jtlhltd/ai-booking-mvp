import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

beforeEach(() => {
  jest.resetModules();
});

jest.unstable_mockModule('../../gcal.js', () => ({
  makeJwtAuth: jest.fn(() => ({ authorize: jest.fn(async () => {}) })),
  insertEvent: jest.fn(async () => ({})),
  freeBusy: jest.fn(async () => [])
}));

async function appFor(deps) {
  const { handleGcalPing } = await import('../../lib/gcal-ping.js');
  const app = express();
  app.get('/gcal/ping', (req, res) => handleGcalPing(req, res, deps));
  return app;
}

describe('lib/gcal-ping', () => {
  test('400 when google creds missing', async () => {
    const app = await appFor({
      getGoogleCredentials: () => ({ clientEmail: '', privateKey: '', privateKeyB64: '' })
    });
    const res = await request(app).get('/gcal/ping').expect(400);
    expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'Google env missing' }));
  });

  test('200 when authorize succeeds', async () => {
    const app = await appFor({
      getGoogleCredentials: () => ({ clientEmail: 'svc@example.com', privateKey: 'k', privateKeyB64: '' })
    });
    await request(app).get('/gcal/ping').expect(200);
  });
});

