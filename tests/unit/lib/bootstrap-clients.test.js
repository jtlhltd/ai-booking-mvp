import { describe, test, expect, jest, beforeEach } from '@jest/globals';

describe('lib/bootstrap-clients', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.BOOTSTRAP_CLIENTS_JSON;
  });

  test('bootstrapClients no-ops when tenants already exist', async () => {
    const upsertFullClient = jest.fn(async () => {});
    jest.unstable_mockModule('../../../db.js', () => ({
      listFullClients: jest.fn(async () => [{ clientKey: 'x' }]),
      upsertFullClient
    }));
    const { bootstrapClients } = await import('../../../lib/bootstrap-clients.js');
    await bootstrapClients();
    expect(upsertFullClient).not.toHaveBeenCalled();
  });

  test('bootstrapClients seeds from BOOTSTRAP_CLIENTS_JSON when DB empty', async () => {
    process.env.BOOTSTRAP_CLIENTS_JSON = JSON.stringify([
      { clientKey: 'a', booking: { timezone: 'Europe/London' } },
      { clientKey: '', booking: { timezone: 'Europe/London' } }
    ]);
    const upsertFullClient = jest.fn(async () => {});
    jest.unstable_mockModule('../../../db.js', () => ({
      listFullClients: jest.fn(async () => []),
      upsertFullClient
    }));
    const { bootstrapClients } = await import('../../../lib/bootstrap-clients.js');
    await bootstrapClients();
    expect(upsertFullClient).toHaveBeenCalledTimes(1);
    expect(upsertFullClient.mock.calls[0][0].clientKey).toBe('a');
  });

  test('bootstrapClients accepts single object in BOOTSTRAP_CLIENTS_JSON', async () => {
    process.env.BOOTSTRAP_CLIENTS_JSON = JSON.stringify({
      clientKey: 'solo',
      booking: { timezone: 'Europe/London' }
    });
    const upsertFullClient = jest.fn(async () => {});
    jest.unstable_mockModule('../../../db.js', () => ({
      listFullClients: jest.fn(async () => []),
      upsertFullClient
    }));
    const { bootstrapClients } = await import('../../../lib/bootstrap-clients.js');
    await bootstrapClients();
    expect(upsertFullClient).toHaveBeenCalledWith(
      expect.objectContaining({ clientKey: 'solo' })
    );
  });
});
