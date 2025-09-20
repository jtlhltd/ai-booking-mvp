// vapi.js — standardize on VAPI_PRIVATE_KEY
const fetch = require('node-fetch');

exports.callLead = async ({ tenant, lead, options }) => {
  const payload = {
    assistantId: tenant.vapi.assistantId,
    phoneNumberId: tenant.vapi.phoneNumberId,
    customer: { number: lead.phone, name: lead.name },
    metadata: {
      clientKey: tenant.clientKey,
      service: lead.service,
      options
    }
  };
  const res = await fetch('https://api.vapi.ai/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.VAPI_PRIVATE_KEY}` },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Vapi call error: ${res.status} ${await res.text()}`);
};
