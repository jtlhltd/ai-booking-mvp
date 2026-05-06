import { vapiWebhookVerboseLog } from '../vapi-webhook-verbose-log.js';

/**
 * Preserves raw body for Vapi HMAC verification (works with express.json verify rawBody).
 */
export function createVapiRawBodyMiddleware() {
  return (req, res, next) => {
    if (Buffer.isBuffer(req.rawBody) && req.rawBody.length > 0) {
      if (typeof req.body !== 'object' || req.body === null || Buffer.isBuffer(req.body)) {
        try {
          const s = req.rawBody.toString('utf8');
          req.body = s ? JSON.parse(s) : {};
        } catch (e) {
          console.error('[VAPI WEBHOOK MIDDLEWARE] JSON parse error:', e.message);
          req.body = {};
        }
      }
      vapiWebhookVerboseLog('[VAPI WEBHOOK MIDDLEWARE] Using captured rawBody. Keys:', Object.keys(req.body || {}));
      return next();
    }
    if (typeof req.body === 'object' && req.body !== null && !Buffer.isBuffer(req.body)) {
      req.rawBody = Buffer.from(JSON.stringify(req.body), 'utf8');
      vapiWebhookVerboseLog('[VAPI WEBHOOK MIDDLEWARE] Body already parsed, using directly. Keys:', Object.keys(req.body || {}));
    } else if (Buffer.isBuffer(req.body)) {
      req.rawBody = req.body;
      try {
        const bodyString = req.body.toString('utf8');
        if (bodyString && bodyString.length > 0) {
          req.body = JSON.parse(bodyString);
        } else {
          console.error('[VAPI WEBHOOK MIDDLEWARE] Empty body string from Buffer');
          req.body = {};
        }
      } catch (e) {
        console.error('[VAPI WEBHOOK MIDDLEWARE] JSON parse error:', e.message);
        req.body = {};
      }
    } else {
      console.error('[VAPI WEBHOOK MIDDLEWARE] Unexpected body type:', typeof req.body, 'Value:', req.body);
      req.rawBody = Buffer.alloc(0);
      req.body = req.body || {};
    }
    next();
  };
}
