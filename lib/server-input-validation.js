/** API-safe lead row (matches routes/core-api.js). */
export function sanitizeLead(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    service: row.service,
    status: row.status,
    source: row.source,
    lastMessage: row.notes
  };
}

export function validatePhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
}

export function validateSmsBody(body) {
  if (!body || typeof body !== 'string') return false;
  return body.trim().length > 0 && body.length <= 1600;
}

export function sanitizeInput(input, maxLength = 1000) {
  if (!input || typeof input !== 'string') return '';
  return input
    .trim()
    .substring(0, maxLength)
    .replace(/[<>]/g, '')
    .replace(/[\r\n\t]/g, ' ');
}

export function validateAndSanitizePhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.length < 10 || cleaned.length > 15) return null;
  return cleaned;
}

export function createSmsRateLimitMiddleware({
  rateLimitWindowMs = 60 * 1000,
  maxRequests = 10
} = {}) {
  const rateLimitStore = new Map();
  return function smsRateLimit(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowStart = now - rateLimitWindowMs;

    for (const [key, timestamp] of rateLimitStore.entries()) {
      if (timestamp < windowStart) {
        rateLimitStore.delete(key);
      }
    }

    const requests = Array.from(rateLimitStore.entries())
      .filter(([key, timestamp]) => key.startsWith(ip) && timestamp > windowStart)
      .length;

    if (requests >= maxRequests) {
      console.log('[RATE LIMIT]', { ip, requests, limit: maxRequests });
      return res.status(429).json({ error: 'Too many requests' });
    }

    rateLimitStore.set(`${ip}-${now}`, now);
    next();
  };
}
