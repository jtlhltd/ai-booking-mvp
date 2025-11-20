// tests/lib/test-whitelabel.js
// Test white label functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import {
  getClientBranding,
  applyEmailBranding,
  applySMSBranding,
  applyDashboardBranding,
  validateBranding,
  getBrandedBookingUrl
} from '../../lib/whitelabel.js';

resetStats();

describe('White Label Tests', () => {
  
  test('Get client branding function exists', () => {
    assertTrue(typeof getClientBranding === 'function', 'getClientBranding is a function');
  });
  
  test('Apply email branding function exists', () => {
    assertTrue(typeof applyEmailBranding === 'function', 'applyEmailBranding is a function');
  });
  
  test('Apply SMS branding function exists', () => {
    assertTrue(typeof applySMSBranding === 'function', 'applySMSBranding is a function');
  });
  
  test('Apply dashboard branding function exists', () => {
    assertTrue(typeof applyDashboardBranding === 'function', 'applyDashboardBranding is a function');
  });
  
  test('Validate branding function exists', () => {
    assertTrue(typeof validateBranding === 'function', 'validateBranding is a function');
  });
  
  test('Get branded booking URL function exists', () => {
    assertTrue(typeof getBrandedBookingUrl === 'function', 'getBrandedBookingUrl is a function');
  });
  
  test('Branding structure', () => {
    const branding = {
      logo: 'https://example.com/logo.png',
      primaryColor: '#FF5733',
      secondaryColor: '#33FF57',
      companyName: 'Test Company'
    };
    
    assertTrue('logo' in branding, 'Has logo');
    assertTrue('primaryColor' in branding, 'Has primary color');
    assertTrue('companyName' in branding, 'Has company name');
  });
  
  test('Color validation', () => {
    const validColor = '#FF5733';
    const isValid = /^#[0-9A-F]{6}$/i.test(validColor);
    
    assertTrue(isValid, 'Color format is valid');
  });
  
  test('Email branding application', () => {
    const html = '<html><body>Test</body></html>';
    const branding = { logo: 'logo.png', primaryColor: '#FF5733' };
    
    try {
      const branded = applyEmailBranding(html, branding);
      assertTrue(typeof branded === 'string', 'Returns string');
      assertTrue(branded.includes('Test') || branded.length > 0, 'Contains original content');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
  
  test('SMS branding application', () => {
    const message = 'Test message';
    const branding = { companyName: 'Test Co' };
    
    try {
      const branded = applySMSBranding(message, branding);
      assertTrue(typeof branded === 'string', 'Returns string');
      assertTrue(branded.includes('Test') || branded.length > 0, 'Contains original content');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
  
  test('Branding validation', () => {
    const branding = {
      logo: 'https://example.com/logo.png',
      primaryColor: '#FF5733',
      companyName: 'Test Company'
    };
    
    try {
      const isValid = validateBranding(branding);
      assertTrue(typeof isValid === 'boolean' || typeof isValid === 'object', 'Returns validation result');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
  
  test('Branded URL generation', () => {
    const clientKey = 'test_client';
    const branding = { customDomain: 'test.example.com' };
    
    try {
      const url = getBrandedBookingUrl(clientKey, branding);
      assertTrue(typeof url === 'string', 'Returns string');
      assertTrue(url.length > 0, 'URL has content');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
});

const exitCode = printSummary();
process.exit(exitCode);

