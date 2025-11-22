// Multi-Client Management System
// Tools for managing multiple clients at scale

import { query, listFullClients } from '../db.js';
import { analyzeCallOutcomes } from './call-outcome-analyzer.js';

/**
 * Get overview of all clients
 */
export async function getAllClientsOverview() {
  try {
    const clients = await listFullClients();
    
    const overview = await Promise.all(
      clients.map(async (client) => {
        // Get recent stats
        const stats = await getClientQuickStats(client.client_key);
        const health = await calculateClientHealth(client.client_key);
        
        return {
          clientKey: client.client_key,
          displayName: client.display_name,
          industry: client.industry || 'unknown',
          isEnabled: client.is_enabled,
          createdAt: client.created_at,
          stats,
          health
        };
      })
    );
    
    return {
      totalClients: overview.length,
      activeClients: overview.filter(c => c.isEnabled).length,
      clients: overview.sort((a, b) => 
        new Date(b.createdAt) - new Date(a.createdAt)
      )
    };
  } catch (error) {
    console.error('[MULTI-CLIENT MANAGER] Error:', error);
    return { error: error.message, clients: [] };
  }
}

/**
 * Get quick stats for a client
 */
async function getClientQuickStats(clientKey) {
  try {
    const { rows } = await query(`
      SELECT 
        (SELECT COUNT(*) FROM leads WHERE client_key = $1) as total_leads,
        (SELECT COUNT(*) FROM calls WHERE client_key = $1 AND created_at >= NOW() - INTERVAL '7 days') as calls_7d,
        (SELECT COUNT(*) FROM appointments WHERE client_key = $1 AND created_at >= NOW() - INTERVAL '7 days') as bookings_7d,
        (SELECT COUNT(*) FROM messages WHERE client_key = $1 AND created_at >= NOW() - INTERVAL '7 days') as messages_7d
    `, [clientKey]);
    
    const stats = rows[0];
    const calls = parseInt(stats.calls_7d) || 0;
    const bookings = parseInt(stats.bookings_7d) || 0;
    const conversionRate = calls > 0 ? (bookings / calls * 100).toFixed(1) : 0;
    
    return {
      totalLeads: parseInt(stats.total_leads) || 0,
      callsLast7Days: calls,
      bookingsLast7Days: bookings,
      messagesLast7Days: parseInt(stats.messages_7d) || 0,
      conversionRate: parseFloat(conversionRate)
    };
  } catch (error) {
    console.error('[CLIENT QUICK STATS] Error:', error);
    return {
      totalLeads: 0,
      callsLast7Days: 0,
      bookingsLast7Days: 0,
      messagesLast7Days: 0,
      conversionRate: 0
    };
  }
}

/**
 * Calculate client health score (0-100)
 */
async function calculateClientHealth(clientKey) {
  try {
    const stats = await getClientQuickStats(clientKey);
    const outcomes = await analyzeCallOutcomes(clientKey, 7);
    
    let score = 100;
    const issues = [];
    
    // Check activity
    if (stats.callsLast7Days === 0) {
      score -= 30;
      issues.push('No calls in last 7 days');
    }
    
    // Check conversion rate
    if (outcomes.conversionRate < 15) {
      score -= 20;
      issues.push(`Low conversion rate: ${outcomes.conversionRate}%`);
    } else if (outcomes.conversionRate >= 30) {
      score += 10;
    }
    
    // Check for errors
    if (outcomes.insights && outcomes.insights.some(i => i.type === 'warning' && i.impact === 'high')) {
      score -= 15;
      issues.push('High-priority issues detected');
    }
    
    // Determine health status
    let status = 'healthy';
    if (score < 50) {
      status = 'critical';
    } else if (score < 70) {
      status = 'warning';
    } else if (score >= 90) {
      status = 'excellent';
    }
    
    return {
      score: Math.max(0, Math.min(100, score)),
      status,
      issues
    };
  } catch (error) {
    console.error('[CLIENT HEALTH] Error:', error);
    return {
      score: 0,
      status: 'unknown',
      issues: ['Unable to calculate health']
    };
  }
}

/**
 * Get clients needing attention
 */
export async function getClientsNeedingAttention() {
  try {
    const overview = await getAllClientsOverview();
    
    const needingAttention = overview.clients.filter(client => {
      return (
        client.health.status === 'critical' ||
        client.health.status === 'warning' ||
        client.stats.callsLast7Days === 0 ||
        client.stats.conversionRate < 15
      );
    });
    
    return {
      total: needingAttention.length,
      critical: needingAttention.filter(c => c.health.status === 'critical').length,
      warning: needingAttention.filter(c => c.health.status === 'warning').length,
      clients: needingAttention.sort((a, b) => a.health.score - b.health.score)
    };
  } catch (error) {
    console.error('[CLIENTS NEEDING ATTENTION] Error:', error);
    return { total: 0, clients: [] };
  }
}

/**
 * Bulk operation: Enable/disable clients
 */
export async function bulkUpdateClientStatus(clientKeys, enabled) {
  try {
    const results = await Promise.all(
      clientKeys.map(async (clientKey) => {
        try {
          await query(`
            UPDATE tenants
            SET is_enabled = $1, updated_at = NOW()
            WHERE client_key = $2
          `, [enabled, clientKey]);
          return { clientKey, success: true };
        } catch (error) {
          return { clientKey, success: false, error: error.message };
        }
      })
    );
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success);
    
    return {
      total: clientKeys.length,
      successful,
      failed: failed.length,
      results
    };
  } catch (error) {
    console.error('[BULK UPDATE] Error:', error);
    return { error: error.message };
  }
}

/**
 * Get client performance comparison
 */
export async function compareClientPerformance(clientKeys, days = 30) {
  try {
    const comparisons = await Promise.all(
      clientKeys.map(async (clientKey) => {
        const stats = await getClientQuickStats(clientKey);
        const outcomes = await analyzeCallOutcomes(clientKey, days);
        const health = await calculateClientHealth(clientKey);
        
        return {
          clientKey,
          stats,
          outcomes,
          health
        };
      })
    );
    
    // Sort by conversion rate
    comparisons.sort((a, b) => 
      b.outcomes.conversionRate - a.outcomes.conversionRate
    );
    
    return {
      clients: comparisons,
      averageConversionRate: comparisons.length > 0
        ? (comparisons.reduce((sum, c) => sum + c.outcomes.conversionRate, 0) / comparisons.length).toFixed(1)
        : 0,
      topPerformer: comparisons[0] || null,
      needsImprovement: comparisons.filter(c => c.outcomes.conversionRate < 20)
    };
  } catch (error) {
    console.error('[CLIENT COMPARISON] Error:', error);
    return { error: error.message };
  }
}

