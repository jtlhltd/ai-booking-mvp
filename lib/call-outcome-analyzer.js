// Call Outcome Analyzer
// Analyzes call outcomes, identifies patterns, and provides actionable insights

import { query } from '../db.js';
import { analyzeSentiment, extractObjections, extractKeyPhrases } from './call-quality-analysis.js';

/**
 * Analyze call outcomes for a client
 */
export async function analyzeCallOutcomes(clientKey, days = 30) {
  try {
    const { rows } = await query(`
      SELECT 
        c.*,
        l.name as lead_name,
        l.service,
        l.source
      FROM calls c
      LEFT JOIN leads l ON c.lead_phone = l.phone AND c.client_key = l.client_key
      WHERE c.client_key = $1
        AND c.created_at >= NOW() - INTERVAL '${days} days'
      ORDER BY c.created_at DESC
    `, [clientKey]);

    if (rows.length === 0) {
      return {
        totalCalls: 0,
        insights: [],
        recommendations: []
      };
    }

    // Analyze outcomes
    const outcomes = {
      booked: 0,
      no_answer: 0,
      rejected: 0,
      callback_requested: 0,
      voicemail: 0,
      other: 0
    };

    const sentiments = {
      positive: 0,
      neutral: 0,
      negative: 0
    };

    const objections = {};
    const avgDurations = {};
    const dropoffPoints = [];

    for (const call of rows) {
      // Count outcomes
      const outcome = call.outcome || call.status || 'other';
      outcomes[outcome] = (outcomes[outcome] || 0) + 1;

      // Analyze sentiment
      if (call.transcript) {
        const sentiment = analyzeSentiment(call.transcript);
        sentiments[sentiment] = (sentiments[sentiment] || 0) + 1;

        // Extract objections
        const callObjections = extractObjections(call.transcript);
        callObjections.forEach(obj => {
          objections[obj] = (objections[obj] || 0) + 1;
        });
      }

      // Track durations by outcome
      if (call.duration) {
        if (!avgDurations[outcome]) {
          avgDurations[outcome] = [];
        }
        avgDurations[outcome].push(call.duration);
      }

      // Track dropoff points (if call ended early)
      if (call.duration && call.duration < 30 && outcome !== 'booked') {
        dropoffPoints.push({
          duration: call.duration,
          outcome,
          sentiment: call.sentiment || 'unknown'
        });
      }
    }

    // Calculate averages
    const avgDurationsByOutcome = {};
    for (const [outcome, durations] of Object.entries(avgDurations)) {
      avgDurationsByOutcome[outcome] = Math.round(
        durations.reduce((a, b) => a + b, 0) / durations.length
      );
    }

    // Calculate conversion rate
    const totalCalls = rows.length;
    const bookedCalls = outcomes.booked || 0;
    const conversionRate = totalCalls > 0 ? (bookedCalls / totalCalls) * 100 : 0;

    // Generate insights
    const insights = [];
    const recommendations = [];

    // Conversion rate insight
    if (conversionRate < 20) {
      insights.push({
        type: 'warning',
        title: 'Low Conversion Rate',
        message: `Only ${conversionRate.toFixed(1)}% of calls result in bookings. Industry average is 25-35%.`,
        impact: 'high'
      });
      recommendations.push({
        priority: 'high',
        action: 'Review call scripts and objection handling',
        reason: 'Conversion rate below industry average'
      });
    } else if (conversionRate >= 30) {
      insights.push({
        type: 'success',
        title: 'Excellent Conversion Rate',
        message: `${conversionRate.toFixed(1)}% conversion rate is above industry average!`,
        impact: 'positive'
      });
    }

    // No answer rate
    const noAnswerRate = (outcomes.no_answer / totalCalls) * 100;
    if (noAnswerRate > 40) {
      insights.push({
        type: 'warning',
        title: 'High No-Answer Rate',
        message: `${noAnswerRate.toFixed(1)}% of calls go unanswered. Consider calling at different times.`,
        impact: 'medium'
      });
      recommendations.push({
        priority: 'medium',
        action: 'Optimize calling times based on lead source',
        reason: 'High no-answer rate suggests timing issues'
      });
    }

    // Rejection rate
    const rejectionRate = (outcomes.rejected / totalCalls) * 100;
    if (rejectionRate > 30) {
      insights.push({
        type: 'warning',
        title: 'High Rejection Rate',
        message: `${rejectionRate.toFixed(1)}% of calls are rejected. Review opening and value proposition.`,
        impact: 'high'
      });
      recommendations.push({
        priority: 'high',
        action: 'A/B test different opening lines',
        reason: 'High rejection rate indicates script issues'
      });
    }

    // Objection analysis
    const topObjections = Object.entries(objections)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    if (topObjections.length > 0) {
      insights.push({
        type: 'info',
        title: 'Top Objections',
        message: `Most common objections: ${topObjections.map(([obj, count]) => `${obj} (${count}x)`).join(', ')}`,
        impact: 'medium'
      });
      recommendations.push({
        priority: 'medium',
        action: `Improve handling for: ${topObjections[0][0]}`,
        reason: 'Most frequent objection needs better response'
      });
    }

    // Sentiment analysis
    const positiveRate = (sentiments.positive / totalCalls) * 100;
    if (positiveRate < 40) {
      insights.push({
        type: 'warning',
        title: 'Low Positive Sentiment',
        message: `Only ${positiveRate.toFixed(1)}% of calls have positive sentiment.`,
        impact: 'medium'
      });
    }

    // Early dropoff analysis
    if (dropoffPoints.length > totalCalls * 0.2) {
      insights.push({
        type: 'warning',
        title: 'High Early Dropoff Rate',
        message: `${dropoffPoints.length} calls ended within 30 seconds. Review opening 30 seconds.`,
        impact: 'high'
      });
      recommendations.push({
        priority: 'high',
        action: 'Optimize first 30 seconds of call script',
        reason: 'High early dropoff indicates opening issues'
      });
    }

    return {
      totalCalls,
      conversionRate: parseFloat(conversionRate.toFixed(2)),
      outcomes,
      sentiments,
      objections,
      avgDurationsByOutcome,
      dropoffPoints: dropoffPoints.length,
      insights,
      recommendations,
      period: `${days} days`
    };
  } catch (error) {
    console.error('[CALL OUTCOME ANALYZER] Error:', error);
    return {
      error: error.message,
      totalCalls: 0,
      insights: [],
      recommendations: []
    };
  }
}

