import { describe, expect, test, jest, beforeEach } from '@jest/globals';

describe('lib/quality-monitoring', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  test('monitorCallQuality returns healthy when no calls', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      getCallQualityMetrics: jest.fn().mockResolvedValue(null),
      listClientSummaries: jest.fn(),
      storeQualityAlert: jest.fn()
    }));
    jest.unstable_mockModule('../../../lib/email-alert-outbox.js', () => ({
      enqueueEmailAlert: jest.fn()
    }));
    jest.unstable_mockModule('../../../lib/email-alerts.js', () => ({
      sendQualityAlert: jest.fn()
    }));
    const { monitorCallQuality } = await import('../../../lib/quality-monitoring.js');
    const r = await monitorCallQuality('ck');
    expect(r.healthy).toBe(true);
    expect(r.metrics).toBeNull();
  });

  test('monitorCallQuality generates alert on low success rate', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      getCallQualityMetrics: jest.fn().mockResolvedValue({
        total_calls: '20',
        successful_calls: '5',
        bookings: '0',
        positive_sentiment_count: '2',
        avg_quality_score: '5',
        avg_duration: '60'
      }),
      listClientSummaries: jest.fn(),
      storeQualityAlert: jest.fn()
    }));
    jest.unstable_mockModule('../../../lib/email-alert-outbox.js', () => ({
      enqueueEmailAlert: jest.fn()
    }));
    jest.unstable_mockModule('../../../lib/email-alerts.js', () => ({
      sendQualityAlert: jest.fn()
    }));
    const { monitorCallQuality } = await import('../../../lib/quality-monitoring.js');
    const r = await monitorCallQuality('ck');
    expect(r.alerts.length).toBeGreaterThan(0);
    expect(r.healthy).toBe(false);
  });

  test('monitorAllClients handles empty client list', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      getCallQualityMetrics: jest.fn(),
      listClientSummaries: jest.fn().mockResolvedValue([]),
      storeQualityAlert: jest.fn()
    }));
    jest.unstable_mockModule('../../../lib/email-alert-outbox.js', () => ({
      enqueueEmailAlert: jest.fn()
    }));
    jest.unstable_mockModule('../../../lib/email-alerts.js', () => ({
      sendQualityAlert: jest.fn()
    }));
    const { monitorAllClients } = await import('../../../lib/quality-monitoring.js');
    await expect(monitorAllClients()).resolves.toEqual([]);
  });
});
