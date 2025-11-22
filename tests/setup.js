// tests/setup.js
// Test setup and teardown

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DB_TYPE = 'postgres';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

// Increase timeout for integration tests
jest.setTimeout(30000);

// Global test utilities
global.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

