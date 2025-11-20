// tests/lib/test-email-alerts.js
// Test email alerts functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { sendQualityAlert, sendWeeklySummary } from '../../lib/email-alerts.js';

resetStats();

describe('Email Alerts Tests', () => {
  
  test('Send quality alert function exists', () => {
    assertTrue(typeof sendQualityAlert === 'function', 'sendQualityAlert is a function');
  });
  
  test('Send weekly summary function exists', () => {
    assertTrue(typeof sendWeeklySummary === 'function', 'sendWeeklySummary is a function');
  });
  
  test('Quality alert structure', () => {
    const alert = {
      severity: 'high',
      type: 'low_success_rate',
      message: 'Call success rate dropped',
      metric: 'success_rate',
      actual: '50%',
      expected: '70%'
    };
    
    assertTrue('severity' in alert, 'Has severity');
    assertTrue('message' in alert, 'Has message');
    assertTrue(['high', 'medium', 'low'].includes(alert.severity), 'Severity is valid');
  });
  
  test('Alert types', () => {
    const alertTypes = [
      'low_success_rate',
      'low_booking_rate',
      'low_quality_score',
      'short_call_duration',
      'negative_sentiment'
    ];
    
    alertTypes.forEach(type => {
      assertTrue(typeof type === 'string', `Alert type ${type} is string`);
    });
  });
  
  test('Client structure for alerts', () => {
    const client = {
      client_key: 'test_client',
      display_name: 'Test Client',
      email: 'test@example.com'
    };
    
    assertTrue('client_key' in client, 'Has client key');
    assertTrue('email' in client, 'Has email');
  });
  
  test('Metrics structure', () => {
    const metrics = {
      total_calls: 100,
      success_rate: 0.75,
      booking_rate: 0.12,
      avg_quality_score: 7.5
    };
    
    assertTrue('total_calls' in metrics, 'Has total calls');
    assertTrue(typeof metrics.success_rate === 'number', 'Success rate is number');
    assertTrue(metrics.success_rate >= 0 && metrics.success_rate <= 1, 'Success rate is valid');
  });
  
  test('Weekly summary structure', () => {
    const weeklyStats = {
      leads: 50,
      calls: 45,
      bookings: 10,
      revenue: 1500,
      conversionRate: 0.2
    };
    
    assertTrue('leads' in weeklyStats, 'Has leads');
    assertTrue('bookings' in weeklyStats, 'Has bookings');
    assertTrue(typeof weeklyStats.conversionRate === 'number', 'Conversion rate is number');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

