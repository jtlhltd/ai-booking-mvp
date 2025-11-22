// lib/idempotency.js
// Enhanced request deduplication

import { query } from '../db.js';
import crypto from 'crypto';

/**
 * Generate idempotency key from request
 */
export function generateIdempotencyKey(clientKey, operation, requestBody) {
  const bodyHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(requestBody))
    .digest('hex')
    .substring(0, 16);
  
  return `${clientKey}:${operation}:${bodyHash}`;
}

/**
 * Check if request is duplicate
 */
export async function checkIdempotency(clientKey, operation, key, windowMs = 60000) {
  try {
    const result = await query(`
      SELECT * FROM idempotency
      WHERE client_key = $1 
        AND key = $2
        AND created_at > NOW() - INTERVAL '${windowMs} milliseconds'
      ORDER BY created_at DESC
      LIMIT 1
    `, [clientKey, key]);
    
    if (result.rows.length > 0) {
      const original = result.rows[0];
      const timeSince = Date.now() - new Date(original.created_at).getTime();
      
      return {
        isDuplicate: true,
        originalRequest: original,
        timeSinceOriginal: timeSince,
        message: `Duplicate request detected. Original request was ${Math.round(timeSince / 1000)}s ago.`
      };
    }
    
    return { isDuplicate: false };
  } catch (error) {
    console.error('[IDEMPOTENCY ERROR] Failed to check:', error);
    // Don't block on idempotency check failures
    return { isDuplicate: false, error: error.message };
  }
}

/**
 * Record idempotency key
 */
export async function recordIdempotency(clientKey, operation, key, response = null) {
  try {
    await query(`
      INSERT INTO idempotency (client_key, key, created_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (client_key, key) DO UPDATE SET created_at = NOW()
    `, [clientKey, key]);
    
    return { success: true };
  } catch (error) {
    console.error('[IDEMPOTENCY ERROR] Failed to record:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Middleware for idempotency checking
 */
export function idempotencyMiddleware(operation, windowMs = 60000) {
  return async (req, res, next) => {
    try {
      const clientKey = req.clientKey || req.tenantKey || 'default';
      const idemKey = generateIdempotencyKey(clientKey, operation, req.body);
      
      // Check for duplicate
      const duplicateCheck = await checkIdempotency(clientKey, operation, idemKey, windowMs);
      
      if (duplicateCheck.isDuplicate) {
        return res.status(409).json({
          error: 'Duplicate request',
          message: duplicateCheck.message,
          timeSinceOriginal: duplicateCheck.timeSinceOriginal
        });
      }
      
      // Store idempotency key in request for later recording
      req.idempotencyKey = idemKey;
      req.idempotencyOperation = operation;
      
      next();
    } catch (error) {
      console.error('[IDEMPOTENCY MIDDLEWARE ERROR]', error);
      // Continue on error (don't block requests)
      next();
    }
  };
}

/**
 * Operation-specific windows
 */
export const IDEMPOTENCY_WINDOWS = {
  booking: 5 * 60 * 1000,      // 5 minutes
  sms: 60 * 1000,              // 1 minute
  lead_import: 30 * 1000,      // 30 seconds
  vapi_call: 2 * 60 * 1000,    // 2 minutes
  reminder: 60 * 1000,          // 1 minute
  default: 60 * 1000           // 1 minute
};

