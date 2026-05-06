import { describe, expect, test, jest, beforeEach } from '@jest/globals';

describe('lib/vapi-webhooks/outcome-handlers', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('handleInterestedProspect triggers SMS pipeline', async () => {
    const initiateLeadCapture = jest.fn().mockResolvedValue({
      success: true,
      message: 'ok',
      leadId: 'L1'
    });
    jest.unstable_mockModule('../../../sms-email-pipeline.js', () => ({
      default: class {
        async initiateLeadCapture(data) {
          return initiateLeadCapture(data);
        }
      }
    }));
    const { handleInterestedProspect } = await import('../../../lib/vapi-webhooks/outcome-handlers.js');
    await handleInterestedProspect({
      tenantKey: 't',
      leadPhone: '+1',
      callId: 'c',
      metadata: { businessName: 'B', industry: 'i' },
      summary: 'long summary text here'
    });
    expect(initiateLeadCapture).toHaveBeenCalled();
  });

  test('pickReceptionistName returns empty when no match', async () => {
    const { pickReceptionistName } = await import('../../../lib/vapi-webhooks/outcome-handlers.js');
    expect(pickReceptionistName('no pattern here')).toBe('');
  });
});
