export function pickReceptionistName(transcript) {
  const m = transcript.match(/(this is|i am)\s+([A-Z][a-z]+)(?:\s+[A-Z][a-z]+)?\b.*(reception|speaking)/i);
  if (m) return m[2];
  const m2 = transcript.match(/receptionist\s+(?:is|was)\s+([A-Z][a-z]+)(?:\s+[A-Z][a-z]+)?/i);
  return m2 ? m2[1] : '';
}

export async function handleBookingOutcome({ tenantKey, leadPhone, callId, bookingStart, bookingEnd, metadata }) {
  try {
    console.log('[BOOKING OUTCOME]', {
      tenantKey,
      leadPhone,
      callId,
      bookingStart,
      bookingEnd
    });
  } catch (error) {
    console.error('[BOOKING OUTCOME ERROR]', error);
  }
}

export async function handleInterestedProspect({ tenantKey, leadPhone, callId, metadata, summary }) {
  try {
    console.log('[INTERESTED PROSPECT]', {
      tenantKey,
      leadPhone,
      callId,
      summary: summary.substring(0, 100) + '...'
    });

    const leadData = {
      businessName: metadata.businessName || 'Unknown Business',
      decisionMaker: metadata.decisionMaker || 'Unknown Contact',
      phoneNumber: leadPhone,
      industry: metadata.industry || 'unknown',
      location: metadata.location || 'unknown',
      callId: callId,
      summary: summary
    };

    await triggerSMSPipeline(leadData);

    console.log('[SMS PIPELINE TRIGGERED]', {
      tenantKey,
      leadPhone,
      callId,
      leadData: {
        businessName: leadData.businessName,
        decisionMaker: leadData.decisionMaker,
        industry: leadData.industry
      }
    });
  } catch (error) {
    console.error('[INTERESTED PROSPECT ERROR]', error);
  }
}

async function triggerSMSPipeline(leadData) {
  try {
    const SMSEmailPipeline = await import('../../sms-email-pipeline.js');
    const smsEmailPipeline = new SMSEmailPipeline.default();

    const result = await smsEmailPipeline.initiateLeadCapture(leadData);

    console.log('[SMS PIPELINE RESULT]', {
      success: result.success,
      message: result.message,
      leadId: result.leadId
    });

    return result;
  } catch (error) {
    console.error('[SMS PIPELINE TRIGGER ERROR]', error);
    throw error;
  }
}

export async function handleFailedCall({ tenantKey, leadPhone, callId, reason, metadata }) {
  try {
    console.log('[FAILED CALL]', {
      tenantKey,
      leadPhone,
      callId,
      reason,
      note: 'Follow-up rows are created by scheduleFollowUps() after this handler (retry_queue + dashboard Retry Queue).'
    });
  } catch (error) {
    console.error('[FAILED CALL ERROR]', error);
  }
}
