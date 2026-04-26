import { describe, test, expect, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('lib/lead-intelligence', () => {
  test('calculateLeadScore favors fresh UK leads with email and details', async () => {
    const { calculateLeadScore } = await import('../../../lib/lead-intelligence.js');
    const score = calculateLeadScore({
      createdAt: new Date().toISOString(),
      email: 'a@b.com',
      source: 'organic',
      phone: '+447700900000',
      notes: 'x'.repeat(60),
      service: 'cut',
    });
    expect(score).toBeGreaterThan(50);
  });

  test('determineOptimalChannel picks replied channel', async () => {
    const { determineOptimalChannel } = await import('../../../lib/lead-intelligence.js');
    expect(determineOptimalChannel({ engagementHistory: { smsReplied: true } })).toBe('sms');
    expect(determineOptimalChannel({ engagementHistory: { emailReplied: true } })).toBe('email');
  });

  test('getBestObjectionResponses falls back to defaults on query failure', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      query: jest.fn(async () => {
        throw new Error('no table');
      }),
    }));
    const { getBestObjectionResponses } = await import('../../../lib/lead-intelligence.js');
    const rows = await getBestObjectionResponses('price', 'c1');
    expect(rows.length).toBeGreaterThan(0);
  });

  test('trackObjection ignores missing table errors', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      query: jest.fn(async () => {
        throw new Error('missing');
      }),
    }));
    const { trackObjection } = await import('../../../lib/lead-intelligence.js');
    await expect(
      trackObjection({ callId: 'c', leadPhone: '+1', clientKey: 'k', objection: 'too expensive', response: 'x', outcome: 'booked' })
    ).resolves.toBeUndefined();
  });
});

