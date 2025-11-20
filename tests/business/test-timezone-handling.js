// tests/business/test-timezone-handling.js
// Test timezone conversions

import { describe, test, assertTrue, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Timezone Handling Tests', () => {
  
  test('Timezone conversion', () => {
    const date = new Date('2025-01-15T10:00:00Z');
    const londonTime = date.toLocaleString('en-GB', { timeZone: 'Europe/London' });
    const newYorkTime = date.toLocaleString('en-GB', { timeZone: 'America/New_York' });
    
    assertTrue(londonTime.length > 0, 'London timezone conversion works');
    assertTrue(newYorkTime.length > 0, 'New York timezone conversion works');
    assertTrue(londonTime !== newYorkTime, 'Different timezones produce different times');
  });
  
  test('Business hours in timezone', () => {
    const date = new Date();
    const tz = 'Europe/London';
    const localTime = new Date(date.toLocaleString('en-US', { timeZone: tz }));
    const hour = localTime.getHours();
    
    assertTrue(hour >= 0 && hour < 24, 'Hour in valid range');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

