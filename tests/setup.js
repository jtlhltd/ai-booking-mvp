// tests/setup.js — loaded for every Jest run (see jest.config.js setupFilesAfterEnv)

process.env.NODE_ENV = 'test';

// Optional Postgres for integration tests: set TEST_DATABASE_URL (also enables tests/integration/db-postgres-call-queue-merge.test.js).
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  if (!process.env.DB_TYPE) {
    process.env.DB_TYPE = 'postgres';
  }
}

global.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
