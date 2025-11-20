// lib/industry-benchmarks.js
// Industry benchmark data for performance comparison

export const INDUSTRY_BENCHMARKS = {
  healthcare: {
    name: 'Healthcare & Medical',
    callSuccessRate: 0.65,
    bookingRate: 0.15,
    avgQualityScore: 7.2,
    avgCallDuration: 180,
    smsResponseRate: 0.25,
    positiveSentimentRate: 0.50
  },
  
  beauty: {
    name: 'Beauty & Aesthetics',
    callSuccessRate: 0.70,
    bookingRate: 0.20,
    avgQualityScore: 7.5,
    avgCallDuration: 120,
    smsResponseRate: 0.30,
    positiveSentimentRate: 0.55
  },
  
  fitness: {
    name: 'Fitness & Wellness',
    callSuccessRate: 0.60,
    bookingRate: 0.12,
    avgQualityScore: 7.0,
    avgCallDuration: 150,
    smsResponseRate: 0.22,
    positiveSentimentRate: 0.45
  },
  
  professional_services: {
    name: 'Professional Services',
    callSuccessRate: 0.68,
    bookingRate: 0.14,
    avgQualityScore: 7.3,
    avgCallDuration: 200,
    smsResponseRate: 0.20,
    positiveSentimentRate: 0.48
  },
  
  education: {
    name: 'Education & Training',
    callSuccessRate: 0.65,
    bookingRate: 0.16,
    avgQualityScore: 7.1,
    avgCallDuration: 160,
    smsResponseRate: 0.28,
    positiveSentimentRate: 0.52
  },
  
  default: {
    name: 'General Industry Average',
    callSuccessRate: 0.65,
    bookingRate: 0.15,
    avgQualityScore: 7.0,
    avgCallDuration: 150,
    smsResponseRate: 0.25,
    positiveSentimentRate: 0.50
  }
};

/**
 * Get benchmark for a specific industry
 * @param {string} industry - Industry name
 * @returns {Object} - Benchmark data
 */
export function getBenchmark(industry) {
  const normalizedIndustry = (industry || '').toLowerCase().replace(/\s+/g, '_');
  return INDUSTRY_BENCHMARKS[normalizedIndustry] || INDUSTRY_BENCHMARKS.default;
}

/**
 * Compare client performance to industry benchmark
 * @param {Object} clientMetrics - Client's actual metrics
 * @param {string} industry - Industry name
 * @returns {Object} - Comparison results
 */
export function compareToIndustry(clientMetrics, industry) {
  const benchmark = getBenchmark(industry);
  
  const comparison = {
    industry: benchmark.name,
    metrics: {}
  };
  
  // Compare each metric
  const metricsToCompare = [
    { key: 'callSuccessRate', clientKey: 'success_rate', format: 'percentage' },
    { key: 'bookingRate', clientKey: 'booking_rate', format: 'percentage' },
    { key: 'avgQualityScore', clientKey: 'avg_quality_score', format: 'score' },
    { key: 'avgCallDuration', clientKey: 'avg_duration', format: 'seconds' },
    { key: 'positiveSentimentRate', clientKey: 'positive_sentiment_ratio', format: 'percentage' }
  ];
  
  metricsToCompare.forEach(({ key, clientKey, format }) => {
    const benchmarkValue = benchmark[key];
    const clientValue = clientMetrics[clientKey];
    
    if (benchmarkValue !== undefined && clientValue !== undefined) {
      const difference = clientValue - benchmarkValue;
      const percentDiff = (difference / benchmarkValue) * 100;
      
      comparison.metrics[key] = {
        client: clientValue,
        benchmark: benchmarkValue,
        difference,
        percentDiff,
        status: percentDiff >= 10 ? 'above' : percentDiff <= -10 ? 'below' : 'average',
        icon: percentDiff >= 10 ? '✅' : percentDiff <= -10 ? '⚠️' : '➖'
      };
    }
  });
  
  return comparison;
}

/**
 * Generate insights based on performance vs. benchmarks
 * @param {Object} comparison - Comparison object
 * @returns {Array} - Array of insight objects
 */
export function generateInsights(comparison) {
  const insights = [];
  
  Object.entries(comparison.metrics).forEach(([key, data]) => {
    const metricName = key.replace(/([A-Z])/g, ' $1').trim();
    
    if (data.status === 'above') {
      insights.push({
        type: 'success',
        metric: key,
        message: `Your ${metricName} is ${Math.abs(data.percentDiff).toFixed(1)}% above industry average! 🎉`,
        recommendation: 'Great job! Keep doing what you are doing.'
      });
    } else if (data.status === 'below') {
      insights.push({
        type: 'warning',
        metric: key,
        message: `Your ${metricName} is ${Math.abs(data.percentDiff).toFixed(1)}% below industry average.`,
        recommendation: getImprovementTip(key)
      });
    }
  });
  
  return insights;
}

/**
 * Get improvement tips for specific metrics
 * @param {string} metric - Metric key
 * @returns {string} - Improvement tip
 */
function getImprovementTip(metric) {
  const tips = {
    callSuccessRate: "Try calling during business hours (10am-4pm) for better connection rates. Validate phone numbers to filter out disconnected lines.",
    bookingRate: "Review your top-performing call transcripts and update your script. Test different value propositions with A/B testing.",
    avgQualityScore: "Analyze calls with low quality scores. Improve AI prompts to be more engaging and responsive to customer needs.",
    avgCallDuration: "Longer calls often mean better engagement. Ask open-ended questions and listen actively to build rapport.",
    positiveSentimentRate: "Focus on solving customer problems, not just selling. Show empathy and provide value in every conversation."
  };
  
  return tips[metric] || 'Review performance data and identify areas for improvement.';
}

