// tests/integration/db/connection-pool.test.js
// Integration tests for database connection pool

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { query, pool } from '../../../db.js';

describe('Database Connection Pool', () => {
  beforeAll(async () => {
    // Ensure database is initialized
    if (!pool) {
      await import('../../../db.js');
    }
  });
  
  test('should execute simple query', async () => {
    const result = await query('SELECT 1 as test');
    expect(result.rows[0].test).toBe(1);
  });
  
  test('should handle connection pool correctly', async () => {
    if (!pool) {
      // Skip if no pool (SQLite mode)
      return;
    }
    
    const initialTotal = pool.totalCount || 0;
    const initialIdle = pool.idleCount || 0;
    
    // Execute a query
    await query('SELECT 1');
    
    // Pool should still be healthy
    const afterTotal = pool.totalCount || 0;
    expect(afterTotal).toBeGreaterThanOrEqual(initialTotal);
  });
  
  test('should handle transaction correctly', async () => {
    const { withTransaction } = await import('../../../db.js');
    
    let transactionExecuted = false;
    await withTransaction(async (txQuery) => {
      const result = await txQuery('SELECT 1 as test');
      expect(result.rows[0].test).toBe(1);
      transactionExecuted = true;
    });
    
    expect(transactionExecuted).toBe(true);
  });
});

