// Intelligent Analytics & AI-Powered Insights
// Advanced analytics with machine learning insights and recommendations

export class IntelligentAnalytics {
  constructor() {
    this.insights = [];
    this.recommendations = [];
    this.patterns = new Map();
  }

  // Analyze lead behavior patterns
  analyzeLeadPatterns(leads) {
    const patterns = {
      responseTime: this.calculateResponseTimePatterns(leads),
      conversionRate: this.calculateConversionRates(leads),
      optimalTiming: this.findOptimalTiming(leads),
      messageEffectiveness: this.analyzeMessageEffectiveness(leads)
    };

    this.patterns.set('leadPatterns', patterns);
    return patterns;
  }

  // Calculate response time patterns
  calculateResponseTimePatterns(leads) {
    const responseTimes = leads
      .filter(lead => lead.firstResponseTime)
      .map(lead => lead.firstResponseTime);

    if (responseTimes.length === 0) return null;

    const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
    const medianResponseTime = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length / 2)];

    return {
      average: avgResponseTime,
      median: medianResponseTime,
      fastResponse: responseTimes.filter(time => time < 5).length,
      slowResponse: responseTimes.filter(time => time > 30).length,
      insight: avgResponseTime < 10 ? 
        "Excellent response time! Keep up the fast response rate." :
        "Consider improving response time. Faster responses typically lead to higher conversion rates."
    };
  }

  // Calculate conversion rates by different segments
  calculateConversionRates(leads) {
    const segments = {
      bySource: this.groupBy(leads, 'source'),
      byTimeOfDay: this.groupBy(leads, 'timeOfDay'),
      byDayOfWeek: this.groupBy(leads, 'dayOfWeek'),
      byMessageType: this.groupBy(leads, 'messageType')
    };

    const conversionRates = {};
    for (const [segment, values] of Object.entries(segments)) {
      conversionRates[segment] = {};
      for (const [key, segmentLeads] of Object.entries(values)) {
        const converted = segmentLeads.filter(lead => lead.status === 'converted').length;
        conversionRates[segment][key] = {
          total: segmentLeads.length,
          converted,
          rate: segmentLeads.length > 0 ? (converted / segmentLeads.length) * 100 : 0
        };
      }
    }

    return conversionRates;
  }

  // Find optimal timing for calls and messages
  findOptimalTiming(leads) {
    const timingData = leads.map(lead => ({
      hour: new Date(lead.createdAt).getHours(),
      day: new Date(lead.createdAt).getDay(),
      converted: lead.status === 'converted'
    }));

    const hourlyConversion = {};
    const dailyConversion = {};

    timingData.forEach(data => {
      // Hourly analysis
      if (!hourlyConversion[data.hour]) {
        hourlyConversion[data.hour] = { total: 0, converted: 0 };
      }
      hourlyConversion[data.hour].total++;
      if (data.converted) hourlyConversion[data.hour].converted++;

      // Daily analysis
      if (!dailyConversion[data.day]) {
        dailyConversion[data.day] = { total: 0, converted: 0 };
      }
      dailyConversion[data.day].total++;
      if (data.converted) dailyConversion[data.day].converted++;
    });

    // Find best hours
    const bestHours = Object.entries(hourlyConversion)
      .map(([hour, data]) => ({
        hour: parseInt(hour),
        rate: data.total > 0 ? (data.converted / data.total) * 100 : 0,
        total: data.total
      }))
      .filter(h => h.total >= 3) // Minimum 3 leads for statistical significance
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 3);

    // Find best days
    const bestDays = Object.entries(dailyConversion)
      .map(([day, data]) => ({
        day: parseInt(day),
        dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day],
        rate: data.total > 0 ? (data.converted / data.total) * 100 : 0,
        total: data.total
      }))
      .filter(d => d.total >= 5) // Minimum 5 leads for statistical significance
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 3);

    return {
      bestHours,
      bestDays,
      recommendation: this.generateTimingRecommendation(bestHours, bestDays)
    };
  }

  // Analyze message effectiveness
  analyzeMessageEffectiveness(leads) {
    const messageTypes = this.groupBy(leads, 'messageType');
    const effectiveness = {};

    for (const [type, typeLeads] of Object.entries(messageTypes)) {
      const converted = typeLeads.filter(lead => lead.status === 'converted').length;
      const avgResponseTime = typeLeads
        .filter(lead => lead.firstResponseTime)
        .reduce((sum, lead) => sum + lead.firstResponseTime, 0) / typeLeads.length;

      effectiveness[type] = {
        total: typeLeads.length,
        converted,
        conversionRate: typeLeads.length > 0 ? (converted / typeLeads.length) * 100 : 0,
        avgResponseTime: avgResponseTime || 0,
        effectiveness: this.calculateMessageEffectivenessScore(converted, typeLeads.length, avgResponseTime)
      };
    }

    return effectiveness;
  }

  // Generate AI-powered recommendations
  generateRecommendations(analytics) {
    const recommendations = [];

    // Conversion rate recommendations
    if (analytics.conversionRate.overall < 15) {
      recommendations.push({
        type: 'conversion_optimization',
        priority: 'high',
        title: 'Improve Conversion Rate',
        description: `Current conversion rate is ${analytics.conversionRate.overall.toFixed(1)}%. Industry average is 20-25%.`,
        actions: [
          'Optimize VAPI assistant prompts for better engagement',
          'Implement A/B testing for different message types',
          'Add social proof and testimonials to messages',
          'Improve follow-up sequence timing'
        ],
        expectedImpact: 'Increase conversion rate by 5-10%'
      });
    }

    // Response time recommendations
    if (analytics.responseTime.average > 15) {
      recommendations.push({
        type: 'response_time',
        priority: 'medium',
        title: 'Improve Response Time',
        description: `Average response time is ${analytics.responseTime.average.toFixed(1)} minutes.`,
        actions: [
          'Set up real-time notifications for new leads',
          'Implement automated immediate responses',
          'Optimize SMS processing pipeline',
          'Add priority queuing for high-value leads'
        ],
        expectedImpact: 'Reduce response time by 50%'
      });
    }

    // Timing optimization recommendations
    if (analytics.optimalTiming.bestHours.length > 0) {
      const bestHour = analytics.optimalTiming.bestHours[0];
      recommendations.push({
        type: 'timing_optimization',
        priority: 'medium',
        title: 'Optimize Call Timing',
        description: `Best conversion rate (${bestHour.rate.toFixed(1)}%) occurs at ${bestHour.hour}:00.`,
        actions: [
          'Schedule more calls during peak hours',
          'Implement intelligent call scheduling',
          'Avoid calling during low-conversion hours',
          'Set up automated scheduling based on optimal times'
        ],
        expectedImpact: 'Increase conversion rate by 3-5%'
      });
    }

    // Cost optimization recommendations
    if (analytics.costPerConversion > 5) {
      recommendations.push({
        type: 'cost_optimization',
        priority: 'high',
        title: 'Reduce Cost Per Conversion',
        description: `Current cost per conversion is $${analytics.costPerConversion.toFixed(2)}.`,
        actions: [
          'Optimize call duration and efficiency',
          'Implement better lead qualification',
          'Use SMS for initial screening',
          'Focus on high-conversion time slots'
        ],
        expectedImpact: 'Reduce cost per conversion by 30-40%'
      });
    }

    return recommendations;
  }

  // Generate predictive insights
  generatePredictiveInsights(historicalData) {
    const insights = [];

    // Trend analysis
    const trends = this.analyzeTrends(historicalData);
    if (trends.conversionRate.trend === 'increasing') {
      insights.push({
        type: 'positive_trend',
        message: `Conversion rate is trending upward (+${trends.conversionRate.change.toFixed(1)}% this week)`,
        confidence: trends.conversionRate.confidence
      });
    } else if (trends.conversionRate.trend === 'decreasing') {
      insights.push({
        type: 'negative_trend',
        message: `Conversion rate is declining (-${trends.conversionRate.change.toFixed(1)}% this week)`,
        confidence: trends.conversionRate.confidence,
        recommendation: 'Review recent changes and optimize messaging'
      });
    }

    // Seasonal patterns
    const seasonalPatterns = this.detectSeasonalPatterns(historicalData);
    if (seasonalPatterns.detected) {
      insights.push({
        type: 'seasonal_pattern',
        message: `Seasonal pattern detected: ${seasonalPatterns.description}`,
        recommendation: seasonalPatterns.recommendation
      });
    }

    // Capacity planning
    const capacityInsights = this.analyzeCapacity(historicalData);
    if (capacityInsights.overloadRisk) {
      insights.push({
        type: 'capacity_warning',
        message: `High lead volume detected. Consider scaling resources.`,
        recommendation: 'Implement automated responses and queue management'
      });
    }

    return insights;
  }

  // Helper methods
  groupBy(array, key) {
    return array.reduce((groups, item) => {
      const group = item[key] || 'unknown';
      groups[group] = groups[group] || [];
      groups[group].push(item);
      return groups;
    }, {});
  }

  calculateMessageEffectivenessScore(converted, total, avgResponseTime) {
    const conversionScore = (converted / total) * 100;
    const responseScore = Math.max(0, 100 - avgResponseTime); // Lower response time = higher score
    return (conversionScore * 0.7) + (responseScore * 0.3);
  }

  generateTimingRecommendation(bestHours, bestDays) {
    if (bestHours.length === 0 || bestDays.length === 0) {
      return "Insufficient data for timing recommendations. Continue collecting data.";
    }

    const bestHour = bestHours[0];
    const bestDay = bestDays[0];
    
    return `Schedule calls during ${bestDay.dayName}s around ${bestHour.hour}:00 for optimal conversion rates (${bestHour.rate.toFixed(1)}%).`;
  }

  analyzeTrends(data) {
    // Simple trend analysis - in production, use more sophisticated methods
    const recent = data.slice(-7); // Last 7 days
    const previous = data.slice(-14, -7); // Previous 7 days

    const recentRate = recent.length > 0 ? 
      recent.filter(d => d.converted).length / recent.length : 0;
    const previousRate = previous.length > 0 ? 
      previous.filter(d => d.converted).length / previous.length : 0;

    const change = ((recentRate - previousRate) / previousRate) * 100;

    return {
      conversionRate: {
        trend: change > 5 ? 'increasing' : change < -5 ? 'decreasing' : 'stable',
        change: Math.abs(change),
        confidence: Math.min(95, Math.max(60, 100 - Math.abs(change)))
      }
    };
  }

  detectSeasonalPatterns(data) {
    // Simple seasonal detection - in production, use time series analysis
    const monthlyData = this.groupBy(data, 'month');
    
    if (Object.keys(monthlyData).length < 3) {
      return { detected: false };
    }

    // Look for patterns (simplified)
    const summerMonths = ['6', '7', '8']; // June, July, August
    const winterMonths = ['12', '1', '2']; // December, January, February

    const summerRate = this.calculateAverageRate(monthlyData, summerMonths);
    const winterRate = this.calculateAverageRate(monthlyData, winterMonths);

    if (Math.abs(summerRate - winterRate) > 10) {
      return {
        detected: true,
        description: summerRate > winterRate ? 
          'Higher conversion rates in summer months' : 
          'Higher conversion rates in winter months',
        recommendation: summerRate > winterRate ?
          'Increase marketing efforts during summer months' :
          'Focus on winter marketing campaigns'
      };
    }

    return { detected: false };
  }

  analyzeCapacity(data) {
    const recentVolume = data.slice(-7).length;
    const avgVolume = data.length / (data.length > 0 ? Math.ceil(data.length / 7) : 1);
    
    return {
      overloadRisk: recentVolume > avgVolume * 1.5,
      currentVolume: recentVolume,
      averageVolume: avgVolume
    };
  }

  calculateAverageRate(monthlyData, months) {
    const rates = months
      .map(month => monthlyData[month])
      .filter(data => data && data.length > 0)
      .map(data => data.filter(d => d.converted).length / data.length);
    
    return rates.length > 0 ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : 0;
  }
}

