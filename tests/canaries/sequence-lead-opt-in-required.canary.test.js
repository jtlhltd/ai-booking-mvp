/**
 * Canary for Intent Contract: sequence.lead-opt-in-required
 */
import { beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockGetFullClient = jest.fn();
const mockGetLatestCallInsights = jest.fn();
const mockGetCallTimeBanditState = jest.fn();
const mockProcessCallQueue = jest.fn();

jest.unstable_mockModule('../../db.js', () => ({
  getFullClient: (...args) => mockGetFullClient(...args),
  getLatestCallInsights: (...args) => mockGetLatestCallInsights(...args),
  getCallTimeBanditState: (...args) => mockGetCallTimeBanditState(...args)
}));

jest.unstable_mockModule('../../lib/instant-calling.js', () => ({
  processCallQueue: (...args) => mockProcessCallQueue(...args)
}));

let runOutboundCallsForImportedLeads;

beforeAll(async () => {
  ({ runOutboundCallsForImportedLeads } = await import('../../lib/lead-import-outbound.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetLatestCallInsights.mockResolvedValue(null);
  mockGetCallTimeBanditState.mockResolvedValue({});
});

describe('canary: sequence.lead-opt-in-required', () => {
  test('sequence-enabled tenants still queue classic by default and require explicit lead opt-in', async () => {
    mockGetFullClient.mockResolvedValue({
      isEnabled: true,
      clientKey: 'c1',
      vapi: { assistantId: 'asst_1' },
      outboundSequence: {
        enabled: true,
        stages: [
          {
            id: 'stage_1',
            firstMessage: 'Hello',
            systemMessage: 'Qualify the lead',
            requiredFields: ['decisionMakerName'],
            maxAttemptsInStage: 2,
            isFinal: true
          }
        ]
      }
    });

    const addToCallQueue = jest.fn(async () => {});

    await runOutboundCallsForImportedLeads({
      clientKey: 'c1',
      inserted: [
        { id: 1, phone: '+447700900000', name: 'classic-by-default' },
        {
          id: 2,
          phone: '+447700900001',
          name: 'explicit-sequence',
          lead_dial_context_json: { outboundSequenceOptIn: true }
        }
      ],
      isBusinessHours: () => true,
      getNextBusinessHour: () => new Date(),
      scheduleAtOptimalCallWindow: jest.fn(async () => new Date('2026-06-01T10:00:00Z')),
      addToCallQueue,
      TIMEZONE: 'UTC'
    });

    expect(addToCallQueue).toHaveBeenCalledTimes(2);
    expect(addToCallQueue.mock.calls[0][0].callData?.outboundDialMode).toBe('classic');
    expect(addToCallQueue.mock.calls[1][0].callData?.outboundDialMode).toBe('sequence');
  });
});
