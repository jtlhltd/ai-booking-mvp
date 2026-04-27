import { describe, expect, test } from '@jest/globals';
import express from 'express';
import {
  assertAuthRequired,
  assertJsonErrorEnvelope,
  assertNoStoreCache,
  assertNoTenantKeyLeak,
  assertTenantIsolation
} from './contract-asserts.js';

function makeApp(handler) {
  const app = express();
  app.use(express.json());
  app.use('/x', handler);
  return app;
}

describe('contract-asserts', () => {
  test('assertNoStoreCache passes when Cache-Control: no-store', () => {
    const res = { headers: { 'cache-control': 'no-store' } };
    expect(() => assertNoStoreCache(res)).not.toThrow();
  });

  test('assertNoStoreCache fails when Cache-Control absent', () => {
    expect(() => assertNoStoreCache({ headers: {} })).toThrow();
  });

  test('assertNoTenantKeyLeak fails when internal key appears in body', () => {
    const res = {
      headers: { 'content-type': 'application/json' },
      body: { tenantKey: 'd2d-xpress-tom', name: 'Tom' }
    };
    expect(() => assertNoTenantKeyLeak(res, 'd2d-xpress-tom')).toThrow();
  });

  test('assertNoTenantKeyLeak passes when internal key absent everywhere', () => {
    const res = {
      headers: { 'content-type': 'application/json' },
      body: { displayName: 'D2D Xpress' }
    };
    expect(() => assertNoTenantKeyLeak(res, 'd2d-xpress-tom')).not.toThrow();
  });

  test('assertJsonErrorEnvelope fails when stack frames leak through res.text', () => {
    const res = {
      status: 500,
      body: { error: 'boom' },
      text: 'Error: boom\n    at thrower (/app/lib/foo.js:10:5)\n'
    };
    expect(() => assertJsonErrorEnvelope(res)).toThrow();
  });

  test('assertJsonErrorEnvelope passes for clean envelope', () => {
    const res = { status: 500, body: { ok: false, error: 'boom' }, text: '' };
    expect(() => assertJsonErrorEnvelope(res)).not.toThrow();
  });

  test('assertAuthRequired works against express handler', async () => {
    const app = makeApp((_req, res) => res.status(401).json({ error: 'unauthorized' }));
    await assertAuthRequired(app, { method: 'get', path: '/x' });
  });

  test('assertTenantIsolation works for a 403 handler', async () => {
    const app = makeApp((_req, res) => res.status(403).json({ error: 'forbidden' }));
    await assertTenantIsolation(app, {
      method: 'get',
      path: '/x',
      headers: { 'X-API-Key': 'valid-but-wrong-tenant' }
    });
  });

  test('assertTenantIsolation fails when route silently 200s', async () => {
    const app = makeApp((_req, res) => res.status(200).json({ ok: true }));
    await expect(
      assertTenantIsolation(app, { method: 'get', path: '/x' })
    ).rejects.toThrow();
  });
});
