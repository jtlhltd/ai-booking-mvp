// server.js — AI Booking System (SQLite tenants + env bootstrap + richer tenant awareness)
// Sentry: load via `node --import ./instrument.mjs` (see package.json start/render-start).
import 'dotenv/config';
import { normalizePhoneE164 } from './lib/utils.js';
import { parseStartPreference } from './lib/start-preference.js';
import { generateUKBusinesses, getIndustryCategories, fuzzySearch } from './enhanced-business-search.js';
import RealUKBusinessSearch from './real-uk-business-search.js';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import { DateTime } from 'luxon';
import * as chrono from 'chrono-node';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { isWebhookBypassPath, mountWebhookBodyParsers } from './app/mount-webhooks.js';
import { createRequireApiKey } from './app/install-auth-and-guards.js';
import { mountAdminAndTools } from './app/mount-admin-tools.js';
import { buildScheduledJobsDeps } from './app/install-schedulers.js';
import { getDemoOverrides, formatOverridesForTelemetry, loadDemoScript } from './lib/demo-script.js';
import {
  isBusinessHoursForTenant,
  getNextBusinessOpenForTenant,
  clampOutboundDialToAllowedWindow,
  allowOutboundWeekendCalls
} from './lib/business-hours.js';
import { recordDemoTelemetry, readDemoTelemetry, clearDemoTelemetry, recordReceptionistTelemetry, readReceptionistTelemetry, clearReceptionistTelemetry } from './lib/demo-telemetry.js';
import { performanceMiddleware, getPerformanceMonitor } from './lib/performance-monitor.js';
import { cacheMiddleware, getCache } from './lib/cache.js';
import { phoneMatchKey, pgQueueLeadPhoneKeyExpr } from './lib/lead-phone-key.js';
import { resolveTenantTimezone } from './lib/timezone-resolver.js';
import { handleCalendarCheckBook } from './lib/calendar-check-book.js';
import { handleCalendarBookSlot } from './lib/calendar-book-slot.js';
import { handleCalendarFindSlots } from './lib/calendar-find-slots.js';
import { servicesFor } from './lib/services-for.js';
import { scheduleAtOptimalCallWindow } from './lib/optimal-call-window.js';
import { runOutboundCallsForImportedLeads } from './lib/lead-import-outbound.js';
import { handleTwilioSmsInbound } from './lib/twilio-sms-inbound-webhook.js';
import { isNoCreditsVapiResult, isTransientVapiQueueResult } from './lib/vapi-queue-result.js';
import { handleNotifyTest, handleNotifySend } from './lib/notify-api.js';
import { handleSmsStatusWebhook } from './lib/sms-status-webhook.js';
import { isOptedOut } from './lib/lead-deduplication.js';
import { isMobileNumber } from './lib/google-places-search.js';
import { setLastDialBlock } from './lib/ops-state.js';

