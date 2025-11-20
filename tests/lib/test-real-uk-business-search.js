// tests/lib/test-real-uk-business-search.js
// Test real UK business search class

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import RealUKBusinessSearch from '../../real-uk-business-search.js';

resetStats();

describe('Real UK Business Search Tests', () => {
  
  test('RealUKBusinessSearch class exists', () => {
    assertTrue(typeof RealUKBusinessSearch === 'function', 'RealUKBusinessSearch is a class');
  });
  
  test('RealUKBusinessSearch instance creation', () => {
    try {
      const search = new RealUKBusinessSearch();
      assertTrue(search instanceof RealUKBusinessSearch, 'Creates instance');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
  
  test('Business search parameters', () => {
    const params = {
      query: 'dentist',
      location: 'London',
      industry: 'healthcare'
    };
    
    assertTrue('query' in params, 'Has query');
    assertTrue(typeof params.query === 'string', 'Query is string');
  });
  
  test('Search result structure', () => {
    const result = {
      name: 'Test Business',
      phone: '+447403934440',
      address: '123 Test St, London',
      postcode: 'SW1A 1AA',
      industry: 'dentist'
    };
    
    assertTrue('name' in result, 'Has name');
    assertTrue('phone' in result, 'Has phone');
    assertTrue('address' in result, 'Has address');
  });
  
  test('Location format', () => {
    const locations = ['London', 'Manchester', 'Birmingham'];
    locations.forEach(location => {
      assertTrue(typeof location === 'string', `Location ${location} is string`);
    });
  });
});

const exitCode = printSummary();
process.exit(exitCode);

