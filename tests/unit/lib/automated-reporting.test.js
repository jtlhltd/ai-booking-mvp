import { describe, expect, test, jest, beforeEach } from '@jest/globals';

const query = jest.fn();
const getFullClient = jest.fn();
const listFullClients = jest.fn();

jest.unstable_mockModule('../../../db.js', () => ({
  query,
  getFullClient,
  listFullClients
}));

jest.unstable_mockModule('../../../lib/call-outcome-analyzer.js', () => ({
  analyzeCallOutcomes: jest.fn(async () => ({
    conversionRate: 12,
    outcomes: {},
    sentiments: {},
    avgDurationsByOutcome: {},
    insights: [{ type: 'info', title: 'T', message: 'M' }],
    recommendations: [{ priority: 'high', action: 'A', reason: 'R' }],
    objections: { cost: 2, timing: 1 }
  })),
  compareCallOutcomes: jest.fn(async () => ({ comparison: { weekOverWeek: 1 } })),
  getBestCallTimes: jest.fn(async () => [
    { hour: 10, conversionRate: 5, totalCalls: 3 },
    { hour: 14, conversionRate: 8, totalCalls: 2 }
  ])
}));

const sendEmail = jest.fn(async () => {});

jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({
  default: { sendEmail }
}));

describe('automated-reporting', () => {
  beforeEach(() => {
    jest.resetModules();
    query.mockReset();
    getFullClient.mockReset();
    listFullClients.mockReset();
    sendEmail.mockReset();
  });

  test('generateClientReport returns error when client missing', async () => {
    getFullClient.mockResolvedValueOnce(null);
    const { generateClientReport } = await import('../../../lib/automated-reporting.js');
    const r = await generateClientReport('missing');
    expect(r).toEqual({ error: 'Client not found' });
  });

  test('generateClientReport builds weekly report from stats', async () => {
    getFullClient.mockResolvedValueOnce({
      display_name: 'Acme',
      client_key: 'acme'
    });
    query.mockResolvedValueOnce({
      rows: [
        {
          total_leads: '4',
          total_calls: '3',
          total_bookings: '1',
          total_messages: '2',
          successful_calls: '1'
        }
      ]
    });
    const { generateClientReport } = await import('../../../lib/automated-reporting.js');
    const r = await generateClientReport('acme', 'weekly');
    expect(r.error).toBeUndefined();
    expect(r.clientName).toBe('Acme');
    expect(r.period).toBe('weekly');
    expect(r.summary.totalLeads).toBe(4);
    expect(r.topObjections).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'cost', count: 2 })])
    );
  });

  test('generateClientReport uses 30 days for monthly period', async () => {
    getFullClient.mockResolvedValueOnce({ display_name: 'B', client_key: 'b' });
    query.mockResolvedValueOnce({
      rows: [{ total_leads: '0', total_calls: '0', total_bookings: '0', total_messages: '0', successful_calls: '0' }]
    });
    const { generateClientReport } = await import('../../../lib/automated-reporting.js');
    const r = await generateClientReport('b', 'monthly');
    expect(r.periodDays).toBe(30);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM leads'), ['b']);
  });

  test('formatReportAsEmail maps error shape', async () => {
    const { formatReportAsEmail } = await import('../../../lib/automated-reporting.js');
    const email = formatReportAsEmail({ error: 'boom', clientName: 'X' });
    expect(email.subject).toMatch(/Report Error/);
    expect(email.html).toMatch(/boom/);
  });

  test('formatReportAsEmail renders success template with sections', async () => {
    const { formatReportAsEmail } = await import('../../../lib/automated-reporting.js');
    const email = formatReportAsEmail({
      clientName: 'Co',
      period: 'weekly',
      periodDays: 7,
      generatedAt: new Date('2026-01-01T12:00:00.000Z').toISOString(),
      summary: { totalLeads: 1, totalCalls: 2, totalBookings: 3, totalMessages: 0, successfulCalls: 1 },
      performance: { conversionRate: 9, outcomes: {}, sentiments: {}, avgDurations: {} },
      insights: [{ type: 'success', title: 'S', message: 'OK' }],
      recommendations: [{ priority: 'low', action: 'Do', reason: 'Because' }],
      bestCallTimes: [{ hour: 9, conversionRate: 4, totalCalls: 10 }]
    });
    expect(email.subject).toMatch(/Weekly Report/);
    expect(email.html).toMatch(/Total Leads/);
    expect(email.html).toMatch(/Best Call Times/);
  });

  test('sendClientReport fails when no recipient email', async () => {
    getFullClient
      .mockResolvedValueOnce({
        display_name: 'A',
        client_key: 'a'
      })
      .mockResolvedValueOnce({ owner_email: null, email: null });
    query.mockResolvedValueOnce({
      rows: [{ total_leads: '0', total_calls: '0', total_bookings: '0', total_messages: '0', successful_calls: '0' }]
    });
    const { sendClientReport } = await import('../../../lib/automated-reporting.js');
    const r = await sendClientReport('a');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/No email/);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('sendClientReport sends when client has owner_email', async () => {
    getFullClient
      .mockResolvedValueOnce({
        display_name: 'A',
        client_key: 'a'
      })
      .mockResolvedValueOnce({ owner_email: 'o@x.com', email: null });
    query.mockResolvedValueOnce({
      rows: [{ total_leads: '0', total_calls: '0', total_bookings: '0', total_messages: '0', successful_calls: '0' }]
    });
    const { sendClientReport } = await import('../../../lib/automated-reporting.js');
    const r = await sendClientReport('a');
    expect(r.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'o@x.com', subject: expect.any(String) })
    );
  });

  test('sendScheduledReports aggregates enabled clients', async () => {
    listFullClients.mockResolvedValueOnce([
      { client_key: 'x', is_enabled: true },
      { client_key: 'y', is_enabled: false }
    ]);
    getFullClient
      .mockResolvedValueOnce({ display_name: 'X', client_key: 'x' })
      .mockResolvedValueOnce({ owner_email: 'a@b.com', email: null });
    query.mockResolvedValue({
      rows: [{ total_leads: '0', total_calls: '0', total_bookings: '0', total_messages: '0', successful_calls: '0' }]
    });
    const { sendScheduledReports } = await import('../../../lib/automated-reporting.js');
    const r = await sendScheduledReports('weekly');
    expect(r.total).toBe(1);
    expect(r.successful).toBe(1);
    expect(r.failed).toBe(0);
  });
});
