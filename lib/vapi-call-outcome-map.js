/** Map VAPI endedReason (docs.vapi.ai/calls/call-ended-reason) to our normalized outcome string. */

export function mapVapiEndedReasonToOutcome(endedReason) {
  if (!endedReason || typeof endedReason !== 'string') return null;
  const r = endedReason.toLowerCase();
  if (r.includes('customer-did-not-answer') || r.includes('did-not-answer')) return 'no-answer';
  if (r.includes('customer-busy') || r.includes('busy')) return 'busy';
  if (r === 'voicemail' || r.includes('voicemail')) return 'voicemail';
  if (r.includes('rejected') || r.includes('declined') || r.includes('failed-to-connect') || r.includes('misdialed'))
    return 'declined';
  if (r.includes('vonage-rejected') || r.includes('twilio-reported')) return 'declined';
  if (r.includes('assistant-ended-call') || r.includes('customer-ended-call') || r.includes('vonage-completed'))
    return 'completed';
  if (r.includes('silence-timed-out') || r.includes('exceeded-max-duration')) return 'completed';
  if (r.includes('error') || r.includes('fault')) return 'failed';
  return 'completed';
}
