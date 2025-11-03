// lib/appointment-modifier.js
// Reschedule, cancel, and modify appointments

import { query } from '../db.js';
import { getAppointmentById, appointmentExists } from './appointment-lookup.js';
import { makeJwtAuth } from '../gcal.js';
import { google } from 'googleapis';
import messagingService from './messaging-service.js';
import { scheduleAppointmentReminders } from './appointment-reminders.js';

/**
 * Reschedule an existing appointment
 * @param {Object} params - Reschedule parameters
 * @returns {Promise<Object>} - Updated appointment details
 */
export async function rescheduleAppointment({
  clientKey,
  appointmentId,
  newStartTime,
  newEndTime = null,
  reason = null
}) {
  try {
    console.log('[APPOINTMENT MODIFIER] Rescheduling:', {
      clientKey,
      appointmentId,
      newStartTime
    });

    // Get existing appointment
    const appointment = await getAppointmentById({ clientKey, appointmentId });

    if (!appointment) {
      throw new Error('Appointment not found');
    }

    if (appointment.status !== 'booked') {
      throw new Error(`Cannot reschedule appointment with status: ${appointment.status}`);
    }

    // Calculate end time if not provided (assume same duration)
    let endTime = newEndTime;
    if (!endTime && appointment.endTime) {
      const duration = new Date(appointment.endTime) - new Date(appointment.startTime);
      endTime = new Date(new Date(newStartTime).getTime() + duration).toISOString();
    } else if (!endTime) {
      // Default to 30 minutes
      endTime = new Date(new Date(newStartTime).getTime() + 30 * 60 * 1000).toISOString();
    }

    // Check availability (basic check - you may want to enhance this)
    const isAvailable = await checkTimeSlotAvailability({
      clientKey,
      startTime: newStartTime,
      endTime,
      excludeAppointmentId: appointmentId
    });

    if (!isAvailable) {
      throw new Error('Time slot not available');
    }

    // Update database
    const updateResult = await query(`
      UPDATE appointments
      SET 
        start_iso = $1,
        end_iso = $2,
        rescheduled_from_id = NULL, -- Clear if this was already rescheduled
        updated_at = NOW()
      WHERE id = $3 AND client_key = $4
      RETURNING *
    `, [newStartTime, endTime, appointmentId, clientKey]);

    if (updateResult.rows.length === 0) {
      throw new Error('Failed to update appointment');
    }

    // Update Google Calendar if event exists
    if (appointment.gcalEventId) {
      try {
        await updateCalendarEvent({
          clientKey,
          eventId: appointment.gcalEventId,
          newStartTime,
          newEndTime: endTime,
          summary: `Appointment - ${appointment.customer.name}`
        });
      } catch (calendarError) {
        console.error('[APPOINTMENT MODIFIER] Calendar update failed:', calendarError);
        // Continue anyway - database is updated
      }
    }

    // Cancel old reminders and schedule new ones
    try {
      await scheduleAppointmentReminders({
        leadPhone: appointment.customer.phone,
        leadName: appointment.customer.name,
        leadEmail: appointment.customer.email,
        businessName: clientKey, // You may want to get actual business name
        service: appointment.customer.service || 'appointment',
        appointmentTime: newStartTime,
        clientKey,
        appointmentId: appointmentId.toString()
      });
    } catch (reminderError) {
      console.error('[APPOINTMENT MODIFIER] Reminder scheduling failed:', reminderError);
    }

    // Send confirmation
    try {
      await sendRescheduleConfirmation({
        clientKey,
        appointment: {
          ...appointment,
          startTime: newStartTime,
          endTime: endTime
        },
        reason
      });
    } catch (confirmationError) {
      console.error('[APPOINTMENT MODIFIER] Confirmation failed:', confirmationError);
    }

    console.log('[APPOINTMENT MODIFIER] ✅ Appointment rescheduled:', {
      appointmentId,
      oldTime: appointment.startTime,
      newTime: newStartTime
    });

    return {
      success: true,
      appointment: {
        ...appointment,
        startTime: newStartTime,
        endTime: endTime,
        rescheduled: true
      }
    };

  } catch (error) {
    console.error('[APPOINTMENT MODIFIER] ❌ Error rescheduling:', error);
    throw error;
  }
}