import { makeJwtAuth, insertEvent, freeBusy } from './gcal.js';
import {
  init as initDb,
  upsertFullClient,
  getFullClient,
  listClientSummaries,
  listFullClients,
  deleteClient,
  DB_PATH,
  dbType,
  query,
  pool,
  poolQuerySelect,
  invalidateClientCache,
  smearCallQueueScheduledFor,
  listOptOutList,
  upsertOptOut,
  deactivateOptOut,
  getLeadsByClient,
  getCallsByTenant,
  upsertLeadHandoff,
  upsertImportedLead,
  listLeadHandoff,
  getLeadHandoffByPhone,
  setLeadHandoffOperatorNotes,
  addToCallQueue,
  getLeadSequenceState,
  updateLeadSequenceState,
  getCallQueueByPhone,
  updateCallQueueStatus
} from './db.js'; // SQLite-backed tenants
import {
  getBusinessStats,
  getRecentActivity,
  getClientsData,
  getCallsData,
  getAnalyticsData,
  getSystemHealthData
} from './lib/admin-hub-data.js';
import { enforceAdminApiKeyIfConfigured } from './middleware/admin-api-key.js';
import { 
  authenticateApiKey, 
  rateLimitMiddleware, 
  requirePermission, 
  requireTenantAccess,
  validateAndSanitizeInput,
  securityHeaders,
  requestLogging,
  errorHandler,
  twilioWebhookVerification,
  auditLog,
  validateInput
} from './middleware/security.js';
// await initDb(); // Moved to server startup
import { google } from 'googleapis';
import leadsRouter from './routes/leads.js';
import twilioWebhooks from './routes/twilio-webhooks.js';
import vapiWebhooks from './routes/vapi-webhooks.js';
import twilioVoiceWebhooks from './routes/twilio-voice-webhooks.js';
import appointmentsRouter from './routes/appointments.js';
import receptionistRouter from './routes/receptionist.js';
import healthRouter from './routes/health.js';
import monitoringRouter from './routes/monitoring.js';
import backendStatusRouter from './routes/backend-status.js';
import demoSetupRouter from './routes/demo-setup.js';
import opsRouter from './routes/ops.js';
import staticPagesRouter from './routes/static-pages.js';
import { createOutreachRouter } from './routes/outreach.js';
import { createCrmRouter } from './routes/crm.js';
import { createBrandingRouter } from './routes/branding.js';
import { createAnalyticsRouter } from './routes/analytics.js';
import { createClientsApiRouter } from './routes/clients-api.js';
import { createCalendarApiRouter } from './routes/calendar-api.js';
import { createLeadsFollowupsRouter } from './routes/leads-followups.js';
import { createSmsEmailPipelineRouter } from './routes/sms-email-pipeline.js';
import { createBookingTestRouter } from './routes/booking-test.js';
import { createVapiDevRouter } from './routes/vapi-dev.js';
import { createAdminTestLeadDataRouter } from './routes/admin-test-lead-data.js';
import { createAdminTestScriptRouter } from './routes/admin-test-script.js';
import { createAdminValidateCallDurationRouter } from './routes/admin-validate-call-duration.js';
import { createPipelineTrackingRouter } from './routes/pipeline-tracking.js';
import { createPipelineRetryRouter } from './routes/pipeline-retry.js';
import { createZapierWebhookRouter } from './routes/zapier-webhook.js';
import { createImportLeadsCsvRouter } from './routes/import-leads-csv.js';
import { createGooglePlacesTestRouter } from './routes/google-places-test.js';
import { createBookDemoRouter } from './routes/book-demo.js';
import { createAvailableSlotsRouter } from './routes/available-slots.js';
import { createCreateClientRouter } from './routes/create-client.js';
import { createQualityAlertsRouter } from './routes/quality-alerts.js';
import { createImportLeadsRouter } from './routes/import-leads.js';
import { createMetaIngestWebhooksRouter } from './routes/meta-ingest-webhooks-mount.js';
import { createNotifyAndTwilioSmsRouter } from './routes/notify-and-twilio-sms-mount.js';
import { createInlineJsonApiRouter } from './routes/inline-json-api-mount.js';
import { createPublicReadsRouter } from './routes/public-reads-mount.js';
import { createHealthProbesRouter } from './routes/health-probes-mount.js';
import { getIntegrationStatuses as getIntegrationStatusesForClient } from './lib/integration-statuses.js';
import { createDevTestRouter } from './routes/dev-test-mount.js';
import { createCallInsightsRouter } from './routes/call-insights-mount.js';
import { createCompanyEnrichmentRouter } from './routes/company-enrichment-mount.js';
import { createLeadsPortalRouter } from './routes/leads-portal-mount.js';
import { createRuntimeMetricsRouter } from './routes/runtime-metrics-mount.js';
import { createPortalPagesRouter } from './routes/portal-pages-mount.js';
import { createClientOpsRouter } from './routes/client-ops-mount.js';
import { createImportLeadEmailRouter } from './routes/import-lead-email.js';
import { createRoiRouter } from './routes/roi.js';
import { createIndustryComparisonRouter } from './routes/industry-comparison.js';
import { createLeadsExistingMatchKeysRouter } from './routes/leads-existing-match-keys.js';
import { createAbTestResultsRouter } from './routes/ab-test-results.js';
import { createDemoTestCallRouter } from './routes/demo-test-call.js';
import { createCallTranscriptRouter } from './routes/call-transcript.js';
import { createLeadTimelineRouter } from './routes/lead-timeline.js';
import { createCallTimeBanditRouter } from './routes/call-time-bandit.js';
import { createRetryQueueRouter } from './routes/retry-queue.js';
import { createNextActionsRouter } from './routes/next-actions.js';
import { createCallRecordingsRouter } from './routes/call-recordings.js';
import { createVoicemailsRouter } from './routes/voicemails.js';
import { createCallRecordingsStreamRouter } from './routes/call-recordings-stream.js';
import { createRecordingsQualityCheckRouter } from './routes/recordings-quality-check.js';
import { createReportsRouter } from './routes/reports.js';
import { createSmsTemplatesRouter } from './routes/sms-templates.js';
import { createMonitoringDashboardRouter } from './routes/monitoring-dashboard.js';
import { createApiDocsRouter } from './routes/api-docs.js';
import { createQuickWinMetricsRouter } from './routes/quick-win-metrics.js';
import { createHealthAndDiagnosticsRouter } from './routes/health-and-diagnostics.js';
import { createOpsHealthAndDncRouter } from './routes/ops-health-and-dnc.js';
import { createCoreApiRouter } from './routes/core-api.js';
import { createAdminOverviewRouter } from './routes/admin-overview.js';
import { createAdminRemindersRouter } from './routes/admin-reminders.js';
import { createAdminClientsRouter } from './routes/admin-clients.js';
import { createAdminAnalyticsAdvancedRouter } from './routes/admin-analytics-advanced.js';
import { createAdminOperationsRouter } from './routes/admin-operations.js';
import { createAdminSalesPipelineRouter } from './routes/admin-sales-pipeline.js';
import { createAdminEmailTasksDealsRouter } from './routes/admin-email-tasks-deals.js';
import { createAdminCalendarRouter } from './routes/admin-calendar.js';
import { createAdminDocumentsCommentsFieldsRouter } from './routes/admin-documents-comments-fields.js';
import { createAdminTemplatesRouter } from './routes/admin-templates.js';
import { createAdminCallRecordingsRouter } from './routes/admin-call-recordings.js';
import { createAdminCallQueueRouter } from './routes/admin-call-queue.js';
import { createAdminOutboundWeekdayJourneyRouter } from './routes/admin-outbound-weekday-journey.js';
import { createAdminCallsInsightsRouter } from './routes/admin-calls-insights.js';
import { createAdminLeadScoringRouter } from './routes/admin-lead-scoring.js';
import { createAdminAppointmentsRouter } from './routes/admin-appointments.js';
import { createAdminFollowUpsRouter } from './routes/admin-follow-ups.js';
import { createAdminReportsRouter } from './routes/admin-reports.js';
import { createAdminSocialRouter } from './routes/admin-social.js';
import { createAdminMultiClientRouter } from './routes/admin-multi-client.js';
import { createAdminCallQueueOpsRouter } from './routes/admin-call-queue-ops.js';
import { createAdminRoiCalculatorRouter } from './routes/admin-roi-calculator.js';
import * as store from './store.js';
import * as sheets from './sheets.js';
import messagingService from './lib/messaging-service.js';
import { sendOperatorAlert } from './lib/operator-alerts.js';
import { AIInsightsEngine, LeadScoringEngine } from './lib/ai-insights.js';
import { getCallContext, storeCallContext, getMostRecentCallContext, getCallContextCacheStats } from './lib/call-context-cache.js';
import { createSocketIo, installAdminHubRealtimeHandlers } from './app/realtime.js';
import { createApp } from './app/create-app.js';
import { mountAdminRoutes } from './app/mount-routes.js';
import { mountApi } from './app/mount-api.js';
import { startServer as createStartServer } from './app/start-server.js';
import { installGlobalMiddleware } from './app/install-global-middleware.js';
import { installShutdownHandlers } from './app/install-shutdown-handlers.js';
import { createRuntimeConfig } from './app/runtime-config.js';
import { bootstrapServices } from './app/bootstrap-services.js';
import { buildApiDeps } from './app/api-deps.js';
import { runStartServer } from './app/startup.js';
import { closeDatabasePool } from './app/shutdown.js';
import { buildAdminRoutesDeps } from './app/admin-deps.js';
import { buildMountAdminAndToolsDeps } from './app/mount-admin-tools-deps.js';
import { registerMainHttpRoutes } from './app/register-http-routes.js';
import {
  formatGBP,
  formatTimeAgoLabel,
  activityFeedChannelLabel,
  mapCallStatus,
  formatCallDuration,
  truncateActivityFeedText,
  parseCallsRowMetadata,
  isCallQueueStartFailureRow,
  formatVapiEndedReasonDisplay,
  inferCallEndedByFromVapiReason,
  endedReasonFromCallRow,
  outcomeToFriendlyLabel,
  inferTimelinePickupStatus,
  mapStatusClass,
  resolveLogisticsSpreadsheetId,
  trimEnvDashboard,
  parseDashboardPrivacyBullets,
  buildDashboardExperience,
  adjustColorBrightness,
} from './lib/dashboard-ui-formatters.js';
import {
  mapVapiEndedReasonToTimelineOutcome,
  flattenVapiGetCallPayload,
  messageContentToString,
  timelineVapiAuthKey,
  fetchVapiCallSnapshotForTimeline,
  vapiCallSnapshotToTimelineHints,
} from './lib/vapi-timeline-snapshot.js';
import {
  fetchLeadNamesForRetryQueuePhones,
  effectiveDialScheduledForApiDisplay,
} from './lib/retry-queue-display.js';
import { bootstrapClients } from './lib/bootstrap-clients.js';
import {
  processRetryQueue,
  processCallQueue,
  processVapiCallFromQueue,
  queueNewLeadsForCalling,
} from './lib/server-queue-workers.js';
import {
  trackAnalyticsEvent,
  trackConversionStage,
  recordPerformanceMetric,
  getAnalyticsDashboard,
  generateAnalyticsReport,
  createABTestExperiment,
  getActiveABTests,
  selectABTestVariant,
  recordABTestOutcome,
  getABTestResults,
  getCachedMetrics,
  CACHE_TTL,
  clearCache,
  analyticsQueue,
  connectionPool,
  analyticsProcessing,
  queueAnalyticsEvent,
  processAnalyticsQueue,
  getConnectionPoolKey,
  optimizeDatabaseConnections,
  getCacheKey,
  getCached,
  setCache,
  getCachedClient,
  getCachedAnalyticsDashboard,
} from './lib/server-analytics-runtime.js';
import {
  createOutboundAbHandlers,
  isDashboardSelfServiceClient,
  isVapiOutboundAbExperimentOnlyPatch,
} from './lib/outbound-ab-dashboard-handlers.js';
import { runLogisticsOutreach, startColdCallCampaign } from './lib/campaign-vapi-dial-helpers.js';
import {
  getOptimalCallTime,
  generateFollowUpPlan,
  generateVoicemailFollowUpEmail,
  generateDemoConfirmationEmail,
  generateObjectionHandlingEmail,
  generatePersonalizedScript,
} from './lib/cold-call-personalization.js';
import {
  sanitizeLead,
  validatePhoneNumber,
  validateSmsBody,
  sanitizeInput,
  validateAndSanitizePhone,
  createSmsRateLimitMiddleware
} from './lib/server-input-validation.js';
import {
  retryWithBackoff,
  checkBudgetBeforeCall,
  trackCallCost,
  getCostOptimizationMetrics,
  createVapiFailureHandlers
} from './lib/server-call-resilience.js';
import {
  safeAsync,
  selectOptimalAssistant,
  calculateLeadScore,
  getLeadPriority,
  createOutboundSchedulingContext
} from './lib/server-assistant-scheduling.js';
import {
  ensureDataFiles as ensureDataFilesOnDisk,
  readJson,
  writeJson,
  createResolveTenantKeyFromInbound,
  renderTemplate
} from './lib/server-files-inbound-templates.js';
import { createAppointmentReminderHandlers, startRemindersDisabled } from './lib/server-reminders-runner.js';
import { createServerHttpContext, createActiveRequestTrackingMiddleware } from './lib/server-http-context.js';
import { generateRealisticDecisionMakers } from './lib/server-demo-generators.js';
import { asJson, hoursFor, withRetry, isDemoClient, calculateCacheHitRate } from './lib/server-runtime-helpers.js';
import { appendToSheet } from './lib/google-sheets-append.js';
// Real API integration - dynamic imports will be used in endpoints

