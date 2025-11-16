// routes/twilio-voice-webhooks.js
// Handle inbound voice calls from Twilio and route to Vapi

import express from 'express';
import { routeInboundCall, createVapiInboundCall, logInboundCall } from '../lib/inbound-call-router.js';
import { normalizePhoneE164 } from '../lib/utils.js';
import { recordReceptionistTelemetry } from '../lib/demo-telemetry.js';
import twilio from 'twilio';

// Initialize Twilio client for voicemail processing
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

const router = express.Router();

// Twilio webhook validator
const validateTwilioRequest = (req, res, next) => {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  
  if (!authToken) {
    console.warn('[TWILIO VOICE] TWILIO_AUTH_TOKEN not set, skipping validation');
    return next();
  }

  const signature = req.get('X-Twilio-Signature');
  const url = req.protocol + '://' + req.get('host') + req.originalUrl;
  const params = req.body;

  try {
    const isValid = twilio.validateRequest(
      authToken,
      signature,
      url,
      params
    );

    if (!isValid) {
      console.warn('[TWILIO VOICE] Invalid Twilio signature');
      return res.status(403).send('Invalid signature');
    }

    next();
  } catch (error) {
    console.error('[TWILIO VOICE] Validation error:', error);
    return res.status(500).send('Validation error');
  }
};

/**
 * POST /webhooks/twilio-voice-inbound
 * Handles inbound voice call initiation from Twilio
 * 
 * This is called when someone calls your Twilio phone number.
 * We route it to Vapi AI assistant.
 */
router.post('/webhooks/twilio-voice-inbound', validateTwilioRequest, express.urlencoded({ extended: false }), async (req, res) => {
  console.log('[TWILIO VOICE INBOUND] ==================== NEW INBOUND CALL ====================');
  console.log('[TWILIO VOICE INBOUND] Received:', {
    CallSid: req.body.CallSid,
    From: req.body.From,
    To: req.body.To,
    CallStatus: req.body.CallStatus
  });

  try {
    const callSid = req.body.CallSid;
    const fromPhoneRaw = req.body.From; // Caller's number
    const toPhoneRaw = req.body.To; // Your Twilio number
    const callStatus = req.body.CallStatus; // 'ringing', 'in-progress', etc.
    const fromPhone = normalizePhoneE164(fromPhoneRaw) || fromPhoneRaw;
    const toPhone = normalizePhoneE164(toPhoneRaw) || toPhoneRaw;

    // Immediately respond to Twilio (don't wait for Vapi)
    // We'll connect the call to Vapi using TwiML or by creating Vapi call
    res.type('text/xml');

    // Route the call to determine client and configuration
    let routingResult;
    try {
      routingResult = await routeInboundCall({
        fromPhone,
        toPhone,
        callSid,
        clientKey: req.body.clientKey // Optional: if passed via webhook
      });

      if (!routingResult.success) {
        throw new Error('Failed to route call');
      }

    } catch (routingError) {
      console.error('[TWILIO VOICE INBOUND] Routing error:', routingError);
      // Fallback: play error message and hang up
      return res.send(`
        <?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say voice="alice">We're sorry, we're unable to process your call at this time. Please try again later.</Say>
          <Hangup/>
        </Response>
      `);
    }

    // Create Vapi call to handle the conversation
    try {
      const mockMode = process.env.RECEPTIONIST_TEST_MODE === 'mock_vapi';
      const vapiResult = await createVapiInboundCall(routingResult.vapiConfig, { mock: mockMode });

      // Log the call
      await logInboundCall({
        clientKey: routingResult.client.key,
        callSid,
        fromPhone,
        toPhone,
        vapiCallId: vapiResult.callId,
        status: 'routed_to_vapi'
      });
      await recordReceptionistTelemetry({
        evt: 'receptionist.twilio_inbound',
        tenant: routingResult.client.key,
        callSid,
        callId: vapiResult.callId,
        callPurpose: routingResult.callContext?.callPurpose || 'inbound_reception',
        intentHints: routingResult.callContext?.intentHints || [],
        callerPhone: fromPhone,
        toPhone,
        status: 'routed_to_vapi'
      });

      // Option 1: Return TwiML to connect call to Vapi
      // Vapi needs the call to be forwarded to their number
      // Check Vapi docs for the correct number to forward to
      const vapiPhoneNumber = process.env.VAPI_FORWARD_NUMBER;
      if (vapiPhoneNumber) {
        return res.send(`
          <?xml version="1.0" encoding="UTF-8"?>
          <Response>
            <Say voice="alice">Connecting you now.</Say>
            <Dial>
              <Number>${vapiPhoneNumber}</Number>
            </Dial>
          </Response>
        `);
      }

      // If no forward number is configured, let Vapi complete the connection itself.
      return res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

    } catch (vapiError) {
      console.error('[TWILIO VOICE INBOUND] Vapi error:', vapiError);
      
      // Fallback: take a message or offer callback
      const baseUrl = process.env.APP_URL || req.protocol + '://' + req.get('host');
      return res.send(`
        <?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say voice="alice">Thank you for calling ${routingResult.client.name}. 
            Unfortunately, we're unable to take your call right now. 
            Please leave a message after the tone, or press 1 to schedule a callback.</Say>
          <Record 
            maxLength="60" 
            action="${baseUrl}/webhooks/twilio-voice-recording"
            recordingStatusCallback="${baseUrl}/webhooks/twilio-voice-recording"
            transcribe="true"
            transcribeCallback="${baseUrl}/webhooks/twilio-voice-recording" />
          <Gather numDigits="1" action="${baseUrl}/webhooks/twilio-voice-callback">
            <Say voice="alice">Press 1 to schedule a callback.</Say>
          </Gather>
          <Hangup/>
        </Response>
      `);
    }

  } catch (error) {
    console.error('[TWILIO VOICE INBOUND] Unexpected error:', error);
    
    // Always return valid TwiML, even on error
    return res.send(`
      <?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say voice="alice">We're sorry, we're experiencing technical difficulties. Please try again later.</Say>
        <Hangup/>
      </Response>
    `);
  }
});

