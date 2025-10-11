// lib/security.js
// Enhanced security: Twilio verification, audit logging, per-client rate limiting

import { createHmac } from 'crypto';
import { query } from '../db.js';
import twilio from 'twilio';

/**
 * Verify Twilio webhook signature
 * @param {Object} req - Express request
 * @param {string} authToken - Twilio auth token
 * @returns {boolean} - True if valid
 */
export function verifyTwilioSignature(req, authToken) {
  const signature = req.headers['x-twilio-signature'];
  
  if (!signature) {
    console.error('[SECURITY] Missing Twilio signature');
    return false;
  }
  
  // Construct full URL
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['host'];
  const url = `${protocol}://${host}${req.originalUrl}`;
  
  // Validate signature
  const isValid = twilio.validateRequest(
    authToken,
    signature,
    url,
    req.body
  );
  
  if (!isValid) {
    console.error('[SECURITY] Invalid Twilio signature', {
      url,
      signatureReceived: signature.substring(0, 10) + '...'
    });
  }
  
  return isValid;
}

/**
 * Middleware to verify Twilio webhooks
 */
export function twilioWebhookVerification(req, res, next) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  
  if (!authToken) {
    console.warn('[SECURITY] TWILIO_AUTH_TOKEN not configured - skipping signature verification');
    return next();
  }
  
  if (!verifyTwilioSignature(req, authToken)) {
    console.error('[SECURITY] Twilio webhook verification failed', {
      path: req.path,
      method: req.method,
      ip: req.ip
    });
    return res.status(403).json({ error: 'Forbidden: Invalid signature' });
  }
  
  console.log('[SECURITY] ✅ Twilio signature verified for', req.path);
  next();
}

/**
 * Create Twilio webhook verification middleware with urlencoded parser
 */
export function createTwilioWebhook() {
  const express = require('express');
  return [
    express.urlencoded({ extended: false }),
    twilioWebhookVerification
  ];
}

/**
 * Log audit event
 * @param {Object} auditData - Audit data
 * @returns {Promise<Object>} - Log result
 */
export async function logAudit(auditData) {
  const {
    clientKey,
    action,
    details = {},
    userId = null,
    ipAddress = null,
    userAgent = null,
    result = 'success',
    errorMessage = null
  } = auditData;
  
  try {
    await query(`
      INSERT INTO audit_logs (
        client_key,
        action,
        details,
        user_id,
        ip_address,
        user_agent,
        result,
        error_message,
        logged_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    `, [
      clientKey,
      action,
      JSON.stringify(details),
      userId,
      ipAddress,
      userAgent,
      result,
      errorMessage
    ]);
    
    return { success: true };
    
  } catch (error) {
    console.error('[AUDIT] Error logging audit event:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Middleware for audit logging
 */
export function auditMiddleware(action) {
  return async (req, res, next) => {
    // Store original send function
    const originalSend = res.send;
    
    // Override send to capture response
    res.send = function(data) {
      const clientKey = req.get('X-Client-Key') || req.params.clientKey || null;
      
      // Log audit event
      logAudit({
        clientKey,
        action,
        details: {
          method: req.method,
          path: req.path,
          body: req.body,
          query: req.query,
          params: req.params
        },
        userId: req.user?.id || null,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent'),
        result: res.statusCode < 400 ? 'success' : 'error'
      }).catch(err => console.error('[AUDIT] Failed to log:', err));
      
      // Call original send
      return originalSend.call(this, data);
    };
    
    next();
  };
}

/**
 * Per-client rate limiter
 * Returns different limits based on client tier
 */
export async function getClientRateLimit(clientKey) {
  if (!clientKey) {
    return { windowMs: 60000, max: 60 }; // Default: 60 per minute
  }
  
  try {
    // Get client from database
    const { getFullClient } = await import('../db.js');
    const client = await getFullClient(clientKey);
    
    if (!client) {
      return { windowMs: 60000, max: 60 };
    }
    
    // Rate limits by tier
    const tierLimits = {
      free: 60,        // 60 requests per minute
      starter: 120,    // 120 requests per minute
      pro: 300,        // 300 requests per minute
      enterprise: 1000 // 1000 requests per minute
    };
    
    const tier = client.tier || 'free';
    const max = tierLimits[tier] || 60;
    
    return {
      windowMs: 60000,
      max,
      tier
    };
    
  } catch (error) {
    console.error('[RATE LIMIT] Error getting client limits:', error);
    return { windowMs: 60000, max: 60 };
  }
}

/**
 * Create per-client rate limiter middleware
 */
export function createClientRateLimiter() {
  const clientBuckets = new Map();
  
  return async (req, res, next) => {
    const clientKey = req.get('X-Client-Key');
    
    if (!clientKey) {
      return next(); // Skip if no client key
    }
    
    const limits = await getClientRateLimit(clientKey);
    const now = Date.now();
    
    // Get or create bucket for client
    if (!clientBuckets.has(clientKey)) {
      clientBuckets.set(clientKey, {
        requests: [],
        windowStart: now
      });
    }
    
    const bucket = clientBuckets.get(clientKey);
    
    // Reset bucket if window expired
    if (now - bucket.windowStart > limits.windowMs) {
      bucket.requests = [];
      bucket.windowStart = now;
    }
    
    // Remove old requests outside window
    bucket.requests = bucket.requests.filter(time => now - time < limits.windowMs);
    
    // Check if limit exceeded
    if (bucket.requests.length >= limits.max) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        limit: limits.max,
        windowMs: limits.windowMs,
        tier: limits.tier,
        retryAfter: Math.ceil((bucket.windowStart + limits.windowMs - now) / 1000)
      });
    }
    
    // Add current request
    bucket.requests.push(now);
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', limits.max);
    res.setHeader('X-RateLimit-Remaining', limits.max - bucket.requests.length);
    res.setHeader('X-RateLimit-Reset', new Date(bucket.windowStart + limits.windowMs).toISOString());
    
    next();
  };
}

