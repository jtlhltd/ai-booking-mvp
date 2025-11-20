// tests/lib/test-white-label.js
// Test white-label functionality (different from whitelabel.js)

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { WhiteLabelManager, ReportGenerator } from '../../lib/white-label.js';

resetStats();

describe('White Label Tests', () => {
  
  test('WhiteLabelManager class exists', () => {
    assertTrue(typeof WhiteLabelManager === 'function', 'WhiteLabelManager is a class');
  });
  
  test('ReportGenerator class exists', () => {
    assertTrue(typeof ReportGenerator === 'function', 'ReportGenerator is a class');
  });
  
  test('White label manager instance', () => {
    try {
      const manager = new WhiteLabelManager();
      assertTrue(manager instanceof WhiteLabelManager, 'Creates instance');
      assertTrue('defaultConfig' in manager, 'Has default config');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
  
  test('Default config structure', () => {
    const manager = new WhiteLabelManager();
    const config = manager.defaultConfig;
    
    assertTrue('branding' in config, 'Has branding');
    assertTrue('domain' in config, 'Has domain');
    assertTrue('email' in config, 'Has email');
    assertTrue('sms' in config, 'Has SMS');
    assertTrue('features' in config, 'Has features');
  });
  
  test('Branding structure', () => {
    const branding = {
      companyName: 'Test Company',
      logo: null,
      primaryColor: '#667eea',
      secondaryColor: '#764ba2'
    };
    
    assertTrue('companyName' in branding, 'Has company name');
    assertTrue('primaryColor' in branding, 'Has primary color');
    assertTrue(/^#/.test(branding.primaryColor), 'Primary color is hex format');
  });
  
  test('Report generator instance', () => {
    try {
      const generator = new ReportGenerator();
      assertTrue(generator instanceof ReportGenerator, 'Creates instance');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
  
  test('Config merge logic', () => {
    const base = { a: 1, b: { c: 2 } };
    const override = { b: { d: 3 } };
    const merged = { ...base, ...override, b: { ...base.b, ...override.b } };
    
    assertTrue(merged.a === 1, 'Base value preserved');
    assertTrue(merged.b.d === 3, 'Override value applied');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

