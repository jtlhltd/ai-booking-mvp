export function createAppointmentReminderHandlers({ query, smsConfig, renderTemplate }) {
  async function scheduleAppointmentReminders({
    appointmentId,
    clientKey,
    leadPhone,
    appointmentTime,
    clientSettings
  }) {
    if (typeof query === 'undefined') {
      console.warn('[REMINDER] scheduleAppointmentReminders: query helper unavailable, skipping');
      return;
    }
    try {
      const settings = {
        confirmation_enabled: true,
        '24hour_enabled': true,
        '1hour_enabled': true,
        confirmation_template: "Hi! Your appointment is confirmed for {appointment_time}. We look forward to seeing you!",
        '24hour_template': "Reminder: You have an appointment tomorrow at {appointment_time}. Reply STOP to opt out.",
        '1hour_template': "Your appointment is in 1 hour at {appointment_time}. See you soon!",
        ...clientSettings
      };

      const reminders = [];

      if (settings.confirmation_enabled) {
        reminders.push({
          appointment_id: appointmentId,
          client_key: clientKey,
          lead_phone: leadPhone,
          appointment_time: appointmentTime,
          reminder_type: 'confirmation',
          scheduled_for: new Date(),
          status: 'pending'
        });
      }

      if (settings['24hour_enabled']) {
        const reminder24h = new Date(appointmentTime.getTime() - 24 * 60 * 60 * 1000);
        if (reminder24h > new Date()) {
          reminders.push({
            appointment_id: appointmentId,
            client_key: clientKey,
            lead_phone: leadPhone,
            appointment_time: appointmentTime,
            reminder_type: '24hour',
            scheduled_for: reminder24h,
            status: 'pending'
          });
        }
      }

      if (settings['1hour_enabled']) {
        const reminder1h = new Date(appointmentTime.getTime() - 60 * 60 * 1000);
        if (reminder1h > new Date()) {
          reminders.push({
            appointment_id: appointmentId,
            client_key: clientKey,
            lead_phone: leadPhone,
            appointment_time: appointmentTime,
            reminder_type: '1hour',
            scheduled_for: reminder1h,
            status: 'pending'
          });
        }
      }

      for (const reminder of reminders) {
        await query(
          `
        INSERT INTO appointment_reminders 
        (appointment_id, client_key, lead_phone, appointment_time, reminder_type, scheduled_for, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
          [
            reminder.appointment_id,
            reminder.client_key,
            reminder.lead_phone,
            reminder.appointment_time,
            reminder.reminder_type,
            reminder.scheduled_for,
            reminder.status
          ]
        );
      }

      console.log(`Scheduled ${reminders.length} reminders for appointment ${appointmentId}`);
    } catch (error) {
      console.error('Failed to schedule reminders:', error);
      throw error;
    }
  }

  async function sendReminderSMS(reminder) {
    if (typeof query === 'undefined') {
      console.warn('[REMINDER] sendReminderSMS: query helper unavailable, skipping');
      return;
    }
    try {
      const client = await query(`
      SELECT reminder_settings FROM tenants WHERE client_key = $1
    `, [reminder.client_key]);

      const settings = client.rows[0]?.reminder_settings || {
        confirmation_template: "Hi! Your appointment is confirmed for {appointment_time}. We look forward to seeing you!",
        '24hour_template': "Reminder: You have an appointment tomorrow at {appointment_time}. Reply STOP to opt out.",
        '1hour_template': "Your appointment is in 1 hour at {appointment_time}. See you soon!"
      };

      const clientData = await query(`
      SELECT * FROM tenants WHERE client_key = $1
    `, [reminder.client_key]);

      if (!clientData.rows[0]) {
        throw new Error('Client not found');
      }

      const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(clientData.rows[0]);

      if (!configured) {
        throw new Error('SMS not configured for client');
      }

      const appointmentTime = new Date(reminder.appointment_time).toLocaleString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      const templateKey = `${reminder.reminder_type}_template`;
      const template = settings[templateKey] || settings.confirmation_template;

      const body = renderTemplate(template, {
        appointment_time: appointmentTime,
        lead_phone: reminder.lead_phone
      });

      const payload = { to: reminder.lead_phone, body };
      if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid;
      else if (fromNumber) payload.from = fromNumber;

      const result = await smsClient.messages.create(payload);

      await query(
        `
      UPDATE appointment_reminders 
      SET sms_sid = $1
      WHERE id = $2
    `,
        [result.sid, reminder.id]
      );
    } catch (error) {
      console.error('Failed to send reminder SMS:', error);
      throw error;
    }
  }

  async function sendScheduledReminders() {
    if (typeof query === 'undefined') {
      console.warn('[REMINDER] sendScheduledReminders: query helper unavailable, skipping');
      return;
    }
    try {
      const reminders = await query(`
      SELECT * FROM appointment_reminders 
      WHERE status = 'pending' 
      AND scheduled_for <= NOW()
      ORDER BY scheduled_for ASC
      LIMIT 50
    `);

      for (const reminder of reminders.rows) {
        try {
          await sendReminderSMS(reminder);

          await query(
            `
          UPDATE appointment_reminders 
          SET status = 'sent', sent_at = NOW()
          WHERE id = $1
        `,
            [reminder.id]
          );

          console.log(`Sent ${reminder.reminder_type} reminder for appointment ${reminder.appointment_id}`);
        } catch (error) {
          console.error(`Failed to send reminder ${reminder.id}:`, error);

          await query(
            `
          UPDATE appointment_reminders 
          SET status = 'failed', error_message = $1
          WHERE id = $2
        `,
            [error.message, reminder.id]
          );
        }
      }
    } catch (error) {
      console.error('Failed to process scheduled reminders:', error);
    }
  }

  return { scheduleAppointmentReminders, sendScheduledReminders, sendReminderSMS };
}

export function startRemindersDisabled() {
  console.log('[REMINDERS] Reminder system disabled');
}
