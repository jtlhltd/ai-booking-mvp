import express from 'express';
import * as store from '../store.js';
import * as sheets from '../sheets.js';
import { analyzeCall } from '../lib/call-quality-analysis.js';
import messagingService from '../lib/messaging-service.js';
import { extractLogisticsFields } from '../lib/logistics-extractor.js';
import { recordReceptionistTelemetry } from '../lib/demo-telemetry.js';
import { storeCallContext } from '../lib/call-context-cache.js';
import { verifyVapiSignature } from '../middleware/vapi-webhook-verification.js';

const router = express.Router();

// Middleware to preserve raw body for signature verification
router.use('/webhooks/vapi', express.raw({ type: 'application/json' }), (req, res, next) => {
  // Store raw body for signature verification
  req.rawBody = req.body;
  // Parse JSON body for normal processing
  try {
    req.body = JSON.parse(req.body.toString());
  } catch (e) {
    req.body = {};
  }
  next();
});

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
router.post('/webhooks/vapi', verifyVapiSignature, async (req, res) => {
  // Extract correlation ID from webhook metadata
  const body = req.body || {};
  const correlationId = body.metadata?.correlationId || 
                        body.metadata?.requestId ||
                        body.call?.metadata?.correlationId ||
                        `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Attach to request for logging
  req.correlationId = correlationId;
  req.id = correlationId;
  
  console.log(`[${correlationId}] [VAPI WEBHOOK] ==================== NEW WEBHOOK RECEIVED ====================`);
  console.log(`[${correlationId}] [VAPI WEBHOOK] Timestamp:`, new Date().toISOString());
  
  try {
    console.log(`[${correlationId}] [VAPI WEBHOOK DEBUG] Raw body:`, JSON.stringify(req.body, null, 2));
    console.log(`[${correlationId}] [VAPI WEBHOOK DEBUG] Raw body type:`, typeof req.body);
    console.log(`[${correlationId}] [VAPI WEBHOOK DEBUG] Body keys:`, Object.keys(req.body || {}));
    console.log(`[${correlationId}] [VAPI WEBHOOK DEBUG] Headers:`, JSON.stringify(req.headers, null, 2));
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
    
    // Build full formatted transcript from messages array (preserves conversation structure)
    // IMPORTANT: Filter out system/instruction messages - only include actual conversation
    if (Array.isArray(body.messages) && body.messages.length > 0) {
      const formattedMessages = body.messages
        .map(m => {
          const role = m?.role || m?.type || 'unknown';
          const content = m?.content || m?.text || m?.message || m?.body || '';
          if (!content) return null;
          
          // Skip system messages, instructions, and tool/function calls
          // These are not part of the actual conversation
          if (role === 'system' || role === 'function' || role === 'tool') {
            return null;
          }
          
          // Skip messages that look like instructions/scripts (contain keywords like "TOOLS:", "CRITICAL:", etc.)
          const contentUpper = content.toUpperCase();
          if (contentUpper.includes('TOOLS:') || 
              contentUpper.includes('CRITICAL:') || 
              contentUpper.includes('FOLLOW THIS SCRIPT') ||
              contentUpper.includes('DO NOT ADD YOUR OWN') ||
              contentUpper.includes('USE ACCESS_GOOGLE_SHEET') ||
              contentUpper.includes('USE SCHEDULE_CALLBACK')) {
            return null;
          }
          
          // Format role labels for actual conversation
          // Check role in multiple possible fields and variations
          const roleLower = (role || '').toLowerCase();
          const messageRole = m?.message?.role || m?.messageRole || role;
          const messageRoleLower = (messageRole || '').toLowerCase();
          
          let label = 'AI'; // Default to AI if not clearly a user message (in calls, non-user = AI)
          
          // Check for user/customer/caller roles
          if (roleLower === 'user' || roleLower === 'customer' || roleLower === 'caller' || 
              roleLower === 'human' || roleLower === 'person' ||
              messageRoleLower === 'user' || messageRoleLower === 'customer' || messageRoleLower === 'caller' ||
              messageRoleLower === 'human' || messageRoleLower === 'person') {
            label = 'User';
          } 
          // Explicitly check for assistant/AI roles (though default is already AI)
          else if (roleLower === 'assistant' || roleLower === 'ai' || roleLower === 'bot' ||
                   messageRoleLower === 'assistant' || messageRoleLower === 'ai' || messageRoleLower === 'bot') {
            label = 'AI';
          }
          
          return `${label}: ${content}`;
        })
        .filter(Boolean)
        .join('\n\n');
      
      // Use formatted messages if it's longer/more complete than existing transcript
      if (formattedMessages && formattedMessages.length > (transcript?.length || 0)) {
        transcript = formattedMessages;
      } else if (!transcript && formattedMessages) {
        transcript = formattedMessages;
      }
    }
    
    // Fallback: if still no transcript, try simple message join (filter out system/instruction messages)
    if (!transcript && Array.isArray(body.messages)) {
      const msgText = body.messages
        .map(m => {
          const role = m?.role || m?.type || 'unknown';
          const content = m?.content || m?.text || m?.message || '';
          if (!content) return null;
          
          // Skip system messages, instructions, and tool/function calls
          if (role === 'system' || role === 'function' || role === 'tool') {
            return null;
          }
          
          // Skip messages that look like instructions/scripts
          const contentUpper = content.toUpperCase();
          if (contentUpper.includes('TOOLS:') || 
              contentUpper.includes('CRITICAL:') || 
              contentUpper.includes('FOLLOW THIS SCRIPT') ||
              contentUpper.includes('DO NOT ADD YOUR OWN') ||
              contentUpper.includes('USE ACCESS_GOOGLE_SHEET') ||
              contentUpper.includes('USE SCHEDULE_CALLBACK')) {
            return null;
          }
          
          return content;
        })
        .filter(Boolean)
        .join(' ');
      if (msgText && msgText.length > 0) transcript = msgText;
    }
    const recordingUrl = body.call?.recordingUrl || body.recordingUrl || body.recording_url || '';
    const vapiMetrics = body.call?.metrics || body.metrics || {};
    
    // Extract assistant ID from webhook payload
    const assistantId = body.call?.assistantId || body.assistant?.id || body.assistantId || metadata.assistantId || '';
    
    console.log('[VAPI WEBHOOK]', { 
      callId, 
      status, 
      outcome, 
      duration, 
      cost,
      assistantId,
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
    // Use test_client as default since that's what VAPI sends in X-Client-Key header
    const tenantKey = metadata.tenantKey || metadata.clientKey || 'test_client';
    const leadPhone = metadata.leadPhone || body.customer?.number || body.call?.customer?.number || body.phone || '';
    const leadName = metadata.leadName || body.customer?.name || body.call?.customer?.name || '';
    
    console.log('[VAPI WEBHOOK] ==================== COMPLETE DEBUG ====================');
    console.log('[VAPI WEBHOOK] 🆔 CallId:', callId);
    console.log('[VAPI WEBHOOK] 🏢 TenantKey components:', {
      'metadata.tenantKey': metadata.tenantKey,
      'metadata.clientKey': metadata.clientKey,
      'FINAL tenantKey': tenantKey
    });
    console.log('[VAPI WEBHOOK] 📞 Phone extraction:', { 
      'metadata.leadPhone': metadata.leadPhone,
      'body.customer?.number': body.customer?.number,
      'body.call?.customer?.number': body.call?.customer?.number,
      'body.phone': body.phone,
      'FINAL leadPhone': leadPhone
    });
    console.log('[VAPI WEBHOOK] 👤 Name:', leadName);
    console.log('[VAPI WEBHOOK] 📊 Status:', status);
    
    // ALWAYS store the callId for this tenant, even without phone
    // The booking endpoint will fetch phone from VAPI API using this callId
    if (callId) {
      console.log('[VAPI WEBHOOK] ✅✅✅ STORING CALL CONTEXT (even without phone) ✅✅✅');
      console.log('[VAPI WEBHOOK] Storage payload:', JSON.stringify({
        callId: callId,
        phone: leadPhone || null,
        name: leadName || null,
        metadata: {
          tenantKey: tenantKey,
          status: status,
          timestamp: Date.now()
        }
      }, null, 2));
      
      storeCallContext(callId, leadPhone || null, leadName || null, {
        tenantKey,
        status,
        timestamp: Date.now()
      });
      
      console.log('[VAPI WEBHOOK] ✅ STORAGE COMPLETE');
    } else {
      console.log('[VAPI WEBHOOK] ❌❌❌ NOT STORING - NO CALL ID ❌❌❌');
      console.log('[VAPI WEBHOOK] Missing data debug:', { 
        hasCallId: !!callId,
        callIdValue: callId,
        callIdType: typeof callId,
        hasLeadPhone: !!leadPhone,
        leadPhoneValue: leadPhone,
        leadPhoneType: typeof leadPhone,
        leadPhoneLength: leadPhone?.length
      });
    }
    
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

    await recordReceptionistTelemetry({
      evt: 'receptionist.call_webhook',
      tenant: tenantKey,
      callId,
      callPurpose: metadata.callPurpose || metadata.CallPurpose || null,
      intentHints: metadata.intentHints || metadata.IntentHints || [],
      status,
      outcome,
      duration,
      cost,
      toolCallCount: Array.isArray(body.toolCalls || body.call?.toolCalls || body.message?.toolCalls) ? (body.toolCalls || body.call?.toolCalls || body.message?.toolCalls || []).length : 0,
      qualityScore: analysis.qualityScore,
      sentiment: analysis.sentiment
    });

    // Handle tool calls from VAPI assistant
    // Check multiple possible locations for toolCalls
    const toolCalls = body.toolCalls || body.call?.toolCalls || body.message?.toolCalls || [];
    
    console.log('[VAPI WEBHOOK] Tool calls check:', {
      'body.toolCalls': !!body.toolCalls,
      'body.call?.toolCalls': !!body.call?.toolCalls,
      'body.message?.toolCalls': !!body.message?.toolCalls,
      'final toolCalls length': toolCalls.length,
      'toolCalls': toolCalls
    });
    
    if (toolCalls && toolCalls.length > 0) {
      console.log('[VAPI WEBHOOK] Processing tool calls:', toolCalls.length);
      
      // Import function handlers
      const { handleVapiFunctionCall } = await import('../lib/vapi-function-handlers.js');
      
      for (const toolCall of toolCalls) {
        try {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments || '{}');
          
          // Handle new receptionist functions
          if ([
            'lookup_customer',
            'lookup_appointment',
            'get_upcoming_appointments',
            'reschedule_appointment',
            'cancel_appointment',
            'get_business_info',
            'get_business_hours',
            'get_services',
            'answer_question',
            'take_message'
          ].includes(functionName)) {
            
            const result = await handleVapiFunctionCall({
              functionName,
              arguments: functionArgs,
              metadata: {
                clientKey: tenantKey,
                callId: callId,
                leadPhone: leadPhone,
                ...metadata
              }
            });
            
            console.log('[VAPI WEBHOOK] Function result:', {
              function: functionName,
              success: result.success
            });

            await recordReceptionistTelemetry({
              evt: 'receptionist.tool_call',
              tenant: tenantKey,
              callId,
              callPurpose: metadata.callPurpose || metadata.CallPurpose || null,
              function: functionName,
              success: result.success
            });
            
            continue;
          }
          
          // Handle calendar_checkAndBook - we have the customer phone in the webhook!
          if (functionName === 'calendar_checkAndBook') {
            console.log('[VAPI WEBHOOK] 🔧 Intercepting calendar_checkAndBook - customer phone:', leadPhone);
            
            // Add phone to function args from webhook data
            const argsWithPhone = {
              ...functionArgs,
              lead: {
                ...(functionArgs.lead || {}),
                phone: leadPhone || functionArgs.lead?.phone || '',
                name: functionArgs.lead?.name || functionArgs.customerName || ''
              },
              customerPhone: leadPhone || functionArgs.customerPhone || '',
              phone: leadPhone || functionArgs.phone || ''
            };
            
            console.log('[VAPI WEBHOOK] 📞 Enhanced args with phone:', JSON.stringify(argsWithPhone, null, 2));
            
            // Call booking endpoint directly with phone included
            try {
              const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
              const bookingResponse = await fetch(`${PUBLIC_BASE_URL}/api/calendar/check-book`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Client-Key': tenantKey,
                  'X-Call-Id': callId || '',
                  'X-Customer-Phone': leadPhone || ''
                },
                body: JSON.stringify(argsWithPhone)
              });
              
              const bookingResult = await bookingResponse.json();
              console.log('[VAPI WEBHOOK] ✅ Booking result:', bookingResult);
              
              // Store the result for VAPI to use (this won't work for function calls, but we log it)
              return bookingResult;
            } catch (error) {
              console.error('[VAPI WEBHOOK] ❌ Error calling booking endpoint:', error);
              return { error: error.message };
            }
          }
          
          // Legacy functions (keep existing logic)
          if (toolCall.function.name === 'access_google_sheet') {
            console.log('[VAPI WEBHOOK] Processing access_google_sheet tool call');
            console.log('[VAPI WEBHOOK] Raw arguments:', toolCall.function.arguments);
            console.log('[VAPI WEBHOOK] Arguments type:', typeof toolCall.function.arguments);
            
            // Parse arguments - handle both string and object formats
            let args;
            try {
              if (typeof toolCall.function.arguments === 'string') {
                args = JSON.parse(toolCall.function.arguments);
              } else if (typeof toolCall.function.arguments === 'object' && toolCall.function.arguments !== null) {
                args = toolCall.function.arguments;
              } else {
                console.error('[VAPI WEBHOOK] Invalid arguments format:', toolCall.function.arguments);
                throw new Error('Invalid arguments format for access_google_sheet');
              }
            } catch (parseError) {
              console.error('[VAPI WEBHOOK] Failed to parse arguments:', parseError);
              console.error('[VAPI WEBHOOK] Arguments value:', toolCall.function.arguments);
              throw parseError;
            }
            
            console.log('[VAPI WEBHOOK] Parsed arguments:', JSON.stringify(args, null, 2));
            const { action, data } = args;
            
            console.log('[VAPI WEBHOOK] Extracted action:', action);
            console.log('[VAPI WEBHOOK] Extracted data:', JSON.stringify(data, null, 2));
            
            // Get tenant configuration
            const logisticsSheetId = tenant?.vapi?.logisticsSheetId || tenant?.gsheet_id || process.env.LOGISTICS_SHEET_ID;
            
            console.log('[VAPI WEBHOOK] Logistics sheet ID:', logisticsSheetId);
            
            if (logisticsSheetId) {
              if (action === 'append' && data) {
                console.log('[VAPI WEBHOOK] Appending data to sheet...');
                // Ensure logistics headers are present
                await sheets.ensureLogisticsHeader(logisticsSheetId);
                
                // Append data to sheet - use the correct callId variable
                await sheets.appendLogistics(logisticsSheetId, {
                  ...data,
                  callId: callId || '',
                  timestamp: new Date().toISOString(),
                  businessName: metadata.businessName || data.businessName || 'Unknown',
                  leadPhone: leadPhone || data.phone || ''
                });
                
                console.log('[VAPI WEBHOOK] ✅ Data appended to sheet via tool call successfully');
              } else {
                console.log('[VAPI WEBHOOK] Skipping append - action:', action, 'hasData:', !!data);
              }
            } else {
              console.error('[VAPI WEBHOOK] No logistics sheet ID configured');
            }
            
          } else if (toolCall.function.name === 'schedule_callback') {
            console.log('[VAPI WEBHOOK] Processing schedule_callback tool call');
            
            // Parse arguments - handle both string and object formats
            let args;
            try {
              if (typeof toolCall.function.arguments === 'string') {
                args = JSON.parse(toolCall.function.arguments);
              } else if (typeof toolCall.function.arguments === 'object' && toolCall.function.arguments !== null) {
                args = toolCall.function.arguments;
              } else {
                console.error('[VAPI WEBHOOK] Invalid arguments format for schedule_callback');
                throw new Error('Invalid arguments format for schedule_callback');
              }
            } catch (parseError) {
              console.error('[VAPI WEBHOOK] Failed to parse schedule_callback arguments:', parseError);
              throw parseError;
            }
            
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
                <p><strong>Call ID:</strong> ${callId || 'N/A'}</p>
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
    
    // Only process logistics extraction for the specific assistant ID
    const ALLOWED_LOGISTICS_ASSISTANT_ID = 'b19a474b-49f3-474d-adb2-4aacc6ad37e7';
    
    console.log('[LOGISTICS SHEET ID DEBUG]', {
      'tenant?.vapi?.logisticsSheetId': tenant?.vapi?.logisticsSheetId,
      'tenant?.gsheet_id': tenant?.gsheet_id,
      'process.env.LOGISTICS_SHEET_ID': process.env.LOGISTICS_SHEET_ID,
      'Final logisticsSheetId': logisticsSheetId,
      'assistantId': assistantId,
      'allowedAssistantId': ALLOWED_LOGISTICS_ASSISTANT_ID,
      'assistantMatches': assistantId === ALLOWED_LOGISTICS_ASSISTANT_ID,
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
    if (assistantId && assistantId !== ALLOWED_LOGISTICS_ASSISTANT_ID) {
      console.log('[LOGISTICS SKIP] Assistant ID mismatch - not processing logistics extraction:', {
        received: assistantId,
        expected: ALLOWED_LOGISTICS_ASSISTANT_ID
      });
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
    
    // Only proceed if assistant ID exists and matches the allowed one
    const assistantMatches = assistantId && assistantId === ALLOWED_LOGISTICS_ASSISTANT_ID;
    
    console.log('[LOGISTICS CONDITION CHECK]', {
      logisticsSheetId: !!logisticsSheetId,
      hasTranscript,
      transcriptLength: transcript?.length || 0,
      hasStructuredData,
      assistantMatches,
      assistantId,
      willExtract: !!(logisticsSheetId && (hasTranscript || hasStructuredData) && assistantMatches)
    });
    
    if (logisticsSheetId && (hasTranscript || hasStructuredData) && assistantMatches) {
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
    
    // Add to retry queue for failed webhook processing
    try {
      const { addWebhookToRetryQueue } = await import('../lib/webhook-retry.js');
      await addWebhookToRetryQueue({
        webhookType: 'vapi',
        webhookUrl: '/webhooks/vapi',
        payload: req.body,
        headers: req.headers,
        error: e
      });
      console.log('[VAPI WEBHOOK] Added failed webhook to retry queue');
    } catch (retryError) {
      console.error('[VAPI WEBHOOK] Failed to add to retry queue:', retryError);
    }
    
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
