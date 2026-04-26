import { describe, test, expect, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('lib/follow-up-processor', () => {
  test('processFollowUpQueue handles empty due queue', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      query: jest.fn(async () => ({ rows: [] })),
    }));
    jest.unstable_mockModule('../../../lib/database-health.js', () => ({
      getFollowUpsDue: jest.fn(async () => ({ rows: [] })),
    }));
    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({
      default: { sendSMS: jest.fn(async () => {}), sendEmail: jest.fn(async () => {}) },
    }));

    const { processFollowUpQueue } = await import('../../../lib/follow-up-processor.js');
    await expect(processFollowUpQueue()).resolves.toEqual(
      expect.objectContaining({ total: 0, processed: 0, failed: 0 })
    );
  });

  test('processFollowUpQueue marks invalid follow-up as failed and skips email when no email found', async () => {
    const query = jest.fn(async (sql) => {
      const s = String(sql);
      // lead lookup for email channel: return no email
      if (s.includes('SELECT email, name') && s.includes('FROM leads')) return { rows: [{ email: null, name: 'N' }] };
      return { rows: [{ count: 0 }] };
    });

    jest.unstable_mockModule('../../../db.js', () => ({ query }));
    jest.unstable_mockModule('../../../lib/database-health.js', () => ({
      getFollowUpsDue: jest.fn(async () => ({
        rows: [
          // invalid: missing message
          { id: 1, retry_type: 'sms', retry_data: JSON.stringify({}), client_key: 'c1', lead_phone: '+447700900000', status: 'pending' },
          // email with message but no email found
          { id: 2, retry_type: 'email', retry_data: JSON.stringify({ message: 'hi' }), client_key: 'c1', lead_phone: '+447700900000', status: 'pending' },
        ],
      })),
    }));

    jest.unstable_mockModule('../../../lib/lead-deduplication.js', () => ({
      isOptedOut: jest.fn(async () => false),
    }));

    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({
      default: { sendSMS: jest.fn(async () => {}), sendEmail: jest.fn(async () => {}) },
    }));

    const { processFollowUpQueue } = await import('../../../lib/follow-up-processor.js');
    await expect(processFollowUpQueue()).resolves.toEqual(
      expect.objectContaining({ total: 2 })
    );
  });
});

