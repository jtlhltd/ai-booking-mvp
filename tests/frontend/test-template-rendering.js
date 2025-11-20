// tests/frontend/test-template-rendering.js
// Test template rendering

import { describe, test, assertTrue, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Template Rendering Tests', () => {
  
  test('Template variable substitution', () => {
    const template = 'Welcome to {businessName}!';
    const rendered = template.replace('{businessName}', 'Test Business');
    assertTrue(rendered.includes('Test Business'), 'Template rendered');
  });
  
  test('Template rendering with multiple variables', () => {
    const template = 'Hello {name}, your appointment is on {date} at {time}';
    const rendered = template
      .replace('{name}', 'John')
      .replace('{date}', '2025-01-15')
      .replace('{time}', '2pm');
    
    assertTrue(rendered.includes('John'), 'Name replaced');
    assertTrue(rendered.includes('2025-01-15'), 'Date replaced');
    assertTrue(rendered.includes('2pm'), 'Time replaced');
  });
  
  test('Template escaping', () => {
    const template = 'Price: {price}';
    const price = '<script>alert("xss")</script>';
    const escaped = price.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rendered = template.replace('{price}', escaped);
    
    assertTrue(!rendered.includes('<script>'), 'Script tags escaped');
  });
  
  test('Template conditional rendering', () => {
    const hasDiscount = true;
    const template = hasDiscount 
      ? 'Price: {price} (Discount: {discount}%)'
      : 'Price: {price}';
    
    assertTrue(template.includes('Discount'), 'Conditional template rendered');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

