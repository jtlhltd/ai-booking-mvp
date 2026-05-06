import { createAdminDiagnosticsRouter } from '../routes/admin-diagnostics-mount.js';
import { createAdminServerCallQueueRouter } from '../routes/admin-server-call-queue-mount.js';
import { createAdminAnalyticsRouter, createAdminCostAndAccessRouter } from '../routes/admin-analytics-mount.js';
import { createAdminClientsHealthRouter } from '../routes/admin-clients-health-mount.js';
import { createAdminVapiCampaignsRouter } from '../routes/admin-vapi-campaigns-mount.js';
import { createAdminVapiLogisticsRouter } from '../routes/admin-vapi-logistics-mount.js';
import { createAdminVapiPlumbingRouter } from '../routes/admin-vapi-plumbing-mount.js';
import { createToolsRouter } from '../routes/tools-mount.js';

export function mountAdminAndTools(app, deps) {
  const {
    // /admin tools
    createAdminTestLeadDataRouter,
    createAdminTestScriptRouter,
    createAdminValidateCallDurationRouter,

    createInlineJsonApiRouter,
    createPublicReadsRouter,

    // deps for those routers
    resolveTenantKeyFromInbound,
    listFullClients,
    loadDemoScript,
    readDemoTelemetry,
    clearDemoTelemetry,
    readReceptionistTelemetry,
    clearReceptionistTelemetry,
    readJson,
    LEADS_PATH,
    normalizePhoneE164,
    getFullClient,
    calculateLeadScore,
    getLeadPriority,

    query,
    dbType,
    authenticateApiKey,
    rateLimitMiddleware,
    requirePermission,
    getCostOptimizationMetrics,

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

    upsertFullClient,
    isPostgres,
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,

    store,
    sheets,
    sendOperatorAlert,
    messagingService,

    startColdCallCampaign,
    getOptimalCallTime,
    generateFollowUpPlan,
    generateVoicemailFollowUpEmail,
    generateDemoConfirmationEmail,
    generateObjectionHandlingEmail,
    generatePersonalizedScript,

    runLogisticsOutreach,

    TIMEZONE,
    isBusinessHoursForTenant,

    nanoid,
    mockCallFetchImpl,
    activityFeedChannelLabel,
    outcomeToFriendlyLabel,
    isCallQueueStartFailureRow,
    parseCallsRowMetadata,
    formatCallDuration,
    truncateActivityFeedText,
    eventsSseDeps,

    dashboardResetDeps,
    leadsScorePrioritizeDeps,
    roiCalculatorSaveDeps,
  } = deps;

  // /admin tools (HTML-ish tools, not /api/admin)
  if (createAdminTestLeadDataRouter) app.use('/admin', createAdminTestLeadDataRouter());
  if (createAdminTestScriptRouter) app.use('/admin', createAdminTestScriptRouter());
  if (createAdminValidateCallDurationRouter) app.use('/admin', createAdminValidateCallDurationRouter());

  app.use(
    createAdminDiagnosticsRouter({
      resolveTenantKeyFromInbound,
      listFullClients,
      loadDemoScript,
      readDemoTelemetry,
      clearDemoTelemetry,
      readReceptionistTelemetry,
      clearReceptionistTelemetry,
      readJson,
      LEADS_PATH,
      normalizePhoneE164,
      getFullClient,
      calculateLeadScore,
      getLeadPriority,
    })
  );

  app.use(
    createAdminServerCallQueueRouter({
      listFullClients,
      query,
      dbType,
      loadDb: () => import('../db.js'),
      getApiKey,
    })
  );

  app.use(
    createAdminCostAndAccessRouter({
      getCostOptimizationMetrics,
      loadDb: () => import('../db.js'),
      getApiKey,
      authenticateApiKey,
      rateLimitMiddleware,
      requirePermission,
    })
  );

  app.use(
    createAdminAnalyticsRouter({
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
    })
  );

  app.use(
    createAdminClientsHealthRouter({
      getApiKey,
      loadDb: () => import('../db.js'),
      getFullClient,
      listFullClients,
      upsertFullClient,
      normalizePhoneE164,
      calculateLeadScore,
      query,
      isPostgres,
      TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN,
    })
  );

  app.use(
    createToolsRouter({
      store,
      sheets,
      sendOperatorAlert,
      messagingService,
    })
  );

  app.use(
    createAdminVapiCampaignsRouter({
      getApiKey,
      startColdCallCampaign,
      getOptimalCallTime,
      generateFollowUpPlan,
      generateVoicemailFollowUpEmail,
      generateDemoConfirmationEmail,
      generateObjectionHandlingEmail,
      generatePersonalizedScript,
    })
  );

  app.use(
    createAdminVapiLogisticsRouter({
      getApiKey,
      runLogisticsOutreach,
    })
  );

  app.use(
    createAdminVapiPlumbingRouter({
      getApiKey,
      TIMEZONE,
      isBusinessHoursForTenant,
    })
  );

  if (createInlineJsonApiRouter) {
    app.use(
      createInlineJsonApiRouter({
        getApiKey,
        dashboardResetDeps,
        leadsScorePrioritizeDeps,
        roiCalculatorSaveDeps,
      })
    );
  }

  if (createPublicReadsRouter) {
    app.use(
      createPublicReadsRouter({
        nanoid,
        mockCallFetchImpl,
        getFullClient,
        isPostgres,
        query,
        activityFeedChannelLabel,
        outcomeToFriendlyLabel,
        isCallQueueStartFailureRow,
        parseCallsRowMetadata,
        formatCallDuration,
        truncateActivityFeedText,
        eventsSseDeps,
      })
    );
  }
}

