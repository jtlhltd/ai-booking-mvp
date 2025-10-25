// Safe extraction example - Utility functions
// These have no dependencies and can be moved safely

// Extract from server.js to lib/phone-utils.js
export function normalizePhoneE164(input, country = 'GB') {
  const isE164 = (s) => typeof s === 'string' && /^\+\d{7,15}$/.test(s);
  const normalizePhone = (s) => (s || '').trim().replace(/[^\d+]/g, '');
  
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  const cleaned = normalizePhone(raw);

  // Already valid E.164?
  if (isE164(cleaned)) return cleaned;

  // Convert "00..." to "+"
  if (/^00\d{6,}$/.test(cleaned)) {
    const cand = '+' + cleaned.slice(2);
    if (isE164(cand)) return cand;
  }

  const digits = cleaned.replace(/\D/g, '');

  // GB-specific heuristics
  const reg = String(country || 'GB').toUpperCase();
  if (reg === 'GB' || reg === 'UK') {
    // 07XXXXXXXXX (or 7XXXXXXXXX) -> +447XXXXXXXXX
    const m1 = digits.match(/^0?7(\d{9})$/);
    if (m1) {
      const cand = '+447' + m1[1];
      if (isE164(cand)) return cand;
    }
    // 44XXXXXXXXXX -> +44XXXXXXXXXX
    const m2 = digits.match(/^44(\d{9,10})$/);
    if (m2) {
      const cand = '+44' + m2[1];
      if (isE164(cand)) return cand;
    }
  }

  // Fallback: if it looks like 7–15 digits, prefix +
  if (/^\d{7,15}$/.test(digits)) {
    const cand = '+' + digits;
    if (isE164(cand)) return cand;
  }

  return null;
}

// Extract from server.js to lib/date-utils.js
export function formatDate(date, format = 'en-GB') {
  return new Date(date).toLocaleDateString(format);
}

export function formatTime(date, format = 'en-GB') {
  return new Date(date).toLocaleTimeString(format, { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

export function isBusinessHours(date = new Date()) {
  const hour = date.getHours();
  const day = date.getDay();
  
  // Monday to Friday, 9 AM to 5 PM
  return day >= 1 && day <= 5 && hour >= 9 && hour < 17;
}

// Extract from server.js to lib/validation-utils.js
export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePhone(phone) {
  const phoneRegex = /^\+44\d{10}$/;
  return phoneRegex.test(phone);
}

export function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '')
            .trim();
}

