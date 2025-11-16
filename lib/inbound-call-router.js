// lib/inbound-call-router.js
// Routes inbound calls to appropriate Vapi assistant based on client, time, and context

import { getFullClient } from '../db.js';
import messagingService from './messaging-service.js';
import { recordReceptionistTelemetry } from './demo-telemetry.js';

/**
 * Route an inbound call to the appropriate Vapi assistant
 * @param {Object} params - Call routing parameters
 * @param {string} params.fromPhone - Caller's phone number (E.164)
 * @param {string} params.toPhone - Called phone number (E.164)
 * @param {string} params.callSid - Twilio Call SID
 * @param {string} params.clientKey - Optional: pre-identified client key
 * @returns {Promise<Object>} - Vapi call configuration
 */
export async function routeInboundCall({
  fromPhone,
  toPhone,
  callSid,
  clientKey = null
}) {
  try {
    console.log('[INBOUND ROUTER] Routing call:', {
      fromPhone,
      toPhone,
      callSid,
      clientKey
    });

    // Step 1: Identify client from phone number
    const client = clientKey 
      ? await getFullClient(clientKey)
      : await identifyClientFromPhoneNumber(toPhone);

    if (!client) {
      console.error('[INBOUND ROUTER] Client not found for phone:', toPhone);
      throw new Error('Client not found for phone number');
    }

    // Step 2: Check if this is a known customer
    const customer = await lookupCustomer({
      clientKey: client.client_key || client.key,
      phoneNumber: fromPhone
    });

    // Step 3: Check business hours
    const isBusinessHours = checkBusinessHours(client);
    const timeContext = isBusinessHours ? 'business_hours' : 'after_hours';

    // Step 4: Determine call purpose (will be refined by Vapi during call)
    const callContext = {
      isBusinessHours,
      timeContext,
      isKnownCustomer: !!customer,
      customerName: customer?.name || null,
      lastAppointment: customer?.lastAppointment || null,
      preferredService: customer?.preferredService || null
    };
    const callPurpose = callContext.isKnownCustomer ? 'inbound_reception_existing' : 'inbound_reception_new';
    const intentHints = [];
    if (!callContext.isBusinessHours) intentHints.push('after_hours');
    if (callContext.preferredService) intentHints.push(`service:${callContext.preferredService}`);
    if (callContext.lastAppointment) intentHints.push('has_previous_booking');
    callContext.callPurpose = callPurpose;
    callContext.intentHints = intentHints;

    // Step 5: Select appropriate Vapi assistant
    const assistantConfig = selectAssistant(client, callContext);
    if (!assistantConfig?.assistantId || !assistantConfig?.phoneNumberId) {
      throw new Error('No Vapi assistant configured for inbound routing');
    }

    const vapiConfig = {
      assistantId: assistantConfig.assistantId,
      phoneNumberId: assistantConfig.phoneNumberId,
      customer: {
        number: fromPhone,
        name: customer?.name || 'Caller'
      },
      metadata: {
        clientKey: client.client_key || client.key,
        callSid,
        toPhone,
        callType: 'inbound',
        timeContext,
        callPurpose,
        intentHints,
        callerPhone: fromPhone,
        isKnownCustomer: callContext.isKnownCustomer,
        customerId: customer?.id || null,
        businessName: client.display_name || client.business_name || client.name,
        businessPhone: toPhone
      },
      assistantOverrides: {
        variableValues: {
          ClientKey: client.client_key || client.key,
          BusinessName: client.display_name || client.business_name || client.name,
          BusinessPhone: toPhone,
          CallerName: customer?.name || 'Guest',
          CallerPhone: fromPhone,
          IsBusinessHours: isBusinessHours ? 'true' : 'false',
          TimeContext: timeContext,
          CallPurpose: callPurpose,
          CallIntentHint: intentHints.join(', ') || 'reception_inquiry',
          IsKnownCustomer: callContext.isKnownCustomer ? 'true' : 'false',
          LastAppointment: customer?.lastAppointment || 'Never',
          PreferredService: customer?.preferredService || client.defaultService || 'consultation',
          Timezone: client.timezone || client.booking?.timezone || 'Europe/London',
          ConsentLine: process.env.CONSENT_LINE || 'This call may be recorded for quality assurance.'
        }
      }
    };

    await recordReceptionistTelemetry({
      evt: 'receptionist.call_routed',
      tenant: client.client_key || client.key,
      callSid,
      callPurpose,
      intentHints,
      isBusinessHours,
      isKnownCustomer: callContext.isKnownCustomer,
      callerPhone: fromPhone,
      assistantId: assistantConfig.assistantId
    });

    console.log('[INBOUND ROUTER] ✅ Routing complete:', {
      clientKey: client.client_key || client.key,
      assistantId: assistantConfig.assistantId,
      isKnownCustomer: callContext.isKnownCustomer,
      timeContext
    });

    return {
      success: true,
      vapiConfig,
      callContext,
      client: {
        key: client.client_key || client.key,
        name: client.display_name || client.business_name || client.name
      }
    };

  } catch (error) {
    console.error('[INBOUND ROUTER] ❌ Error routing call:', error);
    throw error;
  }
}

