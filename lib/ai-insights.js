// AI-Powered Insights Engine
// Analyzes client data and provides actionable recommendations

import { query } from '../db.js';
import { getConversionMetrics } from './analytics-tracker.js';
import { calculateROI } from './roi-calculator.js';

export class AIInsightsEngine {
  /**
   * Generate comprehensive insights from client data
   * @param {Object} clientData - Client's performance data
   * @returns {Array} Array of insight objects
   */
  generateInsights(clientData) {
    const insights = [];

    // Conversion rate analysis
    insights.push(...this.analyzeConversionRate(clientData));

    // Time-based performance
    insights.push(...this.analyzeTimePerformance(clientData));

    // Lead source analysis
    insights.push(...this.analyzeLeadSources(clientData));

    // Script effectiveness
    insights.push(...this.analyzeScriptPerformance(clientData));

    // Cost efficiency
    insights.push(...this.analyzeCostEfficiency(clientData));

    // Sort by priority (high to low)
    return insights.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Generate insights from database data for a client
   * @param {string} clientKey - Client identifier
   * @param {number} days - Number of days to analyze
   * @returns {Promise<Array>} Array of insight objects
   */
  async generateInsightsFromDB(clientKey, days = 30) {
    try {
      // Fetch comprehensive client data from database
      const clientData = await this.fetchClientData(clientKey, days);
      
      // Generate insights from the data
      return this.generateInsights(clientData);
    } catch (error) {
      console.error(`[AI INSIGHTS] Error generating insights for ${clientKey}:`, error);
      return [];
    }
  }

  /**
   * Fetch comprehensive client data from database
   * @param {string} clientKey - Client identifier
   * @param {number} days - Number of days to analyze
   * @returns {Promise<Object>} Client performance data
   */
  async fetchClientData(clientKey, days = 30) {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    // Get call metrics
    const callMetrics = await query(`
      SELECT 
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE outcome = 'booked' OR outcome = 'booking') as bookings,
        COUNT(*) FILTER (WHERE outcome = 'no_answer') as no_answer,
        COUNT(*) FILTER (WHERE outcome = 'voicemail') as voicemail,
        COUNT(*) FILTER (WHERE outcome = 'declined' OR outcome = 'not_interested') as declined,
        AVG(duration) as avg_duration,
        SUM(cost) as total_cost,
        AVG(quality_score) as avg_quality_score
      FROM calls
      WHERE client_key = $1
        AND created_at >= $2
    `, [clientKey, sinceDate.toISOString()]);

    const calls = callMetrics.rows[0] || {};

    // Get calls by hour
    const callsByHourResult = await query(`
      SELECT 
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as call_count,
        COUNT(*) FILTER (WHERE outcome = 'booked' OR outcome = 'booking') as booking_count
      FROM calls
      WHERE client_key = $1
        AND created_at >= $2
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour
    `, [clientKey, sinceDate.toISOString()]);

    const callsByHour = Array(24).fill(0);
    const bookingsByHour = Array(24).fill(0);
    callsByHourResult.rows.forEach(row => {
      const hour = parseInt(row.hour);
      callsByHour[hour] = parseInt(row.call_count) || 0;
      bookingsByHour[hour] = parseInt(row.booking_count) || 0;
    });

    // Get leads by source
    const leadsBySourceResult = await query(`
      SELECT 
        COALESCE(source, 'unknown') as source,
        COUNT(*) as lead_count,
        COUNT(DISTINCT CASE WHEN EXISTS (
          SELECT 1 FROM calls 
          WHERE calls.lead_phone = leads.phone 
          AND calls.outcome = 'booked'
          AND calls.created_at >= $2
        ) THEN leads.phone END) as booking_count
      FROM leads
      WHERE client_key = $1
        AND created_at >= $2
      GROUP BY source
      ORDER BY lead_count DESC
    `, [clientKey, sinceDate.toISOString()]);

    const leadsBySource = leadsBySourceResult.rows.map(row => ({
      name: row.source,
      count: parseInt(row.lead_count) || 0,
      bookings: parseInt(row.booking_count) || 0,
      cost: 0 // Would need to track this separately
    }));

    // Get appointment data for revenue calculation
    const appointmentsResult = await query(`
      SELECT COUNT(*) as count
      FROM appointments
      WHERE client_key = $1
        AND created_at >= $2
    `, [clientKey, sinceDate.toISOString()]);

    const appointments = parseInt(appointmentsResult.rows[0]?.count || 0);

    // Get client info for average deal value
    const clientResult = await query(`
      SELECT avg_deal_value, avg_deal_value as avgBookingValue
      FROM tenants
      WHERE client_key = $1
    `, [clientKey]);

    const client = clientResult.rows[0] || {};
    const avgBookingValue = client.avg_deal_value || client.avgBookingValue || 150;

    return {
      calls: parseInt(calls.total_calls) || 0,
      bookings: Math.max(parseInt(calls.bookings) || 0, appointments),
      noAnswer: parseInt(calls.no_answer) || 0,
      voicemail: parseInt(calls.voicemail) || 0,
      declined: parseInt(calls.declined) || 0,
      avgCallDuration: parseFloat(calls.avg_duration) || 0,
      totalCost: parseFloat(calls.total_cost) || 0,
      avgQualityScore: parseFloat(calls.avg_quality_score) || 0,
      callsByHour,
      bookingsByHour,
      leadsBySource,
      avgBookingValue
    };
  }

  analyzeConversionRate(data) {
    const insights = [];
    const conversionRate = data.bookings / (data.calls || 1) * 100;
    const industryAvg = 15; // Industry average: 15%

    if (conversionRate < industryAvg * 0.7) {
      insights.push({
        id: 'low_conversion',
        type: 'warning',
        priority: 'high',
        title: 'Conversion Rate Below Industry Average',
        message: `Your conversion rate is ${conversionRate.toFixed(1)}%, which is ${(industryAvg - conversionRate).toFixed(1)}% below the industry average of ${industryAvg}%.`,
        suggestion: 'Consider A/B testing your AI script or targeting higher-quality leads.',
        impact: {
          metric: 'bookings',
          potential: `+${Math.round((data.calls * industryAvg / 100) - data.bookings)} bookings/month`,
          revenue: this.calculateRevenue(Math.round((data.calls * industryAvg / 100) - data.bookings), data.avgBookingValue)
        },
        actions: [
          {
            label: 'Review AI Script',
            url: 'https://vapi.ai'
          },
          {
            label: 'Analyze Failed Calls',
            url: '/analytics?filter=failed'
          }
        ]
      });
    } else if (conversionRate > industryAvg * 1.2) {
      insights.push({
        id: 'high_conversion',
        type: 'success',
        priority: 'medium',
        title: 'Excellent Conversion Rate!',
        message: `Your conversion rate of ${conversionRate.toFixed(1)}% is ${(conversionRate - industryAvg).toFixed(1)}% above industry average. Great work!`,
        suggestion: 'Your script is performing well. Consider scaling up lead volume.',
        impact: {
          metric: 'revenue',
          potential: 'Scaling opportunity identified'
        },
        actions: [
          {
            label: 'Increase Lead Budget',
            url: '/settings'
          }
        ]
      });
    }

    return insights;
  }

  analyzeTimePerformance(data) {
    const insights = [];
    
    if (!data.callsByHour || data.callsByHour.length === 0) {
      return insights;
    }

    // Find best and worst performing hours
    const hourPerformance = data.callsByHour.map((calls, hour) => ({
      hour,
      calls,
      bookings: data.bookingsByHour?.[hour] || 0,
      rate: calls > 0 ? (data.bookingsByHour?.[hour] || 0) / calls * 100 : 0
    }));

    const sortedByRate = [...hourPerformance].sort((a, b) => b.rate - a.rate);
    const bestHour = sortedByRate[0];
    const worstHour = sortedByRate[sortedByRate.length - 1];

    if (bestHour && worstHour && bestHour.rate > worstHour.rate * 2) {
      insights.push({
        id: 'time_optimization',
        type: 'info',
        priority: 'medium',
        title: 'Optimize Call Timing',
        message: `Your conversion rate at ${this.formatHour(bestHour.hour)} (${bestHour.rate.toFixed(1)}%) is ${(bestHour.rate / worstHour.rate).toFixed(1)}x better than ${this.formatHour(worstHour.hour)} (${worstHour.rate.toFixed(1)}%).`,
        suggestion: `Focus your calling efforts between ${this.formatHour(bestHour.hour - 1)}-${this.formatHour(bestHour.hour + 2)} for maximum results.`,
        impact: {
          metric: 'efficiency',
          potential: `+${Math.round((bestHour.rate - worstHour.rate) / 100 * (worstHour.calls))} more bookings by optimizing timing`
        },
        actions: [
          {
            label: 'Adjust Call Schedule',
            url: '/settings?tab=schedule'
          }
        ]
      });
    }

    return insights;
  }

  analyzeLeadSources(data) {
    const insights = [];

    if (!data.leadsBySource || data.leadsBySource.length === 0) {
      return insights;
    }

    // Calculate ROI by source
    const sourceROI = data.leadsBySource.map(source => ({
      name: source.name,
      leads: source.count,
      bookings: source.bookings || 0,
      cost: source.cost || 0,
      conversionRate: source.count > 0 ? (source.bookings || 0) / source.count * 100 : 0,
      roi: source.cost > 0 ? ((source.bookings * (data.avgBookingValue || 0)) - source.cost) / source.cost * 100 : 0
    }));

    const sortedByROI = sourceROI.sort((a, b) => b.roi - a.roi);
    const bestSource = sortedByROI[0];
    const worstSource = sortedByROI[sortedByROI.length - 1];

    if (bestSource && worstSource && bestSource.roi > 50 && worstSource.roi < 0) {
      insights.push({
        id: 'source_optimization',
        type: 'warning',
        priority: 'high',
        title: 'Reallocate Marketing Budget',
        message: `${bestSource.name} has ${bestSource.roi.toFixed(0)}% ROI while ${worstSource.name} is losing money at ${worstSource.roi.toFixed(0)}% ROI.`,
        suggestion: `Reduce spend on ${worstSource.name} and increase budget for ${bestSource.name}.`,
        impact: {
          metric: 'revenue',
          potential: `Save £${Math.abs(worstSource.cost * worstSource.roi / 100).toFixed(0)}/month + grow revenue from ${bestSource.name}`
        },
        actions: [
          {
            label: 'View Source Analytics',
            url: '/analytics?source=all'
          }
        ]
      });
    }

    // Identify high-volume low-quality sources
    const lowQualitySources = sourceROI.filter(s => s.leads > 20 && s.conversionRate < 5);
    if (lowQualitySources.length > 0) {
      insights.push({
        id: 'low_quality_leads',
        type: 'warning',
        priority: 'medium',
        title: 'Low-Quality Lead Sources Detected',
        message: `${lowQualitySources.map(s => s.name).join(', ')} have high volume but <5% conversion rate.`,
        suggestion: 'Add qualifying questions or filters to improve lead quality from these sources.',
        impact: {
          metric: 'efficiency',
          potential: 'Improve lead quality and reduce wasted calls'
        }
      });
    }

    return insights;
  }

  analyzeScriptPerformance(data) {
    const insights = [];

    if (data.avgCallDuration) {
      const idealDuration = 180; // 3 minutes ideal

      if (data.avgCallDuration < 60) {
        insights.push({
          id: 'short_calls',
          type: 'warning',
          priority: 'high',
          title: 'Calls Are Too Short',
          message: `Average call duration is only ${Math.round(data.avgCallDuration)}s. Leads may be hanging up too quickly.`,
          suggestion: 'Your AI might sound too robotic or the value proposition isn\'t clear. Review your opening script.',
          impact: {
            metric: 'engagement',
            potential: 'Longer calls = higher conversion rates'
          },
          actions: [
            {
              label: 'Improve Opening Script',
              url: 'https://vapi.ai'
            }
          ]
        });
      } else if (data.avgCallDuration > 300) {
        insights.push({
          id: 'long_calls',
          type: 'info',
          priority: 'low',
          title: 'Calls Are Running Long',
          message: `Average call duration is ${Math.round(data.avgCallDuration / 60)} minutes. This might indicate objections or confusion.`,
          suggestion: 'Streamline your script or add better objection handling to move conversations forward faster.',
          impact: {
            metric: 'cost',
            potential: `Shorter calls = lower Vapi costs`
          }
        });
      }
    }

    return insights;
  }

  analyzeCostEfficiency(data) {
    const insights = [];

    const costPerCall = data.totalCost / (data.calls || 1);
    const costPerBooking = data.totalCost / (data.bookings || 1);

    if (costPerBooking > 50) {
      insights.push({
        id: 'high_cost_per_booking',
        type: 'warning',
        priority: 'high',
        title: 'Cost Per Booking Is High',
        message: `Each booking costs £${costPerBooking.toFixed(2)}. With an average booking value of £${data.avgBookingValue || 0}, your profit margin is tight.`,
        suggestion: 'Focus on improving conversion rate to reduce cost per booking. Target: <£30 per booking.',
        impact: {
          metric: 'profitability',
          potential: `Save £${((costPerBooking - 30) * data.bookings).toFixed(0)}/month`
        },
        actions: [
          {
            label: 'Optimize AI Script',
            url: 'https://vapi.ai'
          },
          {
            label: 'Improve Lead Quality',
            url: '/leads?sort=score'
          }
        ]
      });
    }

    return insights;
  }

  // Helper methods
  formatHour(hour) {
    const h = hour % 24;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 || 12;
    return `${displayHour}${ampm}`;
  }

  calculateRevenue(bookings, avgValue = 100) {
    return `£${(bookings * avgValue).toFixed(0)}`;
  }
}

/**
 * Lead Scoring Algorithm
 * Predicts likelihood of booking based on various factors
 */
export class LeadScoringEngine {
  /**
   * Calculate lead score (0-100)
   * @param {Object} lead - Lead data
   * @param {Object} historicalData - Historical performance data
   * @returns {number} Score from 0-100
   */
  scoreLead(lead, historicalData = {}) {
    let score = 50; // Base score

    // Phone number quality (valid format)
    if (this.isValidPhoneFormat(lead.phone)) {
      score += 5;
    }

    // Email provided
    if (lead.email && lead.email.includes('@')) {
      score += 10;
    }

    // Response speed (for SMS opt-ins)
    if (lead.responseTime && lead.responseTime < 5 * 60) { // Responded within 5 minutes
      score += 15;
    } else if (lead.responseTime && lead.responseTime < 60 * 60) { // Within 1 hour
      score += 5;
    }

    // Lead source quality (based on historical conversion rates)
    const sourceRate = historicalData.sourceConversionRates?.[lead.source] || 0;
    if (sourceRate > 20) {
      score += 10;
    } else if (sourceRate > 10) {
      score += 5;
    } else if (sourceRate < 5 && sourceRate > 0) {
      score -= 10;
    }

    // Tags (handle both array and string)
    const tags = Array.isArray(lead.tags) ? lead.tags : (lead.tags ? [lead.tags] : []);
    if (tags.length > 0) {
      if (tags.some(t => t.toLowerCase().includes('hot'))) score += 20;
      if (tags.some(t => t.toLowerCase().includes('warm'))) score += 10;
      if (tags.some(t => t.toLowerCase().includes('cold'))) score -= 10;
      if (tags.some(t => t.toLowerCase().includes('vip'))) score += 15;
      if (tags.some(t => t.toLowerCase().includes('referral'))) score += 15;
    }

    // Previous interactions
    if (lead.previousAttempts) {
      if (lead.previousAttempts === 1) score += 5; // First follow-up often works
      if (lead.previousAttempts > 3) score -= 15; // Too many attempts
    }

    // Lead age (fresher is better)
    if (lead.createdAt) {
      const ageHours = (Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60);
      if (ageHours < 1) score += 15;
      else if (ageHours < 24) score += 10;
      else if (ageHours < 48) score += 5;
      else if (ageHours > 168) score -= 10; // Older than a week
    }

    // Time of day (business hours)
    const hour = new Date().getHours();
    if (hour >= 9 && hour <= 17) {
      score += 5;
    }

    // Day of week (weekdays better)
    const day = new Date().getDay();
    if (day >= 1 && day <= 5) {
      score += 5;
    }

    // Ensure score is within 0-100 range
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  isValidPhoneFormat(phone) {
    if (!phone) return false;
    // Check for E.164 format or valid UK number
    return /^\+?[1-9]\d{10,14}$/.test(phone.replace(/[\s\-\(\)]/g, ''));
  }

  /**
   * Get historical conversion rates by source for a client
   * @param {string} clientKey - Client identifier
   * @param {number} days - Number of days to look back
   * @returns {Promise<Object>} Source conversion rates
   */
  async getHistoricalSourceRates(clientKey, days = 90) {
    try {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - days);

      const result = await query(`
        SELECT 
          COALESCE(l.source, 'unknown') as source,
          COUNT(DISTINCT l.phone) as total_leads,
          COUNT(DISTINCT CASE WHEN c.outcome = 'booked' OR c.outcome = 'booking' THEN l.phone END) as bookings
        FROM leads l
        LEFT JOIN calls c ON c.lead_phone = l.phone AND c.client_key = l.client_key
        WHERE l.client_key = $1
          AND l.created_at >= $2
        GROUP BY l.source
      `, [clientKey, sinceDate.toISOString()]);

      const rates = {};
      result.rows.forEach(row => {
        const total = parseInt(row.total_leads) || 0;
        const bookings = parseInt(row.bookings) || 0;
        rates[row.source] = total > 0 ? (bookings / total) * 100 : 0;
      });

      return rates;
    } catch (error) {
      console.error('[LEAD SCORING] Error getting historical rates:', error);
      return {};
    }
  }