const {
  runOutboundAbTestSetup,
  runOutboundAbChallengerUpdate,
  runOutboundAbDimensionStop,
} = createOutboundAbHandlers({
  invalidateClientCache,
  getFullClient,
  nanoid,
  createABTestExperiment,
});

const app = createApp({
  performanceMiddleware,
  performanceMonitor: getPerformanceMonitor(),
  enforceAdminApiKeyIfConfigured,
  securityHeaders,
  requestLogging,
  validateAndSanitizeInput,
  auditLog,
  staticPagesRouter,
  createPortalPagesRouter
});

const runtime = createRuntimeConfig(path.dirname(fileURLToPath(import.meta.url)));
const {
  DATA_DIR,
  LEADS_PATH,
  CALLS_PATH,
  SMS_STATUS_PATH,
  JOBS_PATH,
  isPostgres,
  sqlHoursAgo,
  sqlDaysAgo,
  TIMEZONE,
  GOOGLE_CLIENT_EMAIL,
  GOOGLE_PRIVATE_KEY,
  GOOGLE_PRIVATE_KEY_B64,
  GOOGLE_CALENDAR_ID,
  DASHBOARD_CACHE_TTL,
  dashboardStatsCache,
  DASHBOARD_ACTIVITY_TZ,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER,
  TWILIO_MESSAGING_SERVICE_SID,
} = runtime;

