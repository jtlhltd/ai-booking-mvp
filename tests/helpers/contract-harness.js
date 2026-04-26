/**
 * Contract test harness helpers.
 *
 * Goal: make it easy to mount routers and run Supertest requests without
 * spinning up the full `server.js` (which has lots of inline routes and side effects).
 */
import express from 'express';

export async function withEnv(env, fn) {
  const prev = {};
  for (const k of Object.keys(env)) {
    prev[k] = process.env[k];
    const v = env[k];
    if (v === undefined || v === null) delete process.env[k];
    else process.env[k] = String(v);
  }
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(env)) {
      const v = prev[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/**
 * Wrap a callback in a safe "env + module isolation" pattern used by many contract tests.
 *
 * Note: Jest ESM mocking requires module isolation patterns like `jest.resetModules()`
 * before dynamic imports. We keep this helper here (rather than global setup) so tests
 * can opt into isolation only when they need it.
 */
export async function withIsolatedModulesAndEnv(jest, env, fn) {
  if (jest?.resetModules) jest.resetModules();
  return await withEnv(env, fn);
}

/**
 * Some modules schedule timers on import. For "import smoke" contracts, disable timers
 * during the import window to avoid leaked handles, then restore immediately.
 */
export async function withDisabledTimersOnImport(fn) {
  const realSetInterval = global.setInterval;
  const realSetTimeout = global.setTimeout;
  // eslint-disable-next-line no-global-assign
  global.setInterval = () => 0;
  // eslint-disable-next-line no-global-assign
  global.setTimeout = () => 0;
  try {
    return await fn();
  } finally {
    global.setInterval = realSetInterval;
    global.setTimeout = realSetTimeout;
  }
}

/**
 * Create a minimal Express app and mount routers.
 *
 * mounts: [{ path: string, router: express.Router | function returning router }]
 */
export function createContractApp({ mounts = [], json = true } = {}) {
  const app = express();
  app.set('trust proxy', 1);
  if (json) app.use(express.json({ limit: '10mb' }));

  for (const m of mounts) {
    const path = m.path ?? '/';
    // Express Router objects are callable functions with a `.stack` property.
    // Only call `m.router()` when it looks like a factory, not an actual router.
    const isExpressRouter = typeof m.router === 'function' && Array.isArray(m.router.stack);
    const router = typeof m.router === 'function' && !isExpressRouter ? m.router() : m.router;
    app.use(path, router);
  }

  // Helpful default for tests: don't crash on thrown async errors.
  // Individual apps can still mount their own errorHandler if desired.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    res.status(500).json({ ok: false, error: err?.message || 'Internal error' });
  });

  return app;
}

export function apiKeyHeaders(apiKey = process.env.API_KEY) {
  return apiKey ? { 'X-API-Key': apiKey } : {};
}

