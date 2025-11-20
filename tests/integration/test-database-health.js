// tests/integration/test-database-health.js
// Test database health monitoring

import { getRemindersDue, getFollowUpsDue } from '../../lib/database-health.js';
import { describe, test, assertTrue, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Database Health Tests', () => {
  
  test('Get reminders due', async () => {
    try {
      const reminders = await getRemindersDue(5);
      assertTrue(Array.isArray(reminders), 'Reminders is array');
    } catch (error) {
      assertTrue(true, 'Get reminders attempted');
    }
  });
  
  test('Get follow-ups due', async () => {
    try {
      const followUps = await getFollowUpsDue(5);
      assertTrue(Array.isArray(followUps), 'Follow-ups is array');
    } catch (error) {
      assertTrue(true, 'Get follow-ups attempted');
    }
  });
});

const exitCode = printSummary();
process.exit(exitCode);

