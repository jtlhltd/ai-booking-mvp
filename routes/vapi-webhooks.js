import express from 'express';
import * as store from '../store.js';
import * as sheets from '../sheets.js';
import { analyzeCall } from '../lib/call-quality-analysis.js';
import messagingService from '../lib/messaging-service.js';
import { extractLogisticsFields } from '../lib/logistics-extractor.js';

const router = express.Router();

// In-memory deduplication of processed call IDs (best-effort, survives process lifetime)
const processedCallIds = new Set();
function markProcessed(callId) {
  if (!callId) return;
  processedCallIds.add(callId);
  // Keep memory bounded
  if (processedCallIds.size > 500) {
    const first = processedCallIds.values().next().value;
    processedCallIds.delete(first);
  }
}

// Enhanced VAPI webhook handler with comprehensive call tracking
router.post('/webhooks/vapi', async (req, res) => {
  console.log('[VAPI WEBHOOK] ==================== NEW WEBHOOK RECEIVED ====================');
  console.log('[VAPI WEBHOOK] Timestamp:', new Date().toISOString());
  
  try {
    console.log('[VAPI WEBHOOK DEBUG] Raw body:', JSON.stringify(req.body, null, 2));
    console.log('[VAPI WEBHOOK DEBUG] Raw body type:', typeof req.body);
    console.log('[VAPI WEBHOOK DEBUG] Body keys:', Object.keys(req.body || {}));
    console.log('[VAPI WEBHOOK DEBUG] Headers:', JSON.stringify(req.headers, null, 2));
    
    const body = req.body || {};
    // Support VAPI "message" envelope (chat/preview and some assistants)
    const message = body.message || null;
    if (message && typeof message === 'object') {
      // Normalize common fields onto body so downstream logic works unchanged
      body.call = body.call || message.call || {};
      if (!body.status && message.type) body.status = message.type;
      if (!body.transcript && (message.transcript || message.data?.transcript || message.report?.transcript)) {
        body.transcript = message.transcript || message.data?.transcript || message.report?.transcript;
      }
      if (!body.structuredOutput && (message.structuredOutput || message.data?.structuredOutput)) {
        body.structuredOutput = message.structuredOutput || message.data?.structuredOutput;
      }
      if (!body.recordingUrl && (message.recordingUrl || message.data?.recordingUrl)) {
        body.recordingUrl = message.recordingUrl || message.data?.recordingUrl;
      }
      if (!body.metadata && message.metadata) body.metadata = message.metadata;
    }
    
    // Always return 200 to prevent VAPI from retrying
    res.status(200).json({ ok: true, received: true });
    
    const callId = body.call?.id || body.id || body.message?.call?.id;
    const status = body.call?.status || body.status;
    const outcome = body.call?.outcome || body.outcome;
    const duration = body.call?.duration || body.duration;
    const cost = body.call?.cost || body.cost;
    const metadata = body.call?.metadata || body.metadata || {};
    
    // Extract transcript and recording (NEW)
    // Capture transcript from multiple possible VAPI payload shapes
    // Prefer explicit transcript fields, then fall back to end-of-call report or messages aggregation
    let transcript = body.call?.transcript || body.transcript || body.summary || '';
    const eocrTranscript = body.endOfCallReport?.transcript || body.call?.endOfCallReport?.transcript || body.end_of_call_report?.transcript;
    if (!transcript && eocrTranscript) transcript = eocrTranscript;
    if (!transcript && Array.isArray(body.messages)) {
      const msgText = body.messages
        .map(m => (m?.content || m?.text || m?.message || ''))
        .filter(Boolean)
        .join(' ');
      if (msgText && msgText.length > transcript?.length) transcript = msgText;
    }
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
      metadata: Object.keys(metadata).length > 0 ? metadata : 'none',
      allBodyKeys: Object.keys(body)
    });

    // Best-effort dedupe to avoid duplicate sheet rows on retried webhooks
    if (callId && processedCallIds.has(callId)) {
      console.log('[VAPI WEBHOOK] Duplicate callId detected, skipping downstream processing:', callId);
      return;
    }

    // For logistics calls, we can extract without tenant metadata
    // Just get phone from wherever it might be
    const tenantKey = metadata.tenantKey || metadata.clientKey || 'logistics_client';
    const leadPhone = metadata.leadPhone || body.customer?.number || body.phone || '';
    
    // Skip only if absolutely no data at all
    if (!transcript && !status) {
      console.log('[VAPI WEBHOOK SKIP]', { reason: 'no_transcript_or_status', tenantKey: !!tenantKey, leadPhone: !!leadPhone });
      return;
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
    // Prefer per-tenant configuration, fall back to env, then hardcoded test sheet
    const logisticsSheetId = tenant?.vapi?.logisticsSheetId || tenant?.gsheet_id || process.env.LOGISTICS_SHEET_ID || '1Tnll3FXtNEERYdGHTOh4VtAn90FyG6INUIU46ZbsP6g';
    
    console.log('[LOGISTICS SHEET ID DEBUG]', {
      'tenant?.vapi?.logisticsSheetId': tenant?.vapi?.logisticsSheetId,
      'tenant?.gsheet_id': tenant?.gsheet_id,
      'process.env.LOGISTICS_SHEET_ID': process.env.LOGISTICS_SHEET_ID,
      'Final logisticsSheetId': logisticsSheetId,
      'Has transcript': !!transcript,
      'Transcript length': transcript.length,
      'Status': status,
      'Will update sheet': !!(logisticsSheetId && transcript && transcript.length > 100)
    });
    
    // CRITICAL DEBUG: Log exact condition check
    if (!logisticsSheetId) {
      console.log('[LOGISTICS SKIP] No sheet ID configured');
    }
    if (!transcript || transcript.length < 50) {
      console.log('[LOGISTICS SKIP] No meaningful transcript available:', { hasTranscript: !!transcript, length: transcript?.length });
    }
    
    // Check for structured output data from VAPI
    const structuredOutput = body.call?.structuredOutput || body.structuredOutput || body.structured_output;
    
    // Debug: Log what VAPI is sending
    console.log('[LOGISTICS DEBUG] Status received:', status);
    console.log('[LOGISTICS DEBUG] Structured output:', JSON.stringify(structuredOutput, null, 2));
    console.log('[LOGISTICS DEBUG] Transcript length:', transcript.length);
    console.log('[LOGISTICS DEBUG] Transcript present sources:', {
      call_transcript: !!(body.call?.transcript),
      body_transcript: !!(body.transcript),
      body_summary: !!(body.summary),
      eocr_transcript: !!eocrTranscript,
      messages_aggregated: Array.isArray(body.messages)
    });
    console.log('[LOGISTICS DEBUG] Extract if transcript exists and has content:', !!(transcript && transcript.length >= 50));
    console.log('[LOGISTICS DEBUG] GOOGLE_SA_JSON_BASE64 configured:', !!process.env.GOOGLE_SA_JSON_BASE64);
    
    // Extract when we have a transcript (minimum 50 chars to avoid noise from connection-only webhooks)
    // Track extracted call IDs to prevent duplicates
    const hasTranscript = transcript && transcript.length >= 50;
    const hasStructuredData = structuredOutput && Object.keys(structuredOutput).length > 0;
    
    console.log('[LOGISTICS CONDITION CHECK]', {
      logisticsSheetId: !!logisticsSheetId,
      hasTranscript,
      transcriptLength: transcript?.length || 0,
      hasStructuredData,
      willExtract: !!(logisticsSheetId && (hasTranscript || hasStructuredData))
    });
    
    if (logisticsSheetId && (hasTranscript || hasStructuredData)) {
      console.log('[LOGISTICS] STARTING EXTRACTION...');
      try {
        // Use structured output if available, otherwise fall back to transcript extraction
        let extracted;
        if (structuredOutput) {
          console.log('[LOGISTICS] Using structured output data:', JSON.stringify(structuredOutput, null, 2));
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
          
          // Fill in gaps from transcript if structured output is incomplete
          const transcriptExtracted = extractLogisticsFields(transcript);
          Object.keys(extracted).forEach(key => {
            if (!extracted[key] && transcriptExtracted[key]) {
              extracted[key] = transcriptExtracted[key];
            }
          });
        } else {
          console.log('[LOGISTICS] Using transcript extraction (no structured output)');
          extracted = extractLogisticsFields(transcript);
        }
        
        // Extract fields from structured output OR metadata/transcript
        const businessName = structuredOutput?.businessName || metadata.businessName || '';
        // Don't use customer.name as decision maker - only use if explicitly stated in structured output or transcript
        const decisionMaker = structuredOutput?.decisionMaker || (transcript.match(/decision\s+maker[^\n]{0,60}?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i)?.[1]) || '';
        const receptionistName = structuredOutput?.receptionistName || pickReceptionistName(transcript) || metadata.receptionistName || '';
        const callbackNeeded = structuredOutput?.callbackNeeded === 'Y' || /call\s*back|transfer|not\s*available|not\s*in|back\s*later|try\s*again/i.test(transcript) && !decisionMaker;

        // Map all fields properly according to headers
        const sheetData = {
          businessName: businessName || '',
          decisionMaker: decisionMaker || '',
          phone: leadPhone || '',
          email: extracted.email || '',
          international: extracted.international || '',
          mainCouriers: Array.isArray(extracted.mainCouriers) ? extracted.mainCouriers.join(', ') : (extracted.mainCouriers || ''),
          frequency: extracted.frequency || '',
          mainCountries: Array.isArray(extracted.mainCountries) ? extracted.mainCountries.join(', ') : (extracted.mainCountries || ''),
          exampleShipment: extracted.exampleShipment || '',
          exampleShipmentCost: extracted.exampleShipmentCost || '',
          domesticFrequency: extracted.domesticFrequency || '',
          ukCourier: extracted.ukCourier || '',
          standardRateUpToKg: extracted.standardRateUpToKg || '',
          excludingFuelVat: extracted.excludingFuelVat || '',
          singleVsMulti: extracted.singleVsMulti || '',
          receptionistName: receptionistName || '',
          callbackNeeded: callbackNeeded ? 'TRUE' : 'FALSE',
          callId: callId || '',
          recordingUrl: recordingUrl || '',
          transcriptSnippet: transcript.slice(0, 500) || ''
        };
        
        console.log('[LOGISTICS SHEET DATA] Writing to sheet:', JSON.stringify(sheetData, null, 2));
        
        try {
          console.log('[LOGISTICS SHEET] Attempting to append to sheet:', logisticsSheetId);
          await sheets.appendLogistics(logisticsSheetId, sheetData);
          console.log('[LOGISTICS SHEET APPEND] ✅ SUCCESS', { callId, phone: leadPhone });
          // Mark as processed to avoid duplicate rows on retries
          markProcessed(callId);
        } catch (sheetError) {
          console.error('[LOGISTICS SHEET APPEND ERROR] ❌ FAILED', {
            error: sheetError.message,
            errorName: sheetError.name,
            stack: sheetError.stack,
            callId,
            phone: leadPhone
          });
          throw sheetError; // Re-throw to catch it in outer handler
        }

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
    // Don't send response if headers already sent
    if (!res.headersSent) {
      res.status(200).json({ ok: true });
    }
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
