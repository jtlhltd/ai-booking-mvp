const gcal = require('../gcal');
const db = require('../db');
const notify = require('./notify');

function pick(obj, ...paths) {
  for (const p of paths) {
    const segs = p.split('.');
    let cur = obj;
    for (const s of segs) cur = cur?.[s];
    if (cur) return cur;
  }
  return undefined;
}

function normalizeFromVapi(p) {
  // Tries several common shapes so you don’t have to change this later
  const clientKey = pick(p, 'metadata.clientKey', 'clientKey');
  const service   = pick(p, 'metadata.service', 'service');
  const lead      = pick(p, 'customer', 'lead', 'metadata.lead') || {};
  const slot      = pick(p, 'booking.slot', 'metadata.selectedOption', 'selectedSlot', 'slot');
  if (!clientKey || !service || !slot?.start || !lead?.phone) {
    throw new Error('Vapi webhook payload missing required fields');
  }
  return { clientKey, service, lead, slot };
}

exports.handleVapiBooking = async (payload) => {
  const { clientKey, lead, service, slot } = normalizeFromVapi(payload);
  const tenant = await db.getTenant(clientKey);
  await gcal.assertFree({ calendarId: tenant.calendarId, slot });
  const event = await gcal.createEvent({ tenant, lead, service, slot });

  await db.markBooked({ tenantKey: clientKey, leadId: lead.id, eventId: event.id, slot });
  await notify.confirmations({ tenant, lead, service, slot });

  return { ok: true, eventId: event.id };
};