/**
 * POST /webhooks/twilio-voice-status
 * Handles call status updates from Twilio
 */
router.post('/webhooks/twilio-voice-status', validateTwilioRequest, express.urlencoded({ extended: false }), async (req, res) => {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus; // 'completed', 'no-answer', 'busy', 'failed', 'canceled'
  const duration = req.body.CallDuration; // seconds
  const fromPhone = req.body.From;
  const toPhone = req.body.To;

  console.log('[TWILIO VOICE STATUS]', {
    callSid,
    status: callStatus,
    duration,
    from: fromPhone,
    to: toPhone
  });

  try {
    // Update call status in database
    const { query } = await import('../db.js');
    
    await query(`
      UPDATE inbound_calls
      SET status = $1,
          duration = $2,
          completed_at = CASE WHEN $1 IN ('completed', 'no-answer', 'busy', 'failed', 'canceled') THEN NOW() ELSE completed_at END
      WHERE call_sid = $3
    `, [callStatus, duration, callSid]);

    await recordReceptionistTelemetry({
      evt: 'receptionist.twilio_status',
      callSid,
      status: callStatus,
      duration,
      fromPhone,
      toPhone
    });

    res.status(200).send('OK');
  } catch (error) {
    console.error('[TWILIO VOICE STATUS] Error:', error);
    res.status(200).send('OK'); // Always return OK to Twilio
  }
});

/**
 * POST /webhooks/twilio-voice-recording
 * Handles voicemail recordings
 */
