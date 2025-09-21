const db = require('../db');
const notify = require('./notify');
const workflow = require('./workflow');

// normalize phone to E.164 format
function normalizePhone(phone) {
  if (!phone) return null;
  let p = phone.trim().replace(/\s+/g, '');
  if (!p.startsWith('+')) {
    // assume UK if missing
    if (p.startsWith('0')) {
      p = '+44' + p.slice(1);
    } else {
      p = '+44' + p; 
    }
  }
  return p;
}

exports.handleInboundSms = async ({ tenant, from, to, body }) => {
  const txt = (body || '').trim();
  const upper = txt.toUpperCase();

  const normFrom = normalizePhone(from);

  // Compliance
  if (['STOP','UNSUBSCRIBE','CANCEL'].includes(upper)) {
    await db.setSmsConsent(tenant.clientKey, normFrom, false);
    await notify.sms({ tenant, to: normFrom, message: 'You are opted out. Text START to opt back in.' });
    return;
  }
  if (['START','UNSTOP'].includes(upper)) {
    await db.setSmsConsent(tenant.clientKey, normFrom, true);
    await notify.sms({ tenant, to: normFrom, message: 'Thanks — you’re opted in.' });
    return;
  }

  // YES → call me now
  if (['YES','Y'].includes(upper)) {
    const lead = await db.findOrCreateLead({ tenantKey: tenant.clientKey, phone: normFrom });
    await workflow.triggerAutoCall({ tenant, lead });
    return;
  }

  // 1/2/3 → accept suggested time
  if (/^[123]$/.test(upper)) {
    await db.storeProposedChoice({ tenantKey: tenant.clientKey, phone: normFrom, choice: Number(upper) });
    await notify.sms({ tenant, to: normFrom, message: 'Got it — locking that in now.' });
    return;
  }

  // default
  await notify.sms({ tenant, to: normFrom, message: 'Say YES for a quick call, or 1/2/3 to pick a suggested time.' });
};
