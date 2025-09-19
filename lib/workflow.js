const slots = require('./slots');
const notify = require('./notify');
const vapi = require('./vapi');
const fetch = require('node-fetch');

function optionsToSms(opts) {
  const fmt = (o, i) =>
    `${i+1}) ${new Date(o.start).toLocaleString('en-GB',{ hour:'2-digit', minute:'2-digit', day:'2-digit', month:'short' })}`;
  return `I can book you: ${opts.map(fmt).join(', ')}. Reply 1, 2, or 3 to confirm. Reply STOP to opt out.`;
}

exports.triggerAutoCall = async ({ tenant, lead }) => {
  const options = await slots.getTop3({ tenant, service: lead.service });
  try {
    await vapi.callLead({ tenant, lead, options });
  } catch (e) {
    // Immediate SMS fallback if Vapi call creation fails
    await notify.sms({ tenant, to: lead.phone, message: optionsToSms(options) });
  }
  // Tell n8n to start follow-up cadence (so Node doesn’t need a queue on Day-1)
  const url = process.env.N8N_FOLLOWUP_WEBHOOK_URL;
  const secret = process.env.N8N_SHARED_SECRET;
  if (url && secret) {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shared-Secret': secret },
      body: JSON.stringify({
        clientKey: tenant.clientKey,
        lead: { id: lead.id, name: lead.name, phone: lead.phone, service: lead.service },
        attempt: 1
      })
    }).catch(() => {});
  }
};

exports.smsForOptions = optionsToSms;
