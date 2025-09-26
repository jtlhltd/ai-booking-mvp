// SMS-to-Email Pipeline for Lead Conversion
import twilio from 'twilio';
import nodemailer from 'nodemailer';

class SMSEmailPipeline {
  constructor(bookingSystem = null) {
    this.twilioClient = null;
    this.emailTransporter = null;
    this.bookingSystem = bookingSystem; // Passed from outside to avoid circular dependency
    this.pendingLeads = new Map(); // Store leads waiting for email
    this.initializeServices();
  }

  async initializeServices() {
    try {
      // Initialize Twilio SMS
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        this.twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
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
      }

      console.log('✅ SMS-Email Pipeline services initialized');
    } catch (error) {
      console.error('❌ Error initializing SMS-Email Pipeline:', error.message);
    }
  }

  async initiateLeadCapture(leadData) {
    try {
      const leadId = `lead_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Store lead data
      this.pendingLeads.set(leadId, {
        ...leadData,
        leadId: leadId,
        status: 'waiting_for_email',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      });

      // Send SMS asking for email
      const smsMessage = `Hi ${leadData.decisionMaker}, thanks for your interest in our AI booking service! Please reply with your email address so I can send you the demo booking link.`;
      
      await this.sendSMS({
        to: leadData.phoneNumber,
        body: smsMessage
      });

      return {
        success: true,
        leadId: leadId,
        message: 'SMS sent asking for email address'
      };

    } catch (error) {
      console.error('❌ Error initiating lead capture:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async processEmailResponse(phoneNumber, emailAddress) {
    try {
      // Find the lead by phone number
      let leadData = null;
      let leadId = null;

      for (const [id, lead] of this.pendingLeads.entries()) {
        if (lead.phoneNumber === phoneNumber && lead.status === 'waiting_for_email') {
          leadData = lead;
          leadId = id;
          break;
        }
      }

      if (!leadData) {
        return {
          success: false,
          message: 'No pending lead found for this phone number'
        };
      }

      // Update lead with email
      leadData.email = emailAddress;
      leadData.status = 'email_received';
      leadData.emailReceivedAt = new Date();

      // Generate booking link
      const bookingLink = `${process.env.BASE_URL || 'https://ai-booking-mvp.onrender.com'}/booking-dashboard.html?leadId=${leadId}&email=${encodeURIComponent(emailAddress)}&phone=${encodeURIComponent(phoneNumber)}`;

      // Send confirmation email with booking link
      await this.sendConfirmationEmail(leadData, bookingLink);

      // Send SMS confirmation
      await this.sendSMS({
        to: phoneNumber,
        body: `Perfect! I've sent the demo booking link to ${emailAddress}. Check your email and click the link to schedule your demo call.`
      });

      return {
        success: true,
        leadId: leadId,
        message: 'Email received and confirmation sent'
      };

    } catch (error) {
      console.error('❌ Error processing email response:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendConfirmationEmail(leadData, bookingLink) {
    if (!this.emailTransporter) {
      console.log('📧 Email service not configured, skipping confirmation email');
      return;
    }

    try {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">🎉 Demo Call Confirmed!</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">AI Booking Solutions</p>
          </div>
          
          <div style="background: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h2 style="color: #333; margin-bottom: 20px;">Hi ${leadData.decisionMaker},</h2>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              Thank you for your interest in our AI booking service for <strong>${leadData.businessName}</strong>!
            </p>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 30px;">
              I'm excited to show you how our AI can help your business capture more appointments and reduce no-shows.
            </p>
            
            <div style="background: #f8f9fa; padding: 25px; border-radius: 8px; margin: 30px 0; border-left: 4px solid #667eea;">
              <h3 style="color: #333; margin-top: 0;">📅 Book Your Demo Call</h3>
              <p style="color: #666; margin-bottom: 20px;">Click the button below to schedule your 15-minute demo:</p>
              <a href="${bookingLink}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Schedule Demo Call</a>
            </div>
            
            <div style="background: #e8f4fd; padding: 20px; border-radius: 8px; margin: 30px 0;">
              <h4 style="color: #0c5460; margin-top: 0;">What to Expect:</h4>
              <ul style="color: #0c5460; margin: 0; padding-left: 20px;">
                <li>15-minute demonstration of our AI booking system</li>
                <li>Customized solution for ${leadData.businessName}</li>
                <li>Q&A session about your specific needs</li>
                <li>Next steps discussion</li>
              </ul>
            </div>
            
            <p style="color: #666; line-height: 1.6; margin-top: 30px;">
              If you have any questions before our call, feel free to reply to this email.
            </p>
            
            <p style="color: #666; line-height: 1.6;">
              Best regards,<br>
              <strong>Sarah</strong><br>
              AI Booking Solutions<br>
              📞 ${process.env.YOUR_PHONE || '+44 7491 683261'}
            </p>
          </div>
        </div>
      `;

      await this.emailTransporter.sendMail({
        from: process.env.EMAIL_USER,
        to: leadData.email,
        subject: `🎉 Demo Call Confirmation - AI Booking Solutions`,
        html: emailHtml
      });

      console.log(`✅ Confirmation email sent to ${leadData.email}`);

    } catch (error) {
      console.error(`❌ Error sending confirmation email to ${leadData.email}:`, error.message);
    }
  }

  async sendSMS({ to, body }) {
    if (!this.twilioClient) {
      console.log('📱 SMS service not configured, skipping SMS');
      return;
    }

    try {
      await this.twilioClient.messages.create({
        body: body,
        messagingServiceSid: process.env.TWILIO_LEAD_GENERATION_SERVICE_SID,
        to: to
      });
      console.log(`✅ SMS sent to ${to}`);
    } catch (error) {
      console.error(`❌ Error sending SMS to ${to}:`, error.message);
    }
  }

  async getLeadStatus(leadId) {
    const lead = this.pendingLeads.get(leadId);
    if (!lead) {
      return { found: false };
    }

    return {
      found: true,
      lead: lead,
      status: lead.status,
      expiresAt: lead.expiresAt
    };
  }

  async cleanupExpiredLeads() {
    const now = new Date();
    let cleanedCount = 0;

    for (const [leadId, lead] of this.pendingLeads.entries()) {
      if (lead.expiresAt < now) {
        this.pendingLeads.delete(leadId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} expired leads`);
    }

    return cleanedCount;
  }

  // Get statistics
  getStats() {
    const total = this.pendingLeads.size;
    const waitingForEmail = Array.from(this.pendingLeads.values()).filter(lead => lead.status === 'waiting_for_email').length;
    const emailReceived = Array.from(this.pendingLeads.values()).filter(lead => lead.status === 'email_received').length;
    const demoBooked = Array.from(this.pendingLeads.values()).filter(lead => lead.status === 'demo_booked').length;

    return {
      totalLeads: total,
      waitingForEmail: waitingForEmail,
      emailReceived: emailReceived,
      booked: demoBooked,
      conversionRate: total > 0 ? (demoBooked / total * 100).toFixed(1) : 0
    };
  }
}

export default SMSEmailPipeline;
