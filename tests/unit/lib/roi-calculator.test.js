import { describe, test, expect, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('lib/roi-calculator', () => {
  test('calculateROI returns ROI object with profit/roi metrics', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      getFullClient: jest.fn(async () => ({ avgDealValue: 200 })),
      getCallsByTenant: jest.fn(async () => [
        { created_at: new Date().toISOString(), outcome: 'booked', duration: 120 },
        { created_at: new Date().toISOString(), outcome: 'no_answer', duration: 60 },
      ]),
      query: jest.fn(async () => ({ rows: [{ count: 1, completed_count: 1 }] })),
    }));

    const { calculateROI } = await import('../../../lib/roi-calculator.js');
    const out = await calculateROI('c1', 30, { avgDealValue: 150 });

    expect(out).toEqual(
      expect.objectContaining({
        clientKey: 'c1',
        costs: expect.any(Object),
        revenue: expect.any(Object),
        roi: expect.objectContaining({ multiplier: expect.any(Number) }),
        summary: expect.any(Object),
      }),
    );
    expect(out.revenue.bookings).toBeGreaterThanOrEqual(1);
  });

  test('calculateROI throws when client missing', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      getFullClient: jest.fn(async () => null),
      getCallsByTenant: jest.fn(async () => []),
      query: jest.fn(async () => ({ rows: [{ count: 0, completed_count: 0 }] })),
    }));

    const { calculateROI } = await import('../../../lib/roi-calculator.js');
    await expect(calculateROI('missing', 30)).rejects.toThrow(/Client not found/i);
  });
});

