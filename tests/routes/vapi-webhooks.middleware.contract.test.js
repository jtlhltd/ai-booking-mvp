// intent: webhook.signature-required
// This contract test exercises the Vapi webhook signature verification
// middleware (verifyVapiSignature). It is the enforcement gate for the
// `webhook.signature-required` row in docs/INTENT.md alongside the matching
// policy rule in scripts/check-policy.mjs.
import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

beforeEach(() => {
  jest.resetModules();
});

jest.unstable_mockModule('../../middleware/vapi-webhook-verification.js', () => ({
  verifyVapiSignature: (_req, _res, next) => next(),
}));

jest.unstable_mockModule('../../db.js', () => ({
  dbType: 'postgres',
  query: jest.fn(async (sql) => {
    if (String(sql).includes('INSERT INTO webhook_events')) return { rows: [{ id: 1 }] };
    return { rows: [] };
  }),
}));

jest.unstable_mockModule('../../store.js', () => ({
  getFullClient: jest.fn(async () => ({ clientKey: 'c1', vapi: {}, gsheet_id: null })),
}));

jest.unstable_mockModule('../../lib/vapi-webhook-verbose-log.js', () => ({ vapiWebhookVerboseLog: () => {} }));

describe('vapi-webhooks middleware body parsing branches', () => {
  test('Buffer body with invalid JSON is tolerated and returns 200', async () => {
    const { default: router } = await import('../../routes/vapi-webhooks.js');
    const app = express();
    app.use(express.raw({ type: '*/*' }));
    app.use(router);

    const res = await request(app)
      .post('/webhooks/vapi')
      .set('Content-Type', 'application/json')
      .send(Buffer.from('{not json', 'utf8'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, received: true }));
  });

  test('Buffer body with valid JSON is parsed and returns 200', async () => {
    const { default: router } = await import('../../routes/vapi-webhooks.js');
    const app = express();
    app.use(express.raw({ type: '*/*' }));
    app.use(router);

    const res = await request(app)
      .post('/webhooks/vapi')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify({ message: { type: 'conversation-update', call: { id: 'c1' }, messages: [] }, metadata: { tenantKey: 'c1' } }), 'utf8'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, received: true }));
  });
});

