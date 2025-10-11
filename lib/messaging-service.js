// lib/messaging-service.js
// Unified SMS and Email service for all client communications

import twilio from 'twilio';
import nodemailer from 'nodemailer';

class MessagingService {
  constructor() {
    this.twilioClient = null;
    this.emailTransporter = null;
    this.initialized = false;
    this.initialize();
  }

  initialize() {
    try {
      // Initialize Twilio SMS
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        this.twilioClient = twilio(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN
        );
        console.log('✅ Twilio SMS initialized');
      } else {
        console.warn('⚠️ Twilio credentials not found - SMS disabled');
      }

      // Initialize Email Service
      if (process.env.EMAIL_SERVICE && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        this.emailTransporter = nodemailer.createTransport({
          service: process.env.EMAIL_SERVICE,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });
        console.log('✅ Email service initialized');
      } else {
        console.warn('⚠️ Email credentials not found - Email disabled');
      }

      this.initialized = true;
    } catch (error) {
      console.error('❌ Error initializing messaging services:', error.message);
    }
  }

  /**
   * Send SMS via Twilio
   * @param {Object} params - SMS parameters
   * @returns {Promise<Object>} - Send result
   */
  async sendSMS({ to, body, from = null, messagingServiceSid = null }) {
    if (!this.twilioClient) {
      console.error('[SMS] Twilio not configured');
      return { success: false, error: 'twilio_not_configured' };
    }

    try {
      // Use Messaging Service SID if provided, otherwise use from number
      const payload = { to, body };
      
      if (messagingServiceSid) {
        payload.messagingServiceSid = messagingServiceSid;
      } else if (from) {
        payload.from = from;
      } else if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
        payload.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
      } else if (process.env.TWILIO_FROM_NUMBER) {
        payload.from = process.env.TWILIO_FROM_NUMBER;
      } else {
        console.error('[SMS] No from number or messaging service SID configured');
        return { success: false, error: 'no_from_number' };
      }

      const message = await this.twilioClient.messages.create(payload);

      console.log(`[SMS] ✅ Sent to ${to} - SID: ${message.sid}`);

      return {
        success: true,
        sid: message.sid,
        status: message.status,
        to,
        body
      };
    } catch (error) {
      console.error(`[SMS] ❌ Error sending to ${to}:`, error.message);
      return {
        success: false,
        error: error.message,
        code: error.code,
        to
      };
    }
  }

  /**
   * Send Email via Nodemailer
   * @param {Object} params - Email parameters
   * @returns {Promise<Object>} - Send result
   */
  async sendEmail({ to, subject, body, html = null, from = null }) {
    if (!this.emailTransporter) {
      console.error('[EMAIL] Email service not configured');
      return { success: false, error: 'email_not_configured' };
    }

    try {
      const mailOptions = {
        from: from || process.env.EMAIL_USER,
        to,
        subject,
        text: body,
        html: html || body
      };

      const info = await this.emailTransporter.sendMail(mailOptions);

      console.log(`[EMAIL] ✅ Sent to ${to} - ID: ${info.messageId}`);

      return {
        success: true,
        messageId: info.messageId,
        to,
        subject
      };
    } catch (error) {
      console.error(`[EMAIL] ❌ Error sending to ${to}:`, error.message);
      return {
        success: false,
        error: error.message,
        to
      };
    }
  }

  /**
   * Send appointment confirmation SMS
   */
  async sendAppointmentConfirmationSMS({ to, leadName, businessName, service, appointmentTime, location, businessPhone }) {
    const message = `✅ Confirmed! Your ${service} appointment with ${businessName} is ${appointmentTime}. Location: ${location || 'TBD'}. Reply CANCEL to reschedule or call ${businessPhone}.`;
    
    return await this.sendSMS({ to, body: message });
  }

  /**
   * Send appointment confirmation email
   */
  async sendAppointmentConfirmationEmail({ to, leadName, businessName, service, appointmentTime, location, businessPhone, appointmentId }) {
    const subject = `Appointment Confirmed - ${this.formatDate(appointmentTime)}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">✅ Appointment Confirmed</h1>
        </div>
        
        <div style="background: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <h2 style="color: #333; margin-bottom: 20px;">Hi ${leadName},</h2>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 30px;">
            Your appointment with <strong>${businessName}</strong> has been confirmed!
          </p>
          
          <div style="background: #f8f9fa; padding: 25px; border-radius: 8px; margin: 30px 0; border-left: 4px solid #667eea;">
            <h3 style="color: #333; margin-top: 0;">📅 Appointment Details</h3>
            <p style="color: #666; margin: 10px 0;"><strong>Date:</strong> ${this.formatDate(appointmentTime)}</p>
            <p style="color: #666; margin: 10px 0;"><strong>Time:</strong> ${this.formatTime(appointmentTime)}</p>
            <p style="color: #666; margin: 10px 0;"><strong>Location:</strong> ${location || 'Will be provided'}</p>
            <p style="color: #666; margin: 10px 0;"><strong>Service:</strong> ${service}</p>
          </div>
          
          <p style="color: #666; line-height: 1.6; margin-top: 30px;">
            Need to reschedule? Reply to this email or call ${businessPhone}.
          </p>
          
          <p style="color: #666; line-height: 1.6;">
            We look forward to seeing you!<br><br>
            <strong>${businessName}</strong><br>
            📞 ${businessPhone}
          </p>
        </div>
      </div>
    `;
    
    return await this.sendEmail({ to, subject, body: subject, html });
  }

  /**
   * Send appointment reminder SMS
   */
  async sendAppointmentReminderSMS({ to, businessName, service, appointmentTime, location, reminderType }) {
    const message = reminderType === '24h'
      ? `Reminder: Your ${service} appointment with ${businessName} is tomorrow at ${this.formatTime(appointmentTime)}. Reply CONFIRM or CANCEL.`
      : `Your ${service} appointment with ${businessName} is in 1 hour! Location: ${location || 'TBD'}. See you soon!`;
    
    return await this.sendSMS({ to, body: message });
  }

  /**
   * Send follow-up SMS (for no-answer, voicemail, etc.)
   */
  async sendFollowUpSMS({ to, message }) {
    return await this.sendSMS({ to, body: message });
  }

  /**
   * Send follow-up email
   */
  async sendFollowUpEmail({ to, subject, message, businessName, bookingLink }) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="white-space: pre-wrap; color: #333; line-height: 1.6;">${message}</div>
          
          ${bookingLink ? `
          <div style="text-align: center; margin: 30px 0;">
            <a href="${bookingLink}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Book Now</a>
          </div>
          ` : ''}
          
          <p style="color: #666; margin-top: 30px;">
            Best regards,<br>
            <strong>${businessName}</strong>
          </p>
        </div>
      </div>
    `;
    
    return await this.sendEmail({ to, subject, body: message, html });
  }

  /**
   * Utility: Format date
   */
  formatDate(date) {
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Utility: Format time
   */
  formatTime(date) {
    const d = new Date(date);
    return d.toLocaleTimeString('en-GB', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  /**
   * Check if services are configured
   */
  isConfigured() {
    return {
      sms: !!this.twilioClient,
      email: !!this.emailTransporter,
      both: !!(this.twilioClient && this.emailTransporter)
    };
  }
}

// Export singleton instance
const messagingService = new MessagingService();
export default messagingService;

