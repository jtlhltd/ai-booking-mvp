import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('lib/weekly-report', () => {
  test('generateWeeklyReport builds metrics + html/text', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-10T00:00:00.000Z'));
    const query = jest.fn(async (sql) => {
      const s = String(sql);
      if (s.includes('FROM tenants') && s.includes('timezone')) {
        return { rows: [{ client_key: 'c1', display_name: 'Acme', timezone: 'UTC' }] };
      }
      if (s.includes('FROM leads')) return { rows: [{ count: 3 }] };
      if (s.includes('FROM calls') && s.includes('AVG(duration)')) {
        return { rows: [{ total: 10, completed: 9, booked: 2, avg_duration: 61 }] };
      }
      if (s.includes('FROM appointments') && s.includes('COALESCE')) {
        return { rows: [{ appointments: 2, estimated_revenue: 100 }] };
      }
      if (s.includes('FROM appointments') && s.includes('COUNT(*) as count')) return { rows: [{ count: 2 }] };
      if (s.includes('prev')) return { rows: [{ total: 5, booked: 1 }] };
      return { rows: [{ count: 0 }] };
    });

    jest.unstable_mockModule('../../../db.js', () => ({ query }));
    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({ default: { sendEmail: jest.fn(async () => ({})), isConfigured: () => ({}) } }));

    const { generateWeeklyReport } = await import('../../../lib/weekly-report.js');
    const report = await generateWeeklyReport('c1', '2026-01-05T00:00:00.000Z');
    expect(report).toEqual(
      expect.objectContaining({
        clientKey: 'c1',
        clientName: 'Acme',
        metrics: expect.objectContaining({ leads: { new: 3 }, calls: expect.objectContaining({ total: 10 }) }),
        html: expect.any(String),
        text: expect.any(String),
      }),
    );
    jest.useRealTimers();
  });

  test('sendWeeklyReport skips when client has no email', async () => {
    const query = jest.fn(async () => ({ rows: [{ display_name: 'Acme', vapi_json: {} }] }));
    jest.unstable_mockModule('../../../db.js', () => ({ query }));
    jest.unstable_mockModule('luxon', () => ({ DateTime: { now: () => ({}) } }));
    const sendEmail = jest.fn(async () => ({ messageId: 'm1' }));
    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({ default: { sendEmail, isConfigured: () => ({}) } }));

    const { sendWeeklyReport } = await import('../../../lib/weekly-report.js');
    const res = await sendWeeklyReport('c1', { week: { startFormatted: 'a', endFormatted: 'b' }, html: 'h', text: 't' });
    expect(res).toEqual(expect.objectContaining({ sent: false, reason: expect.any(String) }));
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('generateAndSendAllWeeklyReports returns 0 when no enabled clients', async () => {
    const query = jest.fn(async (sql) => {
      const s = String(sql);
      if (s.includes('WHERE is_enabled = TRUE')) return { rows: [] };
      return { rows: [] };
    });
    jest.unstable_mockModule('../../../db.js', () => ({ query }));
    jest.unstable_mockModule('luxon', () => ({ DateTime: { now: () => ({}) } }));
    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({ default: { sendEmail: jest.fn(), isConfigured: () => ({}) } }));

    const { generateAndSendAllWeeklyReports } = await import('../../../lib/weekly-report.js');
    const out = await generateAndSendAllWeeklyReports();
    expect(out).toEqual({ generated: 0, sent: 0, errors: [] });
  });
});

