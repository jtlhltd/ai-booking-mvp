// notify.js — adds X-Client-Key so SMS uses tenant settings
// Uses Node 20+ native global fetch.

const BASE = process.env.PUBLIC_BASE_URL;
const API_KEY = process.env.API_KEY;

function idem() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export async function sms({ tenant, to, message }) {
  const res = await fetch(`${BASE}/api/notify/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      'X-Client-Key': tenant.clientKey,
      'Idempotency-Key': idem()
    },
    body: JSON.stringify({ channel: 'sms', to, message })
  });
  if (!res.ok) throw new Error(`notify.sms failed: ${res.status} ${await res.text()}`);
}

export async function confirmations({ tenant, lead, service, slot }) {
  const when = new Date(slot.start).toLocaleString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short'
  });
  await sms({ tenant, to: lead.phone, message: `Booked: ${service} on ${when}. Reply R to reschedule.` });
  if (tenant?.numbers?.clinic) {
    await sms({
      tenant,
      to: tenant.numbers.clinic,
      message: `New booking: ${service} with ${lead.name} (${lead.phone}) at ${when}.`
    });
  }
}
