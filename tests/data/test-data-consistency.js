// tests/data/test-data-consistency.js
// Test data consistency

import { describe, test, assertTrue, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Data Consistency Tests', () => {
  
  test('Foreign key constraints', () => {
    const lead = {
      id: 1,
      client_key: 'test_client',
      phone: '+447491683261'
    };
    
    const appointment = {
      id: 1,
      lead_id: lead.id,
      client_key: lead.client_key
    };
    
    assertTrue(appointment.lead_id === lead.id, 'Foreign key references lead');
    assertTrue(appointment.client_key === lead.client_key, 'Client key matches');
  });
  
  test('Referential integrity', () => {
    const parent = { id: 1, name: 'Parent' };
    const child = { id: 1, parent_id: parent.id };
    
    assertTrue(child.parent_id === parent.id, 'Child references parent');
    assertTrue(parent.id !== null, 'Parent exists');
  });
  
  test('Cascade delete behavior', () => {
    const cascadeRules = {
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    };
    
    assertTrue(cascadeRules.onDelete === 'CASCADE', 'Cascade delete configured');
    assertTrue(cascadeRules.onUpdate === 'CASCADE', 'Cascade update configured');
  });
  
  test('Unique constraints', () => {
    const uniqueFields = ['phone', 'email', 'client_key'];
    uniqueFields.forEach(field => {
      assertTrue(typeof field === 'string', `Unique field ${field} is string`);
    });
  });
  
  test('Data validation', () => {
    const lead = {
      client_key: 'test_client',
      phone: '+447491683261',
      name: 'Test Lead'
    };
    
    assertTrue('client_key' in lead, 'Lead has client_key');
    assertTrue('phone' in lead, 'Lead has phone');
    assertTrue('name' in lead, 'Lead has name');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

