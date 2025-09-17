// routes/twilio-webhooks.js
const express = require('express');
const router = express.Router();

const store = require('../store');
const sheets = require('../sheets');
const { normalizePhone } = require('../util/phone');

router.post('/webhooks/twilio/sms-inbound', async (req, res) => {
  try {
    const from = normalizePhone(req.body.From);
    const body = (req.body.Body || '').trim().toUpperCase();
    const msgSid = req.body.MessagingServiceSid;
    const to = req.body.To;

    const tenant = await store.twilio.mapToTenant(msgSid, to);
    if (!tenant) return res.status(200).send();

    if (body === 'STOP') {
      await store.optouts.upsert(tenant.id, from);
      const leads = await store.leads.findOpenByPhone(tenant.id, from);

      for (const lead of leads) {
        await store.leads.markOptedOut(lead.id);
        await store.contactAttempts.log({
          tenant_id: tenant.id, lead_id: lead.id,
          channel: 'sms', direction: 'inbound',
          status: 'STOP', detail: 'STOP received'
        });

        await sheets.updateLead(tenant.gsheet_id, {
          leadId: lead.id,
          rowNumber: lead.sheet_row_id ? Number(lead.sheet_row_id) : undefined,
          patch: { 'Status':'opted_out', 'Notes':'STOP received' }
        });
      }
    }

    res.status(200).send();
  } catch (e) {
    console.error(e);
    res.status(200).send();
  }
});

module.exports = router;
