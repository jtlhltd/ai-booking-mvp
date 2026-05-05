// lib/log-scrubber.js
//
// Tiny PII redactor used by routes/handlers that need to log inbound
// payloads (lead imports, demo bookings, Zapier hooks, Google-Places
// search, signup) without leaking phone numbers or emails.
//
// In non-production we keep the original behavior (full echo) so devs can
// debug on a local box; in production we always scrub.
//
// Usage:
//   import { redactPhone, redactEmail, scrubBody, isProd } from './log-scrubber.js';
//   console.log('[SIGNUP]', scrubBody(req.body));
//
// All helpers are pure and safe to call on undefined / non-string inputs.

const PHONE_RE = /\+?\d[\d\s().-]{6,}/g;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const PII_KEY_RE = /^(phone|to|from|mobile|cell|tel|telephone|email|e_?mail|owner_?email|owner_?phone|password|secret|token|api[_-]?key|authorization)$/i;

const MAX_LOG_BYTES = 4096; // ~4 KB cap per scrubbed payload

export function isProd() {
  return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
}

export function redactPhone(value) {
  const s = value == null ? '' : String(value);
  if (s.length < 5) return s ? '***' : s;
  // Keep last 4 digits, mask the rest.
  return `…${s.slice(-4)}`;
}

export function redactEmail(value) {
  const s = value == null ? '' : String(value);
  const at = s.indexOf('@');
  // Pass through non-email strings unchanged; only mask when an @ is present.
  if (at < 1 || s.indexOf('.', at) < 0) return s;
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}***@${domain}`;
}

function redactString(s) {
  if (typeof s !== 'string' || !s) return s;
  return s
    .replace(EMAIL_RE, (m) => redactEmail(m))
    .replace(PHONE_RE, (m) => {
      // Avoid redacting trivial numeric-looking strings (timestamps, ids).
      const digits = m.replace(/\D/g, '');
      if (digits.length < 7) return m;
      return redactPhone(digits);
    });
}

/**
 * Recursively scrub an object/array/primitive for log-safe output.
 * Production: PII keys are masked, free-text strings have phones/emails
 * redacted, and the final JSON is capped at MAX_LOG_BYTES.
 * Non-production: pass-through (original value).
 */
export function scrubBody(body) {
  if (!isProd()) return body;
  return capJson(scrub(body));
}

function scrub(value, depth = 0) {
  if (value == null) return value;
  if (depth > 6) return '[depth-limit]';
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (PII_KEY_RE.test(k)) {
        if (typeof v === 'string') {
          if (k.toLowerCase().includes('email')) out[k] = redactEmail(v);
          else if (
            k.toLowerCase().includes('password') ||
            k.toLowerCase().includes('secret') ||
            k.toLowerCase().includes('token') ||
            k.toLowerCase().includes('key') ||
            k.toLowerCase().includes('authorization')
          ) {
            out[k] = '[redacted]';
          } else {
            out[k] = redactPhone(v);
          }
        } else {
          out[k] = '[redacted]';
        }
      } else {
        out[k] = scrub(v, depth + 1);
      }
    }
    return out;
  }
  if (typeof value === 'string') return redactString(value);
  return value;
}

function capJson(value) {
  let s;
  try {
    s = JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
  if (s == null) return value;
  if (s.length <= MAX_LOG_BYTES) return value;
  return `[truncated ${s.length}B] ${s.slice(0, MAX_LOG_BYTES)}…`;
}
