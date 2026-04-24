import { Router } from 'express';

export function createAdminAnalyticsRouter(deps) {
  const {
    getApiKey,
    getAnalyticsDashboard,
    generateAnalyticsReport,
    trackAnalyticsEvent,
    trackConversionStage,
    recordPerformanceMetric,
    createABTestExperiment,
    getActiveABTests,
    getABTestResults,
    recordABTestOutcome,
    selectABTestVariant,
    getCachedMetrics,
    cache,
    clearCache,
    calculateCacheHitRate,
    analyticsQueue,
    connectionPool,
    analyticsProcessing,
    CACHE_TTL,
    getFullClient,
  } = deps || {};

  const router = Router();

  function requireAdminKey(req, res) {
    const apiKey = req.get('X-API-Key');
    const expected = typeof getApiKey === 'function' ? getApiKey() : process.env.API_KEY;
    if (!apiKey || apiKey !== expected) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
    return true;
  }

  // Analytics endpoints
  // Get analytics dashboard
  router.get('/admin/analytics/:tenantKey', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;
      const { tenantKey } = req.params;
      const { days = 30 } = req.query;

      const fn = typeof getAnalyticsDashboard === 'function' ? getAnalyticsDashboard : null;
      if (!fn) return res.status(500).json({ ok: false, error: 'missing_getAnalyticsDashboard' });

      const dashboard = await fn(tenantKey, parseInt(days));

      if (!dashboard) {
        return res.status(404).json({ error: 'Analytics data not found' });
      }

      console.log('[ANALYTICS DASHBOARD REQUESTED]', {
        tenantKey,
        days,
        requestedBy: req.ip,
        totalLeads: dashboard.summary.totalLeads,
        conversionRate: dashboard.summary.conversionRate,
      });

      res.json({
        ok: true,
        tenantKey,
        dashboard,
        lastUpdated: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[ANALYTICS DASHBOARD ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // Generate analytics report
  router.post('/admin/analytics/:tenantKey/report', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;
      const { tenantKey } = req.params;
      const { reportType = 'comprehensive', days = 30 } = req.body;

      const fn = typeof generateAnalyticsReport === 'function' ? generateAnalyticsReport : null;
      if (!fn) return res.status(500).json({ ok: false, error: 'missing_generateAnalyticsReport' });

      const report = await fn(tenantKey, reportType, parseInt(days));

      if (!report) {
        return res.status(404).json({ error: 'Unable to generate report' });
      }

      console.log('[ANALYTICS REPORT GENERATED]', {
        tenantKey,
        reportType,
        days,
        requestedBy: req.ip,
      });

      res.json({
        ok: true,
        tenantKey,
        report,
        lastUpdated: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[ANALYTICS REPORT ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // Track analytics event
  router.post('/admin/analytics/:tenantKey/track', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;
      const { tenantKey } = req.params;
      const { eventType, eventCategory, eventData, sessionId } = req.body;

      if (!eventType || !eventCategory) {
        return res.status(400).json({ error: 'Event type and category required' });
      }

      const fn = typeof trackAnalyticsEvent === 'function' ? trackAnalyticsEvent : null;
      if (!fn) return res.status(500).json({ ok: false, error: 'missing_trackAnalyticsEvent' });

      const event = await fn({
        clientKey: tenantKey,
        eventType,
        eventCategory,
        eventData,
        sessionId,
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
      });

      console.log('[ANALYTICS EVENT TRACKED]', {
        tenantKey,
        eventType,
        eventCategory,
        sessionId,
        requestedBy: req.ip,
      });

      res.json({
        ok: true,
        event,
        message: 'Event tracked successfully',
      });
    } catch (e) {
      console.error('[ANALYTICS TRACK ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // Track conversion stage
  router.post('/admin/analytics/:tenantKey/conversion', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;
      const { tenantKey } = req.params;
      const { leadPhone, stage, stageData, previousStage, timeToStage } = req.body;

      if (!leadPhone || !stage) {
        return res.status(400).json({ error: 'Lead phone and stage required' });
      }

      const fn = typeof trackConversionStage === 'function' ? trackConversionStage : null;
      if (!fn) return res.status(500).json({ ok: false, error: 'missing_trackConversionStage' });

      const conversionStage = await fn({
        clientKey: tenantKey,
        leadPhone,
        stage,
        stageData,
        previousStage,
        timeToStage,
      });

      console.log('[CONVERSION STAGE TRACKED]', {
        tenantKey,
        leadPhone,
        stage,
        previousStage,
        requestedBy: req.ip,
      });

      res.json({ ok: true, conversionStage, message: 'Conversion stage tracked successfully' });
    } catch (e) {
      console.error('[CONVERSION RECORD ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // Record performance metric
  router.post('/admin/analytics/:tenantKey/metrics', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;
      const { tenantKey } = req.params;
      const { metricName, metricValue, metricUnit, metricCategory, metadata } = req.body;

      if (!metricName || metricValue === undefined) {
        return res.status(400).json({ error: 'Metric name and value required' });
      }

      const fn = typeof recordPerformanceMetric === 'function' ? recordPerformanceMetric : null;
      if (!fn) return res.status(500).json({ ok: false, error: 'missing_recordPerformanceMetric' });

      const metric = await fn({
        clientKey: tenantKey,
        metricName,
        metricValue: parseFloat(metricValue),
        metricUnit,
        metricCategory,
        metadata,
      });

      console.log('[PERFORMANCE METRIC RECORDED]', {
        tenantKey,
        metricName,
        metricValue,
        metricCategory,
        requestedBy: req.ip,
      });

      res.json({ ok: true, metric, message: 'Performance metric recorded successfully' });
    } catch (e) {
      console.error('[METRIC RECORD ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // A/B tests
  router.post('/admin/ab-tests/:tenantKey', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;
      const { tenantKey } = req.params;
      const { experimentName, variants, isActive = true } = req.body;

      if (!experimentName || !variants || variants.length < 2) {
        return res.status(400).json({ error: 'Experiment name and at least 2 variants required' });
      }

      const fn = typeof createABTestExperiment === 'function' ? createABTestExperiment : null;
      if (!fn) return res.status(500).json({ ok: false, error: 'missing_createABTestExperiment' });

      const experiment = await fn({
        clientKey: tenantKey,
        experimentName,
        variants,
        isActive,
      });

      res.json({ ok: true, experiment, message: 'A/B test created successfully' });
    } catch (e) {
      console.error('[AB TEST CREATION ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.get('/admin/ab-tests/:tenantKey', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;
      const { tenantKey } = req.params;

      const fn = typeof getActiveABTests === 'function' ? getActiveABTests : null;
      if (!fn) return res.status(500).json({ ok: false, error: 'missing_getActiveABTests' });

      const activeTests = await fn(tenantKey);

      console.log('[AB TESTS REQUESTED]', {
        tenantKey,
        activeTests: activeTests.length,
        requestedBy: req.ip,
      });

      res.json({
        ok: true,
        tenantKey,
        activeTests,
        lastUpdated: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[AB TESTS FETCH ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.get('/admin/ab-tests/:tenantKey/:experimentName/results', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;
      const { tenantKey, experimentName } = req.params;

      const fn = typeof getABTestResults === 'function' ? getABTestResults : null;
      if (!fn) return res.status(500).json({ ok: false, error: 'missing_getABTestResults' });

      const results = await fn(tenantKey, experimentName);

      if (!results) {
        return res.status(404).json({ error: 'Experiment not found' });
      }

      console.log('[AB TEST RESULTS REQUESTED]', {
        tenantKey,
        experimentName,
        totalParticipants: results.summary.totalParticipants,
        requestedBy: req.ip,
      });

      res.json({
        ok: true,
        tenantKey,
        experimentName,
        results,
        lastUpdated: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[AB TEST RESULTS ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.post('/admin/ab-tests/:tenantKey/:experimentName/outcome', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;
      const { tenantKey, experimentName } = req.params;
      const { leadPhone, outcome, outcomeData } = req.body;

      if (!leadPhone || !outcome) {
        return res.status(400).json({ error: 'Lead phone and outcome required' });
      }

      const fn = typeof recordABTestOutcome === 'function' ? recordABTestOutcome : null;
      if (!fn) return res.status(500).json({ ok: false, error: 'missing_recordABTestOutcome' });

      const result = await fn({
        clientKey: tenantKey,
        experimentName,
        leadPhone,
        outcome,
        outcomeData,
      });

      if (!result) {
        return res.status(404).json({ error: 'Experiment or lead assignment not found' });
      }

      console.log('[AB TEST OUTCOME RECORDED]', {
        tenantKey,
        experimentName,
        leadPhone,
        outcome,
        requestedBy: req.ip,
      });

      res.json({
        ok: true,
        result,
        message: 'A/B test outcome recorded successfully',
      });
    } catch (e) {
      console.error('[AB TEST OUTCOME ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.post('/admin/ab-tests/:tenantKey/assign', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;
      const { tenantKey } = req.params;
      const { leadPhone, experimentName } = req.body;

      if (!leadPhone || !experimentName) {
        return res.status(400).json({ error: 'Lead phone and experiment name required' });
      }

      console.log('[AB TEST ASSIGNMENT REQUESTED]', {
        tenantKey,
        leadPhone,
        experimentName,
        requestedBy: req.ip,
      });

      const fn = typeof selectABTestVariant === 'function' ? selectABTestVariant : null;
      if (!fn) return res.status(500).json({ ok: false, error: 'missing_selectABTestVariant' });

      const variant = await fn(tenantKey, experimentName, leadPhone);

      if (!variant) {
        return res.status(404).json({ error: 'No active experiment found' });
      }

      return res.json({
        ok: true,
        tenantKey,
        leadPhone,
        experimentName,
        variant: variant.name,
        config: variant.config,
        message: 'Lead assigned to A/B test variant successfully',
      });
    } catch (e) {
      console.error('[AB TEST ASSIGNMENT ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // Performance optimization endpoints
  router.get('/admin/performance/:tenantKey', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;
      const { tenantKey } = req.params;

      const fn = typeof getCachedMetrics === 'function' ? getCachedMetrics : null;
      if (!fn) return res.status(500).json({ ok: false, error: 'missing_getCachedMetrics' });

      const metrics = await fn(tenantKey);

      const cacheObj = cache || new Map();
      const hitRateFn = typeof calculateCacheHitRate === 'function' ? calculateCacheHitRate : () => 0;

      const cacheStats = {
        size: cacheObj.size,
        keys: Array.from(cacheObj.keys()).filter((key) => String(key).includes(tenantKey)),
        hitRate: hitRateFn(tenantKey),
      };

      console.log('[PERFORMANCE METRICS REQUESTED]', {
        tenantKey,
        cacheSize: cacheObj.size,
        requestedBy: req.ip,
      });

      res.json({
        ok: true,
        tenantKey,
        metrics,
        cache: cacheStats,
        performance: {
          analyticsQueue: Array.isArray(analyticsQueue) ? analyticsQueue.length : 0,
          connectionPool: connectionPool instanceof Map ? connectionPool.size : 0,
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime(),
        },
        lastUpdated: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[PERFORMANCE METRICS ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.post('/admin/performance/:tenantKey/cache/clear', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;
      const { tenantKey } = req.params;
      const { pattern } = req.body;

      const cacheObj = cache || new Map();
      const beforeSize = cacheObj.size;
      const clearFn = typeof clearCache === 'function' ? clearCache : null;
      if (!clearFn) return res.status(500).json({ ok: false, error: 'missing_clearCache' });

      clearFn(pattern || tenantKey);
      const afterSize = cacheObj.size;
      const cleared = beforeSize - afterSize;

      console.log('[CACHE CLEARED]', {
        tenantKey,
        pattern,
        cleared,
        remaining: afterSize,
        requestedBy: req.ip,
      });

      res.json({
        ok: true,
        tenantKey,
        cleared,
        remaining: afterSize,
        message: `Cache cleared: ${cleared} entries removed`,
      });
    } catch (e) {
      console.error('[CACHE CLEAR ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.get('/admin/performance/system/overview', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      const cacheObj = cache || new Map();

      const overview = {
        system: {
          uptime: process.uptime(),
          memory: {
            rss: Math.round(memoryUsage.rss / 1024 / 1024),
            heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            external: Math.round(memoryUsage.external / 1024 / 1024),
          },
          cpu: {
            user: cpuUsage.user,
            system: cpuUsage.system,
          },
        },
        application: {
          cache: {
            size: cacheObj.size,
            ttl: CACHE_TTL,
          },
          analytics: {
            queueSize: Array.isArray(analyticsQueue) ? analyticsQueue.length : 0,
            processing: !!analyticsProcessing,
          },
          connections: {
            poolSize: connectionPool instanceof Map ? connectionPool.size : 0,
          },
        },
        timestamp: new Date().toISOString(),
      };

      console.log('[SYSTEM PERFORMANCE OVERVIEW]', {
        memoryMB: overview.system.memory.rss,
        cacheSize: overview.application.cache.size,
        requestedBy: req.ip,
      });

      res.json({
        ok: true,
        overview,
        lastUpdated: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[SYSTEM PERFORMANCE ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // Get calendar events
  router.get('/admin/calendar-events/:tenantKey', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;

      const { tenantKey } = req.params;
      const { limit = 10, startTime, endTime } = req.query;

      const fn = typeof getFullClient === 'function' ? getFullClient : null;
      if (!fn) return res.status(500).json({ ok: false, error: 'missing_getFullClient' });

      const client = await fn(tenantKey);
      if (!client) {
        return res.status(404).json({ error: 'Client not found' });
      }

      console.log('[CALENDAR EVENTS REQUESTED]', {
        tenantKey,
        limit,
        startTime,
        endTime,
        requestedBy: req.ip,
      });

      const mockEvents = [
        {
          id: 'test_event_1',
          summary: 'Test Appointment',
          start: {
            dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            timeZone: client?.booking?.timezone || 'Europe/London',
          },
          end: {
            dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(),
            timeZone: client?.booking?.timezone || 'Europe/London',
          },
          description: 'Test appointment for calendar integration',
          attendees: [],
        },
      ];

      return res.json({
        ok: true,
        tenantKey,
        events: mockEvents,
        calendarId: client?.booking?.calendarId || 'primary',
        timezone: client?.booking?.timezone || 'Europe/London',
        lastUpdated: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[CALENDAR EVENTS ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  return router;
}

/**
 * Admin cost + access endpoints (moved from server.js).
 *
 * Routes included:
 * - GET  /admin/cost-optimization/:tenantKey
 * - POST /admin/budget-limits/:tenantKey
 * - POST /admin/cost-alerts/:tenantKey
 * - POST /admin/users/:tenantKey
 * - POST /admin/api-keys/:tenantKey
 */
export function createAdminCostAndAccessRouter(deps) {
  const {
    getCostOptimizationMetrics,
    loadDb,
    authenticateApiKey,
    rateLimitMiddleware,
    requirePermission,
    getApiKey,
  } = deps || {};

  const router = Router();

  function requireAdminKey(req, res) {
    const apiKey = req.get('X-API-Key');
    const expected = typeof getApiKey === 'function' ? getApiKey() : process.env.API_KEY;
    if (!apiKey || apiKey !== expected) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
    return true;
  }

  async function loadDbOrImport() {
    if (typeof loadDb === 'function') return loadDb();
    return import('../db.js');
  }

  // Admin endpoint to get cost optimization metrics
  router.get('/admin/cost-optimization/:tenantKey', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;

      const { tenantKey } = req.params;
      const metrics = await getCostOptimizationMetrics(tenantKey);

      if (!metrics) {
        return res.status(404).json({ error: 'Cost metrics not found' });
      }

      console.log('[COST OPTIMIZATION METRICS]', {
        tenantKey,
        requestedBy: req.ip,
        dailyCost: metrics.costs.daily.total_cost,
        budgetUtilization: metrics.optimization.dailyBudgetUtilization,
      });

      res.json({
        ok: true,
        tenantKey,
        metrics,
        lastUpdated: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[COST OPTIMIZATION ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // Admin endpoint to set budget limits
  router.post('/admin/budget-limits/:tenantKey', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;

      const { tenantKey } = req.params;
      const { budgetType, dailyLimit, weeklyLimit, monthlyLimit, currency = 'USD' } = req.body;

      if (!budgetType || (!dailyLimit && !weeklyLimit && !monthlyLimit)) {
        return res.status(400).json({ error: 'Budget type and at least one limit required' });
      }

      const db = await loadDbOrImport();
      const { setBudgetLimit } = db;
      const budget = await setBudgetLimit({
        clientKey: tenantKey,
        budgetType,
        dailyLimit: parseFloat(dailyLimit) || null,
        weeklyLimit: parseFloat(weeklyLimit) || null,
        monthlyLimit: parseFloat(monthlyLimit) || null,
        currency,
      });

      console.log('[BUDGET LIMIT SET]', {
        tenantKey,
        budgetType,
        dailyLimit,
        weeklyLimit,
        monthlyLimit,
        currency,
        requestedBy: req.ip,
      });

      res.json({ ok: true, budget, message: 'Budget limit set successfully' });
    } catch (e) {
      console.error('[BUDGET LIMIT ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // Admin endpoint to create cost alerts
  router.post('/admin/cost-alerts/:tenantKey', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;

      const { tenantKey } = req.params;
      const { alertType, threshold, period = 'daily' } = req.body;

      if (!alertType || !threshold) {
        return res.status(400).json({ error: 'Alert type and threshold required' });
      }

      const db = await loadDbOrImport();
      const { createCostAlert, getTotalCostsByTenant } = db;
      const currentCosts = await getTotalCostsByTenant(tenantKey, period);

      const alert = await createCostAlert({
        clientKey: tenantKey,
        alertType,
        threshold: parseFloat(threshold),
        currentAmount: parseFloat(currentCosts.total_cost || 0),
        period,
      });

      console.log('[COST ALERT CREATED]', {
        tenantKey,
        alertType,
        threshold,
        period,
        currentAmount: currentCosts.total_cost,
        requestedBy: req.ip,
      });

      res.json({ ok: true, alert, message: 'Cost alert created successfully' });
    } catch (e) {
      console.error('[COST ALERT ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // Security endpoints
  // Create user account
  router.post(
    '/admin/users/:tenantKey',
    authenticateApiKey,
    rateLimitMiddleware,
    requirePermission('user_management'),
    async (req, res) => {
      try {
        const { tenantKey } = req.params;
        const { username, email, password, role = 'user', permissions = [] } = req.body;

        if (!username || !email || !password) {
          return res.status(400).json({ error: 'Username, email, and password required' });
        }

        const db = await loadDbOrImport();
        const { createUserAccount, hashPassword } = db;
        const passwordHash = await hashPassword(password);

        const user = await createUserAccount({
          clientKey: tenantKey,
          username,
          email,
          passwordHash,
          role,
          permissions,
        });

        console.log('[USER CREATED]', { tenantKey, username, email, role, requestedBy: req.ip });

        res.json({
          ok: true,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            permissions: user.permissions,
            is_active: user.is_active,
            created_at: user.created_at,
          },
          message: 'User created successfully',
        });
      } catch (e) {
        console.error('[USER CREATION ERROR]', e?.message || String(e));
        res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    }
  );

  // Create API key
  router.post(
    '/admin/api-keys/:tenantKey',
    authenticateApiKey,
    rateLimitMiddleware,
    requirePermission('api_management'),
    async (req, res) => {
      try {
        const { tenantKey } = req.params;
        const { keyName, permissions = [], rateLimitPerMinute = 100, rateLimitPerHour = 1000, expiresAt = null } =
          req.body;

        if (!keyName) {
          return res.status(400).json({ error: 'Key name required' });
        }

        const db = await loadDbOrImport();
        const { createApiKey, generateApiKey, hashApiKey } = db;
        const apiKey = generateApiKey();
        const keyHash = hashApiKey(apiKey);

        const keyData = await createApiKey({
          clientKey: tenantKey,
          keyName,
          keyHash,
          permissions,
          rateLimitPerMinute,
          rateLimitPerHour,
          expiresAt,
        });

        console.log('[API KEY CREATED]', { tenantKey, keyName, permissions, requestedBy: req.ip });

        res.json({
          ok: true,
          apiKey: {
            id: keyData.id,
            keyName: keyData.key_name,
            permissions: keyData.permissions,
            rateLimitPerMinute: keyData.rate_limit_per_minute,
            rateLimitPerHour: keyData.rate_limit_per_hour,
            is_active: keyData.is_active,
            expires_at: keyData.expires_at,
            created_at: keyData.created_at,
          },
          secretKey: apiKey, // Only returned once
          message: 'API key created successfully',
        });
      } catch (e) {
        console.error('[API KEY CREATION ERROR]', e?.message || String(e));
        res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    }
  );

  return router;
}

