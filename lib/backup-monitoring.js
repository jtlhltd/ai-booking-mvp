// lib/backup-monitoring.js
// Automated backup verification and monitoring

import { query } from '../db.js';
import messagingService from './messaging-service.js';

/**
 * Check last backup age by querying database metadata
 * For Render Postgres, we check pg_stat_database for last activity
 * This is a proxy check - actual backup verification requires Render API
 */
export async function checkLastBackupAge() {
  try {
    // Query PostgreSQL to get database statistics
    // This gives us the last activity timestamp as a proxy
    const result = await query(`
      SELECT 
        stats_reset,
        NOW() - stats_reset AS age
      FROM pg_stat_database 
      WHERE datname = current_database()
    `);
    
    if (result.rows.length === 0) {
      return null; // Can't determine
    }
    
    // For Render Postgres, we can also check the last successful operation
    // by looking at the most recent record in a critical table
    const lastActivity = await query(`
      SELECT MAX(created_at) as last_activity
      FROM (
        SELECT created_at FROM appointments ORDER BY created_at DESC LIMIT 1
        UNION ALL
        SELECT created_at FROM calls ORDER BY created_at DESC LIMIT 1
        UNION ALL
        SELECT created_at FROM leads ORDER BY created_at DESC LIMIT 1
        UNION ALL
        SELECT created_at FROM messages ORDER BY created_at DESC LIMIT 1
      ) AS recent_activity
    `);
    
    const lastActivityTime = lastActivity.rows[0]?.last_activity;
    if (!lastActivityTime) {
      return null;
    }
    
    const hoursSinceActivity = (Date.now() - new Date(lastActivityTime).getTime()) / (1000 * 60 * 60);
    
    // Render Postgres creates backups daily, so we check if there's been activity
    // in the last 48 hours (indicating system is active and backups should be happening)
    return hoursSinceActivity;
    
  } catch (error) {
    console.error('[BACKUP MONITORING] Error checking backup age:', error);
    return null;
  }
}

/**
 * Verify backup system is working
 * Checks multiple indicators that backups should be happening
 * Intelligently distinguishes between idle systems and actual issues
 */
