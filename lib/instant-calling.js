// lib/instant-calling.js
// Instant lead calling system - calls leads within 30 seconds of upload

/**
 * Call a lead immediately with Vapi
 * @param {Object} params - Call parameters
 * @returns {Object} - Call result
 */
export async function callLeadInstantly({ clientKey, lead, client }) {
  const VAPI_URL = 'https://api.vapi.ai';
  const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
  const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;
  const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;
  
  if (!VAPI_PRIVATE_KEY || !VAPI_ASSISTANT_ID || !VAPI_PHONE_NUMBER_ID) {
    console.error('[INSTANT CALL] Vapi not configured');
    return { ok: false, error: 'vapi_not_configured' };
  }
  
  try {
    console.log(`[INSTANT CALL] Calling ${lead.name || lead.phone} (score: ${lead.leadScore || 'N/A'})...`);
    
    // Get client's Vapi settings from database
    // Note: getFullClient returns client.vapi, not client.vapi_json
    const clientAssistantId = client?.vapi?.assistantId || client?.vapiAssistantId || VAPI_ASSISTANT_ID;
    const clientPhoneNumberId = client?.vapi?.phoneNumberId || client?.vapiPhoneNumberId || VAPI_PHONE_NUMBER_ID;
    
    console.log(`[INSTANT CALL] Using assistant: ${clientAssistantId}, phone: ${clientPhoneNumberId}`);
    
    // Generate correlation ID if not provided
    const correlationId = lead.correlationId || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const webhookBaseUrl = process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || 'https://ai-booking-mvp.onrender.com';
    const serverUrl = `${webhookBaseUrl.replace(/\/$/, '')}/webhooks/vapi`;

    // Prepare Vapi call payload
    const payload = {
      assistantId: clientAssistantId,
      phoneNumberId: clientPhoneNumberId,
      customer: {
        number: lead.phone,
        name: lead.name || 'Prospect'
      },
      metadata: {
        tenantKey: clientKey,
        clientKey: clientKey,
        leadPhone: lead.phone,
        leadName: lead.name,
        businessName: client?.business_name || clientKey,
        service: lead.service || 'consultation',
        industry: client?.industry || 'general',
        source: lead.source || 'csv_import',
        leadScore: lead.leadScore || 50,
        importedAt: new Date().toISOString(),
        correlationId,
        requestId: correlationId
      },
      server: {
        url: serverUrl
      },
      serverMessages: [
        'end-of-call-report',
        'status-update',
        'transcript',
        'hang'
      ]
    };

    // Add assistant overrides if provided (for variable values, etc.)
    if (client?.assistantOverrides) {
      payload.assistantOverrides = client.assistantOverrides;
    }
    
    // Make Vapi API call with circuit breaker and timeout
    const { withCircuitBreaker } = await import('./circuit-breaker.js');
    const { fetchWithTimeout, TIMEOUTS } = await import('./timeouts.js');
    
    const result = await withCircuitBreaker(
      'vapi_call',
      async () => {
        const response = await fetchWithTimeout(
          `${VAPI_URL}/call`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
              'Content-Type': 'application/json',
              'X-Correlation-ID': correlationId,
              'X-Request-ID': correlationId
            },
            body: JSON.stringify(payload)
          },
          TIMEOUTS.vapi
        );
        
        if (!response.ok) {
          const error = await response.text();
          
          // Don't retry on 400-level errors (bad request)
          if (response.status >= 400 && response.status < 500) {
            console.error(`[INSTANT CALL] Vapi client error (${response.status}):`, error);
            return { ok: false, error: 'vapi_client_error', details: error, statusCode: response.status };
          }
          
          // Throw for 5xx errors to trigger circuit breaker
          throw new Error(`VAPI API error: ${response.status} - ${error}`);
        }
        
        const data = await response.json();
        return { ok: true, ...data };
      },
      async () => {
        // Fallback: Send SMS instead
        console.log('[INSTANT CALL] Circuit breaker open, using SMS fallback');
        const messagingService = (await import('./messaging-service.js')).default;
        await messagingService.sendSMS({
          to: lead.phoneNumber,
          message: `Hi ${lead.decisionMaker}, ${client?.displayName || 'We'} tried to call you but had a technical issue. Please call us back or reply with your preferred time.`,
          clientKey
        });
        return { ok: false, error: 'circuit_breaker_open', fallback: 'sms_sent' };
      }
    );
    
    if (!result || !result.ok || !result.id) {
      return { ok: false, error: result?.error || 'call_failed', details: result?.details };
    }
    
    console.log(`[INSTANT CALL] ✅ Call initiated for ${lead.phone} - Call ID: ${result.id}`);
    
    // Save call to database immediately so dashboard shows it
    try {
      const { upsertCall } = await import('../db.js');
      await upsertCall({
        callId: result.id,
        clientKey: clientKey,
        leadPhone: lead.phone,
        status: 'initiated', // Will be updated by webhooks when call progresses
        outcome: null,
        duration: null,
        cost: null,
        metadata: {
          tenantKey: clientKey,
          leadPhone: lead.phone,
          leadName: lead.name,
          leadService: lead.service,
          leadSource: lead.source,
          leadScore: lead.leadScore,
          initiatedAt: new Date().toISOString(),
          fromQueue: false
        },
        retryAttempt: 0
      });
      console.log(`[INSTANT CALL] 💾 Call saved to database: ${result.id}`);
    } catch (dbError) {
      console.error('[INSTANT CALL] Failed to save call to database:', dbError);
      // Don't fail the call if database save fails - webhook will save it later
    }
    
    // === NEW: Emit real-time event ===
    try {
      const { emitCallStarted } = await import('./realtime-events.js');
      emitCallStarted(clientKey, {
        callId: result.id,
        leadPhone: lead.phone,
        leadName: lead.name,
        status: 'in_progress'
      });
    } catch (error) {
      console.error('[REALTIME EVENT ERROR]', error);
      // Don't fail the call if real-time fails
    }
    
    return {
      ok: true,
      callId: result.id,
      status: result.status,
      leadPhone: lead.phone,
      leadName: lead.name,
      leadScore: lead.leadScore
    };
    
  } catch (error) {
    console.error(`[INSTANT CALL ERROR]`, error);
    return { ok: false, error: error.message };
  }
}

