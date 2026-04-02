// When sample-ready email fires, outbound A/B is "frozen": same two variants keep dialing;
// no new experiments or phases until the operator clears the lock (review complete).

export function isOutboundAbReviewPending(vapi) {
  if (!vapi || typeof vapi !== 'object') return false;
  const p = vapi.outboundAbReviewPending;
  if (p == null) return false;
  const s = String(p).trim().toLowerCase();
  if (s === '' || s === 'false' || s === '0') return false;
  return true;
}

export const OUTBOUND_AB_REVIEW_PENDING_MESSAGE =
  'A/B review is pending: the sample target was reached and you were emailed. The same variants stay live until you finish review and click “Review complete & continue” (or call the operator API). No new tests or phases can start until then.';
