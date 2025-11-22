// lib/error-monitoring.js
// Error monitoring, alerting, and Slack/Email notifications

import { query } from '../db.js';
import messagingService from './messaging-service.js';

// Error thresholds
const CRITICAL_ERROR_THRESHOLD = 10; // 10 errors in 5 minutes = critical
const ERROR_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// Recent errors cache for rate limiting alerts
const recentErrors = [];
const alertsSent = new Map();

/**
 * Log error to database
 * @param {Object} errorData - Error data
 * @returns {Promise<Object>} - Log result
 */
export async function logError(errorData) {
  try {
    const {
      errorType,
      errorMessage,
      stack,
      context = {},
      severity = 'error', // error, warning, critical
      service = 'server',
      userId = null
    } = errorData;
    
    const result = await query(`
      INSERT INTO error_logs (
        error_type,
        error_message,
        stack_trace,
        context,
        severity,
        service,
        user_id,
        logged_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id
    `, [
      errorType,
      errorMessage,
      stack,
      JSON.stringify(context),
      severity,
      service,
      userId
    ]);
    
    // Add to recent errors for threshold monitoring
    recentErrors.push({
      id: result.rows[0].id,
      errorType,
      severity,
      timestamp: Date.now()
    });
    
    // Clean up old errors from cache
    cleanupRecentErrors();
    
    // Check if we should alert (sendCriticalAlert already handles email alerts)
    await checkErrorThresholds(errorType, severity);
    
    return { success: true, errorId: result.rows[0].id };
    
  } catch (error) {
    // Fallback logging if database fails
    console.error('[ERROR MONITORING] Failed to log error:', error);
    console.error('[ORIGINAL ERROR]', errorData);
    return { success: false, error: error.message };
  }
}

/**
 * Check error thresholds and send alerts
 */
async function checkErrorThresholds(errorType, severity) {
  const now = Date.now();
  
  // Count recent errors
  const recentCount = recentErrors.filter(e => 
    (now - e.timestamp) < ERROR_WINDOW_MS
  ).length;
  
  // Critical threshold
  if (recentCount >= CRITICAL_ERROR_THRESHOLD) {
    const alertKey = `critical_threshold_${Math.floor(now / ERROR_WINDOW_MS)}`;
    
    if (!alertsSent.has(alertKey)) {
      await sendCriticalAlert({
        message: `🚨 CRITICAL: ${recentCount} errors in last 5 minutes`,
        errorType,
        count: recentCount
      });
      
      alertsSent.set(alertKey, now);
    }
  }
  
  // Individual critical errors
  if (severity === 'critical') {
    const alertKey = `critical_error_${errorType}_${Math.floor(now / 60000)}`; // Per minute
    
    if (!alertsSent.has(alertKey)) {
      await sendCriticalAlert({
        message: `🚨 CRITICAL ERROR: ${errorType}`,
        errorType,
        severity
      });
      
      alertsSent.set(alertKey, now);
    }
  }
}

/**
 * Send critical alert via Slack/Email
 */
async function sendCriticalAlert(alertData) {
  const { message, errorType, count, severity } = alertData;
  
  console.error('[CRITICAL ALERT]', message);
  
  // Send email to admin
  if (process.env.YOUR_EMAIL) {
    try {
      await messagingService.sendEmail({
        to: process.env.YOUR_EMAIL,
        subject: `🚨 Critical Alert: ${errorType || 'System Error'}`,
        body: `
Critical Alert
===============

Message: ${message}
Error Type: ${errorType || 'Unknown'}
Count: ${count || 1}
Severity: ${severity || 'critical'}
Time: ${new Date().toISOString()}

Please investigate immediately.

System: AI Booking MVP
Environment: ${process.env.NODE_ENV || 'production'}
        `.trim()
      });
      
      console.log('[ALERT] Critical alert email sent');
    } catch (error) {
      console.error('[ALERT] Failed to send email alert:', error);
    }
  }
  
  // Slack webhook integration
  if (process.env.SLACK_WEBHOOK_URL) {
    try {
      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🚨 ${message}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*${message}*\n\nError Type: \`${alertData.errorType || 'Unknown'}\`\nSeverity: \`${alertData.severity || 'critical'}\`\nTime: ${new Date().toISOString()}`
              }
            }
          ]
        })
      });
      console.log('[ALERT] Slack notification sent');
    } catch (slackError) {
      console.error('[ALERT] Failed to send Slack notification:', slackError.message);
    }
  }
}

