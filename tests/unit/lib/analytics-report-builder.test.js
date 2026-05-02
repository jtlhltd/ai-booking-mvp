import { describe, expect, test } from '@jest/globals';
import {
  generateRecommendations,
  buildAnalyticsReportFromDashboard
} from '../../../lib/analytics-report-builder.js';

const baseDashboard = () => ({
  summary: {
    totalLeads: 100,
    totalCalls: 10,
    successfulCalls: 8,
    conversionRate: 8,
    avgCallDuration: 120,
    totalCost: 10,
    costPerConversion: 1.25
  },
  conversionFunnel: [
    { stage: 'contacted', unique_leads: 100 },
    { stage: 'qualified', unique_leads: 40 }
  ],
  conversionRates: [],
  performanceMetrics: [],
  costMetrics: {}
});

describe('analytics-report-builder', () => {
  test('generateRecommendations adds conversion prompt when rate low', () => {
    const r = generateRecommendations(
      { conversionRate: 10, costPerConversion: 1, avgCallDuration: 60 },
      []
    );
    expect(r.some((x) => x.category === 'conversion_optimization')).toBe(true);
  });

  test('buildAnalyticsReportFromDashboard includes insights and data', () => {
    const d = baseDashboard();
    const report = buildAnalyticsReportFromDashboard(d, 'comprehensive', 'acme', 30);
    expect(report.clientKey).toBe('acme');
    expect(report.period).toBe('30 days');
    expect(report.data.conversionFunnel).toHaveLength(2);
    expect(report.funnelStages[0].stage).toBe('contacted');
  });
});
