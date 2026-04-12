/**
 * Operator-facing email alerts (Render: set YOUR_EMAIL).
 * Throttled per dedupeKey to avoid storms on repeated failures.
 */

import messagingService from './messaging-service.js';

const lastSent = new Map();

export function getOperatorInboxEmail() {
  const raw = process.env.YOUR_EMAIL;
  if (raw == null || String(raw).trim() === '') return null;
  return String(raw).trim();
}

/**
 * @param {Object} opts
 * @param {string} opts.subject - short subject (prefix added automatically)
 * @param {string} [opts.html]
 * @param {string} [opts.text] - plain text body if no html
 * @param {string} [opts.dedupeKey] - defaults to subject
 * @param {number} [opts.throttleMinutes] - default 45
 */
export async function sendOperatorAlert({
  subject,
  html = null,
  text = null,
  dedupeKey = null,
  throttleMinutes = 45
}) {
  const to = getOperatorInboxEmail();
  if (!to) {
    console.warn('[OPERATOR ALERT] YOUR_EMAIL not set — skipped:', subject);
    return { sent: false, reason: 'no_your_email' };
  }
  if (!messagingService?.emailTransporter) {
    console.warn('[OPERATOR ALERT] Email not configured — skipped:', subject);
    return { sent: false, reason: 'email_not_configured' };
  }
  const key = dedupeKey || subject;
  const ttlMs = Math.max(1, Number(throttleMinutes) || 45) * 60 * 1000;
  const now = Date.now();
  const prev = lastSent.get(key);
  if (prev != null && now - prev < ttlMs) {
    return { sent: false, reason: 'throttled', key };
  }
  lastSent.set(key, now);

  const subj = subject.startsWith('[') ? subject : `[AI Booking] ${subject}`;
  const body = text != null && String(text).trim() !== '' ? String(text) : html ? stripHtmlToText(html) : subj;

  try {
    await messagingService.sendEmail({
      to,
      subject: subj,
      body,
      html: html || null
    });
    return { sent: true, to };
  } catch (e) {
    console.error('[OPERATOR ALERT] send failed:', e?.message || e);
    return { sent: false, reason: e?.message || 'send_error' };
  }
}

function stripHtmlToText(html) {
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);
}
