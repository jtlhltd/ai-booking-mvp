import { describe, expect, test, jest, beforeEach } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../../../db.js', () => ({ query }));

describe('appointment-lookup', () => {
  beforeEach(() => {
    jest.resetModules();
    query.mockReset();
  });

  const sampleRow = {
    id: 9,
    client_key: 'ck',
    lead_id: 1,
    gcal_event_id: 'e1',
    start_iso: '2026-04-20T10:00:00Z',
    end_iso: '2026-04-20T11:00:00Z',
    status: 'booked',
    cancelled_at: null,
    cancellation_reason: null,
    rescheduled_from_id: null,
    created_at: '2026-04-01',
    lead_name: 'L',
    lead_phone: '+44',
    lead_email: 'a@b.com',
    service_type: 'clean'
  };

  test('findAppointments filters by phone and maps rows', async () => {
    query.mockResolvedValueOnce({ rows: [sampleRow] });
    const { findAppointments } = await import('../../../lib/appointment-lookup.js');
    const rows = await findAppointments({ clientKey: 'ck', phoneNumber: '+44' });
    expect(rows).toHaveLength(1);
    expect(rows[0].appointmentId).toBe('9');
    expect(String(query.mock.calls[0][0])).toMatch(/l\.phone/);
  });

  test('findAppointments uses appointmentId branch', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const { findAppointments } = await import('../../../lib/appointment-lookup.js');
    await findAppointments({ clientKey: 'ck', appointmentId: '42' });
    expect(String(query.mock.calls[0][0])).toMatch(/a\.id =/);
  });

  test('getUpcomingAppointments returns mapped list', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 9,
          start_iso: '2030-01-01T10:00:00Z',
          end_iso: '2030-01-01T11:00:00Z',
          status: 'booked',
          gcal_event_id: 'e1',
          customer_name: 'L',
          service_type: 'clean'
        }
      ]
    });
    const { getUpcomingAppointments } = await import('../../../lib/appointment-lookup.js');
    const r = await getUpcomingAppointments({ clientKey: 'ck', phoneNumber: '+44', limit: 3 });
    expect(r.length).toBe(1);
    expect(r[0].formattedTime).toBeTruthy();
  });

  test('getAppointmentById returns null when missing', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const { getAppointmentById } = await import('../../../lib/appointment-lookup.js');
    expect(await getAppointmentById({ clientKey: 'ck', appointmentId: 1 })).toBeNull();
  });

  test('getAppointmentById maps row when present', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          ...sampleRow,
          customer_name: 'L',
          customer_phone: '+44',
          customer_email: 'a@b.com',
          service_type: 'clean'
        }
      ]
    });
    const { getAppointmentById } = await import('../../../lib/appointment-lookup.js');
    const r = await getAppointmentById({ clientKey: 'ck', appointmentId: 9 });
    expect(r.customer.phone).toBe('+44');
  });

  test('appointmentExists reflects row count', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 5 }] });
    const { appointmentExists } = await import('../../../lib/appointment-lookup.js');
    expect(await appointmentExists({ clientKey: 'ck', appointmentId: 5 })).toBe(true);
    query.mockResolvedValueOnce({ rows: [] });
    expect(await appointmentExists({ clientKey: 'ck', appointmentId: 99 })).toBe(false);
  });
});
