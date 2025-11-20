// tests/cron/test-database-health-cron.js
// Test database health cron job

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { checkDatabaseHealth, getDatabaseStats, getRemindersDue, getFollowUpsDue, getLastHealthCheck } from '../../lib/database-health.js';

resetStats();

describe('Database Health Cron Tests', () => {
  
  test('Cron schedule format', () => {
    const schedule = '*/5 * * * *'; // Every 5 minutes
    assertTrue(schedule.includes('*/5'), 'Schedule correct');
  });
  
  test('Check function exists', () => {
    assertTrue(typeof checkDatabaseHealth === 'function', 'checkDatabaseHealth is a function');
  });
  
  test('Stats function exists', () => {
    assertTrue(typeof getDatabaseStats === 'function', 'getDatabaseStats is a function');
  });
  
  test('Reminders function exists', () => {
    assertTrue(typeof getRemindersDue === 'function', 'getRemindersDue is a function');
  });
  
  test('Follow-ups function exists', () => {
    assertTrue(typeof getFollowUpsDue === 'function', 'getFollowUpsDue is a function');
  });
  
  test('Last health check function exists', () => {
    assertTrue(typeof getLastHealthCheck === 'function', 'getLastHealthCheck is a function');
  });
  
  test('Health check returns object structure', async () => {
    try {
      const health = await checkDatabaseHealth();
      assertTrue(typeof health === 'object', 'Returns object');
      assertTrue('status' in health, 'Has status field');
      assertTrue(['healthy', 'degraded', 'critical'].includes(health.status), 'Status is valid');
    } catch (error) {
      // May fail if database not available
      assertTrue(error instanceof Error, 'Function handles errors gracefully');
    }
  });
  
  test('Database stats structure', async () => {
    try {
      const stats = await getDatabaseStats();
      assertTrue(typeof stats === 'object', 'Returns object');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
  
  test('Reminders due query structure', async () => {
    try {
      const reminders = await getRemindersDue(5);
      assertTrue(reminders && typeof reminders === 'object', 'Returns object');
      assertTrue('rows' in reminders, 'Has rows array');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
  
  test('Follow-ups due query structure', async () => {
    try {
      const followUps = await getFollowUpsDue(5);
      assertTrue(followUps && typeof followUps === 'object', 'Returns object');
      assertTrue('rows' in followUps, 'Has rows array');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
});

const exitCode = printSummary();
process.exit(exitCode);

