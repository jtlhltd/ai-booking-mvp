import { describe, expect, test, jest, beforeEach } from '@jest/globals';

const query = jest.fn(async () => ({ rows: [{ id: 1 }, { id: 2 }] }));

describe('stuck-processing-reaper', () => {
  beforeEach(() => {
    jest.resetModules();
    query.mockClear();
    delete process.env.STUCK_REAPER_ENABLED;
  });

  test('skips when not postgres', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({ query, dbType: 'sqlite' }));
    const { reapStuckWebhookEventProcessing } = await import('../../../lib/stuck-processing-reaper.js');
    const res = await reapStuckWebhookEventProcessing();
    expect(res).toEqual(expect.objectContaining({ skipped: true, reason: 'not_postgres' }));
    expect(query).not.toHaveBeenCalled();
  });

  test('skips when disabled by env', async () => {
    process.env.STUCK_REAPER_ENABLED = '0';
    jest.unstable_mockModule('../../../db.js', () => ({ query, dbType: 'postgres' }));
    const { reapStuckCallQueueProcessing } = await import('../../../lib/stuck-processing-reaper.js');
    const res = await reapStuckCallQueueProcessing();
    expect(res).toEqual(expect.objectContaining({ skipped: true, reason: 'disabled' }));
    expect(query).not.toHaveBeenCalled();
  });

  test('reaps stuck webhook_events when postgres and enabled', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({ query, dbType: 'postgres' }));
    const { reapStuckWebhookEventProcessing } = await import('../../../lib/stuck-processing-reaper.js');
    const res = await reapStuckWebhookEventProcessing({ stuckMinutes: 10 });
    expect(res).toEqual(expect.objectContaining({ ok: true, reset: 2, stuckMinutes: 10 }));
    expect(query).toHaveBeenCalled();
  });
});

