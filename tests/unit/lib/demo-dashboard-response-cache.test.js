import { afterEach, describe, expect, jest, test } from '@jest/globals';

import {
  clearDemoDashboardResponseCache,
  computeDemoDashboardEtag,
  demoDashboardCacheKey,
  getCachedDemoDashboard,
  getDemoDashboardCacheTtlMs,
  setCachedDemoDashboard
} from '../../../lib/demo-dashboard-response-cache.js';

afterEach(() => {
  clearDemoDashboardResponseCache();
  delete process.env.DEMO_DASHBOARD_CACHE_MS;
});

describe('lib/demo-dashboard-response-cache', () => {
  test('computeDemoDashboardEtag is stable for same metrics', () => {
    const payload = {
      metrics: { totalLeads: 10, totalCalls: 5, bookingsThisWeek: 1, last24hLeads: 2 },
      recentCalls: [{ callId: 'a' }],
      leads: [{ id: 'l1' }],
      touchpoints: { data: [1, 2] },
      outreachCapacity: { leadsNeverDialed: 3, callQueuePending: 0, dialAttemptsLast24h: 1, activityState: 'idle', lastDialAttemptAt: null }
    };
    const a = computeDemoDashboardEtag(payload);
    const b = computeDemoDashboardEtag(payload);
    expect(a).toBe(b);
    expect(a).toMatch(/^"[a-f0-9]{40}"$/);
  });

  test('cache key separates brief vs full', () => {
    expect(demoDashboardCacheKey('c1', true)).not.toBe(demoDashboardCacheKey('c1', false));
  });

  test('getCachedDemoDashboard returns null after TTL', () => {
    jest.useFakeTimers();
    const key = demoDashboardCacheKey('c1', true);
    setCachedDemoDashboard(key, '"abc"', { ok: true }, 1000);
    expect(getCachedDemoDashboard(key)).toBeTruthy();
    jest.advanceTimersByTime(1001);
    expect(getCachedDemoDashboard(key)).toBeNull();
    jest.useRealTimers();
  });

  test('getDemoDashboardCacheTtlMs respects env', () => {
    process.env.DEMO_DASHBOARD_CACHE_MS = '0';
    expect(getDemoDashboardCacheTtlMs()).toBe(0);
    process.env.DEMO_DASHBOARD_CACHE_MS = '15000';
    expect(getDemoDashboardCacheTtlMs()).toBe(15000);
  });
});