// Create HTTP server and Socket.IO server
const server = createServer(app);
const { io, socketIoAllowedOrigins } = createSocketIo(server);

// Initialize caching
const cache = getCache();

const broadcastUpdate = installAdminHubRealtimeHandlers(io, {
  getBusinessStats,
  getRecentActivity,
  getClientsData,
  getCallsData,
  getAnalyticsData,
  getSystemHealthData
});

// API key guard middleware
const requireApiKey = createRequireApiKey({ getApiKey: () => API_KEY, isWebhookBypassPath });

const { bookingSystem, smsEmailPipeline, defaultSmsClient, defaultSmsConfigured } = bootstrapServices({
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER,
  TWILIO_MESSAGING_SERVICE_SID,
});

const serverLifecycle = { isShuttingDown: false, activeRequests: 0 };

const {
  getClientFromHeader,
  pickTimezone,
  pickCalendarId,
  smsConfig,
  getCachedIdem,
  setCachedIdem,
  deriveIdemKey
} = createServerHttpContext({
  getFullClient,
  TIMEZONE,
  GOOGLE_CALENDAR_ID,
  defaultSmsClient,
  TWILIO_FROM_NUMBER,
  TWILIO_MESSAGING_SERVICE_SID
});

const {
  isBusinessHours,
  getNextBusinessHour,
  generateAssistantVariables,
  determineCallScheduling
} = createOutboundSchedulingContext({ TIMEZONE, getFullClient });

const { handleVapiFailure } = createVapiFailureHandlers({
  getFullClient,
  listFullClients,
  upsertFullClient,
  smsConfig
});

const { scheduleAppointmentReminders, sendScheduledReminders, sendReminderSMS } = createAppointmentReminderHandlers({
  query,
  smsConfig,
  renderTemplate
});

const smsRateLimit = createSmsRateLimitMiddleware({
  rateLimitWindowMs: 60 * 1000,
  maxRequests: 10
});

const resolveTenantKeyFromInbound = createResolveTenantKeyFromInbound(listFullClients);

mountApi(
  app,
  buildApiDeps({
    bookingSystem,
    smsEmailPipeline,
    requireApiKey,
    getClientFromHeader,
    isDashboardSelfServiceClient,
    query,
    poolQuerySelect,
    cacheMiddleware,
    dashboardStatsCache,
    DASHBOARD_CACHE_TTL,
    dbType,
    DB_PATH,
    upsertFullClient,
    getFullClient,
    listFullClients,
    deleteClient,
    invalidateClientCache,
    isBusinessHours,
    getNextBusinessHour,
    scheduleAtOptimalCallWindow,
    addToCallQueue,
    upsertImportedLead,
    upsertLeadHandoff,
    listLeadHandoff,
    getLeadHandoffByPhone,
    setLeadHandoffOperatorNotes,
    getLeadSequenceState,
    updateLeadSequenceState,
    getCallQueueByPhone,
    updateCallQueueStatus,
    pickTimezone,
    DateTime,
    TIMEZONE,
    isPostgres,
    sqlDaysAgo,
    validateAndSanitizePhone,
    phoneMatchKey,
    sanitizeInput,
    isOptedOut,
    sendOperatorAlert,
    sanitizeLead,
    runOutboundCallsForImportedLeads,
    isDemoClient,
    readJson,
    writeJson,
    SMS_STATUS_PATH,
    fetchImpl: fetch,
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
    resolveLogisticsSpreadsheetId,
    sheets,
    effectiveDialScheduledForApiDisplay,
    fetchLeadNamesForRetryQueuePhones,
    getIntegrationStatusesForClient,
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
    authenticateApiKey,
    listOptOutList,
    upsertOptOut,
    deactivateOptOut,
  })
);

