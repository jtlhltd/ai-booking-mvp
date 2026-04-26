import { describe, expect, test, jest, beforeEach } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../../../db.js', () => ({ query }));

describe('analytics-tracker', () => {
  beforeEach(() => {
    jest.resetModules();
    query.mockReset();
  });

  test('trackCallOutcome inserts and returns success', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const { trackCallOutcome } = await import('../../../lib/analytics-tracker.js');
    const r = await trackCallOutcome({
      callId: 'call-1',
      clientKey: 'ck',
      leadPhone: '+44',
      outcome: 'booked',
      duration: 42,
      cost: 1.5,
      appointmentBooked: true,
      appointmentTime: '2026-04-24T10:00:00Z',
      transcript: 'hi',
      sentiment: 'positive'
    });
    expect(r.success).toBe(true);
    expect(query).toHaveBeenCalled();
  });

  test('trackCallOutcome returns success false on error', async () => {
    query.mockRejectedValueOnce(new Error('db'));
    const { trackCallOutcome } = await import('../../../lib/analytics-tracker.js');
    const r = await trackCallOutcome({ callId: 'x', clientKey: 'c', leadPhone: '+1', outcome: 'x' });
    expect(r.success).toBe(false);
    expect(r.error).toBe('db');
  });

  test('getConversionMetrics uses date range when provided', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          total_calls: '3',
          appointments_booked: '1',
          not_interested: '0',
          no_answer: '1',
          voicemail: '0',
          callback_requested: '0',
          avg_duration_seconds: '20',
          total_cost: '10',
          conversion_rate_percent: '33.33'
        }
      ]
    });
    const { getConversionMetrics } = await import('../../../lib/analytics-tracker.js');
    const r = await getConversionMetrics('ck', { startDate: '2026-01-01', endDate: '2026-01-31' });
    expect(r.success).toBe(true);
    expect(r.metrics.total_calls).toBe('3');
    expect(Number(r.metrics.cost_per_appointment)).toBeGreaterThan(0);
  });

  test('getConversionTrend returns rows', async () => {
    query.mockResolvedValueOnce({ rows: [{ date: '2026-04-01', total_calls: '2', appointments_booked: '1', conversion_rate: '50' }] });
    const { getConversionTrend } = await import('../../../lib/analytics-tracker.js');
    const r = await getConversionTrend('ck', 7);
    expect(r.success).toBe(true);
    expect(r.trend).toHaveLength(1);
  });

  test('getOutcomeBreakdown returns rows', async () => {
    query.mockResolvedValueOnce({
      rows: [{ outcome: 'no_answer', count: '5', percentage: '100', avg_duration: '0', total_cost: '0' }]
    });
    const { getOutcomeBreakdown } = await import('../../../lib/analytics-tracker.js');
    const r = await getOutcomeBreakdown('ck');
    expect(r.success).toBe(true);
    expect(r.breakdown[0].outcome).toBe('no_answer');
  });

  test('generateWeeklyReport aggregates nested calls', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            total_calls: '4',
            appointments_booked: '2',
            not_interested: '0',
            no_answer: '0',
            voicemail: '0',
            callback_requested: '0',
            avg_duration_seconds: '30',
            total_cost: '20',
            conversion_rate_percent: '50'
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            total_calls: '8',
            appointments_booked: '2',
            not_interested: '0',
            no_answer: '0',
            voicemail: '0',
            callback_requested: '0',
            avg_duration_seconds: '25',
            total_cost: '40',
            conversion_rate_percent: '25'
          }
        ]
      });
    const { generateWeeklyReport } = await import('../../../lib/analytics-tracker.js');
    const r = await generateWeeklyReport('ck');
    expect(r.success).toBe(true);
    expect(r.report.summary.total_calls).toBe('4');
  });

  test('calculateLeadScore clamps to 0-100', async () => {
    const { calculateLeadScore } = await import('../../../lib/analytics-tracker.js');
    expect(calculateLeadScore({ rating: 100 }, { callAnswered: true, callDuration: 120, daysSinceContact: 1 })).toBe(100);
    expect(calculateLeadScore({}, { daysSinceContact: 400 })).toBeLessThan(50);
  });
});
