/**
 * Extracted HTTP router mounting (ordering-sensitive). Keep calls in server.js
 * in the same relative order as before the refactor.
 */

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
}
