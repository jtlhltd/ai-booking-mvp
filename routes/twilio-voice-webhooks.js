// routes/twilio-voice-webhooks.js
// Handle inbound voice calls from Twilio and route to Vapi

import express from 'express';
import { routeInboundCall, createVapiInboundCall, logInboundCall } from '../lib/inbound-call-router.js';
import twilio from 'twilio';

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
    const fromPhone = req.body.From; // Caller's number
    const toPhone = req.body.To; // Your Twilio number
    const callStatus = req.body.CallStatus; // 'ringing', 'in-progress', etc.

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
      const vapiResult = await createVapiInboundCall(routingResult.vapiConfig);

      // Log the call
      await logInboundCall({
        clientKey: routingResult.client.key,
        callSid,
        fromPhone,
        toPhone,
        vapiCallId: vapiResult.callId,
        status: 'routed_to_vapi'
      });

      // Option 1: Return TwiML to connect call to Vapi
      // Vapi needs the call to be forwarded to their number
      // Check Vapi docs for the correct number to forward to
      const vapiPhoneNumber = process.env.VAPI_FORWARD_NUMBER || '+1234567890'; // Set in env

      return res.send(`
        <?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say voice="alice">Connecting you now.</Say>
          <Dial>
            <Number>${vapiPhoneNumber}</Number>
          </Dial>
        </Response>
      `);

      // Option 2: If Vapi supports webhook-based connection, return empty TwiML
      // and let Vapi handle the call connection
      // return res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

    } catch (vapiError) {
      console.error('[TWILIO VOICE INBOUND] Vapi error:', vapiError);
      
      // Fallback: take a message or offer callback
      return res.send(`
        <?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say voice="alice">Thank you for calling ${routingResult.client.name}. 
            Unfortunately, we're unable to take your call right now. 
            Please leave a message after the tone, or press 1 to schedule a callback.</Say>
          <Record maxLength="60" action="/webhooks/twilio-voice-recording" />
          <Gather numDigits="1" action="/webhooks/twilio-voice-callback">
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
router.post('/webhooks/twilio-voice-recording', express.urlencoded({ extended: false }), async (req, res) => {
  const callSid = req.body.CallSid;
  const recordingUrl = req.body.RecordingUrl;
  const recordingDuration = req.body.RecordingDuration;
  const fromPhone = req.body.From;

  console.log('[TWILIO VOICE RECORDING]', {
    callSid,
    recordingUrl,
    duration: recordingDuration,
    from: fromPhone
  });

  // TODO: Implement voicemail processing
  // - Download recording
  // - Transcribe (using Twilio or external service)
  // - Extract key information
  // - Store message
  // - Notify client

  res.status(200).send('OK');
});

/**
 * POST /webhooks/twilio-voice-callback
 * Handles callback requests
 */
router.post('/webhooks/twilio-voice-callback', express.urlencoded({ extended: false }), async (req, res) => {
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

  if (digits === '1') {
    // TODO: Schedule callback
    // - Add to callback queue
    // - Notify client
    // - Confirm with caller

    res.type('text/xml');
    return res.send(`
      <?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say voice="alice">We'll call you back as soon as possible. Thank you!</Say>
        <Hangup/>
      </Response>
    `);
  }

  res.status(200).send('OK');
});

export default router;

