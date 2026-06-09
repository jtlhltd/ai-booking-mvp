/**
 * HTTP router mounting helpers (ordering-sensitive). Server remains the composition root:
 * call sites are split around middleware/helper initialization — see `registerMainHttpRoutes`.
 */

import compression from 'compression';
import { createSentryCursorRelayRouter } from '../routes/sentry-cursor-relay-mount.js';

/** Mirrors historical server.js tenant header normalization (must stay early). */
export function normalizeTenantClientKeyHeaders(req, _res, next) {
  const hdrs = req.headers || {};
  const fromHeader =
    req.get?.('X-Client-Key') ||
    req.get?.('x-client-key') ||
    hdrs['x-client-key'] ||
    hdrs['X-Client-Key'];
  const fromQuery = req.query?.clientKey;
  const tenantKey = fromHeader || fromQuery;
  if (tenantKey && !hdrs['x-client-key']) {
    req.headers['x-client-key'] = String(tenantKey);
  }
  next();
}

export function registerBackendStatusOpsAndTenantHeaders(app, p) {
  app.use(p.backendStatusRouter);
  app.use(p.opsRouter);
  app.use(normalizeTenantClientKeyHeaders);
}

export function registerResponseCompression(app) {
  app.use(
    compression({
      level: 6,
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      }
    })
  );
}

export function registerHealthMonitoringAndIntakeRouters(app, p) {
  app.use(p.healthRouter);
  app.use(p.monitoringRouter);
  app.use(p.leadsPortalRouter);
  app.use(p.leadsRouter);
  app.use(p.twilioWebhooks);
  app.use(p.twilioVoiceWebhooks);
  app.use(p.appointmentsRouter);
  app.use(p.receptionistRouter);
  app.use('/api/stats', p.cacheMiddleware({ ttl: 60000 }));
  app.use('/api/analytics', p.cacheMiddleware({ ttl: 300000 }));
  app.use(p.vapiWebhooks);
}

export function registerProbesNotifyMetaRouters(app, p) {
  app.use(p.createHealthProbesRouter({ healthzDeps: p.healthzDeps, gcalPingDeps: p.gcalPingDeps }));
  app.use(
    p.createNotifyAndTwilioSmsRouter({
      notifySendDeps: p.notifySendDeps,
      smsStatusWebhookDeps: p.smsStatusWebhookDeps,
      twilioSmsInboundDeps: p.twilioSmsInboundDeps,
      handleNotifyTest: p.handleNotifyTest,
      handleNotifySend: p.handleNotifySend,
      handleSmsStatusWebhook: p.handleSmsStatusWebhook,
      handleTwilioSmsInbound: p.handleTwilioSmsInbound,
      twilioWebhookVerification: p.twilioWebhookVerification,
      smsRateLimit: p.smsRateLimit,
      safeAsync: p.safeAsync
    })
  );
  app.use(
    p.createMetaIngestWebhooksRouter({
      webhooksNewLeadDeps: p.webhooksNewLeadDeps,
      webhooksFacebookLeadDeps: p.webhooksFacebookLeadDeps
    })
  );
  app.use(createSentryCursorRelayRouter());
}

export function registerLeadsFollowupsMount(app, p) {
  app.use('/api/leads', p.createLeadsFollowupsRouter(p.leadsFollowupsDeps));
}

export function registerDemoSetupAndErrorHandler(app, p) {
  app.use(p.demoSetupRouter);
  if (p.setupSentryExpressErrorHandler) {
    p.setupSentryExpressErrorHandler(app);
  }
  app.use(p.errorHandler);
}

/**
 * Namespace for all HTTP registration helpers (single import surface).
 * Mount order is preserved by calling these from server.js at the same positions as before.
 */
export const registerMainHttpRoutes = {
  backendStatusOpsAndTenant: registerBackendStatusOpsAndTenantHeaders,
  compression: registerResponseCompression,
  healthMonitoringAndIntake: registerHealthMonitoringAndIntakeRouters,
  probesNotifyMeta: registerProbesNotifyMetaRouters,
  leadsFollowups: registerLeadsFollowupsMount,
  demoSetupAndErrorHandler: registerDemoSetupAndErrorHandler,
};