// Real-time insights dashboard
export class RealTimeInsights {
  constructor() {
    this.subscribers = new Set();
    this.insights = [];
  }

  // Subscribe to real-time insights
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  // Add new insight
  addInsight(insight) {
    this.insights.unshift(insight);
    if (this.insights.length > 100) {
      this.insights = this.insights.slice(0, 100);
    }

    // Notify subscribers
    this.subscribers.forEach(callback => callback(insight));
  }

  // Get recent insights
  getRecentInsights(limit = 10) {
    return this.insights.slice(0, limit);
  }

  // Generate insight from event
  generateInsightFromEvent(event) {
    const insights = [];

    switch (event.type) {
      case 'lead_created':
        if (event.data.score > 80) {
          insights.push({
            type: 'high_value_lead',
            priority: 'high',
            message: `High-value lead detected (Score: ${event.data.score})`,
            recommendation: 'Prioritize immediate follow-up',
            timestamp: new Date()
          });
        }
        break;

      case 'call_completed':
        if (event.data.duration < 30) {
          insights.push({
            type: 'short_call',
            priority: 'medium',
            message: `Call completed quickly (${event.data.duration}s)`,
            recommendation: 'Review call effectiveness and prompts',
            timestamp: new Date()
          });
        }
        break;

      case 'conversion':
        insights.push({
          type: 'conversion',
          priority: 'high',
          message: `New conversion! Lead converted after ${event.data.timeToConversion} minutes`,
          recommendation: 'Analyze successful conversion patterns',
          timestamp: new Date()
        });
        break;
    }

    insights.forEach(insight => this.addInsight(insight));
    return insights;
  }
}

export default {
  IntelligentAnalytics,
  RealTimeInsights
};
