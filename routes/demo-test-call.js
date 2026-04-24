/**
 * Core API: demo client test call trigger.
 *
 * POST /api/demo/test-call
 */
import { Router } from 'express';

/**
 * @param {{
 *   getFullClient: (clientKey: string) => Promise<any>,
 *   isDemoClient: (client: any) => boolean,
 *   fetchImpl?: typeof fetch
 * }} deps
 */
export function createDemoTestCallRouter(deps) {
  const { getFullClient, isDemoClient, fetchImpl } = deps || {};
  const router = Router();
  const fetchFn = fetchImpl || globalThis.fetch;

  router.post('/demo/test-call', async (req, res) => {
    try {
      const { clientKey, assistantId } = req.body || {};

      if (!clientKey) {
        return res.status(400).json({ success: false, error: 'Client key required' });
      }

      const client = await getFullClient(clientKey);
      if (!client) {
        return res.status(404).json({ success: false, error: 'Client not found' });
      }

      const isDemo = isDemoClient(client);
      const hasAssistantId = client.vapi?.assistantId || client.assistantId;

      if (!isDemo && !hasAssistantId) {
        return res.status(403).json({ success: false, error: 'Test calls only available for demo clients' });
      }

      const finalAssistantId = assistantId || client.vapi?.assistantId || client.assistantId;
      if (!finalAssistantId) {
        return res.status(400).json({ success: false, error: 'Assistant ID not found for this client' });
      }

      const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
      const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID || '934ecfdb-fe7b-4d53-81c0-7908b97036b5';
      const TEST_PHONE = process.env.TEST_PHONE_NUMBER || '+447491683261';
      const VAPI_API_URL = 'https://api.vapi.ai';

      if (!VAPI_PRIVATE_KEY) {
        return res.status(500).json({ success: false, error: 'VAPI_PRIVATE_KEY not configured' });
      }

      const payload = {
        assistantId: finalAssistantId,
        phoneNumberId: VAPI_PHONE_NUMBER_ID,
        customer: { number: TEST_PHONE },
        metadata: {
          tenantKey: clientKey,
          clientKey,
          leadPhone: TEST_PHONE
        }
      };

      const response = await fetchFn(`${VAPI_API_URL}/call`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${VAPI_PRIVATE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        return res.status(500).json({
          success: false,
          error: `VAPI API error: ${response.status}`,
          details: String(errorText).substring(0, 200)
        });
      }

      const data = await response.json().catch(() => ({}));
      return res.json({ success: true, data });
    } catch (error) {
      console.error('[DEMO TEST CALL ERROR]', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

