// Automated Client Reporting System
// Generates and sends automated reports to clients

import { query, getFullClient } from '../db.js';
import { analyzeCallOutcomes, compareCallOutcomes } from './call-outcome-analyzer.js';
import { getBestCallTimes } from './call-outcome-analyzer.js';
import messagingService from './messaging-service.js';

/**
 * Generate client report
 */
export async function generateClientReport(clientKey, period = 'weekly') {
  try {
    const client = await getFullClient(clientKey);
    if (!client) {
      return { error: 'Client not found' };
    }

    const days = period === 'weekly' ? 7 : period === 'monthly' ? 30 : 7;
    const outcomes = await analyzeCallOutcomes(clientKey, days);
    const bestTimes = await getBestCallTimes(clientKey, days);
    const comparison = await compareCallOutcomes(clientKey, days, days * 2);

    // Get detailed stats
    const { rows: statsRows } = await query(`
      SELECT 
        COUNT(DISTINCT l.id) as total_leads,
        COUNT(DISTINCT c.id) as total_calls,
        COUNT(DISTINCT a.id) as total_bookings,
        COUNT(DISTINCT m.id) as total_messages,
        SUM(CASE WHEN c.outcome = 'booked' THEN 1 ELSE 0 END) as successful_calls
      FROM leads l
      LEFT JOIN calls c ON l.phone = c.lead_phone AND l.client_key = c.client_key
      LEFT JOIN appointments a ON l.phone = a.lead_phone AND l.client_key = a.client_key
      LEFT JOIN messages m ON l.phone = m.lead_phone AND l.client_key = m.client_key
      WHERE l.client_key = $1
        AND l.created_at >= NOW() - INTERVAL '${days} days'
    `, [clientKey]);

    const stats = statsRows[0] || {};

    const report = {
      clientKey,
      clientName: client.display_name,
      period,
      periodDays: days,
      generatedAt: new Date().toISOString(),
      summary: {
        totalLeads: parseInt(stats.total_leads) || 0,
        totalCalls: parseInt(stats.total_calls) || 0,
        totalBookings: parseInt(stats.total_bookings) || 0,
        totalMessages: parseInt(stats.total_messages) || 0,
        conversionRate: outcomes.conversionRate,
        successfulCalls: parseInt(stats.successful_calls) || 0
      },
      performance: {
        conversionRate: outcomes.conversionRate,
        outcomes: outcomes.outcomes,
        sentiments: outcomes.sentiments,
        avgDurations: outcomes.avgDurationsByOutcome
      },
      insights: outcomes.insights,
      recommendations: outcomes.recommendations,
      bestCallTimes: bestTimes.slice(0, 5),
      trends: comparison.comparison || null,
      topObjections: Object.entries(outcomes.objections || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([type, count]) => ({ type, count }))
    };

    return report;
  } catch (error) {
    console.error('[CLIENT REPORT] Error:', error);
    return { error: error.message };
  }
}

/**
 * Format report as email
 */
