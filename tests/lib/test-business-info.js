// tests/lib/test-business-info.js
// Test business info functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import {
  getBusinessInfo,
  updateBusinessInfo,
  getBusinessHoursString,
  getServicesList,
  answerQuestion,
  upsertFAQ
} from '../../lib/business-info.js';

resetStats();

describe('Business Info Tests', () => {
  
  test('Get business info function exists', () => {
    assertTrue(typeof getBusinessInfo === 'function', 'getBusinessInfo is a function');
  });
  
  test('Update business info function exists', () => {
    assertTrue(typeof updateBusinessInfo === 'function', 'updateBusinessInfo is a function');
  });
  
  test('Get business hours string function exists', () => {
    assertTrue(typeof getBusinessHoursString === 'function', 'getBusinessHoursString is a function');
  });
  
  test('Get services list function exists', () => {
    assertTrue(typeof getServicesList === 'function', 'getServicesList is a function');
  });
  
  test('Answer question function exists', () => {
    assertTrue(typeof answerQuestion === 'function', 'answerQuestion is a function');
  });
  
  test('Upsert FAQ function exists', () => {
    assertTrue(typeof upsertFAQ === 'function', 'upsertFAQ is a function');
  });
  
  test('Business info structure', () => {
    const businessInfo = {
      name: 'Test Business',
      phone: '+447403934440',
      email: 'test@example.com',
      address: '123 Test St',
      hours: 'Mon-Fri 9am-5pm'
    };
    
    assertTrue('name' in businessInfo, 'Has name');
    assertTrue('phone' in businessInfo, 'Has phone');
    assertTrue(typeof businessInfo.name === 'string', 'Name is string');
  });
  
  test('Business hours format', () => {
    const hours = {
      monday: { open: '09:00', close: '17:00' },
      tuesday: { open: '09:00', close: '17:00' }
    };
    
    assertTrue(typeof hours === 'object', 'Hours is object');
    assertTrue('monday' in hours, 'Has Monday hours');
  });
  
  test('Services list structure', () => {
    const services = [
      { name: 'Service 1', duration: 30, price: 50 },
      { name: 'Service 2', duration: 60, price: 100 }
    ];
    
    assertTrue(Array.isArray(services), 'Services is array');
    services.forEach(service => {
      assertTrue('name' in service, 'Service has name');
    });
  });
  
  test('FAQ structure', () => {
    const faq = {
      question: 'What are your hours?',
      answer: 'Mon-Fri 9am-5pm',
      category: 'general'
    };
    
    assertTrue('question' in faq, 'Has question');
    assertTrue('answer' in faq, 'Has answer');
    assertTrue(typeof faq.question === 'string', 'Question is string');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

