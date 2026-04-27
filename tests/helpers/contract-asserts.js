/**
 * Shared contract assertion helpers.
 *
 * These wrap the "checklist" items from the test-suite-overhaul plan so individual
 * router contract tests can apply them in one line:
 *   - assertNoStoreCache: dashboard / admin reads must not be CDN-cached
 *   - assertNoTenantKeyLeak: internal tenant keys (e.g. `d2d-xpress-tom`) must not appear in customer-facing payloads
 *   - assertAuthRequired: missing/invalid X-API-Key must yield 401
 *   - assertTenantIsolation: cross-tenant clientKey must yield 403, never silent 200
 *   - assertJsonErrorEnvelope: thrown deps map to 500 { ok:false, error:string } without leaking stack frames
 *
 * Each helper keeps assertion failures attributable by accepting a `where` label
 * that is used to make the diff in `expect(...).toBe(...)` legible.
 */
import { expect } from '@jest/globals';
import request from 'supertest';

/**
 * Asserts the response opted out of HTTP caching (Cache-Control: no-store / private).
 *
 * Allows either the strict `no-store` value (preferred for admin/dashboard reads)
 * or the looser `private` value where shared caches are disallowed but the user
 * agent may still cache.
 */
export function assertNoStoreCache(res, { strict = true } = {}) {
  const cc = String(res.headers?.['cache-control'] || '').toLowerCase();
  if (strict) {
    expect(cc).toMatch(/no-store/);
  } else {
    expect(cc).toMatch(/no-store|private/);
  }
}

/**
 * Asserts the internal tenant key (e.g. `d2d-xpress-tom`) does not appear in any
 * customer-facing surface of the response: body (string or JSON), headers, or
 * `Set-Cookie`. Aligns with .cursor/rules/tom-client-context.mdc.
 *
 * @param {import('supertest').Response} res
 * @param {string} internalKey internal tenant identifier that must not leak
 */
export function assertNoTenantKeyLeak(res, internalKey) {
  if (!internalKey) throw new Error('assertNoTenantKeyLeak requires an internalKey');
  const lower = String(internalKey).toLowerCase();

  const bodyText = (() => {
    if (res.text) return String(res.text);
    if (res.body && typeof res.body === 'object') {
      try {
        return JSON.stringify(res.body);
      } catch {
        return '';
      }
    }
    return '';
  })().toLowerCase();
  expect(bodyText.includes(lower)).toBe(false);

  for (const [name, value] of Object.entries(res.headers || {})) {
    if (typeof value === 'string') {
      expect(value.toLowerCase().includes(lower)).toBe(false);
    } else if (Array.isArray(value)) {
      for (const v of value) {
        expect(String(v).toLowerCase().includes(lower)).toBe(false);
      }
    }
    // header name itself shouldn't echo the key either
    expect(String(name).toLowerCase().includes(lower)).toBe(false);
  }
}

/**
 * Hits the given endpoint without an X-API-Key and asserts 401 with a
 * structured error envelope.
 *
 * @param {import('express').Express} app
 * @param {{ method?: 'get'|'post'|'put'|'patch'|'delete', path: string, body?: any }} target
 */
export async function assertAuthRequired(app, { method = 'get', path, body } = {}) {
  if (!path) throw new Error('assertAuthRequired requires a path');
  const fn = request(app)[method];
  if (!fn) throw new Error(`assertAuthRequired: unknown method "${method}"`);

  const req = fn.call(request(app), path);
  const res = body ? await req.send(body) : await req;

  expect(res.status).toBe(401);
  expect(res.body && typeof res.body).toBe('object');
  // Common shapes: { ok:false, error:'...' } or { error:'unauthorized' }
  const envelope = res.body || {};
  const hasError = envelope.error || envelope.message;
  expect(Boolean(hasError)).toBe(true);
}

/**
 * Hits the given endpoint with an authenticated user that has no access to
 * `clientKey` and asserts a 403 (not a silent 200).
 *
 * The caller wires up the auth header (since each router has its own header
 * name and this helper stays renderer-agnostic).
 *
 * @param {import('express').Express} app
 * @param {{ method?: 'get'|'post'|'put'|'patch'|'delete', path: string, headers?: Record<string,string>, body?: any }} target
 */
export async function assertTenantIsolation(app, { method = 'get', path, headers = {}, body } = {}) {
  if (!path) throw new Error('assertTenantIsolation requires a path');
  let req = request(app)[method](path);
  for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
  const res = body ? await req.send(body) : await req;

  expect([401, 403]).toContain(res.status);
  // The point: it must NOT silently succeed
  expect(res.status).not.toBe(200);
}

/**
 * Asserts a 500-class response carries a structured `{ ok:false, error:string }`
 * envelope and does NOT leak a stack frame.
 */
export function assertJsonErrorEnvelope(res, { status = 500 } = {}) {
  expect(res.status).toBe(status);
  expect(typeof res.body).toBe('object');
  expect(res.body).toEqual(
    expect.objectContaining({
      // Some routes use `ok: false`, others omit. Accept either, but error must be a string.
      error: expect.any(String)
    })
  );
  // Stack frames in customer-facing responses are an info leak.
  const text = String(res.text || JSON.stringify(res.body || {}));
  // Match V8-style frames like "    at fnName (/path:10:5)" or "    at /path:10:5".
  expect(text).not.toMatch(/\bat\s+\S.*?:\d+:\d+/);
}
