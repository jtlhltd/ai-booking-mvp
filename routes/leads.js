import express from 'express';
import store from '../store.js';
import sheets from '../sheets.js';
import { normalizePhone } from '../util/phone.js';

const router = express.Router();

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

    res.status(createdNew ? 201 : 200).json({ ok:true, leadId: row.id, status: row.status });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error:'server_error' });
  }
});

export default router;
