/**
 * Backend status routes: backup, database, migrations, cost, webhook-retry.
 * Extracted from server.js to keep status/ops endpoints in one place.
 */
import express from 'express';
import { authenticateApiKey } from '../middleware/security.js';

const router = express.Router();

function requireApiKey(req, res, next) {
  const apiKey = req.get('X-API-Key');
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.get('/api/backup-status', async (req, res) => {
  try {
    const { verifyBackupSystem } = await import('../lib/backup-monitoring.js');
    const status = await verifyBackupSystem();
    res.json({
      ok: true,
      status: status.status,
      message: status.message,
      details: {
        databaseAccessible: status.databaseAccessible,
        recentActivity: status.recentActivity,
        hoursSinceActivity: status.backupAge ? parseFloat(status.backupAge.toFixed(1)) : null,
        daysSinceActivity: status.backupAge ? parseFloat((status.backupAge / 24).toFixed(1)) : null,
        hasAnyData: status.hasAnyData,
        hasActiveClients: status.hasActiveClients,
        totalClients: status.totalClients || 0,
        hasPendingWork: status.hasPendingWork
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[BACKUP STATUS ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/api/database/connection-limit', async (req, res) => {
  try {
    const { getConnectionLimit } = await import('../lib/database-health.js');
    const limitInfo = await getConnectionLimit();
    res.json(limitInfo);
  } catch (error) {
    console.error('[CONNECTION LIMIT ENDPOINT ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/cost-summary/:clientKey', async (req, res) => {
  try {
    const { clientKey } = req.params;
    const period = req.query.period || 'daily';
    const { getCostSummary } = await import('../lib/cost-monitoring.js');
    const summary = await getCostSummary({ clientKey, period });
    if (!summary.success) {
      return res.status(500).json({ ok: false, error: summary.error });
    }
    res.json({
      ok: true,
      clientKey,
      period: summary.period,
      total: summary.total,
      breakdown: summary.breakdown,
      summary: summary.summary,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[COST SUMMARY ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/api/webhook-retry-stats', async (req, res) => {
  try {
    const { clientKey } = req.query;
    const { getWebhookRetryStats } = await import('../lib/webhook-retry.js');
    const stats = await getWebhookRetryStats(clientKey);
    if (!stats.success) {
      return res.status(500).json({ ok: false, error: stats.error });
    }
    res.json({
      ok: true,
      stats: stats.stats,
      summary: stats.summary,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[WEBHOOK RETRY STATS ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/api/migrations/status', requireApiKey, async (req, res) => {
  try {
    const { getMigrationStatus } = await import('../lib/migration-runner.js');
    const status = await getMigrationStatus();
    res.json(status);
  } catch (error) {
    console.error('[MIGRATION STATUS ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/api/migrations/run', requireApiKey, async (req, res) => {
  try {
    const { runMigrations } = await import('../lib/migration-runner.js');
    const result = await runMigrations();
    res.json(result);
  } catch (error) {
    console.error('[RUN MIGRATIONS ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/api/admin/backup/check', authenticateApiKey, async (req, res) => {
  try {
    const { verifyBackupSystem, monitorBackups } = await import('../lib/backup-monitoring.js');
    const verification = await verifyBackupSystem();
    const triggerAlert = req.query.alert === 'true';
    if (triggerAlert) {
      await monitorBackups();
    }
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      backup: {
        status: verification.status,
        message: verification.message,
        databaseAccessible: verification.databaseAccessible,
        recentActivity: verification.recentActivity,
        hoursSinceActivity: verification.backupAge ? parseFloat(verification.backupAge.toFixed(1)) : null,
        daysSinceActivity: verification.backupAge ? parseFloat((verification.backupAge / 24).toFixed(1)) : null,
        hasAnyData: verification.hasAnyData,
        hasActiveClients: verification.hasActiveClients,
        totalClients: verification.totalClients || 0,
        hasPendingWork: verification.hasPendingWork
      },
      actionRequired: verification.status === 'warning' || verification.status === 'error',
      recommendations: verification.status === 'warning' || verification.status === 'error' ? [
        '1. Check Render Dashboard → Postgres → Backups tab',
        '2. Verify automatic backups are enabled',
        '3. Check if any backups exist in the last 48 hours',
        '4. If no backups exist, create a manual backup immediately',
        verification.hasPendingWork ? '5. ⚠️ System has pending work - verify follow-up processor is running' : '5. If system is just idle (no recent activity), this may be informational only'
      ] : []
    });
  } catch (error) {
    console.error('[BACKUP CHECK ERROR]', error);
    res.status(500).json({ ok: false, error: error.message, timestamp: new Date().toISOString() });
  }
});

export default router;
