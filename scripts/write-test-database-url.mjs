/**
 * Writes gitignored `.env.test` with TEST_DATABASE_URL copied from DATABASE_URL.
 * Load root `.env` first: `dotenv` picks it up when run from repo root.
 *
 * Usage: npm run env:test
 * Use case: Postgres integration tests (see tests/integration/db-postgres-call-queue-merge.test.js).
 */
import 'dotenv/config';
import fs from 'fs';

const u = process.env.DATABASE_URL;
if (!u) {
  console.error('DATABASE_URL is not set. Add it to .env (e.g. External URL from Render Postgres).');
  process.exit(1);
}

fs.writeFileSync('.env.test', `TEST_DATABASE_URL=${u}\n`);
console.log('Wrote .env.test (gitignored) with TEST_DATABASE_URL from DATABASE_URL.');
