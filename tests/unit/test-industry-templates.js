// tests/unit/test-industry-templates.js
// Test industry templates

import { getTemplate, getAllTemplates, customizeTemplate } from '../../lib/industry-templates.js';
import { describe, test, assertNotNull, assertTrue, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Industry Templates Tests', () => {
  
  test('Get template for industry', () => {
    const template = getTemplate('healthcare');
    assertNotNull(template, 'Template returned for healthcare');
  });
  
  test('Get all templates', () => {
    const templates = getAllTemplates();
    assertTrue(Array.isArray(templates), 'All templates returns array');
    assertTrue(templates.length > 0, 'Templates array not empty');
  });
  
  test('Customize template', () => {
    const template = getTemplate('healthcare');
    if (template) {
      const customized = customizeTemplate('healthcare', {
        businessName: 'Test Clinic',
        services: ['Consultation', 'Checkup']
      });
      assertNotNull(customized, 'Customized template returned');
    }
  });
  
  test('Template for unknown industry', () => {
    const template = getTemplate('unknown-industry');
    // Should return default or null
    assertTrue(template === null || typeof template === 'object', 'Unknown industry handled');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