router.post('/webhooks/twilio-voice-recording', validateTwilioRequest, express.urlencoded({ extended: false }), async (req, res) => {
  const callSid = req.body.CallSid;
  const recordingUrl = req.body.RecordingUrl;
  const recordingSid = req.body.RecordingSid;
  const recordingDuration = req.body.RecordingDuration;
  const fromPhone = req.body.From;
  const toPhone = req.body.To;

  console.log('[TWILIO VOICE RECORDING]', {
    callSid,
    recordingSid,
    recordingUrl,
    duration: recordingDuration,
    from: fromPhone,
    to: toPhone
  });

  // Always respond quickly to Twilio
  res.status(200).send('OK');

  try {
    // Step 1: Identify client from phone number
    const { routeInboundCall } = await import('../lib/inbound-call-router.js');
    let clientKey = null;
    let client = null;

    try {
      const routingResult = await routeInboundCall({
        fromPhone,
        toPhone,
        callSid,
        clientKey: req.body.clientKey
      });
      clientKey = routingResult.client.key;
      const { getFullClient } = await import('../db.js');
      client = await getFullClient(clientKey);
    } catch (error) {
      console.error('[TWILIO VOICE RECORDING] Could not identify client:', error);
      // Try to get client from call record
      const { query } = await import('../db.js');
      const callResult = await query(`
        SELECT client_key FROM inbound_calls WHERE call_sid = $1 LIMIT 1
      `, [callSid]);
      if (callResult.rows && callResult.rows.length > 0) {
        clientKey = callResult.rows[0].client_key;
        const { getFullClient } = await import('../db.js');
        client = await getFullClient(clientKey);
      }
    }

    if (!clientKey) {
      console.error('[TWILIO VOICE RECORDING] Client not found for voicemail');
      return;
    }

    // Step 2: Download and transcribe recording
    let transcription = null;
    let transcriptionText = null;

    if (recordingSid && twilioClient) {
      try {
        // Wait a moment for transcription to be ready
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Get transcription from Twilio
        // Twilio transcriptions are accessed via the recording's transcriptions subresource
        try {
          const recording = await twilioClient.recordings(recordingSid).fetch();
          
          // List transcriptions for this recording
          const transcriptions = await twilioClient.recordings(recordingSid)
            .transcriptions
            .list({ limit: 1 });

          if (transcriptions && transcriptions.length > 0) {
            const transcriptionSid = transcriptions[0].sid;
            const transcription = await twilioClient.transcriptions(transcriptionSid).fetch();
            transcriptionText = transcription.transcriptionText || null;
            console.log('[TWILIO VOICE RECORDING] Transcription received:', transcriptionText?.substring(0, 100));
          } else {
            // If no transcription exists, it may still be processing
            // Twilio automatically transcribes recordings, but it may take a few seconds
            console.log('[TWILIO VOICE RECORDING] Transcription not yet available, will be processed later');
            transcriptionText = 'Transcription processing...';
          }
        } catch (fetchError) {
          console.warn('[TWILIO VOICE RECORDING] Could not fetch transcription:', fetchError.message);
          transcriptionText = 'Transcription unavailable';
        }
      } catch (transError) {
        console.warn('[TWILIO VOICE RECORDING] Transcription error:', transError.message);
        transcriptionText = 'Transcription unavailable';
      }
    }

    // Step 3: Extract key information (basic extraction)
    const urgency = extractUrgency(transcriptionText || '');
    const callerName = extractName(transcriptionText || '');
    const callbackRequested = /call.*back|callback|call.*me/i.test(transcriptionText || '');

    // Step 4: Store message in database
    const { query } = await import('../db.js');
    const messageResult = await query(`
      INSERT INTO messages (
        client_key,
        call_id,
        caller_phone,
        caller_name,
        message_body,
        urgency,
        status,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'new', NOW())
      RETURNING id
    `, [
      clientKey,
      callSid,
      fromPhone,
      callerName || null,
      transcriptionText || 'Voicemail received (no transcription available)',
      urgency
    ]);

    const messageId = messageResult.rows[0].id;
    console.log('[TWILIO VOICE RECORDING] Message stored:', messageId);

    // Step 5: Update inbound call record with recording info
    try {
      await query(`
        UPDATE inbound_calls
        SET recording_url = $1,
            transcript = $2,
            purpose = 'message',
            outcome = 'voicemail_left'
        WHERE call_sid = $3
      `, [recordingUrl, transcriptionText, callSid]);
    } catch (error) {
      console.warn('[TWILIO VOICE RECORDING] Could not update call record:', error.message);
    }

    // Step 6: Notify client
    await notifyClientOfVoicemail({
      client,
      clientKey,
      fromPhone,
      callerName,
      transcriptionText,
      recordingUrl,
      duration: recordingDuration,
      urgency,
      messageId
    });

    console.log('[TWILIO VOICE RECORDING] ✅ Voicemail processed successfully');
    await recordReceptionistTelemetry({
      evt: 'receptionist.voicemail',
      callSid,
      tenant: clientKey,
      fromPhone,
      toPhone,
      recordingUrl,
      transcriptionAvailable: Boolean(transcriptionText),
      urgency,
      messageId
    });

  } catch (error) {
    console.error('[TWILIO VOICE RECORDING] Error processing voicemail:', error);
    await recordReceptionistTelemetry({
      evt: 'receptionist.voicemail_error',
      callSid,
      error: error?.message || String(error)
    });
  }
});

