import { describe, test, expect, jest, beforeAll } from '@jest/globals';

jest.unstable_mockModule('../../db.js', () => ({
  getFullClient: jest.fn(async () => null),
  getLatestCallInsights: jest.fn(),
  getCallTimeBanditState: jest.fn(async () => ({}))
}));

let runOutboundCallsForImportedLeads;

beforeAll(async () => {
  ({ runOutboundCallsForImportedLeads } = await import('../../lib/lead-import-outbound.js'));
});

describe('lib/lead-import-outbound', () => {
  test('returns client_not_found when tenant missing', async () => {
    const out = await runOutboundCallsForImportedLeads({
      clientKey: 'missing',
      inserted: [{ id: 1, phone: '+447700900000', name: 'x' }],
      isBusinessHours: () => true,
      getNextBusinessHour: () => new Date(),
      scheduleAtOptimalCallWindow: jest.fn(),
      addToCallQueue: jest.fn(),
      TIMEZONE: 'UTC'
    });
    expect(out.reason).toBe('client_not_found');
  });
});
