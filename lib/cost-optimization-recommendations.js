/**
 * Pure text recommendations from daily cost aggregates + budget status.
 * Extracted from server.js for tests and smaller entrypoint.
 */

export function generateCostRecommendations(costs, budgetStatus) {
  const recommendations = [];

  if (costs.total_cost > 0) {
    const avgCostPerCall = costs.total_cost / costs.transaction_count;

    if (avgCostPerCall > 0.1) {
      recommendations.push({
        type: 'cost_optimization',
        priority: 'high',
        message: `Average call cost is $${avgCostPerCall.toFixed(2)}. Consider optimizing assistant prompts to reduce call duration.`
      });
    }

    if (budgetStatus.vapi_calls?.daily?.percentage > 80) {
      recommendations.push({
        type: 'budget_alert',
        priority: 'medium',
        message: `Daily budget utilization is ${budgetStatus.vapi_calls.daily.percentage.toFixed(1)}%. Consider setting up budget alerts.`
      });
    }

    if (costs.transaction_count > 50) {
      recommendations.push({
        type: 'volume_optimization',
        priority: 'low',
        message: `High call volume (${costs.transaction_count} calls). Consider implementing call scheduling to optimize timing.`
      });
    }
  }

  return recommendations;
}
