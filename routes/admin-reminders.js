/**
 * Admin API: appointment reminder list, send, cancel, stats.
 * Mounted at /api/admin — paths are /reminders, /reminders/send, etc.
 */
import { Router } from 'express';
import { query } from '../db.js';

/**
 * @param {{ sendReminderSMS: (reminder: Record<string, unknown>) => Promise<void> }} opts
 */
export function createAdminRemindersRouter({ sendReminderSMS }) {
  const router = Router();

  router.get('/reminders', async (req, res) => {
    try {
      const { clientKey, status, type } = req.query;

      let queryStr = `
      SELECT ar.*, t.display_name as client_name
      FROM appointment_reminders ar
      LEFT JOIN tenants t ON ar.client_key = t.client_key
      WHERE 1=1
    `;
      const params = [];
      let paramCount = 0;

      if (clientKey) {
        queryStr += ` AND ar.client_key = $${++paramCount}`;
        params.push(clientKey);
      }

      if (status) {
        queryStr += ` AND ar.status = $${++paramCount}`;
        params.push(status);
      }

      if (type) {
        queryStr += ` AND ar.reminder_type = $${++paramCount}`;
        params.push(type);
      }

      queryStr += ` ORDER BY ar.scheduled_for DESC LIMIT 100`;

      const reminders = await query(queryStr, params);

      res.json(
        reminders.rows.map((reminder) => ({
          id: reminder.id,
          appointmentId: reminder.appointment_id,
          clientKey: reminder.client_key,
          clientName: reminder.client_name,
          leadPhone: reminder.lead_phone,
          appointmentTime: reminder.appointment_time,
          reminderType: reminder.reminder_type,
          scheduledFor: reminder.scheduled_for,
          sentAt: reminder.sent_at,
          status: reminder.status,
          smsSid: reminder.sms_sid,
          errorMessage: reminder.error_message,
          createdAt: reminder.created_at
        }))
      );
    } catch (error) {
      console.error('Error getting reminders:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/reminders/send', async (req, res) => {
    try {
      const { reminderId } = req.body;

      if (!reminderId) {
        return res.status(400).json({ error: 'Reminder ID is required' });
      }

      const reminder = await query(`SELECT * FROM appointment_reminders WHERE id = $1`, [reminderId]);

      if (!reminder.rows[0]) {
        return res.status(404).json({ error: 'Reminder not found' });
      }

      await sendReminderSMS(reminder.rows[0]);

      await query(
        `
      UPDATE appointment_reminders 
      SET status = 'sent', sent_at = NOW()
      WHERE id = $1
    `,
        [reminderId]
      );

      res.json({ success: true, message: 'Reminder sent successfully' });
    } catch (error) {
      console.error('Error sending reminder:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/reminders/:id', async (req, res) => {
    try {
      const { id } = req.params;

      await query(
        `
      UPDATE appointment_reminders 
      SET status = 'cancelled'
      WHERE id = $1
    `,
        [id]
      );

      res.json({ success: true, message: 'Reminder cancelled successfully' });
    } catch (error) {
      console.error('Error cancelling reminder:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/reminders/stats', async (req, res) => {
    try {
      const stats = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
        COUNT(CASE WHEN reminder_type = 'confirmation' THEN 1 END) as confirmations,
        COUNT(CASE WHEN reminder_type = '24hour' THEN 1 END) as reminders_24h,
        COUNT(CASE WHEN reminder_type = '1hour' THEN 1 END) as reminders_1h
      FROM appointment_reminders
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `);

      const row = stats.rows[0];
      res.json({
        total: parseInt(row.total) || 0,
        sent: parseInt(row.sent) || 0,
        pending: parseInt(row.pending) || 0,
        failed: parseInt(row.failed) || 0,
        cancelled: parseInt(row.cancelled) || 0,
        confirmations: parseInt(row.confirmations) || 0,
        reminders24h: parseInt(row.reminders_24h) || 0,
        reminders1h: parseInt(row.reminders_1h) || 0,
        successRate: row.total > 0 ? ((parseInt(row.sent) / parseInt(row.total)) * 100).toFixed(1) : 0
      });
    } catch (error) {
      console.error('Error getting reminder stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
