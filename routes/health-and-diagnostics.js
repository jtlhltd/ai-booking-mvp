import express from 'express';

export function createHealthAndDiagnosticsRouter(deps) {
  const { query } = deps || {};
  const router = express.Router();

  router.get('/health/comprehensive', async (req, res) => {
    try {
      const { getComprehensiveHealth } = await import('../lib/health-monitor.js');
      const health = await getComprehensiveHealth(req.query.clientKey || null);
      res.json(health);
    } catch (error) {
      console.error('[HEALTH CHECK ERROR]', error);
      res.status(500).json({
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  router.get('/call-status', async (_req, res) => {
    const missing = [];
    if (!process.env.VAPI_PRIVATE_KEY) missing.push('VAPI_PRIVATE_KEY');
    if (!process.env.VAPI_ASSISTANT_ID) missing.push('VAPI_ASSISTANT_ID');
    if (!process.env.VAPI_PHONE_NUMBER_ID) missing.push('VAPI_PHONE_NUMBER_ID');
    let circuitBreakerOpen = false;
    try {
      const { isCircuitBreakerOpen } = await import('../lib/circuit-breaker.js');
      circuitBreakerOpen = isCircuitBreakerOpen('vapi_call');
    } catch (_) {
      /* ignore */
    }
    res.json({
      vapiConfigured: missing.length === 0,
      missingVars: missing,
      circuitBreakerOpen,
      hint: missing.length
        ? `Set ${missing.join(', ')} so outbound calls can reach Vapi.`
        : circuitBreakerOpen
          ? 'Circuit breaker is open; check logs for Vapi errors.'
          : 'Vapi env and circuit OK.'
    });
  });

  router.get('/healthz', (_req, res) => {
    const flags = {
      apiKey: !!process.env.API_KEY,
      sms: !!(
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER)
      ),
      gcal: !!(
        process.env.GOOGLE_CLIENT_EMAIL &&
        (process.env.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY_B64)
      ),
      vapi: !!(
        process.env.VAPI_PRIVATE_KEY &&
        (process.env.VAPI_ASSISTANT_ID || true) &&
        (process.env.VAPI_PHONE_NUMBER_ID || true)
      ),
      tz: process.env.TZ || 'unset'
    };
    res.json({ ok: true, integrations: flags });
  });

  router.get('/health/lb', async (_req, res) => {
    try {
      const dbHealthy = await Promise.race([
        query('SELECT 1').then(() => true),
        new Promise((_, reject) => setTimeout(() => reject(new Error('DB timeout')), 2000))
      ]).catch(() => false);

      const isShuttingDown = global.isShuttingDown || false;
      const healthy = dbHealthy && !isShuttingDown;

      if (healthy) {
        res.status(200).json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime()
        });
      } else {
        res.status(503).json({
          status: 'unhealthy',
          reason: !dbHealthy ? 'database_unavailable' : 'shutting_down',
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  return router;
}

