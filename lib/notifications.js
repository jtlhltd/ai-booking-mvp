// lib/notifications.js
// Real-time notification system for admin and client alerts

/**
 * Send Slack notification (for admin alerts)
 * @param {string} message - Message to send
 * @param {string} channel - Slack channel (default: general)
 */
export async function sendSlackNotification(message, channel = 'general') {
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
  
  if (!slackWebhookUrl) {
    console.log('[SLACK] Webhook not configured, skipping notification');
    return { ok: false, reason: 'not_configured' };
  }
  
  try {
    const response = await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: message,
        channel: channel
      })
    });
    
    if (response.ok) {
      console.log('[SLACK] ✅ Notification sent:', message.substring(0, 50) + '...');
      return { ok: true };
    } else {
      console.error('[SLACK] ❌ Failed:', response.statusText);
      return { ok: false, reason: response.statusText };
    }
  } catch (error) {
    console.error('[SLACK ERROR]', error);
    return { ok: false, error: error.message };
  }
}

/**
 * Send SMS notification (for client or admin alerts)
 * @param {string} to - Phone number
 * @param {string} message - Message content
 */
export async function sendSMSNotification(to, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  
  if (!accountSid || !authToken || !fromNumber) {
    console.log('[SMS] Twilio not configured, skipping notification');
    return { ok: false, reason: 'not_configured' };
  }
  
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        To: to,
        From: fromNumber,
        Body: message
      })
    });
    
    if (response.ok) {
      console.log(`[SMS] ✅ Sent to ${to}`);
      return { ok: true };
    } else {
      const error = await response.json();
      console.error('[SMS] ❌ Failed:', error);
      return { ok: false, error };
    }
  } catch (error) {
    console.error('[SMS ERROR]', error);
    return { ok: false, error: error.message };
  }
}

/**
 * Notify admin when client uploads leads
 * @param {Object} params - Notification parameters
 */
export async function notifyLeadUpload({ clientKey, clientName, leadCount, importMethod }) {
  const message = `🚨 *Lead Upload Alert*
  
Client: ${clientName || clientKey}
Leads: ${leadCount}
Method: ${importMethod}
Time: ${new Date().toLocaleString('en-GB')}

Campaign starting in 5 minutes...`;
  
  // Send to both Slack and SMS
  await sendSlackNotification(message);
  
  // SMS to admin (your number)
  const adminPhone = process.env.ADMIN_PHONE;
  if (adminPhone) {
    await sendSMSNotification(
      adminPhone,
      `🚨 ${clientName || clientKey} uploaded ${leadCount} leads. Campaign starting now.`
    );
  }
  
  console.log(`[NOTIFICATION] Lead upload alert sent for ${clientKey}`);
}

/**
 * Notify client when appointment is booked
 * @param {Object} params - Booking details
 */
export async function notifyAppointmentBooked({ clientKey, clientPhone, leadName, appointmentTime }) {
  if (!clientPhone) {
    console.log('[NOTIFICATION] No client phone for booking notification');
    return;
  }
  
  const message = `🎉 New Appointment Booked!

${leadName} scheduled for ${new Date(appointmentTime).toLocaleString('en-GB', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  })}

View dashboard: https://ai-booking-mvp.onrender.com/client-dashboard?client=${clientKey}`;
  
  await sendSMSNotification(clientPhone, message);
  
  console.log(`[NOTIFICATION] Booking alert sent to client ${clientKey}`);
}

/**
 * Send daily summary email
 * @param {Object} params - Summary data
 */
export async function sendDailySummary({ clientKey, clientEmail, clientName, summary }) {
  const {
    leadsProcessed,
    callsMade,
    connected,
    appointmentsBooked,
    connectionRate,
    conversionRate,
    estimatedRevenue,
    monthlyROI
  } = summary;
  
  const emailContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #000; color: white; padding: 20px; text-align: center; }
    .stat { background: #f8f9fa; padding: 15px; margin: 10px 0; border-left: 4px solid #000; }
    .stat-value { font-size: 2rem; font-weight: bold; color: #000; }
    .stat-label { font-size: 0.9rem; color: #666; }
    .cta { background: #000; color: white; padding: 15px 30px; text-align: center; text-decoration: none; display: inline-block; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Your Daily Results</h2>
      <p>${new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>
    
    <h3>Hi ${clientName},</h3>
    <p>Here's your 2-minute summary:</p>
    
    <div class="stat">
      <div class="stat-value">${appointmentsBooked}</div>
      <div class="stat-label">Appointments Booked Today</div>
    </div>
    
    <div class="stat">
      <div class="stat-value">${callsMade}</div>
      <div class="stat-label">Leads Called</div>
    </div>
    
    <div class="stat">
      <div class="stat-value">${connected} (${connectionRate}%)</div>
      <div class="stat-label">Connected Rate</div>
    </div>
    
    <div class="stat">
      <div class="stat-value">${conversionRate}%</div>
      <div class="stat-label">Conversion Rate</div>
    </div>
    
    <div class="stat">
      <div class="stat-value">£${estimatedRevenue}</div>
      <div class="stat-label">Estimated Revenue Today</div>
    </div>
    
    <div class="stat">
      <div class="stat-value">${monthlyROI}x</div>
      <div class="stat-label">ROI This Month</div>
    </div>
    
    <p><strong>Tomorrow:</strong> Calling ${leadsProcessed} more leads + following up with today's no-answers.</p>
    
    <a href="https://ai-booking-mvp.onrender.com/client-dashboard?client=${clientKey}" class="cta">View Full Dashboard</a>
    
    <p style="margin-top: 30px; color: #666; font-size: 0.9rem;">
      Questions? Just hit reply to this email.
    </p>
  </div>
</body>
</html>
  `;
  
  // TODO: Implement email sending (Nodemailer or similar)
  console.log(`[DAILY SUMMARY] Would send to ${clientEmail}`);
  
  // For now, store in database for later sending
  return {
    to: clientEmail,
    subject: `Your Daily Results - ${appointmentsBooked} Appointments Booked Today`,
    html: emailContent,
    scheduledFor: new Date().toISOString()
  };
}

