// lib/email-alerts.js
// Email notification system for quality alerts

import nodemailer from 'nodemailer';

// Configure email transport
// Supports multiple providers via environment variables
function createEmailTransporter() {
  // Option 1: Gmail
  if (process.env.EMAIL_SERVICE === 'gmail' && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
    return nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }
  
  // Option 2: SendGrid
  if (process.env.SENDGRID_API_KEY) {
    return nodemailer.createTransporter({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY
      }
    });
  }
  
  // Option 3: AWS SES
  if (process.env.AWS_SES_REGION && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return nodemailer.createTransporter({
      host: `email-smtp.${process.env.AWS_SES_REGION}.amazonaws.com`,
      port: 587,
      auth: {
        user: process.env.AWS_ACCESS_KEY_ID,
        pass: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
  }
  
  // Option 4: SMTP (generic)
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
    return nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });
  }
  
  // No email configured
  return null;
}

/**
 * Send quality alert email to client
 * @param {Object} client - Client object with contact info
 * @param {Array} alerts - Array of alert objects
 * @param {Object} metrics - Quality metrics
 */
export async function sendQualityAlert(client, alerts, metrics) {
  const transporter = createEmailTransporter();
  
  if (!transporter) {
    console.log('[EMAIL ALERT] No email service configured - skipping email alert');
    return false;
  }
  
  const { contact, displayName, client_key } = client;
  
  if (!contact?.email) {
    console.log(`[EMAIL ALERT] No email configured for ${displayName || client_key}`);
    return false;
  }
  
  const severity = alerts[0]?.severity || 'medium';
  const subjectPrefix = severity === 'high' ? '🚨 URGENT' : '⚠️';
  
  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
          line-height: 1.6; 
          color: #333; 
          margin: 0;
          padding: 0;
        }
        .container { 
          max-width: 600px; 
          margin: 0 auto; 
          background: #f5f5f5;
        }
        .header { 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
          color: white; 
          padding: 40px 30px; 
          text-align: center; 
        }
        .header h1 {
          margin: 0 0 10px 0;
          font-size: 2rem;
        }
        .header p {
          margin: 0;
          opacity: 0.9;
          font-size: 1.1rem;
        }
        .content {
          background: white;
          padding: 30px;
        }
        .alert { 
          background: #fff3cd; 
          border-left: 4px solid #ffc107; 
          padding: 20px; 
          margin: 20px 0; 
          border-radius: 5px; 
        }
        .alert.high { 
          background: #f8d7da; 
          border-left-color: #dc3545; 
        }
        .alert h3 {
          margin: 0 0 15px 0;
          color: #333;
        }
        .alert p {
          margin: 8px 0;
        }
        .alert .label {
          font-weight: 600;
          color: #666;
        }
        .metrics { 
          background: #f8f9fa; 
          padding: 20px; 
          border-radius: 8px; 
          margin: 25px 0; 
        }
        .metrics h3 {
          margin: 0 0 15px 0;
          color: #333;
        }
        .metric-row { 
          display: flex; 
          justify-content: space-between; 
          padding: 10px 0; 
          border-bottom: 1px solid #dee2e6; 
        }
        .metric-row:last-child {
          border-bottom: none;
        }
        .metric-row strong {
          color: #667eea;
        }
        .cta { 
          text-align: center; 
          margin: 30px 0; 
        }
        .button { 
          background: #667eea; 
          color: white; 
          padding: 15px 35px; 
          text-decoration: none; 
          border-radius: 8px; 
          display: inline-block; 
          font-weight: 600;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .button:hover {
          background: #5568d3;
        }
        .footer {
          background: #f8f9fa;
          padding: 20px;
          text-align: center;
          color: #666;
          font-size: 0.9rem;
        }
        .footer a {
          color: #667eea;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${subjectPrefix} Call Quality Alert</h1>
          <p>${displayName || client_key}</p>
        </div>
        
        <div class="content">
          <p style="font-size: 1.1rem; margin-bottom: 20px;">
            We've detected <strong>${alerts.length} quality issue${alerts.length > 1 ? 's' : ''}</strong> with your AI calling system in the last 24 hours:
          </p>
          
          ${alerts.map(alert => `
            <div class="alert ${alert.severity}">
              <h3>${alert.severity === 'high' ? '🚨' : '⚠️'} ${alert.message}</h3>
              <p><span class="label">Action Required:</span> ${alert.action}</p>
              <p><span class="label">Impact:</span> ${alert.impact}</p>
              <p style="color: #999; font-size: 0.9rem; margin-top: 10px;">
                Expected: ${alert.expected} | Actual: ${alert.actual}
              </p>
            </div>
          `).join('')}
          
          <div class="metrics">
            <h3>📊 Current Performance (Last 24 Hours)</h3>
            <div class="metric-row">
              <span>Total Calls</span>
              <strong>${metrics.total_calls || 0}</strong>
            </div>
            <div class="metric-row">
              <span>Success Rate</span>
              <strong>${((metrics.success_rate || 0) * 100).toFixed(1)}%</strong>
            </div>
            <div class="metric-row">
              <span>Booking Rate</span>
              <strong>${((metrics.booking_rate || 0) * 100).toFixed(1)}%</strong>
            </div>
            <div class="metric-row">
              <span>Avg Quality Score</span>
              <strong>${(metrics.avg_quality_score || 0).toFixed(1)}/10</strong>
            </div>
            <div class="metric-row">
              <span>Avg Call Duration</span>
              <strong>${Math.round(metrics.avg_duration || 0)}s</strong>
            </div>
          </div>
          
          <div class="cta">
            <a href="https://ai-booking-mvp.onrender.com/client-dashboard?client=${client_key}" class="button">
              View Full Dashboard →
            </a>
          </div>
          
          <p style="color: #666; font-size: 0.9rem; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef;">
            <strong>💡 Tip:</strong> This alert was triggered automatically. To adjust alert thresholds or turn off notifications, 
            visit your dashboard settings.
          </p>
        </div>
        
        <div class="footer">
          <p>AI Booking MVP - Quality Monitoring System</p>
          <p style="margin-top: 5px;">
            Need help? <a href="mailto:support@yourdomain.com">Contact Support</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  const mailOptions = {
    from: `"AI Booking System" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
    to: contact.email,
    subject: `${subjectPrefix} Call Quality Alert - ${displayName || client_key}`,
    html: htmlBody
  };
  
  try {
    await transporter.sendMail(mailOptions);
    console.log(`[EMAIL ALERT] ✅ Sent to ${contact.email} (${alerts.length} alerts, severity: ${severity})`);
    return true;
  } catch (error) {
    console.error(`[EMAIL ALERT ERROR]`, error.message);
    return false;
  }
}

/**
 * Send weekly quality summary email
 * @param {Object} client - Client object
 * @param {Object} weeklyStats - Weekly statistics
 */
export async function sendWeeklySummary(client, weeklyStats) {
  const transporter = createEmailTransporter();
  
  if (!transporter || !client.contact?.email) {
    return false;
  }
  
  // TODO: Implement weekly summary email
  console.log(`[WEEKLY SUMMARY] Would send to ${client.contact.email}`);
  return true;
}

