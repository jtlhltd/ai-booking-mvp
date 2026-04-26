/**
 * GET /mock-call — dev helper to hit Vapi with canned lead (extracted from server.js).
 */
export async function handleMockCallRoute(req, res, deps) {
  const { nanoid, fetchImpl } = deps || {};
  const fetchFn = fetchImpl || globalThis.fetch;
  const nano = nanoid || ((s) => String(s || 'id'));

  try {
    const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;

    if (!vapiKey) {
      return res.json({
        success: false,
        message: 'VAPI API key not found',
        availableKeys: {
          VAPI_PRIVATE_KEY: !!process.env.VAPI_PRIVATE_KEY,
          VAPI_PUBLIC_KEY: !!process.env.VAPI_PUBLIC_KEY,
          VAPI_API_KEY: !!process.env.VAPI_API_KEY
        }
      });
    }

    const assistantId = String(req.query.assistantId || '').trim();
    const phoneNumberId = String(req.query.phoneNumberId || '').trim();
    const phoneNumber = String(req.query.phone || '').trim();
    if (!assistantId || !phoneNumberId || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message:
          'Missing required query parameters: assistantId, phoneNumberId, phone (E.164). No defaults are applied for safety.'
      });
    }

    const mockLead = {
      businessName: 'Test Business',
      decisionMaker: 'Test Lead',
      industry: 'general',
      location: 'UK',
      phoneNumber,
      email: 'test@example.com',
      website: 'www.example.com'
    };

    const correlationId = req.correlationId || req.id || `req_${nano(12)}`;

    const callData = {
      assistantId,
      phoneNumberId,
      customer: {
        number: mockLead.phoneNumber,
        name: mockLead.decisionMaker
      },
      metadata: {
        correlationId,
        requestId: correlationId
      }
    };

    const vapiResponse = await fetchFn('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vapiKey}`,
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId,
        'X-Request-ID': correlationId
      },
      body: JSON.stringify(callData)
    });

    const responseText = await vapiResponse.text();

    if (responseText.trim().startsWith('<!DOCTYPE') || responseText.includes('Cloudflare')) {
      return res.json({
        success: false,
        message: 'Vapi API is currently experiencing issues (Cloudflare error)',
        error: 'Vapi API returned HTML error page instead of JSON',
        status: vapiResponse.status,
        suggestion:
          'Please try again in a few minutes. The Vapi service appears to be temporarily unavailable due to Cloudflare issues.',
        responsePreview: responseText.substring(0, 200)
      });
    }

    if (vapiResponse.ok) {
      try {
        const callResult = JSON.parse(responseText);
        res.json({
          success: true,
          message: 'Mock call initiated successfully!',
          callId: callResult.id,
          mockLead,
          status: 'Calling your mobile now...'
        });
      } catch {
        res.json({
          success: false,
          message: 'Vapi returned invalid JSON response',
          error: 'Response was not valid JSON',
          responsePreview: responseText.substring(0, 200)
        });
      }
    } else {
      try {
        const errorData = JSON.parse(responseText);
        res.json({
          success: false,
          message: 'Failed to initiate mock call',
          error: errorData,
          status: vapiResponse.status
        });
      } catch {
        res.json({
          success: false,
          message: 'Failed to initiate mock call',
          error: 'Invalid JSON response from Vapi',
          status: vapiResponse.status,
          responsePreview: responseText.substring(0, 300)
        });
      }
    }
  } catch (error) {
    res.json({
      success: false,
      message: 'Mock call failed',
      error: error.message
    });
  }
}
