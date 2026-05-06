export async function updateCallTracking({
  callId,
  tenantKey,
  leadPhone,
  status,
  outcome,
  endedReason,
  duration,
  cost,
  metadata,
  timestamp,
  transcript,
  recordingUrl,
  sentiment,
  qualityScore,
  objections,
  keyPhrases,
  metrics,
  analyzedAt
}) {
  try {
    const { upsertCall, trackCost } = await import('../../db.js');

    await upsertCall({
      callId,
      clientKey: tenantKey,
      leadPhone,
      status,
      outcome,
      duration,
      cost,
      metadata,
      transcript,
      recordingUrl,
      sentiment,
      qualityScore,
      objections,
      keyPhrases,
      metrics,
      analyzedAt
    });

    if (tenantKey && leadPhone && String(status || '').toLowerCase() === 'ended') {
      try {
        const meta = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
        const cp = String(meta.callPurpose || meta.CallPurpose || '').toLowerCase();
        if (!cp.startsWith('inbound')) {
          const { isOutboundAbLivePickupOutcome } = await import('../../lib/outbound-ab-live-pickup.js');
          if (isOutboundAbLivePickupOutcome(outcome, endedReason)) {
            const { closeOutboundWeekdayJourneyOnLivePickup } = await import('../../db.js');
            await closeOutboundWeekdayJourneyOnLivePickup(tenantKey, leadPhone);
          }
        }
      } catch (journeyErr) {
        console.warn('[OUTBOUND WEEKDAY JOURNEY] close on live pickup skipped:', journeyErr?.message || journeyErr);
      }
    }

    try {
      const { recordCallTimeBanditAfterCallComplete } = await import('../../db.js');
      await recordCallTimeBanditAfterCallComplete({ clientKey: tenantKey, callId });
    } catch (banditErr) {
      console.warn('[CALL TIME BANDIT] webhook update skipped:', banditErr?.message || banditErr);
    }

    if (cost && cost > 0) {
      await trackCost({
        clientKey: tenantKey,
        callId,
        costType: 'vapi_call',
        amount: cost,
        currency: 'USD',
        description: `VAPI call ${status} - ${outcome || 'unknown outcome'}`,
        metadata: {
          duration,
          outcome,
          leadPhone,
          timestamp
        }
      });

      console.log('[COST TRACKED]', {
        callId,
        tenantKey,
        cost: `$${cost}`,
        type: 'vapi_call'
      });
    }

    console.log('[CALL TRACKING UPDATE]', {
      callId,
      tenantKey,
      leadPhone,
      status,
      outcome,
      duration: duration ? `${duration}s` : 'unknown',
      qualityScore: qualityScore || 'not scored',
      sentiment: sentiment || 'unknown',
      cost: cost ? `$${cost}` : 'unknown',
      timestamp,
      stored: true
    });
  } catch (error) {
    console.error('[CALL TRACKING ERROR]', error);
  }
}
