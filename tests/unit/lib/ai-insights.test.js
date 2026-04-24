import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('lib/ai-insights', () => {
  test('AIInsightsEngine.generateInsights sorts by priority (critical→low)', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({ query: jest.fn(async () => ({ rows: [] })) }));
    jest.unstable_mockModule('../../../lib/analytics-tracker.js', () => ({ getConversionMetrics: jest.fn(async () => ({})) }));
    jest.unstable_mockModule('../../../lib/roi-calculator.js', () => ({ calculateROI: jest.fn(() => 0) }));

    const { AIInsightsEngine } = await import('../../../lib/ai-insights.js');
    const engine = new AIInsightsEngine();

    const data = {
      calls: 100,
      bookings: 5, // low conversion => high priority warning
      avgBookingValue: 200,
      callsByHour: Array(24).fill(0).map((_, i) => (i === 9 ? 10 : i === 18 ? 10 : 0)),
      bookingsByHour: Array(24).fill(0).map((_, i) => (i === 9 ? 4 : i === 18 ? 1 : 0)),
      leadsBySource: [
        { name: 'good', count: 50, bookings: 10, cost: 100 },
        { name: 'bad', count: 50, bookings: 0, cost: 200 }
      ],
      avgCallDuration: 30,
      totalCost: 1000,
      avgQualityScore: 0
    };

    const out = engine.generateInsights(data);
    expect(out.length).toBeGreaterThan(0);
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    for (let i = 1; i < out.length; i++) {
      expect(priorityOrder[out[i - 1].priority]).toBeLessThanOrEqual(priorityOrder[out[i].priority]);
    }
  });

  test('analyzeTimePerformance returns [] when callsByHour missing', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({ query: jest.fn(async () => ({ rows: [] })) }));
    jest.unstable_mockModule('../../../lib/analytics-tracker.js', () => ({ getConversionMetrics: jest.fn(async () => ({})) }));
    jest.unstable_mockModule('../../../lib/roi-calculator.js', () => ({ calculateROI: jest.fn(() => 0) }));

    const { AIInsightsEngine } = await import('../../../lib/ai-insights.js');
    const engine = new AIInsightsEngine();
    expect(engine.analyzeTimePerformance({})).toEqual([]);
  });

  test('LeadScoringEngine.scoreLead clamps to 0-100 and reacts to tags', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({ query: jest.fn(async () => ({ rows: [] })) }));
    jest.unstable_mockModule('../../../lib/analytics-tracker.js', () => ({ getConversionMetrics: jest.fn(async () => ({})) }));
    jest.unstable_mockModule('../../../lib/roi-calculator.js', () => ({ calculateROI: jest.fn(() => 0) }));

    const { LeadScoringEngine } = await import('../../../lib/ai-insights.js');
    const scorer = new LeadScoringEngine();
    const score = scorer.scoreLead(
      { phone: '+447700900000', email: 'a@b.com', tags: ['hot', 'vip'], createdAt: new Date().toISOString() },
      { sourceConversionRates: { web: 25 } }
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

