import { describe, test, expect } from '@jest/globals';

import { sqlHoursAgo, sqlDaysAgo } from '../../lib/sql-relative-interval.js';

describe('lib/sql-relative-interval', () => {
  test('sqlHoursAgo uses Postgres interval when isPostgres', () => {
    expect(sqlHoursAgo(true, 1)).toMatch(/NOW\(\)/);
    expect(sqlHoursAgo(true, 3)).toContain("3 hours");
  });

  test('sqlHoursAgo uses sqlite datetime when not Postgres', () => {
    expect(sqlHoursAgo(false, 1)).toContain("datetime('now'");
    expect(sqlHoursAgo(false, 2)).toContain('-2 hours');
  });

  test('sqlDaysAgo uses Postgres interval when isPostgres', () => {
    expect(sqlDaysAgo(true, 1)).toMatch(/NOW\(\)/);
    expect(sqlDaysAgo(true, 7)).toContain('7 days');
  });

  test('sqlDaysAgo uses sqlite datetime when not Postgres', () => {
    expect(sqlDaysAgo(false, 1)).toContain("datetime('now'");
    expect(sqlDaysAgo(false, 30)).toContain('-30 days');
  });
});
