/**
 * Minimal Express app for integration tests (ops routes + /api/stats stub with rate limit).
 * Loads routes/ops.js only after db is initialized in the test file.
 */
import { expect } from '@jest/globals';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { cacheMiddleware } from '../../lib/cache.js';

export async function createOpsIntegrationApp() {
  const { default: opsRouter } = await import('../../routes/ops.js');
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 60,
      standardHeaders: true,
      legacyHeaders: false
    })
  );
  app.use(opsRouter);
  app.get('/api/stats', cacheMiddleware({ ttl: 60000 }), (req, res) => {
    res.json({ ok: true, stub: true });
  });
  return app;
}

/** express-rate-limit v7 uses RateLimit-*; older stacks used X-RateLimit-*. */
export function expectRateLimitStyleHeaders(res) {
  const h = res.headers;
  const keys = Object.keys(h);
  const has = (sub) => keys.some((k) => k.toLowerCase().includes(sub));
  const ok =
    (has('ratelimit-limit') && has('ratelimit-remaining') && has('ratelimit-reset')) ||
    (has('x-ratelimit-limit') && has('x-ratelimit-remaining') && has('x-ratelimit-reset'));
  expect(ok).toBe(true);
}
