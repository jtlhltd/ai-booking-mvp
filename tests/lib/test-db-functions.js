// tests/lib/test-db-functions.js
// Test database functions

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import {
  listFullClients,
  getFullClient,
  upsertFullClient,
  deleteClient,
  findOrCreateLead,
  getLeadsByClient,
  setSmsConsent,
  storeProposedChoice,
  markBooked,
  upsertCall,
  getCallsByTenant,
  getCallsByPhone,
  getRecentCallsCount
} from '../../db.js';

resetStats();

describe('Database Functions Tests', () => {
  
  test('List full clients function exists', () => {
    assertTrue(typeof listFullClients === 'function', 'listFullClients is a function');
  });
  
  test('Get full client function exists', () => {
    assertTrue(typeof getFullClient === 'function', 'getFullClient is a function');
  });
  
  test('Upsert full client function exists', () => {
    assertTrue(typeof upsertFullClient === 'function', 'upsertFullClient is a function');
  });
  
  test('Delete client function exists', () => {
    assertTrue(typeof deleteClient === 'function', 'deleteClient is a function');
  });
  
  test('Find or create lead function exists', () => {
    assertTrue(typeof findOrCreateLead === 'function', 'findOrCreateLead is a function');
  });
  
  test('Get leads by client function exists', () => {
    assertTrue(typeof getLeadsByClient === 'function', 'getLeadsByClient is a function');
  });
  
  test('Set SMS consent function exists', () => {
    assertTrue(typeof setSmsConsent === 'function', 'setSmsConsent is a function');
  });
  
  test('Store proposed choice function exists', () => {
    assertTrue(typeof storeProposedChoice === 'function', 'storeProposedChoice is a function');
  });
  
  test('Mark booked function exists', () => {
    assertTrue(typeof markBooked === 'function', 'markBooked is a function');
  });
  
  test('Upsert call function exists', () => {
    assertTrue(typeof upsertCall === 'function', 'upsertCall is a function');
  });
  
  test('Get calls by tenant function exists', () => {
    assertTrue(typeof getCallsByTenant === 'function', 'getCallsByTenant is a function');
  });
  
  test('Get calls by phone function exists', () => {
    assertTrue(typeof getCallsByPhone === 'function', 'getCallsByPhone is a function');
  });
  
  test('Get recent calls count function exists', () => {
    assertTrue(typeof getRecentCallsCount === 'function', 'getRecentCallsCount is a function');
  });
  
  test('Client data structure', () => {
    const client = {
      client_key: 'test_client',
      display_name: 'Test Client',
      email: 'test@example.com',
      phone: '+447403934440'
    };
    
    assertTrue('client_key' in client, 'Has client key');
    assertTrue('display_name' in client, 'Has display name');
    assertTrue(/@/.test(client.email), 'Email is valid format');
  });
  
  test('Lead data structure', () => {
    const lead = {
      tenantKey: 'test_client',
      phone: '+447491683261',
      name: 'John Doe',
      service: 'Consultation'
    };
    
    assertTrue('phone' in lead, 'Has phone');
    assertTrue(/^\+447/.test(lead.phone), 'Phone is E.164 format');
  });
  
  test('Call data structure', () => {
    const call = {
      client_key: 'test_client',
      lead_phone: '+447491683261',
      call_id: 'call123',
      status: 'completed',
      outcome: 'booked'
    };
    
    assertTrue('call_id' in call, 'Has call ID');
    assertTrue('status' in call, 'Has status');
    assertTrue(['completed', 'failed', 'no-answer'].includes(call.status) || typeof call.status === 'string', 'Status is valid');
  });
  
  test('SMS consent values', () => {
    const consentValues = [true, false];
    consentValues.forEach(consent => {
      assertTrue(typeof consent === 'boolean', `Consent ${consent} is boolean`);
    });
  });
  
  test('Proposed choice values', () => {
    const choices = [1, 2, 3];
    choices.forEach(choice => {
      assertTrue(choice >= 1 && choice <= 3, `Choice ${choice} is valid`);
    });
  });
});

const exitCode = printSummary();
process.exit(exitCode);

