/**
 * POST /webhooks/new-lead/:clientKey — outbound Vapi launch (extracted from server.js).
 */
export async function handleWebhooksNewLead(req, res, deps) {
  const {
    getFullClient,
    normalizePhoneE164,
    resolveVapiKey,
    resolveVapiAssistantId,
    resolveVapiPhoneNumberId,
    TIMEZONE,
    recordReceptionistTelemetry,
    VAPI_URL,
    fetchImpl,
  } = deps || {};

  const fetchFn = fetchImpl || globalThis.fetch;

  try {
    const { clientKey } = req.params;
    const client = await getFullClient(clientKey);
    if (!client) return res.status(404).json({ error: `Unknown clientKey ${clientKey}` });

    const { phone, service, durationMin } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'Missing phone' });
    const e164 = normalizePhoneE164(phone);
    if (!e164) return res.status(400).json({ error: 'phone must be E.164 (+447...)' });
    const vapiKey =
      typeof resolveVapiKey === 'function'
        ? resolveVapiKey()
        : process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY || '';
    if (!vapiKey) {
      return res.status(500).json({ error: 'Missing VAPI_PRIVATE_KEY' });
    }

    const assistantId =
      typeof resolveVapiAssistantId === 'function'
        ? resolveVapiAssistantId(client)
        : client?.vapiAssistantId || process.env.VAPI_ASSISTANT_ID || '';
    const phoneNumberId =
      typeof resolveVapiPhoneNumberId === 'function'
        ? resolveVapiPhoneNumberId(client)
        : client?.vapiPhoneNumberId || process.env.VAPI_PHONE_NUMBER_ID || '';

    const callPurposeRaw = (req.body?.callPurpose || '').toString().trim();
    const callPurpose = callPurposeRaw ? callPurposeRaw : 'lead_followup';
    const leadName = req.body?.name || req.body?.lead?.name || req.body?.callerName || '';
    const leadSource = req.body?.source || req.body?.leadSource || '';
    const previousStatus = req.body?.previousStatus || '';
    const leadPain = req.body?.pain || '';
    const intentHintParts = [
      req.body?.intent,
      req.body?.intentHint,
      req.body?.notes,
      service ? `service:${service}` : null,
      previousStatus ? `status:${previousStatus}` : null,
    ].filter(Boolean);
    const callIntentHint = intentHintParts.join(', ') || 'follow_up_booking';

    if (!assistantId || !phoneNumberId) {
      return res.status(500).json({ error: 'Vapi assistant is not configured for this tenant' });
    }

    const payload = {
      assistantId,
      phoneNumberId,
      customer: { number: e164, numberE164CheckEnabled: true },
      maxDurationSeconds: (() => {
        const configured = Number(client?.vapiMaxDurationSeconds);
        if (Number.isFinite(configured) && configured >= 10) return configured;

        const toolDuration = Number(req.body?.maxDurationSeconds);
        if (Number.isFinite(toolDuration) && toolDuration >= 10) return toolDuration;

        return 12;
      })(),
      metadata: {
        clientKey,
        callPurpose,
        callIntentHint,
        leadPhone: e164,
        leadName: leadName || '',
        leadSource: leadSource || '',
        requestedService: service || '',
        previousStatus: previousStatus || '',
      },
      assistantOverrides: {
        variableValues: {
          ClientKey: clientKey,
          BusinessName: client.displayName || client.clientKey,
          ConsentLine: 'This call may be recorded for quality.',
          DefaultService: service || '',
          DefaultDurationMin: durationMin || client?.booking?.defaultDurationMin || 30,
          Timezone: client?.booking?.timezone || TIMEZONE,
          ServicesJSON: client?.servicesJson || '[]',
          PricesJSON: client?.pricesJson || '{}',
          HoursJSON: client?.hoursJson || '{}',
          ClosedDatesJSON: client?.closedDatesJson || '[]',
          Locale: client?.locale || 'en-GB',
          ScriptHints: client?.scriptHints || '',
          FAQJSON: client?.faqJson || '[]',
          Currency: client?.currency || 'GBP',
          CallPurpose: callPurpose,
          CallIntentHint: callIntentHint,
          LeadName: leadName || 'Prospect',
          LeadPhone: e164,
          LeadService: service || '',
          LeadSource: leadSource || '',
          PreviousStatus: previousStatus || '',
          LeadPain: leadPain || '',
        },
      },
    };

    const vapiUrl =
      typeof VAPI_URL !== 'undefined' && VAPI_URL ? VAPI_URL : 'https://api.vapi.ai';

    await recordReceptionistTelemetry({
      evt: 'receptionist.outbound_launch',
      tenant: clientKey,
      callPurpose,
      callIntentHint,
      leadPhone: e164,
      leadName,
      leadSource,
      requestedService: service || '',
      payloadSent: true,
    });

    if (process.env.RECEPTIONIST_TEST_MODE === 'mock_vapi') {
      const data = { ok: true, id: `mock_call_${Date.now()}`, status: 'queued', mock: true };
      await recordReceptionistTelemetry({
        evt: 'receptionist.outbound_response',
        tenant: clientKey,
        callPurpose,
        status: 200,
        ok: true,
        leadPhone: e164,
        response: data,
        mock: true,
      });
      return res.json(data);
    }

    const resp = await fetchFn(`${vapiUrl}/call`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${vapiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    let data;
    try {
      data = await resp.json();
    } catch {
      data = { raw: await resp.text().catch(() => '') };
    }

    await recordReceptionistTelemetry({
      evt: 'receptionist.outbound_response',
      tenant: clientKey,
      callPurpose,
      status: resp.status,
      ok: resp.ok,
      leadPhone: e164,
      response: data,
    });

    return res.status(resp.ok ? 200 : 502).json(data);
  } catch (err) {
    console.error('new-lead vapi error', err);
    await recordReceptionistTelemetry({
      evt: 'receptionist.outbound_error',
      error: err?.message || String(err),
      tenant: req.params?.clientKey || null,
    });
    return res.status(500).json({ error: String(err) });
  }
}
