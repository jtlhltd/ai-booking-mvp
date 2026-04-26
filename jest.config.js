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
    // NOTE: `tests/lib/test-*.js` are standalone script-style checks (custom harness, `process.exit`, etc),
    // not Jest tests. Keep them out of Jest discovery even if `testMatch` is widened later.
    '/tests/lib/test-.*\\.js$'
  ],
  collectCoverageFrom: [
    'db.js',
    'db/**/*.js',
    // Focus coverage on high-signal modules first; expand this set over time.
    '*.js',
    '!server.js',
    // Exclude one-off CLIs/scripts from coverage (they execute on import / require env)
    '!booking-system.js',
    '!create-clean-sheet.js',
    '!enhanced-business-search.js',
    '!enhanced-uk-business-search.js',
    '!find-and-call-leads.js',
    '!load-prospects-to-dashboard.js',
    '!real-decision-maker-contact-finder.js',
    '!real-uk-business-search.js',
    '!run-migration.js',
    '!schedule-prospect-calls.js',
    '!setup-admin-hub.js',
    '!jest.config.js',
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
      branches: 35,
      functions: 51,
      lines: 48,
      statements: 47
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
    }
  },
  verbose: true
};

