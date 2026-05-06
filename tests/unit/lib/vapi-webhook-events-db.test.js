import { describe, expect, test, jest, beforeEach } from '@jest/globals';

describe('lib/vapi-webhooks/webhook-events-db', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('tryInsertWebhookEvent returns inserted true when not postgres', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      query: jest.fn(),
      dbType: 'sqlite'
    }));
    const {
      tryInsertWebhookEvent,
      tryClaimExistingWebhookEvent,
      markWebhookEventProcessed
    } = await import('../../../lib/vapi-webhooks/webhook-events-db.js');
    const r = await tryInsertWebhookEvent({
      provider: 'vapi',
      eventId: 'e1',
      callId: 'c',
      eventType: 't',
      correlationId: 'x',
      payload: {},
      headers: {}
    });
    expect(r.inserted).toBe(true);
    expect(await tryClaimExistingWebhookEvent({ provider: 'vapi', eventId: 'e1' })).toEqual({
      claimed: false
    });
    await expect(markWebhookEventProcessed({ provider: 'vapi', eventId: 'e1' })).resolves.toBeUndefined();
  });

  test('tryInsertWebhookEvent inserts on postgres', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 1 }] });
    jest.unstable_mockModule('../../../db.js', () => ({
      query,
      dbType: 'postgres'
    }));
    const { tryInsertWebhookEvent } = await import('../../../lib/vapi-webhooks/webhook-events-db.js');
    const r = await tryInsertWebhookEvent({
      provider: 'vapi',
      eventId: 'e2',
      callId: 'c',
      eventType: 't',
      correlationId: 'x',
      payload: { a: 1 },
      headers: {}
    });
    expect(r.inserted).toBe(true);
    expect(query).toHaveBeenCalled();
  });

  test('tryInsertWebhookEvent degrades on missing table error', async () => {
    const query = jest.fn().mockRejectedValue(new Error('relation webhook_events does not exist'));
    jest.unstable_mockModule('../../../db.js', () => ({
      query,
      dbType: 'postgres'
    }));
    const { tryInsertWebhookEvent } = await import('../../../lib/vapi-webhooks/webhook-events-db.js');
    const r = await tryInsertWebhookEvent({
      provider: 'vapi',
      eventId: 'e3',
      callId: 'c',
      eventType: 't',
      correlationId: 'x',
      payload: {},
      headers: {}
    });
    expect(r.inserted).toBe(true);
    expect(r.degraded).toBe(true);
  });
});
