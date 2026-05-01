import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';

const mockGetFullClient = jest.fn();
const mockGetLatestCallInsights = jest.fn();
const mockGetCallTimeBanditState = jest.fn();
const mockDialLeadsNowBatch = jest.fn();

jest.unstable_mockModule('../../db.js', () => ({
  getFullClient: (...args) => mockGetFullClient(...args),
  getLatestCallInsights: (...args) => mockGetLatestCallInsights(...args),
  getCallTimeBanditState: (...args) => mockGetCallTimeBanditState(...args)
}));

jest.unstable_mockModule('../../lib/instant-calling.js', () => ({
  dialLeadsNowBatch: (...args) => mockDialLeadsNowBatch(...args)
}));

let runOutboundCallsForImportedLeads;

beforeAll(async () => {
  ({ runOutboundCallsForImportedLeads } = await import('../../lib/lead-import-outbound.js'));
});

beforeEach(() => {
  mockGetFullClient.mockReset();
  mockGetLatestCallInsights.mockReset();
  mockGetCallTimeBanditState.mockReset();
  mockDialLeadsNowBatch.mockReset();
  mockGetLatestCallInsights.mockResolvedValue(null);
  mockGetCallTimeBanditState.mockResolvedValue({});
  delete process.env.IMPORT_ALLOW_ENV_VAPI_FALLBACK;
});

describe('lib/lead-import-outbound', () => {
  test('returns client_not_found when tenant missing', async () => {
    mockGetFullClient.mockResolvedValue(null);
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

  test('returns vapi_not_configured when assistant missing', async () => {
    mockGetFullClient.mockResolvedValue({ isEnabled: true, clientKey: 'c1', vapi: {} });
    const out = await runOutboundCallsForImportedLeads({
      clientKey: 'c1',
      inserted: [{ id: 1, phone: '+447700900000', name: 'x' }],
      isBusinessHours: () => true,
      getNextBusinessHour: () => new Date(),
      scheduleAtOptimalCallWindow: jest.fn(),
      addToCallQueue: jest.fn(),
      TIMEZONE: 'UTC'
    });
    expect(out.reason).toBe('vapi_not_configured');
  });

  test('returns client_not_enabled when tenant disabled and no env fallback', async () => {
    mockGetFullClient.mockResolvedValue({
      isEnabled: false,
      clientKey: 'c1',
      vapi: { assistantId: 'asst_1' }
    });
    const out = await runOutboundCallsForImportedLeads({
      clientKey: 'c1',
      inserted: [{ id: 1, phone: '+447700900000', name: 'x' }],
      isBusinessHours: () => true,
      getNextBusinessHour: () => new Date(),
      scheduleAtOptimalCallWindow: jest.fn(),
      addToCallQueue: jest.fn(),
      TIMEZONE: 'UTC'
    });
    expect(out.reason).toBe('client_not_enabled');
  });

  test('outside business hours queues leads via addToCallQueue', async () => {
    mockGetFullClient.mockResolvedValue({
      isEnabled: true,
      clientKey: 'c1',
      vapi: { assistantId: 'asst_1' }
    });
    const scheduleAtOptimalCallWindow = jest.fn(async () => new Date('2026-06-01T10:00:00Z'));
    const addToCallQueue = jest.fn(async () => {});
    const out = await runOutboundCallsForImportedLeads({
      clientKey: 'c1',
      inserted: [
        { id: 10, phone: '+447700900001', name: 'A', service: 'S', source: 'Import' },
        { id: 11, phone: '+447700900002', name: 'B', service: 'S', source: 'Import' }
      ],
      isBusinessHours: () => false,
      getNextBusinessHour: () => new Date('2026-06-01T09:00:00Z'),
      scheduleAtOptimalCallWindow,
      addToCallQueue,
      TIMEZONE: 'UTC'
    });
    expect(out.reason).toBe('queued_for_routing_distribution');
    expect(out.queued).toBe(2);
    expect(out.called).toBe(0);
    expect(out.shouldCallNow).toBe(false);
    expect(addToCallQueue).toHaveBeenCalledTimes(2);
    expect(scheduleAtOptimalCallWindow).toHaveBeenCalled();
    expect(mockDialLeadsNowBatch).not.toHaveBeenCalled();
  });

  test('in business hours still queues (no background dialing)', async () => {
    mockGetFullClient.mockResolvedValue({
      isEnabled: true,
      clientKey: 'c1',
      vapi: { assistantId: 'asst_1' }
    });
    const addToCallQueue = jest.fn(async () => {});
    const out = await runOutboundCallsForImportedLeads({
      clientKey: 'c1',
      inserted: [{ id: 1, phone: '+447700900000', name: 'x' }],
      isBusinessHours: () => true,
      getNextBusinessHour: () => new Date(),
      scheduleAtOptimalCallWindow: jest.fn(async () => new Date('2026-06-01T10:00:00Z')),
      addToCallQueue,
      TIMEZONE: 'UTC'
    });
    expect(out.reason).toBe('queued_for_routing_distribution');
    expect(out.queued).toBe(1);
    expect(out.called).toBe(0);
    expect(out.shouldCallNow).toBe(false);
    expect(addToCallQueue).toHaveBeenCalledTimes(1);
    expect(mockDialLeadsNowBatch).not.toHaveBeenCalled();
  });
});
