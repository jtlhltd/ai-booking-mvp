import { describe, expect, test, jest } from '@jest/globals';

describe('lib/server-reminders-runner', () => {
  test('scheduleAppointmentReminders inserts rows when query present', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
    const { createAppointmentReminderHandlers } = await import(
      '../../../lib/server-reminders-runner.js'
    );
    const { scheduleAppointmentReminders } = createAppointmentReminderHandlers({
      query,
      smsConfig: () => ({ configured: false }),
      renderTemplate: (t, v) => t.replace('{appointment_time}', v.appointment_time || '')
    });
    const future = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await scheduleAppointmentReminders({
      appointmentId: 1,
      clientKey: 'c1',
      leadPhone: '+440000000000',
      appointmentTime: future,
      clientSettings: {}
    });
    expect(query).toHaveBeenCalled();
    expect(query.mock.calls.some((c) => String(c[0]).includes('INSERT INTO appointment_reminders'))).toBe(
      true
    );
  });

  test('startRemindersDisabled logs', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { startRemindersDisabled } = await import('../../../lib/server-reminders-runner.js');
    startRemindersDisabled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('disabled'));
    log.mockRestore();
  });
});
