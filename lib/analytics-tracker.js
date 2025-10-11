// lib/analytics-tracker.js
// Call outcome tracking, conversion metrics, and ROI analytics

import { query } from '../db.js';

/**
 * Track call outcome
 * @param {Object} callData - Call data from Vapi
 * @returns {Promise<Object>} - Tracking result
 */
export async function trackCallOutcome(callData) {
  try {
    const {
      callId,
      clientKey,
      leadPhone,
      outcome, // booked, not_interested, no_answer, voicemail, callback_requested
      duration,
      cost,
      appointmentBooked = false,
      appointmentTime = null,
      transcript = null,
      sentiment = null
    } = callData;
    
    await query(`
      INSERT INTO call_analytics (
        call_id,
        client_key,
        lead_phone,
        outcome,
        duration_seconds,
        cost,
        appointment_booked,
        appointment_time,
        transcript,
        sentiment,
        tracked_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (call_id) 
      DO UPDATE SET 
        outcome = $4,
        duration_seconds = $5,
        cost = $6,
        appointment_booked = $7,
        appointment_time = $8,
        transcript = $9,
        sentiment = $10,
        updated_at = NOW()
    `, [
      callId,
      clientKey,
      leadPhone,
      outcome,
      duration,
      cost,
      appointmentBooked,
      appointmentTime,
      transcript,
      sentiment
    ]);
    
    console.log(`[ANALYTICS] Tracked call ${callId}: ${outcome}`);
    
    return { success: true, callId };
    
  } catch (error) {
    console.error('[ANALYTICS] Error tracking call:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get conversion metrics for a client
 * @param {string} clientKey - Client identifier
 * @param {Object} options - Filter options
 * @returns {Promise<Object>} - Metrics
 */
export async function getConversionMetrics(clientKey, options = {}) {
  const {
    startDate = null,
    endDate = null,
    days = 30
  } = options;
  
  try {
    let dateFilter = '';
    let params = [clientKey];
    
    if (startDate && endDate) {
      dateFilter = 'AND tracked_at BETWEEN $2 AND $3';
      params.push(startDate, endDate);
    } else {
      dateFilter = `AND tracked_at >= NOW() - INTERVAL '${days} days'`;
    }
    
    const metrics = await query(`
      SELECT 
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE appointment_booked = true) as appointments_booked,
        COUNT(*) FILTER (WHERE outcome = 'not_interested') as not_interested,
        COUNT(*) FILTER (WHERE outcome = 'no_answer') as no_answer,
        COUNT(*) FILTER (WHERE outcome = 'voicemail') as voicemail,
        COUNT(*) FILTER (WHERE outcome = 'callback_requested') as callback_requested,
        ROUND(AVG(duration_seconds), 0) as avg_duration_seconds,
        SUM(cost) as total_cost,
        ROUND(
          (COUNT(*) FILTER (WHERE appointment_booked = true)::numeric / NULLIF(COUNT(*), 0)::numeric) * 100, 
          2
        ) as conversion_rate_percent
      FROM call_analytics
      WHERE client_key = $1
      ${dateFilter}
    `, params);
    
    const result = metrics.rows[0] || {};
    
    // Calculate cost per appointment
    if (result.appointments_booked && result.appointments_booked > 0) {
      result.cost_per_appointment = (result.total_cost / result.appointments_booked).toFixed(2);
    } else {
      result.cost_per_appointment = 0;
    }
    
    // Calculate ROI (assuming average appointment value)
    const avgAppointmentValue = 500; // £500 - should be configurable per client
    if (result.appointments_booked) {
      const revenue = result.appointments_booked * avgAppointmentValue;
      const roi = ((revenue - result.total_cost) / result.total_cost * 100).toFixed(2);
      result.estimated_revenue = revenue;
      result.roi_percent = roi;
    }
    
    return {
      success: true,
      clientKey,
      period: days ? `Last ${days} days` : `${startDate} to ${endDate}`,
      metrics: result
    };
    
  } catch (error) {
    console.error('[ANALYTICS] Error getting conversion metrics:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get daily conversion trend
 * @param {string} clientKey - Client identifier
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Object>} - Trend data
 */
export async function getConversionTrend(clientKey, days = 30) {
  try {
    const trend = await query(`
      SELECT 
        DATE(tracked_at) as date,
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE appointment_booked = true) as appointments_booked,
        ROUND(
          (COUNT(*) FILTER (WHERE appointment_booked = true)::numeric / NULLIF(COUNT(*), 0)::numeric) * 100, 
          2
        ) as conversion_rate
      FROM call_analytics
      WHERE client_key = $1
      AND tracked_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(tracked_at)
      ORDER BY date DESC
    `, [clientKey]);
    
    return {
      success: true,
      clientKey,
      period: `Last ${days} days`,
      trend: trend.rows
    };
    
  } catch (error) {
    console.error('[ANALYTICS] Error getting conversion trend:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get outcome breakdown
 * @param {string} clientKey - Client identifier
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Object>} - Outcome breakdown
 */
export async function getOutcomeBreakdown(clientKey, days = 30) {
  try {
    const breakdown = await query(`
      SELECT 
        outcome,
        COUNT(*) as count,
        ROUND((COUNT(*)::numeric / SUM(COUNT(*)) OVER ()) * 100, 2) as percentage,
        ROUND(AVG(duration_seconds), 0) as avg_duration,
        SUM(cost) as total_cost
      FROM call_analytics
      WHERE client_key = $1
      AND tracked_at >= NOW() - INTERVAL '${days} days'
      GROUP BY outcome
      ORDER BY count DESC
    `, [clientKey]);
    
    return {
      success: true,
      clientKey,
      period: `Last ${days} days`,
      breakdown: breakdown.rows
    };
    
  } catch (error) {
    console.error('[ANALYTICS] Error getting outcome breakdown:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Generate weekly report for client
 * @param {string} clientKey - Client identifier
 * @returns {Promise<Object>} - Weekly report
 */
export async function generateWeeklyReport(clientKey) {
  try {
    const metrics = await getConversionMetrics(clientKey, { days: 7 });
    const trend = await getConversionTrend(clientKey, 7);
    const breakdown = await getOutcomeBreakdown(clientKey, 7);
    
    // Compare to previous week
    const previousWeekMetrics = await getConversionMetrics(clientKey, { days: 14 });
    
    const report = {
      clientKey,
      period: 'Last 7 days',
      generatedAt: new Date().toISOString(),
      summary: metrics.metrics,
      trend: trend.trend,
      outcomeBreakdown: breakdown.breakdown,
      weekOverWeekChange: {
        calls: metrics.metrics.total_calls - (previousWeekMetrics.metrics.total_calls / 2),
        appointments: metrics.metrics.appointments_booked - (previousWeekMetrics.metrics.appointments_booked / 2),
        conversionRate: (metrics.metrics.conversion_rate_percent - previousWeekMetrics.metrics.conversion_rate_percent).toFixed(2)
      }
    };
    
    return { success: true, report };
    
  } catch (error) {
    console.error('[ANALYTICS] Error generating weekly report:', error);
    return { success: false, error: error.message };
  }
}

export default {
  trackCallOutcome,
  getConversionMetrics,
  getConversionTrend,
  getOutcomeBreakdown,
  generateWeeklyReport
};

