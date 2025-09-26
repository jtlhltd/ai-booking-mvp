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
      // Initialize Google Calendar with OAuth2 (personal account)
      if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
        try {
          // For personal accounts, we'll use a simpler approach
          // Create calendar events without sending invitations
          const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
          if (!privateKey.includes('BEGIN PRIVATE KEY')) {
            throw new Error('Invalid private key format');
          }
          
          const auth = new google.auth.GoogleAuth({
            credentials: {
              type: 'service_account',
              client_email: process.env.GOOGLE_CLIENT_EMAIL,
              private_key: privateKey
            },
            scopes: [
              'https://www.googleapis.com/auth/calendar',
              'https://www.googleapis.com/auth/calendar.events'
            ]
          });
          this.calendar = google.calendar({ version: 'v3', auth });
          console.log('✅ Google Calendar initialized with existing credentials');
        } catch (error) {
          console.log('⚠️ Google Calendar initialization failed:', error.message);
          this.calendar = null;
        }
      } else {
        console.log('⚠️ Google Calendar credentials not found - calendar integration disabled');
        this.calendar = null;
      }

      // Initialize Email Service
      if (process.env.EMAIL_SERVICE && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        try {
          this.emailTransporter = nodemailer.createTransport({
            service: process.env.EMAIL_SERVICE, // 'gmail', 'outlook', etc.
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS
            }
          });
          console.log('✅ Email service initialized');
        } catch (error) {
          console.log('⚠️ Email service initialization failed:', error.message);
          this.emailTransporter = null;
        }
      } else {
        console.log('⚠️ Email credentials not found - email service disabled');
        this.emailTransporter = null;
      }

      // Initialize SMS Service
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        try {
          this.smsClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
          console.log('✅ SMS service initialized');
        } catch (error) {
          console.log('⚠️ SMS service initialization failed:', error.message);
          this.smsClient = null;
        }
      } else {
        console.log('⚠️ Twilio credentials not found - SMS service disabled');
        this.smsClient = null;
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

    try {
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
        // Removed attendees to avoid Domain-Wide Delegation requirement
        // We'll send email invitations separately
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 60 },
            { method: 'popup', minutes: 15 }
          ]
        }
      };

      // Use your existing calendar ID from environment variable
      const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
      
      const response = await this.calendar.events.insert({
        calendarId: calendarId,
        resource: event
      });

      console.log('✅ Calendar event created successfully:', response.data.id);
      return response.data;

    } catch (error) {
      console.error('❌ Error creating calendar event:', error.message);
      
      // If it's a delegation error, try without attendees
      if (error.message.includes('Domain-Wide Delegation') || error.message.includes('attendees')) {
        console.log('🔄 Retrying calendar event creation without attendees...');
        try {
          const eventWithoutAttendees = {
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
            }
          };

          const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
          const response = await this.calendar.events.insert({
            calendarId: calendarId,
            resource: eventWithoutAttendees
          });

          console.log('✅ Calendar event created without attendees:', response.data.id);
          return response.data;
        } catch (retryError) {
          console.error('❌ Error creating calendar event (retry):', retryError.message);
          return null;
        }
      }
      
      return null;
    }
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
        <p>📅 Date: ${confirmedTime.date || new Date(confirmedTime.startDateTime).toLocaleDateString('en-GB')}</p>
        <p>⏰ Time: ${confirmedTime.startTime || new Date(confirmedTime.startDateTime).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'})} - ${confirmedTime.endTime || new Date(confirmedTime.endDateTime).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'})}</p>
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
        <p>📅 Date: ${confirmedTime.date || new Date(confirmedTime.startDateTime).toLocaleDateString('en-GB')}</p>
        <p>⏰ Time: ${confirmedTime.startTime || new Date(confirmedTime.startDateTime).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'})} - ${confirmedTime.endTime || new Date(confirmedTime.endDateTime).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'})}</p>
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
      body: `🎉 New demo booked! ${lead.businessName} - ${lead.decisionMaker} on ${confirmedTime.date || new Date(confirmedTime.startDateTime).toLocaleDateString('en-GB')} at ${confirmedTime.startTime || new Date(confirmedTime.startDateTime).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'})}`
    });

    // Send SMS to lead (if they have a mobile number)
    if (lead.phoneNumber && lead.phoneNumber.startsWith('+44')) {
      await this.sendSMS({
        to: lead.phoneNumber,
        body: `Hi ${lead.decisionMaker}, your demo call with AI Booking Solutions is confirmed for ${confirmedTime.date || new Date(confirmedTime.startDateTime).toLocaleDateString('en-GB')} at ${confirmedTime.startTime || new Date(confirmedTime.startDateTime).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'})}. We'll call you then!`
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
