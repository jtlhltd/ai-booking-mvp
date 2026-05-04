/**
 * Map Vapi EOCR / sheet extraction shapes into canonical logistics qual keys
 * (see lib/logistics-qual-schema.js, docs/LOGISTICS-QUAL-SCHEMA.md).
 */
import { LOGISTICS_QUAL_FIELD_IDS } from './logistics-qual-schema.js';

function normStr(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.filter(Boolean).map(String).join(', ');
  const s = String(v).trim();
  return s;
}

/**
 * Build a partial logistics qual record from structured analysis + sheet row + legacy extracted blob.
 * Omits empty fields. Adds _meta for audit (stripped before CSV if needed).
 *
 * @param {object} opts
 * @param {Record<string, unknown>} [opts.sd] - call.analysis.structuredData
 * @param {Record<string, unknown>} [opts.sheetData] - row written to logistics sheet
 * @param {Record<string, unknown>} [opts.extracted] - legacy extracted logistics fields
 * @param {string} [opts.outcome] - Vapi outcome
 * @param {string} [opts.callId]
 */
export function buildLogisticsQualRecord({ sd = {}, sheetData = {}, extracted = {}, outcome = '', callId = '' } = {}) {
  const s = sd && typeof sd === 'object' ? sd : {};
  const sh = sheetData && typeof sheetData === 'object' ? sheetData : {};
  const ex = extracted && typeof extracted === 'object' ? extracted : {};

  const lanesFromSd = normStr(s.lanesOrRoutes || s.lanes_or_routes);
  const countries = normStr(s.mainCountries ?? ex.mainCountries);
  const couriers = normStr(s.mainCouriers ?? ex.mainCouriers);
  const lanes_or_routes =
    lanesFromSd ||
    [countries, couriers].filter(Boolean).join(' | ') ||
    '';

  const volume_or_frequency = normStr(
    s.internationalShipmentsPerWeek ||
      s.ukShipmentsPerWeek ||
      s.frequency ||
      ex.internationalShipmentsPerWeek ||
      ex.ukShipmentsPerWeek ||
      ex.frequency ||
      ex.domesticFrequency ||
      sh.frequency
  );

  const equipment_or_vehicle_needs = normStr(
    s.singleVsMultiParcel || s.singleVsMulti || ex.singleVsMulti || sh.singleVsMulti
  );

  const coverage_areas = normStr(s.mainCountries ?? ex.mainCountries ?? sh.mainCountries);

  const timeline_or_urgency = normStr(s.timelineOrUrgency || s.timeline || s.urgency);

  const authority_or_decision_process = normStr(
    s.decisionMaker || sh.decisionMaker || ex.decisionMaker
  );

  const incumbent_or_current_carrier = normStr(
    [normStr(s.ukCourier ?? ex.ukCourier ?? sh.ukCourier), couriers].filter(Boolean).join('; ')
  );

  const pain_or_constraints = normStr(s.painOrConstraints || s.constraints || s.pain);

  const callback_window = normStr(s.callbackWindow || s.preferredCallback || sh.callbackNeeded);

  let crm_next_step = normStr(s.crmNextStep || s.nextStep);
  if (!crm_next_step && outcome) crm_next_step = `call_outcome:${String(outcome).slice(0, 80)}`;

  /** @type {Record<string, string>} */
  const raw = {
    lanes_or_routes,
    volume_or_frequency,
    equipment_or_vehicle_needs,
    coverage_areas,
    timeline_or_urgency,
    authority_or_decision_process,
    incumbent_or_current_carrier,
    pain_or_constraints,
    callback_window,
    crm_next_step
  };

  /** @type {Record<string, string>} */
  const out = {};
  for (const id of LOGISTICS_QUAL_FIELD_IDS) {
    const v = raw[id];
    if (v && String(v).trim() !== '') out[id] = String(v).trim();
  }

  if (callId) {
    out._captureCallId = String(callId);
  }
  out._capturedAt = new Date().toISOString();

  return out;
}

/**
 * One-line summary for dashboard list (searchable).
 */
export function summarizeLogisticsQual(lq) {
  if (!lq || typeof lq !== 'object') return '';
  const parts = [];
  if (lq.lanes_or_routes) parts.push(lq.lanes_or_routes);
  if (lq.volume_or_frequency) parts.push(`Vol: ${lq.volume_or_frequency}`);
  if (lq.authority_or_decision_process) parts.push(`DM: ${lq.authority_or_decision_process}`);
  if (lq.crm_next_step && !String(lq.crm_next_step).startsWith('call_outcome:')) parts.push(lq.crm_next_step);
  return parts.slice(0, 4).join(' · ');
}