/**
 * Cancel an appointment
 * @param {Object} params - Cancellation parameters
 * @returns {Promise<Object>} - Cancellation result
 */
export async function cancelAppointment({
  clientKey,
  appointmentId,
  reason = null,
  offerAlternatives = true
}) {
  try {
    console.log('[APPOINTMENT MODIFIER] Cancelling:', {
      clientKey,
      appointmentId,
      reason
    });

    // Get appointment
    const appointment = await getAppointmentById({ clientKey, appointmentId });

    if (!appointment) {
      throw new Error('Appointment not found');
    }

    if (appointment.status === 'cancelled') {
      return {
        success: true,
        message: 'Appointment already cancelled',
        appointment
      };
    }

    // Update database
    const updateResult = await query(`
      UPDATE appointments
      SET 
        status = 'cancelled',
        cancelled_at = NOW(),
        cancellation_reason = $1
      WHERE id = $2 AND client_key = $3
      RETURNING *
    `, [reason, appointmentId, clientKey]);

    if (updateResult.rows.length === 0) {
      throw new Error('Failed to cancel appointment');
    }

    // Cancel Google Calendar event if exists
    if (appointment.gcalEventId) {
      try {
        await deleteCalendarEvent({
          clientKey,
          eventId: appointment.gcalEventId
        });
      } catch (calendarError) {
        console.error('[APPOINTMENT MODIFIER] Calendar delete failed:', calendarError);
        // Continue anyway
      }
    }

    // Send cancellation confirmation
    try {
      await sendCancellationConfirmation({
        clientKey,
        appointment,
        reason,
        offerAlternatives
      });
    } catch (confirmationError) {
      console.error('[APPOINTMENT MODIFIER] Cancellation confirmation failed:', confirmationError);
    }

    console.log('[APPOINTMENT MODIFIER] ✅ Appointment cancelled:', {
      appointmentId,
      reason
    });

    return {
      success: true,
      appointment: {
        ...appointment,
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancellationReason: reason
      },
      alternativesOffered: offerAlternatives
    };

  } catch (error) {
    console.error('[APPOINTMENT MODIFIER] ❌ Error cancelling:', error);
    throw error;
  }
}

/**
 * Check if a time slot is available
 * @param {Object} params
 * @returns {Promise<boolean>}
 */
async function checkTimeSlotAvailability({
  clientKey,
  startTime,
  endTime,
  excludeAppointmentId = null
}) {
  try {
    let sql = `
      SELECT COUNT(*) as count
      FROM appointments
      WHERE client_key = $1
        AND status = 'booked'
        AND (
          (start_iso < $3 AND end_iso > $2)
          OR (start_iso >= $2 AND start_iso < $3)
          OR (end_iso > $2 AND end_iso <= $3)
        )
    `;

    const params = [clientKey, startTime, endTime];

    if (excludeAppointmentId) {
      sql += ` AND id != $4`;
      params.push(excludeAppointmentId);
    }

    const result = await query(sql, params);
    return parseInt(result.rows[0].count) === 0;

  } catch (error) {
    console.error('[APPOINTMENT MODIFIER] Error checking availability:', error);
    return false;
  }
}

/**
 * Update Google Calendar event
 * @param {Object} params
 */
async function updateCalendarEvent({
  clientKey,
  eventId,
  newStartTime,
  newEndTime,
  summary
}) {
  try {
    const { getFullClient } = await import('../db.js');
    const client = await getFullClient(clientKey);

    if (!client?.calendar_json?.calendarId) {
      console.log('[APPOINTMENT MODIFIER] Calendar not configured for client');
      return;
    }

    const auth = makeJwtAuth({
      clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
      privateKey: process.env.GOOGLE_PRIVATE_KEY,
      privateKeyB64: process.env.GOOGLE_PRIVATE_KEY_B64
    });

    await auth.authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    await calendar.events.patch({
      calendarId: client.calendar_json.calendarId || process.env.GOOGLE_CALENDAR_ID || 'primary',
      eventId: eventId,
      requestBody: {
        start: {
          dateTime: newStartTime,
          timeZone: client.timezone || 'Europe/London'
        },
        end: {
          dateTime: newEndTime,
          timeZone: client.timezone || 'Europe/London'
        },
        summary: summary
      }
    });

    console.log('[APPOINTMENT MODIFIER] ✅ Calendar event updated');

  } catch (error) {
    console.error('[APPOINTMENT MODIFIER] Calendar update error:', error);
    throw error;
  }
}

