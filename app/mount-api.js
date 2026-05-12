import googlePlacesSearchRouter from '../routes/google-places-search.js';
import { createOutreachRouter } from '../routes/outreach.js';
import { createCrmRouter } from '../routes/crm.js';
import { createBrandingRouter } from '../routes/branding.js';
import { createAnalyticsRouter } from '../routes/analytics.js';
import { createSmsEmailPipelineRouter } from '../routes/sms-email-pipeline.js';
import { createBookingTestRouter } from '../routes/booking-test.js';
import { createVapiDevRouter } from '../routes/vapi-dev.js';
import { createPipelineTrackingRouter } from '../routes/pipeline-tracking.js';
import { createPipelineRetryRouter } from '../routes/pipeline-retry.js';
import { createZapierWebhookRouter } from '../routes/zapier-webhook.js';
import { createImportLeadsCsvRouter } from '../routes/import-leads-csv.js';
import { createGooglePlacesTestRouter } from '../routes/google-places-test.js';
import { createBookDemoRouter } from '../routes/book-demo.js';
import { createAvailableSlotsRouter } from '../routes/available-slots.js';
import { createCreateClientRouter } from '../routes/create-client.js';
import { createQualityAlertsRouter } from '../routes/quality-alerts.js';
import { createDevTestRouter } from '../routes/dev-test-mount.js';
import { createCallInsightsRouter } from '../routes/call-insights-mount.js';
import { createCompanyEnrichmentRouter } from '../routes/company-enrichment-mount.js';
import { createRuntimeMetricsRouter } from '../routes/runtime-metrics-mount.js';
import { createImportLeadsRouter } from '../routes/import-leads.js';
import { createImportLeadEmailRouter } from '../routes/import-lead-email.js';
import { createRoiRouter } from '../routes/roi.js';
import { createIndustryComparisonRouter } from '../routes/industry-comparison.js';
import { createLeadsExistingMatchKeysRouter } from '../routes/leads-existing-match-keys.js';
import { createAbTestResultsRouter } from '../routes/ab-test-results.js';
import { createDemoTestCallRouter } from '../routes/demo-test-call.js';
import { createCallTranscriptRouter } from '../routes/call-transcript.js';
import { createDemoDashboardDebugRouter } from '../routes/demo-dashboard-debug.js';
import { createDemoDashboardRouter, handleDemoDashboard } from '../routes/demo-dashboard.js';
import { createLeadTimelineRouter } from '../routes/lead-timeline.js';
import { createCallTimeBanditRouter } from '../routes/call-time-bandit.js';
import { createRetryQueueRouter } from '../routes/retry-queue.js';
import { createFollowUpQueueRouter } from '../routes/follow-up-queue.js';
import { createNextActionsRouter } from '../routes/next-actions.js';
import { createCallRecordingsRouter } from '../routes/call-recordings.js';
import { createVoicemailsRouter } from '../routes/voicemails.js';
import { createCallRecordingsStreamRouter } from '../routes/call-recordings-stream.js';
import { createRecordingsQualityCheckRouter } from '../routes/recordings-quality-check.js';
import { createReportsRouter } from '../routes/reports.js';
import { createSmsTemplatesRouter } from '../routes/sms-templates.js';
import { createMonitoringDashboardRouter } from '../routes/monitoring-dashboard.js';
import { createApiDocsRouter } from '../routes/api-docs.js';
import { createQuickWinMetricsRouter } from '../routes/quick-win-metrics.js';
import { createHealthAndDiagnosticsRouter } from '../routes/health-and-diagnostics.js';
import { createOpsHealthAndDncRouter } from '../routes/ops-health-and-dnc.js';
import { createDailySummaryRouter } from '../routes/daily-summary.js';
import { createLeadHandoffRouter } from '../routes/lead-handoff.js';
import { createCoreApiRouter } from '../routes/core-api.js';
import { createClientsApiRouter } from '../routes/clients-api.js';
import { createCalendarApiRouter } from '../routes/calendar-api.js';
import { createClientOpsRouter } from '../routes/client-ops-mount.js';
import { createOutboundSequenceVisibilityRouter } from '../routes/outbound-sequence-visibility-mount.js';
import { createCallsByPhoneRouter } from '../routes/calls-by-phone-mount.js';

