// lib/cost-monitoring.js
// Cost tracking and budget monitoring

import { query } from '../db.js';
import messagingService from './messaging-service.js';

/**
 * Track a cost event (VAPI call, SMS, etc.)
 */
export async function trackCost({ clientKey, costType, amount, metadata = {} }) {
  try {
    const result = await query(`
      INSERT INTO cost_tracking (client_key, cost_type, amount, metadata, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id
    `, [clientKey, costType, amount, JSON.stringify(metadata)]);
    
    // Check if we need to send budget alerts
    await checkBudgetAlerts(clientKey, costType);
    
    return { success: true, id: result.rows[0].id };
  } catch (error) {
    console.error('[COST MONITORING] Error tracking cost:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get cost summary for a client
 */
export async function getCostSummary({ clientKey, period = 'daily' }) {
  try {
    let interval = '1 day';
    if (period === 'weekly') interval = '7 days';
    if (period === 'monthly') interval = '30 days';
    
    const result = await query(`
      SELECT 
        cost_type,
        SUM(amount) as total_cost,
        COUNT(*) as event_count
      FROM cost_tracking
      WHERE client_key = $1
        AND created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY cost_type
      ORDER BY total_cost DESC
    `, [clientKey]);
    
    const total = result.rows.reduce((sum, row) => sum + parseFloat(row.total_cost || 0), 0);
    
    return {
      success: true,
      period,
      total,
      breakdown: result.rows,
      summary: {
        totalCost: total,
        eventCount: result.rows.reduce((sum, row) => sum + parseInt(row.event_count || 0), 0),
        byType: result.rows.map(row => ({
          type: row.cost_type,
          cost: parseFloat(row.total_cost || 0),
          count: parseInt(row.event_count || 0)
        }))
      }
    };
  } catch (error) {
    console.error('[COST MONITORING] Error getting cost summary:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check budget limits and send alerts
 */
export async function checkBudgetAlerts(clientKey, costType = null) {
  try {
    // Get all active budget limits for this client
    const budgets = await query(`
      SELECT * FROM budget_limits
      WHERE client_key = $1
        AND is_active = true
        AND (budget_type = $2 OR $2 IS NULL)
    `, [clientKey, costType]);
    
    if (budgets.rows.length === 0) {
      return { alerts: [] }; // No budgets configured
    }
    
    const alerts = [];
    
    for (const budget of budgets.rows) {
      // Check all periods (daily, weekly, monthly)
      const periods = [
        { name: 'daily', interval: '1 day', limit: budget.daily_limit },
        { name: 'weekly', interval: '7 days', limit: budget.weekly_limit },
        { name: 'monthly', interval: '30 days', limit: budget.monthly_limit }
      ];
      
      for (const period of periods) {
        if (!period.limit) continue; // Skip if no limit set for this period
        
        const spending = await query(`
          SELECT SUM(amount) as total
          FROM cost_tracking
          WHERE client_key = $1
            AND cost_type = $2
            AND created_at >= NOW() - INTERVAL '${period.interval}'
        `, [clientKey, budget.budget_type]);
        
        const currentSpending = parseFloat(spending.rows[0]?.total || 0);
        const budgetLimit = parseFloat(period.limit);
        const percentage = (currentSpending / budgetLimit) * 100;
      
        // Alert thresholds: 80%, 90%, 100%
        if (percentage >= 100) {
          alerts.push({
            level: 'critical',
            message: `Budget exceeded: ${budget.budget_type} (${period.name}) has reached ${percentage.toFixed(1)}% (${currentSpending.toFixed(2)}/${budgetLimit})`,
            budget: budget,
            period: period.name,
            currentSpending,
            percentage,
            limit: budgetLimit
          });
        } else if (percentage >= 90) {
          alerts.push({
            level: 'warning',
            message: `Budget nearly exceeded: ${budget.budget_type} (${period.name}) at ${percentage.toFixed(1)}% (${currentSpending.toFixed(2)}/${budgetLimit})`,
            budget: budget,
            period: period.name,
            currentSpending,
            percentage,
            limit: budgetLimit
          });
        } else if (percentage >= 80) {
          alerts.push({
            level: 'info',
            message: `Budget alert: ${budget.budget_type} (${period.name}) at ${percentage.toFixed(1)}% (${currentSpending.toFixed(2)}/${budgetLimit})`,
            budget: budget,
            period: period.name,
            currentSpending,
            percentage,
            limit: budgetLimit
          });
        }
      }
    }
    
    // Send alerts for critical and warning levels
    const criticalAlerts = alerts.filter(a => a.level === 'critical' || a.level === 'warning');
    if (criticalAlerts.length > 0 && process.env.YOUR_EMAIL) {
      try {
        await messagingService.sendEmail({
          to: process.env.YOUR_EMAIL,
          subject: `💰 Budget Alert: ${clientKey} - ${criticalAlerts[0].level.toUpperCase()}`,
          body: `
Budget Alert
===========

Client: ${clientKey}
Time: ${new Date().toISOString()}

Alerts:
${criticalAlerts.map(alert => `
- ${alert.level.toUpperCase()}: ${alert.message}
  Budget Type: ${alert.budget.budget_type}
  Period: ${alert.period}
  Current: £${alert.currentSpending.toFixed(2)}
  Limit: £${alert.limit.toFixed(2)}
  Percentage: ${alert.percentage.toFixed(1)}%
`).join('\n')}

Action Required:
${criticalAlerts.some(a => a.level === 'critical') 
  ? '- Budget exceeded! Consider pausing operations or increasing budget limit.'
  : '- Budget approaching limit. Monitor spending closely.'}

System: AI Booking MVP
          `.trim()
        });
        console.log('[COST MONITORING] ✅ Budget alert email sent');
      } catch (emailError) {
        console.error('[COST MONITORING] Failed to send budget alert:', emailError.message);
      }
    }
    
    return { alerts };
    
  } catch (error) {
    console.error('[COST MONITORING] Error checking budget alerts:', error);
    return { alerts: [], error: error.message };
  }
}

/**
 * Monitor all clients' budgets
 * Should be called by cron job
 */
export async function monitorAllBudgets() {
  try {
    console.log('[COST MONITORING] Monitoring all client budgets...');
    
    // Get all active clients
    const clients = await query(`
      SELECT client_key FROM tenants WHERE is_enabled = true
    `);
    
    let totalAlerts = 0;
    
    for (const client of clients.rows) {
      const result = await checkBudgetAlerts(client.client_key);
      totalAlerts += result.alerts.filter(a => a.level === 'critical' || a.level === 'warning').length;
    }
    
    console.log(`[COST MONITORING] ✅ Checked ${clients.rows.length} clients, found ${totalAlerts} budget alerts`);
    
    return { clientsChecked: clients.rows.length, alertsFound: totalAlerts };
    
  } catch (error) {
    console.error('[COST MONITORING] Error monitoring budgets:', error);
    return { error: error.message };
  }
}

export default {
  trackCost,
  getCostSummary,
  checkBudgetAlerts,
  monitorAllBudgets
};

