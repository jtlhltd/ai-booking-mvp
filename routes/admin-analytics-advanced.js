/**
 * Admin API: GET /analytics/advanced — overview, trends, performance, AI insights, forecasts.
 * Mounted at /api/admin.
 */
import { Router } from 'express';
import { query, getFullClient, listClientSummaries } from '../db.js';

async function getAnalyticsOverview(startDate, endDate, clientKey) {
  const clients = clientKey ? [await getFullClient(clientKey)] : await listClientSummaries();

  let totalLeads = 0;
  let totalCalls = 0;
  let totalBookings = 0;
  let totalRevenue = 0;
  let totalCost = 0;

  for (const client of clients) {
    if (!client) continue;

    const leads = await query(
      `
      SELECT COUNT(*) as count FROM leads 
      WHERE client_key = $1 AND created_at BETWEEN $2 AND $3
    `,
      [client.clientKey, startDate.toISOString(), endDate.toISOString()]
    );

    const calls = await query(
      `
      SELECT COUNT(*) as count, SUM(duration) as total_duration, SUM(cost) as total_cost
      FROM calls 
      WHERE client_key = $1 AND created_at BETWEEN $2 AND $3
    `,
      [client.clientKey, startDate.toISOString(), endDate.toISOString()]
    );

    const appointments = await query(
      `
      SELECT COUNT(*) as count FROM appointments 
      WHERE client_key = $1 AND created_at BETWEEN $2 AND $3
    `,
      [client.clientKey, startDate.toISOString(), endDate.toISOString()]
    );

    totalLeads += parseInt(leads.rows[0]?.count || 0);
    totalCalls += parseInt(calls.rows[0]?.count || 0);
    totalBookings += parseInt(appointments.rows[0]?.count || 0);
    totalCost += parseFloat(calls.rows[0]?.total_cost || 0);
  }

  totalRevenue = totalBookings * 500;

  return {
    totalLeads,
    totalCalls,
    totalBookings,
    totalRevenue,
    totalCost,
    conversionRate: totalCalls > 0 ? ((totalBookings / totalCalls) * 100).toFixed(1) : 0,
    costPerLead: totalLeads > 0 ? (totalCost / totalLeads).toFixed(2) : 0,
    revenuePerCall: totalCalls > 0 ? (totalRevenue / totalCalls).toFixed(2) : 0,
    roi: totalCost > 0 ? (((totalRevenue - totalCost) / totalCost) * 100).toFixed(1) : 0
  };
}

async function getAnalyticsTrends(startDate, endDate, clientKey) {
  const clients = clientKey ? [await getFullClient(clientKey)] : await listClientSummaries();
  const trends = [];

  const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    const nextDate = new Date(date);
    nextDate.setDate(date.getDate() + 1);

    let dailyLeads = 0;
    let dailyCalls = 0;
    let dailyBookings = 0;

    for (const client of clients) {
      if (!client) continue;

      const leads = await query(
        `
        SELECT COUNT(*) as count FROM leads 
        WHERE client_key = $1 AND created_at BETWEEN $2 AND $3
      `,
        [client.clientKey, date.toISOString(), nextDate.toISOString()]
      );

      const calls = await query(
        `
        SELECT COUNT(*) as count FROM calls 
        WHERE client_key = $1 AND created_at BETWEEN $2 AND $3
      `,
        [client.clientKey, date.toISOString(), nextDate.toISOString()]
      );

      const appointments = await query(
        `
        SELECT COUNT(*) as count FROM appointments 
        WHERE client_key = $1 AND created_at BETWEEN $2 AND $3
      `,
        [client.clientKey, date.toISOString(), nextDate.toISOString()]
      );

      dailyLeads += parseInt(leads.rows[0]?.count || 0);
      dailyCalls += parseInt(calls.rows[0]?.count || 0);
      dailyBookings += parseInt(appointments.rows[0]?.count || 0);
    }

    trends.push({
      date: date.toISOString().split('T')[0],
      leads: dailyLeads,
      calls: dailyCalls,
      bookings: dailyBookings,
      conversionRate: dailyCalls > 0 ? ((dailyBookings / dailyCalls) * 100).toFixed(1) : 0
    });
  }

  return trends;
}

async function getPerformanceMetricsAdvanced(startDate, endDate, clientKey) {
  const clients = clientKey ? [await getFullClient(clientKey)] : await listClientSummaries();
  const metrics = [];

  for (const client of clients) {
    if (!client) continue;

    const calls = await query(
      `
      SELECT 
        COUNT(*) as total_calls,
        AVG(duration) as avg_duration,
        AVG(quality_score) as avg_quality,
        COUNT(CASE WHEN outcome = 'booked' THEN 1 END) as successful_calls,
        COUNT(CASE WHEN outcome = 'interested' THEN 1 END) as interested_calls,
        COUNT(CASE WHEN outcome = 'not_interested' THEN 1 END) as not_interested_calls
      FROM calls 
      WHERE client_key = $1 AND created_at BETWEEN $2 AND $3
    `,
      [client.clientKey, startDate.toISOString(), endDate.toISOString()]
    );

    const appointments = await query(
      `
      SELECT COUNT(*) as count FROM appointments 
      WHERE client_key = $1 AND created_at BETWEEN $2 AND $3
    `,
      [client.clientKey, startDate.toISOString(), endDate.toISOString()]
    );

    const callData = calls.rows[0];
    const totalCalls = parseInt(callData?.total_calls || 0);
    const bookings = parseInt(appointments.rows[0]?.count || 0);

    metrics.push({
      clientName: client.displayName,
      clientKey: client.clientKey,
      totalCalls,
      avgDuration: Math.round(parseFloat(callData?.avg_duration || 0)),
      avgQuality: parseFloat(callData?.avg_quality || 0).toFixed(1),
      successfulCalls: parseInt(callData?.successful_calls || 0),
      interestedCalls: parseInt(callData?.interested_calls || 0),
      notInterestedCalls: parseInt(callData?.not_interested_calls || 0),
      bookings,
      conversionRate: totalCalls > 0 ? ((bookings / totalCalls) * 100).toFixed(1) : 0,
      successRate:
        totalCalls > 0
          ? (
              ((parseInt(callData?.successful_calls || 0) + parseInt(callData?.interested_calls || 0)) /
                totalCalls) *
              100
            ).toFixed(1)
          : 0
    });
  }

  return metrics.sort((a, b) => Number(b.conversionRate) - Number(a.conversionRate));
}

