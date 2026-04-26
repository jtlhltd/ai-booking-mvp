import { describe, expect, test, jest, beforeEach } from '@jest/globals';

const findAppointments = jest.fn(async () => []);

jest.unstable_mockModule('../../../lib/appointment-lookup.js', () => ({ findAppointments }));

const query = jest.fn();

jest.unstable_mockModule('../../../db.js', () => ({ query }));

describe('customer-profiles', () => {
  beforeEach(() => {
    jest.resetModules();
    query.mockReset();
    findAppointments.mockReset();
    findAppointments.mockResolvedValue([]);
  });

  test('getCustomerProfile returns enriched profile when row exists', async () => {
    findAppointments.mockResolvedValueOnce([
      { startTime: '2026-04-01T12:00:00Z', customer: { service: 'Deep clean' } }
    ]);
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 10,
          name: 'Pat',
          email: 'p@x.com',
          phone: '+441',
          preferences_json: { preferredService: 'VIP' },
          vip_status: true,
          special_notes: 'note',
          last_interaction: null,
          total_appointments: 3,
          created_at: '2026-01-01'
        }
      ]
    });
    const { getCustomerProfile } = await import('../../../lib/customer-profiles.js');
    const p = await getCustomerProfile({ clientKey: 'c1', phoneNumber: '+441' });
    expect(p.name).toBe('Pat');
    expect(p.lastAppointment?.service).toBe('Deep clean');
    expect(p.preferredService).toBe('VIP');
  });

  test('getCustomerProfile builds from leads when no profile row', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({
      rows: [{ id: 5, name: 'Lead', phone: '+442', email: null, service: 'x', status: 'new', created_at: '2026-02-02' }]
    });
    query.mockResolvedValueOnce({ rows: [{ count: '7' }] });
    const { getCustomerProfile } = await import('../../../lib/customer-profiles.js');
    const p = await getCustomerProfile({ clientKey: 'c1', phoneNumber: '+442' });
    expect(p.totalAppointments).toBe(7);
    expect(p.preferredService).toBe('x');
  });

  test('incrementAppointmentCount swallows errors', async () => {
    query.mockRejectedValueOnce(new Error('nope'));
    const { incrementAppointmentCount } = await import('../../../lib/customer-profiles.js');
    await expect(incrementAppointmentCount({ clientKey: 'c1', phoneNumber: '+1' })).resolves.toBeUndefined();
  });

  test('setVipStatus updates row', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const { setVipStatus } = await import('../../../lib/customer-profiles.js');
    await setVipStatus({ clientKey: 'c1', phoneNumber: '+1', vipStatus: true });
    expect(query).toHaveBeenCalled();
  });

  test('getCustomerGreeting returns null when unknown', async () => {
    query.mockResolvedValue({ rows: [] });
    const { getCustomerGreeting } = await import('../../../lib/customer-profiles.js');
    expect(await getCustomerGreeting({ clientKey: 'c1', phoneNumber: '+999' })).toBeNull();
  });

  test('getCustomerGreeting builds text for known VIP', async () => {
    findAppointments.mockResolvedValueOnce([]);
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          name: 'Sam',
          email: null,
          phone: '+44',
          preferences_json: {},
          vip_status: true,
          special_notes: null,
          last_interaction: null,
          total_appointments: 2,
          created_at: 'c'
        }
      ]
    });
    const { getCustomerGreeting } = await import('../../../lib/customer-profiles.js');
    const g = await getCustomerGreeting({ clientKey: 'c1', phoneNumber: '+44' });
    expect(g).toContain('Sam');
    expect(g).toMatch(/welcome back|VIP|business/i);
  });
});