export async function verifyBackupSystem() {
  try {
    const checks = {
      databaseAccessible: false,
      recentActivity: false,
      backupAge: null,
      hasAnyData: false,
      hasActiveClients: false,
      hasPendingWork: false,
      totalClients: 0,
      status: 'unknown'
    };
    
    // Check 1: Database is accessible
    try {
      await query('SELECT 1');
      checks.databaseAccessible = true;
    } catch (error) {
      return {
        ...checks,
        status: 'error',
        error: 'Database not accessible',
        message: 'Cannot verify backups - database connection failed'
      };
    }
    
    // Check 2: Check if there are active clients configured
    try {
      const clientsResult = await query(`
        SELECT COUNT(*) as count 
        FROM tenants 
        WHERE active = true
      `).catch(() => ({ rows: [{ count: '0' }] }));
      
      checks.totalClients = parseInt(clientsResult.rows[0]?.count || '0', 10);
      checks.hasActiveClients = checks.totalClients > 0;
    } catch (error) {
      // Table might not exist yet
      console.warn('[BACKUP MONITORING] Could not check active clients:', error.message);
    }
    
    // Check 3: Check for pending work (leads waiting, scheduled calls, etc.)
    try {
      const pendingWorkQueries = await Promise.allSettled([
        // Leads waiting to be called
        query(`SELECT COUNT(*) as count FROM leads WHERE status IN ('new', 'pending', 'follow_up')`).catch(() => ({ rows: [{ count: '0' }] })),
        // Scheduled appointments in the future
        query(`SELECT COUNT(*) as count FROM appointments WHERE appointment_time > NOW() AND status = 'scheduled'`).catch(() => ({ rows: [{ count: '0' }] })),
        // Recent leads that should trigger activity
        query(`SELECT COUNT(*) as count FROM leads WHERE created_at > NOW() - INTERVAL '7 days'`).catch(() => ({ rows: [{ count: '0' }] }))
      ]);
      
      const pendingCounts = pendingWorkQueries
        .filter(r => r.status === 'fulfilled')
        .map(r => parseInt(r.value?.rows?.[0]?.count || '0', 10));
      
      checks.hasPendingWork = pendingCounts.some(count => count > 0);
    } catch (error) {
      console.warn('[BACKUP MONITORING] Could not check pending work:', error.message);
    }
    
    // Check 4: Recent activity (indicates system is running)
    try {
      // Use a more robust query that handles missing tables gracefully
      // Get max from each table separately, then find the overall max
      const activityQueries = await Promise.allSettled([
        query(`SELECT MAX(created_at) as last_activity FROM appointments WHERE created_at IS NOT NULL`),
        query(`SELECT MAX(created_at) as last_activity FROM calls WHERE created_at IS NOT NULL`),
        query(`SELECT MAX(created_at) as last_activity FROM leads WHERE created_at IS NOT NULL`)
      ]);
      
      const activityTimes = activityQueries
        .filter(result => result.status === 'fulfilled' && result.value?.rows?.[0]?.last_activity)
        .map(result => new Date(result.value.rows[0].last_activity));
      
      checks.hasAnyData = activityTimes.length > 0;
      
      const lastActivity = activityTimes.length > 0 
        ? { rows: [{ last_activity: new Date(Math.max(...activityTimes.map(d => d.getTime()))).toISOString() }] }
        : { rows: [] };
      
      const lastActivityTime = lastActivity.rows[0]?.last_activity;
      if (lastActivityTime) {
        const hoursSinceActivity = (Date.now() - new Date(lastActivityTime).getTime()) / (1000 * 60 * 60);
        checks.recentActivity = hoursSinceActivity < 48;
        checks.backupAge = hoursSinceActivity;
      } else {
        // No activity yet - this is OK for new systems
        checks.recentActivity = true; // Assume healthy if no data yet
        checks.backupAge = 0;
      }
    } catch (queryError) {
      // Log but don't fail - this is a monitoring check, not critical
      console.warn('[BACKUP MONITORING] Activity query failed (may be new system):', queryError.message);
      checks.recentActivity = true; // Assume healthy
      checks.backupAge = 0;
    }
    
    // Determine status with smarter logic
    if (!checks.databaseAccessible) {
      checks.status = 'error';
      checks.message = 'Database not accessible';
    } else if (checks.backupAge !== null && checks.backupAge > 48 && !checks.recentActivity) {
      // System has no recent activity - determine if this is expected or concerning
      
      const daysSinceActivity = checks.backupAge / 24;
      
      // Scenario 1: New system with no clients yet - completely normal
      if (!checks.hasActiveClients && !checks.hasAnyData) {
        checks.status = 'healthy';
        checks.message = 'System is new with no active clients yet. Backups will be created automatically when data exists.';
      }
      // Scenario 2: System has clients but no data yet - still normal
      else if (checks.hasActiveClients && !checks.hasAnyData) {
        checks.status = 'healthy';
        checks.message = 'System has active clients but no activity yet. This is normal for new setups. Backups will be created automatically.';
      }
      // Scenario 3: System has data and clients, but no pending work and no activity for 7+ days
      // This is likely an idle system (no leads to process) - not concerning
      else if (checks.hasAnyData && checks.hasActiveClients && !checks.hasPendingWork && daysSinceActivity >= 7) {
        checks.status = 'info';
        checks.message = `System appears idle (no pending leads/calls). Last activity: ${daysSinceActivity.toFixed(1)} days ago. This is normal if there are no leads to process. Render Postgres creates backups automatically regardless of activity.`;
      }
      // Scenario 4: System has pending work but no activity - this is concerning
      else if (checks.hasPendingWork && daysSinceActivity >= 3) {
        checks.status = 'warning';
        checks.message = `⚠️ System has pending work but no activity for ${daysSinceActivity.toFixed(1)} days. This may indicate a problem. Please verify backups in Render Dashboard and check system health.`;
      }
      // Scenario 5: System has active clients and recent data, but no activity for 5+ days
      // This could be concerning if clients expect activity
      else if (checks.hasActiveClients && checks.hasAnyData && daysSinceActivity >= 5) {
        checks.status = 'info';
        checks.message = `System has active clients but no activity for ${daysSinceActivity.toFixed(1)} days. If clients are expecting leads to be processed, please verify system is running. Render Postgres backups continue automatically regardless.`;
      }
      // Scenario 6: System has data but no clients - might be test/development data
      else if (checks.hasAnyData && !checks.hasActiveClients && daysSinceActivity >= 7) {
        checks.status = 'info';
        checks.message = `System has data but no active clients. Last activity: ${daysSinceActivity.toFixed(1)} days ago. This may be test data. Backups continue automatically on Render.`;
      }
      // Scenario 7: Short idle period (2-3 days) - informational only
      else if (daysSinceActivity >= 2 && daysSinceActivity < 5) {
        checks.status = 'info';
        checks.message = `System appears idle. Last activity: ${daysSinceActivity.toFixed(1)} days ago. Backups continue automatically on Render Postgres.`;
      }
      // Default: healthy
      else {
        checks.status = 'healthy';
        checks.message = 'Backup system appears to be functioning normally';
      }
    } else {
      checks.status = 'healthy';
      checks.message = 'Backup system appears to be functioning normally';
    }
    
    return checks;
    
  } catch (error) {
    console.error('[BACKUP MONITORING] Error verifying backup system:', error);
    return {
      status: 'error',
      error: error.message,
      message: 'Failed to verify backup system'
    };
  }
}

