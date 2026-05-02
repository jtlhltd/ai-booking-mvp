import { Router } from 'express';

export function createAdminVapiPlumbingRouter(deps) {
  const { getApiKey, TIMEZONE, isBusinessHoursForTenant } = deps || {};

  const router = Router();

  function requireAdminKey(req, res) {
    const apiKey = req.get('X-API-Key');
    const expected = typeof getApiKey === 'function' ? getApiKey() : process.env.API_KEY;
    if (!apiKey || apiKey !== expected) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
    return true;
  }

  // VAPI Test Endpoint
  router.get('/admin/vapi/test-connection', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;

      console.log('[VAPI CONNECTION TEST] Testing VAPI API connection');

      // Test VAPI connection by fetching assistants
      const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;
      if (!vapiKey) {
        return res.status(500).json({
          success: false,
          message: 'VAPI connection test failed',
          error: 'VAPI API key not configured',
          apiKeyConfigured: false,
        });
      }

      const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${vapiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (vapiResponse.ok) {
        const assistants = await vapiResponse.json();
        res.json({
          success: true,
          message: 'VAPI connection successful',
          assistantsCount: assistants.length,
          apiKeyConfigured: !!vapiKey,
        });
      } else {
        const errorData = await vapiResponse.json();
        res.status(400).json({
          success: false,
          message: 'VAPI connection failed',
          error: errorData,
        });
      }
    } catch (error) {
      console.error('[VAPI CONNECTION TEST ERROR]', error);
      res.status(500).json({
        success: false,
        message: 'VAPI connection test failed',
        error: error.message,
        apiKeyConfigured: !!process.env.VAPI_API_KEY,
      });
    }
  });

  // Test Call Endpoint
  router.post('/admin/vapi/test-call', async (req, res) => {
    const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;

    try {
      if (!requireAdminKey(req, res)) return;

      const tzTenant = { booking: { timezone: TIMEZONE } };
      if (!isBusinessHoursForTenant(tzTenant, new Date(), TIMEZONE, { forOutboundDial: true })) {
        return res.status(403).json({
          error: 'outside_business_hours',
          message: 'Test calls are only allowed during configured business hours (use tenant timezone).',
        });
      }

      const { phoneNumber, assistantId } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
      }

      console.log(`[TEST CALL] Initiating test call to ${phoneNumber}`);

      // Create a simple test assistant if no assistantId provided
      let testAssistantId = assistantId;

      if (!testAssistantId) {
        const testAssistant = {
          name: 'Test Cold Call Assistant',
          model: {
            provider: 'openai',
            model: 'gpt-4o-mini',
            temperature: 0.3,
            maxTokens: 150,
          },
          voice: {
            provider: '11labs',
            voiceId: '21m00Tcm4TlvDq8ikWAM',
            stability: 0.7,
            clarity: 0.85,
            style: 0.2,
          },
          firstMessage:
            "Hi, this is Sarah from AI Booking Solutions. I'm calling to help businesses like yours improve their appointment booking systems with our premium £500/month service. Do you have 2 minutes to hear how we can help you never miss another patient?",
          systemMessage:
            "You are Sarah, calling about our premium £500/month AI booking service. Keep the call under 2 minutes. Focus on booking a demo. If they're not interested, politely end the call.",
          maxDurationSeconds: 120,
          endCallMessage: "Thank you for your time. I'll send you some information about our premium service. Have a great day!",
          endCallPhrases: ['not interested', 'not right now', 'call back later'],
          recordingEnabled: true,
          voicemailDetectionEnabled: true,
        };

        const assistantResponse = await fetch('https://api.vapi.ai/assistant', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${vapiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(testAssistant),
        });

        if (assistantResponse.ok) {
          const assistantData = await assistantResponse.json();
          testAssistantId = assistantData.id;
          console.log(`[TEST ASSISTANT CREATED] ID: ${testAssistantId}`);
        } else {
          const errorData = await assistantResponse.json();
          return res.status(400).json({
            success: false,
            message: 'Failed to create test assistant',
            error: errorData,
          });
        }
      }

      // Make the test call (guarded by active-call concurrency limiter)
      const { acquireVapiSlot, releaseVapiSlot, markVapiCallActive } = await import('../lib/instant-calling.js');
      let slotLeaseId = null;
      const _acq = await acquireVapiSlot();
      slotLeaseId = _acq?.leaseId ?? null;
      let callResponse;
      try {
        callResponse = await fetch('https://api.vapi.ai/call', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${vapiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            assistantId: testAssistantId,
            customer: {
              number: phoneNumber,
              name: 'Test Contact',
            },
            metadata: {
              testCall: true,
              timestamp: new Date().toISOString(),
            },
          }),
        });
      } catch (e) {
        await releaseVapiSlot({ leaseId: slotLeaseId, reason: 'start_failed' });
        throw e;
      }

      if (callResponse.ok) {
        const callData = await callResponse.json();
        if (callData?.id) await markVapiCallActive(callData.id, { ttlMs: 30 * 60 * 1000, leaseId: slotLeaseId });
        else await releaseVapiSlot({ leaseId: slotLeaseId, reason: 'no_call_id' });
        res.json({
          success: true,
          message: 'Test call initiated successfully',
          callId: callData.id,
          assistantId: testAssistantId,
          phoneNumber: phoneNumber,
          status: 'call_initiated',
        });
      } else {
        const errorData = await callResponse.json();
        await releaseVapiSlot({ leaseId: slotLeaseId, reason: `start_failed_${callResponse.status}` });
        res.status(400).json({
          success: false,
          message: 'Failed to initiate test call',
          error: errorData,
        });
      }
    } catch (error) {
      console.error('[TEST CALL ERROR]', error);
      res.status(500).json({
        success: false,
        message: 'Test call failed',
        error: error.message,
      });
    }
  });

  // Create VAPI Assistant
  router.post('/admin/vapi/assistants', async (req, res) => {
    const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;

    try {
      if (!requireAdminKey(req, res)) return;

      const {
        name,
        model,
        voice,
        firstMessage,
        systemMessage,
        maxDurationSeconds,
        endCallMessage,
        endCallPhrases,
        recordingEnabled,
        voicemailDetectionEnabled,
        backgroundSound,
      } = req.body;

      if (!name || !model || !voice || !firstMessage || !systemMessage) {
        return res.status(400).json({ error: 'Name, model, voice, firstMessage, and systemMessage are required' });
      }

      console.log('[VAPI ASSISTANT CREATION REQUESTED]', {
        name,
        requestedBy: req.ip,
      });

      // Create assistant via VAPI API
      const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vapiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          model,
          voice,
          firstMessage,
          systemMessage,
          maxDurationSeconds: maxDurationSeconds || 120,
          endCallMessage: endCallMessage || 'Thank you for your time. Have a great day!',
          endCallPhrases: endCallPhrases || ['goodbye', 'bye', 'thank you'],
          recordingEnabled: recordingEnabled !== false,
          voicemailDetectionEnabled: voicemailDetectionEnabled !== false,
          backgroundSound: backgroundSound || 'office',
        }),
      });

      if (!vapiResponse.ok) {
        const errorText = await vapiResponse.text();
        throw new Error(`VAPI API error: ${vapiResponse.status} ${errorText}`);
      }

      const assistant = await vapiResponse.json();

      console.log('[VAPI ASSISTANT CREATED]', {
        assistantId: assistant.id,
        name: assistant.name,
        requestedBy: req.ip,
      });

      res.json({
        ok: true,
        assistant,
        message: 'VAPI assistant created successfully',
      });
    } catch (e) {
      console.error('[VAPI ASSISTANT CREATION ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // Create VAPI Phone Number
  router.post('/admin/vapi/phone-numbers', async (req, res) => {
    const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;

    try {
      if (!requireAdminKey(req, res)) return;

      const { assistantId, number } = req.body;

      if (!assistantId) {
        return res.status(400).json({ error: 'Assistant ID is required' });
      }

      console.log('[VAPI PHONE NUMBER CREATION REQUESTED]', {
        assistantId,
        number,
        requestedBy: req.ip,
      });

      // Create phone number via VAPI API
      const vapiResponse = await fetch('https://api.vapi.ai/phone-number', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vapiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assistantId,
          number: number || null, // Let VAPI assign a number if none provided
        }),
      });

      if (!vapiResponse.ok) {
        const errorText = await vapiResponse.text();
        throw new Error(`VAPI API error: ${vapiResponse.status} ${errorText}`);
      }

      const phoneNumber = await vapiResponse.json();

      console.log('[VAPI PHONE NUMBER CREATED]', {
        phoneNumberId: phoneNumber.id,
        number: phoneNumber.number,
        assistantId,
        requestedBy: req.ip,
      });

      res.json({
        ok: true,
        phoneNumber,
        message: 'VAPI phone number created successfully',
      });
    } catch (e) {
      console.error('[VAPI PHONE NUMBER CREATION ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // Make VAPI Call
  router.post('/admin/vapi/calls', async (req, res) => {
    const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;

    try {
      if (!requireAdminKey(req, res)) return;

      const { assistantId, phoneNumberId, customerNumber, customerName } = req.body;

      if (!assistantId || !customerNumber) {
        return res.status(400).json({ error: 'Assistant ID and customer number are required' });
      }

      console.log('[VAPI CALL REQUESTED]', {
        assistantId,
        phoneNumberId,
        customerNumber,
        customerName,
        requestedBy: req.ip,
      });

      // Make call via VAPI API (guarded by active-call concurrency limiter)
      const { acquireVapiSlot, releaseVapiSlot, markVapiCallActive } = await import('../lib/instant-calling.js');
      let slotLeaseId = null;
      const _acq2 = await acquireVapiSlot();
      slotLeaseId = _acq2?.leaseId ?? null;
      let vapiResponse;
      try {
        vapiResponse = await fetch('https://api.vapi.ai/call', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${vapiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            assistantId,
            phoneNumberId,
            customer: {
              number: customerNumber,
              name: customerName || 'Customer',
            },
          }),
        });
      } catch (e) {
        await releaseVapiSlot({ leaseId: slotLeaseId, reason: 'start_failed' });
        throw e;
      }

      if (!vapiResponse.ok) {
        const errorText = await vapiResponse.text();
        await releaseVapiSlot({ leaseId: slotLeaseId, reason: `start_failed_${vapiResponse.status}` });
        throw new Error(`VAPI API error: ${vapiResponse.status} ${errorText}`);
      }

      const call = await vapiResponse.json();
      if (call?.id) await markVapiCallActive(call.id, { ttlMs: 30 * 60 * 1000, leaseId: slotLeaseId });
      else await releaseVapiSlot({ leaseId: slotLeaseId, reason: 'no_call_id' });

      console.log('[VAPI CALL INITIATED]', {
        callId: call.id,
        assistantId,
        customerNumber,
        requestedBy: req.ip,
      });

      res.json({
        ok: true,
        call,
        message: 'VAPI call initiated successfully',
      });
    } catch (e) {
      console.error('[VAPI CALL ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  return router;
}

