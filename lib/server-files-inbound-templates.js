import fs from 'fs/promises';
import { normalizePhoneE164 } from './utils.js';

export async function ensureDataFiles(DATA_DIR, paths) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  for (const p of paths) {
    try {
      await fs.access(p);
    } catch {
      await fs.writeFile(p, '[]', 'utf8');
    }
  }
}

export async function readJson(p, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function writeJson(p, data) {
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf8');
}

export function createResolveTenantKeyFromInbound(listFullClients) {
  return async ({ to, messagingServiceSid }) =>
    resolveTenantKeyFromInboundImpl({ to, messagingServiceSid }, { listFullClients });
}

async function resolveTenantKeyFromInboundImpl({ to, messagingServiceSid }, { listFullClients }) {
  const toE164 = normalizePhoneE164(to, 'GB');
  if (!toE164) {
    console.log('[TENANT RESOLVE FAIL]', { to, messagingServiceSid, reason: 'invalid_phone' });
    return null;
  }

  try {
    const clients = await listFullClients();
    const candidates = [];

    for (const client of clients) {
      const phoneMatch = client?.sms?.fromNumber === toE164;
      const mssMatch = messagingServiceSid && client?.sms?.messagingServiceSid === messagingServiceSid;

      if (phoneMatch || mssMatch) {
        candidates.push({
          clientKey: client.clientKey,
          phoneMatch,
          mssMatch,
          fromNumber: client?.sms?.fromNumber,
          messagingServiceSid: client?.sms?.messagingServiceSid
        });
      }
    }

    if (candidates.length === 0) {
      console.log('[TENANT RESOLVE FAIL]', { to, toE164, messagingServiceSid });
      return null;
    }

    const phoneMatches = candidates.filter(c => c.phoneMatch);
    const mssMatches = candidates.filter(c => c.mssMatch && !c.phoneMatch);

    let selected;
    if (phoneMatches.length > 0) {
      selected = phoneMatches[0];
      console.log('[TENANT RESOLVE OK]', {
        tenantKey: selected.clientKey,
        to,
        toE164,
        messagingServiceSid,
        reason: 'exact_phone_match',
        priority: 'phone_over_mss'
      });
    } else if (mssMatches.length > 0) {
      selected = mssMatches[0];
      console.log('[TENANT RESOLVE OK]', {
        tenantKey: selected.clientKey,
        to,
        toE164,
        messagingServiceSid,
        reason: 'messaging_service_match',
        priority: 'mss_fallback'
      });
    } else {
      selected = candidates[0];
      console.log('[TENANT RESOLVE OK]', {
        tenantKey: selected.clientKey,
        to,
        toE164,
        messagingServiceSid,
        reason: 'first_match',
        priority: 'fallback'
      });
    }

    if (candidates.length > 1) {
      console.log('[TENANT RESOLVE AMBIGUOUS]', {
        to,
        toE164,
        messagingServiceSid,
        candidates: candidates.map(c => c.clientKey),
        selected: selected.clientKey,
        phoneMatches: phoneMatches.map(c => c.clientKey),
        mssMatches: mssMatches.map(c => c.clientKey)
      });
    }

    return selected.clientKey;
  } catch (error) {
    console.log('[TENANT RESOLVE FAIL]', { to, toE164, messagingServiceSid, error: error.message });
    return null;
  }
}

/** @deprecated prefer createResolveTenantKeyFromInbound */
export async function resolveTenantKeyFromInbound(params, deps) {
  return resolveTenantKeyFromInboundImpl(params, deps);
}

export function renderTemplate(str, vars = {}) {
  try {
    return String(str).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => {
      const v = vars[k];
      return (v === undefined || v === null) ? '' : String(v);
    });
  } catch {
    return String(str || '');
  }
}
