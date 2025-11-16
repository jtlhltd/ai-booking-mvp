// Weekly Report Generator
// Generates comprehensive weekly reports for clients and sends via email

import { query } from '../db.js';
import { DateTime } from 'luxon';
import messagingService from './messaging-service.js';

/**
 * Generate weekly report for a client
 */
export async function generateWeeklyReport(clientKey, weekStart = null) {
  try {
    // Calculate week start (Monday)
    const now = DateTime.now();
    const weekStartDate = weekStart 
      ? DateTime.fromISO(weekStart)
      : now.startOf('week', { weekNumbers: 1 });
    const weekEndDate = weekStartDate.plus({ days: 6 });
    
    // Get client info
    const clientResult = await query(`
      SELECT client_key, display_name, timezone
      FROM tenants
      WHERE client_key = $1
    `, [clientKey]);
    
    if (!clientResult.rows || clientResult.rows.length === 0) {
      throw new Error(`Client not found: ${clientKey}`);
    }
    
    const client = clientResult.rows[0];
    const timezone = client.timezone || 'Europe/London';
    
    // Get metrics for the week
    const [leadsResult, callsResult, bookingsResult, revenueResult] = await Promise.all([
      // New leads
      query(`
        SELECT COUNT(*) as count
        FROM leads
        WHERE client_key = $1
          AND created_at >= $2
          AND created_at < $3
      `, [clientKey, weekStartDate.toISO(), weekEndDate.plus({ days: 1 }).toISO()]),
      
      // Calls made
      query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN outcome = 'booked' THEN 1 END) as booked,
          AVG(duration)::INTEGER as avg_duration
        FROM calls
        WHERE client_key = $1
          AND created_at >= $2
          AND created_at < $3
      `, [clientKey, weekStartDate.toISO(), weekEndDate.plus({ days: 1 }).toISO()]),
      
      // Appointments booked
      query(`
        SELECT COUNT(*) as count
        FROM appointments
        WHERE client_key = $1
          AND created_at >= $2
          AND created_at < $3
      `, [clientKey, weekStartDate.toISO(), weekEndDate.plus({ days: 1 }).toISO()]),
      
      // Estimated revenue (if appointments have revenue data)
      query(`
        SELECT 
          COUNT(*) as appointments,
          COALESCE(SUM((metadata->>'estimated_revenue')::NUMERIC), 0) as estimated_revenue
        FROM appointments
        WHERE client_key = $1
          AND created_at >= $2
          AND created_at < $3
      `, [clientKey, weekStartDate.toISO(), weekEndDate.plus({ days: 1 }).toISO()])
    ]);
    
    const metrics = {
      week: {
        start: weekStartDate.toISO(),
        end: weekEndDate.toISO(),
        startFormatted: weekStartDate.toFormat('dd MMM yyyy'),
        endFormatted: weekEndDate.toFormat('dd MMM yyyy')
      },
      leads: {
        new: parseInt(leadsResult.rows?.[0]?.count || 0, 10)
      },
      calls: {
        total: parseInt(callsResult.rows?.[0]?.total || 0, 10),
        completed: parseInt(callsResult.rows?.[0]?.completed || 0, 10),
        booked: parseInt(callsResult.rows?.[0]?.booked || 0, 10),
        avgDuration: parseInt(callsResult.rows?.[0]?.avg_duration || 0, 10),
        successRate: callsResult.rows?.[0]?.total > 0
          ? ((callsResult.rows?.[0]?.booked / callsResult.rows?.[0]?.total) * 100).toFixed(1)
          : 0
      },
      appointments: {
        booked: parseInt(bookingsResult.rows?.[0]?.count || 0, 10),
        estimatedRevenue: parseFloat(revenueResult.rows?.[0]?.estimated_revenue || 0)
      }
    };
    
    // Get previous week for comparison
    const prevWeekStart = weekStartDate.minus({ days: 7 });
    const prevWeekEnd = prevWeekStart.plus({ days: 6 });
    
    const [prevCallsResult, prevBookingsResult] = await Promise.all([
      query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN outcome = 'booked' THEN 1 END) as booked
        FROM calls
        WHERE client_key = $1
          AND created_at >= $2
          AND created_at < $3
      `, [clientKey, prevWeekStart.toISO(), prevWeekEnd.plus({ days: 1 }).toISO()]),
      
      query(`
        SELECT COUNT(*) as count
        FROM appointments
        WHERE client_key = $1
          AND created_at >= $2
          AND created_at < $3
      `, [clientKey, prevWeekStart.toISO(), prevWeekEnd.plus({ days: 1 }).toISO()])
    ]);
    
    const prevWeekCalls = parseInt(prevCallsResult.rows?.[0]?.total || 0, 10);
    const prevWeekBookings = parseInt(prevBookingsResult.rows?.[0]?.count || 0, 10);
    
    // Calculate changes
    const changes = {
      calls: {
        value: metrics.calls.total - prevWeekCalls,
        percent: prevWeekCalls > 0 
          ? (((metrics.calls.total - prevWeekCalls) / prevWeekCalls) * 100).toFixed(1)
          : metrics.calls.total > 0 ? 100 : 0
      },
      bookings: {
        value: metrics.appointments.booked - prevWeekBookings,
        percent: prevWeekBookings > 0
          ? (((metrics.appointments.booked - prevWeekBookings) / prevWeekBookings) * 100).toFixed(1)
          : metrics.appointments.booked > 0 ? 100 : 0
      }
    };
    
    // Generate HTML email
    const html = generateReportHTML(client, metrics, changes);
    
    // Generate plain text version
    const text = generateReportText(client, metrics, changes);
    
    return {
      clientKey,
      clientName: client.display_name || clientKey,
      week: metrics.week,
      metrics,
      changes,
      html,
      text,
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('[WEEKLY REPORT ERROR]', error);
    throw error;
  }
}

