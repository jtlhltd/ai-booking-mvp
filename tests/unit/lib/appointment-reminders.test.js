import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('lib/appointment-reminders', () => {
  test('scheduleAppointmentReminders skips past appointments', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({ query: jest.fn(async () => ({ rows: [] })) }));
    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({
      default: {
        sendAppointmentConfirmationSMS: jest.fn(async () => ({ success: true })),
        sendAppointmentConfirmationEmail: jest.fn(async () => ({ success: true })),
        sendSMS: jest.fn(async () => ({ success: true })),
        sendEmail: jest.fn(async () => ({ success: true }))
      }
    }));

    const { scheduleAppointmentReminders } = await import('../../../lib/appointment-reminders.js');
    const out = await scheduleAppointmentReminders({
      leadPhone: '+1',
      leadName: 'A',
      businessName: 'B',
      service: 'S',
      appointmentTime: new Date(Date.now() - 60_000).toISOString(),
      clientKey: 'c1',
      appointmentId: 'apt1'
    });
    expect(out).toEqual({ scheduled: false, reason: 'past_appointment' });
  });

  test('scheduleAppointmentReminders sends confirmation + schedules future reminders', async () => {
    const query = jest.fn(async () => ({ rows: [], rowCount: 1 }));
    jest.unstable_mockModule('../../../db.js', () => ({ query }));
    const messaging = {
      sendAppointmentConfirmationSMS: jest.fn(async () => ({ success: true })),
      sendAppointmentConfirmationEmail: jest.fn(async () => ({ success: true })),
      sendSMS: jest.fn(async () => ({ success: true })),
      sendEmail: jest.fn(async () => ({ success: true }))
    };
    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({ default: messaging }));

    const { scheduleAppointmentReminders } = await import('../../../lib/appointment-reminders.js');
    const appointmentTime = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const out = await scheduleAppointmentReminders({
      leadPhone: '+1',
      leadName: 'A',
      leadEmail: 'a@b.com',
      businessName: 'B',
      service: 'S',
      appointmentTime,
      location: 'Loc',
      businessPhone: '+2',
      clientKey: 'c1',
      appointmentId: 'apt1'
    });

    expect(out.scheduled).toBe(true);
    expect(messaging.sendAppointmentConfirmationSMS).toHaveBeenCalled();
    expect(messaging.sendAppointmentConfirmationEmail).toHaveBeenCalled();
    // queue inserts (24h + 1h)
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO retry_queue/i), expect.any(Array));
  });

  test('cancelAppointmentReminders returns cancelled:0 on db error', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      query: jest.fn(async () => {
        throw new Error('no table');
      })
    }));
    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({
      default: {
        sendAppointmentConfirmationSMS: jest.fn(async () => ({ success: true })),
        sendAppointmentConfirmationEmail: jest.fn(async () => ({ success: true })),
        sendSMS: jest.fn(async () => ({ success: true })),
        sendEmail: jest.fn(async () => ({ success: true }))
      }
    }));
    const { cancelAppointmentReminders } = await import('../../../lib/appointment-reminders.js');
    const out = await cancelAppointmentReminders('apt1');
    expect(out).toEqual(expect.objectContaining({ cancelled: 0 }));
  });
});

