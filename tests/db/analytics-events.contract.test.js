import { describe, expect, test, jest, beforeEach } from '@jest/globals';

import * as analytics from '../../db/analytics-events.js';

function makeQueryMock() {
  return jest.fn(async () => ({ rows: [] }));
}

describe('db/analytics-events — SQL contract', () => {
  let query;

  beforeEach(() => {
    query = makeQueryMock();
  });

  // -------------------------------------------------------------------------
  // analytics_events
  // -------------------------------------------------------------------------

  test('trackAnalyticsEvent inserts with eventData JSON-stringified', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const out = await analytics.trackAnalyticsEvent(query, {
      clientKey: 'tenant-a',
      eventType: 'page_view',
      eventCategory: 'ui',
      eventData: { path: '/home' },
      sessionId: 's1',
      userAgent: 'ua',
      ipAddress: '1.2.3.4',
    });
    expect(out).toEqual({ id: 1 });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO analytics_events/);
    expect(params).toEqual([
      'tenant-a',
      'page_view',
      'ui',
      JSON.stringify({ path: '/home' }),
      's1',
      'ua',
      '1.2.3.4',
    ]);
  });

  test('trackAnalyticsEvent passes null when eventData missing', async () => {
    await analytics.trackAnalyticsEvent(query, {
      clientKey: 'tenant-a',
      eventType: 'page_view',
      eventCategory: 'ui',
      sessionId: 's1',
      userAgent: 'ua',
      ipAddress: '1.2.3.4',
    });
    const [, params] = query.mock.calls[0];
    expect(params[3]).toBeNull();
  });

  test('getAnalyticsEvents binds limit at end and skips eventType when null', async () => {
    await analytics.getAnalyticsEvents(query, 'tenant-a', 50, null);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/SELECT \* FROM analytics_events/);
    expect(sql).not.toMatch(/event_type = \$2/);
    expect(params).toEqual(['tenant-a', 50]);
  });

  test('getAnalyticsEvents binds eventType as $2 when provided', async () => {
    await analytics.getAnalyticsEvents(query, 'tenant-a', 25, 'sms_send');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/event_type = \$2/);
    expect(sql).toMatch(/LIMIT \$3/);
    expect(params).toEqual(['tenant-a', 'sms_send', 25]);
  });

  test('getAnalyticsSummary clamps days to non-negative integer', async () => {
    await analytics.getAnalyticsSummary(query, 'tenant-a', 30);
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/interval '30 days'/);
  });

  test('getAnalyticsSummary falls back to default on bad input', async () => {
    await analytics.getAnalyticsSummary(query, 'tenant-a', 'oops; DROP TABLE x;');
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/interval '7 days'/);
    expect(sql).not.toMatch(/DROP TABLE/);
  });

  test('getAnalyticsSummary caps days at 365', async () => {
    await analytics.getAnalyticsSummary(query, 'tenant-a', 99999);
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/interval '365 days'/);
  });

  // -------------------------------------------------------------------------
  // conversion_funnel
  // -------------------------------------------------------------------------

  test('trackConversionStage inserts with stageData JSON-stringified', async () => {
    await analytics.trackConversionStage(query, {
      clientKey: 'tenant-a',
      leadPhone: '+447700900000',
      stage: 'qualified',
      stageData: { source: 'lead_import' },
      previousStage: 'imported',
      timeToStage: 1234,
    });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO conversion_funnel/);
    expect(params).toEqual([
      'tenant-a',
      '+447700900000',
      'qualified',
      JSON.stringify({ source: 'lead_import' }),
      'imported',
      1234,
    ]);
  });

  test('getConversionFunnel uses default 30 days and aggregates by stage', async () => {
    await analytics.getConversionFunnel(query, 'tenant-a');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/SELECT/);
    expect(sql).toMatch(/FROM conversion_funnel/);
    expect(sql).toMatch(/GROUP BY stage/);
    expect(sql).toMatch(/interval '30 days'/);
    expect(params).toEqual(['tenant-a']);
  });

  test('getConversionRates joins stage_counts with total_leads CTE', async () => {
    await analytics.getConversionRates(query, 'tenant-a', 14);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/WITH stage_counts AS/);
    expect(sql).toMatch(/total_leads AS/);
    expect(sql).toMatch(/CROSS JOIN total_leads/);
    expect(sql).toMatch(/interval '14 days'/);
    expect(params).toEqual(['tenant-a']);
  });
});
