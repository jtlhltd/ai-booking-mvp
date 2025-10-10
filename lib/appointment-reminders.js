// lib/appointment-reminders.js
// Automated appointment reminders to reduce no-shows

import { query } from '../db.js';

/**
 * Schedule appointment reminders after booking
 * @param {Object} booking - Booking details
 * @returns {Promise<Object>} - Scheduled reminders
 */
export async function scheduleAppointmentReminders(booking) {
  const {
    leadPhone,
    leadName,
    leadEmail,
    businessName,
    service,
    appointmentTime, // ISO string or Date
    location,
    businessPhone,
    clientKey,
    appointmentId
  } = booking;
  
  console.log(`[REMINDERS] Scheduling reminders for ${leadName} - ${appointmentTime}`);
  
  const appointmentDate = new Date(appointmentTime);
  const now = new Date();
  
  // Validate appointment is in the future
  if (appointmentDate <= now) {
    console.log('[REMINDERS] ⚠️ Appointment is in the past, skipping reminders');
    return { scheduled: false, reason: 'past_appointment' };
  }
  
  const reminders = [];
  
  try {
    // 1. IMMEDIATE CONFIRMATION (send right now)
    const confirmationSMS = await sendConfirmationSMS({
      to: leadPhone,
      leadName,
      businessName,
      service,
      appointmentTime: formatDateTime(appointmentDate),
      location,
      businessPhone
    });
    
    if (confirmationSMS.success) {
      reminders.push({ type: 'confirmation_sms', sent: true, when: 'immediate' });
    }
    
    // Send confirmation email if email exists
    if (leadEmail) {
      const confirmationEmail = await sendConfirmationEmail({
        to: leadEmail,
        leadName,
        businessName,
        service,
        appointmentTime: appointmentDate,
        location,
        businessPhone,
        appointmentId
      });
      
      if (confirmationEmail.success) {
        reminders.push({ type: 'confirmation_email', sent: true, when: 'immediate' });
      }
    }
    
    // 2. 24-HOUR REMINDER
    const reminder24h = new Date(appointmentDate);
    reminder24h.setHours(reminder24h.getHours() - 24);
    
    if (reminder24h > now) {
      await scheduleReminder({
        clientKey,
        leadPhone,
        leadName,
        businessName,
        service,
        appointmentTime: appointmentDate,
        location,
        businessPhone,
        reminderType: '24h',
        scheduledFor: reminder24h,
        appointmentId
      });
      
      reminders.push({ 
        type: '24h_reminder', 
        scheduled: true, 
        scheduledFor: reminder24h.toISOString() 
      });
      
      console.log(`[REMINDERS] ✅ 24-hour reminder scheduled for ${reminder24h.toLocaleString()}`);
    } else {
      console.log('[REMINDERS] ⚠️ Appointment is within 24 hours, skipping 24h reminder');
    }
    
    // 3. 1-HOUR REMINDER
    const reminder1h = new Date(appointmentDate);
    reminder1h.setHours(reminder1h.getHours() - 1);
    
    if (reminder1h > now) {
      await scheduleReminder({
        clientKey,
        leadPhone,
        leadName,
        businessName,
        service,
        appointmentTime: appointmentDate,
        location,
        businessPhone,
        reminderType: '1h',
        scheduledFor: reminder1h,
        appointmentId
      });
      
      reminders.push({ 
        type: '1h_reminder', 
        scheduled: true, 
        scheduledFor: reminder1h.toISOString() 
      });
      
      console.log(`[REMINDERS] ✅ 1-hour reminder scheduled for ${reminder1h.toLocaleString()}`);
    } else {
      console.log('[REMINDERS] ⚠️ Appointment is within 1 hour, skipping 1h reminder');
    }
    
    console.log(`[REMINDERS] ✅ Scheduled ${reminders.length} reminders for ${leadPhone}`);
    
    return {
      scheduled: true,
      reminders,
      appointmentId,
      appointmentTime: appointmentDate.toISOString()
    };
    
  } catch (error) {
    console.error('[REMINDERS ERROR]', error);
    return {
      scheduled: false,
      error: error.message,
      reminders
    };
  }
}

/**
 * Send immediate confirmation SMS
 */
