import { Router } from 'express';

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

      res.json({ ok: true, tenantKey, metrics, lastUpdated: new Date().toISOString() });
    } catch (e) {
      console.error('[COST OPTIMIZATION ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

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
    },
  );

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
          secretKey: apiKey,
          message: 'API key created successfully',
        });
      } catch (e) {
        console.error('[API KEY CREATION ERROR]', e?.message || String(e));
        res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    },
  );

  return router;
}

