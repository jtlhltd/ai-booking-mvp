import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../../../db.js', () => ({ query }));

jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({
  default: { sendEmail: jest.fn(async () => ({ ok: true })) }
}));

describe('cost-monitoring', () => {
  const savedEmail = process.env.YOUR_EMAIL;

  beforeEach(() => {
    jest.resetModules();
    query.mockReset();
    delete process.env.YOUR_EMAIL;
  });

  afterEach(() => {
    if (savedEmail !== undefined) process.env.YOUR_EMAIL = savedEmail;
    else delete process.env.YOUR_EMAIL;
  });

  test('trackCost inserts and triggers budget check', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] }).mockResolvedValueOnce({ rows: [] }); // insert then budget_limits
    const { trackCost } = await import('../../../lib/cost-monitoring.js');
    const r = await trackCost({ clientKey: 'c', costType: 'sms', amount: 1.5, metadata: {} });
    expect(r.success).toBe(true);
  });

  test('getCostSummary aggregates rows', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { cost_type: 'a', total_cost: '10.5', event_count: '2' },
        { cost_type: 'b', total_cost: '1', event_count: '1' }
      ]
    });
    const { getCostSummary } = await import('../../../lib/cost-monitoring.js');
    const r = await getCostSummary({ clientKey: 'c', period: 'weekly' });
    expect(r.success).toBe(true);
    expect(r.total).toBeCloseTo(11.5);
  });

  test('checkBudgetAlerts returns empty when no budgets', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const { checkBudgetAlerts } = await import('../../../lib/cost-monitoring.js');
    const r = await checkBudgetAlerts('c', 'sms');
    expect(r.alerts).toEqual([]);
  });

  test('checkBudgetAlerts flags critical when spend exceeds limit', async () => {
    const budgetRow = {
      budget_type: 'sms',
      daily_limit: '10',
      weekly_limit: null,
      monthly_limit: null,
      is_active: true
    };
    query.mockImplementation(async (sql) => {
      const s = String(sql);
      if (s.includes('budget_limits')) return { rows: [budgetRow] };
      if (s.includes('SUM(amount)')) return { rows: [{ total: '12' }] };
      return { rows: [] };
    });
    const { checkBudgetAlerts } = await import('../../../lib/cost-monitoring.js');
    const r = await checkBudgetAlerts('c', 'sms');
    expect(r.alerts.some((a) => a.level === 'critical')).toBe(true);
  });

  test('monitorAllBudgets aggregates per tenant', async () => {
    query.mockImplementation(async (sql) => {
      const s = String(sql);
      if (s.includes('FROM tenants') && s.includes('is_enabled')) {
        return { rows: [{ client_key: 'a' }, { client_key: 'b' }] };
      }
      return { rows: [] };
    });
    const { monitorAllBudgets } = await import('../../../lib/cost-monitoring.js');
    const r = await monitorAllBudgets();
    expect(r.clientsChecked).toBe(2);
  });
});
