import express from 'express';
import * as store from '../store.js';
import * as sheets from '../sheets.js';
import { analyzeCall } from '../lib/call-quality-analysis.js';
import messagingService from '../lib/messaging-service.js';
// Lightweight first-pass extractor for logistics script fields

function extractLogisticsFields(transcript) {
  const text = (transcript || '').toLowerCase();
  const pick = (re) => {
    const m = text.match(re);
    return m ? (m[1] || m[0]).trim() : '';
  };
  const pickAll = (re) => {
    const matches = [...text.matchAll(re)].map(m => (m[1] || m[0]).trim());
    return Array.from(new Set(matches));
  };

  // Email
  const email = pick(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);

  // International yes/no (look for clear affirmations around "outside the uk")
  let international = '';
  if (/outside\s+the\s+uk.*\byes\b|\binternational\b.*\byes\b/i.test(transcript)) international = 'Y';
  else if (/outside\s+the\s+uk.*\bno\b|\binternational\b.*\bno\b/i.test(transcript)) international = 'N';

  // Main couriers (UPS/FEDEX/DHL/DPD/Hermes/Royal Mail)
  const knownCouriers = ['ups','fedex','dhl','dpd','hermes','evri','royal mail','parcel force','parcelforce'];
  const mainCouriers = knownCouriers.filter(c => text.includes(c));

  // Frequency (weekly/daily + number)
  const frequency = pick(/(\b\d+\s*(?:per\s*)?(?:day|week|weekly|daily)\b|\b(daily|weekly)\b)/i);

  // Main countries (naive pick of common country names mentioned)
  const countryWords = ['usa','united states','canada','germany','france','spain','italy','netherlands','ireland','australia','china','hong kong','japan','uae','dubai','saudi','india','poland','sweden','norway','denmark'];
  const mainCountries = countryWords.filter(c => text.includes(c));

  // Example shipment: weight/dimensions and cost
  const weightDims = pick(/(\b\d+(?:\.\d+)?\s*(?:kg|kilograms)\b[^\n]{0,40}?(?:\b\d+\s*x\s*\d+\s*x\s*\d+\s*(?:cm|mm|in)?\b)?)/i);
  const cost = pick(/(£\s?\d+(?:[\.,]\d{2})?|\$\s?\d+(?:[\.,]\d{2})?)/);

  // Domestic frequency
  const domesticFrequency = pick(/(\b\d+\s*(?:per\s*)?(?:day|week)\b.*\buk\b|\b(daily|weekly)\b.*\buk\b)/i);

  // UK courier (look for named courier near 'uk')
  const ukCourier = pick(/uk[^\n]{0,50}\b(ups|fedex|dhl|dpd|hermes|evri|royal\s*mail|parcelforce)\b/i);

  // Standard rate up to kg
  const standardRateUpToKg = pick(/standard\s+rate[^\n]{0,40}\b(\d+\s*kg)\b/i);

  // Excluding fuel and VAT?
  const excludingFuelVat = /excluding\s+fuel|excl\.?\s+fuel|vat/i.test(transcript) ? 'mentioned' : '';

  // Single vs multi-parcel
  const singleVsMulti = /single\s+parcels?/i.test(transcript) ? 'single' : (/multiple\s+parcels?|multi-?parcel/i.test(transcript) ? 'multiple' : '');

  return {
    email,
    international,
    mainCouriers,
    frequency,
    mainCountries,
    exampleShipment: weightDims,
    exampleShipmentCost: cost,
    domesticFrequency,
    ukCourier,
    standardRateUpToKg,
    excludingFuelVat,
    singleVsMulti
  };
}

const router = express.Router();