mountAdminRoutes(
  app,
  buildAdminRoutesDeps({
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
  })
);

// moved: /api/admin/call-recordings → routes/admin-call-recordings.js

/**
 * Admin ops: pull a batch of pending outbound calls forward into "today" (current business window),
 * spacing them out so they become due gradually rather than all at once.
 *
 * POST /api/admin/call-queue/pull-forward/:clientKey?limit=80
 */
// moved: /api/admin/call-queue/* → routes/admin-call-queue.js

/**
 * Admin ops: peek at the next outbound queue rows for a client, including defer diagnostics.
 *
 * GET /api/admin/call-queue/peek/:clientKey?limit=20&dueOnly=1
 */
// moved: /api/admin/call-queue/peek/:clientKey → routes/admin-call-queue.js

/**
 * Admin ops: aggregate outbound dial “blockers” / defer reasons for a tenant (counts, not phone lists).
 *
 * GET /api/admin/call-queue/blockers/:clientKey
 */
// moved: /api/admin/call-queue/blockers/:clientKey → routes/admin-call-queue.js

/**
 * Admin ops: force-reset stuck `processing` outbound queue rows back to `pending`.
 *
 * POST /api/admin/call-queue/reset-processing/:clientKey?minAgeSec=90&limit=500
 */
// moved: /api/admin/call-queue/reset-processing/:clientKey → routes/admin-call-queue.js

/**
 * Admin ops: clear today's weekday-journey slot claims for a client.
 *
 * This unblocks `weekday_slot_used` deferrals for the current local weekday only,
 * without wiping the whole outbound_weekday_journey history.
 *
 * POST /api/admin/outbound-weekday-journey/clear-today/:clientKey?limit=5000
 */
// moved: /api/admin/outbound-weekday-journey/clear-today/:clientKey → routes/admin-outbound-weekday-journey.js

// moved: /api/admin/call-recordings (POST/play/transcript/delete) → routes/admin-call-recordings.js

// moved: /api/admin/calls/insights → routes/admin-calls-insights.js

// moved: /api/admin/leads scoring endpoints → routes/admin-lead-scoring.js

// moved: /api/admin/appointments/* → routes/admin-appointments.js

// moved: /api/admin/follow-ups/* → routes/admin-follow-ups.js
// moved: /api/admin/follow-ups/templates → routes/admin-templates.js

// moved: /api/admin/reports* → routes/admin-reports.js
// moved: /api/admin/reports/templates → routes/admin-templates.js

// moved: /api/admin/social/* → routes/admin-social.js

// moved: GET /mock-call → routes/public-reads-mount.js (lib/mock-call-route.js)

// moved: /test-booking → routes/booking-test.js

// moved: SMS-Email Pipeline endpoints → routes/sms-email-pipeline.js


// moved: VAPI dev endpoints (/test-vapi, /create-assistant) → routes/vapi-dev.js


// moved: GET /admin/test-lead-data → routes/admin-test-lead-data.js

// moved: POST /admin/test-script → routes/admin-test-script.js

// moved: GET /admin/validate-call-duration → routes/admin-validate-call-duration.js

// Middleware for parsing JSON bodies (must be before routes that need it)
// Moved to top of file to ensure all routes have access to JSON parsing

// moved: /api pipeline tracking endpoints → routes/pipeline-tracking.js

// moved: POST /api/trigger-retry/:leadId → routes/pipeline-retry.js

// moved: POST /api/webhooks/zapier → routes/zapier-webhook.js

// moved: POST /api/import-leads-csv → routes/import-leads-csv.js

// moved: POST /api/test-google-places → routes/google-places-test.js

// moved: POST /api/search-google-places → routes/google-places-search.js

// (search-google-places handler and its helper functions moved to routes/lib modules)

// moved: POST /api/book-demo → routes/book-demo.js

// moved: GET /api/available-slots → routes/available-slots.js

// moved: POST /api/create-client → routes/create-client.js

// moved: /api/quality-alerts/* → routes/quality-alerts.js

// moved: POST /api/import-leads/:clientKey → routes/import-leads.js

// moved: POST /api/import-lead-email/:clientKey → routes/import-lead-email.js

// moved: GET /api/roi/:clientKey → routes/roi.js

// moved: GET /api/industry-comparison/:clientKey → routes/industry-comparison.js
// Backup, database, cost, webhook-retry, migrations, admin/backup/check → routes/backend-status.js
// Query perf, rate-limit, analytics → routes/ops.js
registerMainHttpRoutes.backendStatusOpsAndTenant(app, {
  backendStatusRouter,
  opsRouter
});

// moved: /api/admin/clients/* → routes/admin-multi-client.js

// moved: /api/reports/* → routes/reports.js

// moved: /api/sms/templates* → routes/sms-templates.js

// moved: /api/monitoring/(dashboard|client-usage|performance-trends) → routes/monitoring-dashboard.js

// moved: /api-docs → routes/api-docs.js

// moved: /api/(sms-delivery-rate|calendar-sync|quality-metrics) → routes/quick-win-metrics.js


// moved: /api/health/comprehensive, /api/call-status, /health/lb → routes/health-and-diagnostics.js

