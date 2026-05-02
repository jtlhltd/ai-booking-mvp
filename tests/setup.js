// tests/setup.js — loaded for every Jest run (see jest.config.js setupFilesAfterEnv)

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

process.env.NODE_ENV = 'test';

// Default Jest runs should not accidentally pull in native integration tests.
// Opt-in explicitly via RUN_NATIVE_INTEGRATION=1 (CI can set it for integration jobs).
if (process.env.RUN_NATIVE_INTEGRATION !== '1') {
  delete process.env.RUN_DB_INTEGRATION_TESTS;
  delete process.env.RUN_SQLITE_INTEGRATION_TESTS;
  delete process.env.RUN_POSTGRES_SMOKE_TESTS;
}

// Optional local overrides (gitignored): e.g. TEST_DATABASE_URL for Postgres integration tests.
// Regenerate: npm run env:test (copies DATABASE_URL from .env → TEST_DATABASE_URL in .env.test).
const envTest = path.join(process.cwd(), '.env.test');
if (fs.existsSync(envTest)) {
  dotenv.config({ path: envTest, override: false });
}

// Do not set DATABASE_URL from TEST_DATABASE_URL here — it breaks SQLite :memory: tests.
// Postgres integration tests set DATABASE_URL inside their own beforeAll.

global.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// CI-output hygiene: deny-by-default for `console.log` so the test runner stays readable.
// Opt back in via JEST_VERBOSE_LOGS=1 (e.g. when debugging locally).
// `console.warn` and `console.error` are NEVER suppressed — they remain visible so failures and
// real warnings bubble up.
if (process.env.JEST_VERBOSE_LOGS !== '1') {
   
  console.log = () => {};
   
  console.info = () => {};
   
  console.debug = () => {};
}

afterAll(async () => {
  // Best-effort cleanup to avoid leaked handles between suites.
  // Order matters: stop background timers before closing pools/sockets.
  const disposers = [
    async () => {
      const mod = await import('../lib/cache.js').catch(() => null);
      const cache = mod?.getCache?.();
      if (cache && typeof cache.destroy === 'function') cache.destroy();
    },
    async () => {
      const mod = await import('../lib/monitoring.js').catch(() => null);
      mod?.getMetricsCollector?.()?.stop?.();
      mod?.getAlertManager?.()?.stop?.();
      mod?.getHealthCheckManager?.()?.stop?.();
    },
    async () => {
      const mod = await import('../db.js').catch(() => null);
      if (mod?.pool && typeof mod.pool.end === 'function') {
        await mod.pool.end();
      }
    }
  ];

  for (const dispose of disposers) {
    try {
      await dispose();
    } catch {
      // ignore — best effort
    }
  }
});
