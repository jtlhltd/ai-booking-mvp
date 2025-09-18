import express from 'express';
import * as store from '../store.js';
import * as sheets from '../sheets.js';
import { normalizePhone } from '../util/phone.js';

const router = express.Router();

// --- NEW: minimal helper that calls your Vapi instance using your env vars
async function callVapi({ tenant, lead, service }) {
  const base = (process.env.VAPI_ORIGIN || 'https://api.vapi.ai').replace(/\/$/, '');
  const key  = process.env.VAPI_PRIVATE_KEY;
  if (!key) throw new Error('Missing VAPI_PRIVATE_KEY');

  const assistantId    = tenant?.vapiAssistantId || process.env.VAPI_ASSISTANT_ID;
  const phoneNumberId  = tenant?.vapiPhoneNumberId || process.env.VAPI_PHONE_NUMBER_ID;
  const payload = {
    assistantId,
    phoneNumberId,
    customer: { number: lead.phone, numberE164CheckEnabled: true },
    assistantOverrides: {
      variableValues: {
        ClientKey: tenant.key,
        BusinessName: tenant.name || tenant.key,
        ConsentLine: process.env.CONSENT_LINE || 'This call may be recorded for quality.',
        DefaultService: service || '',
        DefaultDurationMin: 30,
        Timezone: process.env.TZ || 'Europe/London'
      }
    },
    // Vapi will POST updates to this URL if you later add a /webhooks/vapi route
    // webhookUrl: process.env.PUBLIC_BASE_URL ? `${process.env.PUBLIC_BASE_URL}/webhooks/vapi` : undefined
  };

  const resp = await fetch(`${base}/call`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Vapi /call failed: ${resp.status} ${msg}`);
  }
}

async function authTenant(req, res, next) {
  try {
    const apiKey = req.header('X-API-Key');
    const clientKey = req.header('X-Client-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) return res.status(401).json({ ok:false, error:'unauthorized' });
    if (!clientKey) return res.status(400).json({ ok:false, error:'missing_client_key' });

    const tenant = await store.tenants.findByKey(clientKey);
    if (!tenant) return res.status(404).json({ ok:false, error:'tenant_not_found' });
    if (!tenant.gsheet_id) return res.status(400).json({ ok:false, error:'tenant_missing_gsheet_id' });
    req.tenant = tenant;
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error:'server_error' });
  }
}

router.post('/api/leads', authTenant, async (req, res) => {
  const { service, lead, source } = req.body || {};
  if (!service || !lead?.name || !lead?.phone)
    return res.status(400).json({ ok:false, error:'invalid_payload' });

  const tenant = req.tenant;
  const phone = normalizePhone(lead.phone);

  try {
    let row = await store.leads.findByComposite(tenant.id, phone, service);
    let createdNew = false;

    if (!row) {
      row = await store.leads.create({
        tenant_id: tenant.id,
        name: lead.name,
        phone,
        service,
        source: source || null,
        status: 'pending',
        attempts: 0
      });
      createdNew = true;

      const { rowNumber } = await sheets.appendLead(tenant.gsheet_id, row);
      if (rowNumber) await store.leads.updateSheetRowId(row.id, String(rowNumber));
    }

    // --- NEW: fire the outbound call (non-blocking — we don’t wait for result)
    callVapi({ tenant, lead: { ...row, phone }, service }).catch(err => {
      console.warn('vapi call error', err?.message || err);
    });

    res.status(createdNew ? 201 : 200).json({ ok:true, leadId: row.id, status: row.status });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error:'server_error' });
  }
});

export default router;
