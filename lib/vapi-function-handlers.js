// lib/vapi-function-handlers.js
// Handles function calls from Vapi assistant for receptionist capabilities

import { findAppointments, getUpcomingAppointments, getAppointmentById } from './appointment-lookup.js';
import { rescheduleAppointment, cancelAppointment } from './appointment-modifier.js';
import { getCustomerProfile, upsertCustomerProfile, getCustomerGreeting } from './customer-profiles.js';
import { getBusinessInfo, getBusinessHoursString, getServicesList, answerQuestion } from './business-info.js';
import messagingService from './messaging-service.js';

/**
 * Handle Vapi function call
 * @param {Object} params
 * @returns {Promise<Object>}
 */
export async function handleVapiFunctionCall({
  functionName,
  arguments: functionArgs,
  metadata
}) {
  try {
    const clientKey = metadata?.clientKey || metadata?.tenantKey;
    
    if (!clientKey) {
      throw new Error('Client key not found in metadata');
    }

    console.log('[VAPI FUNCTIONS] Handling function:', {
      functionName,
      clientKey,
      args: Object.keys(functionArgs || {})
    });

    switch (functionName) {
      case 'lookup_customer':
        return await handleLookupCustomer({ clientKey, ...functionArgs });

      case 'lookup_appointment':
        return await handleLookupAppointment({ clientKey, ...functionArgs });

      case 'get_upcoming_appointments':
        return await handleGetUpcomingAppointments({ clientKey, ...functionArgs });

      case 'reschedule_appointment':
        return await handleRescheduleAppointment({ clientKey, ...functionArgs });

      case 'cancel_appointment':
        return await handleCancelAppointment({ clientKey, ...functionArgs });

      case 'get_business_info':
        return await handleGetBusinessInfo({ clientKey, ...functionArgs });

      case 'get_business_hours':
        return await handleGetBusinessHours({ clientKey, ...functionArgs });

      case 'get_services':
        return await handleGetServices({ clientKey, ...functionArgs });

      case 'answer_question':
        return await handleAnswerQuestion({ clientKey, ...functionArgs });

      case 'take_message':
        return await handleTakeMessage({ clientKey, ...functionArgs });

      default:
        throw new Error(`Unknown function: ${functionName}`);
    }

  } catch (error) {
    console.error('[VAPI FUNCTIONS] Error handling function:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Lookup customer by phone number
 */
async function handleLookupCustomer({ clientKey, phone }) {
  try {
    const profile = await getCustomerProfile({ clientKey, phoneNumber: phone });
    
    if (!profile) {
      return {
        success: true,
        found: false,
        message: 'Customer not found in our records'
      };
    }

    return {
      success: true,
      found: true,
      customer: {
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        totalAppointments: profile.totalAppointments,
        lastAppointment: profile.lastAppointment ? {
          date: profile.lastAppointment.date,
          service: profile.lastAppointment.service
        } : null,
        preferredService: profile.preferredService,
        vipStatus: profile.vipStatus,
        specialNotes: profile.specialNotes
      },
      greeting: await getCustomerGreeting({ clientKey, phoneNumber: phone })
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Lookup appointments for customer
 */
async function handleLookupAppointment({ clientKey, phone, name, appointmentId }) {
  try {
    let appointments;

    if (appointmentId) {
      const appointment = await getAppointmentById({ clientKey, appointmentId });
      appointments = appointment ? [appointment] : [];
    } else {
      appointments = await findAppointments({
        clientKey,
        phoneNumber: phone,
        name: name,
        status: 'booked'
      });
    }

    if (appointments.length === 0) {
      return {
        success: true,
        found: false,
        message: 'No appointments found'
      };
    }

    return {
      success: true,
      found: true,
      appointments: appointments.map(apt => ({
        appointmentId: apt.appointmentId || apt.id.toString(),
        startTime: apt.startTime,
        endTime: apt.endTime,
        service: apt.customer?.service || 'appointment',
        formattedTime: new Date(apt.startTime).toLocaleString('en-GB', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      })),
      nextAppointment: appointments[0] ? {
        appointmentId: appointments[0].appointmentId,
        date: appointments[0].startTime,
        service: appointments[0].customer?.service
      } : null
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get upcoming appointments
 */
async function handleGetUpcomingAppointments({ clientKey, phone }) {
  try {
    const appointments = await getUpcomingAppointments({
      clientKey,
      phoneNumber: phone,
      limit: 5
    });

    return {
      success: true,
      appointments: appointments,
      count: appointments.length
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Reschedule appointment
 */
async function handleRescheduleAppointment({ clientKey, appointmentId, newTime, reason }) {
  try {
    const result = await rescheduleAppointment({
      clientKey,
      appointmentId: parseInt(appointmentId),
      newStartTime: newTime,
      reason: reason || null
    });

    return {
      success: true,
      rescheduled: true,
      appointment: {
        appointmentId: result.appointment.appointmentId,
        newTime: result.appointment.startTime,
        formattedTime: new Date(result.appointment.startTime).toLocaleString('en-GB', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      },
      message: 'Appointment rescheduled successfully'
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      message: `Unable to reschedule: ${error.message}`
    };
  }
}

/**
 * Cancel appointment
 */
async function handleCancelAppointment({ clientKey, appointmentId, reason }) {
  try {
    const result = await cancelAppointment({
      clientKey,
      appointmentId: parseInt(appointmentId),
      reason: reason || null,
      offerAlternatives: true
    });

    return {
      success: true,
      cancelled: true,
      message: 'Appointment cancelled successfully. Would you like to reschedule?',
      appointment: {
        appointmentId: result.appointment.appointmentId,
        cancelledAt: result.appointment.cancelledAt
      }
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      message: `Unable to cancel: ${error.message}`
    };
  }
}

/**
 * Get business information
 */
async function handleGetBusinessInfo({ clientKey }) {
  try {
    const info = await getBusinessInfo(clientKey);
    
    return {
      success: true,
      info: {
        hours: await getBusinessHoursString(clientKey),
        services: await getServicesList(clientKey),
        policies: info.policies || {},
        location: info.location || {}
      }
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get business hours
 */
async function handleGetBusinessHours({ clientKey }) {
  try {
    const hours = await getBusinessHoursString(clientKey);
    
    return {
      success: true,
      hours: hours
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get services list
 */
async function handleGetServices({ clientKey }) {
  try {
    const services = await getServicesList(clientKey);
    
    return {
      success: true,
      services: services
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Answer a question
 */
async function handleAnswerQuestion({ clientKey, question }) {
  try {
    const result = await answerQuestion({ clientKey, question });
    
    if (result.found) {
      return {
        success: true,
        found: true,
        answer: result.answer,
        category: result.category
      };
    }

    return {
      success: true,
      found: false,
      message: "I don't have that information. Would you like me to take a message or connect you with someone?"
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Take a message
 */
async function handleTakeMessage({ clientKey, callerName, callerPhone, callerEmail, reason, preferredCallbackTime, messageBody, urgency }) {
  try {
    const { query } = await import('../db.js');
    
    // Store message
    const result = await query(`
      INSERT INTO messages (
        client_key,
        caller_name,
        caller_phone,
        caller_email,
        reason,
        message_body,
        preferred_callback_time,
        urgency,
        status,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'new', NOW())
      RETURNING id
    `, [
      clientKey,
      callerName || null,
      callerPhone,
      callerEmail || null,
      reason || null,
      messageBody || null,
      preferredCallbackTime || null,
      urgency || 'normal'
    ]);

    const messageId = result.rows[0].id;

    // Get client info for notification
    const { getFullClient } = await import('../db.js');
    const client = await getFullClient(clientKey);
    const businessName = client?.display_name || client?.business_name || clientKey;

    // Send notification to client
    const notificationEmail = client?.vapi?.callbackInboxEmail || process.env.CALLBACK_INBOX_EMAIL;
    
    if (notificationEmail && messagingService.isConfigured().email) {
      await messagingService.sendEmail({
        to: notificationEmail,
        subject: urgency === 'urgent' || urgency === 'emergency' 
          ? `🚨 ${urgency.toUpperCase()}: New Message - ${businessName}`
          : `New Message - ${businessName}`,
        html: `
          <h2>New Message Received</h2>
          <p><strong>From:</strong> ${callerName || 'Unknown'} (${callerPhone})</p>
          ${callerEmail ? `<p><strong>Email:</strong> ${callerEmail}</p>` : ''}
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          ${preferredCallbackTime ? `<p><strong>Preferred Callback:</strong> ${preferredCallbackTime}</p>` : ''}
          ${messageBody ? `<p><strong>Message:</strong><br>${messageBody}</p>` : ''}
          ${urgency !== 'normal' ? `<p><strong style="color: red;">Urgency:</strong> ${urgency.toUpperCase()}</p>` : ''}
          <p><small>Message ID: ${messageId}</small></p>
        `
      });
    }

    // Update customer profile if exists
    if (callerName || callerPhone) {
      await upsertCustomerProfile({
        clientKey,
        phoneNumber: callerPhone,
        name: callerName
      });
    }

    return {
      success: true,
      messageId: messageId,
      message: 'Message recorded successfully. We will get back to you as soon as possible.'
    };

  } catch (error) {
    console.error('[VAPI FUNCTIONS] Error taking message:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
















