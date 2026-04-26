import { describe, expect, test, jest, beforeEach } from '@jest/globals';

describe('alert-email-throttle', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('reserveAlertEmailSlot returns true when pool missing', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({ pool: null }));
    const { reserveAlertEmailSlot } = await import('../../../lib/alert-email-throttle.js');
    expect(await reserveAlertEmailSlot('k', 60_000)).toBe(true);
  });

  test('reserveAlertEmailSlot uses transaction when pool present', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE hit
        .mockResolvedValueOnce({}), // COMMIT
      release: jest.fn()
    };
    const pool = {
      query: jest.fn(async () => ({})),
      connect: jest.fn(async () => client)
    };
    jest.unstable_mockModule('../../../db.js', () => ({ pool }));
    const { reserveAlertEmailSlot } = await import('../../../lib/alert-email-throttle.js');
    const ok = await reserveAlertEmailSlot('alert_x', 5000);
    expect(ok).toBe(true);
    expect(client.release).toHaveBeenCalled();
  });

  test('reserveAlertEmailSlot returns false on errors after rollback attempt', async () => {
    const client = {
      query: jest.fn().mockRejectedValueOnce(new Error('tx')),
      release: jest.fn()
    };
    const pool = {
      query: jest.fn(async () => ({})),
      connect: jest.fn(async () => client)
    };
    jest.unstable_mockModule('../../../db.js', () => ({ pool }));
    const { reserveAlertEmailSlot } = await import('../../../lib/alert-email-throttle.js');
    const ok = await reserveAlertEmailSlot('alert_y', 5000);
    expect(ok).toBe(false);
  });
});
