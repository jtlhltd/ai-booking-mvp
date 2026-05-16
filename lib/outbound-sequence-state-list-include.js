/**
 * Whether a `lead_sequence_state` row should appear in the dashboard "In sequence" list.
 *
 * Rows often outlive enrollment (operator stop + unenroll, or stale DB). Terminal rows without
 * `outboundSequenceOptIn` clutter the list and contradict the "Multi-call enrolled" badges.
 *
 * Always keep rows that are still `active` so ops can intervene even if dial-context is stale.
 *
 * @param {{ sequenceOptedIn?: boolean, status?: string }} row
 */
export function shouldIncludeLeadInSequenceStateList(row = {}) {
  if (row.sequenceOptedIn === true) return true;
  return String(row.status || '').trim().toLowerCase() === 'active';
}
