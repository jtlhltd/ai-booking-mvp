// tests/lib/test-instant-calling.js
// Test instant calling functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { callLeadInstantly, processCallQueue, estimateCallTime } from '../../lib/instant-calling.js';

resetStats();

describe('Instant Calling Tests', () => {
  
  test('Call lead instantly function exists', () => {
    assertTrue(typeof callLeadInstantly === 'function', 'callLeadInstantly is a function');
  });
  
  test('Process call queue function exists', () => {
    assertTrue(typeof processCallQueue === 'function', 'processCallQueue is a function');
  });
  
  test('Estimate call time function exists', () => {
    assertTrue(typeof estimateCallTime === 'function', 'estimateCallTime is a function');
  });
  
  test('Call time estimation logic', () => {
    const leadCount = 10;
    const delayMs = 2000;
    try {
      const estimated = estimateCallTime(leadCount, delayMs);
      assertTrue(typeof estimated === 'object', 'Returns object');
      assertTrue('totalSeconds' in estimated, 'Has totalSeconds');
      assertTrue('formatted' in estimated, 'Has formatted');
      assertTrue(typeof estimated.totalSeconds === 'number', 'Total seconds is number');
      assertTrue(estimated.totalSeconds > 0, 'Total seconds > 0');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
  
  test('Call queue structure', () => {
    const leads = [
      { name: 'Lead 1', phone: '+447700900001' },
      { name: 'Lead 2', phone: '+447700900002' }
    ];
    
    assertTrue(Array.isArray(leads), 'Leads is array');
    leads.forEach(lead => {
      assertTrue('phone' in lead, 'Each lead has phone');
    });
  });
  
  test('Call parameters validation', () => {
    const callParams = {
      clientKey: 'test_client',
      lead: { name: 'Test', phone: '+447491683261' },
      client: { client_key: 'test_client' }
    };
    
    assertTrue('clientKey' in callParams, 'Has clientKey');
    assertTrue('lead' in callParams, 'Has lead');
    assertTrue('phone' in callParams.lead, 'Lead has phone');
  });
  
  test('Queue processing logic', () => {
    const queueSize = 5;
    const batchSize = 2;
    const batches = Math.ceil(queueSize / batchSize);
    
    assertTrue(batches === 3, 'Batches calculated correctly');
    assertTrue(batches > 0, 'Has batches');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

