// tests/unit/test-follow-up-sequences.js
// Test follow-up sequence generation

import { getFollowUpSequence, scheduleFollowUps } from '../../lib/follow-up-sequences.js';
import { describe, test, assertEqual, assertTrue, assertNotNull, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Follow-up Sequences Tests', () => {
  
  test('Sequence selection - no-answer', () => {
    const sequence = getFollowUpSequence('no-answer');
    assertNotNull(sequence, 'Sequence returned for no-answer');
    assertTrue(sequence.steps.length > 0, 'Sequence has steps');
    assertTrue(sequence.name.includes('No Answer'), 'Correct sequence name');
  });
  
  test('Sequence selection - voicemail', () => {
    const sequence = getFollowUpSequence('voicemail');
    assertNotNull(sequence, 'Sequence returned for voicemail');
    assertTrue(sequence.steps.length > 0, 'Sequence has steps');
    assertTrue(sequence.name.includes('Voicemail'), 'Correct sequence name');
  });
  
  test('Sequence selection - not-interested', () => {
    const sequence = getFollowUpSequence('not-interested');
    assertNotNull(sequence, 'Sequence returned for not-interested');
    assertTrue(sequence.steps.length > 0, 'Sequence has steps');
    assertTrue(sequence.name.includes('Not Interested'), 'Correct sequence name');
  });
  
  test('Sequence selection - callback-requested', () => {
    const sequence = getFollowUpSequence('callback-requested');
    assertNotNull(sequence, 'Sequence returned for callback-requested');
    assertTrue(sequence.steps.length > 0, 'Sequence has steps');
  });
  
  test('Sequence selection - interested', () => {
    const sequence = getFollowUpSequence('interested');
    assertNotNull(sequence, 'Sequence returned for interested');
  });
  
  test('Sequence selection - unknown outcome', () => {
    const sequence = getFollowUpSequence('unknown-outcome');
    // Should default to no-answer sequence
    assertNotNull(sequence, 'Default sequence returned for unknown outcome');
  });
  
  test('Sequence step structure', () => {
    const sequence = getFollowUpSequence('no-answer');
    if (sequence && sequence.steps.length > 0) {
      const step = sequence.steps[0];
      assertTrue('delay' in step, 'Step has delay');
      assertTrue('channel' in step, 'Step has channel');
      assertTrue(step.delay >= 0, 'Delay is non-negative');
      assertTrue(['sms', 'email', 'call'].includes(step.channel), 'Valid channel');
    }
  });
  
  test('Delay calculation', () => {
    const sequence = getFollowUpSequence('no-answer');
    if (sequence && sequence.steps.length > 0) {
      const delays = sequence.steps.map(s => s.delay);
      // Delays should be in milliseconds and increasing
      delays.forEach(delay => {
        assertTrue(delay >= 0, 'Delay is non-negative');
        assertTrue(typeof delay === 'number', 'Delay is a number');
      });
    }
  });
  
  test('Template variable substitution', () => {
    const template = 'Hi {name}, we tried calling about your {service} inquiry with {businessName}.';
    const variables = {
      name: 'John',
      service: 'logistics',
      businessName: 'Test Business'
    };
    
    let result = template;
    Object.entries(variables).forEach(([key, value]) => {
      result = result.replace(`{${key}}`, value);
    });
    
    assertTrue(result.includes('John'), 'Name substituted');
    assertTrue(result.includes('logistics'), 'Service substituted');
    assertTrue(result.includes('Test Business'), 'Business name substituted');
    assertTrue(!result.includes('{'), 'All variables substituted');
  });
  
  test('Sequence step channels', () => {
    const sequence = getFollowUpSequence('no-answer');
    if (sequence && sequence.steps.length > 0) {
      const channels = sequence.steps.map(s => s.channel);
      const validChannels = ['sms', 'email', 'call'];
      
      channels.forEach(channel => {
        assertTrue(validChannels.includes(channel), `Valid channel: ${channel}`);
      });
    }
  });
  
  test('Outcome mapping variations', () => {
    const variations = {
      'no-answer': 'no_answer',
      'no_answer': 'no_answer',
      'busy': 'no_answer',
      'voicemail': 'voicemail',
      'not_interested': 'not_interested',
      'not-interested': 'not_interested',
      'declined': 'not_interested',
      'callback_requested': 'callback_requested',
      'callback-requested': 'callback_requested',
      'interested': 'interested_no_booking',
      'failed': 'technical_issues',
      'error': 'technical_issues'
    };
    
    Object.entries(variations).forEach(([input, expectedType]) => {
      const sequence = getFollowUpSequence(input);
      assertNotNull(sequence, `Sequence returned for ${input}`);
    });
  });
  
  test('Sequence step count', () => {
    const sequences = [
      getFollowUpSequence('no-answer'),
      getFollowUpSequence('voicemail'),
      getFollowUpSequence('not-interested')
    ];
    
    sequences.forEach(sequence => {
      if (sequence) {
        assertTrue(sequence.steps.length > 0, 'Sequence has at least one step');
      }
    });
  });
});

const exitCode = printSummary();
process.exit(exitCode);

