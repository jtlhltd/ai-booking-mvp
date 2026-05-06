import { describe, expect, test, jest, beforeEach } from '@jest/globals';

describe('lib/retry-queue-display', () => {
  const poolQuerySelect = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    poolQuerySelect.mockResolvedValue({ rows: [{ phone_raw: '+441', name: 'Ann' }] });
    jest.unstable_mockModule('../../../db.js', () => ({
      poolQuerySelect
    }));
    jest.unstable_mockModule('../../../lib/business-hours.js', () => ({
      allowOutboundWeekendCalls: jest.fn(() => false),
      clampOutboundDialToAllowedWindow: jest.fn((_tenant, d) => d)
    }));
    jest.unstable_mockModule('../../../lib/timezone-resolver.js', () => ({
      resolveTenantTimezone: jest.fn(() => 'Europe/London')
    }));
  });

  test('fetchLeadNamesForRetryQueuePhones returns empty map for no phones', async () => {
    const { fetchLeadNamesForRetryQueuePhones } = await import(
      '../../../lib/retry-queue-display.js'
    );
    const m = await fetchLeadNamesForRetryQueuePhones('c1', []);
    expect(m.size).toBe(0);
    expect(poolQuerySelect).not.toHaveBeenCalled();
  });

  test('fetchLeadNamesForRetryQueuePhones maps rows', async () => {
    const { fetchLeadNamesForRetryQueuePhones } = await import(
      '../../../lib/retry-queue-display.js'
    );
    const m = await fetchLeadNamesForRetryQueuePhones('c1', ['+441']);
    expect(poolQuerySelect).toHaveBeenCalled();
    expect(m.get('+441')).toBe('Ann');
  });

  test('effectiveDialScheduledForApiDisplay returns null without scheduled_for', async () => {
    const { effectiveDialScheduledForApiDisplay } = await import(
      '../../../lib/retry-queue-display.js'
    );
    expect(effectiveDialScheduledForApiDisplay({}, {})).toBeNull();
  });

  test('effectiveDialScheduledForApiDisplay returns null for invalid date', async () => {
    const { effectiveDialScheduledForApiDisplay } = await import(
      '../../../lib/retry-queue-display.js'
    );
    expect(
      effectiveDialScheduledForApiDisplay({ scheduled_for: 'not-a-date' }, {})
    ).toBeNull();
  });

  test('effectiveDialScheduledForApiDisplay passes through non-outbound rows', async () => {
    jest.resetModules();
    jest.unstable_mockModule('../../../db.js', () => ({ poolQuerySelect }));
    jest.unstable_mockModule('../../../lib/business-hours.js', () => ({
      allowOutboundWeekendCalls: jest.fn(() => false),
      clampOutboundDialToAllowedWindow: jest.fn()
    }));
    jest.unstable_mockModule('../../../lib/timezone-resolver.js', () => ({
      resolveTenantTimezone: jest.fn(() => 'Europe/London')
    }));
    const { effectiveDialScheduledForApiDisplay } = await import(
      '../../../lib/retry-queue-display.js'
    );
    const raw = new Date('2026-06-01T12:00:00Z');
    const out = effectiveDialScheduledForApiDisplay(
      { scheduled_for: raw.toISOString(), source: 'retry_queue', retry_type: 'sheet_patch' },
      {}
    );
    expect(out?.toISOString()).toBe(raw.toISOString());
  });
});
