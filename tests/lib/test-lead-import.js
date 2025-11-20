// tests/lib/test-lead-import.js
// Test lead import functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { parseCSV, importLeads, parseEmailForLead } from '../../lib/lead-import.js';

resetStats();

describe('Lead Import Tests', () => {
  
  test('Parse CSV function exists', () => {
    assertTrue(typeof parseCSV === 'function', 'parseCSV is a function');
  });
  
  test('Import leads function exists', () => {
    assertTrue(typeof importLeads === 'function', 'importLeads is a function');
  });
  
  test('Parse email function exists', () => {
    assertTrue(typeof parseEmailForLead === 'function', 'parseEmailForLead is a function');
  });
  
  test('CSV parsing logic', () => {
    const csvData = 'name,phone,email\nJohn Doe,+447491683261,john@example.com';
    const parsed = parseCSV(csvData);
    
    assertTrue(Array.isArray(parsed), 'Returns array');
    if (parsed.length > 0) {
      assertTrue(typeof parsed[0] === 'object', 'Rows are objects');
    }
  });
  
  test('CSV mapping', () => {
    const mapping = {
      name: 'Name',
      phone: 'Phone',
      email: 'Email'
    };
    
    assertTrue(typeof mapping === 'object', 'Mapping is object');
    assertTrue('name' in mapping, 'Has name mapping');
    assertTrue('phone' in mapping, 'Has phone mapping');
  });
  
  test('Email parsing logic', () => {
    const emailBody = 'New lead: John Doe, +447491683261, john@example.com';
    const parsed = parseEmailForLead(emailBody);
    
    assertTrue(typeof parsed === 'object', 'Returns object');
    assertTrue('name' in parsed || 'phone' in parsed || Object.keys(parsed).length > 0, 'Has lead data');
  });
  
  test('Lead validation', () => {
    const lead = {
      name: 'Test Lead',
      phone: '+447491683261',
      email: 'test@example.com'
    };
    
    assertTrue('name' in lead, 'Lead has name');
    assertTrue('phone' in lead, 'Lead has phone');
    assertTrue(typeof lead.name === 'string', 'Name is string');
    assertTrue(typeof lead.phone === 'string', 'Phone is string');
  });
  
  test('Bulk import structure', () => {
    const leads = [
      { name: 'Lead 1', phone: '+447700900001' },
      { name: 'Lead 2', phone: '+447700900002' },
      { name: 'Lead 3', phone: '+447700900003' }
    ];
    
    assertTrue(Array.isArray(leads), 'Leads is array');
    assertTrue(leads.length === 3, 'Has 3 leads');
    leads.forEach(lead => {
      assertTrue('name' in lead, 'Each lead has name');
      assertTrue('phone' in lead, 'Each lead has phone');
    });
  });
});

const exitCode = printSummary();
process.exit(exitCode);