const PORT = process.env.PORT || 3000;
const ORIGIN = process.env.VAPI_ORIGIN || '*';
const API_KEY = process.env.API_KEY || '';

// VAPI Token Protection - prevent unnecessary calls during testing
const VAPI_TEST_MODE = process.env.VAPI_TEST_MODE === 'true' || process.env.NODE_ENV === 'test';
const VAPI_DRY_RUN = process.env.VAPI_DRY_RUN === 'true' || process.env.NODE_ENV === 'development';

// Add compression middleware
registerMainHttpRoutes.compression(app);

// Cache cleanup is handled automatically by lib/cache.js (runs every 5 minutes)

// Connection pool optimization
setInterval(optimizeDatabaseConnections, 5 * 60 * 1000); // Every 5 minutes
await installGlobalMiddleware(app, { express, morgan, cors, rateLimit, nanoid, ORIGIN });
mountWebhookBodyParsers(app, { express });

/** @type {{ stop: () => void } | null} */
let scheduledJobsController = null;

await ensureDataFilesOnDisk(DATA_DIR, [LEADS_PATH, CALLS_PATH, SMS_STATUS_PATH, JOBS_PATH]);

app.use(createActiveRequestTrackingMiddleware(serverLifecycle));

// Expose a simple notify helper for SMS so other modules/routes can reuse Twilio
app.locals.notifySend = async ({ to, from, message, idempotencyKey }) => {
  const { smsClient, configured } = smsConfig();
  if (!configured) throw new Error('SMS not configured');
  const payload = { to, body: message };
  if (from) payload.from = from;
  return smsClient.messages.create(payload);
};

// moved: /api/test* endpoints + /api/test/sms-status-webhook → routes/dev-test-mount.js

// UK Business Search endpoint (PUBLIC - no auth required) - WITH REAL API
// FILTERS FOR MOBILE NUMBERS ONLY BY DEFAULT
// moved: /api/uk-business-search, /api/decision-maker-contacts, /api/industry-categories → routes/company-enrichment-mount.js

// app.use(requireApiKey); // Temporarily disabled to fix admin hub access

// moved: POST /api/leads (override) → routes/leads-portal-mount.js




// Health and monitoring routes (before other routes for quick access)
const leadsPortalRouter = createLeadsPortalRouter({
  getClientFromHeader,
  normalizePhoneE164,
  readJson,
  writeJson,
  LEADS_PATH,
  nanoid,
  smsConfig,
  renderTemplate
});
registerMainHttpRoutes.healthMonitoringAndIntake(app, {
  healthRouter,
  monitoringRouter,
  leadsPortalRouter,
  leadsRouter,
  twilioWebhooks,
  twilioVoiceWebhooks,
  appointmentsRouter,
  receptionistRouter,
  cacheMiddleware,
  vapiWebhooks
});

// moved: runtime + monitoring endpoints → routes/runtime-metrics-mount.js

// Mounted minimal lead intake + STOP webhook (see registerHealthMonitoringAndIntakeRouters)

// --- Vapi booking webhook: create GCal event + send confirmations
// CONFLICTING WEBHOOK HANDLER - DISABLED TO ALLOW LOGISTICS WEBHOOK
// Live Vapi webhook mount lives in `routes/vapi-webhooks.js` (server mounts it); this block stays commented.
// app.post('/webhooks/vapi', async (req, res) => {
//   try {
//     const p = req.body || {};
//
//     // Accept multiple payload shapes from Vapi
//     const clientKey =
//       p?.metadata?.clientKey || p?.clientKey || req.get('X-Client-Key') || null;
//     const service = p?.metadata?.service || p?.service || '';
//     const lead    = p?.customer || p?.lead || p?.metadata?.lead || {};
//     const slot    = p?.booking?.slot || p?.metadata?.selectedOption || p?.selectedSlot || p?.slot;
//
//     if (!clientKey) return res.status(400).json({ ok:false, error:'missing clientKey' });
//     if (!service)   return res.status(400).json({ ok:false, error:'missing service' });
//     if (!lead?.phone) return res.status(400).json({ ok:false, error:'missing lead.phone' });
//     if (!slot?.start) return res.status(400).json({ ok:false, error:'missing slot.start' });

//     const client = await getFullClient(clientKey);
//     if (!client) return res.status(404).json({ ok:false, error:'unknown tenant' });
//
//     if (!(GOOGLE_CLIENT_EMAIL && (GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY_B64))) {
//       return res.status(400).json({ ok:false, error:'Google env missing' });
//     }
//
//     // ... rest of booking webhook code commented out ...
//   } catch (err) {
//     console.error('[VAPI WEBHOOK ERROR]', err?.response?.data || err?.message || err);
//     return res.status(500).json({ ok:false, error: String(err?.response?.data || err?.message || err) });
//   }
// });

// Stats/analytics cache + vapi webhooks: mounted in registerHealthMonitoringAndIntake (app/register-http-routes.js)

// Helper functions

// Helpers for hours/closures

// moved: /api/calendar/find-slots → routes/calendar-api.js

// Retry helper

