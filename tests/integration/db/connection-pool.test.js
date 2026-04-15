// tests/integration/db/connection-pool.test.js
// Integration tests for database connection pool

import { describe, test, expect, beforeAll } from '@jest/globals';

describe('Database Connection Pool', () => {
  let query, pool, withTransaction;
  
  beforeAll(async () => {
    // Import database functions
    const dbModule = await import('../../../db.js');
    query = dbModule.query;
    pool = dbModule.pool;
    withTransaction = dbModule.withTransaction;
    
    // Initialize database if needed
    if (!pool && !dbModule.sqlite) {
      try {
        await dbModule.init();
      } catch (error) {
        console.warn('Database initialization skipped in test:', error.message);
      }
    }
  });
  
  test('should execute simple query', async () => {
    expect(query).toBeDefined();
    const result = await query('SELECT 1 as test');
    expect(result?.rows).toBeDefined();
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0].test).toBe(1);
  });
  
  test('should handle connection pool correctly', async () => {
    if (!pool) {
      expect(pool).toBeNull();
      return;
    }
    
    expect(query).toBeDefined();

    const initialTotal = pool.totalCount || 0;
    const initialIdle = pool.idleCount || 0;
    
    // Execute a query
    const result = await query('SELECT 1');
    expect(result?.rows).toBeDefined();

    // Pool should still be healthy
    const afterTotal = pool.totalCount || 0;
    expect(afterTotal).toBeGreaterThanOrEqual(initialTotal);
  });
  
  test('should handle transaction correctly', async () => {
    expect(withTransaction).toBeDefined();

    let transactionExecuted = false;
    await withTransaction(async (txQuery) => {
      const result = await txQuery('SELECT 1 as test');
      expect(result?.rows).toBeDefined();
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].test).toBe(1);
      transactionExecuted = true;
    });

    expect(transactionExecuted).toBe(true);
  });
});