/**
 * Identify client from phone number
 * @param {string} toPhone - Phone number that was called
 * @returns {Promise<Object|null>} - Client configuration
 */
async function identifyClientFromPhoneNumber(toPhone) {
  try {
    // Query database to find client by phone number
    // This assumes you have a mapping table or phone numbers in client config
    const { query } = await import('../db.js');
    
    // Check if phone number is in client's configured numbers
    const result = await query(`
      SELECT 
        client_key,
        display_name,
        business_name,
        name,
        timezone,
        booking,
        vapi_json,
        twilio_json
      FROM tenants
      WHERE 
        numbers_json::text LIKE $1
        OR twilio_json->>'fromNumber' = $2
        OR twilio_json->>'phoneNumber' = $2
      LIMIT 1
    `, [`%${toPhone}%`, toPhone]);

    if (result.rows && result.rows.length > 0) {
      return await getFullClient(result.rows[0].client_key);
    }

    // Fallback: Check environment variable for default client
    if (process.env.DEFAULT_CLIENT_KEY) {
      return await getFullClient(process.env.DEFAULT_CLIENT_KEY);
    }

    return null;
  } catch (error) {
    console.error('[INBOUND ROUTER] Error identifying client:', error);
    return null;
  }
}

/**
 * Lookup customer by phone number
 * @param {Object} params
 * @returns {Promise<Object|null>} - Customer profile
 */