  /**
   * Score a lead using database historical data
   * @param {Object} lead - Lead data
   * @param {string} clientKey - Client identifier
   * @returns {Promise<number>} Score from 0-100
   */
  async scoreLeadWithHistory(lead, clientKey) {
    const historicalData = {
      sourceConversionRates: await this.getHistoricalSourceRates(clientKey)
    };
    return this.scoreLead(lead, historicalData);
  }

  /**
   * Prioritize leads for calling
   * @param {Array} leads - Array of leads
   * @param {Object} historicalData - Historical data for scoring
   * @returns {Array} Sorted array of leads with scores
   */
  prioritizeLeads(leads, historicalData = {}) {
    return leads
      .map(lead => ({
        ...lead,
        score: this.scoreLead(lead, historicalData)
      }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Prioritize leads using database historical data
   * @param {Array} leads - Array of leads
   * @param {string} clientKey - Client identifier
   * @returns {Promise<Array>} Sorted array of leads with scores
   */
  async prioritizeLeadsWithHistory(leads, clientKey) {
    const historicalData = {
      sourceConversionRates: await this.getHistoricalSourceRates(clientKey)
    };
    return this.prioritizeLeads(leads, historicalData);
  }
}

/**
 * ROI Calculator
 * Calculates return on investment for AI booking service
 */
export class ROICalculator {
  /**
   * Calculate comprehensive ROI metrics
   * @param {Object} params - Input parameters
   * @returns {Object} ROI analysis
   */
  calculateROI(params) {
    const {
      monthlyLeads = 0,
      costPerLead = 0,
      conversionRate = 0,
      avgBookingValue = 0,
      serviceCost = 500, // AI booking service cost
      previousManualBookings = 0,
      previousManualCost = 0
    } = params;

    // Current situation
    const totalLeadCost = monthlyLeads * costPerLead;
    const bookings = monthlyLeads * (conversionRate / 100);
    const revenue = bookings * avgBookingValue;
    const totalCost = totalLeadCost + serviceCost;
    const profit = revenue - totalCost;
    const roi = totalCost > 0 ? ((revenue - totalCost) / totalCost * 100) : 0;

    // Comparison with previous manual system
    const improvementBookings = bookings - previousManualBookings;
    const improvementRevenue = improvementBookings * avgBookingValue;
    const costSavings = previousManualCost - serviceCost;
    const totalImprovement = improvementRevenue + costSavings;

    // Break-even analysis
    const breakEvenBookings = Math.ceil(totalCost / avgBookingValue);
    const breakEvenConversionRate = (breakEvenBookings / monthlyLeads * 100).toFixed(1);

    // Projections
    const projectedAnnualRevenue = revenue * 12;
    const projectedAnnualProfit = profit * 12;

    return {
      monthly: {
        leads: monthlyLeads,
        bookings: Math.round(bookings),
        revenue: Math.round(revenue),
        costs: {
          leads: Math.round(totalLeadCost),
          service: serviceCost,
          total: Math.round(totalCost)
        },
        profit: Math.round(profit),
        roi: roi.toFixed(1),
        conversionRate: conversionRate.toFixed(1)
      },
      improvement: {
        additionalBookings: Math.round(improvementBookings),
        additionalRevenue: Math.round(improvementRevenue),
        costSavings: Math.round(costSavings),
        totalBenefit: Math.round(totalImprovement)
      },
      breakEven: {
        bookingsNeeded: breakEvenBookings,
        conversionRateNeeded: breakEvenConversionRate,
        currentGap: bookings >= breakEvenBookings ? 0 : breakEvenBookings - bookings
      },
      projections: {
        annualRevenue: Math.round(projectedAnnualRevenue),
        annualProfit: Math.round(projectedAnnualProfit),
        annualROI: roi.toFixed(1)
      },
      recommendations: this.generateRecommendations({
        roi,
        conversionRate,
        bookings,
        breakEvenBookings
      })
    };
  }

  generateRecommendations({ roi, conversionRate, bookings, breakEvenBookings }) {
    const recommendations = [];

    if (roi < 100) {
      recommendations.push('📊 Your ROI is below target. Focus on improving conversion rate or reducing lead costs.');
    }

    if (bookings < breakEvenBookings) {
      recommendations.push(`⚠️ You need ${breakEvenBookings - bookings} more bookings/month to break even.`);
    }

    if (conversionRate < 10) {
      recommendations.push('🎯 Your conversion rate is low. A/B test your AI script and improve lead quality.');
    } else if (conversionRate > 20) {
      recommendations.push('🚀 Excellent conversion rate! Consider increasing lead volume to scale revenue.');
    }

    if (roi > 200) {
      recommendations.push('💰 Outstanding ROI! This is a highly profitable setup. Consider scaling up.');
    }

    return recommendations;
  }
}

export default {
  AIInsightsEngine,
  LeadScoringEngine,
  ROICalculator
};

