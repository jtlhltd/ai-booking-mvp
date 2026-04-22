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
    'server.js',
    'db.js',
    'lib/**/*.js',
    'middleware/**/*.js',
    'routes/**/*.js',
    '!**/node_modules/**',
    '!**/archive/**',
    '!**/docs/**'
  ],
  coverageThreshold: {
    global: {
      // Start low; we will ratchet this upward as we add route/job coverage.
      // The initial goal is to make coverage visible in CI without blocking.
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0
    }
  },
  verbose: true
};

