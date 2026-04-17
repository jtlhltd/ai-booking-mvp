import express from 'express';

export function createQuickWinMetricsRouter(deps) {
  const { query, cacheMiddleware } = deps || {};
  const router = express.Router();

  router.get('/sms-delivery-rate/:clientKey', async (req, res) => {
    try {
      const { clientKey } = req.params;
      const days = parseInt(req.query.days, 10) || 7;

      const stats = await query(
        `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'queued') as queued
      FROM messages
      WHERE client_key = $1
        AND channel = 'sms'
        AND direction = 'outbound'
        AND created_at >= NOW() - INTERVAL '${days} days'
    `,
        [clientKey]
      );

      const row = stats.rows[0];
      const total = parseInt(row.total || 0, 10);
      const delivered = parseInt(row.delivered || 0, 10);
      const failed = parseInt(row.failed || 0, 10);
      const deliveryRate = total > 0 ? ((delivered / total) * 100).toFixed(1) : 0;

      if (parseFloat(deliveryRate) < 95 && process.env.YOUR_EMAIL && total >= 10) {
        try {
          const messagingService = (await import('../lib/messaging-service.js')).default;
          await messagingService.sendEmail({
            to: process.env.YOUR_EMAIL,
            subject: `⚠️ SMS Delivery Rate Low: ${deliveryRate}%`,
            body: `SMS delivery rate is below 95% for ${clientKey}\n\nDelivery Rate: ${deliveryRate}%\nTotal: ${total}\nDelivered: ${delivered}\nFailed: ${failed}\n\nTime: ${new Date().toISOString()}`
          });
        } catch (emailError) {
          console.error('[SMS DELIVERY RATE] Failed to send alert:', emailError.message);
        }
      }

      res.json({
        ok: true,
        clientKey,
        period: `${days} days`,
        total,
        delivered,
        failed,
        sent: parseInt(row.sent || 0, 10),
        queued: parseInt(row.queued || 0, 10),
        deliveryRate: `${deliveryRate}%`,
        isHealthy: parseFloat(deliveryRate) >= 95
      });
    } catch (error) {
      console.error('[SMS DELIVERY RATE ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get(
    '/calendar-sync/:clientKey',
    cacheMiddleware({ ttl: 300000, keyPrefix: 'calendar-sync:' }),
    async (req, res) => {
      try {
        const { clientKey } = req.params;

        const tenantResult = await query(
          `
      SELECT calendar_json
      FROM tenants
      WHERE client_key = $1
    `,
          [clientKey]
        );

        const calendarConfig = tenantResult.rows?.[0]?.calendar_json || {};
        const isConnected = !!(calendarConfig.service_account_email || calendarConfig.access_token);

        const lastSync = await query(
          `
      SELECT MAX(created_at) AS last_sync
      FROM appointments
      WHERE client_key = $1
        AND gcal_event_id IS NOT NULL
    `,
          [clientKey]
        );

        const lastSyncTime = lastSync.rows[0]?.last_sync;
        const hoursSinceSync = lastSyncTime
          ? Math.floor((Date.now() - new Date(lastSyncTime).getTime()) / (1000 * 60 * 60))
          : null;

        const recentAppointments = await query(
          `
      SELECT COUNT(*) AS count
      FROM appointments
      WHERE client_key = $1
        AND created_at >= NOW() - INTERVAL '7 days'
    `,
          [clientKey]
        );

        const conflicts = await query(
          `
      SELECT COUNT(*) AS count
      FROM appointments
      WHERE client_key = $1
        AND status = 'conflict'
        AND created_at >= NOW() - INTERVAL '7 days'
    `,
          [clientKey]
        );

        if (isConnected && hoursSinceSync !== null && hoursSinceSync > 24 && process.env.YOUR_EMAIL) {
          try {
            const messagingService = (await import('../lib/messaging-service.js')).default;
            await messagingService.sendEmail({
              to: process.env.YOUR_EMAIL,
              subject: `⚠️ Calendar Sync Stale - ${hoursSinceSync}h Since Last Sync`,
              body: `Calendar sync hasn't happened in ${hoursSinceSync} hours for ${clientKey}\n\nLast sync: ${lastSyncTime}\nTime: ${new Date().toISOString()}`
            });
          } catch (emailError) {
            console.error('[CALENDAR SYNC] Failed to send alert:', emailError.message);
          }
        }

        res.json({
          ok: true,
          connected: isConnected,
          lastSyncTime: lastSyncTime || null,
          hoursSinceSync: hoursSinceSync || null,
          lastSync: lastSync.rows?.[0]?.last_sync || new Date().toISOString(),
          appointmentsBooked: parseInt(recentAppointments.rows?.[0]?.count || 0, 10),
          conflictsResolved: parseInt(conflicts.rows?.[0]?.count || 0, 10),
          status: isConnected ? 'synced' : 'disconnected',
          calendarType: calendarConfig.type || 'google'
        });
      } catch (error) {
        console.error('[CALENDAR SYNC ERROR]', error);
        res.status(500).json({ ok: false, error: error.message });
      }
    }
  );

  router.get('/quality-metrics/:clientKey', async (req, res) => {
    try {
      const { clientKey } = req.params;
      const days = parseInt(req.query.days, 10) || 30;

      const { getCallQualityMetrics } = await import('../db.js');
      const metrics = await getCallQualityMetrics(clientKey, days);

      if (!metrics || metrics.total_calls === 0) {
        return res.json({
          ok: true,
          period: `Last ${days} days`,
          metrics: {
            total_calls: 0,
            successful_calls: 0,
            bookings: 0,
            success_rate: '0.0%',
            booking_rate: '0.0%',
            avg_quality_score: '0.0',
            avg_duration: '0s',
            sentiment: {
              positive: 0,
              negative: 0,
              neutral: 0,
              positive_rate: '0.0%'
            }
          },
          message: 'No call data available yet'
        });
      }

      const successRate = metrics.total_calls > 0 ? metrics.successful_calls / metrics.total_calls : 0;
      const bookingRate = metrics.total_calls > 0 ? metrics.bookings / metrics.total_calls : 0;
      const positiveRate =
        metrics.total_calls > 0 ? metrics.positive_sentiment_count / metrics.total_calls : 0;

      res.json({
        ok: true,
        period: `Last ${days} days`,
        metrics: {
          total_calls: parseInt(metrics.total_calls, 10) || 0,
          successful_calls: parseInt(metrics.successful_calls, 10) || 0,
          bookings: parseInt(metrics.bookings, 10) || 0,
          success_rate: (successRate * 100).toFixed(1) + '%',
          booking_rate: (bookingRate * 100).toFixed(1) + '%',
          avg_quality_score: parseFloat(metrics.avg_quality_score || 0).toFixed(1),
          avg_duration: Math.round(metrics.avg_duration || 0) + 's',
          sentiment: {
            positive: parseInt(metrics.positive_sentiment_count, 10) || 0,
            negative: parseInt(metrics.negative_sentiment_count, 10) || 0,
            neutral: parseInt(metrics.neutral_sentiment_count, 10) || 0,
            positive_rate: (positiveRate * 100).toFixed(1) + '%'
          }
        }
      });
    } catch (error) {
      console.error('[QUALITY METRICS ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

