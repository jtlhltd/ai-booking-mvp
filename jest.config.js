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
    '/docs/'
  ],
  collectCoverageFrom: [
    'db.js',
    // Focus coverage on high-signal modules first; expand this set over time.
    'lib/business-hours.js',
    'lib/booking.js',
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
      branches: 15,
      functions: 20,
      lines: 20,
      statements: 20
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
      branches: 20,
      functions: 20,
      lines: 25,
      statements: 25
    },
    './routes/admin-overview.js': {
      branches: 20,
      functions: 20,
      lines: 25,
      statements: 25
    }
  },
  verbose: true
};

