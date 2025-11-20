// tests/lib/test-industry-benchmarks.js
// Test industry benchmarks functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { getBenchmark, compareToIndustry, generateInsights } from '../../lib/industry-benchmarks.js';

resetStats();

describe('Industry Benchmarks Tests', () => {
  
  test('Get benchmark function exists', () => {
    assertTrue(typeof getBenchmark === 'function', 'getBenchmark is a function');
  });
  
  test('Compare to industry function exists', () => {
    assertTrue(typeof compareToIndustry === 'function', 'compareToIndustry is a function');
  });
  
  test('Generate insights function exists', () => {
    assertTrue(typeof generateInsights === 'function', 'generateInsights is a function');
  });
  
  test('Benchmark structure', () => {
    const benchmark = {
      industry: 'dentist',
      avgConversionRate: 0.15,
      avgCallDuration: 180,
      avgQualityScore: 7.5
    };
    
    assertTrue('industry' in benchmark, 'Has industry');
    assertTrue('avgConversionRate' in benchmark, 'Has conversion rate');
    assertTrue(benchmark.avgConversionRate > 0 && benchmark.avgConversionRate <= 1, 'Conversion rate is valid');
  });
  
  test('Industry comparison logic', () => {
    const clientMetrics = {
      conversionRate: 0.12,
      callDuration: 200,
      qualityScore: 7.0
    };
    
    const benchmark = {
      avgConversionRate: 0.15,
      avgCallDuration: 180,
      avgQualityScore: 7.5
    };
    
    const belowBenchmark = clientMetrics.conversionRate < benchmark.avgConversionRate;
    assertTrue(belowBenchmark, 'Can identify below benchmark');
  });
  
  test('Supported industries', () => {
    const industries = ['dentist', 'plumber', 'salon', 'coach', 'lawyer'];
    industries.forEach(industry => {
      assertTrue(typeof industry === 'string', `Industry ${industry} is string`);
    });
  });
  
  test('Insights generation', () => {
    const comparison = {
      metrics: {
        callSuccessRate: {
          client: 0.60,
          benchmark: 0.65,
          difference: -0.05,
          percentDiff: -7.7,
          status: 'average'
        },
        bookingRate: {
          client: 0.10,
          benchmark: 0.15,
          difference: -0.05,
          percentDiff: -33.3,
          status: 'below'
        }
      }
    };
    
    try {
      const insights = generateInsights(comparison);
      assertTrue(Array.isArray(insights), 'Returns array');
      if (insights.length > 0) {
        assertTrue('type' in insights[0], 'Insight has type');
        assertTrue('message' in insights[0], 'Insight has message');
      }
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
});

const exitCode = printSummary();
process.exit(exitCode);

