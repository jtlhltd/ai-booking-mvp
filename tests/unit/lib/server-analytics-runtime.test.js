import { describe, test, expect, jest, beforeEach } from '@jest/globals';

describe('lib/server-analytics-runtime', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('generateRecommendations adds items from summary thresholds', async () => {
    const { generateRecommendations } = await import('../../../lib/server-analytics-runtime.js');
    const summary = {
      conversionRate: 10,
      costPerConversion: 4,
      avgCallDuration: 400
    };
    const rec = generateRecommendations(summary, []);
    expect(rec.some((r) => r.category === 'conversion_optimization')).toBe(true);
    expect(rec.some((r) => r.category === 'cost_optimization')).toBe(true);
    expect(rec.some((r) => r.category === 'efficiency')).toBe(true);
  });

  test('getCacheKey joins prefix and params', async () => {
    const { getCacheKey } = await import('../../../lib/server-analytics-runtime.js');
    expect(getCacheKey('pre', 'a', 'b')).toBe('pre:a:b');
  });

  test('trackAnalyticsEvent swallows db errors', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      getFullClient: jest.fn(async () => null),
      trackAnalyticsEvent: jest.fn(async () => {
        throw new Error('db_down');
      })
    }));
    const { trackAnalyticsEvent } = await import('../../../lib/server-analytics-runtime.js');
    await expect(
      trackAnalyticsEvent({
        clientKey: 'k',
        eventType: 't',
        eventCategory: 'c',
        eventData: {},
        sessionId: 's',
        userAgent: '',
        ipAddress: ''
      })
    ).resolves.toBeUndefined();
  });

  test('getActiveABTests returns empty array on error', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      getFullClient: jest.fn(async () => null),
      getActiveABTests: jest.fn(async () => {
        throw new Error('db');
      })
    }));
    const { getActiveABTests } = await import('../../../lib/server-analytics-runtime.js');
    await expect(getActiveABTests('k')).resolves.toEqual([]);
  });

  test('selectABTestVariant delegates to outbound-ab-variant', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      getFullClient: jest.fn(async () => null)
    }));
    const pick = jest.fn(async () => ({ name: 'A' }));
    jest.unstable_mockModule('../../../lib/outbound-ab-variant.js', () => ({
      selectABTestVariantForLead: pick
    }));
    const { selectABTestVariant } = await import('../../../lib/server-analytics-runtime.js');
    const out = await selectABTestVariant('c', 'exp', '+1');
    expect(pick).toHaveBeenCalledWith('c', 'exp', '+1');
    expect(out).toEqual({ name: 'A' });
  });

  test('clearCache clears whole cache when pattern omitted', async () => {
    jest.resetModules();
    const clear = jest.fn();
    jest.unstable_mockModule('../../../lib/cache.js', () => ({
      getCache: () => ({
        get: jest.fn(),
        set: jest.fn(),
        clear,
        keys: jest.fn(() => []),
        delete: jest.fn()
      })
    }));
    jest.unstable_mockModule('../../../db.js', () => ({
      getFullClient: jest.fn(async () => null),
      trackAnalyticsEvent: jest.fn(),
      trackConversionStage: jest.fn(),
      recordPerformanceMetric: jest.fn()
    }));
    const { clearCache } = await import('../../../lib/server-analytics-runtime.js');
    clearCache();
    expect(clear).toHaveBeenCalled();
  });
});