/**
 * Clean up old errors from cache
 */
function cleanupRecentErrors() {
  const now = Date.now();
  const cutoff = now - ERROR_WINDOW_MS;
  
  // Remove errors older than window
  while (recentErrors.length > 0 && recentErrors[0].timestamp < cutoff) {
    recentErrors.shift();
  }
  
  // Also clean up old alert records
  for (const [key, timestamp] of alertsSent.entries()) {
    if (now - timestamp > ERROR_WINDOW_MS * 2) {
      alertsSent.delete(key);
    }
  }
}

/**
 * Get error statistics
 * @param {Object} options - Filter options
 * @returns {Promise<Object>} - Error stats
 */
export async function getErrorStats(options = {}) {
  const {
    days = 7,
    severity = null,
    service = null
  } = options;
  
  try {
    let filters = [`logged_at >= NOW() - INTERVAL '${days} days'`];
    let params = [];
    let paramCount = 1;
    
    if (severity) {
      filters.push(`severity = $${paramCount}`);
      params.push(severity);
      paramCount++;
    }
    
    if (service) {
      filters.push(`service = $${paramCount}`);
      params.push(service);
      paramCount++;
    }
    
    const stats = await query(`
      SELECT 
        COUNT(*) as total_errors,
        COUNT(*) FILTER (WHERE severity = 'critical') as critical_errors,
        COUNT(*) FILTER (WHERE severity = 'error') as errors,
        COUNT(*) FILTER (WHERE severity = 'warning') as warnings,
        COUNT(DISTINCT error_type) as unique_error_types,
        error_type,
        COUNT(*) as count
      FROM error_logs
      WHERE ${filters.join(' AND ')}
      GROUP BY error_type
      ORDER BY count DESC
      LIMIT 10
    `, params);
    
    const topErrors = await query(`
      SELECT 
        error_type,
        error_message,
        COUNT(*) as count,
        MAX(logged_at) as last_occurred
      FROM error_logs
      WHERE ${filters.join(' AND ')}
      GROUP BY error_type, error_message
      ORDER BY count DESC
      LIMIT 10
    `, params);
    
    return {
      success: true,
      period: `Last ${days} days`,
      summary: stats.rows[0] || {},
      topErrors: topErrors.rows
    };
    
  } catch (error) {
    console.error('[ERROR STATS] Error getting statistics:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Track Vapi call failures
 * @param {Object} failureData - Failure data
 * @returns {Promise<Object>} - Tracking result
 */
export async function trackVapiFailure(failureData) {
  const {
    callId,
    clientKey,
    leadPhone,
    failureReason,
    errorCode,
    attemptNumber = 1
  } = failureData;
  
  return await logError({
    errorType: 'vapi_call_failure',
    errorMessage: failureReason,
    context: {
      callId,
      clientKey,
      leadPhone,
      errorCode,
      attemptNumber
    },
    severity: attemptNumber >= 3 ? 'critical' : 'error',
    service: 'vapi'
  });
}

/**
 * Global error handler wrapper
 */
export function wrapWithErrorMonitoring(fn, context = {}) {
  return async function(...args) {
    try {
      return await fn(...args);
    } catch (error) {
      await logError({
        errorType: error.name || 'UnknownError',
        errorMessage: error.message,
        stack: error.stack,
        context: {
          ...context,
          functionName: fn.name,
          arguments: args.map(a => typeof a === 'object' ? '[Object]' : String(a))
        },
        severity: 'error'
      });
      
      throw error; // Re-throw after logging
    }
  };
}

export default {
  logError,
  getErrorStats,
  trackVapiFailure,
  wrapWithErrorMonitoring
};

