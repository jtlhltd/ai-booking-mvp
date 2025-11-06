// lib/roi-calculator.js
// ROI calculation and financial tracking for clients

import { getCallsByTenant, getFullClient, query } from '../db.js';

/**
 * Calculate comprehensive ROI for a client
 * @param {string} clientKey - Client identifier
 * @param {number} days - Number of days to analyze
 * @param {Object} options - Calculation options
 * @returns {Object} - ROI data
 */
export async function calculateROI(clientKey, days = 30, options = {}) {
  const {
    avgDealValue = 150, // Default average booking value
    callCost = 0.12, // Vapi cost per minute
    smsCost = 0.0075, // Twilio SMS cost
    avgCallDuration = 2.5 // Average call duration in minutes
  } = options;
  
  try {
    console.log(`[ROI CALCULATOR] Calculating ROI for ${clientKey} (last ${days} days)...`);
    
    // Get client data
    const client = await getFullClient(clientKey);
    if (!client) {
      throw new Error('Client not found');
    }
    
    // Get all calls in period
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    
    const calls = await getCallsByTenant(clientKey, 10000); // Get all calls
    const periodCalls = calls.filter(c => new Date(c.created_at) >= sinceDate);
    
    // Calculate costs
    const totalCalls = periodCalls.length;
    const totalCallMinutes = periodCalls.reduce((sum, c) => sum + (c.duration || avgCallDuration * 60), 0) / 60;
    const callCosts = totalCallMinutes * callCost;
    
    // Estimate SMS costs (assuming 3 SMS per lead on average)
    const estimatedSMS = totalCalls * 3;
    const smsCosts = estimatedSMS * smsCost;
    
    // Phone validation costs (if enabled)
    const validationCosts = totalCalls * 0.005; // $0.005 per validation
    
    // Total costs
    const totalCosts = callCosts + smsCosts + validationCosts;
    
    // Get actual appointments from database (more accurate than call outcomes)
    const appointmentsResult = await query(`
      SELECT COUNT(*) as count, 
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count
      FROM appointments
      WHERE client_key = $1
      AND created_at >= $2
    `, [clientKey, sinceDate.toISOString()]);
    
    const actualBookings = parseInt(appointmentsResult.rows[0]?.count || 0);
    const completedAppointments = parseInt(appointmentsResult.rows[0]?.completed_count || 0);
    
    // Also count from calls for comparison
    const callBookings = periodCalls.filter(c => c.outcome === 'booked' || c.outcome === 'booking').length;
    const bookings = Math.max(actualBookings, callBookings); // Use the higher number
    
    // Calculate revenue (using client's avg deal value or default)
    const clientAvgDealValue = client.avgDealValue || client.avg_deal_value || avgDealValue;
    const totalRevenue = bookings * clientAvgDealValue;
    const completedRevenue = completedAppointments * clientAvgDealValue;
    
    // Calculate ROI
    const profit = totalRevenue - totalCosts;
    const roiMultiplier = totalCosts > 0 ? (totalRevenue / totalCosts) : 0;
    const roiPercentage = totalCosts > 0 ? ((profit / totalCosts) * 100) : 0;
    
    // Calculate conversion metrics
    const conversionRate = totalCalls > 0 ? (bookings / totalCalls) : 0;
    const costPerBooking = bookings > 0 ? (totalCosts / bookings) : 0;
    const revenuePerCall = totalCalls > 0 ? (totalRevenue / totalCalls) : 0;
    
    // Week-over-week comparison (if enough data)
    let weeklyTrend = null;
    if (days >= 14) {
      const lastWeekCalls = periodCalls.filter(c => {
        const callDate = new Date(c.created_at);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return callDate >= weekAgo;
      });
      
      const previousWeekCalls = periodCalls.filter(c => {
        const callDate = new Date(c.created_at);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
        return callDate >= twoWeeksAgo && callDate < weekAgo;
      });
      
      const lastWeekBookings = lastWeekCalls.filter(c => c.outcome === 'booked').length;
      const previousWeekBookings = previousWeekCalls.filter(c => c.outcome === 'booked').length;
      
      if (previousWeekBookings > 0) {
        const bookingChange = ((lastWeekBookings - previousWeekBookings) / previousWeekBookings) * 100;
        weeklyTrend = {
          lastWeek: lastWeekBookings,
          previousWeek: previousWeekBookings,
          change: bookingChange,
          direction: bookingChange > 0 ? 'up' : bookingChange < 0 ? 'down' : 'flat'
        };
      }
    }
    
    const result = {
      clientKey,
      period: `Last ${days} days`,
      generatedAt: new Date().toISOString(),
      
      // Costs
      costs: {
        calls: callCosts,
        sms: smsCosts,
        validation: validationCosts,
        total: totalCosts,
        breakdown: {
          totalCalls,
          totalCallMinutes: totalCallMinutes.toFixed(1),
          estimatedSMS,
          avgCallCost: totalCalls > 0 ? (callCosts / totalCalls) : 0
        }
      },
      
      // Revenue
      revenue: {
        bookings,
        completedAppointments,
        avgDealValue: clientAvgDealValue,
        total: totalRevenue,
        completedRevenue,
        projected: totalRevenue // Could add pipeline value here
      },
      
      // ROI Metrics
      roi: {
        profit,
        multiplier: roiMultiplier,
        percentage: roiPercentage,
        paybackPeriod: roiMultiplier > 1 ? `Immediate (${roiMultiplier.toFixed(1)}x return)` : 'Not yet profitable'
      },
      
      // Efficiency Metrics
      efficiency: {
        conversionRate: (conversionRate * 100).toFixed(1) + '%',
        costPerBooking: costPerBooking.toFixed(2),
        revenuePerCall: revenuePerCall.toFixed(2),
        profitPerCall: totalCalls > 0 ? ((profit / totalCalls).toFixed(2)) : '0.00'
      },
      
      // Trends
      trends: weeklyTrend,
      
      // Summary
      summary: generateROISummary({
        profit,
        roiMultiplier,
        roiPercentage,
        bookings,
        totalCosts,
        totalRevenue,
        conversionRate
      })
    };
    
    console.log(`[ROI CALCULATOR] ${clientKey} ROI: ${roiMultiplier.toFixed(1)}x return, £${profit.toFixed(2)} profit`);
    
    return result;
    
  } catch (error) {
    console.error(`[ROI CALCULATOR ERROR] ${clientKey}:`, error);
    throw error;
  }
}

