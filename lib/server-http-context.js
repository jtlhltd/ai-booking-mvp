import { createHash } from 'crypto';
import { resolveTenantTimezone } from './timezone-resolver.js';

export function createServerHttpContext(deps) {
  const {
    getFullClient,
    TIMEZONE,
    GOOGLE_CALENDAR_ID,
    defaultSmsClient,
    TWILIO_FROM_NUMBER,
    TWILIO_MESSAGING_SERVICE_SID
  } = deps;

  async function getClientFromHeader(req) {
    const key = req.get('X-Client-Key') || null;
    if (!key) return null;
    return await getFullClient(key);
  }

  function pickTimezone(client) {
    return resolveTenantTimezone(client, TIMEZONE);
  }

  function pickCalendarId(client) {
    return client?.calendarId || GOOGLE_CALENDAR_ID;
  }

  function smsConfig(client) {
    const messagingServiceSid = client?.sms?.messagingServiceSid || TWILIO_MESSAGING_SERVICE_SID || null;
    const fromNumber = client?.sms?.fromNumber || TWILIO_FROM_NUMBER || null;
    const smsClient = defaultSmsClient;
    const configured = !!(smsClient && (messagingServiceSid || fromNumber));
    return { messagingServiceSid, fromNumber, smsClient, configured };
  }

  const idemCache = new Map();
  const IDEM_TTL_MS = 10 * 60_000;

  function getCachedIdem(key) {
    const v = idemCache.get(key);
    if (!v) return null;
    if (Date.now() - v.at > IDEM_TTL_MS) {
      idemCache.delete(key);
      return null;
    }
    return v;
  }

  function setCachedIdem(key, status, body) {
    if (!key) return;
    idemCache.set(key, { at: Date.now(), status, body });
  }

  function deriveIdemKey(req) {
    const headerKey = req.get('Idempotency-Key');
    if (headerKey) return headerKey;
    const h = createHash('sha256').update(JSON.stringify(req.body || {})).digest('hex');
    return 'auto:' + h;
  }

  return {
    getClientFromHeader,
    pickTimezone,
    pickCalendarId,
    smsConfig,
    getCachedIdem,
    setCachedIdem,
    deriveIdemKey
  };
}

/**
 * @param {{ isShuttingDown: boolean, activeRequests: number }} lifecycle — mutated by shutdown handler + this middleware
 */
export function createActiveRequestTrackingMiddleware(lifecycle) {
  return function activeRequestTrackingMiddleware(req, res, next) {
    if (lifecycle.isShuttingDown) {
      return res.status(503).json({
        ok: false,
        error: 'Server is shutting down',
        retryAfter: 30,
        message: 'Please retry your request in a few moments'
      });
    }

    lifecycle.activeRequests++;
    let decremented = false;
    const decOnce = () => {
      if (decremented) return;
      decremented = true;
      lifecycle.activeRequests = Math.max(0, lifecycle.activeRequests - 1);
    };
    res.once('finish', decOnce);
    res.once('close', decOnce);
    next();
  };
}
