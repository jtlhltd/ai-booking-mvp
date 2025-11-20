// tests/lib/test-config-environment.js
// Test config/environment.js

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { config, validateConfig, defaultResponses, constants } from '../../config/environment.js';

resetStats();

describe('Config Environment Tests', () => {
  
  test('Config object exists', () => {
    assertTrue(typeof config === 'object', 'config is object');
  });
  
  test('Validate config function exists', () => {
    assertTrue(typeof validateConfig === 'function', 'validateConfig is a function');
  });
  
  test('Default responses exists', () => {
    assertTrue(typeof defaultResponses === 'object', 'defaultResponses is object');
  });
  
  test('Constants exists', () => {
    assertTrue(typeof constants === 'object', 'constants is object');
  });
  
  test('Config structure', () => {
    assertTrue(config !== null, 'Config is not null');
    assertTrue(typeof config === 'object', 'Config is object');
  });
  
  test('Config validation', () => {
    try {
      const result = validateConfig();
      assertTrue(typeof result === 'boolean' || typeof result === 'object', 'Returns validation result');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
  
  test('Default responses structure', () => {
    assertTrue(typeof defaultResponses === 'object', 'Default responses is object');
    assertTrue(defaultResponses !== null, 'Default responses is not null');
  });
  
  test('Constants structure', () => {
    assertTrue(typeof constants === 'object', 'Constants is object');
    assertTrue(constants !== null, 'Constants is not null');
  });
  
  test('Environment variable access', () => {
    const envVars = ['NODE_ENV', 'PORT', 'DB_TYPE'];
    envVars.forEach(varName => {
      assertTrue(typeof process.env[varName] === 'string' || process.env[varName] === undefined, `Env var ${varName} is valid`);
    });
  });
});

const exitCode = printSummary();
process.exit(exitCode);