// Enhanced VAPI webhook handler with comprehensive call tracking
router.post('/webhooks/vapi', async (req, res) => {
  try {
    console.log('[VAPI WEBHOOK DEBUG] Raw body:', JSON.stringify(req.body, null, 2));
    console.log('[VAPI WEBHOOK DEBUG] Headers:', JSON.stringify(req.headers, null, 2));
    
    const body = req.body || {};
    
    // Always return 200 to prevent VAPI from retrying
    res.status(200).json({ ok: true, received: true });
    
    const callId = body.call?.id || body.id;
    const status = body.call?.status || body.status;
    const outcome = body.call?.outcome || body.outcome;
    const duration = body.call?.duration || body.duration;
    const cost = body.call?.cost || body.cost;
    const metadata = body.call?.metadata || body.metadata || {};
    
    // Extract transcript and recording (NEW)
    const transcript = body.call?.transcript || body.transcript || body.summary || '';
    const recordingUrl = body.call?.recordingUrl || body.recordingUrl || body.recording_url || '';
    const vapiMetrics = body.call?.metrics || body.metrics || {};
    
    console.log('[VAPI WEBHOOK]', { 
      callId, 
      status, 
      outcome, 
      duration, 
      cost,
      hasTranscript: !!transcript,
      transcriptLength: transcript.length,
      hasRecording: !!recordingUrl,
      metadata: Object.keys(metadata).length > 0 ? metadata : 'none'
    });

    // Extract tenant and lead information
    const tenantKey = metadata.tenantKey || metadata.clientKey;
    const leadPhone = metadata.leadPhone || body.customer?.number;
    
    if (!tenantKey || !leadPhone) {
      console.log('[VAPI WEBHOOK SKIP]', { reason: 'missing_tenant_or_phone', tenantKey: !!tenantKey, leadPhone: !!leadPhone });
      return res.status(200).json({ ok: true });
    }

    // Load tenant config (per-client settings)
    const tenant = tenantKey ? await store.getFullClient(tenantKey).catch(() => null) : null;

    // Analyze call quality (NEW)
    const analysis = analyzeCall({
      outcome,
      duration,
      transcript,
      metrics: {
        talk_time_ratio: vapiMetrics.talk_time_ratio,
        interruptions: vapiMetrics.interruptions,
        response_time_avg: vapiMetrics.response_time_avg,
        completion_rate: vapiMetrics.completion_rate
      }
    });
    
    console.log('[CALL ANALYSIS]', {
      callId,
      sentiment: analysis.sentiment,
      qualityScore: analysis.qualityScore,
      objections: analysis.objections,
      keyPhrases: analysis.keyPhrases.slice(0, 3)
    });

    // Update call tracking in database with quality data
    await updateCallTracking({
      callId,
      tenantKey,
      leadPhone,
      status,
      outcome,
      duration,
      cost,
      metadata,
      timestamp: new Date().toISOString(),
      // Quality data (NEW)
      transcript,
      recordingUrl,
      sentiment: analysis.sentiment,
      qualityScore: analysis.qualityScore,
      objections: analysis.objections,
      keyPhrases: analysis.keyPhrases,
      metrics: vapiMetrics,
      analyzedAt: analysis.analyzedAt
    });

    // Handle tool calls from VAPI assistant
    if (body.toolCalls && body.toolCalls.length > 0) {
      console.log('[VAPI WEBHOOK] Processing tool calls:', body.toolCalls.length);
      
      for (const toolCall of body.toolCalls) {
        try {
          if (toolCall.function.name === 'access_google_sheet') {
            const args = JSON.parse(toolCall.function.arguments);
            const { action, data } = args;
            
            // Get tenant configuration
            const logisticsSheetId = tenant?.vapi?.logisticsSheetId || tenant?.gsheet_id || process.env.LOGISTICS_SHEET_ID;
            
            if (logisticsSheetId) {
              if (action === 'append' && data) {
                // Ensure logistics headers are present
                await sheets.ensureLogisticsHeader(logisticsSheetId);
                
                // Append data to sheet
                await sheets.appendLogistics(logisticsSheetId, {
                  ...data,
                  callId: body.id,
                  timestamp: new Date().toISOString(),
                  businessName: metadata.businessName || 'Unknown',
                  leadPhone: leadPhone
                });
                
                console.log('[VAPI WEBHOOK] Data appended to sheet via tool call');
              }
            }
            
          } else if (toolCall.function.name === 'schedule_callback') {
            const args = JSON.parse(toolCall.function.arguments);
            const { businessName, phone, receptionistName, reason, preferredTime, notes } = args;
            
            const callbackInboxEmail = tenant?.vapi?.callbackInboxEmail || process.env.CALLBACK_INBOX_EMAIL;
            
            if (callbackInboxEmail) {
              const emailSubject = `Callback Scheduled: ${businessName} - ${phone}`;
              const emailBody = `
                <h2>Callback Scheduled</h2>
                <p><strong>Business:</strong> ${businessName}</p>
                <p><strong>Phone:</strong> ${phone}</p>
                <p><strong>Receptionist:</strong> ${receptionistName || 'Unknown'}</p>
                <p><strong>Reason:</strong> ${reason}</p>
                <p><strong>Preferred Time:</strong> ${preferredTime || 'Not specified'}</p>
                <p><strong>Notes:</strong> ${notes || 'None'}</p>
                <p><strong>Call ID:</strong> ${body.id}</p>
                <p><strong>Recording:</strong> <a href="${recordingUrl || 'N/A'}">Listen to call</a></p>
              `;
              
              await messagingService.sendEmail({
                to: callbackInboxEmail,
                subject: emailSubject,
                html: emailBody
              });
              
              console.log('[VAPI WEBHOOK] Callback email sent via tool call');
            }
          }
          
        } catch (error) {
          console.error('[VAPI WEBHOOK] Error processing tool call:', error);
        }
      }
    }

    // Logistics extraction (only if configured and we have transcript or structured output)
    // Prefer per-tenant configuration, fall back to env
    const logisticsSheetId = tenant?.vapi?.logisticsSheetId || tenant?.gsheet_id || process.env.LOGISTICS_SHEET_ID;
    
    // Check for structured output data from VAPI
    const structuredOutput = body.call?.structuredOutput || body.structuredOutput || body.structured_output;
    
    if (logisticsSheetId && (transcript || structuredOutput) && status === 'completed') {
      try {
        // Use structured output if available, otherwise fall back to transcript extraction
        let extracted;
        if (structuredOutput) {
          console.log('[LOGISTICS] Using structured output data:', structuredOutput);
          // Transform structured output to match our expected format
          extracted = {
            email: structuredOutput.email || '',
            international: structuredOutput.internationalYN || '',
            mainCouriers: [structuredOutput.courier1, structuredOutput.courier2, structuredOutput.courier3].filter(Boolean),
            frequency: structuredOutput.frequency || '',
            mainCountries: [structuredOutput.country1, structuredOutput.country2, structuredOutput.country3].filter(Boolean),
            exampleShipment: structuredOutput.exampleShipment || '',
            exampleShipmentCost: structuredOutput.exampleShipmentCost || '',
            domesticFrequency: structuredOutput.domesticFrequency || '',
            ukCourier: structuredOutput.ukCourier || '',
            standardRateUpToKg: structuredOutput.standardRateUpToKg || '',
            excludingFuelVat: structuredOutput.exclFuelVAT || '',
            singleVsMulti: structuredOutput.singleVsMultiParcel || ''
          };
        } else {
          console.log('[LOGISTICS] Using transcript extraction (no structured output)');
          extracted = extractLogisticsFields(transcript);
        }
        
        const businessName = structuredOutput?.businessName || metadata.businessName || '';
        const decisionMaker = structuredOutput?.decisionMaker || metadata.decisionMaker?.name || '';
        const receptionistName = structuredOutput?.receptionistName || pickReceptionistName(transcript) || metadata.receptionistName || '';
        const callbackNeeded = structuredOutput?.callbackNeeded === 'Y' || /call\s*back|transfer|not\s*available|not\s*in|back\s*later|try\s*again/i.test(transcript) && !decisionMaker;

        await sheets.appendLogistics(logisticsSheetId, {
          businessName,
          decisionMaker,
          phone: leadPhone,
          email: extracted.email,
          international: extracted.international,
          mainCouriers: extracted.mainCouriers,
          frequency: extracted.frequency,
          mainCountries: extracted.mainCountries,
          exampleShipment: extracted.exampleShipment,
          exampleShipmentCost: extracted.exampleShipmentCost,
          domesticFrequency: extracted.domesticFrequency,
          ukCourier: extracted.ukCourier,
          standardRateUpToKg: extracted.standardRateUpToKg,
          excludingFuelVat: extracted.excludingFuelVat,
          singleVsMulti: extracted.singleVsMulti,
          receptionistName,
          callbackNeeded,
          callId,
          recordingUrl,
          transcriptSnippet: transcript.slice(0, 500)
        });

        console.log('[LOGISTICS SHEET APPEND]', { callId, phone: leadPhone });

        // Email fallback notification for callback queue (per-tenant if available)
        const callbackInbox = tenant?.vapi?.callbackInboxEmail || process.env.CALLBACK_INBOX_EMAIL;
        if (callbackNeeded && callbackInbox) {
          const subject = `Callback needed: ${businessName || 'Unknown business'} (${leadPhone})`;
          const body = `A receptionist requested a callback or decision maker was unavailable.\n\nBusiness: ${businessName || 'Unknown'}\nReceptionist: ${receptionistName || 'Unknown'}\nPhone: ${leadPhone}\nEmail: ${extracted.email || 'N/A'}\nInternational: ${extracted.international || 'N/A'}\nCouriers: ${(extracted.mainCouriers || []).join(', ') || 'N/A'}\nFrequency: ${extracted.frequency || 'N/A'}\nCountries: ${(extracted.mainCountries || []).join(', ') || 'N/A'}\nExample Shipment: ${extracted.exampleShipment || 'N/A'} (Cost: ${extracted.exampleShipmentCost || 'N/A'})\nRecording: ${recordingUrl || 'N/A'}\nCall ID: ${callId}\n\nTranscript snippet:\n${transcript.slice(0, 800)}`;
          await messagingService.sendEmail({ to: callbackInbox, subject, body }).catch(() => {});
        }
      } catch (sheetErr) {
        console.error('[LOGISTICS SHEET ERROR]', sheetErr?.message || sheetErr);
      }
    }

    // Handle specific outcomes
    if (outcome === 'booked' || body.booked === true) {
      await handleBookingOutcome({
        tenantKey,
        leadPhone,
        callId,
        bookingStart: body.bookingStart || body.slotStart || '',
        bookingEnd: body.bookingEnd || body.slotEnd || '',
        metadata
      });
    } else if (outcome === 'no-answer' || outcome === 'busy' || outcome === 'declined') {
      await handleFailedCall({
        tenantKey,
        leadPhone,
        callId,
        reason: outcome,
        metadata
      });
      
      // Schedule automated follow-up sequence
      const { scheduleFollowUps } = await import('../lib/follow-up-sequences.js');
      await scheduleFollowUps({
        clientKey: tenantKey,
        leadPhone,
        leadName: metadata.leadName || metadata.businessName,
        businessName: metadata.businessName,
        industry: metadata.industry,
        outcome,
        callId
      });
    } else if (status === 'completed' && (outcome === 'interested' || outcome === 'positive' || body.summary?.includes('interest') || body.summary?.includes('interested'))) {
      // Trigger SMS pipeline for interested prospects
      await handleInterestedProspect({
        tenantKey,
        leadPhone,
        callId,
        metadata,
        summary: body.summary || body.call?.summary || ''
      });
    }

    // Response already sent at the beginning
  } catch (e) {
    console.error('[VAPI WEBHOOK ERROR]', { 
      error: e?.message || e,
      stack: e?.stack?.substring(0, 200)
    });
    res.status(200).json({ ok: true });
  }
});