async function sendConfirmationSMS({ to, leadName, businessName, service, appointmentTime, location, businessPhone }) {
  try {
    // Use Twilio or your SMS provider
    const message = `✅ Confirmed! Your ${service} appointment with ${businessName} is ${appointmentTime}. Location: ${location || 'TBD'}. Reply CANCEL to reschedule or call ${businessPhone}.`;
    
    // TODO: Integrate with your SMS provider (Twilio, etc.)
    console.log(`[SMS CONFIRMATION] To: ${to}, Message: ${message}`);
    
    // For now, just log (you'll connect Twilio here)
    return { success: true, message, to };
    
  } catch (error) {
    console.error('[SMS CONFIRMATION ERROR]', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send immediate confirmation email
 */
async function sendConfirmationEmail({ to, leadName, businessName, service, appointmentTime, location, businessPhone, appointmentId }) {
  try {
    const subject = `Appointment Confirmed - ${formatDate(appointmentTime)}`;
    
    const body = `
Hi ${leadName},

Your appointment is confirmed!

📅 Date: ${formatDate(appointmentTime)}
🕐 Time: ${formatTime(appointmentTime)}
📍 Location: ${location || 'Will be provided'}
💼 Service: ${service}

Need to reschedule? Reply to this email or call ${businessPhone}.

We look forward to seeing you!

${businessName}
${businessPhone}
    `.trim();
    
    // TODO: Integrate with your email provider (Nodemailer, SendGrid, etc.)
    console.log(`[EMAIL CONFIRMATION] To: ${to}, Subject: ${subject}`);
    
    return { success: true, to, subject };
    
  } catch (error) {
    console.error('[EMAIL CONFIRMATION ERROR]', error);
    return { success: false, error: error.message };
  }
}

/**
 * Schedule a reminder in the retry_queue
 */
async function scheduleReminder({ clientKey, leadPhone, leadName, businessName, service, appointmentTime, location, businessPhone, reminderType, scheduledFor, appointmentId }) {
  try {
    const message = reminderType === '24h' 
      ? `Reminder: Your ${service} appointment with ${businessName} is tomorrow at ${formatTime(appointmentTime)}. Reply CONFIRM or CANCEL.`
      : `Your ${service} appointment with ${businessName} is in 1 hour! Location: ${location || 'TBD'}. See you soon!`;
    
    // Add to retry_queue table
    await query(`
      INSERT INTO retry_queue (
        client_key, 
        lead_phone, 
        retry_type, 
        retry_reason, 
        retry_data, 
        scheduled_for, 
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      clientKey,
      leadPhone,
      'sms', // Channel
      `appointment_reminder_${reminderType}`,
      JSON.stringify({
        message,
        leadName,
        businessName,
        service,
        appointmentTime: appointmentTime.toISOString(),
        location,
        businessPhone,
        appointmentId,
        reminderType
      }),
      scheduledFor.toISOString(),
      'pending'
    ]);
    
    console.log(`[REMINDERS] ✅ ${reminderType} reminder added to queue for ${scheduledFor.toLocaleString()}`);
    
  } catch (error) {
    console.error(`[REMINDER ${reminderType} ERROR]`, error);
    throw error;
  }
}

/**
 * Cancel all reminders for an appointment (if rescheduled/cancelled)
 */
export async function cancelAppointmentReminders(appointmentId) {
  try {
    const result = await query(`
      UPDATE retry_queue 
      SET status = 'cancelled', updated_at = now()
      WHERE retry_reason LIKE 'appointment_reminder%' 
      AND retry_data::jsonb->>'appointmentId' = $1
      AND status = 'pending'
    `, [appointmentId]);
    
    console.log(`[REMINDERS] ✅ Cancelled ${result.rowCount} pending reminders for appointment ${appointmentId}`);
    
    return { cancelled: result.rowCount };
    
  } catch (error) {
    console.error('[CANCEL REMINDERS ERROR]', error);
    return { cancelled: 0, error: error.message };
  }
}

/**
 * Process reminder queue (called by cron job every 5 minutes)
 */
export async function processReminderQueue() {
  try {
    // Get reminders that are due now (within next 5 minutes)
    const dueReminders = await query(`
      SELECT * FROM retry_queue
      WHERE retry_reason LIKE 'appointment_reminder%'
      AND status = 'pending'
      AND scheduled_for <= NOW() + INTERVAL '5 minutes'
      ORDER BY scheduled_for ASC
      LIMIT 50
    `);
    
    console.log(`[REMINDER QUEUE] Processing ${dueReminders.rows.length} due reminders`);
    
    for (const reminder of dueReminders.rows) {
      try {
        const data = typeof reminder.retry_data === 'string' 
          ? JSON.parse(reminder.retry_data) 
          : reminder.retry_data;
        
        // Send the reminder SMS
        await sendReminderSMS({
          to: reminder.lead_phone,
          message: data.message
        });
        
        // Mark as sent
        await query(`
          UPDATE retry_queue 
          SET status = 'completed', updated_at = now()
          WHERE id = $1
        `, [reminder.id]);
        
        console.log(`[REMINDER QUEUE] ✅ Sent ${data.reminderType} reminder to ${reminder.lead_phone}`);
        
      } catch (error) {
        console.error(`[REMINDER QUEUE] Error processing reminder ${reminder.id}:`, error);
        
        // Mark as failed
        await query(`
          UPDATE retry_queue 
          SET status = 'failed', updated_at = now()
          WHERE id = $1
        `, [reminder.id]);
      }
    }
    
    return { processed: dueReminders.rows.length };
    
  } catch (error) {
    console.error('[REMINDER QUEUE ERROR]', error);
    return { processed: 0, error: error.message };
  }
}

/**
 * Send reminder SMS
 */
async function sendReminderSMS({ to, message }) {
  try {
    // TODO: Integrate with Twilio/SMS provider
    console.log(`[REMINDER SMS] To: ${to}, Message: ${message}`);
    
    // Placeholder - replace with actual SMS sending
    return { success: true, to, message };
    
  } catch (error) {
    console.error('[REMINDER SMS ERROR]', error);
    throw error;
  }
}

/**
 * Utility: Format date
 */
function formatDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

/**
 * Utility: Format time
 */
function formatTime(date) {
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
}

/**
 * Utility: Format date and time together
 */
function formatDateTime(date) {
  return `${formatDate(date)} at ${formatTime(date)}`;
}

export default {
  scheduleAppointmentReminders,
  cancelAppointmentReminders,
  processReminderQueue
};

