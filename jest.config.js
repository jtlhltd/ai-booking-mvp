// jest.config.js
// Jest configuration for ESM support

export default {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000,
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
      // Raised after calendar check-book extraction + route batch3 contracts.
      branches: 21,
      functions: 28,
      lines: 27.0,
      statements: 26
    },
    // Module gates for the highest-risk surfaces (booking + admin).
    './lib/business-hours.js': {
      branches: 60,
      functions: 100,
      lines: 85,
      statements: 80
    },
    './lib/booking.js': {
      branches: 80,
      functions: 100,
      lines: 90,
      statements: 90
    },
    './routes/appointments.js': {
      branches: 55,
      functions: 40,
      lines: 40,
      statements: 40
    },
    './routes/admin-overview.js': {
      branches: 20,
      functions: 20,
      lines: 25,
      statements: 25
    },
    './lib/calendar-check-book.js': {
      branches: 30,
      functions: 50,
      lines: 45,
      statements: 45
    },
    './lib/calendar-book-slot.js': {
      branches: 35,
      functions: 60,
      lines: 55,
      statements: 55
    },
    './lib/scheduled-jobs.js': {
      branches: 10,
      functions: 35,
      lines: 35,
      statements: 35
    },
    './lib/healthz.js': {
      branches: 50,
      functions: 100,
      lines: 80,
      statements: 80
    },
    './lib/gcal-ping.js': {
      branches: 50,
      functions: 100,
      lines: 80,
      statements: 80
    }
  },
  verbose: true
};