async function getAIInsights(startDate, endDate, clientKey) {
  const clients = clientKey ? [await getFullClient(clientKey)] : await listClientSummaries();
  const insights = [];

  for (const client of clients) {
    if (!client) continue;

    const callPatterns = await query(
      `
      SELECT 
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as call_count,
        AVG(duration) as avg_duration,
        AVG(quality_score) as avg_quality
      FROM calls 
      WHERE client_key = $1 AND created_at BETWEEN $2 AND $3
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY call_count DESC
      LIMIT 5
    `,
      [client.clientKey, startDate.toISOString(), endDate.toISOString()]
    );

    const sentimentAnalysis = await query(
      `
      SELECT 
        sentiment,
        COUNT(*) as count,
        AVG(quality_score) as avg_quality
      FROM calls 
      WHERE client_key = $1 AND created_at BETWEEN $2 AND $3 AND sentiment IS NOT NULL
      GROUP BY sentiment
    `,
      [client.clientKey, startDate.toISOString(), endDate.toISOString()]
    );

    const peakHour = callPatterns.rows[0];
    const positiveCalls = sentimentAnalysis.rows.find((r) => r.sentiment === 'positive');
    const negativeCalls = sentimentAnalysis.rows.find((r) => r.sentiment === 'negative');

    if (peakHour) {
      insights.push({
        type: 'peak_hour',
        clientName: client.displayName,
        message: `Peak calling hour is ${peakHour.hour}:00 with ${peakHour.call_count} calls and ${parseFloat(peakHour.avg_quality).toFixed(1)} average quality score`,
        priority: 'medium',
        recommendation: `Consider scheduling more calls during ${peakHour.hour}:00 for better results`
      });
    }

    if (positiveCalls && negativeCalls) {
      const positiveRatio = positiveCalls.count / (positiveCalls.count + negativeCalls.count);
      if (positiveRatio < 0.6) {
        insights.push({
          type: 'sentiment',
          clientName: client.displayName,
          message: `Only ${(positiveRatio * 100).toFixed(1)}% of calls have positive sentiment`,
          priority: 'high',
          recommendation: 'Review call scripts and training to improve customer satisfaction'
        });
      }
    }
  }

  return insights;
}

async function getForecasts(startDate, endDate, clientKey) {
  const clients = clientKey ? [await getFullClient(clientKey)] : await listClientSummaries();
  const forecasts = [];

  for (const client of clients) {
    if (!client) continue;

    const currentPeriodCalls = await query(
      `
      SELECT COUNT(*) as count FROM calls 
      WHERE client_key = $1 AND created_at BETWEEN $2 AND $3
    `,
      [client.clientKey, startDate.toISOString(), endDate.toISOString()]
    );

    const previousPeriodStart = new Date(startDate);
    const previousPeriodEnd = new Date(startDate);
    previousPeriodStart.setDate(startDate.getDate() - (endDate - startDate) / (1000 * 60 * 60 * 24));

    const previousPeriodCalls = await query(
      `
      SELECT COUNT(*) as count FROM calls 
      WHERE client_key = $1 AND created_at BETWEEN $2 AND $3
    `,
      [client.clientKey, previousPeriodStart.toISOString(), previousPeriodEnd.toISOString()]
    );

    const currentCalls = parseInt(currentPeriodCalls.rows[0]?.count || 0);
    const previousCalls = parseInt(previousPeriodCalls.rows[0]?.count || 0);
    const growthRate =
      previousCalls > 0 ? (((currentCalls - previousCalls) / previousCalls) * 100).toFixed(1) : 0;

    const forecastCalls = Math.round(currentCalls * (1 + parseFloat(growthRate) / 100));
    const forecastBookings = Math.round(forecastCalls * 0.15);
    const forecastRevenue = forecastBookings * 500;

    forecasts.push({
      clientName: client.displayName,
      clientKey: client.clientKey,
      currentCalls,
      previousCalls,
      growthRate: parseFloat(growthRate),
      forecastCalls,
      forecastBookings,
      forecastRevenue,
      confidence: Math.min(95, Math.max(60, 100 - Math.abs(parseFloat(growthRate))))
    });
  }

  return forecasts;
}

export function createAdminAnalyticsAdvancedRouter() {
  const router = Router();

  router.get('/analytics/advanced', async (req, res) => {
    try {
      const { period = '30d', clientKey } = req.query;

      const endDate = new Date();
      const startDate = new Date();
      switch (period) {
        case '7d':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(endDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(endDate.getDate() - 90);
          break;
        case '1y':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
      }

      const analytics = {
        overview: await getAnalyticsOverview(startDate, endDate, clientKey),
        trends: await getAnalyticsTrends(startDate, endDate, clientKey),
        performance: await getPerformanceMetricsAdvanced(startDate, endDate, clientKey),
        insights: await getAIInsights(startDate, endDate, clientKey),
        forecasts: await getForecasts(startDate, endDate, clientKey)
      };

      res.json(analytics);
    } catch (error) {
      console.error('Error getting advanced analytics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
