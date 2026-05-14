import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PORT || 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;

/** Env passed to the app process started by webServer (CI + local). */
function webServerEnv() {
  const encryptionKey =
    process.env.ENCRYPTION_KEY ||
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  // Default Postgres (matches GitHub Actions service). Set `PLAYWRIGHT_DB_TYPE=sqlite` for local
  // runs without Postgres after `npm rebuild better-sqlite3` on a supported Node (see README).
  const dbType = process.env.PLAYWRIGHT_DB_TYPE || 'postgres';
  return {
    ...process.env,
    PORT: String(port),
    NODE_ENV: process.env.NODE_ENV || 'test',
    TZ: process.env.TZ || 'UTC',
    DB_TYPE: dbType,
    ...(dbType === 'postgres'
      ? {
          DATABASE_URL:
            process.env.DATABASE_URL ||
            'postgresql://postgres:postgres@127.0.0.1:5432/testdb',
        }
      : {}),
    API_KEY: process.env.API_KEY || 'playwright-e2e-api-key',
    ENCRYPTION_KEY: encryptionKey,
  };
}

const channel = process.env.PLAYWRIGHT_CHANNEL?.trim() || undefined;

export default defineConfig({
  testDir: 'e2e',
  /** Demo dashboard can block on `/api/demo-dashboard/:key` for a long budget; allow headroom. */
  timeout: 120_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    ...(channel ? { channel } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...(channel ? { channel } : {}) } }],
  webServer: {
    command: 'node run-migration.js && node server.js',
    url: `${baseURL.replace(/\/$/, '')}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: webServerEnv(),
  },
});
