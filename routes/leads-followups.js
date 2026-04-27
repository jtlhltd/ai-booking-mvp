/**
 * Leads follow-up utilities (recall, nudge, fetch by id).
 * Mounted at /api/leads.
 */
import { Router } from 'express';

/**
 * @param {{
 *  getClientFromHeader: (req: any) => Promise<any>,
 *  readJson: (path: string, fallback: any) => Promise<any>,
 *  writeJson: (path: string, data: any) => Promise<void>,
 *  LEADS_PATH: string,
 *  getFullClient: (clientKey: string) => Promise<any>,
 *  isBusinessHours: (client: any) => boolean,
 *  TIMEZONE: string,
 *  VAPI_ASSISTANT_ID?: string,
 *  VAPI_PHONE_NUMBER_ID?: string,
 *  VAPI_PRIVATE_KEY?: string,
 *  smsConfig: (client: any) => { messagingServiceSid?: string, fromNumber?: string, smsClient: any, configured: boolean }
 * }} deps
 */
export function createLeadsFollowupsRouter(deps) {
  const {
    getClientFromHeader,
    readJson,
    writeJson,
    LEADS_PATH,
    getFullClient,
    isBusinessHours,
    TIMEZONE,
    VAPI_ASSISTANT_ID,
    VAPI_PHONE_NUMBER_ID,
    VAPI_PRIVATE_KEY,
    smsConfig
  } = deps || {};

  const router = Router();

  // Recall endpoint for n8n follow-ups: re-attempt an outbound call via Vapi
  router.post('/recall', async (req, res) => {
    try {
      const body = req.body || {};
      const clientKey = String(body.clientKey || body.tenantKey || '').trim();
      const lead = body.lead || {};
      const phone = (lead.phone || '').toString().trim();
      if (!clientKey) return res.status(400).json({ ok: false, error: 'missing clientKey' });
      if (!phone) return res.status(400).json({ ok: false, error: 'missing lead.phone' });

      const client = await getFullClient(clientKey);
      if (!client) return res.status(404).json({ ok: false, error: 'unknown clientKey' });

      if (!isBusinessHours(client)) {
        return res.status(403).json({
          ok: false,
          error: 'outside_business_hours',
          message: 'Outbound calls are only allowed during configured business hours.'
        });
      }

      const assistantId = client?.vapiAssistantId || VAPI_ASSISTANT_ID;
      const phoneNumberId = client?.vapiPhoneNumberId || VAPI_PHONE_NUMBER_ID;

      if (!assistantId || !VAPI_PRIVATE_KEY) {
        return res.status(500).json({ ok: false, error: 'Vapi not configured' });
      }

      // Always enqueue recalls and let the insights/routing distribution system schedule and execute the dial.
      const { addToCallQueue, getLatestCallInsights, getCallTimeBanditState } = await import('../db.js');
      const { scheduleAtOptimalCallWindow } = await import('../lib/optimal-call-window.js');

      const insightsRow = await getLatestCallInsights(clientKey).catch(() => null);
      const routing = insightsRow?.routing;
      const banditArms = await getCallTimeBanditState(clientKey).catch(() => ({}));

      const scheduledFor = await scheduleAtOptimalCallWindow(client, routing, new Date(), {
        fallbackTz: client?.booking?.timezone || client?.timezone || TIMEZONE,
        clientKey,
        jitterKey: `recall:${clientKey}:${phone}`,
        banditArms
      });

      await addToCallQueue({
        clientKey,
        leadPhone: phone,
        priority: 9,
        scheduledFor,
        callType: 'vapi_call',
        callData: {
          triggerType: 'manual_recall',
          leadName: lead.name || 'Lead',
          leadService: lead.service || '',
          leadSource: lead.source || null,
          recall: true
        }
      });

      console.log('[LEAD RECALL] queued', { clientKey, phone, scheduledFor: scheduledFor.toISOString() });
      return res.json({ ok: true, queued: true, scheduledFor: scheduledFor.toISOString() });
    } catch (e) {
      console.error('[POST /api/leads/recall] error', e?.message || e);
      res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });

  router.post('/nudge', async (req, res) => {
    try {
      const client = await getClientFromHeader(req);
      if (!client) return res.status(401).json({ ok: false, error: 'missing or unknown X-Client-Key' });

      const { id } = req.body || {};
      if (!id) return res.status(400).json({ ok: false, error: 'lead id required' });

      const rows = await readJson(LEADS_PATH, []);
      const lead = rows.find((r) => r.id === id && r.tenantId === (client.clientKey || client.id));
      if (!lead) return res.status(404).json({ ok: false, error: 'lead not found' });

      const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
      if (!configured) return res.status(400).json({ ok: false, error: 'tenant SMS not configured' });

      const brand = client?.displayName || client?.clientKey || 'Our Clinic';
      const body = `Hi ${lead.name || ''} — it’s ${brand}. Ready to book your appointment? Reply YES to continue.`.trim();
      const payload = { to: lead.phone, body };
      if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid;
      else if (fromNumber) payload.from = fromNumber;
      const result = await smsClient.messages.create(payload);

      lead.status = 'contacted';
      lead.updatedAt = new Date().toISOString();
      await writeJson(LEADS_PATH, rows);

      res.json({ ok: true, result: { sid: result?.sid } });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const rows = await readJson(LEADS_PATH, []);
      const lead = rows.find((r) => r.id === req.params.id);
      if (!lead) return res.status(404).json({ ok: false, error: 'lead not found' });
      res.json({ ok: true, lead });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  return router;
}

