/**
 * POST /sms — API-key gated test echo of Twilio-shaped payloads (extracted from server.js).
 */
export async function handleSmsTestEndpoint(req, res, deps) {
  const { getApiKey } = deps || {};
  const apiKeyEnv = typeof getApiKey === 'function' ? getApiKey() : process.env.API_KEY;

  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== apiKeyEnv) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const rawFrom = (req.body.From || '').toString();
    const rawTo = (req.body.To || '').toString();
    const bodyTxt = (req.body.Body || '').toString().trim().replace(/^["']|["']$/g, '');

    console.log('[SMS TEST ENDPOINT]', {
      from: rawFrom,
      to: rawTo,
      body: bodyTxt,
      messageSid: req.body.MessageSid,
      messagingServiceSid: req.body.MessagingServiceSid,
    });

    return res.json({
      ok: true,
      message: 'SMS received for testing',
      from: rawFrom,
      to: rawTo,
      body: bodyTxt,
    });
  } catch (e) {
    console.error('[SMS TEST ENDPOINT ERROR]', e?.message || e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
