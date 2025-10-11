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
    console.log(`[INSTANT CALL] Client object:`, JSON.stringify(client, null, 2));
    console.log(`[INSTANT CALL] Client vapi_json:`, client?.vapi_json);
    console.log(`[INSTANT CALL] Environment VAPI_ASSISTANT_ID:`, VAPI_ASSISTANT_ID);
    
    const clientAssistantId = client?.vapi_json?.assistantId || VAPI_ASSISTANT_ID;
    const clientPhoneNumberId = client?.vapi_json?.phoneNumberId || VAPI_PHONE_NUMBER_ID;
    
    console.log(`[INSTANT CALL] Using assistant: ${clientAssistantId}, phone: ${clientPhoneNumberId}`);
    
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
        importedAt: new Date().toISOString()
      }
    };
    
    // Make Vapi API call with retry logic
    let result;
    let lastError;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(`${VAPI_URL}/call`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
          const error = await response.text();
          lastError = error;
          
          // Don't retry on 400-level errors (bad request)
          if (response.status >= 400 && response.status < 500) {
            console.error(`[INSTANT CALL] Vapi client error (${response.status}):`, error);
            return { ok: false, error: 'vapi_client_error', details: error, statusCode: response.status };
          }
          
          // Retry on 5xx errors
          if (attempt < maxRetries) {
            const delay = 1000 * Math.pow(2, attempt - 1); // Exponential backoff: 1s, 2s, 4s
            console.warn(`[INSTANT CALL] Vapi error (${response.status}), retrying in ${delay}ms (attempt ${attempt}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          
          console.error(`[INSTANT CALL] Vapi API error after ${maxRetries} attempts:`, error);
          return { ok: false, error: 'vapi_api_error', details: error, attempts: maxRetries };
        }
        
        result = await response.json();
        break; // Success!
        
      } catch (fetchError) {
        lastError = fetchError;
        
        if (attempt < maxRetries) {
          const delay = 1000 * Math.pow(2, attempt - 1);
          console.warn(`[INSTANT CALL] Network error, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})...`, fetchError.message);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        console.error(`[INSTANT CALL] Network error after ${maxRetries} attempts:`, fetchError);
        return { ok: false, error: 'network_error', details: fetchError.message, attempts: maxRetries };
      }
    }
    
    if (!result) {
      return { ok: false, error: 'max_retries_exceeded', details: lastError, attempts: maxRetries };
    }
    
    console.log(`[INSTANT CALL] ✅ Call initiated for ${lead.phone} - Call ID: ${result.id}`);
    
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