// Helper: Extract urgency from transcription
function extractUrgency(text) {
  if (!text) return 'normal';
  const lower = text.toLowerCase();
  if (/urgent|emergency|asap|immediately|right away/i.test(lower)) {
    return 'urgent';
  }
  if (/emergency|911|ambulance|hospital/i.test(lower)) {
    return 'emergency';
  }
  return 'normal';
}

// Helper: Extract name from transcription
function extractName(text) {
  if (!text) return null;
  // Simple pattern: "This is [Name]" or "My name is [Name]"
  const patterns = [
    /(?:this is|my name is|i'm|i am|it's|it is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /(?:hi|hello|hey),?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

// Helper: Notify client of voicemail
async function notifyClientOfVoicemail({ client, clientKey, fromPhone, callerName, transcriptionText, recordingUrl, duration, urgency, messageId }) {
  try {
    const messagingService = (await import('../lib/messaging-service.js')).default;
    const clientEmail = client?.owner_email || client?.email;
    const clientPhone = client?.owner_phone || client?.phone;
    const businessName = client?.display_name || client?.business_name || client?.name || 'Your Business';

    const subject = urgency === 'emergency' 
      ? `🚨 URGENT: Voicemail from ${callerName || fromPhone}`
      : urgency === 'urgent'
      ? `⚠️ Urgent Voicemail from ${callerName || fromPhone}`
      : `📞 Voicemail from ${callerName || fromPhone}`;

    const emailBody = `
New voicemail received:

Caller: ${callerName || 'Unknown'} (${fromPhone})
Duration: ${duration} seconds
Time: ${new Date().toLocaleString()}
${urgency !== 'normal' ? `\n⚠️ URGENCY: ${urgency.toUpperCase()}\n` : ''}

Message:
${transcriptionText || 'No transcription available'}

${recordingUrl ? `\nRecording: ${recordingUrl}` : ''}

View all messages: ${process.env.APP_URL || 'https://your-app.onrender.com'}/dashboard?clientKey=${clientKey}&tab=messages
    `.trim();

    // Send email notification
    if (clientEmail) {
      await messagingService.sendEmail({
        to: clientEmail,
        subject,
        body: emailBody,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: ${urgency === 'emergency' ? '#dc3545' : urgency === 'urgent' ? '#ffc107' : '#667eea'}; color: white; padding: 20px; border-radius: 10px 10px 0 0;">
              <h2 style="margin: 0;">${urgency === 'emergency' ? '🚨 URGENT' : urgency === 'urgent' ? '⚠️ Urgent' : '📞'} Voicemail Received</h2>
            </div>
            <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <p><strong>Caller:</strong> ${callerName || 'Unknown'} (${fromPhone})</p>
              <p><strong>Duration:</strong> ${duration} seconds</p>
              <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
              ${urgency !== 'normal' ? `<p style="color: ${urgency === 'emergency' ? '#dc3545' : '#ffc107'}; font-weight: bold;">⚠️ URGENCY: ${urgency.toUpperCase()}</p>` : ''}
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
                <h3>Message:</h3>
                <p style="white-space: pre-wrap;">${transcriptionText || 'No transcription available'}</p>
              </div>
              ${recordingUrl ? `<p><a href="${recordingUrl}" style="color: #667eea;">Listen to Recording</a></p>` : ''}
              <p style="margin-top: 30px;">
                <a href="${process.env.APP_URL || 'https://your-app.onrender.com'}/dashboard?clientKey=${clientKey}&tab=messages" 
                   style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  View All Messages
                </a>
              </p>
            </div>
          </div>
        `
      });
    }

    // Send SMS notification for urgent messages
    if (urgency !== 'normal' && clientPhone) {
      await messagingService.sendSMS({
        to: clientPhone,
        body: `${urgency === 'emergency' ? '🚨 URGENT' : '⚠️ Urgent'} voicemail from ${callerName || fromPhone}. ${transcriptionText ? transcriptionText.substring(0, 100) + '...' : 'Check your email for details.'}`
      });
    }

    console.log('[TWILIO VOICE RECORDING] ✅ Client notified');
  } catch (error) {
    console.error('[TWILIO VOICE RECORDING] Error notifying client:', error);
  }
}

/**
 * POST /webhooks/twilio-voice-callback
 * Handles callback requests
 */
router.post('/webhooks/twilio-voice-callback', validateTwilioRequest, express.urlencoded({ extended: false }), async (req, res) => {
  const callSid = req.body.CallSid;
  const digits = req.body.Digits;
  const fromPhone = req.body.From;
  const toPhone = req.body.To;

  console.log('[TWILIO VOICE CALLBACK]', {
    callSid,
    digits,
    from: fromPhone,
    to: toPhone
  });

  // Always respond quickly to Twilio
  res.type('text/xml');

  if (digits === '1') {
    // Process callback request asynchronously
    processCallbackRequest({ callSid, fromPhone, toPhone }).catch(error => {
      console.error('[TWILIO VOICE CALLBACK] Error processing callback:', error);
    });

    return res.send(`
      <?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say voice="alice">Thank you! We've received your callback request and will call you back as soon as possible, typically within the next business hour. Have a great day!</Say>
        <Hangup/>
      </Response>
    `);
  }

  // If no digits or wrong digits, just hang up
  return res.send(`
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Hangup/>
    </Response>
  `);
});

// Process callback request
async function processCallbackRequest({ callSid, fromPhone, toPhone }) {
  try {
    // Step 1: Identify client
    const { routeInboundCall } = await import('../lib/inbound-call-router.js');
    let clientKey = null;
    let client = null;

    try {
      const routingResult = await routeInboundCall({
        fromPhone,
        toPhone,
        callSid
      });
      clientKey = routingResult.client.key;
      const { getFullClient } = await import('../db.js');
      client = await getFullClient(clientKey);
    } catch (error) {
      console.error('[TWILIO VOICE CALLBACK] Could not identify client:', error);
      // Try to get client from call record
      const { query } = await import('../db.js');
      const callResult = await query(`
        SELECT client_key FROM inbound_calls WHERE call_sid = $1 LIMIT 1
      `, [callSid]);
      if (callResult.rows && callResult.rows.length > 0) {
        clientKey = callResult.rows[0].client_key;
        const { getFullClient } = await import('../db.js');
        client = await getFullClient(clientKey);
      }
    }

    if (!clientKey) {
      console.error('[TWILIO VOICE CALLBACK] Client not found for callback request');
      return;
    }

    // Step 2: Calculate preferred callback time (next business hour or ASAP)
    const preferredCallbackTime = calculatePreferredCallbackTime(client);

    // Step 3: Store callback request in messages table
    const { query } = await import('../db.js');
    const messageResult = await query(`
      INSERT INTO messages (
        client_key,
        call_id,
        caller_phone,
        reason,
        preferred_callback_time,
        urgency,
        status,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, 'normal', 'new', NOW())
      RETURNING id
    `, [
      clientKey,
      callSid,
      fromPhone,
      'Callback requested',
      preferredCallbackTime
    ]);

    const messageId = messageResult.rows[0].id;
    console.log('[TWILIO VOICE CALLBACK] Callback request stored:', messageId);

    // Step 4: Add to callback queue (using retry_queue table for now, or create dedicated callback queue)
    // For now, we'll use the messages table and a scheduled job can process them
    // Alternatively, we could add to retry_queue with a specific type
    try {
      const { addToRetryQueue } = await import('../db.js');
      await addToRetryQueue({
        clientKey,
        leadPhone: fromPhone,
        retryType: 'callback',
        retryReason: 'Customer requested callback',
        retryData: {
          callSid,
          messageId,
          preferredCallbackTime: preferredCallbackTime.toISOString()
        },
        scheduledFor: preferredCallbackTime,
        retryAttempt: 1,
        maxRetries: 1
      });
      console.log('[TWILIO VOICE CALLBACK] Added to callback queue');
    } catch (error) {
      console.warn('[TWILIO VOICE CALLBACK] Could not add to callback queue:', error.message);
      // Continue anyway - message is stored
    }

    // Step 5: Update inbound call record
    try {
      await query(`
        UPDATE inbound_calls
        SET purpose = 'callback',
            outcome = 'callback_requested'
        WHERE call_sid = $1
      `, [callSid]);
    } catch (error) {
      console.warn('[TWILIO VOICE CALLBACK] Could not update call record:', error.message);
    }

    // Step 6: Notify client
    await notifyClientOfCallbackRequest({
      client,
      clientKey,
      fromPhone,
      preferredCallbackTime,
      messageId
    });

    // Step 7: Send confirmation SMS to caller (optional)
    await sendCallbackConfirmationSMS({
      to: fromPhone,
      businessName: client?.display_name || client?.business_name || client?.name || 'us',
      preferredTime: preferredCallbackTime
    });

    console.log('[TWILIO VOICE CALLBACK] ✅ Callback request processed successfully');

  } catch (error) {
    console.error('[TWILIO VOICE CALLBACK] Error processing callback:', error);
  }
}

// Helper: Calculate preferred callback time
function calculatePreferredCallbackTime(client) {
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

  // If within business hours, callback in 30 minutes
  const isWeekday = businessHours.days.includes(day);
  const isBusinessHour = hour >= businessHours.start && hour < businessHours.end;

  if (isWeekday && isBusinessHour) {
    // Callback in 30 minutes
    return new Date(now.getTime() + 30 * 60 * 1000);
  }

  // Otherwise, callback at next business hour start
  let callbackTime = new Date(clientTime);
  callbackTime.setMinutes(0);
  callbackTime.setSeconds(0);
  callbackTime.setMilliseconds(0);

  // If it's after business hours today, move to next day
  if (!isWeekday || hour >= businessHours.end) {
    callbackTime.setDate(callbackTime.getDate() + 1);
    // Find next business day
    while (!businessHours.days.includes(callbackTime.getDay())) {
      callbackTime.setDate(callbackTime.getDate() + 1);
    }
  }

  // Set to business hours start
  callbackTime.setHours(businessHours.start);

  // Convert back to server timezone
  const serverTime = new Date(callbackTime.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offset = now.getTime() - clientTime.getTime();
  return new Date(serverTime.getTime() + offset);
}

// Helper: Notify client of callback request
async function notifyClientOfCallbackRequest({ client, clientKey, fromPhone, preferredCallbackTime, messageId }) {
  try {
    const messagingService = (await import('../lib/messaging-service.js')).default;
    const clientEmail = client?.owner_email || client?.email;
    const clientPhone = client?.owner_phone || client?.phone;
    const businessName = client?.display_name || client?.business_name || client?.name || 'Your Business';

    const preferredTimeStr = preferredCallbackTime.toLocaleString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    const subject = `📞 Callback Request from ${fromPhone}`;

    const emailBody = `
New callback request received:

Caller: ${fromPhone}
Preferred callback time: ${preferredTimeStr}
Time requested: ${new Date().toLocaleString()}

Please call back at your earliest convenience.

View all messages: ${process.env.APP_URL || 'https://your-app.onrender.com'}/dashboard?clientKey=${clientKey}&tab=messages
    `.trim();

    // Send email notification
    if (clientEmail) {
      await messagingService.sendEmail({
        to: clientEmail,
        subject,
        body: emailBody,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #667eea; color: white; padding: 20px; border-radius: 10px 10px 0 0;">
              <h2 style="margin: 0;">📞 Callback Request</h2>
            </div>
            <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <p><strong>Caller:</strong> ${fromPhone}</p>
              <p><strong>Preferred callback time:</strong> ${preferredTimeStr}</p>
              <p><strong>Time requested:</strong> ${new Date().toLocaleString()}</p>
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
                <p style="margin: 0;">Please call back at your earliest convenience.</p>
              </div>
              <p style="margin-top: 30px;">
                <a href="${process.env.APP_URL || 'https://your-app.onrender.com'}/dashboard?clientKey=${clientKey}&tab=messages" 
                   style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  View All Messages
                </a>
              </p>
            </div>
          </div>
        `
      });
    }

    // Send SMS notification
    if (clientPhone) {
      await messagingService.sendSMS({
        to: clientPhone,
        body: `📞 Callback requested from ${fromPhone}. Preferred time: ${preferredTimeStr.substring(0, 30)}...`
      });
    }

    console.log('[TWILIO VOICE CALLBACK] ✅ Client notified');
  } catch (error) {
    console.error('[TWILIO VOICE CALLBACK] Error notifying client:', error);
  }
}

// Helper: Send confirmation SMS to caller
async function sendCallbackConfirmationSMS({ to, businessName, preferredTime }) {
  try {
    const messagingService = (await import('../lib/messaging-service.js')).default;
    const preferredTimeStr = preferredTime.toLocaleString('en-GB', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    await messagingService.sendSMS({
      to,
      body: `Thank you for your callback request! ${businessName} will call you back as soon as possible, typically by ${preferredTimeStr}.`
    });

    console.log('[TWILIO VOICE CALLBACK] ✅ Caller confirmation sent');
  } catch (error) {
    console.warn('[TWILIO VOICE CALLBACK] Could not send caller confirmation:', error.message);
    // Non-critical, continue
  }
}

export default router;