/**
 * GDPR data export for client
 * @param {string} clientKey - Client identifier
 * @returns {Promise<Object>} - Client data export
 */
export async function exportClientData(clientKey) {
  try {
    // Export all client data
    const [leads, appointments, calls, analytics, messages] = await Promise.all([
      query('SELECT * FROM leads WHERE client_key = $1', [clientKey]),
      query('SELECT * FROM appointments WHERE client_key = $1', [clientKey]),
      query('SELECT * FROM calls WHERE client_key = $1', [clientKey]),
      query('SELECT * FROM call_analytics WHERE client_key = $1', [clientKey]),
      query('SELECT * FROM messages WHERE client_key = $1', [clientKey])
    ]);
    
    return {
      success: true,
      exportedAt: new Date().toISOString(),
      clientKey,
      data: {
        leads: leads.rows,
        appointments: appointments.rows,
        calls: calls.rows,
        analytics: analytics.rows,
        messages: messages.rows
      }
    };
    
  } catch (error) {
    console.error('[GDPR] Error exporting client data:', error);
    return { success: false, error: error.message };
  }
}

/**
 * GDPR data deletion for client
 * @param {string} clientKey - Client identifier
 * @param {boolean} hardDelete - If true, permanently delete; if false, anonymize
 * @returns {Promise<Object>} - Deletion result
 */
export async function deleteClientData(clientKey, hardDelete = false) {
  try {
    if (hardDelete) {
      // Permanent deletion
      await Promise.all([
        query('DELETE FROM leads WHERE client_key = $1', [clientKey]),
        query('DELETE FROM appointments WHERE client_key = $1', [clientKey]),
        query('DELETE FROM calls WHERE client_key = $1', [clientKey]),
        query('DELETE FROM call_analytics WHERE client_key = $1', [clientKey]),
        query('DELETE FROM messages WHERE client_key = $1', [clientKey]),
        query('DELETE FROM audit_logs WHERE client_key = $1', [clientKey])
      ]);
      
      console.log(`[GDPR] Hard deleted all data for ${clientKey}`);
      
      return {
        success: true,
        method: 'hard_delete',
        deletedAt: new Date().toISOString()
      };
      
    } else {
      // Anonymization (soft delete)
      await Promise.all([
        query(`
          UPDATE leads 
          SET name = 'DELETED', email = NULL, phone = 'DELETED', notes = NULL
          WHERE client_key = $1
        `, [clientKey]),
        query(`
          UPDATE appointments 
          SET notes = NULL
          WHERE client_key = $1
        `, [clientKey]),
        query(`
          UPDATE messages 
          SET body = 'DELETED'
          WHERE client_key = $1
        `, [clientKey])
      ]);
      
      console.log(`[GDPR] Anonymized data for ${clientKey}`);
      
      return {
        success: true,
        method: 'anonymization',
        anonymizedAt: new Date().toISOString()
      };
    }
    
  } catch (error) {
    console.error('[GDPR] Error deleting client data:', error);
    return { success: false, error: error.message };
  }
}

export default {
  verifyTwilioSignature,
  twilioWebhookVerification,
  logAudit,
  auditMiddleware,
  getClientRateLimit,
  createClientRateLimiter,
  exportClientData,
  deleteClientData
};

