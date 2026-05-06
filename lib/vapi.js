// vapi.js — standardize Vapi call initiation in one allow-listed module.
// Note: this file is CommonJS (legacy) but can be imported from ESM via default import.
const fetch = require('node-fetch');

async function _createCall({ vapiKey, callData }) {
  if (!vapiKey) throw new Error('VAPI API key not configured');
  const res = await fetch('https://api.vapi.ai/call', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${vapiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(callData)
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    // ignore
  }
  if (!res.ok) {
    const msg = json?.message || json?.error || `Vapi call error: ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.vapi = json;
    throw err;
  }
  return json;
}

exports.createCallWithKey = async ({ vapiKey, callData }) => {
  // Guard with active-call concurrency limiter (shared with instant-calling)
  const { acquireVapiSlot, releaseVapiSlot, markVapiCallActive } = await import('./instant-calling.js');
  await acquireVapiSlot();

  let data;
  try {
    data = await _createCall({ vapiKey, callData });
  } catch (e) {
    releaseVapiSlot({ reason: 'start_failed' });
    throw e;
  }

  if (data?.id) markVapiCallActive(data.id, { ttlMs: 30 * 60 * 1000 });
  else releaseVapiSlot({ reason: 'no_call_id' });

  return data;
};

exports.callLead = async ({ tenant, lead, options }) => {
  const callData = {
    assistantId: tenant.vapi.assistantId,
    phoneNumberId: tenant.vapi.phoneNumberId,
    customer: { number: lead.phone, name: lead.name },
    metadata: {
      clientKey: tenant.clientKey,
      service: lead.service,
      options
    }
  };
  await exports.createCallWithKey({ vapiKey: process.env.VAPI_PRIVATE_KEY, callData });
};
