import { describe, expect, test, jest, beforeEach } from '@jest/globals';

describe('lib/vapi-webhooks/update-call-tracking', () => {
  const upsertCall = jest.fn();
  const trackCost = jest.fn();
  const recordCallTimeBanditAfterCallComplete = jest.fn();
  const closeOutboundWeekdayJourneyOnLivePickup = jest.fn();
  const isOutboundAbLivePickupOutcome = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    upsertCall.mockResolvedValue(undefined);
    trackCost.mockResolvedValue(undefined);
    recordCallTimeBanditAfterCallComplete.mockResolvedValue(undefined);
    closeOutboundWeekdayJourneyOnLivePickup.mockResolvedValue(undefined);
    isOutboundAbLivePickupOutcome.mockReturnValue(false);

    jest.unstable_mockModule('../../../db.js', () => ({
      upsertCall,
      trackCost,
      recordCallTimeBanditAfterCallComplete,
      closeOutboundWeekdayJourneyOnLivePickup
    }));
    jest.unstable_mockModule('../../../lib/outbound-ab-live-pickup.js', () => ({
      isOutboundAbLivePickupOutcome
    }));
  });

  test('updates call and tracks cost when cost present', async () => {
    const { updateCallTracking } = await import('../../../lib/vapi-webhooks/update-call-tracking.js');
    await updateCallTracking({
      callId: 'c1',
      tenantKey: 't',
      leadPhone: '+1',
      status: 'ended',
      outcome: 'completed',
      endedReason: null,
      duration: 10,
      cost: 0.05,
      metadata: {},
      timestamp: new Date().toISOString(),
      transcript: 't',
      recordingUrl: '',
      sentiment: 'pos',
      qualityScore: 8,
      objections: [],
      keyPhrases: [],
      metrics: {},
      analyzedAt: null
    });
    expect(upsertCall).toHaveBeenCalled();
    expect(trackCost).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 0.05, costType: 'vapi_call' })
    );
    expect(recordCallTimeBanditAfterCallComplete).toHaveBeenCalled();
  });

  test('closes weekday journey on live pickup when eligible', async () => {
    isOutboundAbLivePickupOutcome.mockReturnValue(true);
    const { updateCallTracking } = await import('../../../lib/vapi-webhooks/update-call-tracking.js');
    await updateCallTracking({
      callId: 'c2',
      tenantKey: 't',
      leadPhone: '+1',
      status: 'ended',
      outcome: 'answered',
      endedReason: 'live',
      duration: 1,
      cost: null,
      metadata: { callPurpose: 'outbound' },
      timestamp: '',
      transcript: '',
      recordingUrl: '',
      sentiment: null,
      qualityScore: null,
      objections: null,
      keyPhrases: null,
      metrics: null,
      analyzedAt: null
    });
    expect(closeOutboundWeekdayJourneyOnLivePickup).toHaveBeenCalledWith('t', '+1');
  });

  test('skips journey close for inbound callPurpose', async () => {
    isOutboundAbLivePickupOutcome.mockReturnValue(true);
    const { updateCallTracking } = await import('../../../lib/vapi-webhooks/update-call-tracking.js');
    await updateCallTracking({
      callId: 'c3',
      tenantKey: 't',
      leadPhone: '+1',
      status: 'ended',
      outcome: 'x',
      endedReason: null,
      duration: 1,
      cost: null,
      metadata: { callPurpose: 'Inbound sales' },
      timestamp: '',
      transcript: '',
      recordingUrl: '',
      sentiment: null,
      qualityScore: null,
      objections: null,
      keyPhrases: null,
      metrics: null,
      analyzedAt: null
    });
    expect(closeOutboundWeekdayJourneyOnLivePickup).not.toHaveBeenCalled();
  });
});
