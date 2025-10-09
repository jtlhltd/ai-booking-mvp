// lib/quality-monitoring.js
// Automated quality monitoring system for call quality

import { getCallQualityMetrics, listFullClients, storeQualityAlert } from '../db.js';
import { sendQualityAlert } from './email-alerts.js';

// Quality thresholds - adjust these based on industry standards
export const QUALITY_THRESHOLDS = {
  call_success_rate: 0.70, // 70% of calls should connect
  booking_rate: 0.10, // 10% should result in bookings
  avg_quality_score: 6.0, // Average score should be 6+
  avg_call_duration: 120, // At least 2 minutes average
  positive_sentiment_ratio: 0.40 // 40% should be positive
};

/**
 * Monitor call quality for a single client
 * @param {string} clientKey - Client identifier
 * @returns {Object} - Monitoring results with alerts
 */
export async function monitorCallQuality(clientKey) {
  console.log(`[QUALITY MONITOR] Checking quality for ${clientKey}...`);
  
  try {
    const metrics = await getCallQualityMetrics(clientKey, 1); // Last 24 hours
    
    if (!metrics || parseInt(metrics.total_calls) === 0) {
      console.log(`[QUALITY MONITOR] No calls in last 24 hours for ${clientKey}`);
      return { alerts: [], metrics: null, healthy: true };
    }
    
    const totalCalls = parseInt(metrics.total_calls);
    const successfulCalls = parseInt(metrics.successful_calls);
    const bookings = parseInt(metrics.bookings);
    const positiveSentiment = parseInt(metrics.positive_sentiment_count);
    
    // Calculate rates
    const rates = {
      success_rate: successfulCalls / totalCalls,
      booking_rate: bookings / totalCalls,
      positive_sentiment_ratio: positiveSentiment / totalCalls,
      avg_quality_score: parseFloat(metrics.avg_quality_score || 0),
      avg_duration: parseInt(metrics.avg_duration || 0)
    };
    
    console.log(`[QUALITY MONITOR] ${clientKey} rates:`, {
      success_rate: (rates.success_rate * 100).toFixed(1) + '%',
      booking_rate: (rates.booking_rate * 100).toFixed(1) + '%',
      avg_quality_score: rates.avg_quality_score.toFixed(1),
      total_calls: totalCalls
    });
    
    // Check thresholds and generate alerts
    const alerts = [];
    
    // Alert: Low success rate
    if (rates.success_rate < QUALITY_THRESHOLDS.call_success_rate) {
      alerts.push({
        severity: 'high',
        type: 'low_success_rate',
        metric: 'success_rate',
        actual: (rates.success_rate * 100).toFixed(1) + '%',
        expected: (QUALITY_THRESHOLDS.call_success_rate * 100) + '%',
        message: `Call success rate dropped to ${(rates.success_rate * 100).toFixed(1)}% (expected ${(QUALITY_THRESHOLDS.call_success_rate * 100)}%)`,
        action: 'Check Vapi assistant configuration and phone number validity',
        impact: 'Fewer prospects are being reached effectively'
      });
    }
    
    // Alert: Low booking rate
    if (rates.booking_rate < QUALITY_THRESHOLDS.booking_rate && totalCalls >= 10) {
      alerts.push({
        severity: 'medium',
        type: 'low_booking_rate',
        metric: 'booking_rate',
        actual: (rates.booking_rate * 100).toFixed(1) + '%',
        expected: (QUALITY_THRESHOLDS.booking_rate * 100) + '%',
        message: `Booking rate is ${(rates.booking_rate * 100).toFixed(1)}% (expected ${(QUALITY_THRESHOLDS.booking_rate * 100)}%)`,
        action: 'Review call transcripts and improve scripts',
        impact: 'Lower conversion rate to actual bookings'
      });
    }
    
    // Alert: Low quality scores
    if (rates.avg_quality_score < QUALITY_THRESHOLDS.avg_quality_score) {
      alerts.push({
        severity: 'medium',
        type: 'low_quality_score',
        metric: 'avg_quality_score',
        actual: rates.avg_quality_score.toFixed(1) + '/10',
        expected: QUALITY_THRESHOLDS.avg_quality_score + '/10',
        message: `Average call quality is ${rates.avg_quality_score.toFixed(1)}/10 (expected ${QUALITY_THRESHOLDS.avg_quality_score})`,
        action: 'Analyze low-quality calls and optimize Vapi prompts',
        impact: 'Poor call experience for prospects'
      });
    }
    
    // Alert: Short call duration
    if (rates.avg_duration < QUALITY_THRESHOLDS.avg_call_duration && totalCalls >= 5) {
      alerts.push({
        severity: 'low',
        type: 'short_duration',
        metric: 'avg_duration',
        actual: Math.round(rates.avg_duration) + 's',
        expected: QUALITY_THRESHOLDS.avg_call_duration + 's',
        message: `Average call duration is ${Math.round(rates.avg_duration)}s (expected ${QUALITY_THRESHOLDS.avg_call_duration}s)`,
        action: 'Improve engagement by asking open-ended questions',
        impact: 'Prospects hanging up too quickly'
      });
    }
    
    // Alert: Negative sentiment
    if (rates.positive_sentiment_ratio < QUALITY_THRESHOLDS.positive_sentiment_ratio && totalCalls >= 10) {
      alerts.push({
        severity: 'medium',
        type: 'negative_sentiment',
        metric: 'positive_sentiment_ratio',
        actual: (rates.positive_sentiment_ratio * 100).toFixed(1) + '%',
        expected: (QUALITY_THRESHOLDS.positive_sentiment_ratio * 100) + '%',
        message: `Only ${(rates.positive_sentiment_ratio * 100).toFixed(1)}% of calls have positive sentiment (expected ${(QUALITY_THRESHOLDS.positive_sentiment_ratio * 100)}%)`,
        action: 'Review negative calls and adjust tone/approach',
        impact: 'Prospects are frustrated or uninterested'
      });
    }
    
    if (alerts.length > 0) {
      console.log(`[QUALITY MONITOR] ⚠️  ${alerts.length} alerts for ${clientKey}:`, alerts.map(a => a.type));
    } else {
      console.log(`[QUALITY MONITOR] ✅ All metrics healthy for ${clientKey}`);
    }
    
    return {
      clientKey,
      timestamp: new Date().toISOString(),
      metrics: {
        total_calls: totalCalls,
        ...rates
      },
      alerts,
      healthy: alerts.length === 0
    };
    
  } catch (error) {
    console.error(`[QUALITY MONITOR ERROR] ${clientKey}:`, error);
    return {
      clientKey,
      error: error.message,
      alerts: [{
        severity: 'high',
        type: 'monitoring_error',
        message: `Failed to monitor quality: ${error.message}`,
        action: 'Check logs and database connection',
        impact: 'Unable to track call quality'
      }],
      healthy: false
    };
  }
}

