/**
 * POST /api/notify/* — tenant SMS notify (extracted from server.js).
 */
export function handleNotifyTest(req, res) {
  res.json({ ok: true, message: 'Test route works!' });
}

export async function handleNotifySend(req, res, deps) {
  const {
    getClientFromHeader,
    query,
    smsConfig,
    normalizePhoneE164,
    fetchImpl,
    vapiCallBaseUrl,
  } = deps || {};
  const fetchFn = fetchImpl || globalThis.fetch;
  const vapiBase = vapiCallBaseUrl || 'https://api.vapi.ai';

  try {
    const client = await getClientFromHeader(req);
    if (!client) return res.status(400).json({ ok: false, error: 'Unknown tenant' });

    let { channel, to, message, phoneNumber } = req.body || {};
    if (channel !== 'sms') return res.status(400).json({ ok: false, error: 'Only channel="sms" is supported' });
    if (!message) return res.status(400).json({ ok: false, error: 'Missing "message"' });

    let phone = to || phoneNumber;

    if (!phone) {
      const callId =
        req.get('X-Call-Id') ||
        req.get('X-Vapi-Call-Id') ||
        req.body?.callId ||
        req.body?.call?.id ||
        req.body?.metadata?.callId ||
        req.body?.message?.call?.id;

      if (callId) {
        try {
          const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
          if (VAPI_PRIVATE_KEY) {
            console.log('[NOTIFY] Looking up phone from VAPI call:', callId);
            const vapiResponse = await fetchFn(`${vapiBase}/call/${callId}`, {
              headers: {
                Authorization: `Bearer ${VAPI_PRIVATE_KEY}`,
                'Content-Type': 'application/json',
              },
            });
            if (vapiResponse.ok) {
              const callData = await vapiResponse.json();
              phone = callData.customer?.number || callData.customer?.phone || callData.phone;
              if (phone) {
                console.log('[NOTIFY] ✅ Got phone from VAPI call API:', phone);
              }
            }
          }
        } catch (err) {
          console.warn('[NOTIFY] Could not get phone from VAPI call:', err.message);
        }
      }

      if (!phone) {
        try {
          const recentCall = await query(
            `SELECT lead_phone FROM calls WHERE client_key = $1 AND created_at >= NOW() - INTERVAL '30 minutes' ORDER BY created_at DESC LIMIT 1`,
            [client.clientKey]
          );
          if (recentCall?.rows?.[0]?.lead_phone) {
            phone = recentCall.rows[0].lead_phone;
            console.log('[NOTIFY] ✅ Using phone from most recent call (last 30 min):', phone);
          } else {
            const anyCall = await query(
              `SELECT lead_phone FROM calls WHERE client_key = $1 ORDER BY created_at DESC LIMIT 1`,
              [client.clientKey]
            );
            if (anyCall?.rows?.[0]?.lead_phone) {
              phone = anyCall.rows[0].lead_phone;
              console.log('[NOTIFY] ✅ Using phone from most recent call (any time):', phone);
            }
          }
        } catch (err) {
          console.warn('[NOTIFY] Could not look up phone from calls:', err.message);
        }
      }
    }

    if (!phone) {
      return res.status(400).json({
        ok: false,
        error:
          'Missing phone number. Include "to" or "phoneNumber" in request body, or ensure callId is available to look up from call context.',
      });
    }

    const { smsClient, messagingServiceSid, fromNumber, configured } = smsConfig(client);
    if (!configured) return res.status(400).json({ ok: false, error: 'SMS not configured (no fromNumber or messagingServiceSid)' });

    const normalizedTo = normalizePhoneE164(phone);
    if (!normalizedTo) return res.status(400).json({ ok: false, error: `Invalid recipient phone number (must be E.164): ${phone}` });

    const payload = { to: normalizedTo, body: message };
    if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid;
    else if (fromNumber) payload.from = fromNumber;

    const resp = await smsClient.messages.create(payload);
    return res.json({ ok: true, sid: resp.sid });
  } catch (e) {
    const msg = e?.message || 'sms_error';
    const code = e?.status || e?.code || 500;
    console.error('[NOTIFY] Error:', msg);
    return res.status(code).json({ ok: false, error: msg });
  }
}
