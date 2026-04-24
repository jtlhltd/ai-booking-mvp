import { describe, expect, test, jest, beforeAll, beforeEach } from '@jest/globals';

const query = jest.fn(async () => ({ rows: [] }));

jest.unstable_mockModule('../../../db.js', () => ({
  query,
}));

describe('store/* modules', () => {
  let tenants;
  let leads;
  let twilio;
  let optouts;
  let contactAttempts;

  beforeAll(async () => {
    ({ tenants } = await import('../../../store/tenants.js'));
    ({ leads } = await import('../../../store/leads.js'));
    ({ twilio } = await import('../../../store/twilio.js'));
    ({ optouts } = await import('../../../store/optouts.js'));
    ({ contactAttempts } = await import('../../../store/contact-attempts.js'));
  });

  beforeEach(() => {
    query.mockReset().mockResolvedValue({ rows: [] });
  });

  test('tenants.findByKey returns first row or null', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, key: 'c1' }] });
    const row = await tenants.findByKey('c1');
    expect(row).toEqual({ id: 1, key: 'c1' });
  });

  test('leads.create returns inserted row', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 9, status: 'pending' }] });
    const row = await leads.create({ tenant_id: 1, name: 'A', phone: '+1', service: 's', attempts: 0 });
    expect(row.id).toBe(9);
  });

  test('twilio.mapToTenant returns tenant row or null', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 't1', gsheet_id: 'sheet' }] });
    const t = await twilio.mapToTenant('MG1', '+1');
    expect(t).toEqual({ id: 't1', gsheet_id: 'sheet' });
  });

  test('optouts.upsert issues insert query', async () => {
    await optouts.upsert('t1', '+1');
    expect(query).toHaveBeenCalled();
  });

  test('contactAttempts.log issues insert query', async () => {
    await contactAttempts.log({
      tenant_id: 't1',
      lead_id: 'l1',
      channel: 'sms',
      direction: 'inbound',
      status: 'STOP',
      detail: 'STOP received',
    });
    expect(query).toHaveBeenCalled();
  });
});

