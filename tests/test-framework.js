// Comprehensive Testing Framework
// Provides unit tests, integration tests, and performance tests

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import { app } from '../server/app.js';
import { getCache } from '../lib/cache.js';
import { getRetryManager } from '../lib/retry-logic.js';

/**
 * Test Utilities
 */
export class TestUtils {
  static generateTestClient(overrides = {}) {
    return {
      businessName: `Test Business ${Date.now()}`,
      industry: 'healthcare',
      ownerEmail: `test${Date.now()}@example.com`,
      ownerPhone: '+447700900000',
      timezone: 'Europe/London',
      locale: 'en-GB',
      ...overrides
    };
  }

  static generateTestLead(overrides = {}) {
    return {
      name: `Test Lead ${Date.now()}`,
      phone: '+447700900001',
      email: `lead${Date.now()}@example.com`,
      service: 'consultation',
      source: 'website',
      ...overrides
    };
  }

  static async createTestClient(apiKey) {
    const clientData = this.generateTestClient();
    const response = await request(app)
      .post('/api/clients')
      .set('X-API-Key', apiKey)
      .send(clientData);
    
    return { clientData, response };
  }

  static async cleanupTestData(clientKey) {
    // Clean up test data
    try {
      await request(app)
        .delete(`/api/clients/${clientKey}`)
        .set('X-API-Key', process.env.TEST_API_KEY);
    } catch (error) {
      console.warn('Cleanup failed:', error.message);
    }
  }
}

/**
 * Database Test Utilities
 */
export class DatabaseTestUtils {
  constructor(db) {
    this.db = db;
  }

  async clearTestData() {
    const tables = ['leads', 'calls', 'appointments', 'tenants'];
    for (const table of tables) {
      await this.db.query(`DELETE FROM ${table} WHERE client_key LIKE 'test_%'`);
    }
  }

  async createTestTenant(clientKey) {
    await this.db.query(`
      INSERT INTO tenants (client_key, display_name, timezone, locale, is_enabled)
      VALUES ($1, $2, $3, $4, $5)
    `, [clientKey, 'Test Client', 'Europe/London', 'en-GB', true]);
  }

