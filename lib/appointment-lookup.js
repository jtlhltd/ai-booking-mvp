// lib/appointment-lookup.js
// Lookup and retrieve customer appointments for rescheduling, cancellation, and reference

import { query } from '../db.js';

/**
 * Find appointments by various identifiers
 * @param {Object} params - Search parameters
 * @returns {Promise<Array>} - Matching appointments
 */
export async function findAppointments({
  clientKey,
  phoneNumber = null,
  name = null,
  email = null,
  appointmentId = null,
  status = 'booked', // 'booked', 'cancelled', 'completed'
  limit = 10
}) {
  try {
    let sql = `
      SELECT 
        a.id,
        a.client_key,
        a.lead_id,
        a.gcal_event_id,
        a.start_iso,
        a.end_iso,
        a.status,
        a.cancelled_at,
        a.cancellation_reason,
        a.rescheduled_from_id,
        a.created_at,
        l.name as lead_name,
        l.phone as lead_phone,
        l.email as lead_email,
        l.service as service_type
      FROM appointments a
      LEFT JOIN leads l ON a.lead_id = l.id
      WHERE a.client_key = $1
    `;
    
    const params = [clientKey];
    let paramIndex = 2;

    // Add filters
    if (appointmentId) {
      sql += ` AND a.id = $${paramIndex}`;
      params.push(parseInt(appointmentId));
      paramIndex++;
    } else if (phoneNumber) {
      sql += ` AND l.phone = $${paramIndex}`;
      params.push(phoneNumber);
      paramIndex++;
    } else if (name) {
      sql += ` AND LOWER(l.name) LIKE LOWER($${paramIndex})`;
      params.push(`%${name}%`);
      paramIndex++;
    } else if (email) {
      sql += ` AND LOWER(l.email) = LOWER($${paramIndex})`;
      params.push(email);
      paramIndex++;
    }

    // Status filter
    if (status) {
      sql += ` AND a.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    // Order and limit
    sql += ` ORDER BY a.start_iso DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await query(sql, params);

    return result.rows.map(row => ({
      id: row.id,
      appointmentId: row.id.toString(),
      clientKey: row.client_key,
      leadId: row.lead_id,
      gcalEventId: row.gcal_event_id,
      startTime: row.start_iso,
      endTime: row.end_iso,
      status: row.status,
      cancelledAt: row.cancelled_at,
      cancellationReason: row.cancellation_reason,
      rescheduledFromId: row.rescheduled_from_id,
      createdAt: row.created_at,
      customer: {
        name: row.lead_name,
        phone: row.lead_phone,
        email: row.lead_email,
        service: row.service_type
      }
    }));

  } catch (error) {
    console.error('[APPOINTMENT LOOKUP] Error finding appointments:', error);
    throw error;
  }
}

/**
 * Get upcoming appointments for a customer
 * @param {Object} params
 * @returns {Promise<Array>}
 */
export async function getUpcomingAppointments({
  clientKey,
  phoneNumber,
  limit = 5
}) {
  try {
    const now = new Date().toISOString();
    
    const result = await query(`
      SELECT 
        a.id,
        a.start_iso,
        a.end_iso,
        a.status,
        a.gcal_event_id,
        l.name as customer_name,
        l.service as service_type
      FROM appointments a
      INNER JOIN leads l ON a.lead_id = l.id
      WHERE a.client_key = $1
        AND l.phone = $2
        AND a.start_iso > $3
        AND a.status = 'booked'
      ORDER BY a.start_iso ASC
      LIMIT $4
    `, [clientKey, phoneNumber, now, limit]);

    return result.rows.map(row => ({
      appointmentId: row.id.toString(),
      startTime: row.start_iso,
      endTime: row.end_iso,
      status: row.status,
      gcalEventId: row.gcal_event_id,
      customerName: row.customer_name,
      service: row.service_type,
      formattedTime: formatAppointmentTime(row.start_iso)
    }));

  } catch (error) {
    console.error('[APPOINTMENT LOOKUP] Error getting upcoming appointments:', error);
    throw error;
  }
}

/**
 * Get a single appointment by ID
 * @param {Object} params
 * @returns {Promise<Object|null>}
 */
export async function getAppointmentById({ clientKey, appointmentId }) {
  try {
    const result = await query(`
      SELECT 
        a.*,
        l.name as customer_name,
        l.phone as customer_phone,
        l.email as customer_email,
        l.service as service_type
      FROM appointments a
      LEFT JOIN leads l ON a.lead_id = l.id
      WHERE a.id = $1 AND a.client_key = $2
    `, [appointmentId, clientKey]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      appointmentId: row.id.toString(),
      clientKey: row.client_key,
      leadId: row.lead_id,
      gcalEventId: row.gcal_event_id,
      startTime: row.start_iso,
      endTime: row.end_iso,
      status: row.status,
      cancelledAt: row.cancelled_at,
      cancellationReason: row.cancellation_reason,
      rescheduledFromId: row.rescheduled_from_id,
      createdAt: row.created_at,
      customer: {
        name: row.customer_name,
        phone: row.customer_phone,
        email: row.customer_email,
        service: row.service_type
      }
    };

  } catch (error) {
    console.error('[APPOINTMENT LOOKUP] Error getting appointment:', error);
    throw error;
  }
}

/**
 * Format appointment time for display
 * @param {string} isoTime
 * @returns {string}
 */
function formatAppointmentTime(isoTime) {
  try {
    const date = new Date(isoTime);
    return date.toLocaleString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/London'
    });
  } catch (error) {
    return isoTime;
  }
}

/**
 * Check if appointment exists and belongs to client
 * @param {Object} params
 * @returns {Promise<boolean>}
 */
export async function appointmentExists({ clientKey, appointmentId }) {
  try {
    const result = await query(`
      SELECT id FROM appointments
      WHERE id = $1 AND client_key = $2 AND status = 'booked'
    `, [appointmentId, clientKey]);

    return result.rows.length > 0;
  } catch (error) {
    console.error('[APPOINTMENT LOOKUP] Error checking appointment:', error);
    return false;
  }
}




















