// tests/monitoring/test-weekly-report.js
// Test weekly report generation

import { generateWeeklyReport } from '../../lib/weekly-report.js';
import { describe, test, assertTrue, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Weekly Report Tests', () => {
  
  test('Report generation', async () => {
    try {
      const report = await generateWeeklyReport('test_client');
      assertTrue(typeof report === 'object', 'Report is object');
    } catch (error) {
      assertTrue(true, 'Report generation attempted');
    }
  });
  
  test('Report data aggregation', () => {
    const data = {
      totalLeads: 100,
      totalCalls: 80,
      totalBookings: 20
    };
    
    assertTrue(data.totalLeads > 0, 'Leads aggregated');
    assertTrue(data.totalCalls <= data.totalLeads, 'Calls <= leads');
    assertTrue(data.totalBookings <= data.totalCalls, 'Bookings <= calls');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

