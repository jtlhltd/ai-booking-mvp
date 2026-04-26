import { describe, test, expect, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('lib/call-insights-engine', () => {
  test('computeAndStoreCallInsights builds routing + summary and calls upsert', async () => {
    const upsertCallInsights = jest.fn(async () => {});
    const query = jest.fn(async () => ({
      rows: [
        { created_at: '2026-01-01T10:00:00.000Z', outcome: 'booked', status: 'ended', duration: 30 },
        { created_at: '2026-01-02T10:00:00.000Z', outcome: 'no_answer', status: 'ended', duration: 10 },
      ],
    }));

    jest.unstable_mockModule('../../../db.js', () => ({
      getCallAnalyticsFloorIso: jest.fn(async () => '2025-01-01T00:00:00.000Z'),
      backfillCallTimeBanditObservations: jest.fn(async () => {}),
    }));

    // Heuristic used by call-insights-engine; keep it deterministic.
    jest.unstable_mockModule('../../../lib/call-outcome-heuristics.js', () => ({
      isAnsweredHeuristic: jest.fn((r) => String(r?.outcome || '').toLowerCase() !== 'no_answer'),
    }));

    const { computeAndStoreCallInsights } = await import('../../../lib/call-insights-engine.js');

    const out = await computeAndStoreCallInsights({
      query,
      clientKey: 'c1',
      days: 30,
      timeZone: 'Europe/London',
      limit: 10,
      upsertCallInsights,
    });

    expect(out).toEqual(expect.objectContaining({ insights: expect.any(Object), routing: expect.any(Object) }));
    expect(upsertCallInsights).toHaveBeenCalled();
    expect(out.insights.summary).toEqual(
      expect.objectContaining({
        attempts: 2,
        answered: 1,
      }),
    );
    expect(out.routing).toEqual(expect.objectContaining({ recommendations: expect.any(Object) }));
  });
});

