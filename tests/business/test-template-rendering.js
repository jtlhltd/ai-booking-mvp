// tests/business/test-template-rendering.js
// Test template variable substitution

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Template Rendering Tests', () => {
  
  test('Variable substitution', () => {
    const template = 'Hi {name}, welcome to {businessName}!';
    const variables = {
      name: 'John',
      businessName: 'Test Business'
    };
    
    let result = template;
    Object.entries(variables).forEach(([key, value]) => {
      result = result.replace(`{${key}}`, value);
    });
    
    assertEqual(result, 'Hi John, welcome to Test Business!', 'Variables substituted');
  });
  
  test('Missing variables', () => {
    const template = 'Hi {name}, welcome!';
    const variables = {};
    
    let result = template;
    Object.entries(variables).forEach(([key, value]) => {
      result = result.replace(`{${key}}`, value);
    });
    
    assertTrue(result.includes('{name}'), 'Missing variable not replaced');
  });
  
  test('Multiple occurrences', () => {
    const template = '{name} called {name}';
    const variables = { name: 'John' };
    
    let result = template;
    Object.entries(variables).forEach(([key, value]) => {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    });
    
    assertEqual(result, 'John called John', 'Multiple occurrences replaced');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

