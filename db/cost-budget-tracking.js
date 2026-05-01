/**
 * Cost / budget / cost-alert query cluster.
 *
 * Extracted from db.js (PR-11 of the hygiene burndown). Each function is
 * a thin wrapper around `query()` so SQLite vs Postgres routing stays in
 * one place. db.js re-exports each function with the runner-bound `query`
 * baked in to preserve back-compat.
 *
 * Tables involved:
 *   - cost_tracking      (per-call cost rows; trackCost / get*)
 *   - budget_limits      (per-tenant daily/weekly/monthly caps; setBudgetLimit / getBudgetLimits)
 *   - cost_alerts        (alert thresholds + active/triggered status)
 *
 * NOTE: the period→interval helpers below intentionally **do not** accept
 * arbitrary user input (they whitelist 'daily' | 'weekly' | 'monthly');
 * the resulting fragment is interpolated into the SQL because Postgres
 * INTERVAL literals can't be parameterized.
 */

const PERIOD_TO_INTERVAL = {
  daily: '1 day',
  weekly: '7 days',
  monthly: '30 days',
};

function intervalForPeriod(period) {
  return PERIOD_TO_INTERVAL[period] || PERIOD_TO_INTERVAL.daily;
}

// ---------------------------------------------------------------------------
// cost_tracking
// ---------------------------------------------------------------------------

export async function trackCost(query, { clientKey, callId, costType, amount, currency = 'GBP', description, metadata }) {
  const metadataJson = metadata ? JSON.stringify(metadata) : null;
  const { rows } = await query(
    `
    INSERT INTO cost_tracking (client_key, call_id, cost_type, amount, currency, description, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
    `,
    [clientKey, callId, costType, amount, currency, description, metadataJson],
  );
  return rows[0];
}

export async function getCostsByTenant(query, clientKey, limit = 100) {
  const { rows } = await query(
    `
    SELECT * FROM cost_tracking
    WHERE client_key = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [clientKey, limit],
  );
  return rows;
}

export async function getCostsByPeriod(query, clientKey, period = 'daily') {
  const interval = intervalForPeriod(period);
  const { rows } = await query(
    `
    SELECT
      cost_type,
      SUM(amount) as total_amount,
      COUNT(*) as transaction_count,
      AVG(amount) as avg_amount
    FROM cost_tracking
    WHERE client_key = $1
      AND created_at > now() - interval '${interval}'
    GROUP BY cost_type
    ORDER BY total_amount DESC
    `,
    [clientKey],
  );
  return rows;
}

export async function getTotalCostsByTenant(query, clientKey, period = 'daily') {
  const interval = intervalForPeriod(period);
  const { rows } = await query(
    `
    SELECT
      SUM(amount) as total_cost,
      COUNT(*) as transaction_count,
      AVG(amount) as avg_cost
    FROM cost_tracking
    WHERE client_key = $1
      AND created_at > now() - interval '${interval}'
    `,
    [clientKey],
  );
  return rows[0];
}

// ---------------------------------------------------------------------------
// budget_limits
// ---------------------------------------------------------------------------

export async function setBudgetLimit(query, { clientKey, budgetType, dailyLimit, weeklyLimit, monthlyLimit, currency = 'GBP' }) {
  const { rows } = await query(
    `
    INSERT INTO budget_limits (client_key, budget_type, daily_limit, weekly_limit, monthly_limit, currency)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (client_key, budget_type)
    DO UPDATE SET
      daily_limit   = EXCLUDED.daily_limit,
      weekly_limit  = EXCLUDED.weekly_limit,
      monthly_limit = EXCLUDED.monthly_limit,
      currency      = EXCLUDED.currency,
      updated_at    = now()
    RETURNING *
    `,
    [clientKey, budgetType, dailyLimit, weeklyLimit, monthlyLimit, currency],
  );
  return rows[0];
}

export async function getBudgetLimits(query, clientKey) {
  const { rows } = await query(
    `
    SELECT * FROM budget_limits
    WHERE client_key = $1 AND is_active = TRUE
    ORDER BY budget_type
    `,
    [clientKey],
  );
  return rows;
}

export async function checkBudgetExceeded(query, clientKey, budgetType, period = 'daily') {
  const budgetLimits = await getBudgetLimits(query, clientKey);
  const budget = budgetLimits.find((b) => b.budget_type === budgetType);
  if (!budget) return { exceeded: false, limit: 0, current: 0 };

  const currentCosts = await getTotalCostsByTenant(query, clientKey, period);
  const currentAmount = parseFloat(currentCosts?.total_cost || 0);

  const limitField = (
    period === 'weekly' ? 'weekly_limit' :
    period === 'monthly' ? 'monthly_limit' :
    'daily_limit'
  );
  const limit = parseFloat(budget[limitField] || 0);

  return {
    exceeded: currentAmount > limit,
    limit,
    current: currentAmount,
    remaining: Math.max(0, limit - currentAmount),
    percentage: limit > 0 ? (currentAmount / limit) * 100 : 0,
  };
}

// ---------------------------------------------------------------------------
// cost_alerts
// ---------------------------------------------------------------------------

export async function createCostAlert(query, { clientKey, alertType, threshold, currentAmount, period }) {
  const { rows } = await query(
    `
    INSERT INTO cost_alerts (client_key, alert_type, threshold, current_amount, period, status)
    VALUES ($1, $2, $3, $4, $5, 'active')
    RETURNING *
    `,
    [clientKey, alertType, threshold, currentAmount, period],
  );
  return rows[0];
}

export async function getActiveAlerts(query, clientKey) {
  const { rows } = await query(
    `
    SELECT * FROM cost_alerts
    WHERE client_key = $1 AND status = 'active'
    ORDER BY created_at DESC
    `,
    [clientKey],
  );
  return rows;
}

export async function triggerAlert(query, alertId) {
  await query(
    `
    UPDATE cost_alerts
    SET status = 'triggered', triggered_at = now()
    WHERE id = $1
    `,
    [alertId],
  );
}

export async function checkCostAlerts(query, clientKey) {
  const alerts = await getActiveAlerts(query, clientKey);
  const triggeredAlerts = [];
  for (const alert of alerts) {
    const budgetCheck = await checkBudgetExceeded(query, clientKey, alert.alert_type, alert.period);
    if (budgetCheck.exceeded && budgetCheck.current >= alert.threshold) {
      await triggerAlert(query, alert.id);
      triggeredAlerts.push({
        alert,
        budgetCheck,
        message: `Budget exceeded: ${alert.alert_type} ${alert.period} limit of $${alert.threshold} reached (current: $${budgetCheck.current.toFixed(2)})`,
      });
    }
  }
  return triggeredAlerts;
}
