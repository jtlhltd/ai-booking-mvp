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
      // Initialize Google Calendar with service account auth
      if (false && process.env.GOOGLE_CLIENT_EMAIL && (process.env.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY_B64)) {
        try {
          // Use JWT authentication (same as working server endpoints)
          let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
          
          // Handle base64 encoded private key
          if (!privateKey && process.env.GOOGLE_PRIVATE_KEY_B64) {
            try { 
              privateKey = Buffer.from(process.env.GOOGLE_PRIVATE_KEY_B64, 'base64').toString('utf8'); 
            } catch (e) {
              console.log('[BOOKING SYSTEM] Failed to decode base64 private key:', e.message);
            }
          }
          
          // Handle escaped newlines
          if (privateKey && privateKey.includes('\\n')) {
            privateKey = privateKey.replace(/\\n/g, '\n');
          }
          
          // Ensure the private key has proper formatting
          if (!privateKey.includes('BEGIN PRIVATE KEY')) {
            throw new Error('Invalid private key format - missing BEGIN PRIVATE KEY');
          }
          
          console.log('[BOOKING SYSTEM] Private key format check passed');
          
          const auth = new google.auth.JWT(
            process.env.GOOGLE_CLIENT_EMAIL,
            null,
            privateKey,
            [
              'https://www.googleapis.com/auth/calendar',
              'https://www.googleapis.com/auth/calendar.events'
            ]
          );
          
          // Authorize the JWT token (same as server.js)
          console.log('[BOOKING SYSTEM] Attempting to authorize JWT token...');
          await auth.authorize();
          console.log('[BOOKING SYSTEM] JWT token authorized successfully');
          
          this.calendar = google.calendar({ version: 'v3', auth });
          console.log('✅ Google Calendar initialized with JWT credentials');
        } catch (error) {
          console.log('⚠️ Google Calendar initialization failed:', error.message);
          console.log('   Error details:', {
            name: error.name,
            code: error.code,
            status: error.status,
            response: error.response?.data,
            stack: error.stack
          });
          console.log('   Environment check:', {
            GOOGLE_CLIENT_EMAIL: !!process.env.GOOGLE_CLIENT_EMAIL,
            GOOGLE_PRIVATE_KEY: !!process.env.GOOGLE_PRIVATE_KEY,
            GOOGLE_PRIVATE_KEY_B64: !!process.env.GOOGLE_PRIVATE_KEY_B64,
            GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID || 'primary'
          });
          this.calendar = null;
        }
      } else {
        console.log('⚠️ Google Calendar credentials not found - calendar integration disabled');
        console.log('   Missing:', {
          GOOGLE_CLIENT_EMAIL: !!process.env.GOOGLE_CLIENT_EMAIL,
          GOOGLE_PRIVATE_KEY: !!process.env.GOOGLE_PRIVATE_KEY
        });
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

  async bookDemo(leadData, preferredTimes = [], smsPipeline = null) {
    try {
      console.log('[BOOKING SYSTEM] bookDemo called with:', { leadData, preferredTimes });
      
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
      console.log('[BOOKING SYSTEM] Checking availability for', preferredTimes.length, 'time slots');
      
      for (const timeSlot of preferredTimes) {
        console.log('[BOOKING SYSTEM] Checking slot:', timeSlot);
        const isAvailable = await this.isTimeSlotAvailable(timeSlot);
        console.log('[BOOKING SYSTEM] Slot available:', isAvailable);
        
        if (isAvailable) {
          bookedTime = timeSlot;
          console.log('[BOOKING SYSTEM] Selected slot:', bookedTime);
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

        // Update SMS pipeline if provided
        if (smsPipeline && leadData.phoneNumber) {
          try {
            // Find and update the lead in SMS pipeline
            for (const [leadId, lead] of smsPipeline.pendingLeads.entries()) {
              if (lead.phoneNumber === leadData.phoneNumber && lead.status === 'email_received') {
                lead.status = 'demo_booked';
                lead.bookingId = booking.id;
                lead.bookedAt = new Date();
                console.log(`✅ Updated lead ${leadId} status to demo_booked`);
                break;
              }
            }
          } catch (error) {
            console.error('❌ Error updating SMS pipeline:', error.message);
          }
        }

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
      console.log('   To enable calendar integration, set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY environment variables');
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
      
      console.log('[BOOKING SYSTEM] Creating calendar event in calendar:', calendarId);
      console.log('[BOOKING SYSTEM] Event details:', {
        summary: event.summary,
        start: event.start.dateTime,
        end: event.end.dateTime
      });
      
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
          console.log('[BOOKING SYSTEM] Retrying calendar event creation in calendar:', calendarId);
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
      to: process.env.YOUR_EMAIL || 'jonah@jtlhmedia.com',
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
      to: process.env.YOUR_PHONE || '+447491683261',
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
    console.log('[BOOKING SYSTEM] isTimeSlotAvailable called with:', timeSlot);
    
    // Check if the slot time is during business hours (9 AM - 5 PM, Mon-Fri)
    const slotDate = new Date(timeSlot.startDateTime);
    const dayOfWeek = slotDate.getDay(); // 0 = Sunday, 6 = Saturday
    const hour = slotDate.getHours();
    
    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log('[BOOKING SYSTEM] Slot is on weekend, not available');
      return false;
    }
    
    // Check if slot is during business hours (9 AM - 5 PM)
    if (hour < 9 || hour >= 17) {
      console.log('[BOOKING SYSTEM] Slot is outside business hours (9 AM - 5 PM), not available');
      return false;
    }
    
    if (!this.calendar) {
      console.log('[BOOKING SYSTEM] Calendar not configured, assuming available for business hour slot');
      return true; // Assume available if calendar not configured
    }

    try {
      console.log('[BOOKING SYSTEM] Checking calendar for conflicts between:', timeSlot.startDateTime, 'and', timeSlot.endDateTime);
      
      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: timeSlot.startDateTime,
        timeMax: timeSlot.endDateTime,
        singleEvents: true,
        orderBy: 'startTime'
      });

      const isAvailable = response.data.items.length === 0;
      console.log('[BOOKING SYSTEM] Found', response.data.items.length, 'conflicting events. Available:', isAvailable);
      return isAvailable;
    } catch (error) {
      console.error('❌ Error checking calendar availability:', error.message);
      console.log('[BOOKING SYSTEM] Calendar check failed, assuming available for business hour slot');
      return true; // Assume available if calendar check fails
    }
  }

  async testCalendarConnection() {
    console.log('[BOOKING SYSTEM] Testing calendar connection...');
    
    if (!this.calendar) {
      console.log('[BOOKING SYSTEM] Calendar not initialized');
      return { success: false, error: 'Calendar not initialized' };
    }

    try {
      // Test by listing calendars
      const response = await this.calendar.calendarList.list();
      console.log('[BOOKING SYSTEM] Calendar test successful:', response.data.items?.length || 0, 'calendars found');
      
      // Test specific calendar access
      const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
      const calendarResponse = await this.calendar.calendars.get({ calendarId });
      console.log('[BOOKING SYSTEM] Target calendar access successful:', calendarResponse.data.summary);
      
      return { 
        success: true, 
        calendars: response.data.items?.length || 0,
        targetCalendar: calendarResponse.data.summary,
        message: 'Calendar connection successful'
      };
    } catch (error) {
      console.error('[BOOKING SYSTEM] Calendar test failed:', error.message);
      return { 
        success: false, 
        error: error.message,
        details: {
          name: error.name,
          code: error.code,
          status: error.status
        }
      };
    }
  }

  generateTimeSlots(days = 7) {
    const slots = [];
    const now = new Date();
    
    console.log('[BOOKING SYSTEM] Generating time slots for', days, 'days starting from:', now.toISOString());
    
    for (let i = 1; i <= days; i++) {
      const date = new Date(now);
      date.setDate(now.getDate() + i);
      
      // Skip weekends
      if (date.getDay() === 0 || date.getDay() === 6) {
        console.log('[BOOKING SYSTEM] Skipping weekend:', date.toLocaleDateString('en-GB'));
        continue;
      }
      
      // Generate time slots for business hours (9 AM - 5 PM)
      for (let hour = 9; hour <= 16; hour++) {
        const startTime = new Date(date);
        startTime.setHours(hour, 0, 0, 0);
        
        const endTime = new Date(date);
        endTime.setHours(hour + 1, 0, 0, 0);
        
        const slot = {
          date: date.toLocaleDateString('en-GB'),
          startTime: startTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          endTime: endTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          startDateTime: startTime.toISOString(),
          endDateTime: endTime.toISOString()
        };
        
        slots.push(slot);
        console.log('[BOOKING SYSTEM] Generated slot:', slot.date, slot.startTime, '-', slot.endTime);
      }
    }
    
    console.log('[BOOKING SYSTEM] Generated', slots.length, 'total slots');
    return slots;
  }
}

export default BookingSystem;
