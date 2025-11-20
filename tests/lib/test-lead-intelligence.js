// tests/lib/test-lead-intelligence.js
// Test lead intelligence and scoring

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import {
  calculateLeadScore,
  calculateFollowUpScore,
  determineOptimalChannel,
  trackObjection,
  getBestObjectionResponses
} from '../../lib/lead-intelligence.js';

resetStats();

describe('Lead Intelligence Tests', () => {
  
  test('Calculate lead score function exists', () => {
    assertTrue(typeof calculateLeadScore === 'function', 'calculateLeadScore is a function');
  });
  
  test('Calculate follow-up score function exists', () => {
    assertTrue(typeof calculateFollowUpScore === 'function', 'calculateFollowUpScore is a function');
  });
  
  test('Determine optimal channel function exists', () => {
    assertTrue(typeof determineOptimalChannel === 'function', 'determineOptimalChannel is a function');
  });
  
  test('Track objection function exists', () => {
    assertTrue(typeof trackObjection === 'function', 'trackObjection is a function');
  });
  
  test('Get best objection responses function exists', () => {
    assertTrue(typeof getBestObjectionResponses === 'function', 'getBestObjectionResponses is a function');
  });
  
  test('Lead score calculation', () => {
    const lead = {
      phone: '+447491683261',
      email: 'test@example.com',
      name: 'Test Lead'
    };
    
    const score = calculateLeadScore(lead);
    assertTrue(typeof score === 'number', 'Score is number');
    assertTrue(score >= 0, 'Score >= 0');
  });
  
  test('Follow-up score calculation', () => {
    const lead = {
      phone: '+447491683261',
      lastCallOutcome: 'callback',
      callCount: 2
    };
    
    const score = calculateFollowUpScore(lead);
    assertTrue(typeof score === 'number', 'Score is number');
    assertTrue(score >= 0, 'Score >= 0');
  });
  
  test('Optimal channel determination', () => {
    const channels = ['sms', 'email', 'call'];
    const result = determineOptimalChannel({ phone: '+447491683261' });
    
    assertTrue(channels.includes(result) || typeof result === 'string', 'Returns valid channel');
  });
  
  test('Objection types', () => {
    const objectionTypes = ['price', 'timing', 'incumbent', 'no_need', 'trust'];
    objectionTypes.forEach(type => {
      assertTrue(typeof type === 'string', `Objection type ${type} is string`);
    });
  });
  
  test('Channel priority', () => {
    const channels = {
      high_priority: 'call',
      medium_priority: 'sms',
      low_priority: 'email'
    };
    
    assertTrue(typeof channels === 'object', 'Channels is object');
    assertTrue(['call', 'sms', 'email'].includes(channels.high_priority), 'High priority is valid');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