/**
 * Process call queue with intelligent rate limiting
 * @param {Array} leads - Array of leads to call
 * @param {Object} client - Client data
 * @param {Object} options - Processing options
 */
export async function processCallQueue(leads, client, options = {}) {
  const {
    maxConcurrent = 5, // Max 5 calls at once
    delayBetweenCalls = 2000, // 2 seconds between each call
    maxCallsPerBatch = 50 // Process 50 at a time
  } = options;
  
  console.log(`[CALL QUEUE] Processing ${leads.length} leads for ${client.client_key}`);
  
  const results = {
    total: leads.length,
    initiated: 0,
    failed: 0,
    skipped: 0,
    callIds: []
  };
  
  // Process in batches to avoid overwhelming Vapi
  const batches = [];
  for (let i = 0; i < leads.length; i += maxCallsPerBatch) {
    batches.push(leads.slice(i, i + maxCallsPerBatch));
  }
  
  for (const [batchIndex, batch] of batches.entries()) {
    console.log(`[CALL QUEUE] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} leads)`);
    
    for (const lead of batch) {
      try {
        // Call instantly
        const callResult = await callLeadInstantly({
          clientKey: client.client_key,
          lead,
          client
        });
        
        if (callResult.ok) {
          results.initiated++;
          results.callIds.push(callResult.callId);
          console.log(`[CALL QUEUE] ${results.initiated}/${leads.length}: ✅ ${lead.phone}`);
        } else {
          results.failed++;
          console.log(`[CALL QUEUE] ${results.initiated}/${leads.length}: ❌ ${lead.phone} - ${callResult.error}`);
        }
        
        // Delay between calls (prevent rate limiting)
        if (delayBetweenCalls > 0) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenCalls));
        }
        
      } catch (error) {
        results.failed++;
        console.error(`[CALL QUEUE] Error calling ${lead.phone}:`, error);
      }
    }
    
    // Delay between batches (5 seconds)
    if (batchIndex < batches.length - 1) {
      console.log(`[CALL QUEUE] Batch complete. Waiting 5 seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  console.log(`[CALL QUEUE] ✅ Complete: ${results.initiated} calls initiated, ${results.failed} failed`);
  
  return results;
}

/**
 * Helper function for delays
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate estimated completion time
 * @param {number} leadCount - Number of leads
 * @param {number} delayMs - Delay between calls in ms
 * @returns {Object} - Time estimates
 */
export function estimateCallTime(leadCount, delayMs = 2000) {
  const totalSeconds = (leadCount * delayMs) / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  
  return {
    totalSeconds,
    formatted: `${minutes}m ${seconds}s`,
    completionTime: new Date(Date.now() + totalSeconds * 1000).toLocaleString('en-GB')
  };
}

