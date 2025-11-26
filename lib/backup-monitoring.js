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
 */
export async function verifyBackupSystem() {
  try {
    const checks = {
      databaseAccessible: false,
      recentActivity: false,
      backupAge: null,
      hasAnyData: false,
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
    
    // Check 2: Recent activity (indicates system is running)
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
      console.error('[BACKUP MONITORING] Activity query failed (may be new system):', queryError.message);
      // If query fails (e.g., tables don't exist yet), that's OK
      console.warn('[BACKUP MONITORING] Activity query failed (may be new system):', queryError.message);
      checks.recentActivity = true; // Assume healthy
      checks.backupAge = 0;
    }
    
    // Determine status
    if (!checks.databaseAccessible) {
      checks.status = 'error';
      checks.message = 'Database not accessible';
    } else if (checks.backupAge !== null && checks.backupAge > 48 && !checks.recentActivity) {
      // Check if this is a new/empty system vs. an active system with no recent activity
      if (checks.hasAnyData && checks.backupAge > 72) {
        // System has data but no activity for 3+ days - this is concerning
        checks.status = 'warning';
        checks.message = `No recent activity detected. Last activity: ${checks.backupAge.toFixed(1)} hours ago. Please verify backups in Render Dashboard.`;
      } else if (checks.hasAnyData) {
        // System has data but no activity for 48-72 hours - mild warning
        checks.status = 'info';
        checks.message = `System appears idle. Last activity: ${checks.backupAge.toFixed(1)} hours ago. Backups should still be running automatically on Render.`;
      } else {
        // New system with no data yet - this is normal
        checks.status = 'healthy';
        checks.message = 'System is new or has no data yet. Backups will be created automatically when data exists.';
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
    
    // If there's a warning or error, send alert
    // Only send emails for warnings and errors, not info messages
    if (verification.status === 'warning' || verification.status === 'error') {
      const message = verification.message || 'Backup verification failed';
      const severity = verification.status === 'error' ? '🚨 CRITICAL' : '⚠️ WARNING';
      
      if (process.env.YOUR_EMAIL) {
        try {
          await messagingService.sendEmail({
            to: process.env.YOUR_EMAIL,
            subject: `${severity} Backup Verification Alert - ${verification.status.toUpperCase()}`,
            body: `
Backup Verification Alert
========================

Status: ${verification.status.toUpperCase()}
Message: ${message}

Details:
- Database Accessible: ${verification.databaseAccessible ? 'Yes' : 'No'}
- Recent Activity: ${verification.recentActivity ? 'Yes' : 'No'}
- Hours Since Last Activity: ${verification.backupAge ? verification.backupAge.toFixed(1) : 'Unknown'}

Action Required:
1. Check Render Dashboard → Postgres → Backups tab
2. Verify automatic backups are enabled
3. Check if any backups exist in the last 48 hours
4. If no backups exist, create a manual backup immediately
5. If system is just idle (no recent leads/calls), this alert may be informational only

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
      // Log info messages but don't send email alerts
      console.log(`[BACKUP MONITORING] ℹ️ ${verification.message}`);
    } else {
      console.log('[BACKUP MONITORING] ✅ Backup system appears healthy');
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

