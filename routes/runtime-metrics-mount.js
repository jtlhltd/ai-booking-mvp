import { Router } from 'express';

export function createRuntimeMetricsRouter(deps) {
  const {
    query,
    listFullClients,
    getFullClient,
    cacheMiddleware,
    dashboardStatsCache,
    DASHBOARD_CACHE_TTL,
    AIInsightsEngine,
    getClientFromHeader,
    pickTimezone,
    DateTime,
    getCallContextCacheStats,
    getMostRecentCallContext,
    GOOGLE_CLIENT_EMAIL,
    GOOGLE_PRIVATE_KEY,
    GOOGLE_CALENDAR_ID,
  } = deps || {};

  const router = Router();

  // Detailed health dashboard endpoint (Quick Win #1)
  router.get('/api/health/detailed', async (_req, res) => {
    try {
      const health = {
        timestamp: new Date().toISOString(),
        services: {},
      };

      try {
        await query('SELECT 1');
        health.services.database = { status: 'healthy', lastCheck: new Date().toISOString() };
      } catch (error) {
        health.services.database = { status: 'unhealthy', error: error.message };
      }

      health.services.twilio = {
        status:
          process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN ? 'configured' : 'not_configured',
        hasMessagingService: !!process.env.TWILIO_MESSAGING_SERVICE_SID,
        hasFromNumber: !!process.env.TWILIO_FROM_NUMBER,
      };

      health.services.vapi = {
        status:
          process.env.VAPI_ASSISTANT_ID && process.env.VAPI_PHONE_NUMBER_ID ? 'configured' : 'not_configured',
        hasPrivateKey: !!process.env.VAPI_PRIVATE_KEY,
      };

      health.services.googleCalendar = {
        status: GOOGLE_CLIENT_EMAIL && GOOGLE_PRIVATE_KEY ? 'configured' : 'not_configured',
        calendarId: GOOGLE_CALENDAR_ID || 'primary',
      };

      health.services.email = {
        status:
          process.env.EMAIL_SERVICE && process.env.EMAIL_USER && process.env.EMAIL_PASS ? 'configured' : 'not_configured',
        hasAdminEmail: !!process.env.YOUR_EMAIL,
      };

      try {
        const { verifyBackupSystem } = await import('../lib/backup-monitoring.js');
        const backupStatus = await verifyBackupSystem();
        health.services.backup = {
          status:
            backupStatus.status === 'healthy'
              ? 'healthy'
              : backupStatus.status === 'warning'
                ? 'warning'
                : backupStatus.status === 'info'
                  ? 'info'
                  : 'error',
          message: backupStatus.message,
          hoursSinceActivity: backupStatus.backupAge ? parseFloat(backupStatus.backupAge.toFixed(1)) : null,
          databaseAccessible: backupStatus.databaseAccessible,
          recentActivity: backupStatus.recentActivity,
          hasAnyData: backupStatus.hasAnyData,
        };
      } catch (error) {
        health.services.backup = {
          status: 'error',
          message: 'Failed to check backup status',
          error: error.message,
        };
      }

      const allHealthy = Object.values(health.services).every(
        (s) => s.status === 'healthy' || s.status === 'configured' || s.status === 'info',
      );
      health.overall = allHealthy ? 'healthy' : 'degraded';

      res.json(health);
    } catch (error) {
      res.status(500).json({ error: error.message, timestamp: new Date().toISOString() });
    }
  });

  // DEBUG: Cache inspector endpoint
  router.get('/api/debug/cache', (_req, res) => {
    const stats = getCallContextCacheStats();
    const recentForLogistics = getMostRecentCallContext('logistics_client');

    res.json({
      stats,
      recentForLogisticsClient: recentForLogistics,
      timestamp: new Date().toISOString(),
    });
  });

  // Tenant-aware current time helper for Vapi (returns now in tenant timezone & UTC)
  router.get('/api/time/now', async (req, res) => {
    try {
      const client = await getClientFromHeader(req);
      if (!client) return res.status(400).json({ ok: false, error: 'Unknown tenant' });

      const tz = pickTimezone(client);
      const nowTenant = DateTime.now().setZone(tz);
      const nowUtc = nowTenant.toUTC();

      return res.json({
        ok: true,
        tenant: client?.clientKey || null,
        timezone: tz,
        now: {
          iso: nowTenant.toISO(),
          isoUtc: nowUtc.toISO(),
          epochMs: nowTenant.toMillis(),
          epochSeconds: Math.floor(nowTenant.toSeconds()),
          formatted: {
            long: nowTenant.toFormat('cccc, dd LLLL yyyy HH:mm'),
            date: nowTenant.toFormat('yyyy-LL-dd'),
            time: nowTenant.toFormat('HH:mm'),
            spoken: nowTenant.toFormat("cccc 'at' h:mma"),
          },
          components: {
            year: nowTenant.year,
            month: nowTenant.month,
            day: nowTenant.day,
            weekday: nowTenant.weekday,
            hour: nowTenant.hour,
            minute: nowTenant.minute,
            second: nowTenant.second,
          },
        },
      });
    } catch (e) {
      console.error('[time.now] error', e?.message || e);
      return res.status(500).json({ ok: false, error: 'time_now_failed' });
    }
  });

  // Deploy / version fingerprint (for verifying production matches git)
  router.get('/api/build', (_req, res) => {
    res.json({
      ok: true,
      commit: process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA || process.env.COMMIT_REF || null,
      serviceId: process.env.RENDER_SERVICE_ID || null,
    });
  });

  // Health check endpoint
  router.get('/health', async (_req, res) => {
    try {
      const { getLastHealthCheck } = await import('../lib/database-health.js');
      const messagingService = (await import('../lib/messaging-service.js')).default;

      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        uptimeFormatted: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
        memory: {
          rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
        },
        version: process.env.npm_package_version || '1.0.0',
      };

      const dbHealth = getLastHealthCheck();
      health.database = {
        status: dbHealth.status || 'unknown',
        lastCheck: dbHealth.timestamp,
        responseTime: dbHealth.responseTime ? `${dbHealth.responseTime}ms` : 'N/A',
        consecutiveFailures: dbHealth.consecutiveFailures || 0,
      };

      const messagingConfig = messagingService.isConfigured();
      health.messaging = {
        sms: messagingConfig.sms ? 'configured' : 'not_configured',
        email: messagingConfig.email ? 'configured' : 'not_configured',
      };

      health.services = {
        vapi: process.env.VAPI_PRIVATE_KEY && process.env.VAPI_ASSISTANT_ID ? 'configured' : 'not_configured',
        googleCalendar: GOOGLE_CLIENT_EMAIL && GOOGLE_CALENDAR_ID ? 'configured' : 'not_configured',
        twilio: process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN ? 'configured' : 'not_configured',
      };

      if (dbHealth.status === 'critical') {
        health.status = 'critical';
      } else if (dbHealth.status === 'degraded' || !messagingConfig.sms) {
        health.status = 'degraded';
      }

      res.json(health);
    } catch (e) {
      res
        .status(500)
        .json({ status: 'unhealthy', error: e.message, timestamp: new Date().toISOString() });
    }
  });

  // Monitoring endpoint for tenant resolution
  router.get('/monitor/tenant-resolution', async (req, res) => {
    try {
      const apiKey = req.get('X-API-Key');
      if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const clients = await listFullClients();
      const tenantStats = {
        totalTenants: clients.length,
        tenantsWithSms: clients.filter((c) => c?.sms?.fromNumber).length,
        tenantsWithMessagingService: clients.filter((c) => c?.sms?.messagingServiceSid).length,
        duplicateFromNumbers: {},
        duplicateMessagingServices: {},
        lastChecked: new Date().toISOString(),
      };

      const fromNumbers = {};
      const messagingServices = {};

      clients.forEach((client) => {
        if (client?.sms?.fromNumber) {
          fromNumbers[client.sms.fromNumber] = (fromNumbers[client.sms.fromNumber] || 0) + 1;
        }
        if (client?.sms?.messagingServiceSid) {
          messagingServices[client.sms.messagingServiceSid] =
            (messagingServices[client.sms.messagingServiceSid] || 0) + 1;
        }
      });

      tenantStats.duplicateFromNumbers = Object.entries(fromNumbers).filter(([_, count]) => count > 1);
      tenantStats.duplicateMessagingServices = Object.entries(messagingServices).filter(
        ([_, count]) => count > 1,
      );

      res.json(tenantStats);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // SMS delivery monitoring endpoint
  router.get('/monitor/sms-delivery', async (req, res) => {
    try {
      const apiKey = req.get('X-API-Key');
      if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const smsStats = {
        totalSent: 0,
        totalDelivered: 0,
        totalFailed: 0,
        deliveryRate: 0,
        last24Hours: {
          sent: 0,
          delivered: 0,
          failed: 0,
        },
        byTenant: {},
        lastUpdated: new Date().toISOString(),
      };

      res.json(smsStats);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Stats (with caching)
  router.get('/api/stats', cacheMiddleware({ ttl: 60000 }), async (req, res) => {
    try {
      const clientKey = req.query.clientKey;
      const range = req.query.range || '30d';

      const now = new Date();
      const daysMap = { today: 1, '7d': 7, '30d': 30, '90d': 90 };
      const days = daysMap[range] || 30;
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

      let stats = {};

      if (clientKey) {
        try {
          const cacheKey = `stats:${clientKey}:${range}`;
          const cached = dashboardStatsCache.get(cacheKey);
          if (cached && cached.expires && Date.now() < cached.expires) {
            return res.json({ ok: true, ...cached.data });
          }

          const { query: dbQuery } = await import('../db.js');
          const { optimizedQuery } = await import('../lib/query-optimizer.js');

          const statsResult = await optimizedQuery(
            `
          WITH 
          lead_stats AS (
          SELECT COUNT(*) as total
          FROM leads
            WHERE client_key = $1 AND created_at >= $2
          ),
          call_stats AS (
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN status = 'no_answer' THEN 1 ELSE 0 END) as no_answer
          FROM call_queue
            WHERE client_key = $1 AND created_at >= $2
          ),
          booking_stats AS (
          SELECT COUNT(*) as total
          FROM leads
            WHERE client_key = $1 AND status = 'booked' AND updated_at >= $2
          ),
          appointment_stats AS (
            SELECT COUNT(*) as total
            FROM appointments
            WHERE client_key = $1 AND created_at >= $2
          )
          SELECT 
            (SELECT total FROM lead_stats) as leads,
            (SELECT total FROM call_stats) as calls,
            (SELECT completed FROM call_stats) as completed,
            (SELECT failed FROM call_stats) as failed,
            (SELECT no_answer FROM call_stats) as no_answer,
            (SELECT total FROM booking_stats) as bookings,
            (SELECT total FROM appointment_stats) as appointments
        `,
            [clientKey, startDate],
            { timeout: 5000 },
          );

          const row = statsResult.rows[0];
          const leads = parseInt(row?.leads || 0);
          const calls = parseInt(row?.calls || 0);
          const completed = parseInt(row?.completed || 0);
          const failed = parseInt(row?.failed || 0);
          const noAnswer = parseInt(row?.no_answer || 0);
          const bookings = parseInt(row?.bookings || 0);

          const conversionRate = calls > 0 ? ((bookings / calls) * 100).toFixed(1) : 0;

          const trendResult = await dbQuery(
            `
          SELECT 
            DATE(created_at) as date,
            COUNT(*) as calls
          FROM call_queue
          WHERE client_key = $1
            AND created_at >= $2
          GROUP BY DATE(created_at)
          ORDER BY date DESC
          LIMIT 7
        `,
            [clientKey, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)],
          );

          const trendLabels = trendResult.rows
            .map((r) => new Date(r.date).toLocaleDateString('en-US', { weekday: 'short' }))
            .reverse();
          const trendCalls = trendResult.rows.map((r) => parseInt(r.calls)).reverse();

          stats = {
            leads,
            calls,
            bookings,
            conversionRate: parseFloat(conversionRate),
            funnel: [leads, calls, completed, bookings],
            outcomes: [bookings, Math.floor(completed * 0.3), Math.floor(completed * 0.2), noAnswer, failed],
            trendLabels,
            trendCalls,
            trendBookings: trendCalls.map((c) => Math.floor(c * 0.21)),
            peakHours: [12, 18, 25, 22, 15, 20, 28, 24, 19],
          };

          dashboardStatsCache.set(cacheKey, {
            data: stats,
            expires: Date.now() + DASHBOARD_CACHE_TTL,
          });
        } catch (dbError) {
          console.error('[STATS API] Database error:', dbError);
          stats = {
            leads: 0,
            calls: 0,
            bookings: 0,
            conversionRate: 0,
            funnel: [0, 0, 0, 0],
            outcomes: [0, 0, 0, 0, 0],
            trendLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            trendCalls: [0, 0, 0, 0, 0, 0, 0],
            trendBookings: [0, 0, 0, 0, 0, 0, 0],
            peakHours: [0, 0, 0, 0, 0, 0, 0, 0, 0],
          };
        }
      } else {
        // Tenant / system overview
        const within = (iso, days) => {
          if (!iso) return false;
          const t = new Date(iso).getTime();
          return Date.now() - t <= days * 24 * 60 * 60 * 1000;
        };

        const agg = {};
        try {
          const bookings = await (await import('../db.js')).query(
            `SELECT client_key, created_at FROM appointments WHERE created_at >= NOW() - INTERVAL '30 days'`,
          );
          for (const b of bookings.rows || []) {
            const t = b.client_key;
            agg[t] ||= { bookings7: 0, bookings30: 0, smsSent7: 0, smsSent30: 0 };
            if (within(b.created_at, 7)) agg[t].bookings7++;
            if (within(b.created_at, 30)) agg[t].bookings30++;
          }
        } catch {
          // ignore
        }

        try {
          const rows = await (await import('../db.js')).query(
            `SELECT client_key, created_at FROM messages WHERE created_at >= NOW() - INTERVAL '30 days'`,
          );
          for (const r of rows.rows || []) {
            const t = r.client_key;
            agg[t] ||= { bookings7: 0, bookings30: 0, smsSent7: 0, smsSent30: 0 };
            if (within(r.created_at, 7)) agg[t].smsSent7++;
            if (within(r.created_at, 30)) agg[t].smsSent30++;
          }
        } catch {
          // ignore
        }

        const rows = await listFullClients();
        for (const r of rows) agg[r.clientKey] ||= { bookings7: 0, bookings30: 0, smsSent7: 0, smsSent30: 0 };

        return res.json({ ok: true, tenants: agg });
      }

      res.json({ ok: true, ...stats });
    } catch (error) {
      console.error('[STATS API ERROR]', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to fetch stats',
        details: error.message,
      });
    }
  });

  // AI Insights endpoints
  router.get('/api/insights/:clientKey', cacheMiddleware({ ttl: 300000 }), async (req, res) => {
    try {
      const { clientKey } = req.params;
      const days = parseInt(req.query.days) || 30;

      const client = await getFullClient(clientKey);
      if (!client) {
        return res.status(404).json({ ok: false, error: 'Client not found' });
      }

      const insightsEngine = new AIInsightsEngine();
      const insights = await insightsEngine.generateInsightsFromDB(clientKey, days);
      const clientData = await insightsEngine.fetchClientData(clientKey, days);

      res.json({
        ok: true,
        clientKey,
        period: `Last ${days} days`,
        generatedAt: new Date().toISOString(),
        insights,
        summary: {
          totalCalls: clientData.calls,
          totalBookings: clientData.bookings,
          conversionRate:
            clientData.calls > 0
              ? ((clientData.bookings / clientData.calls) * 100).toFixed(1) + '%'
              : '0%',
          avgCallDuration: Math.round(clientData.avgCallDuration) + 's',
          totalCost: '£' + clientData.totalCost.toFixed(2),
        },
      });
    } catch (error) {
      console.error('[AI INSIGHTS ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Real-Time Events Stream (SSE)
  router.get('/api/realtime/:clientKey/events', async (req, res) => {
    const { clientKey } = req.params;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

    const { registerConnection } = await import('../lib/realtime-events.js');
    registerConnection(clientKey, res);

    console.log(`[SSE] Client ${clientKey} connected to real-time stream`);

    const heartbeat = setInterval(() => {
      try {
        res.write(`:heartbeat\n\n`);
      } catch (_error) {
        clearInterval(heartbeat);
      }
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeat);
      console.log(`[SSE] Client ${clientKey} disconnected from real-time stream`);
    });
  });

  // Real-Time Connection Statistics
  router.get('/api/realtime/stats', async (req, res) => {
    try {
      const apiKey = req.get('X-API-Key');
      if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { getConnectionStats } = await import('../lib/realtime-events.js');
      const stats = getConnectionStats();

      res.json(stats);
    } catch (error) {
      console.error('[REALTIME STATS ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