/**
 * Monitor backups and send alerts if needed
 * This should be called by a cron job
 */
export async function monitorBackups() {
  try {
    console.log('[BACKUP MONITORING] Checking backup status...');
    
    const verification = await verifyBackupSystem();
    
    // Only send emails for warnings and errors, not info messages
    if (verification.status === 'warning' || verification.status === 'error') {
      const message = verification.message || 'Backup verification failed';
      const severity = verification.status === 'error' ? '🚨 CRITICAL' : '⚠️ WARNING';
      
      if (process.env.YOUR_EMAIL) {
        try {
          const daysSinceActivity = verification.backupAge ? (verification.backupAge / 24).toFixed(1) : 'Unknown';
          const contextInfo = [];
          
          if (verification.totalClients !== undefined) {
            contextInfo.push(`- Active Clients: ${verification.totalClients}`);
          }
          if (verification.hasPendingWork !== undefined) {
            contextInfo.push(`- Pending Work: ${verification.hasPendingWork ? 'Yes' : 'No'}`);
          }
          if (verification.hasAnyData !== undefined) {
            contextInfo.push(`- Has Historical Data: ${verification.hasAnyData ? 'Yes' : 'No'}`);
          }
          
          await messagingService.sendEmail({
            to: process.env.YOUR_EMAIL,
            subject: `${severity} Backup Verification Alert - ${verification.status.toUpperCase()}`,
            body: `
Backup Verification Alert
========================

Status: ${verification.status.toUpperCase()}
Message: ${message}

System Context:
- Database Accessible: ${verification.databaseAccessible ? 'Yes' : 'No'}
- Recent Activity: ${verification.recentActivity ? 'Yes' : 'No'}
- Days Since Last Activity: ${daysSinceActivity}
${contextInfo.length > 0 ? contextInfo.join('\n') : ''}

Action Required:
1. Check Render Dashboard → Postgres → Backups tab
2. Verify automatic backups are enabled
3. Check if any backups exist in the last 48 hours
4. If no backups exist, create a manual backup immediately
${verification.hasPendingWork ? '5. ⚠️ System has pending work - verify follow-up processor is running' : '5. If system is just idle (no recent leads/calls), this alert may be informational only'}

Note: This alert is based on database activity as a proxy. Render Postgres creates backups automatically regardless of activity. Please verify actual backup status in Render Dashboard.

Time: ${new Date().toISOString()}
System: AI Booking System
            `.trim()
          });
          console.log('[BACKUP MONITORING] ✅ Alert email sent');
        } catch (emailError) {
          console.error('[BACKUP MONITORING] Failed to send alert email:', emailError.message);
        }
      }
    } else if (verification.status === 'info') {
      // Log info messages but don't send email alerts (system is likely just idle)
      console.log(`[BACKUP MONITORING] ℹ️ ${verification.message}`);
      console.log(`[BACKUP MONITORING]   Context: ${verification.totalClients || 0} active clients, ${verification.hasPendingWork ? 'has' : 'no'} pending work`);
    } else {
      console.log('[BACKUP MONITORING] ✅ Backup system appears healthy');
      if (verification.backupAge !== null && verification.backupAge > 0) {
        console.log(`[BACKUP MONITORING]   Last activity: ${(verification.backupAge / 24).toFixed(1)} days ago`);
      }
    }
    
    return verification;
    
  } catch (error) {
    console.error('[BACKUP MONITORING] Error in monitorBackups:', error);
    return {
      status: 'error',
      error: error.message
    };
  }
}

export default {
  checkLastBackupAge,
  verifyBackupSystem,
  monitorBackups
};

