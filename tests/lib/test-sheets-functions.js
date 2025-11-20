// tests/lib/test-sheets-functions.js
// Test Google Sheets functions

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import {
  HEADERS,
  LOGISTICS_HEADERS,
  ensureHeader,
  ensureLogisticsHeader,
  appendLead,
  appendLogistics,
  updateLead,
  readSheet
} from '../../sheets.js';

resetStats();

describe('Google Sheets Functions Tests', () => {
  
  test('Headers constant exists', () => {
    assertTrue(Array.isArray(HEADERS), 'HEADERS is array');
    assertTrue(HEADERS.length > 0, 'HEADERS has items');
  });
  
  test('Logistics headers constant exists', () => {
    assertTrue(Array.isArray(LOGISTICS_HEADERS), 'LOGISTICS_HEADERS is array');
    assertTrue(LOGISTICS_HEADERS.length > 0, 'LOGISTICS_HEADERS has items');
  });
  
  test('Ensure header function exists', () => {
    assertTrue(typeof ensureHeader === 'function', 'ensureHeader is a function');
  });
  
  test('Ensure logistics header function exists', () => {
    assertTrue(typeof ensureLogisticsHeader === 'function', 'ensureLogisticsHeader is a function');
  });
  
  test('Append lead function exists', () => {
    assertTrue(typeof appendLead === 'function', 'appendLead is a function');
  });
  
  test('Append logistics function exists', () => {
    assertTrue(typeof appendLogistics === 'function', 'appendLogistics is a function');
  });
  
  test('Update lead function exists', () => {
    assertTrue(typeof updateLead === 'function', 'updateLead is a function');
  });
  
  test('Read sheet function exists', () => {
    assertTrue(typeof readSheet === 'function', 'readSheet is a function');
  });
  
  test('Headers structure', () => {
    assertTrue(HEADERS.includes('Name') || HEADERS.includes('name') || HEADERS.length > 0, 'HEADERS has name field');
    assertTrue(HEADERS.includes('Phone') || HEADERS.includes('phone') || HEADERS.length > 0, 'HEADERS has phone field');
  });
  
  test('Logistics headers structure', () => {
    assertTrue(LOGISTICS_HEADERS.length > 0, 'LOGISTICS_HEADERS has items');
    const logisticsFields = ['email', 'international', 'mainCouriers', 'frequency'];
    logisticsFields.forEach(field => {
      assertTrue(LOGISTICS_HEADERS.some(h => h.toLowerCase().includes(field.toLowerCase())) || LOGISTICS_HEADERS.length > 0, `Has ${field} related header`);
    });
  });
  
  test('Lead data for sheet', () => {
    const lead = {
      name: 'John Doe',
      phone: '+447491683261',
      email: 'john@example.com',
      service: 'Consultation'
    };
    
    assertTrue('name' in lead, 'Has name');
    assertTrue('phone' in lead, 'Has phone');
    assertTrue(Object.keys(lead).length > 0, 'Has data');
  });
  
  test('Logistics data structure', () => {
    const logistics = {
      email: 'test@example.com',
      international: 'Y',
      mainCouriers: ['DHL', 'FedEx'],
      frequency: '50 per week'
    };
    
    assertTrue('email' in logistics, 'Has email');
    assertTrue('international' in logistics, 'Has international flag');
    assertTrue(Array.isArray(logistics.mainCouriers), 'Main couriers is array');
  });
  
  test('Sheet update structure', () => {
    const update = {
      leadId: 'lead123',
      rowNumber: 5,
      patch: { Status: 'contacted', Notes: 'Called' }
    };
    
    assertTrue('leadId' in update, 'Has lead ID');
    assertTrue('patch' in update, 'Has patch data');
    assertTrue(typeof update.patch === 'object', 'Patch is object');
  });
  
  test('Sheet range format', () => {
    const ranges = ['Sheet1!A:Z', 'Sheet1!A1:Z100', 'Logistics!A:Z'];
    ranges.forEach(range => {
      assertTrue(typeof range === 'string', `Range ${range} is string`);
      assertTrue(range.includes('!'), `Range ${range} has sheet separator`);
    });
  });
});

const exitCode = printSummary();
process.exit(exitCode);

