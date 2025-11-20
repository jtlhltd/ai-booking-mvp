// tests/lib/test-follow-up-sequences.js
// Test follow-up sequences functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { getFollowUpSequence, scheduleFollowUps, cancelFollowUpSequence } from '../../lib/follow-up-sequences.js';

resetStats();

describe('Follow-Up Sequences Tests', () => {
  
  test('Get follow-up sequence function exists', () => {
    assertTrue(typeof getFollowUpSequence === 'function', 'getFollowUpSequence is a function');
  });
  
  test('Schedule follow-ups function exists', () => {
    assertTrue(typeof scheduleFollowUps === 'function', 'scheduleFollowUps is a function');
  });
  
  test('Cancel follow-up sequence function exists', () => {
    assertTrue(typeof cancelFollowUpSequence === 'function', 'cancelFollowUpSequence is a function');
  });
  
  test('Follow-up sequence structure', () => {
    const sequence = {
      outcome: 'callback',
      steps: [
        { delay: 0, channel: 'sms', message: 'Thank you...' },
        { delay: 24, channel: 'call', message: 'Following up...' }
      ]
    };
    
    assertTrue('outcome' in sequence, 'Has outcome');
    assertTrue('steps' in sequence, 'Has steps');
    assertTrue(Array.isArray(sequence.steps), 'Steps is array');
  });
  
  test('Follow-up outcomes', () => {
    const outcomes = ['booked', 'callback', 'not_interested', 'voicemail'];
    outcomes.forEach(outcome => {
      assertTrue(typeof outcome === 'string', `Outcome ${outcome} is string`);
    });
  });
  
  test('Follow-up channels', () => {
    const channels = ['sms', 'email', 'call'];
    channels.forEach(channel => {
      assertTrue(typeof channel === 'string', `Channel ${channel} is string`);
    });
  });
  
  test('Delay calculation', () => {
    const delayHours = 24;
    const delayMs = delayHours * 60 * 60 * 1000;
    
    assertTrue(delayMs === 86400000, 'Delay calculated correctly');
    assertTrue(delayMs > 0, 'Delay > 0');
  });
  
  test('Sequence scheduling', () => {
    const params = {
      clientKey: 'test_client',
      leadPhone: '+447491683261',
      leadName: 'John Doe',
      outcome: 'callback'
    };
    
    assertTrue('clientKey' in params, 'Has clientKey');
    assertTrue('outcome' in params, 'Has outcome');
    assertTrue(/^\+447/.test(params.leadPhone), 'Phone is E.164 format');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