// Simple health + gcal probes → routes/health-probes-mount.js
const healthzDeps = {
  listFullClients,
  getIntegrationFlags: () => ({
    gcalConfigured: !!(GOOGLE_CLIENT_EMAIL && (GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY_B64) && GOOGLE_CALENDAR_ID),
    smsConfigured: defaultSmsConfigured,
    corsOrigin: ORIGIN === '*' ? 'any' : ORIGIN,
    dbPath: DB_PATH
  })
};
const gcalPingDeps = {
  getGoogleCredentials: () => ({
    clientEmail: GOOGLE_CLIENT_EMAIL,
    privateKey: GOOGLE_PRIVATE_KEY,
    privateKeyB64: GOOGLE_PRIVATE_KEY_B64
  })
};

// moved: /api/calendar/book-slot → routes/calendar-api.js

// Twilio delivery receipts + notify routes
const notifySendDeps = {
  getClientFromHeader,
  query,
  smsConfig,
  normalizePhoneE164,
};

const smsStatusWebhookDeps = {
  query,
  readJson,
  writeJson,
  smsStatusPath: SMS_STATUS_PATH,
};

// Simple SMS send + Twilio status/inbound → routes/notify-and-twilio-sms-mount.js

// Twilio inbound deps (Vapi constants used below and by twilioSmsInboundDeps)
const VAPI_URL = 'https://api.vapi.ai';
const resolveVapiKey = () =>
  process.env.VAPI_PRIVATE_KEY ||
  process.env.VAPI_PUBLIC_KEY ||
  process.env.VAPI_API_KEY ||
  '';
const resolveVapiAssistantId = (client) =>
  client?.vapiAssistantId || process.env.VAPI_ASSISTANT_ID || '';
const resolveVapiPhoneNumberId = (client) =>
  client?.vapiPhoneNumberId || process.env.VAPI_PHONE_NUMBER_ID || '';

// Backwards compatibility for modules that still reference the old constants.
const VAPI_PRIVATE_KEY     = resolveVapiKey();
const VAPI_ASSISTANT_ID    = process.env.VAPI_ASSISTANT_ID || '';
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID || '';

const twilioSmsInboundDeps = {
  validatePhoneNumber,
  validateSmsBody,
  normalizePhoneE164,
  resolveTenantKeyFromInbound,
  listFullClients,
  getFullClient,
  upsertFullClient,
  nanoid,
  trackConversionStage,
  trackAnalyticsEvent,
  VAPI_PRIVATE_KEY,
  VAPI_TEST_MODE,
  VAPI_DRY_RUN,
  checkBudgetBeforeCall,
  handleVapiFailure,
  determineCallScheduling,
  addToCallQueue: async (row) => {
    const { addToCallQueue } = await import('./db.js');
    return addToCallQueue(row);
  },
  isBusinessHours,
  getNextBusinessHour,
  calculateLeadScore,
  getLeadPriority,
  smsConfig,
  TIMEZONE,
  selectOptimalAssistant,
  retryWithBackoff,
  generateAssistantVariables,
  VAPI_URL,
  recordPerformanceMetric,
  pickCalendarId,
  GOOGLE_CLIENT_EMAIL,
  GOOGLE_PRIVATE_KEY,
  GOOGLE_PRIVATE_KEY_B64,
  google,
};

const webhooksNewLeadDeps = {
  getFullClient,
  normalizePhoneE164,
  resolveVapiKey,
  resolveVapiAssistantId,
  resolveVapiPhoneNumberId,
  TIMEZONE,
  recordReceptionistTelemetry,
  VAPI_URL,
};

const webhooksFacebookLeadDeps = {
  getBaseUrl: () =>
    process.env.PUBLIC_BASE_URL ||
    process.env.BASE_URL ||
    `http://localhost:${process.env.PORT || 10000}`,
  nodeEnv: process.env.NODE_ENV,
};

registerMainHttpRoutes.probesNotifyMeta(app, {
  createHealthProbesRouter,
  createNotifyAndTwilioSmsRouter,
  createMetaIngestWebhooksRouter,
  healthzDeps,
  gcalPingDeps,
  notifySendDeps,
  smsStatusWebhookDeps,
  twilioSmsInboundDeps,
  handleNotifyTest,
  handleNotifySend,
  handleSmsStatusWebhook,
  handleTwilioSmsInbound,
  twilioWebhookVerification,
  smsRateLimit,
  safeAsync,
  webhooksNewLeadDeps,
  webhooksFacebookLeadDeps
});

// moved: GET /api/debug/cache → routes/runtime-metrics-mount.js

const dashboardResetDeps = { query };
// moved: POST /api/dashboard/reset → routes/inline-json-api-mount.js
// moved: /api/calendar/check-book → routes/calendar-api.js

// moved: GET /api/time/now → routes/runtime-metrics-mount.js

const leadsScorePrioritizeDeps = { LeadScoringEngine };
const roiCalculatorSaveDeps = { query };

const eventsSseDeps = {
  query,
  getFullClient,
  activityFeedChannelLabel,
  outcomeToFriendlyLabel,
  isCallQueueStartFailureRow,
  parseCallsRowMetadata,
  formatCallDuration,
  truncateActivityFeedText,
  mapCallStatus,
  mapStatusClass,
};

const calculateCacheHitRateForTenant = (tenantKey) => calculateCacheHitRate(cache, tenantKey);

mountAdminAndTools(
  app,
  buildMountAdminAndToolsDeps({
    createAdminTestLeadDataRouter,
    createAdminTestScriptRouter,
    createAdminValidateCallDurationRouter,
    createInlineJsonApiRouter,
    createPublicReadsRouter,

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

    getApiKey: () => process.env.API_KEY,
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
    calculateCacheHitRate: calculateCacheHitRateForTenant,
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
    upsertLeadHandoff,
    phoneMatchKey,

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
    mockCallFetchImpl: globalThis.fetch,
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
  })
);

