export function mountAdminRoutes(app, deps) {
  const {
    io,
    broadcastUpdate,
    sendReminderSMS,
    query,
    authenticateApiKey,
    getFullClient,
    pickTimezone,
    DateTime,
    TIMEZONE,
    isPostgres,
    pgQueueLeadPhoneKeyExpr,
    isBusinessHours,
    createAdminOverviewRouter,
    createAdminRemindersRouter,
    createAdminClientsRouter,
    createAdminAnalyticsAdvancedRouter,
    createAdminOperationsRouter,
    createAdminSalesPipelineRouter,
    createAdminEmailTasksDealsRouter,
    createAdminCalendarRouter,
    createAdminDocumentsCommentsFieldsRouter,
    createAdminTemplatesRouter,
    createAdminCallRecordingsRouter,
    createAdminCallQueueRouter,
    createAdminOutboundWeekdayJourneyRouter,
    createAdminCallsInsightsRouter,
    createAdminLeadScoringRouter,
    createAdminAppointmentsRouter,
    createAdminFollowUpsRouter,
    createAdminReportsRouter,
    createAdminSocialRouter,
    createAdminMultiClientRouter,
    createAdminCallQueueOpsRouter,
    createAdminRoiCalculatorRouter,
  } = deps;

  app.use('/api/admin', createAdminOverviewRouter({ broadcast: broadcastUpdate }));
  app.use('/api/admin', createAdminRemindersRouter({ sendReminderSMS }));
  app.use('/api/admin', createAdminClientsRouter({ broadcast: broadcastUpdate }));
  app.use('/api/admin', createAdminAnalyticsAdvancedRouter());
  app.use('/api/admin', createAdminOperationsRouter({ io }));
  app.use('/api/admin', createAdminSalesPipelineRouter({ io }));
  app.use('/api/admin', createAdminEmailTasksDealsRouter());
  app.use('/api/admin', createAdminCalendarRouter());
  app.use('/api/admin', createAdminDocumentsCommentsFieldsRouter());
  app.use('/api/admin', createAdminTemplatesRouter());
  app.use('/api/admin', createAdminCallRecordingsRouter());
  app.use(
    '/api/admin',
    createAdminCallQueueRouter({
      query,
      getFullClient,
      pickTimezone,
      DateTime,
      TIMEZONE,
      isPostgres,
      pgQueueLeadPhoneKeyExpr,
      isBusinessHours,
    })
  );
  app.use(
    '/api/admin',
    createAdminOutboundWeekdayJourneyRouter({
      query,
      getFullClient,
      pickTimezone,
      DateTime,
      isPostgres,
    })
  );
  app.use('/api/admin', createAdminCallsInsightsRouter({ query }));
  app.use('/api/admin', createAdminLeadScoringRouter({ query }));
  app.use('/api/admin', createAdminAppointmentsRouter({ query }));
  app.use('/api/admin', createAdminFollowUpsRouter({ query }));
  app.use('/api/admin', createAdminReportsRouter({ query }));
  app.use('/api/admin', createAdminSocialRouter({ query }));
  app.use('/api/admin', createAdminMultiClientRouter({ authenticateApiKey }));
  app.use('/api/admin', createAdminCallQueueOpsRouter());
  app.use('/api/admin', createAdminRoiCalculatorRouter());
}