/**
 * Generate HTML email template
 */
function generateReportHTML(client, metrics, changes) {
  const callsChange = changes.calls.value >= 0 
    ? `+${changes.calls.value} (+${changes.calls.percent}%)`
    : `${changes.calls.value} (${changes.calls.percent}%)`;
  const bookingsChange = changes.bookings.value >= 0
    ? `+${changes.bookings.value} (+${changes.bookings.percent}%)`
    : `${changes.bookings.value} (${changes.bookings.percent}%)`;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4F46E5; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
        .metric { background: white; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #4F46E5; }
        .metric-value { font-size: 32px; font-weight: bold; color: #4F46E5; }
        .metric-label { color: #6b7280; font-size: 14px; }
        .change { font-size: 14px; color: ${changes.bookings.value >= 0 ? '#10b981' : '#ef4444'}; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📊 Weekly Report</h1>
          <p>${metrics.week.startFormatted} - ${metrics.week.endFormatted}</p>
        </div>
        <div class="content">
          <h2>Hello ${client.display_name || client.client_key}!</h2>
          <p>Here's what your AI concierge accomplished this week:</p>
          
          <div class="metric">
            <div class="metric-value">${metrics.leads.new}</div>
            <div class="metric-label">New Leads Received</div>
          </div>
          
          <div class="metric">
            <div class="metric-value">${metrics.calls.total}</div>
            <div class="metric-label">Calls Made</div>
            <div class="change">${callsChange} from last week</div>
          </div>
          
          <div class="metric">
            <div class="metric-value">${metrics.appointments.booked}</div>
            <div class="metric-label">Appointments Booked</div>
            <div class="change">${bookingsChange} from last week</div>
          </div>
          
          <div class="metric">
            <div class="metric-value">${metrics.calls.successRate}%</div>
            <div class="metric-label">Booking Success Rate</div>
          </div>
          
          ${metrics.appointments.estimatedRevenue > 0 ? `
          <div class="metric">
            <div class="metric-value">£${metrics.appointments.estimatedRevenue.toFixed(2)}</div>
            <div class="metric-label">Estimated Revenue</div>
          </div>
          ` : ''}
          
          <p style="margin-top: 30px;">
            <strong>Average Call Duration:</strong> ${Math.floor(metrics.calls.avgDuration / 60)}:${String(metrics.calls.avgDuration % 60).padStart(2, '0')}
          </p>
        </div>
        <div class="footer">
          <p>Generated by AI Booking System</p>
          <p>Visit your dashboard for more details: <a href="https://ai-booking-mvp.onrender.com/client-dashboard?key=${client.client_key}">View Dashboard</a></p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate plain text email
 */
function generateReportText(client, metrics, changes) {
  const callsChange = changes.calls.value >= 0 
    ? `+${changes.calls.value} (+${changes.calls.percent}%)`
    : `${changes.calls.value} (${changes.calls.percent}%)`;
  const bookingsChange = changes.bookings.value >= 0
    ? `+${changes.bookings.value} (+${changes.bookings.percent}%)`
    : `${changes.bookings.value} (${changes.bookings.percent}%)`;
  
  return `
Weekly Report - ${metrics.week.startFormatted} to ${metrics.week.endFormatted}

Hello ${client.display_name || client.client_key}!

Here's what your AI concierge accomplished this week:

📊 New Leads: ${metrics.leads.new}
📞 Calls Made: ${metrics.calls.total} (${callsChange} from last week)
📅 Appointments Booked: ${metrics.appointments.booked} (${bookingsChange} from last week)
✅ Success Rate: ${metrics.calls.successRate}%
⏱️  Average Call Duration: ${Math.floor(metrics.calls.avgDuration / 60)}:${String(metrics.calls.avgDuration % 60).padStart(2, '0')}
${metrics.appointments.estimatedRevenue > 0 ? `💰 Estimated Revenue: £${metrics.appointments.estimatedRevenue.toFixed(2)}\n` : ''}

View your full dashboard: https://ai-booking-mvp.onrender.com/client-dashboard?key=${client.client_key}

Generated by AI Booking System
  `.trim();
}

/**
 * Send weekly report via email
 */
export async function sendWeeklyReport(clientKey, report) {
  try {
    // Get client email from tenant config
    const clientResult = await query(`
      SELECT display_name, vapi_json
      FROM tenants
      WHERE client_key = $1
    `, [clientKey]);
    
    if (!clientResult.rows || clientResult.rows.length === 0) {
      throw new Error(`Client not found: ${clientKey}`);
    }
    
    const client = clientResult.rows[0];
    const clientConfig = client.vapi_json || {};
    const clientEmail = clientConfig.email || clientConfig.client_email;
    
    if (!clientEmail) {
      console.warn(`[WEEKLY REPORT] No email found for client ${clientKey}, skipping email send`);
      return { sent: false, reason: 'No email configured' };
    }
    
    // Send email via messaging service
    const emailResult = await messagingService.sendEmail({
      to: clientEmail,
      subject: `📊 Weekly Report - ${report.week.startFormatted} to ${report.week.endFormatted}`,
      html: report.html,
      text: report.text
    });
    
    return {
      sent: true,
      email: clientEmail,
      messageId: emailResult?.messageId || null
    };
  } catch (error) {
    console.error('[SEND WEEKLY REPORT ERROR]', error);
    throw error;
  }
}

/**
 * Generate and send weekly report for all active clients
 */
export async function generateAndSendAllWeeklyReports() {
  try {
    console.log('[WEEKLY REPORT] Starting weekly report generation...');
    
    // Get all active clients
    const clientsResult = await query(`
      SELECT client_key, display_name
      FROM tenants
      WHERE is_enabled = TRUE
    `);
    
    if (!clientsResult.rows || clientsResult.rows.length === 0) {
      console.log('[WEEKLY REPORT] No active clients found');
      return { generated: 0, sent: 0, errors: [] };
    }
    
    const clients = clientsResult.rows;
    const results = {
      generated: 0,
      sent: 0,
      errors: []
    };
    
    for (const client of clients) {
      try {
        // Generate report
        const report = await generateWeeklyReport(client.client_key);
        results.generated++;
        
        // Send email
        const sendResult = await sendWeeklyReport(client.client_key, report);
        if (sendResult.sent) {
          results.sent++;
        }
        
        console.log(`[WEEKLY REPORT] Generated and sent report for ${client.client_key}`);
      } catch (error) {
        console.error(`[WEEKLY REPORT] Error for client ${client.client_key}:`, error);
        results.errors.push({
          clientKey: client.client_key,
          error: error.message
        });
      }
    }
    
    console.log('[WEEKLY REPORT] Completed:', results);
    return results;
  } catch (error) {
    console.error('[WEEKLY REPORT] Fatal error:', error);
    throw error;
  }
}

export default {
  generateWeeklyReport,
  sendWeeklyReport,
  generateAndSendAllWeeklyReports
};