// Update call tracking in the database
async function updateCallTracking({ 
  callId, 
  tenantKey, 
  leadPhone, 
  status, 
  outcome, 
  duration, 
  cost, 
  metadata, 
  timestamp,
  // Quality data (NEW)
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
    // Import database functions
    const { upsertCall, trackCost } = await import('../db.js');
    
    // Store call data with quality metrics in database
    await upsertCall({
      callId,
      clientKey: tenantKey,
      leadPhone,
      status,
      outcome,
      duration,
      cost,
      metadata,
      // Quality fields (NEW)
      transcript,
      recordingUrl,
      sentiment,
      qualityScore,
      objections,
      keyPhrases,
      metrics,
      analyzedAt
    });
    
    // Track cost if available
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

// Naive receptionist name picker from transcript
function pickReceptionistName(transcript) {
  const m = transcript.match(/(this is|i am)\s+([A-Z][a-z]+)(?:\s+[A-Z][a-z]+)?\b.*(reception|speaking)/i);
  if (m) return m[2];
  const m2 = transcript.match(/receptionist\s+(?:is|was)\s+([A-Z][a-z]+)(?:\s+[A-Z][a-z]+)?/i);
  return m2 ? m2[1] : '';
}

// Handle successful booking outcomes
async function handleBookingOutcome({ tenantKey, leadPhone, callId, bookingStart, bookingEnd, metadata }) {
  try {
    console.log('[BOOKING OUTCOME]', {
      tenantKey,
      leadPhone,
      callId,
      bookingStart,
      bookingEnd
    });

    // Update lead status to booked
    // This would integrate with the existing lead management system
    // await store.leads.updateOnBooked(leadPhone, { 
    //   status: 'booked', 
    //   booked: true, 
    //   booking_start: bookingStart, 
    //   booking_end: bookingEnd,
    //   callId
    // });

    // Update Google Sheets if configured
    // const tenant = await store.tenants.findByKey(tenantKey);
    // if (tenant?.gsheet_id) {
    //   await sheets.updateLead(tenant.gsheet_id, {
    //     leadPhone,
    //     patch: { 
    //       'Status': 'booked',
    //       'Booked?': 'TRUE',
    //       'Booking Start': bookingStart,
    //       'Booking End': bookingEnd,
    //       'Call ID': callId
    //     }
    //   });
    // }
  } catch (error) {
    console.error('[BOOKING OUTCOME ERROR]', error);
  }
}

// Handle interested prospects - trigger SMS pipeline
async function handleInterestedProspect({ tenantKey, leadPhone, callId, metadata, summary }) {
  try {
    console.log('[INTERESTED PROSPECT]', {
      tenantKey,
      leadPhone,
      callId,
      summary: summary.substring(0, 100) + '...'
    });

    // Extract lead information from metadata
    const leadData = {
      businessName: metadata.businessName || 'Unknown Business',
      decisionMaker: metadata.decisionMaker || 'Unknown Contact',
      phoneNumber: leadPhone,
      industry: metadata.industry || 'unknown',
      location: metadata.location || 'unknown',
      callId: callId,
      summary: summary
    };

    // Trigger SMS pipeline
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

// Trigger SMS pipeline for interested prospects
async function triggerSMSPipeline(leadData) {
  try {
    // Import SMS pipeline
    const SMSEmailPipeline = await import('../sms-email-pipeline.js');
    const smsEmailPipeline = new SMSEmailPipeline.default();

    // Initiate lead capture via SMS
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

// Handle failed call scenarios
async function handleFailedCall({ tenantKey, leadPhone, callId, reason, metadata }) {
  try {
    console.log('[FAILED CALL]', {
      tenantKey,
      leadPhone,
      callId,
      reason
    });

    // Implement retry logic for failed calls
    const retryableReasons = ['no-answer', 'busy'];
    if (retryableReasons.includes(reason)) {
      // Schedule a retry call (implement retry queue)
      console.log('[SCHEDULE RETRY]', {
        tenantKey,
        leadPhone,
        callId,
        reason,
        retryAfter: '2 hours' // Configurable retry delay
      });
    }

    // Update lead status
    // await store.leads.updateCallStatus(leadPhone, {
    //   status: 'call_failed',
    //   lastCallId: callId,
    //   lastCallReason: reason,
    //   nextRetryAt: retryableReasons.includes(reason) ? new Date(Date.now() + 2 * 60 * 60 * 1000) : null
    // });
  } catch (error) {
    console.error('[FAILED CALL ERROR]', error);
  }
}

export default router;
