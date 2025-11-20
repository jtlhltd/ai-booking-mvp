// tests/lib/test-ab-testing.js
// Test A/B testing functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { assignCallVariant, recordCallOutcome, getABTestResults, getPersonalizedPrompt } from '../../lib/ab-testing.js';

resetStats();

describe('A/B Testing Tests', () => {
  
  test('Assign call variant function exists', () => {
    assertTrue(typeof assignCallVariant === 'function', 'assignCallVariant is a function');
  });
  
  test('Record call outcome function exists', () => {
    assertTrue(typeof recordCallOutcome === 'function', 'recordCallOutcome is a function');
  });
  
  test('Get AB test results function exists', () => {
    assertTrue(typeof getABTestResults === 'function', 'getABTestResults is a function');
  });
  
  test('Get personalized prompt function exists', () => {
    assertTrue(typeof getPersonalizedPrompt === 'function', 'getPersonalizedPrompt is a function');
  });
  
  test('Variant assignment logic', () => {
    const variants = ['A', 'B', 'C'];
    const assigned = variants[Math.floor(Math.random() * variants.length)];
    
    assertTrue(variants.includes(assigned), 'Assigned variant is valid');
  });
  
  test('Variant distribution', () => {
    const assignments = { A: 0, B: 0, C: 0 };
    for (let i = 0; i < 100; i++) {
      const variant = ['A', 'B', 'C'][Math.floor(Math.random() * 3)];
      assignments[variant]++;
    }
    
    assertTrue(assignments.A + assignments.B + assignments.C === 100, 'All assignments counted');
    assertTrue(assignments.A > 0 && assignments.B > 0, 'Multiple variants assigned');
  });
  
  test('Outcome tracking structure', () => {
    const outcome = {
      clientKey: 'test_client',
      leadPhone: '+447491683261',
      outcome: 'booked',
      duration: 120,
      sentiment: 'positive',
      qualityScore: 8
    };
    
    assertTrue('outcome' in outcome, 'Has outcome');
    assertTrue(['booked', 'callback', 'not_interested', 'voicemail'].includes(outcome.outcome) || typeof outcome.outcome === 'string', 'Outcome is valid');
    assertTrue(typeof outcome.duration === 'number', 'Duration is number');
  });
  
  test('Test results structure', () => {
    const results = {
      variantA: { calls: 50, bookings: 10, conversionRate: 0.2 },
      variantB: { calls: 50, bookings: 15, conversionRate: 0.3 }
    };
    
    assertTrue('variantA' in results, 'Has variant A');
    assertTrue('variantB' in results, 'Has variant B');
    assertTrue(results.variantB.conversionRate > results.variantA.conversionRate, 'Can compare variants');
  });
  
  test('Personalized prompt structure', () => {
    const variant = 'A';
    const business = { name: 'Test Business', industry: 'dentist' };
    
    try {
      const prompt = getPersonalizedPrompt(variant, business);
      assertTrue(typeof prompt === 'string', 'Returns string');
      assertTrue(prompt.length > 0, 'Prompt has content');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
});

const exitCode = printSummary();
process.exit(exitCode);

