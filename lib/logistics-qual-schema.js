/**
 * Canonical logistics / courier qualification fields for structured capture and handoff.
 *
 * Storage: prefer `leads.metadata` (JSON) and/or logistics sheet columns already synced from voice;
 * display/export maps these keys to operator-facing labels. Keep keys stable for CRM exports.
 *
 * See docs/LOGISTICS-QUAL-SCHEMA.md for full contract.
 */
export const LOGISTICS_QUAL_FIELD_IDS = [
  'lanes_or_routes',
  'volume_or_frequency',
  'equipment_or_vehicle_needs',
  'coverage_areas',
  'timeline_or_urgency',
  'authority_or_decision_process',
  'incumbent_or_current_carrier',
  'pain_or_constraints',
  'callback_window',
  'crm_next_step'
];

/** JSON paths / nested keys under lead.metadata.logisticsQual when using structured objects */
export const LOGISTICS_QUAL_METADATA_PREFIX = 'logisticsQual';

/** CSV column titles aligned with LOGISTICS_QUAL_FIELD_IDS order */
export const LOGISTICS_QUAL_CSV_LABELS = [
  'Qual: Lanes or routes',
  'Qual: Volume or frequency',
  'Qual: Equipment or vehicle needs',
  'Qual: Coverage areas',
  'Qual: Timeline or urgency',
  'Qual: Authority or decision process',
  'Qual: Incumbent or current carrier',
  'Qual: Pain or constraints',
  'Qual: Callback window',
  'Qual: CRM next step'
];
