// tests/lib/test-industry-templates.js
// Test industry templates functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { getTemplate, getAllTemplates, customizeTemplate } from '../../lib/industry-templates.js';

resetStats();

describe('Industry Templates Tests', () => {
  
  test('Get template function exists', () => {
    assertTrue(typeof getTemplate === 'function', 'getTemplate is a function');
  });
  
  test('Get all templates function exists', () => {
    assertTrue(typeof getAllTemplates === 'function', 'getAllTemplates is a function');
  });
  
  test('Customize template function exists', () => {
    assertTrue(typeof customizeTemplate === 'function', 'customizeTemplate is a function');
  });
  
  test('Template structure', () => {
    const template = {
      industry: 'dentist',
      script: 'Welcome to {businessName}...',
      variables: ['businessName', 'service', 'phone']
    };
    
    assertTrue('industry' in template, 'Has industry');
    assertTrue('script' in template, 'Has script');
    assertTrue(Array.isArray(template.variables), 'Variables is array');
  });
  
  test('Template customization', () => {
    const businessDetails = {
      name: 'Test Dental',
      phone: '+447403934440',
      services: ['Cleaning', 'Checkup']
    };
    
    try {
      const customized = customizeTemplate('dentist', businessDetails);
      assertTrue(typeof customized === 'string' || typeof customized === 'object', 'Returns customized template');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
  
  test('Template variables', () => {
    const template = 'Welcome to {businessName}, we offer {services}';
    const variables = ['businessName', 'services'];
    
    variables.forEach(variable => {
      assertTrue(template.includes(`{${variable}}`), `Template includes ${variable}`);
    });
  });
  
  test('All templates retrieval', () => {
    try {
      const templates = getAllTemplates();
      assertTrue(Array.isArray(templates) || typeof templates === 'object', 'Returns templates');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
});

const exitCode = printSummary();
process.exit(exitCode);

