/**
 * Admin API: calendar events listing, sync stub, availability slots.
 * Mounted at /api/admin.
 */
import { Router } from 'express';
import { query, getFullClient } from '../db.js';

function generateAvailableSlots(date, duration = 30, timezone = 'Europe/London') {
  const slots = [];
  const startHour = 9; // 9 AM
  const endHour = 17; // 5 PM

  for (let hour = startHour; hour < endHour; hour++) {
    for (let minute = 0; minute < 60; minute += duration) {
      slots.push({
        time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
        available: true
      });
    }
  }

  return slots;
}

export function createAdminCalendarRouter() {
  const router = Router();

  router.get('/calendar/events', async (req, res) => {
    try {
      const { clientKey, startDate, endDate } = req.query;

      let sql = `
      SELECT 
        a.*,
        c.display_name as client_name,
        l.name as lead_name,
        l.phone as lead_phone
      FROM appointments a
      LEFT JOIN tenants c ON a.client_key = c.client_key
      LEFT JOIN leads l ON a.lead_phone = l.phone
      WHERE 1=1
    `;

      const params = [];
      let paramCount = 1;

      if (clientKey) {
        sql += ` AND a.client_key = $${paramCount++}`;
        params.push(clientKey);
      }

      if (startDate) {
        sql += ` AND a.scheduled_for >= $${paramCount++}`;
        params.push(startDate);
      }

      if (endDate) {
        sql += ` AND a.scheduled_for <= $${paramCount++}`;
        params.push(endDate);
      }

      sql += ` ORDER BY a.scheduled_for ASC`;

      const events = await query(sql, params);

      res.json(events.rows || []);
    } catch (error) {
      console.error('Error getting calendar events:', error);
      res.json([]);
    }
  });

  router.post('/calendar/sync', async (req, res) => {
    try {
      const { clientKey, calendarId } = req.body;

      console.log('Syncing calendar for client:', clientKey, 'with calendar:', calendarId);

      res.json({
        success: true,
        message: 'Calendar sync initiated',
        calendarId
      });
    } catch (error) {
      console.error('Error syncing calendar:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/calendar/availability', async (req, res) => {
    try {
      const { clientKey, date, duration } = req.query;

      const client = await getFullClient(clientKey);
      const timezone = client?.timezone || 'Europe/London';

      const availableSlots = generateAvailableSlots(date, duration, timezone);

      res.json({
        clientKey,
        date,
        timezone,
        availableSlots
      });
    } catch (error) {
      console.error('Error getting availability:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
