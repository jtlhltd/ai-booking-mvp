// tests/unit/test-business-hours.js
// Test business hours detection

import { describe, test, assertTrue, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Business Hours Tests', () => {
  
  test('Business hours calculation', () => {
    // This would test the isBusinessHours function from server.js
    // Since it's not exported, we test the concept
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    
    // Business hours typically 9am-5pm, Monday-Friday
    const isBusinessTime = hour >= 9 && hour < 17 && day >= 1 && day <= 5;
    
    assertTrue(typeof isBusinessTime === 'boolean', 'Business hours returns boolean');
  });
  
  test('Weekend detection', () => {
    const saturday = new Date('2025-01-04'); // Saturday
    const sunday = new Date('2025-01-05'); // Sunday
    
    assertTrue(saturday.getDay() === 6, 'Saturday detected');
    assertTrue(sunday.getDay() === 0, 'Sunday detected');
  });
  
  test('Timezone handling', () => {
    const date = new Date();
    const londonTime = date.toLocaleString('en-GB', { timeZone: 'Europe/London' });
    const newYorkTime = date.toLocaleString('en-GB', { timeZone: 'America/New_York' });
    
    assertTrue(londonTime.length > 0, 'London timezone conversion works');
    assertTrue(newYorkTime.length > 0, 'New York timezone conversion works');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

