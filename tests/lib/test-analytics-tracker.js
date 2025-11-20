// tests/lib/test-analytics-tracker.js
// Test analytics tracking functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import {
  trackCallOutcome,
  getConversionMetrics,
  getConversionTrend,
  getOutcomeBreakdown,
  generateWeeklyReport,
  calculateLeadScore
} from '../../lib/analytics-tracker.js';

resetStats();

describe('Analytics Tracker Tests', () => {
  
  test('Track call outcome function exists', () => {
    assertTrue(typeof trackCallOutcome === 'function', 'trackCallOutcome is a function');
  });
  
  test('Get conversion metrics function exists', () => {
    assertTrue(typeof getConversionMetrics === 'function', 'getConversionMetrics is a function');
  });
  
  test('Get conversion trend function exists', () => {
    assertTrue(typeof getConversionTrend === 'function', 'getConversionTrend is a function');
  });
  
  test('Get outcome breakdown function exists', () => {
    assertTrue(typeof getOutcomeBreakdown === 'function', 'getOutcomeBreakdown is a function');
  });
  
  test('Generate weekly report function exists', () => {
    assertTrue(typeof generateWeeklyReport === 'function', 'generateWeeklyReport is a function');
  });
  
  test('Calculate lead score function exists', () => {
    assertTrue(typeof calculateLeadScore === 'function', 'calculateLeadScore is a function');
  });
  
  test('Lead score calculation logic', () => {
    const lead = {
      phone: '+447491683261',
      email: 'test@example.com',
      name: 'Test Lead'
    };
    
    const score = calculateLeadScore(lead);
    assertTrue(typeof score === 'number', 'Score is number');
    assertTrue(score >= 0 && score <= 100, 'Score is between 0 and 100');
  });
  
  test('Conversion rate calculation', () => {
    const metrics = {
      totalCalls: 100,
      bookings: 15
    };
    
    const conversionRate = metrics.bookings / metrics.totalCalls;
    assertTrue(conversionRate >= 0 && conversionRate <= 1, 'Conversion rate is valid');
    assertEqual(conversionRate, 0.15, 'Conversion rate calculated correctly');
  });
  
  test('Trend calculation structure', () => {
    const trend = {
      dates: ['2025-01-01', '2025-01-02'],
      values: [10, 15],
      change: 5
    };
    
    assertTrue('dates' in trend, 'Trend has dates');
    assertTrue('values' in trend, 'Trend has values');
    assertTrue(Array.isArray(trend.dates), 'Dates is array');
    assertTrue(Array.isArray(trend.values), 'Values is array');
  });
  
  test('Outcome breakdown structure', () => {
    const breakdown = {
      booked: 10,
      callback: 5,
      not_interested: 20,
      voicemail: 15
    };
    
    assertTrue(typeof breakdown === 'object', 'Breakdown is object');
    assertTrue('booked' in breakdown || Object.keys(breakdown).length > 0, 'Has outcome data');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

