// tests/security/test-input-validation.js
// Test input validation

import { validateEmail, validatePhone, sanitizeString } from '../../lib/utils.js';
import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Input Validation Tests', () => {
  
  test('Email validation', () => {
    const validEmails = ['test@example.com', 'user.name@domain.co.uk'];
    const invalidEmails = ['notanemail', '@domain.com'];
    
    validEmails.forEach(email => {
      assertTrue(validateEmail(email), `Valid email: ${email}`);
    });
  });
  
  test('Phone validation', () => {
    const validPhones = ['+447491683261', '+442071234567'];
    validPhones.forEach(phone => {
      assertTrue(typeof validatePhone(phone) === 'boolean', `Phone validation: ${phone}`);
    });
  });
  
  test('String sanitization', () => {
    const dirty = '<script>alert("xss")</script>Hello';
    const clean = sanitizeString(dirty);
    assertTrue(!clean.includes('<script>'), 'Script tags removed');
    assertTrue(clean.includes('Hello'), 'Valid content preserved');
  });
  
  test('SQL injection prevention', () => {
    const malicious = "'; DROP TABLE users; --";
    const sanitized = sanitizeString(malicious);
    assertTrue(!sanitized.includes('DROP'), 'SQL injection attempt sanitized');
  });
  
  test('XSS prevention', () => {
    const xss = '<img src=x onerror=alert(1)>';
    const sanitized = sanitizeString(xss);
    assertTrue(!sanitized.includes('onerror'), 'XSS attempt sanitized');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

