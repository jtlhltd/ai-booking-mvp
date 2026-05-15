import { afterEach, describe, expect, jest, test } from '@jest/globals';

import {
  clearClientDashboardResponseCache,
  computeClientDashboardEtag,
  clientDashboardCacheKey,
  getCachedClientDashboard,
  getClientDashboardCacheTtlMs,
  setCachedClientDashboard
} from '../../../lib/client-dashboard-response-cache.js';

afterEach(() => {
  clearClientDashboardResponseCache();
  delete process.env.CLIENT_DASHBOARD_CACHE_MS;
  delete process.env.DEMO_DASHBOARD_CACHE_MS;
});

describe('lib/client-dashboard-response-cache', () => {
  test('computeClientDashboardEtag is stable for same metrics', () => {
    const payload = {
      metrics: { totalLeads: 10, totalCalls: 5, bookingsThisWeek: 1, last24hLeads: 2 },
      recentCalls: [{ callId: 'a' }],
      leads: [{ id: 'l1' }],
      touchpoints: { data: [1, 2] },
      outreachCapacity: { leadsNeverDialed: 3, callQueuePending: 0, dialAttemptsLast24h: 1, activityState: 'idle', lastDialAttemptAt: null }
    };
    const a = computeClientDashboardEtag(payload);
    const b = computeClientDashboardEtag(payload);
    expect(a).toBe(b);
    expect(a).toMatch(/^"[a-f0-9]{40}"$/);
  });

  test('cache key separates brief vs full', () => {
    expect(clientDashboardCacheKey('c1', true)).not.toBe(clientDashboardCacheKey('c1', false));
  });

  test('getCachedClientDashboard returns null after TTL', () => {
    jest.useFakeTimers();
    const key = clientDashboardCacheKey('c1', true);
    setCachedClientDashboard(key, '"abc"', { ok: true }, 1000);
    expect(getCachedClientDashboard(key)).toBeTruthy();
    jest.advanceTimersByTime(1001);
    expect(getCachedClientDashboard(key)).toBeNull();
    jest.useRealTimers();
  });

  test('getClientDashboardCacheTtlMs respects env and legacy alias', () => {
    process.env.CLIENT_DASHBOARD_CACHE_MS = '0';
    expect(getClientDashboardCacheTtlMs()).toBe(0);
    delete process.env.CLIENT_DASHBOARD_CACHE_MS;
    process.env.DEMO_DASHBOARD_CACHE_MS = '15000';
    expect(getClientDashboardCacheTtlMs()).toBe(15000);
  });
});
