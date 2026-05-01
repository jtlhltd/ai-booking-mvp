import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';

import { bootstrapClients } from '../../../lib/bootstrap-clients.js';

let savedEnv;

beforeEach(() => {
  savedEnv = process.env.BOOTSTRAP_CLIENTS_JSON;
  delete process.env.BOOTSTRAP_CLIENTS_JSON;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env.BOOTSTRAP_CLIENTS_JSON;
  else process.env.BOOTSTRAP_CLIENTS_JSON = savedEnv;
  jest.restoreAllMocks();
});

describe('lib/bootstrap-clients', () => {
  test('throws when deps missing', async () => {
    await expect(bootstrapClients()).rejects.toThrow(/listFullClients/);
    await expect(bootstrapClients({})).rejects.toThrow(/listFullClients/);
  });

  test('no-op when clients already exist', async () => {
    const listFullClients = jest.fn(async () => [{ clientKey: 'tenant-a' }]);
    const upsertFullClient = jest.fn(async () => {});
    process.env.BOOTSTRAP_CLIENTS_JSON = JSON.stringify([
      { clientKey: 'tenant-b', booking: { timezone: 'UTC' } }
    ]);
    const out = await bootstrapClients({ listFullClients, upsertFullClient });
    expect(out).toEqual({ seeded: 0, reason: 'already_seeded' });
    expect(upsertFullClient).not.toHaveBeenCalled();
  });

  test('no-op when env var unset', async () => {
    const listFullClients = jest.fn(async () => []);
    const upsertFullClient = jest.fn(async () => {});
    const out = await bootstrapClients({ listFullClients, upsertFullClient });
    expect(out).toEqual({ seeded: 0, reason: 'no_env' });
    expect(upsertFullClient).not.toHaveBeenCalled();
  });

  test('returns parse_error when env JSON is malformed', async () => {
    const listFullClients = jest.fn(async () => []);
    const upsertFullClient = jest.fn(async () => {});
    process.env.BOOTSTRAP_CLIENTS_JSON = '{not json';
    const out = await bootstrapClients({ listFullClients, upsertFullClient });
    expect(out).toEqual({ seeded: 0, reason: 'parse_error' });
    expect(upsertFullClient).not.toHaveBeenCalled();
  });

  test('seeds an array of valid clients', async () => {
    const listFullClients = jest.fn(async () => []);
    const upsertFullClient = jest.fn(async () => ({ ok: true }));
    process.env.BOOTSTRAP_CLIENTS_JSON = JSON.stringify([
      { clientKey: 'tenant-a', booking: { timezone: 'Europe/London' } },
      { clientKey: 'tenant-b', booking: { timezone: 'America/New_York' } }
    ]);
    const out = await bootstrapClients({ listFullClients, upsertFullClient });
    expect(out).toEqual({ seeded: 2, reason: 'ok' });
    expect(upsertFullClient).toHaveBeenCalledTimes(2);
  });

  test('wraps a single object payload in an array', async () => {
    const listFullClients = jest.fn(async () => []);
    const upsertFullClient = jest.fn(async () => ({ ok: true }));
    process.env.BOOTSTRAP_CLIENTS_JSON = JSON.stringify({
      clientKey: 'tenant-solo',
      booking: { timezone: 'UTC' }
    });
    const out = await bootstrapClients({ listFullClients, upsertFullClient });
    expect(out).toEqual({ seeded: 1, reason: 'ok' });
    expect(upsertFullClient).toHaveBeenCalledTimes(1);
  });

  test('skips entries missing clientKey or booking.timezone', async () => {
    const listFullClients = jest.fn(async () => []);
    const upsertFullClient = jest.fn(async () => {});
    process.env.BOOTSTRAP_CLIENTS_JSON = JSON.stringify([
      { clientKey: 'ok', booking: { timezone: 'UTC' } },
      { clientKey: 'missing-tz' },
      { booking: { timezone: 'UTC' } },
      null
    ]);
    const out = await bootstrapClients({ listFullClients, upsertFullClient });
    expect(out).toEqual({ seeded: 1, reason: 'ok' });
    expect(upsertFullClient).toHaveBeenCalledTimes(1);
    expect(upsertFullClient).toHaveBeenCalledWith({ clientKey: 'ok', booking: { timezone: 'UTC' } });
  });

  test('swallows listFullClients errors and reports parse_error', async () => {
    const listFullClients = jest.fn(async () => {
      throw new Error('db down');
    });
    const upsertFullClient = jest.fn(async () => {});
    const out = await bootstrapClients({ listFullClients, upsertFullClient });
    expect(out.seeded).toBe(0);
    expect(out.reason).toBe('parse_error');
    expect(upsertFullClient).not.toHaveBeenCalled();
  });
});
