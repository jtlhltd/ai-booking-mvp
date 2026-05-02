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
  let slotLeaseId = null;
  const _acq = await acquireVapiSlot();
  slotLeaseId = _acq?.leaseId ?? null;
  let res;
  try {
    res = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.VAPI_PRIVATE_KEY}` },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    await releaseVapiSlot({ leaseId: slotLeaseId, reason: 'start_failed' });
    throw e;
  }
  if (!res.ok) {
    await releaseVapiSlot({ leaseId: slotLeaseId, reason: `start_failed_${res.status}` });
    throw new Error(`Vapi call error: ${res.status} ${await res.text()}`);
  }
  const data = await res.json().catch(() => null);
  if (data?.id) await markVapiCallActive(data.id, { ttlMs: 30 * 60 * 1000, leaseId: slotLeaseId });
  else await releaseVapiSlot({ leaseId: slotLeaseId, reason: 'no_call_id' });
};

/**
 * POST https://api.vapi.ai/call — caller owns concurrency slot acquire/release (e.g. retry worker).
 * @param {{ bearerToken?: string, payload: Record<string, unknown> }} opts
 * @returns {Promise<Record<string, unknown>>}
 */
exports.postOutboundCall = async ({ bearerToken, payload }) => {
  const token = bearerToken || process.env.VAPI_PRIVATE_KEY;
  if (!token) {
    return { error: 'VAPI bearer missing', id: null };
  }
  let res;
  try {
    res = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    return { error: e?.message || String(e), id: null };
  }
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    return { error: data?.message || String(text || res.statusText || 'vapi_error'), id: null, ...data };
  }
  return data;
};