/**
 * Compare call outcomes across time periods
 */
export async function compareCallOutcomes(clientKey, period1Days = 7, period2Days = 7) {
  try {
    const current = await analyzeCallOutcomes(clientKey, period1Days);
    const previous = await analyzeCallOutcomes(clientKey, period2Days);

    const comparison = {
      conversionRate: {
        current: current.conversionRate,
        previous: previous.conversionRate,
        change: current.conversionRate - previous.conversionRate,
        trend: current.conversionRate > previous.conversionRate ? 'up' : 'down'
      },
      totalCalls: {
        current: current.totalCalls,
        previous: previous.totalCalls,
        change: current.totalCalls - previous.totalCalls
      },
      bookedCalls: {
        current: current.outcomes.booked || 0,
        previous: previous.outcomes.booked || 0,
        change: (current.outcomes.booked || 0) - (previous.outcomes.booked || 0)
      }
    };

    return {
      current,
      previous,
      comparison,
      period1: `${period1Days} days (current)`,
      period2: `${period2Days} days (previous)`
    };
  } catch (error) {
    console.error('[CALL OUTCOME COMPARISON] Error:', error);
    return { error: error.message };
  }
}

/**
 * Get best performing call times
 */
export async function getBestCallTimes(clientKey, days = 30) {
  try {
    const { rows } = await query(`
      SELECT 
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE outcome = 'booked') as booked_calls,
        AVG(duration) as avg_duration
      FROM calls
      WHERE client_key = $1
        AND created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY 
        (COUNT(*) FILTER (WHERE outcome = 'booked')::float / NULLIF(COUNT(*), 0)) DESC
    `, [clientKey]);

    return rows.map(row => ({
      hour: parseInt(row.hour),
      totalCalls: parseInt(row.total_calls),
      bookedCalls: parseInt(row.booked_calls),
      conversionRate: row.total_calls > 0 
        ? (row.booked_calls / row.total_calls * 100).toFixed(1)
        : 0,
      avgDuration: Math.round(parseFloat(row.avg_duration) || 0)
    }));
  } catch (error) {
    console.error('[BEST CALL TIMES] Error:', error);
    return [];
  }
}