/**
 * Generate human-readable ROI summary
 * @param {Object} data - ROI data
 * @returns {Object} - Summary with insights
 */
function generateROISummary(data) {
  const insights = [];
  
  // Profitability insights
  if (data.profit > 0) {
    insights.push({
      type: 'success',
      icon: '💰',
      message: `You made £${data.profit.toFixed(2)} profit this period!`
    });
  } else if (data.profit < 0) {
    insights.push({
      type: 'warning',
      icon: '⚠️',
      message: `Currently £${Math.abs(data.profit).toFixed(2)} in the red. Need to improve conversion rate.`
    });
  }
  
  // ROI multiplier insights
  if (data.roiMultiplier >= 10) {
    insights.push({
      type: 'success',
      icon: '🚀',
      message: `Outstanding ${data.roiMultiplier.toFixed(0)}x return! This is exceptional performance.`
    });
  } else if (data.roiMultiplier >= 5) {
    insights.push({
      type: 'success',
      icon: '🎯',
      message: `Excellent ${data.roiMultiplier.toFixed(1)}x return. Well above industry average.`
    });
  } else if (data.roiMultiplier >= 2) {
    insights.push({
      type: 'info',
      icon: '👍',
      message: `Good ${data.roiMultiplier.toFixed(1)}x return. Room for improvement.`
    });
  } else if (data.roiMultiplier < 1 && data.totalCosts > 0) {
    insights.push({
      type: 'warning',
      icon: '📉',
      message: `ROI is ${data.roiMultiplier.toFixed(2)}x. Need to increase bookings or reduce costs.`
    });
  }
  
  // Conversion rate insights
  if (data.conversionRate >= 0.15) {
    insights.push({
      type: 'success',
      icon: '🎉',
      message: `${(data.conversionRate * 100).toFixed(1)}% conversion rate is excellent!`
    });
  } else if (data.conversionRate < 0.10) {
    insights.push({
      type: 'warning',
      icon: '📊',
      message: `${(data.conversionRate * 100).toFixed(1)}% conversion rate is below target. Review call quality.`
    });
  }
  
  // Action items
  const actions = [];
  
  if (data.roiMultiplier < 2) {
    actions.push('Improve call scripts using A/B testing to increase conversion rate');
  }
  
  if (data.conversionRate < 0.10) {
    actions.push('Review call transcripts and optimize Vapi prompts');
  }
  
  if (data.totalRevenue === 0 && data.totalCosts > 0) {
    actions.push('Focus on booking conversion - review your value proposition');
  }
  
  return {
    headline: data.profit > 0 
      ? `£${data.profit.toFixed(2)} profit (${data.roiMultiplier.toFixed(1)}x ROI)` 
      : `${data.roiMultiplier.toFixed(1)}x ROI - ${Math.abs(data.profit) > 0 ? 'needs optimization' : 'just starting'}`,
    status: data.roiMultiplier >= 5 ? 'excellent' : data.roiMultiplier >= 2 ? 'good' : data.roiMultiplier >= 1 ? 'profitable' : 'needs_improvement',
    insights,
    actions
  };
}

/**
 * Project future ROI based on current performance
 * @param {Object} currentROI - Current ROI data
 * @param {number} projectionDays - Days to project forward
 * @returns {Object} - Projected ROI
 */
export function projectROI(currentROI, projectionDays = 30) {
  const dailyRate = projectionDays / currentROI.period.match(/\d+/)[0]; // e.g., 30 days / 30 days = 1
  
  return {
    projectedCosts: currentROI.costs.total * dailyRate,
    projectedRevenue: currentROI.revenue.total * dailyRate,
    projectedProfit: currentROI.roi.profit * dailyRate,
    projectedBookings: Math.round(currentROI.revenue.bookings * dailyRate),
    period: `Next ${projectionDays} days`,
    assumptions: {
      sameConversionRate: currentROI.efficiency.conversionRate,
      sameDealValue: currentROI.revenue.avgDealValue,
      sameCallVolume: 'Based on current pace'
    }
  };
}