async function lookupCustomer({ clientKey, phoneNumber }) {
  try {
    const { query } = await import('../db.js');
    
    // First, try to find in customer_profiles table (if exists)
    try {
      const profileResult = await query(`
        SELECT 
          id,
          name,
          email,
          preferences_json,
          vip_status,
          special_notes,
          last_interaction,
          total_appointments
        FROM customer_profiles
        WHERE client_key = $1 AND phone = $2
        LIMIT 1
      `, [clientKey, phoneNumber]);

      if (profileResult.rows && profileResult.rows.length > 0) {
        const profile = profileResult.rows[0];
        
        // Get last appointment
        const lastApptResult = await query(`
          SELECT start_iso, service
          FROM appointments
          WHERE client_key = $1 AND lead_id IN (
            SELECT id FROM leads WHERE client_key = $1 AND phone = $2
          )
          ORDER BY start_iso DESC
          LIMIT 1
        `, [clientKey, phoneNumber]);

        return {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          phone: phoneNumber,
          vipStatus: profile.vip_status,
          specialNotes: profile.special_notes,
          lastAppointment: lastApptResult.rows?.[0]?.start_iso || null,
          preferredService: profile.preferences_json?.preferredService || null,
          totalAppointments: profile.total_appointments || 0
        };
      }
    } catch (error) {
      // Table might not exist yet - that's okay, fall through to leads table
      console.log('[INBOUND ROUTER] customer_profiles table not found, using leads table');
    }

    // Fallback: Check leads table
    const leadsResult = await query(`
      SELECT 
        id,
        name,
        phone,
        service,
        status,
        created_at
      FROM leads
      WHERE client_key = $1 AND phone = $2
      ORDER BY created_at DESC
      LIMIT 1
    `, [clientKey, phoneNumber]);

    if (leadsResult.rows && leadsResult.rows.length > 0) {
      const lead = leadsResult.rows[0];
      
      // Get last appointment for this lead
      const lastApptResult = await query(`
        SELECT start_iso, service
        FROM appointments
        WHERE client_key = $1 AND lead_id = $2
        ORDER BY start_iso DESC
        LIMIT 1
      `, [clientKey, lead.id]);

      return {
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        lastAppointment: lastApptResult.rows?.[0]?.start_iso || null,
        preferredService: lead.service || null
      };
    }

    return null;
  } catch (error) {
    console.error('[INBOUND ROUTER] Error looking up customer:', error);
    return null;
  }
}

/**
 * Check if current time is within business hours
 * @param {Object} client - Client configuration
 * @returns {boolean}
 */
function checkBusinessHours(client) {
  const now = new Date();
  const tz = client?.booking?.timezone || client?.timezone || 'Europe/London';
  const clientTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const hour = clientTime.getHours();
  const day = clientTime.getDay(); // 0 = Sunday, 6 = Saturday

  const businessHours = client?.businessHours || client?.booking?.businessHours || {
    start: 9,
    end: 17,
    days: [1, 2, 3, 4, 5] // Monday to Friday
  };

  const isWeekday = businessHours.days.includes(day);
  const isBusinessHour = hour >= businessHours.start && hour < businessHours.end;

  return isWeekday && isBusinessHour;
}

/**
 * Select appropriate Vapi assistant based on context
 * @param {Object} client - Client configuration
 * @param {Object} callContext - Call context
 * @returns {Object} - Assistant configuration
 */
function selectAssistant(client, callContext) {
  // Priority order:
  // 1. Client-specific inbound assistant
  // 2. Business hours vs after hours assistant
  // 3. Default assistant

  const vapiConfig = client?.vapi || client?.vapi_json || {};
  
  // Check for dedicated inbound assistant
  if (vapiConfig.inboundAssistantId && vapiConfig.inboundPhoneNumberId) {
    return {
      assistantId: vapiConfig.inboundAssistantId,
      phoneNumberId: vapiConfig.inboundPhoneNumberId
    };
  }

  // Check for time-based assistants
  if (callContext.isBusinessHours) {
    if (vapiConfig.businessHoursAssistantId && vapiConfig.businessHoursPhoneNumberId) {
      return {
        assistantId: vapiConfig.businessHoursAssistantId,
        phoneNumberId: vapiConfig.businessHoursPhoneNumberId
      };
    }
  } else {
    if (vapiConfig.afterHoursAssistantId && vapiConfig.afterHoursPhoneNumberId) {
      return {
        assistantId: vapiConfig.afterHoursAssistantId,
        phoneNumberId: vapiConfig.afterHoursPhoneNumberId
      };
    }
  }

  // Fallback to default assistant
  return {
    assistantId: vapiConfig.assistantId || process.env.VAPI_ASSISTANT_ID,
    phoneNumberId: vapiConfig.phoneNumberId || process.env.VAPI_PHONE_NUMBER_ID
  };
}

/**
 * Create Vapi call for inbound routing
 * @param {Object} vapiConfig - Vapi call configuration
 * @returns {Promise<Object>} - Vapi call result
 */
