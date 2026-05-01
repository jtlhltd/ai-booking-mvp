// vapi.js — standardize on VAPI_PRIVATE_KEY
// Uses Node 20+ native global fetch.

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
  // Guard with active-call concurrency limiter (shared with instant-calling)
  const { acquireVapiSlot, releaseVapiSlot, markVapiCallActive } = await import('./instant-calling.js');
  await acquireVapiSlot();
  let res;
  try {
    res = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.VAPI_PRIVATE_KEY}` },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    releaseVapiSlot({ reason: 'start_failed' });
    throw e;
  }
  if (!res.ok) {
    releaseVapiSlot({ reason: `start_failed_${res.status}` });
    throw new Error(`Vapi call error: ${res.status} ${await res.text()}`);
  }
  const data = await res.json().catch(() => null);
  if (data?.id) markVapiCallActive(data.id, { ttlMs: 30 * 60 * 1000 });
  else releaseVapiSlot({ reason: 'no_call_id' });
};