  async createTestLead(clientKey, leadData) {
    const result = await this.db.query(`
      INSERT INTO leads (client_key, name, phone, email, service, source)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [clientKey, leadData.name, leadData.phone, leadData.email, leadData.service, leadData.source]);
    
    return result.rows[0];
  }
}

/**
 * Mock External Services
 */
export class MockServices {
  static mockVapiAPI() {
    const mockVapi = {
      calls: {
        create: jest.fn().mockResolvedValue({
          data: {
            id: 'test-call-id',
            status: 'queued'
          }
        }),
        get: jest.fn().mockResolvedValue({
          data: {
            id: 'test-call-id',
            status: 'completed',
            outcome: 'booked',
            duration: 120,
            cost: 0.05
          }
        })
      }
    };
    
    return mockVapi;
  }

  static mockTwilioAPI() {
    const mockTwilio = {
      messages: {
        create: jest.fn().mockResolvedValue({
          sid: 'test-message-sid',
          status: 'sent'
        })
      }
    };
    
    return mockTwilio;
  }

  static mockGoogleCalendar() {
    const mockCalendar = {
      events: {
        insert: jest.fn().mockResolvedValue({
          data: {
            id: 'test-event-id',
            summary: 'Test Event'
          }
        }),
        list: jest.fn().mockResolvedValue({
          data: {
            items: []
          }
        })
      }
    };
    
    return mockCalendar;
  }
}

/**
 * Performance Test Utilities
 */
export class PerformanceTestUtils {
  static async measureResponseTime(endpoint, method = 'GET', data = null) {
    const start = Date.now();
    
    let requestBuilder = request(app)[method.toLowerCase()](endpoint);
    
    if (data) {
      requestBuilder = requestBuilder.send(data);
    }
    
    const response = await requestBuilder;
    const duration = Date.now() - start;
    
    return {
      duration,
      statusCode: response.status,
      responseSize: JSON.stringify(response.body).length
    };
  }

  static async loadTest(endpoint, concurrentRequests = 10, method = 'GET', data = null) {
    const promises = Array(concurrentRequests).fill().map(() => 
      this.measureResponseTime(endpoint, method, data)
    );
    
    const results = await Promise.all(promises);
    
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    const maxDuration = Math.max(...results.map(r => r.duration));
    const minDuration = Math.min(...results.map(r => r.duration));
    const errorCount = results.filter(r => r.statusCode >= 400).length;
    
    return {
      totalRequests: concurrentRequests,
      avgDuration: Math.round(avgDuration),
      maxDuration,
      minDuration,
      errorCount,
      errorRate: (errorCount / concurrentRequests * 100).toFixed(2) + '%'
    };
  }
}

/**
 * Test Suites
 */
export class TestSuites {
  static async runUnitTests() {
    describe('Unit Tests', () => {
      describe('Error Handling', () => {
        test('should create ValidationError with correct properties', () => {
          const { ValidationError } = require('../lib/errors.js');
          const error = new ValidationError('Invalid input', 'email', 'invalid-email');
          
          expect(error.message).toBe('Invalid input');
          expect(error.statusCode).toBe(400);
          expect(error.code).toBe('VALIDATION_ERROR');
          expect(error.field).toBe('email');
          expect(error.value).toBe('invalid-email');
        });

        test('should create NotFoundError with correct properties', () => {
          const { NotFoundError } = require('../lib/errors.js');
          const error = new NotFoundError('Client');
          
          expect(error.message).toBe('Client not found');
          expect(error.statusCode).toBe(404);
          expect(error.code).toBe('NOT_FOUND');
          expect(error.resource).toBe('Client');
        });
      });

      describe('Retry Logic', () => {
        test('should retry failed operations', async () => {
          const retryManager = getRetryManager({ maxRetries: 2, baseDelay: 10 });
          let attemptCount = 0;
          
          const result = await retryManager.execute(
            () => {
              attemptCount++;
              if (attemptCount < 2) {
                throw new Error('Temporary failure');
              }
              return 'success';
            },
            { operation: 'test_retry' }
          );
          
          expect(result).toBe('success');
          expect(attemptCount).toBe(2);
        });

        test('should fail after max retries', async () => {
          const retryManager = getRetryManager({ maxRetries: 2, baseDelay: 10 });
          
          await expect(
            retryManager.execute(
              () => {
                throw new Error('Persistent failure');
              },
              { operation: 'test_failure' }
            )
          ).rejects.toThrow('Persistent failure');
        });
      });

      describe('Cache', () => {
        test('should store and retrieve values', () => {
          const cache = getCache();
          
          cache.set('test-key', 'test-value', 1000);
          const value = cache.get('test-key');
          
          expect(value).toBe('test-value');
        });

        test('should expire values after TTL', async () => {
          const cache = getCache();
          
          cache.set('test-key', 'test-value', 100); // 100ms TTL
          
          // Wait for expiration
          await new Promise(resolve => setTimeout(resolve, 150));
          
          const value = cache.get('test-key');
          expect(value).toBeNull();
        });
      });
    });
  }

  static async runIntegrationTests() {
    describe('Integration Tests', () => {
      const testApiKey = process.env.TEST_API_KEY || 'test-api-key';
      let testClientKey;

      beforeEach(async () => {
        // Clear cache before each test
        const cache = getCache();
        cache.clear();
      });

      afterEach(async () => {
        // Cleanup test data
        if (testClientKey) {
          await TestUtils.cleanupTestData(testClientKey);
        }
      });

      describe('Client Management', () => {
        test('should create client successfully', async () => {
          const clientData = TestUtils.generateTestClient();
          
          const response = await request(app)
            .post('/api/clients')
            .set('X-API-Key', testApiKey)
            .send(clientData);
          
          expect(response.status).toBe(201);
          expect(response.body.success).toBe(true);
          expect(response.body.data.clientKey).toBeDefined();
          
          testClientKey = response.body.data.clientKey;
        });

        test('should return 400 for invalid client data', async () => {
          const invalidData = {
            businessName: '', // Invalid empty name
            industry: 'invalid-industry', // Invalid industry
            ownerEmail: 'invalid-email', // Invalid email format
            ownerPhone: '123' // Invalid phone format
          };
          
          const response = await request(app)
            .post('/api/clients')
            .set('X-API-Key', testApiKey)
            .send(invalidData);
          
          expect(response.status).toBe(400);
          expect(response.body.error.code).toBe('VALIDATION_ERROR');
          expect(response.body.error.details).toBeDefined();
        });

        test('should get client by ID', async () => {
          const { clientData } = await TestUtils.createTestClient(testApiKey);
          testClientKey = clientData.businessName.toLowerCase().replace(/\s+/g, '_');
          
          const response = await request(app)
            .get(`/api/clients/${testClientKey}`)
            .set('X-API-Key', testApiKey);
          
          expect(response.status).toBe(200);
          expect(response.body.success).toBe(true);
          expect(response.body.data.clientKey).toBe(testClientKey);
        });

        test('should return 404 for non-existent client', async () => {
          const response = await request(app)
            .get('/api/clients/non-existent-client')
            .set('X-API-Key', testApiKey);
          
          expect(response.status).toBe(404);
          expect(response.body.error.code).toBe('NOT_FOUND');
        });
      });

      describe('Lead Management', () => {
        beforeEach(async () => {
          const { clientData } = await TestUtils.createTestClient(testApiKey);
          testClientKey = clientData.businessName.toLowerCase().replace(/\s+/g, '_');
        });

        test('should import leads successfully', async () => {
          const leadsData = {
            leads: [
              TestUtils.generateTestLead(),
              TestUtils.generateTestLead()
            ]
          };
          
          const response = await request(app)
            .post(`/api/clients/${testClientKey}/leads`)
            .set('X-API-Key', testApiKey)
            .send(leadsData);
          
          expect(response.status).toBe(201);
          expect(response.body.success).toBe(true);
          expect(response.body.data.imported).toBe(2);
        });

        test('should get leads with pagination', async () => {
          const response = await request(app)
            .get(`/api/clients/${testClientKey}/leads`)
            .set('X-API-Key', testApiKey)
            .query({ limit: 10, offset: 0 });
          
          expect(response.status).toBe(200);
          expect(response.body.success).toBe(true);
          expect(response.body.data).toBeDefined();
          expect(response.body.pagination).toBeDefined();
        });
      });

      describe('Authentication', () => {
        test('should reject requests without API key', async () => {
          const response = await request(app)
            .get('/api/clients');
          
          expect(response.status).toBe(401);
          expect(response.body.error.code).toBe('MISSING_API_KEY');
        });

        test('should reject requests with invalid API key', async () => {
          const response = await request(app)
            .get('/api/clients')
            .set('X-API-Key', 'invalid-key');
          
          expect(response.status).toBe(401);
          expect(response.body.error.code).toBe('INVALID_API_KEY');
        });
      });
    });
  }

  static async runPerformanceTests() {
    describe('Performance Tests', () => {
      const testApiKey = process.env.TEST_API_KEY || 'test-api-key';

      test('API response times should be under 500ms', async () => {
        const endpoints = [
          '/health',
          '/api/stats',
          '/api/clients'
        ];

        for (const endpoint of endpoints) {
          const result = await PerformanceTestUtils.measureResponseTime(endpoint);
          expect(result.duration).toBeLessThan(500);
          expect(result.statusCode).toBeLessThan(400);
        }
      });

      test('should handle concurrent requests', async () => {
        const result = await PerformanceTestUtils.loadTest('/api/stats', 20);
        
        expect(result.avgDuration).toBeLessThan(1000);
        expect(result.errorRate).toBe('0%');
        expect(result.maxDuration).toBeLessThan(2000);
      });

      test('database queries should be optimized', async () => {
        const start = Date.now();
        
        // Simulate a complex query
        const response = await request(app)
          .get('/api/clients')
          .set('X-API-Key', testApiKey)
          .query({ limit: 100 });
        
        const duration = Date.now() - start;
        
        expect(response.status).toBe(200);
        expect(duration).toBeLessThan(200);
      });
    });
  }

  static async runAllTests() {
    await this.runUnitTests();
    await this.runIntegrationTests();
    await this.runPerformanceTests();
  }
}

export default {
  TestUtils,
  DatabaseTestUtils,
  MockServices,
  PerformanceTestUtils,
  TestSuites
};