export function mountApi(app, deps) {
  const {
    // core services
    bookingSystem,
    smsEmailPipeline,
    // auth / tenancy
    requireApiKey,
    getClientFromHeader,
    isDashboardSelfServiceClient,
    // db + caching
    query,
    poolQuerySelect,
    cacheMiddleware,
    dashboardStatsCache,
    DASHBOARD_CACHE_TTL,
    dbType,
    DB_PATH,
    // clients
    upsertFullClient,
    getFullClient,
    listFullClients,
    deleteClient,
    invalidateClientCache,
    // ops + time
    isBusinessHours,
    getNextBusinessHour,
    scheduleAtOptimalCallWindow,
    addToCallQueue,
    pickTimezone,
    DateTime,
    TIMEZONE,
    isPostgres,
    sqlDaysAgo,
    // lead utils
    validateAndSanitizePhone,
    phoneMatchKey,
    sanitizeInput,
    isOptedOut,
    sendOperatorAlert,
    sanitizeLead,
    runOutboundCallsForImportedLeads,
    // demo + dashboards
    isDemoClient,
    readJson,
    writeJson,
    SMS_STATUS_PATH,
    fetchImpl,
    activityFeedChannelLabel,
    DASHBOARD_ACTIVITY_TZ,
    formatTimeAgoLabel,
    formatCallDuration,
    truncateActivityFeedText,
    formatVapiEndedReasonDisplay,
    outcomeToFriendlyLabel,
    parseCallsRowMetadata,
    isCallQueueStartFailureRow,
    mapCallStatus,
    mapStatusClass,
    trimEnvDashboard,
    buildDashboardExperience,
    timelineVapiAuthKey,
    fetchVapiCallSnapshotForTimeline,
    vapiCallSnapshotToTimelineHints,
    inferTimelinePickupStatus,
    // alerts / bands / sheets
    resolveLogisticsSpreadsheetId,
    sheets,
    effectiveDialScheduledForApiDisplay,
    fetchLeadNamesForRetryQueuePhones,
    // integrations
    getIntegrationStatusesForClient,
    // misc deps
    nanoid,
    createABTestExperiment,
    runOutboundAbTestSetup,
    runOutboundAbChallengerUpdate,
    runOutboundAbDimensionStop,
    isVapiOutboundAbExperimentOnlyPatch,
    adjustColorBrightness,
    AIInsightsEngine,
    getCallContextCacheStats,
    getMostRecentCallContext,
    GOOGLE_CLIENT_EMAIL,
    GOOGLE_PRIVATE_KEY,
    GOOGLE_CALENDAR_ID,
    // calendar deps
    servicesFor,
    makeJwtAuth,
    GOOGLE_PRIVATE_KEY_B64,
    google,
    pickCalendarId,
    insertEvent,
    smsConfig,
    freeBusy,
    renderTemplate,
    scheduleAppointmentReminders,
    appendToSheet,
    deriveIdemKey,
    withRetry,
    setCachedIdem,
    CALLS_PATH,
    defaultSmsClient,
    TWILIO_FROM_NUMBER,
    TWILIO_MESSAGING_SERVICE_SID,
  } = deps;

  app.use(
    createClientOpsRouter({
      getFullClient,
      nanoid,
      createABTestExperiment,
      invalidateClientCache,
      runOutboundAbTestSetup,
      runOutboundAbChallengerUpdate,
      runOutboundAbDimensionStop,
      isDashboardSelfServiceClient,
      isVapiOutboundAbExperimentOnlyPatch,
      getLeadSequenceState: deps.getLeadSequenceState,
      updateLeadSequenceState: deps.updateLeadSequenceState,
      getCallQueueByPhone: deps.getCallQueueByPhone,
      updateCallQueueStatus: deps.updateCallQueueStatus,
      getLeadHandoffByPhone: deps.getLeadHandoffByPhone,
      upsertLeadHandoff: deps.upsertLeadHandoff,
    })
  );
  app.use('/api/outreach', createOutreachRouter());
  app.use('/api/crm', createCrmRouter({ getFullClient }));
  app.use('/api/branding', createBrandingRouter({ getFullClient, upsertFullClient }));
  app.use('/api/analytics', createAnalyticsRouter());
  app.use(createSmsEmailPipelineRouter({ smsEmailPipeline }));
  app.use(createBookingTestRouter({ bookingSystem, getApiKey: () => process.env.API_KEY, getFullClient }));
  app.use(createVapiDevRouter());
  app.use('/api', createPipelineTrackingRouter({ smsEmailPipeline }));
  app.use('/api', createPipelineRetryRouter({ smsEmailPipeline }));
  app.use('/api/webhooks', createZapierWebhookRouter({ requireApiKey, getClientFromHeader }));
  app.use('/api', createImportLeadsCsvRouter({ requireApiKey }));
  app.use('/api', createGooglePlacesTestRouter());
  app.use('/api', createBookDemoRouter({ bookingSystem, smsEmailPipeline }));
  app.use('/api', createAvailableSlotsRouter({ bookingSystem }));
  app.use('/api', createCreateClientRouter({ upsertFullClient, adjustColorBrightness }));
  app.use('/api', createQualityAlertsRouter());
  app.use('/api', createDevTestRouter({ query, readJson, writeJson, SMS_STATUS_PATH }));
  app.use('/api', createCallInsightsRouter({ cacheMiddleware, poolQuerySelect, query }));
  app.use(createCompanyEnrichmentRouter());
  app.use(
    createRuntimeMetricsRouter({
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
    })
  );
  app.use(
    '/api',
    createImportLeadsRouter({
      getFullClient,
      isBusinessHours,
      query,
      getClientFromHeader,
      getNextBusinessHour,
      scheduleAtOptimalCallWindow,
      addToCallQueue,
      validateAndSanitizePhone,
      phoneMatchKey,
      sanitizeInput,
      isOptedOut,
      sendOperatorAlert,
      sanitizeLead,
      runOutboundCallsForImportedLeads,
      TIMEZONE,
    })
  );
  app.use('/api', createImportLeadEmailRouter());
  app.use('/api', createRoiRouter());
  app.use('/api', createIndustryComparisonRouter({ getFullClient }));
  app.use('/api', createLeadsExistingMatchKeysRouter({ query }));
  app.use('/api', createAbTestResultsRouter());
  app.use('/api', createDemoTestCallRouter({ getFullClient, isDemoClient, fetchImpl }));
  app.use('/api', createCallTranscriptRouter({ query }));
  app.use('/api', createDemoDashboardDebugRouter({ query, fetchImpl }));
  app.use(
    '/api',
    createDemoDashboardRouter({
      handleDemoDashboard: (req, res, _routerDeps) =>
        handleDemoDashboard(req, res, {
          getFullClient,
          activityFeedChannelLabel,
          DateTime,
          DASHBOARD_ACTIVITY_TZ,
          isPostgres,
          query,
          sqlDaysAgo,
          formatTimeAgoLabel,
          formatCallDuration,
          truncateActivityFeedText,
          formatVapiEndedReasonDisplay,
          outcomeToFriendlyLabel,
          parseCallsRowMetadata,
          isCallQueueStartFailureRow,
          mapCallStatus,
          mapStatusClass,
          trimEnvDashboard,
          buildDashboardExperience,
          sendOperatorAlert,
          fetchImpl,
        }),
    })
  );
  app.use(
    '/api',
    createLeadTimelineRouter({
      query,
      timelineVapiAuthKey,
      fetchVapiCallSnapshotForTimeline,
      vapiCallSnapshotToTimelineHints,
      inferTimelinePickupStatus,
      formatCallDuration,
    })
  );
  app.use('/api', createCallTimeBanditRouter());
  app.use(
    '/api',
    createRetryQueueRouter({
      poolQuerySelect,
      query,
      getFullClient,
      fetchLeadNamesForRetryQueuePhones,
      effectiveDialScheduledForApiDisplay,
      resolveLogisticsSpreadsheetId,
      sheets,
    })
  );
  app.use('/api', createFollowUpQueueRouter({ getFullClient, resolveLogisticsSpreadsheetId, sheets, query, phoneMatchKey }));
  app.use('/api', createCallsByPhoneRouter({ query, getFullClient }));
  app.use('/api', createNextActionsRouter({ query, cacheMiddleware }));
  app.use('/api', createCallRecordingsRouter({ query, formatTimeAgoLabel }));
  app.use('/api', createVoicemailsRouter({ isPostgres, poolQuerySelect, formatTimeAgoLabel, truncateActivityFeedText }));
  app.use('/api', createCallRecordingsStreamRouter({ poolQuerySelect }));
  app.use('/api', createRecordingsQualityCheckRouter({ query }));
  app.use('/api', createReportsRouter({ authenticateApiKey: deps.authenticateApiKey }));
  app.use('/api', createSmsTemplatesRouter({ authenticateApiKey: deps.authenticateApiKey }));
  app.use('/api', createMonitoringDashboardRouter({ authenticateApiKey: deps.authenticateApiKey }));
  app.use(createApiDocsRouter());
  app.use('/api', createQuickWinMetricsRouter({ query, cacheMiddleware }));
  app.use(createHealthAndDiagnosticsRouter({ query }));
  app.use(
    '/api',
    createLeadHandoffRouter({
      listLeadHandoff: deps.listLeadHandoff,
      getLeadHandoffByPhone: deps.getLeadHandoffByPhone,
      setLeadHandoffOperatorNotes: deps.setLeadHandoffOperatorNotes,
      phoneMatchKey: deps.phoneMatchKey,
      getFullClient,
      query,
    })
  );
  app.use(
    '/api',
    createOutboundSequenceVisibilityRouter({
      query,
      getFullClient,
      isPostgres,
      phoneMatchKey,
    })
  );
  app.use(
    '/api',
    createOpsHealthAndDncRouter({
      getFullClient,
      resolveLogisticsSpreadsheetId,
      listOptOutList: deps.listOptOutList,
      upsertOptOut: deps.upsertOptOut,
      deactivateOptOut: deps.deactivateOptOut,
      query,
      dbType,
      DB_PATH,
    })
  );
  app.use(
    '/api',
    createDailySummaryRouter({
      getFullClient,
      resolveLogisticsSpreadsheetId,
      sheets,
      isPostgres,
      poolQuerySelect,
      query,
      pickTimezone,
    })
  );
  app.use(
    '/api',
    createCoreApiRouter({
      query,
      getFullClient,
      getIntegrationStatuses: (clientKey) => getIntegrationStatusesForClient(clientKey, { query }),
    })
  );
  app.use(
    '/api/clients',
    createClientsApiRouter({
      listFullClients,
      getFullClient,
      upsertFullClient,
      deleteClient,
      pickTimezone,
      isDashboardSelfServiceClient,
    })
  );
  app.use(
    '/api/calendar',
    createCalendarApiRouter({
      getClientFromHeader,
      servicesFor: typeof servicesFor === 'function' ? servicesFor : undefined,
      makeJwtAuth,
      GOOGLE_CLIENT_EMAIL,
      GOOGLE_PRIVATE_KEY,
      GOOGLE_PRIVATE_KEY_B64,
      google,
      pickCalendarId,
      insertEvent,
      pickTimezone,
      smsConfig,
      getGoogleCredentials: () => ({
        clientEmail: GOOGLE_CLIENT_EMAIL,
        privateKey: GOOGLE_PRIVATE_KEY,
        privateKeyB64: GOOGLE_PRIVATE_KEY_B64,
        calendarId: GOOGLE_CALENDAR_ID,
      }),
      freeBusy,
      renderTemplate,
      scheduleAppointmentReminders,
      appendToSheet,
      // check-book deps
      deriveIdemKey,
      getMostRecentCallContext,
      isDemoClient,
      readJson,
      writeJson,
      CALLS_PATH,
      withRetry,
      setCachedIdem,
      getTwilioDemoContext: () => ({
        defaultSmsClient,
        TWILIO_FROM_NUMBER,
        TWILIO_MESSAGING_SERVICE_SID,
      }),
    })
  );

  // Non-/api router mount that used to live in server.js.
  app.use('/', googlePlacesSearchRouter);
}