export async function createVapiInboundCall(vapiConfig, { mock } = {}) {
  try {
    if (mock) {
      const result = {
        id: `mock_call_${Date.now()}`,
        status: 'queued',
        mock: true
      };
      await recordReceptionistTelemetry({
        evt: 'receptionist.call_initiated',
        callId: result.id,
        status: result.status,
        tenant: vapiConfig.metadata?.clientKey || null,
        callPurpose: vapiConfig.metadata?.callPurpose || null,
        intentHints: vapiConfig.metadata?.intentHints || [],
        callerPhone: vapiConfig.customer?.number || null,
        mock: true
      });
      return { success: true, callId: result.id, status: result.status, vapiCall: result };
    }

    const VAPI_URL = process.env.VAPI_ORIGIN || 'https://api.vapi.ai';
    const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;

    if (!VAPI_PRIVATE_KEY) {
      throw new Error('VAPI_PRIVATE_KEY not configured');
    }

    if (!vapiConfig.assistantId || !vapiConfig.phoneNumberId) {
      throw new Error('Vapi assistant not configured');
    }

    console.log('[INBOUND ROUTER] Creating Vapi call:', {
      assistantId: vapiConfig.assistantId,
      customerNumber: vapiConfig.customer.number
    });

    const response = await fetch(`${VAPI_URL}/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`
      },
      body: JSON.stringify({
        assistantId: vapiConfig.assistantId,
        phoneNumberId: vapiConfig.phoneNumberId,
        customer: vapiConfig.customer,
        metadata: vapiConfig.metadata,
        assistantOverrides: vapiConfig.assistantOverrides
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      await recordReceptionistTelemetry({
        evt: 'receptionist.call_initiate_failed',
        error: errorText,
        assistantId: vapiConfig.assistantId,
        tenant: vapiConfig.metadata?.clientKey || null,
        callerPhone: vapiConfig.customer?.number || null
      });
      throw new Error(`Vapi API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    
    console.log('[INBOUND ROUTER] ✅ Vapi call created:', {
      callId: result.id,
      status: result.status
    });

    await recordReceptionistTelemetry({
      evt: 'receptionist.call_initiated',
      callId: result.id,
      status: result.status,
      tenant: vapiConfig.metadata?.clientKey || null,
      callPurpose: vapiConfig.metadata?.callPurpose || null,
      intentHints: vapiConfig.metadata?.intentHints || [],
      callerPhone: vapiConfig.customer?.number || null
    });

    return {
      success: true,
      callId: result.id,
      status: result.status,
      vapiCall: result
    };

  } catch (error) {
    console.error('[INBOUND ROUTER] ❌ Error creating Vapi call:', error);
    await recordReceptionistTelemetry({
      evt: 'receptionist.call_error',
      error: error?.message || String(error),
      tenant: vapiConfig?.metadata?.clientKey || null,
      callerPhone: vapiConfig?.customer?.number || null
    });
    throw error;
  }
}

/**
 * Log inbound call attempt
 * @param {Object} params - Call log parameters
 */
export async function logInboundCall({
  clientKey,
  callSid,
  fromPhone,
  toPhone,
  vapiCallId,
  status = 'initiated'
}) {
  try {
    const { query } = await import('../db.js');
    
    // Insert into inbound_calls table (will be created in migration)
    await query(`
      INSERT INTO inbound_calls (
        client_key,
        call_sid,
        from_phone,
        to_phone,
        vapi_call_id,
        status,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (call_sid) DO UPDATE SET
        vapi_call_id = EXCLUDED.vapi_call_id,
        status = EXCLUDED.status
    `, [clientKey, callSid, fromPhone, toPhone, vapiCallId, status]);

    console.log('[INBOUND ROUTER] ✅ Call logged:', { callSid, status });
  } catch (error) {
    // Table might not exist yet - that's okay, just log the error
    console.error('[INBOUND ROUTER] Could not log call (table may not exist):', error.message);
  }
}









