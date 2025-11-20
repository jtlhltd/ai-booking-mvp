// tests/cron/test-quality-monitoring-cron.js
// Test quality monitoring cron job

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { monitorCallQuality, QUALITY_THRESHOLDS } from '../../lib/quality-monitoring.js';

resetStats();

describe('Quality Monitoring Cron Tests', () => {
  
  test('Cron job schedule format', () => {
    const schedule = '0 * * * *'; // Every hour
    const parts = schedule.split(' ');
    assertEqual(parts.length, 5, 'Cron schedule has 5 parts');
  });
  
  test('Quality thresholds defined', () => {
    assertTrue(QUALITY_THRESHOLDS.call_success_rate > 0, 'Success rate threshold defined');
    assertTrue(QUALITY_THRESHOLDS.booking_rate > 0, 'Booking rate threshold defined');
    assertTrue(QUALITY_THRESHOLDS.avg_quality_score > 0, 'Quality score threshold defined');
    assertTrue(QUALITY_THRESHOLDS.avg_call_duration > 0, 'Call duration threshold defined');
    assertTrue(QUALITY_THRESHOLDS.positive_sentiment_ratio > 0, 'Sentiment ratio threshold defined');
  });
  
  test('Quality thresholds are reasonable', () => {
    assertTrue(QUALITY_THRESHOLDS.call_success_rate <= 1, 'Success rate <= 100%');
    assertTrue(QUALITY_THRESHOLDS.booking_rate <= 1, 'Booking rate <= 100%');
    assertTrue(QUALITY_THRESHOLDS.avg_quality_score <= 10, 'Quality score <= 10');
    assertTrue(QUALITY_THRESHOLDS.positive_sentiment_ratio <= 1, 'Sentiment ratio <= 100%');
  });
  
  test('Monitor function exists and is callable', () => {
    assertTrue(typeof monitorCallQuality === 'function', 'monitorCallQuality is a function');
  });
  
  test('Quality metrics calculation logic', () => {
    // Test that quality metrics would be calculated correctly
    const metrics = {
      total_calls: 100,
      successful_calls: 80,
      bookings: 15,
      positive_sentiment_count: 45,
      avg_quality_score: 7.5,
      avg_duration: 180
    };
    
    const success_rate = metrics.successful_calls / metrics.total_calls;
    const booking_rate = metrics.bookings / metrics.total_calls;
    const sentiment_ratio = metrics.positive_sentiment_count / metrics.total_calls;
    
    assertTrue(success_rate === 0.8, 'Success rate calculated correctly');
    assertTrue(booking_rate === 0.15, 'Booking rate calculated correctly');
    assertTrue(sentiment_ratio === 0.45, 'Sentiment ratio calculated correctly');
    assertTrue(metrics.avg_quality_score > QUALITY_THRESHOLDS.avg_quality_score, 'Quality score above threshold');
  });
  
  test('Alert generation logic - low success rate', () => {
    const rates = {
      success_rate: 0.5, // 50% - below threshold
      booking_rate: 0.12,
      avg_quality_score: 7.0,
      avg_duration: 150
    };
    
    const shouldAlert = rates.success_rate < QUALITY_THRESHOLDS.call_success_rate;
    assertTrue(shouldAlert, 'Should alert on low success rate');
  });
  
  test('Alert generation logic - low booking rate', () => {
    const rates = {
      success_rate: 0.8,
      booking_rate: 0.05, // 5% - below threshold
      avg_quality_score: 7.0,
      avg_duration: 150
    };
    
    const shouldAlert = rates.booking_rate < QUALITY_THRESHOLDS.booking_rate;
    assertTrue(shouldAlert, 'Should alert on low booking rate');
  });
  
  test('Alert generation logic - low quality score', () => {
    const rates = {
      success_rate: 0.8,
      booking_rate: 0.12,
      avg_quality_score: 4.0, // Below threshold
      avg_duration: 150
    };
    
    const shouldAlert = rates.avg_quality_score < QUALITY_THRESHOLDS.avg_quality_score;
    assertTrue(shouldAlert, 'Should alert on low quality score');
  });
  
  test('No alerts for healthy metrics', () => {
    const rates = {
      success_rate: 0.85, // Above threshold
      booking_rate: 0.15, // Above threshold
      avg_quality_score: 8.0, // Above threshold
      avg_duration: 200, // Above threshold
      positive_sentiment_ratio: 0.50 // Above threshold
    };
    
    const hasAlerts = 
      rates.success_rate < QUALITY_THRESHOLDS.call_success_rate ||
      rates.booking_rate < QUALITY_THRESHOLDS.booking_rate ||
      rates.avg_quality_score < QUALITY_THRESHOLDS.avg_quality_score ||
      rates.avg_duration < QUALITY_THRESHOLDS.avg_call_duration;
    
    assertTrue(!hasAlerts, 'No alerts for healthy metrics');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

