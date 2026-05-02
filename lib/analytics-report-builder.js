/**
 * Pure assembly of analytics "report" payloads from an analytics dashboard snapshot.
 * Extracted from server.js for tests and smaller entrypoint.
 */

export function generateRecommendations(summary, insights) {
  const recommendations = [];

  if (summary.conversionRate < 15) {
    recommendations.push({
      priority: 'high',
      category: 'conversion_optimization',
      action: 'Optimize Assistant Prompts',
      description: 'Review and improve assistant conversation flow to increase conversion rates',
      expectedImpact: 'Increase conversion rate by 5-10%'
    });
  }

  if (summary.costPerConversion > 3) {
    recommendations.push({
      priority: 'medium',
      category: 'cost_optimization',
      action: 'Implement Call Scheduling',
      description: 'Use intelligent call scheduling to reduce costs and improve timing',
      expectedImpact: 'Reduce cost per conversion by 20-30%'
    });
  }

  if (summary.avgCallDuration > 240) {
    recommendations.push({
      priority: 'medium',
      category: 'efficiency',
      action: 'Streamline Call Process',
      description: 'Optimize call flow to reduce average duration while maintaining quality',
      expectedImpact: 'Reduce call duration by 15-25%'
    });
  }

  return recommendations;
}

/**
 * @param {object} dashboard - return shape of getAnalyticsDashboard
 * @param {string} reportType
 * @param {string} clientKey
 * @param {number} days
 */
export function buildAnalyticsReportFromDashboard(dashboard, reportType, clientKey, days) {
  const { summary, conversionFunnel, conversionRates, performanceMetrics, costMetrics } = dashboard;

  const insights = [];

  if (summary.conversionRate < 10) {
    insights.push({
      type: 'warning',
      category: 'conversion',
      message: `Low conversion rate (${summary.conversionRate}%). Consider optimizing assistant prompts or call timing.`
    });
  }

  if (summary.costPerConversion > 5) {
    insights.push({
      type: 'warning',
      category: 'cost',
      message: `High cost per conversion ($${summary.costPerConversion}). Review call duration and assistant efficiency.`
    });
  }

  if (summary.avgCallDuration > 300) {
    insights.push({
      type: 'info',
      category: 'efficiency',
      message: `Average call duration is ${Math.round(summary.avgCallDuration / 60)} minutes. Consider optimizing for shorter, more focused calls.`
    });
  }

  const funnelStages = conversionFunnel.map((stage) => ({
    stage: stage.stage,
    leads: stage.unique_leads,
    conversionRate: (stage.unique_leads / summary.totalLeads) * 100
  }));

  const bottleneckStage = funnelStages.reduce((min, stage) =>
    stage.conversionRate < min.conversionRate ? stage : min
  );

  if (bottleneckStage.conversionRate < 50) {
    insights.push({
      type: 'recommendation',
      category: 'optimization',
      message: `Conversion bottleneck detected at "${bottleneckStage.stage}" stage (${Math.round(bottleneckStage.conversionRate)}%). Focus optimization efforts here.`
    });
  }

  return {
    reportType,
    period: `${days} days`,
    generatedAt: new Date().toISOString(),
    clientKey,
    summary,
    insights,
    funnelStages,
    recommendations: generateRecommendations(summary, insights),
    data: {
      conversionFunnel,
      conversionRates,
      performanceMetrics,
      costMetrics
    }
  };
}