export function formatReportAsEmail(report) {
  if (report.error) {
    return {
      subject: `Report Error - ${report.clientName}`,
      html: `<p>Unable to generate report: ${report.error}</p>`,
      text: `Unable to generate report: ${report.error}`
    };
  }

  const periodLabel = report.period === 'weekly' ? 'Weekly' : 'Monthly';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .header { background: #5c6ac4; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { padding: 20px; background: #f9fafb; }
        .metric { background: white; padding: 15px; margin: 10px 0; border-radius: 4px; border-left: 4px solid #5c6ac4; }
        .metric-value { font-size: 24px; font-weight: bold; color: #5c6ac4; }
        .insight { padding: 10px; margin: 10px 0; border-radius: 4px; }
        .insight.warning { background: #fff3cd; border-left: 4px solid #ffc107; }
        .insight.success { background: #d4edda; border-left: 4px solid #28a745; }
        .insight.info { background: #d1ecf1; border-left: 4px solid #17a2b8; }
        .recommendation { background: white; padding: 15px; margin: 10px 0; border-radius: 4px; }
        .recommendation.high { border-left: 4px solid #dc3545; }
        .recommendation.medium { border-left: 4px solid #ffc107; }
        .recommendation.low { border-left: 4px solid #17a2b8; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${periodLabel} Performance Report</h1>
        <p>${report.clientName}</p>
        <p>Period: Last ${report.periodDays} days</p>
      </div>
      
      <div class="content">
        <h2>Summary</h2>
        <div class="metric">
          <div>Total Leads</div>
          <div class="metric-value">${report.summary.totalLeads}</div>
        </div>
        <div class="metric">
          <div>Total Calls</div>
          <div class="metric-value">${report.summary.totalCalls}</div>
        </div>
        <div class="metric">
          <div>Total Bookings</div>
          <div class="metric-value">${report.summary.totalBookings}</div>
        </div>
        <div class="metric">
          <div>Conversion Rate</div>
          <div class="metric-value">${report.performance.conversionRate}%</div>
        </div>
        
        ${report.insights.length > 0 ? `
          <h2>Insights</h2>
          ${report.insights.map(insight => `
            <div class="insight ${insight.type}">
              <strong>${insight.title}</strong>
              <p>${insight.message}</p>
            </div>
          `).join('')}
        ` : ''}
        
        ${report.recommendations.length > 0 ? `
          <h2>Recommendations</h2>
          ${report.recommendations.map(rec => `
            <div class="recommendation ${rec.priority}">
              <strong>${rec.action}</strong>
              <p>${rec.reason}</p>
            </div>
          `).join('')}
        ` : ''}
        
        ${report.bestCallTimes.length > 0 ? `
          <h2>Best Call Times</h2>
          <ul>
            ${report.bestCallTimes.map(time => `
              <li>${time.hour}:00 - ${time.conversionRate}% conversion (${time.totalCalls} calls)</li>
            `).join('')}
          </ul>
        ` : ''}
        
        <p style="margin-top: 30px; color: #666; font-size: 12px;">
          Report generated: ${new Date(report.generatedAt).toLocaleString()}
        </p>
      </div>
    </body>
    </html>
  `;

  const text = `
${periodLabel} Performance Report - ${report.clientName}
Period: Last ${report.periodDays} days

SUMMARY:
- Total Leads: ${report.summary.totalLeads}
- Total Calls: ${report.summary.totalCalls}
- Total Bookings: ${report.summary.totalBookings}
- Conversion Rate: ${report.performance.conversionRate}%

${report.insights.length > 0 ? `
INSIGHTS:
${report.insights.map(i => `- ${i.title}: ${i.message}`).join('\n')}
` : ''}

${report.recommendations.length > 0 ? `
RECOMMENDATIONS:
${report.recommendations.map(r => `- ${r.action}: ${r.reason}`).join('\n')}
` : ''}

Report generated: ${new Date(report.generatedAt).toLocaleString()}
  `;

  return {
    subject: `${periodLabel} Report - ${report.clientName} - ${report.summary.totalBookings} Bookings`,
    html,
    text
  };
}

/**
 * Send report to client
 */
export async function sendClientReport(clientKey, period = 'weekly', email = null) {
  try {
    const report = await generateClientReport(clientKey, period);
    if (report.error) {
      return { success: false, error: report.error };
    }

    const client = await getFullClient(clientKey);
    const recipientEmail = email || client.owner_email || client.email;

    if (!recipientEmail) {
      return { success: false, error: 'No email address found for client' };
    }

    const emailContent = formatReportAsEmail(report);

    // Send email
    await messagingService.sendEmail({
      to: recipientEmail,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text
    });

    return {
      success: true,
      report,
      sentTo: recipientEmail
    };
  } catch (error) {
    console.error('[SEND CLIENT REPORT] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Schedule automated reports (to be called by cron)
 */
export async function sendScheduledReports(period = 'weekly') {
  try {
    const { listFullClients } = await import('../db.js');
    const clients = await listFullClients();

    const results = await Promise.all(
      clients
        .filter(client => client.is_enabled)
        .map(async (client) => {
          try {
            return await sendClientReport(client.client_key, period);
          } catch (error) {
            return {
              success: false,
              clientKey: client.client_key,
              error: error.message
            };
          }
        })
    );

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success);

    return {
      total: results.length,
      successful,
      failed: failed.length,
      results
    };
  } catch (error) {
    console.error('[SCHEDULED REPORTS] Error:', error);
    return { error: error.message };
  }
}

