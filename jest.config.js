// jest.config.js
// Jest configuration for ESM support

export default {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000,
  coverageReporters: ['text', 'text-summary', 'lcov', 'json-summary'],
  transform: {},
  moduleNameMapper: {},
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/archive/',
    '/docs/',
    '/tests/harness/',
    '/scripts/smoke/',
    // Playwright lives here (*.spec.js); must not run under Jest during test:coverage / test:ci.
    '/e2e/'
  ],
  collectCoverageFrom: [
    '**/*.js',
    '!**/node_modules/**',
    '!**/e2e/**',
    '!**/playwright-report/**',
    '!**/test-results/**'
  ],
  coverageThreshold: {
    global: {
      // Ratchet baseline: keep coverage non-zero and trending upward.
      // Update these upward over time as more route/job contracts are added.
      // Jest `global` = merge of covered files that do NOT match any `./…` key below. Path gates exclude those files
      // from this merge (often *lowering* the global % if you peel off small, near-100% modules). Max safe floors here
      // are set from `jest --coverage` threshold errors, not only the printed summary table.
      // Bumped after test-suite-overhaul Phase 3-4 (added contract tests for receptionist, core-api,
      // tools-mount, outreach, leads/portal mounts, vapi-webhooks boundaries, plus the coverage-boost-3
      // batch). Path gates below peel several near-100% routes off this merge, so the *global* numbers
      // here are lower than the printed summary table. Branch floor lowered slightly after extracting
      // vapi-webhooks + shared queue helpers (coverage merge shifts).
      // Temporarily lowered after expanding coverage scope to **/*.js.
      // Ratchet upward after hotspot batches (db.js, queue workers, dashboard).
      branches: 34,
      functions: 49,
      lines: 43,
      statements: 42
    },
    // Peel-off gates for large one-off scripts/CLIs so scope can expand without breaking global thresholds.
    // These files remain in coverage scope (and will appear in reports) but do not affect the global merge.
    './booking-system.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './create-clean-sheet.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './enhanced-business-search.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './enhanced-uk-business-search.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './find-and-call-leads.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './gcal.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './load-prospects-to-dashboard.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './real-decision-maker-contact-finder.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './real-uk-business-search.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './run-migration.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './schedule-prospect-calls.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './setup-admin-hub.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './sms-email-pipeline.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './sheets.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './store.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './server.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './vite.config.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './scripts/create-demo-client.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './scripts/update-client.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './scripts/test-dashboard-complete.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './scripts/test-render-deployment.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './scripts/verify-client.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './scripts/verify-end-to-end.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './scripts/load-test.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './frontend/pages/vapi-test-dashboard/main.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './frontend/pages/decision-maker-finder/main.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './db.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './lib/server-queue-workers.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './lib/outbound-ab-dashboard-handlers.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './lib/crm-integrations.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './routes/demo-dashboard.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './lib/server-assistant-scheduling.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    './routes/admin-email-tasks-deals.js': { branches: 0, functions: 0, lines: 0, statements: 0 },
    // Module gates for the highest-risk surfaces (booking + admin).
    './lib/booking.js': {
      branches: 90,
      functions: 100,
      lines: 100,
      statements: 100
    },
    './lib/business-hours.js': {
      branches: 63,
      functions: 100,
      lines: 90,
      statements: 82
    },
    './routes/appointments.js': {
      branches: 95,
      functions: 100,
      lines: 90,
      statements: 90
    },
    './routes/admin-overview.js': {
      branches: 24,
      functions: 24,
      lines: 38,
      statements: 38
    },
    './lib/calendar-check-book.js': {
      branches: 30,
      functions: 50,
      lines: 70,
      statements: 68
    },
    './lib/calendar-book-slot.js': {
      branches: 35,
      functions: 60,
      lines: 72,
      statements: 71
    },
    './lib/scheduled-jobs.js': {
      branches: 12,
      functions: 38,
      lines: 46,
      statements: 50
    },
    './lib/healthz.js': {
      branches: 48,
      functions: 100,
      lines: 100,
      statements: 100
    },
    './lib/gcal-ping.js': {
      branches: 68,
      functions: 100,
      lines: 86,
      statements: 86
    },
    './lib/sql-relative-interval.js': {
      branches: 80,
      functions: 100,
      lines: 100,
      statements: 100
    },
    './db/json-file-database.js': {
      branches: 55,
      functions: 80,
      lines: 88,
      statements: 88
    },
    './routes/next-actions.js': {
      branches: 55,
      functions: 100,
      lines: 100,
      statements: 100
    },
    './lib/automated-reporting.js': {
      branches: 70,
      functions: 95,
      lines: 82,
      statements: 82
    },
    './lib/query-performance-tracker.js': {
      branches: 62,
      functions: 88,
      lines: 75,
      statements: 75
    },
    './lib/optimal-call-window.js': {
      branches: 44,
      functions: 38,
      lines: 54,
      statements: 50
    },
    './lib/connection-pool-monitor.js': {
      branches: 48,
      functions: 80,
      lines: 64,
      statements: 64
    },
    // Per-module gates added by test-suite-overhaul Phase 5 for the newly-improved routes.
    // Floors are set below current measured coverage to leave headroom; ratchet upward as
    // additional contract/branch tests are added.
    './routes/receptionist.js': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    },
    './routes/core-api.js': {
      branches: 80,
      functions: 95,
      lines: 95,
      statements: 95
    },
    './routes/outreach.js': {
      branches: 90,
      functions: 95,
      lines: 90,
      statements: 90
    },
    './routes/tools-mount.js': {
      branches: 70,
      functions: 55,
      lines: 95,
      statements: 95
    },
    './routes/leads-portal-mount.js': {
      branches: 75,
      functions: 95,
      lines: 85,
      statements: 85
    },
    './routes/portal-pages-mount.js': {
      branches: 95,
      functions: 95,
      lines: 80,
      statements: 80
    },
    './routes/pipeline-tracking.js': {
      branches: 65,
      functions: 95,
      lines: 70,
      statements: 70
    },
    // Peeled from collectCoverageFrom exclusions (chunked unit tests). Gates isolate low-covered extracted modules from the global merge.
    './lib/server-analytics-runtime.js': {
      branches: 7,
      functions: 17,
      lines: 18,
      statements: 18
    },
    './lib/outbound-ab-dashboard-handlers.js': {
      branches: 8,
      functions: 38,
      lines: 7,
      statements: 7
    },
    './lib/server-assistant-scheduling.js': {
      branches: 8,
      functions: 41,
      lines: 13,
      statements: 12
    },
    './lib/server-call-resilience.js': {
      branches: 35,
      functions: 19,
      lines: 23,
      statements: 23
    },
    './lib/campaign-vapi-dial-helpers.js': {
      branches: 12,
      functions: 39,
      lines: 30,
      statements: 30
    },
    // Included in coverage scope; keep gated until tests are expanded.
    './lib/server-queue-workers.js': {
      branches: 10,
      functions: 15,
      lines: 20,
      statements: 20
    },
    './lib/vapi-webhooks/process-webhook-payload.js': {
      branches: 30,
      functions: 40,
      lines: 70,
      statements: 70
    }
  },
  verbose: true
};

