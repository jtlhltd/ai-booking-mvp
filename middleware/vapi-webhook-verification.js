// middleware/vapi-webhook-verification.js
// VAPI webhook signature verification middleware

import crypto from 'crypto';

/**
 * Verify VAPI webhook signature
 * VAPI sends webhooks with X-Vapi-Signature header containing HMAC-SHA256 signature
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export function verifyVapiSignature(req, res, next) {
  const isProd = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
  const isTest = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'test' || String(process.env.JEST_WORKER_ID || '').trim() !== '';
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  const secretHeader = req.get('X-Vapi-Secret') || req.get('x-vapi-secret');
  const requireExplicit =
    String(process.env.VAPI_WEBHOOK_REQUIRE_SIGNATURE || '').trim() !== ''
      ? !['0', 'false', 'no'].includes(String(process.env.VAPI_WEBHOOK_REQUIRE_SIGNATURE).trim().toLowerCase())
      : false;
  // Only enforce verification when we actually have a secret configured,
  // or when the operator explicitly requires it via env.
  const requireVerification = requireExplicit || !!secret;
  
  // If no secret is configured, skip verification (for development/testing).
  // In production, fail closed to avoid accepting spoofed webhooks.
  if (!secret) {
    if (isProd) {
      console.error('[VAPI WEBHOOK] Missing VAPI_WEBHOOK_SECRET in production; refusing to accept unsigned webhooks');
      return res.status(500).json({
        ok: false,
        error: 'Webhook verification misconfigured',
        message: 'Set VAPI_WEBHOOK_SECRET to accept VAPI webhooks'
      });
    }
    if (requireExplicit) {
      console.error('[VAPI WEBHOOK] Missing VAPI_WEBHOOK_SECRET but signature verification is explicitly required');
      return res.status(500).json({
        ok: false,
        error: 'Webhook verification misconfigured',
        message: 'Set VAPI_WEBHOOK_SECRET (or disable VAPI_WEBHOOK_REQUIRE_SIGNATURE) to accept VAPI webhooks'
      });
    }
    // In test/dev we frequently run without webhook secrets; keep logs clean.
    if (!isTest) console.warn('[VAPI WEBHOOK] No VAPI_WEBHOOK_SECRET configured — accepting webhooks without verification');
    return next();
  }
  
  const signature = req.get('X-Vapi-Signature') || req.get('x-vapi-signature');
  
  // Mode 1: shared-secret header (credential-based). This is the easiest to enable in Vapi.
  if (!signature && secretHeader) {
    try {
      const a = Buffer.from(String(secretHeader));
      const b = Buffer.from(String(secret));
      const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
      if (!ok) {
        console.error('[VAPI WEBHOOK] Invalid X-Vapi-Secret header', {
          correlationId: req.correlationId || req.id
        });
        return res.status(401).json({
          ok: false,
          error: 'Invalid webhook secret',
          message: 'Webhook secret verification failed'
        });
      }
      return next();
    } catch (e) {
      console.error('[VAPI WEBHOOK] Secret header verification error', {
        message: e?.message || String(e),
        correlationId: req.correlationId || req.id
      });
      return res.status(401).json({
        ok: false,
        error: 'Invalid webhook secret',
        message: 'Webhook secret verification failed'
      });
    }
  }

  // Mode 2: HMAC signature (x-vapi-signature).
  if (!signature) {
    console.error('[VAPI WEBHOOK] Missing X-Vapi-Signature header');
    return res.status(401).json({
      ok: false,
      error: 'Missing webhook signature',
      message: 'X-Vapi-Signature header is required'
    });
  }
  
  // Get raw body for signature verification (must match provider bytes; JSON.stringify is not stable).
  let bodyString;
  if (Buffer.isBuffer(req.rawBody) && req.rawBody.length > 0) {
    bodyString = req.rawBody.toString('utf8');
  } else if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    bodyString = req.body.toString('utf8');
  } else if (isProd) {
    console.error('[VAPI WEBHOOK] Missing raw body for signature verification in production');
    return res.status(500).json({
      ok: false,
      error: 'Webhook verification misconfigured',
      message: 'Raw request body was not captured; cannot verify Vapi signature'
    });
  } else {
    bodyString = JSON.stringify(req.body ?? {});
  }
  
  // Compute expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(bodyString)
    .digest('hex');
  
  // Use constant-time comparison to prevent timing attacks
  let isValid = false;
  try {
    isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    isValid = false;
  }
  
  if (!isValid) {
    console.error('[VAPI WEBHOOK] Invalid signature', {
      received: signature.substring(0, 10) + '...',
      expected: expectedSignature.substring(0, 10) + '...',
      correlationId: req.correlationId || req.id
    });
    
    return res.status(401).json({
      ok: false,
      error: 'Invalid webhook signature',
      message: 'Webhook signature verification failed'
    });
  }
  
  console.log('[VAPI WEBHOOK] Signature verified successfully', {
    correlationId: req.correlationId || req.id
  });
  
  next();
}

