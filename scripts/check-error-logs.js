// scripts/check-error-logs.js
// Check error logs from database for suspicious activity

import { query } from '../db.js';

async function checkErrorLogs() {
  try {
    console.log('🔍 Checking error logs...\n');
    
    // Check if error_logs table exists
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'error_logs'
      )
    `);
    
    if (!tableCheck.rows[0]?.exists) {
      console.log('⚠️  error_logs table does not exist yet');
      console.log('   This is normal if the system is new or migrations haven\'t run');
      return;
    }
    
    // Get error summary for last 30 days
    const summary = await query(`
      SELECT 
        COUNT(*) as total_errors,
        COUNT(*) FILTER (WHERE severity = 'critical') as critical_errors,
        COUNT(*) FILTER (WHERE severity = 'error') as errors,
        COUNT(*) FILTER (WHERE severity = 'warning') as warnings,
        COUNT(DISTINCT error_type) as unique_error_types,
        MIN(logged_at) as first_error,
        MAX(logged_at) as last_error
      FROM error_logs
      WHERE logged_at >= NOW() - INTERVAL '30 days'
    `);
    
    const stats = summary.rows[0];
    console.log('📊 Error Summary (Last 30 Days):');
    console.log(`   Total Errors: ${stats.total_errors}`);
    console.log(`   Critical: ${stats.critical_errors}`);
    console.log(`   Errors: ${stats.errors}`);
    console.log(`   Warnings: ${stats.warnings}`);
    console.log(`   Unique Error Types: ${stats.unique_error_types}`);
    console.log(`   First Error: ${stats.first_error || 'N/A'}`);
    console.log(`   Last Error: ${stats.last_error || 'N/A'}\n`);
    
    if (parseInt(stats.total_errors) === 0) {
      console.log('✅ No errors found in the last 30 days!');
      return;
    }
    
    // Get top error types
    const topErrors = await query(`
      SELECT 
        error_type,
        COUNT(*) as count,
        MAX(logged_at) as last_occurred
      FROM error_logs
      WHERE logged_at >= NOW() - INTERVAL '30 days'
      GROUP BY error_type
      ORDER BY count DESC
      LIMIT 10
    `);
    
    console.log('🔴 Top Error Types:');
    topErrors.rows.forEach((err, i) => {
      console.log(`   ${i + 1}. ${err.error_type} (${err.count} times, last: ${err.last_occurred})`);
    });
    console.log('');
    
    // Get recent critical errors
    const criticalErrors = await query(`
      SELECT 
        error_type,
        error_message,
        service,
        logged_at,
        context
      FROM error_logs
      WHERE severity = 'critical'
        AND logged_at >= NOW() - INTERVAL '7 days'
      ORDER BY logged_at DESC
      LIMIT 10
    `);
    
    if (criticalErrors.rows.length > 0) {
      console.log('🚨 Recent Critical Errors (Last 7 Days):');
      criticalErrors.rows.forEach((err, i) => {
        console.log(`   ${i + 1}. [${err.logged_at}] ${err.error_type}`);
        console.log(`      Service: ${err.service}`);
        console.log(`      Message: ${err.error_message?.substring(0, 100)}${err.error_message?.length > 100 ? '...' : ''}`);
        if (err.context) {
          try {
            const ctx = typeof err.context === 'string' ? JSON.parse(err.context) : err.context;
            if (ctx.endpoint || ctx.path) {
              console.log(`      Endpoint: ${ctx.endpoint || ctx.path}`);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
        console.log('');
      });
    }
    
    // Get errors by service
    const byService = await query(`
      SELECT 
        service,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE severity = 'critical') as critical_count
      FROM error_logs
      WHERE logged_at >= NOW() - INTERVAL '7 days'
      GROUP BY service
      ORDER BY count DESC
    `);
    
    if (byService.rows.length > 0) {
      console.log('📦 Errors by Service (Last 7 Days):');
      byService.rows.forEach(svc => {
        const indicator = parseInt(svc.critical_count) > 0 ? '🚨' : '⚠️';
        console.log(`   ${indicator} ${svc.service}: ${svc.count} total, ${svc.critical_count} critical`);
      });
      console.log('');
    }
    
    // Get recent errors (last 24 hours)
    const recentErrors = await query(`
      SELECT 
        error_type,
        error_message,
        severity,
        service,
        logged_at
      FROM error_logs
      WHERE logged_at >= NOW() - INTERVAL '24 hours'
      ORDER BY logged_at DESC
      LIMIT 20
    `);
    
    if (recentErrors.rows.length > 0) {
      console.log('⏰ Recent Errors (Last 24 Hours):');
      recentErrors.rows.forEach((err, i) => {
        const icon = err.severity === 'critical' ? '🚨' : err.severity === 'error' ? '❌' : '⚠️';
        console.log(`   ${icon} [${err.logged_at}] ${err.error_type} (${err.service})`);
        console.log(`      ${err.error_message?.substring(0, 80)}${err.error_message?.length > 80 ? '...' : ''}`);
      });
    } else {
      console.log('✅ No errors in the last 24 hours!');
    }
    
    // Check for suspicious patterns
    console.log('\n🔍 Checking for suspicious patterns...\n');
    
    // Check for repeated errors (potential issues)
    const repeated = await query(`
      SELECT 
        error_type,
        error_message,
        COUNT(*) as count,
        MAX(logged_at) as last_occurred
      FROM error_logs
      WHERE logged_at >= NOW() - INTERVAL '7 days'
      GROUP BY error_type, error_message
      HAVING COUNT(*) >= 5
      ORDER BY count DESC
      LIMIT 5
    `);
    
    if (repeated.rows.length > 0) {
      console.log('⚠️  Repeated Errors (5+ times in last 7 days):');
      repeated.rows.forEach(err => {
        console.log(`   - ${err.error_type}: ${err.count} times (last: ${err.last_occurred})`);
        console.log(`     Message: ${err.error_message?.substring(0, 100)}${err.error_message?.length > 100 ? '...' : ''}`);
      });
      console.log('');
    }
    
    // Check for database errors
    const dbErrors = await query(`
      SELECT COUNT(*) as count
      FROM error_logs
      WHERE logged_at >= NOW() - INTERVAL '7 days'
        AND (error_type ILIKE '%database%' 
          OR error_type ILIKE '%postgres%'
          OR error_type ILIKE '%connection%'
          OR error_message ILIKE '%database%'
          OR error_message ILIKE '%postgres%')
    `);
    
    if (parseInt(dbErrors.rows[0]?.count || 0) > 0) {
      console.log(`⚠️  Database-related errors found: ${dbErrors.rows[0].count} in last 7 days`);
    }
    
    // Check for authentication/security errors
    const authErrors = await query(`
      SELECT COUNT(*) as count
      FROM error_logs
      WHERE logged_at >= NOW() - INTERVAL '7 days'
        AND (error_type ILIKE '%auth%'
          OR error_type ILIKE '%unauthorized%'
          OR error_type ILIKE '%forbidden%'
          OR error_message ILIKE '%unauthorized%'
          OR error_message ILIKE '%forbidden%')
    `);
    
    if (parseInt(authErrors.rows[0]?.count || 0) > 0) {
      console.log(`⚠️  Authentication/security errors found: ${authErrors.rows[0].count} in last 7 days`);
    }
    
    console.log('\n✅ Error log check complete!');
    
  } catch (error) {
    console.error('❌ Error checking logs:', error);
    console.error(error.stack);
  }
}

// Run the check
checkErrorLogs()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });



















