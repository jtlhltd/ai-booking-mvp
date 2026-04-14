/**
 * Scheduled jobs (cron + setInterval) for the AI Booking System.
 * Extracted from server.js so all schedule registration lives in one place.
 *
 * @param {Object} deps - Server-local functions that crons depend on
 * @param {Function} deps.processCallQueue - Process call queue
 * @param {Function} deps.processRetryQueue - Process retry queue
 * @param {Function} deps.queueNewLeadsForCalling - Queue new leads for calling
 * @param {Function} deps.sendScheduledReminders - Send scheduled appointment reminders
 */
import cron from 'node-cron';

export function registerScheduledJobs(deps = {}) {
  const {
    processCallQueue = async () => {},
    processRetryQueue = async () => {},
    queueNewLeadsForCalling = async () => {},
    sendScheduledReminders = async () => {}
  } = deps;

  // Appointment reminder processor (runs every 5 minutes via setInterval)
  setInterval(async () => {
    try {
      await sendScheduledReminders();
    } catch (error) {
      console.error('Reminder processor error:', error);
    }
  }, 5 * 60 * 1000);

  // Quality monitoring (hourly at :12 UTC to avoid colliding with */5 and */2 crons at :00)
  import('./quality-monitoring.js').then(({ monitorAllClients }) => {
    cron.schedule('12 * * * *', async () => {
      console.log('[CRON] 🔄 Running hourly quality monitoring...');
      try {
        await monitorAllClients();
      } catch (error) {
        console.error('[CRON ERROR] Quality monitoring failed:', error);
      }
    });
    console.log('✅ Quality monitoring cron job scheduled (runs every hour at :12)');
  });

  // Appointment reminder queue (every 5 min, offset +1m so */5 jobs don’t all hit DB at :00)
  import('./appointment-reminders.js').then(({ processReminderQueue }) => {
    cron.schedule('1-59/5 * * * *', async () => {
      console.log('[CRON] ⏰ Processing appointment reminders...');
      try {
        const result = await processReminderQueue();
        if (result.processed > 0) {
          console.log(`[CRON] ✅ Processed ${result.processed} reminders`);
        }
      } catch (error) {
        console.error('[CRON ERROR] Reminder processing failed:', error);
      }
    });
    console.log('✅ Appointment reminder cron job scheduled (every 5 min at :01,:06,…)');
  });

  // Follow-up messages (every 5 min, +2m offset)
  import('./follow-up-processor.js').then(({ processFollowUpQueue }) => {
    cron.schedule('2-59/5 * * * *', async () => {
      console.log('[CRON] 📨 Processing follow-up messages...');
      try {
        const result = await processFollowUpQueue();
        if (result.processed > 0) {
          console.log(`[CRON] ✅ Processed ${result.processed} follow-ups (${result.failed} failed)`);
        }
      } catch (error) {
        console.error('[CRON ERROR] Follow-up processing failed:', error);
      }
    });
    console.log('✅ Follow-up message cron job scheduled (every 5 min at :02,:07,…)');
  });

  // Database health (every 5 min, +3m offset)
  import('./database-health.js').then(({ checkDatabaseHealth }) => {
    cron.schedule('3-59/5 * * * *', async () => {
      try {
        const health = await checkDatabaseHealth();
        if (health.status !== 'healthy') {
          console.error(`[DB HEALTH] ⚠️ Status: ${health.status}, Failures: ${health.consecutiveFailures}`);
        }
      } catch (error) {
        console.error('[CRON ERROR] Database health check failed:', error);
      }
    });
    console.log('✅ Database health monitoring scheduled (every 5 min at :03,:08,…)');
  });

  // Weekly reports (Mondays 9 AM)
  cron.schedule('0 9 * * 1', async () => {
    console.log('[CRON] 📊 Generating weekly reports...');
    try {
      const { generateAndSendAllWeeklyReports } = await import('./weekly-report.js');
      const result = await generateAndSendAllWeeklyReports();
      console.log(`[CRON] ✅ Weekly reports completed: ${result.generated} generated, ${result.sent} sent`);
    } catch (error) {
      console.error('[CRON ERROR] Weekly report generation failed:', error);
    }
    try {
      const { sendOperatorWeeklyStackReport } = await import('./operator-weekly-stack-report.js');
      const op = await sendOperatorWeeklyStackReport();
      console.log('[CRON] Operator weekly stack summary:', op);
    } catch (opErr) {
      console.error('[CRON ERROR] Operator weekly stack summary failed:', opErr);
    }
  });
  console.log('✅ Weekly report generation scheduled (runs every Monday at 9 AM)');

  // Outbound A/B: email when live experiment reaches min leads per variant (no auto winner)
  cron.schedule('*/15 * * * *', async () => {
    try {
      const { sweepOutboundAbSampleReady } = await import('./outbound-ab-sample-ready-email.js');
      await sweepOutboundAbSampleReady();
    } catch (error) {
      console.error('[CRON ERROR] Outbound A/B sample-ready sweep failed:', error);
    }
  });
  console.log('✅ Outbound A/B sample-ready email sweep scheduled (every 15 minutes)');

  // Backup monitoring (daily 6 AM)
  import('./backup-monitoring.js').then(({ monitorBackups }) => {
    cron.schedule('0 6 * * *', async () => {
      console.log('[CRON] 💾 Checking backup status...');
      try {
        const result = await monitorBackups();
        if (result.status === 'healthy') {
          console.log('[CRON] ✅ Backup system appears healthy');
        } else {
          console.log(`[CRON] ⚠️ Backup check: ${result.status} - ${result.message || ''}`);
        }
      } catch (error) {
        console.error('[CRON ERROR] Backup monitoring failed:', error);
      }
    });
    console.log('✅ Backup monitoring scheduled (runs daily at 6 AM)');
  });

  // Budget monitoring (every 6 hours)
  import('./cost-monitoring.js').then(({ monitorAllBudgets }) => {
    cron.schedule('0 */6 * * *', async () => {
      console.log('[CRON] 💰 Monitoring client budgets...');
      try {
        const result = await monitorAllBudgets();
        console.log(`[CRON] ✅ Budget monitoring completed: ${result.clientsChecked} clients checked, ${result.alertsFound} alerts found`);
      } catch (error) {
        console.error('[CRON ERROR] Budget monitoring failed:', error);
      }
    });
    console.log('✅ Budget monitoring scheduled (runs every 6 hours)');
  });

  // Weekly automated client reports (Mondays 9 AM)
  cron.schedule('0 9 * * 1', async () => {
    try {
      const { sendScheduledReports } = await import('./automated-reporting.js');
      const result = await sendScheduledReports('weekly');
      console.log(`[AUTOMATED REPORTS] Sent ${result.successful}/${result.total} weekly reports`);
    } catch (error) {
      console.error('[AUTOMATED REPORTS ERROR]', error);
    }
  });
  console.log('✅ Scheduled: Weekly automated client reports (Mondays 9 AM)');

  // Connection pool health (every 15 min)
  cron.schedule('*/15 * * * *', async () => {
    try {
      const { checkPoolHealth } = await import('./connection-pool-monitor.js');
      await checkPoolHealth();
    } catch (error) {
      console.error('[POOL MONITOR CRON ERROR]', error);
    }
  });
  console.log('✅ Connection pool monitoring scheduled (runs every 15 minutes)');

  // Vapi call_queue: even minutes only (no concurrent scan with sms/lead_import processor).
  // Ops note: outbound throughput still depends on this cron + Vapi credits + business hours; queue depth and failed_q are on GET /api/admin/system-health.
  cron.schedule('0-58/2 * * * *', async () => {
    console.log('[CRON] 📞 Processing call queue...');
    try {
      await processCallQueue();
    } catch (error) {
      console.error('[CRON ERROR] Call queue processing failed:', error);
    }
  });
  console.log('✅ Call queue processor scheduled (even minutes UTC)');

  // Odd minutes: retry queue first, then sms_send/lead_import request-queue (same table, sequential to avoid overlap).
  cron.schedule('1-59/2 * * * *', async () => {
    console.log('[CRON] 🔄 Processing retry queue...');
    try {
      await processRetryQueue();
    } catch (error) {
      console.error('[CRON ERROR] Retry queue processing failed:', error);
    }
    try {
      const { processQueue } = await import('./request-queue.js');
      const result = await processQueue({ maxConcurrent: 1, maxProcess: 50 });
      if (result.processed > 0) {
        console.log(`[REQUEST QUEUE] Processed ${result.processed} queued requests`);
      }
    } catch (error) {
      console.error('[REQUEST QUEUE CRON ERROR]', error);
    }
  });
  console.log('✅ Retry queue + request-queue processor scheduled (odd minutes UTC, sequential)');

  // Ops invariants (every 5 min, +4m offset)
  cron.schedule('4-59/5 * * * *', async () => {
    try {
      const { checkOpsInvariants } = await import('./ops-invariants.js');
      await checkOpsInvariants();
    } catch (error) {
      console.error('[CRON ERROR] Ops invariants check failed:', error);
    }
  });
  console.log('✅ Ops invariants monitoring scheduled (every 5 min at :04,:09,…)');

  // New lead queuer (every 5 min) – uses server-local function
  cron.schedule('*/5 * * * *', async () => {
    console.log('[CRON] 📋 Queueing new leads for calling...');
    try {
      await queueNewLeadsForCalling();
    } catch (error) {
      console.error('[CRON ERROR] Lead queuing failed:', error);
    }
  });
  console.log('✅ New lead queuer scheduled (runs every 5 minutes)');

  // Dead letter queue cleanup (daily 2 AM)
  cron.schedule('0 2 * * *', async () => {
    try {
      const { cleanupDLQ } = await import('./dead-letter-queue.js');
      const result = await cleanupDLQ();
      if (result.deleted > 0) {
        console.log(`[DLQ CLEANUP] Deleted ${result.deleted} old resolved items`);
      }
    } catch (error) {
      console.error('[DLQ CLEANUP CRON ERROR]', error);
    }
  });
  console.log('✅ Dead letter queue cleanup scheduled (runs daily at 2 AM)');

  // Webhook retry (every 5 min, +7m offset — avoids stacking with lead queuer at :00,:05,…)
  import('./webhook-retry.js').then(({ processWebhookRetryQueue }) => {
    cron.schedule('7-57/5 * * * *', async () => {
      console.log('[CRON] 🔄 Processing webhook retries...');
      try {
        const result = await processWebhookRetryQueue();
        if (result.processed > 0) {
          console.log(`[CRON] ✅ Processed ${result.processed} webhook retries (${result.success} succeeded, ${result.failed} failed)`);
        }
      } catch (error) {
        console.error('[CRON ERROR] Webhook retry processing failed:', error);
      }
    });
    console.log('✅ Webhook retry processing scheduled (every 5 min at :07,:12,…)');
  });

  // Automated data cleanup (Sundays 3 AM)
  cron.schedule('0 3 * * 0', async () => {
    console.log('[CRON] 🧹 Starting automated data cleanup...');
    try {
      const { GDPRManager } = await import('./security.js');
      const { query } = (await import('../db.js'));
      const gdpr = new GDPRManager({ query });
      const result = await gdpr.applyDataRetention(730, {
        dryRun: false,
        tables: ['leads', 'calls', 'messages', 'appointments'],
        preserveStatuses: ['active', 'booked', 'pending']
      });
      const totalDeleted = Object.values(result.itemsDeleted || {}).reduce((sum, count) => sum + (count || 0), 0);
      console.log('[CRON] ✅ Data cleanup completed:', {
        totalDeleted,
        breakdown: result.itemsDeleted,
        errors: result.errors?.length || 0
      });
      if (process.env.YOUR_EMAIL && totalDeleted > 0) {
        try {
          const messagingService = (await import('./messaging-service.js')).default;
          await messagingService.sendEmail({
            to: process.env.YOUR_EMAIL,
            subject: '📊 Weekly Data Cleanup Summary',
            body: `
Weekly Data Cleanup Report
==========================

Total Items Deleted: ${totalDeleted}
Date: ${new Date().toLocaleDateString()}
Retention Period: 730 days (2 years)

Breakdown:
${Object.entries(result.itemsDeleted || {}).map(([table, count]) => `- ${table}: ${count}`).join('\n')}

${result.errors && result.errors.length > 0 ? `\nErrors: ${result.errors.length}` : ''}
            `.trim()
          });
        } catch (emailError) {
          console.error('[CLEANUP] Failed to send summary email:', emailError);
        }
      }
      if (result.errors && result.errors.length > 0) {
        const { sendCriticalAlert } = await import('./error-monitoring.js');
        await sendCriticalAlert({
          message: `Data cleanup completed with ${result.errors.length} error(s)`,
          errorType: 'Data Cleanup',
          severity: 'warning',
          metadata: { result }
        });
      }
    } catch (error) {
      console.error('[CRON ERROR] Data cleanup failed:', error);
      const { sendCriticalAlert } = await import('./error-monitoring.js');
      await sendCriticalAlert({
        message: `Data cleanup failed: ${error.message}`,
        errorType: 'Data Cleanup Failure',
        severity: 'critical',
        metadata: { error: error.message, stack: error.stack }
      });
    }
  });
  console.log('✅ Automated data cleanup scheduled (runs every Sunday at 3 AM)');
}
