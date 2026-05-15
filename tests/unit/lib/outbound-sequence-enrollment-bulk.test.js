import { describe, expect, jest, test } from '@jest/globals';
import { setLeadsOutboundSequenceEnrollmentBulk } from '../../../lib/outbound-sequence-enrollment.js';

describe('setLeadsOutboundSequenceEnrollmentBulk', () => {
  test('dedupes phones and reports partial success', async () => {
    let selectCount = 0;
    const query = jest.fn(async (sql) => {
      if (String(sql).includes('SELECT id')) {
        selectCount += 1;
        if (selectCount === 2) return { rows: [] };
        return { rows: [{ id: 1, phone: '+447700900000', leadDialContextJson: null }] };
      }
      return {
        rows: [{ id: 1, phone: '+447700900000', leadDialContextJson: { variableValues: { outboundSequenceOptIn: true } } }],
      };
    });

    const out = await setLeadsOutboundSequenceEnrollmentBulk({
      clientKey: 'c1',
      leadPhones: ['+447700900000', '+447700900099', '+447700900000'],
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
    expect(out.partial).toBe(true);
    expect(out.requested).toBe(2);
    expect(out.updated).toBe(1);
    expect(out.failed).toBe(1);
  });
});
