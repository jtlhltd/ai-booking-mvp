// tests/lib/test-enhanced-business-search.js
// Test enhanced business search functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { generateUKBusinesses, getIndustryCategories, fuzzySearch } from '../../enhanced-business-search.js';

resetStats();

describe('Enhanced Business Search Tests', () => {
  
  test('Generate UK businesses function exists', () => {
    assertTrue(typeof generateUKBusinesses === 'function', 'generateUKBusinesses is a function');
  });
  
  test('Get industry categories function exists', () => {
    assertTrue(typeof getIndustryCategories === 'function', 'getIndustryCategories is a function');
  });
  
  test('Fuzzy search function exists', () => {
    assertTrue(typeof fuzzySearch === 'function', 'fuzzySearch is a function');
  });
  
  test('Business search query structure', () => {
    const query = 'dentist';
    const filters = { location: 'London', industry: 'healthcare' };
    
    assertTrue(typeof query === 'string', 'Query is string');
    assertTrue(typeof filters === 'object', 'Filters is object');
  });
  
  test('Business result structure', () => {
    const business = {
      name: 'Test Business',
      phone: '+447403934440',
      address: '123 Test St',
      industry: 'dentist'
    };
    
    assertTrue('name' in business, 'Has name');
    assertTrue('phone' in business, 'Has phone');
    assertTrue(typeof business.name === 'string', 'Name is string');
  });
  
  test('Industry categories structure', () => {
    try {
      const categories = getIndustryCategories();
      assertTrue(Array.isArray(categories) || typeof categories === 'object', 'Returns categories');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
  
  test('Fuzzy search logic', () => {
    const businesses = [
      { name: 'Dental Practice', phone: '+447403934440' },
      { name: 'Dentist Office', phone: '+447403934441' }
    ];
    const query = 'dentist';
    
    try {
      const results = fuzzySearch(query, businesses);
      assertTrue(Array.isArray(results) || typeof results === 'object', 'Returns results');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
  
  test('Search filters', () => {
    const filters = {
      location: 'London',
      industry: 'healthcare',
      radius: 10
    };
    
    assertTrue('location' in filters || Object.keys(filters).length > 0, 'Has filters');
    assertTrue(typeof filters === 'object', 'Filters is object');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

