import { describe, expect, test, jest, beforeEach } from '@jest/globals';

// Module-boundary mocks (no external calls, no real DB).
const query = jest.fn(async () => ({ rows: [] }));
const getFullClient = jest.fn(async () => ({ timezone: 'Europe/London' }));
jest.unstable_mockModule('../../../db.js', () => ({ query, getFullClient }));

const getAppointmentById = jest.fn(async () => null);
jest.unstable_mockModule('../../../lib/appointment-lookup.js', () => ({
  getAppointmentById,
  appointmentExists: jest.fn(async () => true)
}));

jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({
  default: {
    isConfigured: () => ({ sms: false, email: false }),
    sendSMS: jest.fn(async () => {}),
    sendEmail: jest.fn(async () => {})
  }
}));

jest.unstable_mockModule('../../../lib/appointment-reminders.js', () => ({
  scheduleAppointmentReminders: jest.fn(async () => {})
}));

describe('booking integration: appointment-modifier invariants', () => {
  beforeEach(() => {
    jest.resetModules();
    query.mockClear();
    getAppointmentById.mockClear();
  });

  test('reschedule rejects when overlap check finds a conflicting booked appointment', async () => {
    getAppointmentById.mockResolvedValueOnce({
      appointmentId: '123',
      id: 123,
      clientKey: 'c1',
      startTime: '2026-04-22T10:00:00.000Z',
      endTime: '2026-04-22T10:30:00.000Z',
      status: 'booked',
      gcalEventId: null,
      customer: { name: 'A', phone: '+44', email: null, service: 'x' }
    });

    // overlap count > 0 => not available
    query.mockImplementationOnce(async () => ({ rows: [{ count: '1' }] }));

    const { rescheduleAppointment } = await import('../../../lib/appointment-modifier.js');
    await expect(
      rescheduleAppointment({
        clientKey: 'c1',
        appointmentId: 123,
        newStartTime: '2026-04-22T10:15:00.000Z'
      })
    ).rejects.toThrow(/not available/i);
  });

  test('reschedule preserves duration when newEndTime omitted', async () => {
    getAppointmentById.mockResolvedValueOnce({
      appointmentId: '123',
      id: 123,
      clientKey: 'c1',
      startTime: '2026-04-22T10:00:00.000Z',
      endTime: '2026-04-22T10:45:00.000Z', // 45 minutes
      status: 'booked',
      gcalEventId: null,
      customer: { name: 'A', phone: '+44', email: null, service: 'x' }
    });

    // availability check: count=0
    query.mockImplementationOnce(async () => ({ rows: [{ count: '0' }] }));
    // update appointment success
    query.mockImplementationOnce(async () => ({ rows: [{ id: 123 }] }));

    const { rescheduleAppointment } = await import('../../../lib/appointment-modifier.js');
    const out = await rescheduleAppointment({
      clientKey: 'c1',
      appointmentId: 123,
      newStartTime: '2026-04-22T12:00:00.000Z'
    });

    expect(out).toEqual(expect.objectContaining({ success: true }));

    const updateParams = query.mock.calls[1][1];
    const endIso = updateParams[1];
    expect(endIso).toBe('2026-04-22T12:45:00.000Z');
  });

  test('cancel is idempotent: already-cancelled appointment returns success without DB update', async () => {
    getAppointmentById.mockResolvedValueOnce({
      appointmentId: '123',
      id: 123,
      clientKey: 'c1',
      startTime: '2026-04-22T10:00:00.000Z',
      endTime: '2026-04-22T10:30:00.000Z',
      status: 'cancelled',
      gcalEventId: null,
      customer: { name: 'A', phone: '+44', email: null, service: 'x' }
    });

    const { cancelAppointment } = await import('../../../lib/appointment-modifier.js');
    const out = await cancelAppointment({ clientKey: 'c1', appointmentId: 123, reason: 'x' });
    expect(out).toEqual(expect.objectContaining({ success: true, message: expect.stringMatching(/already/i) }));
    expect(query).not.toHaveBeenCalled();
  });
});