console.log('🟢🟢🟢 [INLINE-JSON-API] REGISTERED: /sms, /api/dashboard/reset/:clientKey, leads score/prioritize, roi save');
console.log(
  '🟢 [PUBLIC-READS] Routes registered (gated by ENABLE_PUBLIC_DEV_ROUTES): /mock-call, /api/outbound-queue-day/:clientKey, /api/events/:clientKey'
);

// Helper function for cache hit rate calculation

// moved: /admin/system-health, /admin/metrics, /admin/fix-tenants → routes/admin-clients-health-mount.js

// moved: /api/build, /health, /monitor/*, /api/stats → routes/runtime-metrics-mount.js

// moved: GET /api/insights/:clientKey → routes/runtime-metrics-mount.js

// moved: /api/admin/call-queue/dedupe-pending-vapi → routes/admin-call-queue-ops.js
// moved: /api/admin/outbound-weekday-journey/clear → routes/admin-call-queue-ops.js

// moved: /api/admin/roi-calculator/leads → routes/admin-roi-calculator.js

// moved: /api/outreach/* → routes/outreach.js

// moved: /api/crm/* → routes/crm.js

// moved: /api/branding/* → routes/branding.js

// moved: /api/analytics/* → routes/analytics.js

// moved: /api/clients (DB-backed) → routes/clients-api.js



// moved: /api/calendar cancel/reschedule → routes/calendar-api.js




// === Reminder job: 24h & 1h SMS (disabled to prevent crashes) ===

// startReminders(); // Disabled to prevent crashes



// === Google Sheets ledger helper ===



// moved: POST /api/leads (JSON-backed) → routes/leads-portal-mount.js
registerMainHttpRoutes.leadsFollowups(app, {
  createLeadsFollowupsRouter,
  leadsFollowupsDeps: {
    getClientFromHeader,
    readJson,
    writeJson,
    LEADS_PATH,
    getFullClient,
    isBusinessHours,
    TIMEZONE,
    VAPI_ASSISTANT_ID: process.env.VAPI_ASSISTANT_ID,
    VAPI_PHONE_NUMBER_ID: process.env.VAPI_PHONE_NUMBER_ID,
    VAPI_PRIVATE_KEY: process.env.VAPI_PRIVATE_KEY,
    smsConfig
  }
});
// moved: /api/leads/recall, /api/leads/nudge, /api/leads/:id → routes/leads-followups.js

// Retry processor - runs every 5 minutes to process pending retries

// Start processors with cron jobs (better than setInterval for production)
// These will be scheduled in the cron section below

// moved: /admin/vapi/cold-call-assistant and /tools/* → routes/admin-vapi-campaigns-mount.js and routes/tools-mount.js

// moved: outbound A/B + review endpoints → routes/client-ops-mount.js

// moved: POST /api/clients/:clientKey/deactivate → routes/client-ops-mount.js

// moved: GET /api/realtime/:clientKey/events → routes/runtime-metrics-mount.js

// moved: portal pages (/dashboard, /settings, /privacy*, /zapier*, /complete-setup, /leads pages) → routes/portal-pages-mount.js

// ============================================================================
// AUTOMATED CLIENT SIGNUP (Self-Service Onboarding)
// ============================================================================

// moved: POST /api/signup → routes/client-ops-mount.js

// moved: GET /api/realtime/stats → routes/runtime-metrics-mount.js

// Demo/setup routes → routes/demo-setup.js
registerMainHttpRoutes.demoSetupAndErrorHandler(app, {
  demoSetupRouter,
  errorHandler,
  setupSentryExpressErrorHandler: (await import('./lib/sentry.js')).setupSentryExpressErrorHandler,
});

// Initialize database and start server - FIXED: braces properly balanced
async function startServer() {
  try {
    const { validateEnvironment } = await import('./lib/env-validator.js');
    const { runMigrations } = await import('./lib/migration-runner.js');
    const { registerScheduledJobs } = await import('./lib/scheduled-jobs.js');

    scheduledJobsController = await runStartServer({
      createStartServer,
      validateEnvironment,
      runMigrations,
      registerScheduledJobs,
      server,
      io,
      DB_PATH,
      bookingSystem,
      smsEmailPipeline,
      initDb: async () => {
        await initDb();
        console.log('✅ Database initialized');
      },
      bootstrapClients,
      buildScheduledJobsDeps,
      processCallQueue,
      processRetryQueue,
      queueNewLeadsForCalling,
      sendScheduledReminders,
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

async function closeDatabase() {
  try {
    await closeDatabasePool(pool);
  } catch (error) {
    console.error('[SHUTDOWN ERROR] Error during shutdown:', error);
    process.exit(1);
  }
}

installShutdownHandlers({
  server,
  io,
  getActiveRequests: () => serverLifecycle.activeRequests,
  stopScheduledJobs: () => {
    if (scheduledJobsController?.stop) {
      try {
        scheduledJobsController.stop();
      } catch (e) {
        console.warn('[SHUTDOWN] scheduled jobs stop error:', e?.message || e);
      }
    }
    scheduledJobsController = null;
  },
  closeDatabase: async () => {
    serverLifecycle.isShuttingDown = true;
    await closeDatabase();
  },
});

startServer();

