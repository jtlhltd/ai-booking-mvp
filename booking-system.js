// Booking System with Calendar Integration and Notifications
import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import twilio from 'twilio';

class BookingSystem {
  constructor() {
    this.calendar = null;
    this.emailTransporter = null;
    this.smsClient = null;
    this.initializeServices();
  }

  async initializeServices() {
    try {
      // Initialize Google Calendar
      if (process.env.GOOGLE_CALENDAR_CREDENTIALS) {
        const credentials = JSON.parse(process.env.GOOGLE_CALENDAR_CREDENTIALS);
        const auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/calendar']
        });
        this.calendar = google.calendar({ version: 'v3', auth });
      }

      // Initialize Email Service
      if (process.env.EMAIL_SERVICE && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        this.emailTransporter = nodemailer.createTransport({
          service: process.env.EMAIL_SERVICE, // 'gmail', 'outlook', etc.
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });
      }

      // Initialize SMS Service
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        this.smsClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      }

      console.log('✅ Booking system services initialized');
    } catch (error) {
      console.error('❌ Error initializing booking services:', error.message);
    }
  }

  async bookDemo(leadData, preferredTimes = []) {
    try {
      const booking = {
        id: `demo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        lead: leadData,
        status: 'pending',
        createdAt: new Date(),
        preferredTimes: preferredTimes,
        confirmedTime: null
      };

      // Try to book the first available time
      let bookedTime = null;
      for (const timeSlot of preferredTimes) {
        if (await this.isTimeSlotAvailable(timeSlot)) {
          bookedTime = timeSlot;
          break;
        }
      }

      if (bookedTime) {
        // Book the calendar event
        const calendarEvent = await this.createCalendarEvent(leadData, bookedTime);
        booking.confirmedTime = bookedTime;
        booking.calendarEventId = calendarEvent?.id || null;
        booking.status = 'confirmed';

        // Send notifications
        await this.sendBookingNotifications(booking);

        const calendarMessage = calendarEvent ? 'Calendar event created and ' : 'Calendar not configured, but ';
        return {
          success: true,
          booking: booking,
          message: `${calendarMessage}demo booked for ${bookedTime.startTime} on ${bookedTime.date}`
        };
      } else {
        // No available slots, send follow-up email
        await this.sendFollowUpEmail(leadData, preferredTimes);
        
        return {
          success: false,
          booking: booking,
          message: 'No available slots, follow-up email sent'
        };
      }

    } catch (error) {
      console.error('❌ Error booking demo:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createCalendarEvent(leadData, timeSlot) {
    if (!this.calendar) {
      console.log('📅 Google Calendar not configured - skipping calendar event creation');
      return null; // Return null instead of throwing error
    }

    const event = {
      summary: `Demo Call - ${leadData.businessName}`,
      description: `
Demo Call Details:
- Business: ${leadData.businessName}
- Contact: ${leadData.decisionMaker}
- Phone: ${leadData.phoneNumber}
- Email: ${leadData.email}
- Industry: ${leadData.industry}
- Location: ${leadData.location}

Notes: Cold call lead - interested in AI booking service
      `,
      start: {
        dateTime: timeSlot.startDateTime,
        timeZone: 'Europe/London'
      },
      end: {
        dateTime: timeSlot.endDateTime,
        timeZone: 'Europe/London'
      },
      attendees: [
        { email: leadData.email, displayName: leadData.decisionMaker },
        { email: process.env.YOUR_EMAIL, displayName: 'You' }
      ],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 15 }
        ]
      }
    };

    // Use your specific calendar ID
    const calendarId = 'd5d33a0894fbea68842cef8513f06557fbe04883ce896f382b70568f0f7ea76b@group.calendar.google.com';
    
    const response = await this.calendar.events.insert({
      calendarId: calendarId,
      resource: event
    });

    console.log('📅 Calendar event created:', response.data.id);
    return response.data;
  }

  async sendBookingNotifications(booking) {
    const { lead, confirmedTime } = booking;

    // Send email to you
    await this.sendNotificationEmail({
      to: process.env.YOUR_EMAIL,
      subject: `🎉 New Demo Booked - ${lead.businessName}`,
      html: `
        <h2>New Demo Call Booked!</h2>
        <p><strong>Business:</strong> ${lead.businessName}</p>
        <p><strong>Contact:</strong> ${lead.decisionMaker}</p>
        <p><strong>Phone:</strong> ${lead.phoneNumber}</p>
        <p><strong>Email:</strong> ${lead.email}</p>
        <p><strong>Industry:</strong> ${lead.industry}</p>
        <p><strong>Location:</strong> ${lead.location}</p>
        <hr>
        <p><strong>Demo Scheduled:</strong></p>
        <p>📅 Date: ${confirmedTime.date}</p>
        <p>⏰ Time: ${confirmedTime.startTime} - ${confirmedTime.endTime}</p>
        <p>🌍 Timezone: Europe/London</p>
        <hr>
        <p><em>This demo was booked from a cold call lead.</em></p>
      `
    });

    // Send confirmation email to lead
    await this.sendNotificationEmail({
      to: lead.email,
      subject: `Demo Call Confirmed - AI Booking Solutions`,
      html: `
        <h2>Demo Call Confirmed!</h2>
        <p>Hi ${lead.decisionMaker},</p>
        <p>Thank you for your interest in our AI booking service. Your demo call has been confirmed:</p>
        <hr>
        <p><strong>Demo Details:</strong></p>
        <p>📅 Date: ${confirmedTime.date}</p>
        <p>⏰ Time: ${confirmedTime.startTime} - ${confirmedTime.endTime}</p>
        <p>🌍 Timezone: Europe/London</p>
        <p>📞 Call will be made to: ${lead.phoneNumber}</p>
        <hr>
        <p><strong>What to expect:</strong></p>
        <ul>
          <li>15-minute demonstration of our AI booking system</li>
          <li>Customized solution for ${lead.businessName}</li>
          <li>Q&A session</li>
          <li>Next steps discussion</li>
        </ul>
        <p>If you need to reschedule, please reply to this email or call us.</p>
        <p>Best regards,<br>Sarah<br>AI Booking Solutions</p>
      `
    });

    // Send SMS to you
    await this.sendSMS({
      to: process.env.YOUR_PHONE,
      body: `🎉 New demo booked! ${lead.businessName} - ${lead.decisionMaker} on ${confirmedTime.date} at ${confirmedTime.startTime}`
    });

    // Send SMS to lead (if they have a mobile number)
    if (lead.phoneNumber && lead.phoneNumber.startsWith('+44')) {
      await this.sendSMS({
        to: lead.phoneNumber,
        body: `Hi ${lead.decisionMaker}, your demo call with AI Booking Solutions is confirmed for ${confirmedTime.date} at ${confirmedTime.startTime}. We'll call you then!`
      });
    }
  }

  async sendNotificationEmail({ to, subject, html }) {
    if (!this.emailTransporter) {
      console.log('📧 Email service not configured, skipping email notification');
      return;
    }

    try {
      await this.emailTransporter.sendMail({
        from: process.env.EMAIL_USER,
        to: to,
        subject: subject,
        html: html
      });
      console.log(`✅ Email sent to ${to}`);
    } catch (error) {
      console.error(`❌ Error sending email to ${to}:`, error.message);
    }
  }

  async sendSMS({ to, body }) {
    if (!this.smsClient) {
      console.log('📱 SMS service not configured, skipping SMS notification');
      return;
    }

    try {
      await this.smsClient.messages.create({
        body: body,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: to
      });
      console.log(`✅ SMS sent to ${to}`);
    } catch (error) {
      console.error(`❌ Error sending SMS to ${to}:`, error.message);
    }
  }

  async sendFollowUpEmail(leadData, preferredTimes) {
    const availableSlots = preferredTimes.map(slot => 
      `${slot.date} at ${slot.startTime}`
    ).join(', ');

    await this.sendNotificationEmail({
      to: leadData.email,
      subject: `Follow-up: Demo Call Scheduling - AI Booking Solutions`,
      html: `
        <h2>Demo Call Follow-up</h2>
        <p>Hi ${leadData.decisionMaker},</p>
        <p>Thank you for your interest in our AI booking service for ${leadData.businessName}.</p>
        <p>Unfortunately, the times you suggested are not available:</p>
        <ul>
          ${preferredTimes.map(slot => `<li>${slot.date} at ${slot.startTime}</li>`).join('')}
        </ul>
        <p>Please let me know your availability for next week, and I'll find a suitable time for your demo call.</p>
        <p>Best regards,<br>Sarah<br>AI Booking Solutions</p>
      `
    });
  }

  async isTimeSlotAvailable(timeSlot) {
    if (!this.calendar) {
      return true; // Assume available if calendar not configured
    }

    try {
      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: timeSlot.startDateTime,
        timeMax: timeSlot.endDateTime,
        singleEvents: true,
        orderBy: 'startTime'
      });

      return response.data.items.length === 0;
    } catch (error) {
      console.error('❌ Error checking calendar availability:', error.message);
      return false;
    }
  }

  generateTimeSlots(days = 7) {
    const slots = [];
    const now = new Date();
    
    for (let i = 1; i <= days; i++) {
      const date = new Date(now);
      date.setDate(now.getDate() + i);
      
      // Skip weekends
      if (date.getDay() === 0 || date.getDay() === 6) continue;
      
      // Generate time slots for business hours (9 AM - 5 PM)
      for (let hour = 9; hour <= 16; hour++) {
        const startTime = new Date(date);
        startTime.setHours(hour, 0, 0, 0);
        
        const endTime = new Date(date);
        endTime.setHours(hour + 1, 0, 0, 0);
        
        slots.push({
          date: date.toLocaleDateString('en-GB'),
          startTime: startTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          endTime: endTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          startDateTime: startTime.toISOString(),
          endDateTime: endTime.toISOString()
        });
      }
    }
    
    return slots;
  }
}

export default BookingSystem;
