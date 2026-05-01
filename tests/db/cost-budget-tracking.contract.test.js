import { describe, expect, test, jest, beforeEach } from '@jest/globals';

import * as costBudget from '../../db/cost-budget-tracking.js';

function makeQueryMock() {
  const calls = [];
  const fn = jest.fn(async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [] };
  });
  fn.calls = calls;
  return fn;
}

describe('db/cost-budget-tracking — SQL contract', () => {
  let query;

  beforeEach(() => {
    query = makeQueryMock();
  });

  // -------------------------------------------------------------------------
  // cost_tracking
  // -------------------------------------------------------------------------

  test('trackCost inserts into cost_tracking with metadata JSON-stringified', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await costBudget.trackCost(query, {
      clientKey: 'tenant-a',
      callId: 'call-1',
      costType: 'vapi_call',
      amount: 0.42,
      currency: 'GBP',
      description: 'test',
      metadata: { foo: 'bar' },
    });
    expect(res).toEqual({ id: 1 });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO cost_tracking/);
    expect(params).toEqual([
      'tenant-a',
      'call-1',
      'vapi_call',
      0.42,
      'GBP',
      'test',
      JSON.stringify({ foo: 'bar' }),
    ]);
  });

  test('trackCost passes null for missing metadata', async () => {
    await costBudget.trackCost(query, { clientKey: 'tenant-a', callId: 'c', costType: 'x', amount: 1, description: '' });
    const [, params] = query.mock.calls[0];
    expect(params[6]).toBeNull();
  });

  test('getCostsByTenant orders DESC and binds limit', async () => {
    await costBudget.getCostsByTenant(query, 'tenant-a', 25);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/SELECT \* FROM cost_tracking/);
    expect(sql).toMatch(/ORDER BY created_at DESC/);
    expect(params).toEqual(['tenant-a', 25]);
  });

  test('getCostsByPeriod whitelists period → interval and only binds clientKey', async () => {
    await costBudget.getCostsByPeriod(query, 'tenant-a', 'weekly');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/interval '7 days'/);
    expect(params).toEqual(['tenant-a']);
  });

  test('getCostsByPeriod falls back to daily on unknown period', async () => {
    await costBudget.getCostsByPeriod(query, 'tenant-a', "''; DROP TABLE cost_tracking; --");
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/interval '1 day'/);
    expect(sql).not.toMatch(/DROP TABLE/);
  });

  test('getTotalCostsByTenant returns the first row', async () => {
    query.mockResolvedValueOnce({ rows: [{ total_cost: 12.34 }] });
    const out = await costBudget.getTotalCostsByTenant(query, 'tenant-a', 'monthly');
    expect(out).toEqual({ total_cost: 12.34 });
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/interval '30 days'/);
  });

  // -------------------------------------------------------------------------
  // budget_limits
  // -------------------------------------------------------------------------

  test('setBudgetLimit upserts on (client_key, budget_type)', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    await costBudget.setBudgetLimit(query, {
      clientKey: 'tenant-a',
      budgetType: 'vapi',
      dailyLimit: 5,
      weeklyLimit: 30,
      monthlyLimit: 120,
    });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO budget_limits/);
    expect(sql).toMatch(/ON CONFLICT \(client_key, budget_type\)/);
    expect(params).toEqual(['tenant-a', 'vapi', 5, 30, 120, 'GBP']);
  });

  test('getBudgetLimits filters is_active = TRUE', async () => {
    await costBudget.getBudgetLimits(query, 'tenant-a');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/SELECT \* FROM budget_limits/);
    expect(sql).toMatch(/is_active = TRUE/);
    expect(params).toEqual(['tenant-a']);
  });

  test('checkBudgetExceeded returns zero when no matching budget row', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const out = await costBudget.checkBudgetExceeded(query, 'tenant-a', 'vapi', 'daily');
    expect(out).toEqual({ exceeded: false, limit: 0, current: 0 });
  });

  test('checkBudgetExceeded computes percentage and exceeded flag', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ budget_type: 'vapi', daily_limit: '10', weekly_limit: '50', monthly_limit: '200' }],
      })
      .mockResolvedValueOnce({ rows: [{ total_cost: '15' }] });
    const out = await costBudget.checkBudgetExceeded(query, 'tenant-a', 'vapi', 'daily');
    expect(out.exceeded).toBe(true);
    expect(out.limit).toBe(10);
    expect(out.current).toBe(15);
    expect(out.remaining).toBe(0);
    expect(out.percentage).toBe(150);
  });

  test('checkBudgetExceeded weekly uses weekly_limit', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ budget_type: 'vapi', daily_limit: '10', weekly_limit: '50', monthly_limit: '200' }],
      })
      .mockResolvedValueOnce({ rows: [{ total_cost: '40' }] });
    const out = await costBudget.checkBudgetExceeded(query, 'tenant-a', 'vapi', 'weekly');
    expect(out.limit).toBe(50);
    expect(out.exceeded).toBe(false);
  });

  // -------------------------------------------------------------------------
  // cost_alerts
  // -------------------------------------------------------------------------

  test('createCostAlert inserts with status active', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    await costBudget.createCostAlert(query, {
      clientKey: 'tenant-a',
      alertType: 'vapi',
      threshold: 5,
      currentAmount: 3,
      period: 'daily',
    });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO cost_alerts/);
    expect(sql).toMatch(/'active'/);
    expect(params).toEqual(['tenant-a', 'vapi', 5, 3, 'daily']);
  });

  test('triggerAlert updates row to triggered with timestamp', async () => {
    await costBudget.triggerAlert(query, 99);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/UPDATE cost_alerts/);
    expect(sql).toMatch(/SET status = 'triggered'/);
    expect(params).toEqual([99]);
  });

  test('checkCostAlerts triggers only when threshold reached', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          { id: 1, alert_type: 'vapi', period: 'daily', threshold: 10 },
          { id: 2, alert_type: 'twilio', period: 'daily', threshold: 50 },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ budget_type: 'vapi', daily_limit: '10', weekly_limit: '50', monthly_limit: '200' }],
      })
      .mockResolvedValueOnce({ rows: [{ total_cost: '15' }] })
      .mockResolvedValueOnce({ rows: undefined })
      .mockResolvedValueOnce({
        rows: [{ budget_type: 'twilio', daily_limit: '100', weekly_limit: '500', monthly_limit: '2000' }],
      })
      .mockResolvedValueOnce({ rows: [{ total_cost: '20' }] });
    const out = await costBudget.checkCostAlerts(query, 'tenant-a');
    expect(out).toHaveLength(1);
    expect(out[0].alert.id).toBe(1);
    expect(out[0].message).toMatch(/Budget exceeded/);
  });
});
