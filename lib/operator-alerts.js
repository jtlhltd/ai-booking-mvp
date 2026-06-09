/**
 * Operator-facing alerts — routed as warning severity with incident grouping.
 */

export function getOperatorInboxEmail() {
  const raw = process.env.YOUR_EMAIL;
  if (raw == null || String(raw).trim() === '') return null;
  return String(raw).trim();
}

/**
 * @param {Object} opts
 * @param {string} opts.subject
 * @param {string} [opts.html]
 * @param {string} [opts.text]
 * @param {string} [opts.dedupeKey]
 * @param {number} [opts.throttleMinutes] - default 45
 */
export async function sendOperatorAlert({
  subject,
  html = null,
  text = null,
  dedupeKey = null,
  throttleMinutes = 45,
}) {
  if (!getOperatorInboxEmail() && !process.env.ALERT_WARNING_EMAIL?.trim()) {
    console.warn('[OPERATOR ALERT] No warning inbox configured — skipped:', subject);
    return { sent: false, reason: 'no_your_email' };
  }

  const { routeAlert } = await import('./alert-router.js');
  const subj = subject.startsWith('[') ? subject : `[AI Booking] ${subject}`;
  const message = text != null && String(text).trim() !== '' ? String(text) : subj;

  return routeAlert({
    severity: 'warning',
    title: subj,
    message,
    html,
    dedupeKey: dedupeKey || subject,
    source: 'operator',
    throttleMinutes,
  });
}
