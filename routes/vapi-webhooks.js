import express from 'express';
import * as store from '../store.js';
import * as sheets from '../sheets.js';

const router = express.Router();

router.post('/webhooks/vapi', async (req, res) => {
  try {
    const body = req.body || {};
    const md = body.metadata || {};
    const leadId = md.leadId || body.leadId;
    if (!leadId) return res.status(200).json({ ok:true });

    const lead = await store.leads.getById(leadId);
    if (!lead) return res.status(200).json({ ok:true });

    const outcome = String(body.outcome || body.result || '').toLowerCase();
    if (outcome === 'booked' || body.booked === true) {
      const booking_start = body.bookingStart || body.slotStart || '';
      const booking_end   = body.bookingEnd   || body.slotEnd   || '';

      await store.leads.updateOnBooked(leadId, { status:'booked', booked:true, booking_start, booking_end });

      const tenant = await store.tenants.findByKey(lead.tenant_id);
      if (tenant?.gsheet_id) {
        await sheets.updateLead(tenant.gsheet_id, {
          leadId,
          rowNumber: lead.sheet_row_id ? Number(lead.sheet_row_id) : undefined,
          patch: { 'Status':'booked','Booked?':'TRUE','Booking Start':booking_start,'Booking End':booking_end }
        });
      }
    }
    res.status(200).json({ ok:true });
  } catch (e) {
    console.error('vapi webhook error', e?.message || e);
    res.status(200).json({ ok:true });
  }
});

export default router;
