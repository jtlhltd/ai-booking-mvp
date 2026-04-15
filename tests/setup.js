// tests/setup.js — loaded for every Jest run (see jest.config.js setupFilesAfterEnv)

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

process.env.NODE_ENV = 'test';

// Optional local overrides (gitignored): e.g. TEST_DATABASE_URL for Postgres integration tests.
const envTest = path.join(process.cwd(), '.env.test');
if (fs.existsSync(envTest)) {
  dotenv.config({ path: envTest, override: false });
}

// Do not set DATABASE_URL from TEST_DATABASE_URL here — it breaks SQLite :memory: tests.
// Postgres integration tests set DATABASE_URL inside their own beforeAll.

global.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