/**
 * Monitor all active clients
 * @returns {Array} - Array of monitoring results
 */
export async function monitorAllClients() {
  console.log('[QUALITY MONITOR] 🔄 Starting quality check for all clients...');
  
  try {
    const clients = await listFullClients();
    const activeClients = clients.filter(c => c.is_enabled !== false);
    
    console.log(`[QUALITY MONITOR] Found ${activeClients.length} active clients to monitor`);
    
    const results = [];
    
    for (const client of activeClients) {
      const result = await monitorCallQuality(client.client_key || client.clientKey);
      results.push(result);
      
      // If there are alerts, store them
      if (result.alerts && result.alerts.length > 0) {
        await handleQualityAlerts(client, result.alerts, result.metrics);
      }
    }
    
    const clientsWithIssues = results.filter(r => r.alerts && r.alerts.length > 0).length;
    
    console.log(`[QUALITY MONITOR] ✅ Completed. Checked ${results.length} clients, found ${clientsWithIssues} with quality issues.`);
    
    return results;
  } catch (error) {
    console.error('[QUALITY MONITOR] ❌ Failed to monitor clients:', error);
    return [];
  }
}

/**
 * Handle quality alerts for a client
 * @param {Object} client - Client object
 * @param {Array} alerts - Array of alert objects
 * @param {Object} metrics - Quality metrics
 */
async function handleQualityAlerts(client, alerts, metrics) {
  try {
    console.log(`[QUALITY ALERTS] Handling ${alerts.length} alerts for ${client.displayName || client.client_key}`);
    
    // Store alerts in database
    for (const alert of alerts) {
      await storeQualityAlert({
        clientKey: client.client_key || client.clientKey,
        alertType: alert.type,
        severity: alert.severity,
        metric: alert.metric,
        actualValue: alert.actual,
        expectedValue: alert.expected,
        message: alert.message,
        action: alert.action,
        impact: alert.impact,
        metadata: { ...metrics, timestamp: new Date().toISOString() }
      });
      
      console.log(`[QUALITY ALERT STORED] ${client.client_key}: ${alert.type} (${alert.severity})`);
    }
    
    // Send email notifications for high/medium severity alerts
    const importantAlerts = alerts.filter(a => ['high', 'medium'].includes(a.severity));
    if (importantAlerts.length > 0) {
      console.log(`[QUALITY ALERTS] Sending email notification for ${importantAlerts.length} important alerts to ${client.displayName}`);
      const emailSent = await sendQualityAlert(client, importantAlerts, metrics);
      if (emailSent) {
        console.log(`[QUALITY ALERTS] ✅ Email sent successfully`);
      } else {
        console.log(`[QUALITY ALERTS] ⚠️  Email not configured or failed to send`);
      }
    }
    
  } catch (error) {
    console.error(`[QUALITY ALERTS ERROR] ${client.client_key}:`, error);
  }
}

