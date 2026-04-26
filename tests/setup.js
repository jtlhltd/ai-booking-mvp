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

// Keep CI output readable: drop the noisiest info logs, keep warnings/errors.
// Opt-out by setting JEST_VERBOSE_LOGS=1.
if (process.env.JEST_VERBOSE_LOGS !== '1') {
  const origLog = console.log.bind(console);
  console.log = (...args) => {
    const msg = String(args?.[0] ?? '');
    if (
      msg.startsWith('🔍 Database configuration:') ||
      msg.startsWith('🔄 Initializing') ||
      msg.startsWith('DB: SQLite') ||
      msg.startsWith('✅ SQLite') ||
      msg.startsWith('[DB CACHE]') ||
      msg.includes('[CONVERSATION-UPDATE]') ||
      msg.includes('[VAPI WEBHOOK]') ||
      msg.includes('[VAPI WEBHOOK SKIP]') ||
      msg.startsWith('[CALL ANALYSIS]') ||
      msg.startsWith('[CALL TRACKING UPDATE]') ||
      msg.startsWith('[VAPI CONCURRENCY]') ||
      msg.startsWith('[COST TRACKED]')
    ) {
      return;
    }
    origLog(...args);
  };
}

afterAll(async () => {
  // Best-effort cleanup to avoid leaked handles between suites.
  try {
    const { pool } = await import('../db.js');
    if (pool && typeof pool.end === 'function') {
      await pool.end();
    }
  } catch {
    // ignore
  }
});
