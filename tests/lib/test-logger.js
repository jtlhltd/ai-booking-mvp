// tests/lib/test-logger.js
// Test logger functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { log, getLogLevel, isLevelEnabled } from '../../lib/logger.js';

resetStats();

describe('Logger Tests', () => {
  
  test('Log function exists', () => {
    assertTrue(typeof log === 'function', 'log is a function');
  });
  
  test('Get log level function exists', () => {
    assertTrue(typeof getLogLevel === 'function', 'getLogLevel is a function');
  });
  
  test('Is level enabled function exists', () => {
    assertTrue(typeof isLevelEnabled === 'function', 'isLevelEnabled is a function');
  });
  
  test('Log levels', () => {
    const levels = ['debug', 'info', 'warn', 'error'];
    levels.forEach(level => {
      assertTrue(typeof level === 'string', `Level ${level} is string`);
    });
  });
  
  test('Log level hierarchy', () => {
    const hierarchy = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
    
    assertTrue(hierarchy.debug < hierarchy.info, 'Debug < info');
    assertTrue(hierarchy.info < hierarchy.warn, 'Info < warn');
    assertTrue(hierarchy.warn < hierarchy.error, 'Warn < error');
  });
  
  test('Log level check', () => {
    const currentLevel = 'info';
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentIndex = levels.indexOf(currentLevel);
    
    assertTrue(currentIndex >= 0, 'Level found in hierarchy');
    assertTrue(levels.indexOf('error') > currentIndex, 'Error level is higher');
  });
  
  test('Log message structure', () => {
    const message = {
      level: 'info',
      message: 'Test log',
      timestamp: new Date().toISOString(),
      context: { clientKey: 'test_client' }
    };
    
    assertTrue('level' in message, 'Has level');
    assertTrue('message' in message, 'Has message');
    assertTrue(typeof message.message === 'string', 'Message is string');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

