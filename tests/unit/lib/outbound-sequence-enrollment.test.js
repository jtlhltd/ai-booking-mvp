import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockStop = jest.fn();

jest.unstable_mockModule('../../../lib/outbound-sequence-ops.js', () => ({
  stopOutboundSequenceForLead: (...args) => mockStop(...args),
}));

let setLeadOutboundSequenceEnrollment;

beforeAll(async () => {
  ({ setLeadOutboundSequenceEnrollment } = await import('../../../lib/outbound-sequence-enrollment.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockStop.mockResolvedValue({ ok: true, status: 'abandoned' });
});

describe('setLeadOutboundSequenceEnrollment', () => {
  test('enrolls lead when tenant sequence is enabled', async () => {
    const query = jest.fn(async (sql) => {
      if (String(sql).includes('SELECT id')) {
        return { rows: [{ id: 9, phone: '+447700900111', leadDialContextJson: { crmCampaign: 'x' } }] };
      }
      return { rows: [{ id: 9, phone: '+447700900111', leadDialContextJson: { variableValues: { outboundSequenceOptIn: true } } }] };
    });
    const out = await setLeadOutboundSequenceEnrollment({
      clientKey: 'c1',
      leadPhone: '+447700900111',
      enrolled: true,
      query,
      getFullClient: async () => ({
        outboundSequence: {
          enabled: true,
          stages: [{
            id: 's1',
            firstMessage: 'Hi',
            systemMessage: 'Sys',
            requiredFields: ['decisionMakerName'],
            maxAttemptsInStage: 2,
            isFinal: true,
          }],
        },
      }),
    });
    expect(out.ok).toBe(true);
    expect(out.sequenceOptedIn).toBe(true);
    expect(mockStop).not.toHaveBeenCalled();
  });

  test('rejects enroll when tenant sequence disabled', async () => {
    const query = jest.fn(async () => ({
      rows: [{ id: 9, phone: '+447700900111', leadDialContextJson: null }],
    }));
    const out = await setLeadOutboundSequenceEnrollment({
      clientKey: 'c1',
      leadPhone: '+447700900111',
      enrolled: true,
      query,
      getFullClient: async () => ({ outboundSequence: { enabled: false } }),
    });
    expect(out).toEqual({ ok: false, error: 'tenant_sequence_disabled' });
  });

  test('unenroll stops active sequence', async () => {
    const query = jest.fn(async (sql) => {
      if (String(sql).includes('SELECT id')) {
        return {
          rows: [{ id: 9, phone: '+447700900111', leadDialContextJson: { outboundSequenceOptIn: true } }],
        };
      }
      return {
        rows: [{ id: 9, phone: '+447700900111', leadDialContextJson: { variableValues: { outboundSequenceOptIn: false } } }],
      };
    });
    const getLeadSequenceState = jest.fn(async () => ({ status: 'active' }));
    const out = await setLeadOutboundSequenceEnrollment({
      clientKey: 'c1',
      leadPhone: '+447700900111',
      enrolled: false,
      query,
      getFullClient: async () => ({}),
      getLeadSequenceState,
      updateLeadSequenceState: jest.fn(),
      getCallQueueByPhone: jest.fn(),
      updateCallQueueStatus: jest.fn(),
      getLeadHandoffByPhone: jest.fn(),
      upsertLeadHandoff: jest.fn(),
    });
    expect(out.ok).toBe(true);
    expect(out.sequenceOptedIn).toBe(false);
    expect(out.stoppedActiveSequence).toBe(true);
    expect(mockStop).toHaveBeenCalled();
  });
});
