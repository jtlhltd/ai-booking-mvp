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
    '/scripts/smoke/'
  ],
  collectCoverageFrom: [
    'db.js',
    'db/**/*.js',
    // Focus coverage on high-signal modules first; expand this set over time.
    '*.js',
    '!server.js',
    // Exclude one-off CLIs/scripts from coverage (they execute on import / require env)
    '!booking-system.js',
    '!run-migration.js',
    '!jest.config.js',
    // Exclude business-search libs that depend on external APIs (Google Places,
    // Companies House) and only run in production with real keys.
    '!lib/enhanced-business-search.js',
    '!lib/real-decision-maker-contact-finder.js',
    '!lib/real-uk-business-search.js',
    'lib/**/*.js',
    'lib/calendar-check-book.js',
    'lib/calendar-book-slot.js',
    'lib/business-hours.js',
    'lib/booking.js',
    'lib/scheduled-jobs.js',
    'lib/healthz.js',
    'lib/gcal-ping.js',
    'lib/webhook-retry.js',
    'lib/stuck-processing-reaper.js',
    'middleware/**/*.js',
    'routes/**/*.js',
    '!**/node_modules/**',
    '!**/archive/**',
    '!**/docs/**'
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
      // here are lower than the printed summary table. Measured at threshold time: 40.43% branches /
      // 53.17% lines / 55.38%+ functions / 51.91% statements.
      branches: 40,
      functions: 55,
      lines: 53,
      statements: 51
    },
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
    }
  },
  verbose: true
};

