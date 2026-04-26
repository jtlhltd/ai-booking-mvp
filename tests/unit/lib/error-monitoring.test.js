import { describe, test, expect, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  process.env.ALERTS_SUPPRESSED = 'true';
  delete process.env.YOUR_EMAIL;
  delete process.env.SLACK_WEBHOOK_URL;
});

describe('lib/error-monitoring', () => {
  test('logError inserts row and returns success', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      query: jest.fn(async () => ({ rows: [{ id: 123 }] })),
    }));
    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({
      default: { sendEmail: jest.fn(async () => {}) },
    }));

    const { logError } = await import('../../../lib/error-monitoring.js');
    const out = await logError({ errorType: 't', errorMessage: 'm', stack: 's', severity: 'critical' });
    expect(out).toEqual({ success: true, errorId: 123 });
  });

  test('getErrorStats returns error object when query throws', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      query: jest.fn(async () => {
        throw new Error('db_down');
      }),
    }));
    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({ default: {} }));

    const { getErrorStats } = await import('../../../lib/error-monitoring.js');
    const out = await getErrorStats({ days: 1 });
    expect(out).toEqual(expect.objectContaining({ error: expect.any(String) }));
  });
});

