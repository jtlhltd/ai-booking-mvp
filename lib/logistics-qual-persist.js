import { buildLogisticsQualRecord } from './logistics-qual-from-vapi.js';

function isOutboundQualCall(metadata) {
  const cp = String(metadata?.callPurpose || metadata?.CallPurpose || '').toLowerCase();
  return (
    cp.includes('outbound_lead_qual') || (cp.includes('outbound') && cp.includes('qual'))
  );
}

/**
 * Persist canonical logistics qual onto the lead row (custom_fields.logisticsQual).
 * No-ops if not an outbound qual call or missing tenant/phone or empty canonical fields.
 */
export async function persistLogisticsQualToLead({
  tenantKey,
  leadPhone,
  callId,
  outcome,
  metadata,
  sd = {},
  sheetData = {},
  extracted = {}
}) {
  if (!tenantKey || !leadPhone || tenantKey === 'test_client') return { ok: false, skipped: true };
  if (!isOutboundQualCall(metadata || {})) return { ok: false, skipped: true };

  const { mergeLeadLogisticsQual } = await import('../db.js');
  const patch = buildLogisticsQualRecord({
    sd: sd && typeof sd === 'object' ? sd : {},
    sheetData: sheetData && typeof sheetData === 'object' ? sheetData : {},
    extracted: extracted && typeof extracted === 'object' ? extracted : {},
    outcome: outcome || '',
    callId: callId || ''
  });
  const canon = Object.keys(patch).filter((k) => !k.startsWith('_'));
  if (canon.length < 1) return { ok: false, skipped: true };

  return mergeLeadLogisticsQual({
    clientKey: tenantKey,
    phone: leadPhone,
    patch,
    sourceCallId: callId || ''
  });
}
