// lib/call-outcome-heuristics.js
// Shared “answered / conversation” signal for analytics, bandits, and dashboards.

/**
 * @param {object} row - call row fields
 * @returns {boolean}
 */
export function isAnsweredHeuristic(row) {
  const outcome = (row?.outcome || '').toString().trim().toLowerCase();
  const status = (row?.status || '').toString().trim().toLowerCase();
  const duration = Number(row?.duration || 0) || 0;
  const transcript = (row?.transcript || '').toString();
  const recordingUrl = (row?.recording_url || row?.recordingUrl || '').toString();
  const noPickupOutcomes = new Set(['no-answer', 'no_answer', 'busy', 'failed', 'voicemail', 'declined', 'rejected']);
  if (outcome && !noPickupOutcomes.has(outcome)) return true;
  if (noPickupOutcomes.has(outcome)) return false;

  if (duration >= 20 && ['ended', 'completed', 'finished'].includes(status)) return true;
  if (duration >= 40 && !noPickupOutcomes.has(status)) return true;
  if (transcript.trim().length > 40) return true;
  if (recordingUrl.trim()) return true;
  return false;
}
