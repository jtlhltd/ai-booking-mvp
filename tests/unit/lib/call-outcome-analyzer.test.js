import { describe, test, expect, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('lib/call-outcome-analyzer', () => {
  test('analyzeCallOutcomes returns zeros when no calls', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      query: jest.fn(async () => ({ rows: [] })),
    }));
    const { analyzeCallOutcomes } = await import('../../../lib/call-outcome-analyzer.js');
    const out = await analyzeCallOutcomes('c1', 7);
    expect(out).toEqual(expect.objectContaining({ totalCalls: 0, insights: [], recommendations: [] }));
  });

  test('analyzeCallOutcomes emits warnings for low conversion and high no-answer', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      query: jest.fn(async () => ({
        rows: [
          { outcome: 'no_answer', transcript: 'no thanks', duration: 10 },
          { outcome: 'no_answer', transcript: 'no thanks', duration: 10 },
          { outcome: 'rejected', transcript: 'too expensive', duration: 20 },
          { outcome: 'booked', transcript: 'yes great', duration: 120 },
        ],
      })),
    }));
    const { analyzeCallOutcomes } = await import('../../../lib/call-outcome-analyzer.js');
    const out = await analyzeCallOutcomes('c1', 30);
    expect(out.totalCalls).toBe(4);
    expect(out.insights.length).toBeGreaterThan(0);
    expect(out.recommendations.length).toBeGreaterThan(0);
  });
});