/**
 * Delete Google Calendar event
 * @param {Object} params
 */
async function deleteCalendarEvent({ clientKey, eventId }) {
  try {
    const { getFullClient } = await import('../db.js');
    const client = await getFullClient(clientKey);

    if (!client?.calendar_json?.calendarId) {
      return;
    }

    const auth = makeJwtAuth({
      clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
      privateKey: process.env.GOOGLE_PRIVATE_KEY,
      privateKeyB64: process.env.GOOGLE_PRIVATE_KEY_B64
    });

    await auth.authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    await calendar.events.delete({
      calendarId: client.calendar_json.calendarId || process.env.GOOGLE_CALENDAR_ID || 'primary',
      eventId: eventId
    });

    console.log('[APPOINTMENT MODIFIER] ✅ Calendar event deleted');

  } catch (error) {
    console.error('[APPOINTMENT MODIFIER] Calendar delete error:', error);
    // Don't throw - calendar deletion is not critical
  }
}

/**
 * Send reschedule confirmation
 * @param {Object} params
 */
async function sendRescheduleConfirmation({ clientKey, appointment, reason }) {
  try {
    const { getFullClient } = await import('../db.js');
    const client = await getFullClient(clientKey);
    const businessName = client?.display_name || client?.business_name || clientKey;

    const formattedTime = new Date(appointment.startTime).toLocaleString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: client?.timezone || 'Europe/London'
    });

    // SMS confirmation
    if (appointment.customer.phone && messagingService.isConfigured().sms) {
      await messagingService.sendSMS({
        to: appointment.customer.phone,
        body: `Hi ${appointment.customer.name || 'there'}, your appointment with ${businessName} has been rescheduled to ${formattedTime}. ${reason ? `Reason: ${reason}` : ''}`
      });
    }

    // Email confirmation
    if (appointment.customer.email && messagingService.isConfigured().email) {
      await messagingService.sendEmail({
        to: appointment.customer.email,
        subject: `Appointment Rescheduled - ${businessName}`,
        html: `
          <h2>Appointment Rescheduled</h2>
          <p>Hi ${appointment.customer.name || 'there'},</p>
          <p>Your appointment with ${businessName} has been rescheduled:</p>
          <p><strong>New Date & Time:</strong> ${formattedTime}</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          <p>If you need to make any changes, please call us.</p>
        `
      });
    }

  } catch (error) {
    console.error('[APPOINTMENT MODIFIER] Error sending reschedule confirmation:', error);
  }
}

/**
 * Send cancellation confirmation
 * @param {Object} params
 */
async function sendCancellationConfirmation({ clientKey, appointment, reason, offerAlternatives }) {
  try {
    const { getFullClient } = await import('../db.js');
    const client = await getFullClient(clientKey);
    const businessName = client?.display_name || client?.business_name || clientKey;

    // SMS confirmation
    if (appointment.customer.phone && messagingService.isConfigured().sms) {
      let message = `Hi ${appointment.customer.name || 'there'}, your appointment with ${businessName} on ${new Date(appointment.startTime).toLocaleDateString('en-GB')} has been cancelled.`;
      if (reason) message += ` Reason: ${reason}`;
      if (offerAlternatives) message += ' Would you like to reschedule? Reply YES.';

      await messagingService.sendSMS({
        to: appointment.customer.phone,
        body: message
      });
    }

    // Email confirmation
    if (appointment.customer.email && messagingService.isConfigured().email) {
      await messagingService.sendEmail({
        to: appointment.customer.email,
        subject: `Appointment Cancelled - ${businessName}`,
        html: `
          <h2>Appointment Cancelled</h2>
          <p>Hi ${appointment.customer.name || 'there'},</p>
          <p>Your appointment with ${businessName} has been cancelled.</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          ${offerAlternatives ? '<p>Would you like to reschedule? Please call us or reply to this email.</p>' : ''}
        `
      });
    }

  } catch (error) {
    console.error('[APPOINTMENT MODIFIER] Error sending cancellation confirmation:', error);
  }
}

