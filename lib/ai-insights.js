// AI-Powered Insights Engine
// Analyzes client data and provides actionable recommendations

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

    if (!data.leadsBySour || data.leadsBySource.length === 0) {
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
    if (lead.responseTime < 5 * 60) { // Responded within 5 minutes
      score += 15;
    } else if (lead.responseTime < 60 * 60) { // Within 1 hour
      score += 5;
    }

    // Lead source quality (based on historical conversion rates)
    const sourceRate = historicalData.sourceConversionRates?.[lead.source] || 0;
    if (sourceRate > 20) {
      score += 10;
    } else if (sourceRate > 10) {
      score += 5;
    } else if (sourceRate < 5) {
      score -= 10;
    }

    // Tags
    if (lead.tags) {
      if (lead.tags.includes('hot')) score += 20;
      if (lead.tags.includes('warm')) score += 10;
      if (lead.tags.includes('cold')) score -= 10;
      if (lead.tags.includes('vip')) score += 15;
      if (lead.tags.includes('referral')) score += 15;
    }

    // Previous interactions
    if (lead.previousAttempts) {
      if (lead.previousAttempts === 1) score += 5; // First follow-up often works
      if (lead.previousAttempts > 3) score -= 15; // Too many attempts
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
    // Check for E.164 format or valid UK number
    return /^\+?[1-9]\d{10,14}$/.test(phone.replace(/[\s\-\(\)]/g, ''));
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

