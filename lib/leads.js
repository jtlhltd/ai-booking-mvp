const db = require('../db');
const notify = require('./notify');
const workflow = require('./workflow');

exports.handleInboundSms = async ({ tenant, from, to, body }) => {
  const txt = (body || '').trim();
  const upper = txt.toUpperCase();

  // Compliance
  if (['STOP','UNSUBSCRIBE','CANCEL'].includes(upper)) {
    await db.setSmsConsent(tenant.clientKey, from, false);
    await notify.sms({ tenant, to: from, message: 'You are opted out. Text START to opt back in.' });
    return;
  }
  if (['START','UNSTOP'].includes(upper)) {
    await db.setSmsConsent(tenant.clientKey, from, true);
    await notify.sms({ tenant, to: from, message: 'Thanks — you’re opted in.' });
    return;
  }

  // YES → call me now
  if (['YES','Y'].includes(upper)) {
    const lead = await db.findOrCreateLead({ tenantKey: tenant.clientKey, phone: from });
    await workflow.triggerAutoCall({ tenant, lead });
    return;
  }

  // 1/2/3 → accept a suggested time (your app can map this to stored options if you persist them)
  if (/^[123]$/.test(upper)) {
    await db.storeProposedChoice({ tenantKey: tenant.clientKey, phone: from, choice: Number(upper) });
    await notify.sms({ tenant, to: from, message: 'Got it — locking that in now.' });
    // optional: you can automatically call booking handler here if you persist the options
    return;
  }

  // default
  await notify.sms({ tenant, to: from, message: 'Say YES for a quick call, or 1/2/3 to pick a suggested time.' });
};
