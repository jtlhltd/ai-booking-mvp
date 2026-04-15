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
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  const requireExplicit =
    String(process.env.VAPI_WEBHOOK_REQUIRE_SIGNATURE || '').trim() !== ''
      ? !['0', 'false', 'no'].includes(String(process.env.VAPI_WEBHOOK_REQUIRE_SIGNATURE).trim().toLowerCase())
      : false;
  // Only enforce signature verification when we actually have a secret configured,
  // or when the operator explicitly requires it via env.
  const requireSignature = requireExplicit || !!secret;
  
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
    console.error('[VAPI WEBHOOK] No VAPI_WEBHOOK_SECRET configured — accepting webhooks without verification');
    return next();
  }
  
  const signature = req.get('X-Vapi-Signature') || req.get('x-vapi-signature');
  
  if (!signature) {
    console.error('[VAPI WEBHOOK] Missing X-Vapi-Signature header');
    return res.status(401).json({
      ok: false,
      error: 'Missing webhook signature',
      message: 'X-Vapi-Signature header is required'
    });
  }
  
  // Get raw body for signature verification
  // Note: This requires express.raw() or express.json() to preserve raw body
  let bodyString;
  if (req.rawBody) {
    bodyString = req.rawBody.toString();
  } else if (Buffer.isBuffer(req.body)) {
    bodyString = req.body.toString();
  } else {
    // Fallback: stringify JSON body
    bodyString = JSON.stringify(req.body);
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

