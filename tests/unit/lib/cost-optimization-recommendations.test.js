import { describe, expect, test } from '@jest/globals';
import { generateCostRecommendations } from '../../../lib/cost-optimization-recommendations.js';

describe('cost-optimization-recommendations', () => {
  test('returns empty when no cost', () => {
    expect(generateCostRecommendations({ total_cost: 0, transaction_count: 0 }, {})).toEqual([]);
  });

  test('flags high average cost', () => {
    const r = generateCostRecommendations(
      { total_cost: 20, transaction_count: 100 },
      {}
    );
    expect(r.some((x) => x.type === 'cost_optimization')).toBe(true);
  });

  test('flags budget utilization over 80%', () => {
    const r = generateCostRecommendations(
      { total_cost: 1, transaction_count: 1 },
      { vapi_calls: { daily: { percentage: 85 } } }
    );
    expect(r.some((x) => x.type === 'budget_alert')).toBe(true);
  });

  test('flags high volume', () => {
    const r = generateCostRecommendations(
      { total_cost: 1, transaction_count: 51 },
      {}
    );
    expect(r.some((x) => x.type === 'volume_optimization')).toBe(true);
  });
});
