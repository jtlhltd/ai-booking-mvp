// server.js — AI Booking System (SQLite tenants + env bootstrap + richer tenant awareness)
import 'dotenv/config';
import { normalizePhoneE164 } from './lib/utils.js';
import { parseStartPreference } from './lib/start-preference.js';
import { generateUKBusinesses, getIndustryCategories, fuzzySearch } from './enhanced-business-search.js';
import RealUKBusinessSearch from './real-uk-business-search.js';
import morgan from 'morgan';
import fs from 'fs/promises';
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
import { createHash } from 'crypto';
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
  listLeadHandoff,
  getLeadHandoffByPhone,
  setLeadHandoffOperatorNotes,
  addToCallQueue
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
import { createDemoDashboardDebugRouter } from './routes/demo-dashboard-debug.js';
import { createDemoDashboardRouter, handleDemoDashboard } from './routes/demo-dashboard.js';
import { createLeadTimelineRouter } from './routes/lead-timeline.js';
import { createCallTimeBanditRouter } from './routes/call-time-bandit.js';
import { createRetryQueueRouter } from './routes/retry-queue.js';
import { createFollowUpQueueRouter } from './routes/follow-up-queue.js';
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
import { createDailySummaryRouter } from './routes/daily-summary.js';
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

/** API-safe lead row (matches routes/core-api.js). */
function sanitizeLead(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    service: row.service,
    status: row.status,
    source: row.source,
    lastMessage: row.notes
  };
}

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
    listLeadHandoff,
    getLeadHandoffByPhone,
    setLeadHandoffOperatorNotes,
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

// Rate limiting store (in production, use Redis)
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute per IP

// Input validation helpers
function validatePhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
}

function validateSmsBody(body) {
  if (!body || typeof body !== 'string') return false;
  return body.trim().length > 0 && body.length <= 1600; // SMS character limit
}

// Enhanced input sanitization
function sanitizeInput(input, maxLength = 1000) {
  if (!input || typeof input !== 'string') return '';
  return input
    .trim()
    .substring(0, maxLength)
    .replace(/[<>]/g, '') // Remove potential HTML
    .replace(/[\r\n\t]/g, ' '); // Normalize whitespace
}

// Validate and sanitize phone number
function validateAndSanitizePhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.length < 10 || cleaned.length > 15) return null;
  return cleaned;
}

// Custom rate limiting middleware for SMS webhooks
function smsRateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  // Clean old entries
  for (const [key, timestamp] of rateLimitStore.entries()) {
    if (timestamp < windowStart) {
      rateLimitStore.delete(key);
    }
  }
  
  // Check current IP
  const requests = Array.from(rateLimitStore.entries())
    .filter(([key, timestamp]) => key.startsWith(ip) && timestamp > windowStart)
    .length;
  
  if (requests >= RATE_LIMIT_MAX_REQUESTS) {
    console.log('[RATE LIMIT]', { ip, requests, limit: RATE_LIMIT_MAX_REQUESTS });
    return res.status(429).json({ error: 'Too many requests' });
  }
  
  rateLimitStore.set(`${ip}-${now}`, now);
  next();
}

// Enhanced retry logic with exponential backoff and circuit breaker
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000, context = {}) {
  const { operation = 'unknown', tenantKey = 'unknown', leadPhone = 'unknown' } = context;
  
  // Check circuit breaker
  if (isCircuitBreakerOpen(operation)) {
    throw new Error(`Circuit breaker is open for operation: ${operation}`);
  }
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      
      // Log successful retry if it wasn't the first attempt
      if (attempt > 1) {
        console.log(`[RETRY SUCCESS]`, {
          operation,
          tenantKey,
          leadPhone,
          attempt,
          totalAttempts: attempt
        });
      }
      
      // Reset circuit breaker on success
      if (attempt > 1) {
        await updateCircuitBreakerState(operation, 'closed');
      }
      
      return result;
    } catch (error) {
      const errorType = categorizeError(error);
      const shouldRetry = shouldRetryError(errorType, attempt, maxRetries);
      
      console.error(`[RETRY ATTEMPT ${attempt}/${maxRetries}]`, {
        operation,
        tenantKey,
        leadPhone,
        errorType,
        error: error.message,
        shouldRetry,
        attempt
      });
      
      if (!shouldRetry || attempt === maxRetries) {
        // Log final failure
        console.error(`[RETRY FAILED]`, {
          operation,
          tenantKey,
          leadPhone,
          finalAttempt: attempt,
          errorType,
          error: error.message
        });
        
        // Implement circuit breaker for critical failures
        if (errorType === 'critical') {
          await updateCircuitBreakerState(operation, 'open');
        }
        
        throw error;
      }
      
      // Calculate delay with jitter to avoid thundering herd
      const delay = calculateRetryDelay(baseDelay, attempt, errorType);
      console.log(`[RETRY DELAY]`, {
        operation,
        tenantKey,
        delay: `${delay}ms`,
        nextAttempt: attempt + 1,
        errorType
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Cost optimization functions
async function checkBudgetBeforeCall(tenantKey, estimatedCost = 0.05) {
  try {
    const { checkBudgetExceeded, checkCostAlerts } = await import('./db.js');
    
    // Check daily budget
    const dailyBudget = await checkBudgetExceeded(tenantKey, 'vapi_calls', 'daily');
    if (dailyBudget.exceeded) {
      console.log('[BUDGET EXCEEDED]', {
        tenantKey,
        period: 'daily',
        limit: dailyBudget.limit,
        current: dailyBudget.current,
        estimated: estimatedCost
      });
      return { allowed: false, reason: 'daily_budget_exceeded', budget: dailyBudget };
    }
    
    // Check if adding this call would exceed budget
    if (dailyBudget.current + estimatedCost > dailyBudget.limit) {
      console.log('[BUDGET WOULD EXCEED]', {
        tenantKey,
        period: 'daily',
        limit: dailyBudget.limit,
        current: dailyBudget.current,
        estimated: estimatedCost
      });
      return { allowed: false, reason: 'would_exceed_daily_budget', budget: dailyBudget };
    }
    
    // Check cost alerts
    const alerts = await checkCostAlerts(tenantKey);
    if (alerts.length > 0) {
      console.log('[COST ALERTS TRIGGERED]', {
        tenantKey,
        alerts: alerts.map(a => a.message)
      });
    }
    
    return { allowed: true, budget: dailyBudget };
  } catch (error) {
    console.error('[BUDGET CHECK ERROR]', error);
    return { allowed: true, reason: 'budget_check_failed' }; // Allow call if budget check fails
  }
}

async function trackCallCost(tenantKey, callId, cost, metadata = {}) {
  try {
    const { trackCost } = await import('./db.js');
    
    await trackCost({
      clientKey: tenantKey,
      callId,
      costType: 'vapi_call',
      amount: cost,
      currency: 'USD',
      description: `VAPI call cost tracking`,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString()
      }
    });
    
    console.log('[CALL COST TRACKED]', {
      tenantKey,
      callId,
      cost: `$${cost}`,
      type: 'vapi_call'
    });
  } catch (error) {
    console.error('[COST TRACKING ERROR]', error);
  }
}

async function getCostOptimizationMetrics(tenantKey) {
  try {
    const { 
      getTotalCostsByTenant, 
      getCostsByPeriod, 
      getBudgetLimits,
      checkBudgetExceeded 
    } = await import('./db.js');
    
    const [dailyCosts, weeklyCosts, monthlyCosts, budgetLimits] = await Promise.all([
      getTotalCostsByTenant(tenantKey, 'daily'),
      getTotalCostsByTenant(tenantKey, 'weekly'),
      getTotalCostsByTenant(tenantKey, 'monthly'),
      getBudgetLimits(tenantKey)
    ]);
    
    const costBreakdown = await getCostsByPeriod(tenantKey, 'daily');
    
    // Check budget status
    const budgetStatus = {};
    for (const budget of budgetLimits) {
      budgetStatus[budget.budget_type] = {
        daily: await checkBudgetExceeded(tenantKey, budget.budget_type, 'daily'),
        weekly: await checkBudgetExceeded(tenantKey, budget.budget_type, 'weekly'),
        monthly: await checkBudgetExceeded(tenantKey, budget.budget_type, 'monthly')
      };
    }
    
    return {
      costs: {
        daily: dailyCosts,
        weekly: weeklyCosts,
        monthly: monthlyCosts,
        breakdown: costBreakdown
      },
      budgets: budgetLimits,
      budgetStatus,
      optimization: {
        costPerCall: dailyCosts.transaction_count > 0 ? dailyCosts.total_cost / dailyCosts.transaction_count : 0,
        dailyBudgetUtilization: budgetStatus.vapi_calls?.daily?.percentage || 0,
        recommendations: generateCostRecommendations(dailyCosts, budgetStatus)
      }
    };
  } catch (error) {
    console.error('[COST METRICS ERROR]', error);
    return null;
  }
}

function generateCostRecommendations(costs, budgetStatus) {
  const recommendations = [];
  
  if (costs.total_cost > 0) {
    const avgCostPerCall = costs.total_cost / costs.transaction_count;
    
    if (avgCostPerCall > 0.10) {
      recommendations.push({
        type: 'cost_optimization',
        priority: 'high',
        message: `Average call cost is $${avgCostPerCall.toFixed(2)}. Consider optimizing assistant prompts to reduce call duration.`
      });
    }
    
    if (budgetStatus.vapi_calls?.daily?.percentage > 80) {
      recommendations.push({
        type: 'budget_alert',
        priority: 'medium',
        message: `Daily budget utilization is ${budgetStatus.vapi_calls.daily.percentage.toFixed(1)}%. Consider setting up budget alerts.`
      });
    }
    
    if (costs.transaction_count > 50) {
      recommendations.push({
        type: 'volume_optimization',
        priority: 'low',
        message: `High call volume (${costs.transaction_count} calls). Consider implementing call scheduling to optimize timing.`
      });
    }
  }
  
  return recommendations;
}

// Add compression middleware
registerMainHttpRoutes.compression(app);

// Cache cleanup is handled automatically by lib/cache.js (runs every 5 minutes)

// Connection pool optimization
setInterval(optimizeDatabaseConnections, 5 * 60 * 1000); // Every 5 minutes

// Categorize errors for appropriate retry handling
function categorizeError(error) {
  const message = error.message?.toLowerCase() || '';
  const status = error.status || error.statusCode;
  
  // Network/connectivity errors (retryable)
  if (message.includes('timeout') || message.includes('econnreset') || message.includes('enotfound')) {
    return 'network';
  }
  
  // Rate limiting (retryable with longer delay)
  if (status === 429 || message.includes('rate limit') || message.includes('too many requests')) {
    return 'rate_limit';
  }
  
  // Server errors (retryable)
  if (status >= 500 && status < 600) {
    return 'server_error';
  }
  
  // Client errors (not retryable)
  if (status >= 400 && status < 500) {
    return 'client_error';
  }
  
  // VAPI-specific errors
  if (message.includes('vapi') || message.includes('assistant') || message.includes('phone number')) {
    return 'vapi_error';
  }
  
  // Critical errors (circuit breaker)
  if (message.includes('unauthorized') || message.includes('forbidden') || message.includes('invalid key')) {
    return 'critical';
  }
  
  return 'unknown';
}

// Determine if error should be retried
function shouldRetryError(errorType, attempt, maxRetries) {
  const retryableErrors = ['network', 'server_error', 'rate_limit'];
  const nonRetryableErrors = ['client_error', 'critical'];
  
  if (nonRetryableErrors.includes(errorType)) {
    return false;
  }
  
  if (retryableErrors.includes(errorType)) {
    return attempt < maxRetries;
  }
  
  // Unknown errors: retry once
  return attempt === 1;
}

// Calculate retry delay with jitter
function calculateRetryDelay(baseDelay, attempt, errorType) {
  let delay = baseDelay * Math.pow(2, attempt - 1);
  
  // Special handling for rate limiting
  if (errorType === 'rate_limit') {
    delay = Math.max(delay, 5000); // Minimum 5 seconds for rate limits
  }
  
  // Add jitter (±25% random variation)
  const jitter = delay * 0.25 * (Math.random() - 0.5);
  delay = Math.max(100, delay + jitter);
  
  return Math.floor(delay);
}

// Circuit breaker state management
const circuitBreakerState = new Map();

async function updateCircuitBreakerState(operation, state) {
  circuitBreakerState.set(operation, {
    state,
    timestamp: Date.now(),
    failureCount: state === 'open' ? (circuitBreakerState.get(operation)?.failureCount || 0) + 1 : 0
  });
  
  console.log(`[CIRCUIT BREAKER]`, {
    operation,
    state,
    failureCount: circuitBreakerState.get(operation)?.failureCount || 0
  });
}

function isCircuitBreakerOpen(operation) {
  const state = circuitBreakerState.get(operation);
  if (!state) return false;
  
  // Auto-recovery after 5 minutes
  const recoveryTime = 5 * 60 * 1000;
  if (state.state === 'open' && Date.now() - state.timestamp > recoveryTime) {
    circuitBreakerState.set(operation, { state: 'half-open', timestamp: Date.now() });
    console.log(`[CIRCUIT BREAKER RECOVERY]`, { operation, state: 'half-open' });
    return false;
  }
  
  return state.state === 'open';
}

// Handle VAPI failures with fallback mechanisms
async function handleVapiFailure({ from, tenantKey, error }) {
  try {
    console.log('[VAPI FALLBACK]', { from, tenantKey, error });
    
    const client = await getFullClient(tenantKey);
    if (!client) {
      console.error('[VAPI FALLBACK ERROR]', { reason: 'client_not_found', tenantKey });
      return;
    }
    
    // Option 1: Send SMS fallback message
    await sendSmsFallback({ from, tenantKey, client, error });
    
    // Option 2: Schedule retry call
    await scheduleRetryCall({ from, tenantKey, client, error });
    
    // Option 3: Update lead status
    await updateLeadOnVapiFailure({ from, tenantKey, error });
    
  } catch (fallbackError) {
    console.error('[VAPI FALLBACK ERROR]', {
      from,
      tenantKey,
      originalError: error,
      fallbackError: fallbackError.message
    });
  }
}

// Send SMS fallback when VAPI fails
async function sendSmsFallback({ from, tenantKey, client, error }) {
  try {
    const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
    if (!configured) {
      console.log('[SMS FALLBACK SKIP]', { reason: 'sms_not_configured', tenantKey });
      return;
    }
    
    const brand = client?.displayName || client?.clientKey || 'Our Clinic';
    const fallbackMessage = `Hi! ${brand} tried to call you but had a technical issue. Please call us back at ${client?.phone || 'our main number'} or reply with your preferred time.`;
    
    await smsClient.messages.create({
      body: fallbackMessage,
      messagingServiceSid,
      to: from
    });
    
    console.log('[SMS FALLBACK SENT]', { from, tenantKey, message: fallbackMessage });
    
  } catch (smsError) {
    console.error('[SMS FALLBACK ERROR]', { from, tenantKey, error: smsError.message });
  }
}

// Schedule retry call for later
async function scheduleRetryCall({ from, tenantKey, client, error }) {
  try {
    // Determine retry delay based on error type
    const errorType = categorizeError({ message: error });
    let retryDelay = 30 * 60 * 1000; // Default 30 minutes
    
    if (errorType === 'rate_limit') {
      retryDelay = 60 * 60 * 1000; // 1 hour for rate limits
    } else if (errorType === 'server_error') {
      retryDelay = 15 * 60 * 1000; // 15 minutes for server errors
    } else if (errorType === 'critical') {
      retryDelay = 2 * 60 * 60 * 1000; // 2 hours for critical errors
    }
    
    const retryTime = new Date(Date.now() + retryDelay);
    
    // Import database functions
    const { addToRetryQueue } = await import('./db.js');
    
    // Add to retry queue
    const retryData = {
      originalError: error,
      errorType,
      clientConfig: {
        assistantId: client?.vapi?.assistantId,
        phoneNumberId: client?.vapi?.phoneNumberId
      }
    };
    
    await addToRetryQueue({
      clientKey: tenantKey,
      leadPhone: from,
      retryType: 'vapi_call',
      retryReason: errorType,
      retryData,
      scheduledFor: retryTime,
      retryAttempt: 1,
      maxRetries: 3
    });
    
    console.log('[RETRY SCHEDULED]', {
      from,
      tenantKey,
      errorType,
      retryTime: retryTime.toISOString(),
      retryDelay: `${retryDelay / 1000 / 60} minutes`,
      queued: true
    });
    
  } catch (retryError) {
    console.error('[RETRY SCHEDULE ERROR]', { from, tenantKey, error: retryError.message });
  }
}

// Update lead status when VAPI fails
async function updateLeadOnVapiFailure({ from, tenantKey, error }) {
  try {
    const clients = await listFullClients();
    const leads = clients.flatMap(client => client.leads || []);
    const lead = leads.find(l => l.phone === from && l.tenantKey === tenantKey);
    
    if (lead) {
      lead.status = 'vapi_failed';
      lead.lastVapiError = error;
      lead.lastVapiAttempt = new Date().toISOString();
      
      // Update the client in the database
      const client = await getFullClient(tenantKey);
      if (client) {
        client.leads = leads.filter(l => l.tenantKey === tenantKey);
        client.updatedAt = new Date().toISOString();
        await upsertFullClient(client);
        
        console.log('[LEAD STATUS UPDATED]', {
          from,
          tenantKey,
          newStatus: 'vapi_failed',
          error
        });
      }
    }
    
  } catch (updateError) {
    console.error('[LEAD UPDATE ERROR]', { from, tenantKey, error: updateError.message });
  }
}

// Dynamic assistant selection based on lead characteristics
async function selectOptimalAssistant({ client, existingLead, isYes, isStart }) {
  try {
    const leadScore = existingLead?.score || 0;
    const leadStatus = existingLead?.status || 'new';
    const industry = client?.industry || 'general';
    const timeOfDay = new Date().getHours();
    
    // Default configuration - use process.env directly since constants may not be defined yet
    const DEFAULT_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID || '';
    const DEFAULT_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID || '';
    
    let assistantId = client?.vapiAssistantId || client?.vapi?.assistantId || DEFAULT_ASSISTANT_ID;
    let phoneNumberId = client?.vapiPhoneNumberId || client?.vapi?.phoneNumberId || DEFAULT_PHONE_NUMBER_ID;
    
    // High-value lead optimization
    if (leadScore >= 80) {
      assistantId = client?.vapiHighValueAssistantId || assistantId;
      phoneNumberId = client?.vapiHighValuePhoneNumberId || phoneNumberId;
      
      console.log('[ASSISTANT SELECTION]', {
        reason: 'high_value_lead',
        leadScore,
        assistantId,
        phoneNumberId
      });
    }
    
    // Industry-specific assistants
    else if (client?.vapiIndustryAssistants && client.vapiIndustryAssistants[industry]) {
      const industryConfig = client.vapiIndustryAssistants[industry];
      assistantId = industryConfig.assistantId || assistantId;
      phoneNumberId = industryConfig.phoneNumberId || phoneNumberId;
      
      console.log('[ASSISTANT SELECTION]', {
        reason: 'industry_specific',
        industry,
        assistantId,
        phoneNumberId
      });
    }
    
    // Time-based optimization
    else if (timeOfDay >= 9 && timeOfDay <= 17) {
      assistantId = client?.vapiBusinessHoursAssistantId || assistantId;
      phoneNumberId = client?.vapiBusinessHoursPhoneNumberId || phoneNumberId;
      
      console.log('[ASSISTANT SELECTION]', {
        reason: 'business_hours',
        timeOfDay,
        assistantId,
        phoneNumberId
      });
    }
    
    // After-hours optimization
    else {
      assistantId = client?.vapiAfterHoursAssistantId || assistantId;
      phoneNumberId = client?.vapiAfterHoursPhoneNumberId || phoneNumberId;
      
      console.log('[ASSISTANT SELECTION]', {
        reason: 'after_hours',
        timeOfDay,
        assistantId,
        phoneNumberId
      });
    }
    
    // Validate assistant configuration
    if (!assistantId || !phoneNumberId) {
      console.warn('[ASSISTANT VALIDATION]', {
        warning: 'missing_assistant_config',
        assistantId: !!assistantId,
        phoneNumberId: !!phoneNumberId,
        fallbackToDefault: true
      });
      
      assistantId = VAPI_ASSISTANT_ID;
      phoneNumberId = DEFAULT_PHONE_NUMBER_ID;
    }
    
    return { assistantId, phoneNumberId };
    
  } catch (error) {
    console.error('[ASSISTANT SELECTION ERROR]', error);
    const DEFAULT_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID || '';
    const DEFAULT_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID || '';
    return {
      assistantId: client?.vapiAssistantId || client?.vapi?.assistantId || DEFAULT_ASSISTANT_ID,
      phoneNumberId: client?.vapiPhoneNumberId || client?.vapi?.phoneNumberId || DEFAULT_PHONE_NUMBER_ID
    };
  }
}

// Generate intelligent assistant variables based on context
async function generateAssistantVariables({ client, existingLead, tenantKey, serviceForCall, isYes, isStart, assistantConfig }) {
  try {
    const now = new Date();
    const leadScore = existingLead?.score || 0;
    const leadStatus = existingLead?.status || 'new';
    const industry = client?.industry || 'general';
    const timeOfDay = now.getHours();
    const dayOfWeek = now.getDay();
    const isBusinessTime = isBusinessHours(client);
    
    // Base variables
    const variables = {
      ClientKey: tenantKey,
      BusinessName: client.displayName || client.clientKey,
      ConsentLine: 'This call may be recorded for quality.',
      DefaultService: serviceForCall || '',
      DefaultDurationMin: client?.booking?.defaultDurationMin || 30,
      Timezone: client?.booking?.timezone || TIMEZONE,
      ServicesJSON: client?.servicesJson || '[]',
      PricesJSON: client?.pricesJson || '{}',
      HoursJSON: client?.hoursJson || '{}',
      ClosedDatesJSON: client?.closedDatesJson || '[]',
      Locale: client?.locale || 'en-GB',
      ScriptHints: client?.scriptHints || '',
      FAQJSON: client?.faqJson || '[]',
      Currency: client?.currency || 'GBP',
      LeadScore: leadScore,
      LeadStatus: leadStatus,
      BusinessHours: isBusinessTime ? 'within' : 'outside'
    };
    
    // Context-aware variables
    variables.CallContext = isYes ? 'yes_response' : 'start_opt_in';
    variables.TimeOfDay = timeOfDay;
    variables.DayOfWeek = dayOfWeek;
    variables.Industry = industry;
    
    // Lead-specific variables
    if (existingLead) {
      variables.LeadAge = existingLead.createdAt ? 
        Math.floor((now - new Date(existingLead.createdAt)) / (1000 * 60 * 60 * 24)) : 0;
      variables.PreviousInteractions = existingLead.messageCount || 0;
      variables.LastInteraction = existingLead.lastInboundAt || existingLead.createdAt;
    }
    
    // Dynamic greeting based on context
    if (isYes) {
      variables.GreetingStyle = 'enthusiastic';
      variables.CallPurpose = 'booking_confirmation';
    } else if (isStart) {
      variables.GreetingStyle = 'welcoming';
      variables.CallPurpose = 'initial_consultation';
    } else {
      variables.GreetingStyle = 'professional';
      variables.CallPurpose = 'follow_up';
    }
    
    // Industry-specific customization
    switch (industry.toLowerCase()) {
      case 'healthcare':
      case 'medical':
      case 'dental':
        variables.IndustryTone = 'caring';
        variables.PrivacyNotice = 'Your health information is confidential.';
        break;
      case 'legal':
        variables.IndustryTone = 'authoritative';
        variables.PrivacyNotice = 'Attorney-client privilege applies.';
        break;
      case 'financial':
        variables.IndustryTone = 'trustworthy';
        variables.PrivacyNotice = 'Your financial information is secure.';
        break;
      default:
        variables.IndustryTone = 'professional';
        variables.PrivacyNotice = 'Your information is confidential.';
    }
    
    // Time-based customization
    if (timeOfDay < 12) {
      variables.TimeGreeting = 'Good morning';
    } else if (timeOfDay < 17) {
      variables.TimeGreeting = 'Good afternoon';
    } else {
      variables.TimeGreeting = 'Good evening';
    }
    
    // Lead score-based customization
    if (leadScore >= 80) {
      variables.PriorityLevel = 'high';
      variables.CallDuration = 'extended';
      variables.FollowUpRequired = 'yes';
    } else if (leadScore >= 50) {
      variables.PriorityLevel = 'medium';
      variables.CallDuration = 'standard';
      variables.FollowUpRequired = 'maybe';
    } else {
      variables.PriorityLevel = 'low';
      variables.CallDuration = 'brief';
      variables.FollowUpRequired = 'no';
    }
    
    // Business hours customization
    if (!isBusinessTime) {
      variables.AfterHoursMessage = 'We appreciate you reaching out after hours.';
      variables.AvailabilityNote = 'Our regular hours are Monday-Friday 9AM-5PM.';
    }
    
    console.log('[ASSISTANT VARIABLES]', {
      tenantKey,
      leadScore,
      industry,
      timeOfDay,
      variablesCount: Object.keys(variables).length
    });
    
    return variables;
    
  } catch (error) {
    console.error('[ASSISTANT VARIABLES ERROR]', error);
    
    // Return basic variables as fallback
    return {
      ClientKey: tenantKey,
      BusinessName: client?.displayName || client?.clientKey || 'Our Business',
      ConsentLine: 'This call may be recorded for quality.',
      DefaultService: serviceForCall || '',
      DefaultDurationMin: client?.booking?.defaultDurationMin || 30,
      Timezone: client?.booking?.timezone || TIMEZONE,
      LeadScore: existingLead?.score || 0,
      LeadStatus: existingLead?.status || 'new',
      BusinessHours: isBusinessHours(client) ? 'within' : 'outside'
    };
  }
}

// Enhanced error handling wrapper
function safeAsync(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error('[UNHANDLED ERROR]', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      if (!res.headersSent) {
        res.status(500).json({ 
          ok: false, 
          error: 'Internal server error',
          timestamp: new Date().toISOString()
        });
      }
    }
  };
}

// Business hours for outbound dialing (Luxon + tenant timezone; see lib/business-hours.js).
// Weekends are excluded unless ALLOW_OUTBOUND_WEEKEND_CALLS is set.
function isBusinessHours(tenant = null) {
  const tz = tenant?.booking?.timezone || tenant?.timezone || TIMEZONE;
  return isBusinessHoursForTenant(tenant, new Date(), tz, { forOutboundDial: true });
}

function getNextBusinessHour(tenant = null) {
  const tz = tenant?.booking?.timezone || tenant?.timezone || TIMEZONE;
  return getNextBusinessOpenForTenant(tenant, new Date(), tz, { forOutboundDial: true });
}

// Intelligent call scheduling
async function determineCallScheduling({ tenantKey, from, isYes, isStart, existingLead }) {
  try {
    const client = await getFullClient(tenantKey);
    const now = new Date();
    const tz = client?.booking?.timezone || client?.timezone || TIMEZONE;
    const tenantTime = new Date(now.toLocaleString("en-US", {timeZone: tz}));
    const hour = tenantTime.getHours();
    const day = tenantTime.getDay();
    
    // High priority calls (immediate)
    if (isYes && existingLead?.score >= 80) {
      return { shouldDelay: false, priority: 'high', reason: 'high_score_yes_response' };
    }
    
    // Business hours optimization
    if (!isBusinessHours(client)) {
      const nextBusinessHour = getNextBusinessHour(client);
      return {
        shouldDelay: true,
        reason: 'outside_business_hours',
        scheduledFor: nextBusinessHour,
        priority: 'normal'
      };
    }
    
    // Peak hours optimization (avoid lunch time)
    if (hour >= 12 && hour <= 14) {
      const delayUntil = new Date(tenantTime.getTime() + 2 * 60 * 60 * 1000); // 2 hours later
      return {
        shouldDelay: true,
        reason: 'lunch_hours',
        scheduledFor: delayUntil,
        priority: 'normal'
      };
    }
    
    // Weekend optimization
    if (day === 0 || day === 6) { // Sunday or Saturday
      const nextMonday = new Date(tenantTime);
      nextMonday.setDate(tenantTime.getDate() + (8 - day)); // Next Monday
      nextMonday.setHours(9, 0, 0, 0);
      return {
        shouldDelay: true,
        reason: 'weekend',
        scheduledFor: nextMonday,
        priority: 'low'
      };
    }
    
    // Rate limiting for high-volume periods
    const recentCalls = await getRecentCallsCount(tenantKey, 60); // Last hour
    if (recentCalls > 10) { // More than 10 calls in last hour
      const delayUntil = new Date(tenantTime.getTime() + 30 * 60 * 1000); // 30 minutes later
      return {
        shouldDelay: true,
        reason: 'rate_limit',
        scheduledFor: delayUntil,
        priority: 'normal'
      };
    }
    
    // Default: proceed with call
    return { shouldDelay: false, priority: 'normal', reason: 'optimal_timing' };
    
  } catch (error) {
    console.error('[CALL SCHEDULING ERROR]', error);
    return { shouldDelay: false, priority: 'normal', reason: 'error_fallback' };
  }
}

// Get count of recent calls for rate limiting
async function getRecentCallsCount(tenantKey, minutesBack = 60) {
  try {
    const { getRecentCallsCount } = await import('./db.js');
    return await getRecentCallsCount(tenantKey, minutesBack);
  } catch (error) {
    console.error('[RECENT CALLS COUNT ERROR]', error);
    return 0;
  }
}

// Lead scoring system
function calculateLeadScore(lead, tenant = null) {
  let score = 0;
  
  // Base score for opt-in
  if (lead.consentSms) score += 30;
  
  // Engagement level
  if (lead.status === 'engaged') score += 20;
  if (lead.status === 'opted_out') score = 0; // Override everything
  
  // Response time (faster = higher score)
  if (lead.lastInboundAt && lead.createdAt) {
    const responseTime = new Date(lead.lastInboundAt) - new Date(lead.createdAt);
    const responseMinutes = responseTime / (1000 * 60);
    if (responseMinutes < 5) score += 25;
    else if (responseMinutes < 30) score += 15;
    else if (responseMinutes < 60) score += 10;
  }
  
  // Message content analysis
  if (lead.lastInboundText) {
    const text = lead.lastInboundText.toLowerCase();
    
    // High-intent keywords
    if (text.includes('urgent') || text.includes('asap') || text.includes('emergency')) score += 20;
    if (text.includes('book') || text.includes('appointment') || text.includes('schedule')) score += 15;
    if (text.includes('price') || text.includes('cost') || text.includes('quote')) score += 10;
    
    // Question marks indicate engagement
    if (text.includes('?')) score += 5;
    
    // Length indicates interest
    if (text.length > 50) score += 5;
    if (text.length > 100) score += 5;
  }
  
  // Time-based scoring (recent activity)
  if (lead.lastInboundAt) {
    const hoursSinceLastContact = (new Date() - new Date(lead.lastInboundAt)) / (1000 * 60 * 60);
    if (hoursSinceLastContact < 1) score += 15;
    else if (hoursSinceLastContact < 24) score += 10;
    else if (hoursSinceLastContact < 72) score += 5;
  }
  
  // Tenant-specific scoring
  if (tenant?.leadScoring) {
    const tenantRules = tenant.leadScoring;
    if (tenantRules.highValueKeywords) {
      const text = (lead.lastInboundText || '').toLowerCase();
      for (const keyword of tenantRules.highValueKeywords) {
        if (text.includes(keyword.toLowerCase())) {
          score += tenantRules.keywordScore || 10;
        }
      }
    }
  }
  
  return Math.min(score, 100); // Cap at 100
}

function getLeadPriority(score) {
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  if (score >= 40) return 'low';
  return 'very_low';
}

await installGlobalMiddleware(app, { express, morgan, cors, rateLimit, nanoid, ORIGIN });
mountWebhookBodyParsers(app, { express });

// Graceful shutdown state management
let isShuttingDown = false;
let activeRequests = 0;
/** @type {{ stop: () => void } | null} */
let scheduledJobsController = null;

// Track active requests for graceful shutdown
app.use((req, res, next) => {
  if (isShuttingDown) {
    return res.status(503).json({ 
      ok: false,
      error: 'Server is shutting down',
      retryAfter: 30,
      message: 'Please retry your request in a few moments'
    });
  }
  
  activeRequests++;
  let decremented = false;
  const decOnce = () => {
    if (decremented) return;
    decremented = true;
    activeRequests = Math.max(0, activeRequests - 1);
  };
  res.once('finish', decOnce);
  res.once('close', decOnce);
  next();
});

async function ensureDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  for (const p of [LEADS_PATH, CALLS_PATH, SMS_STATUS_PATH, JOBS_PATH]) {
    try { await fs.access(p); } catch { await fs.writeFile(p, '[]', 'utf8'); }
  }
}
await ensureDataFiles();

async function readJson(p, fallback = null) {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return fallback; }
}
async function writeJson(p, data) { await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf8'); }

// Helpers

// Resolve tenant key from inbound SMS parameters
async function resolveTenantKeyFromInbound({ to, messagingServiceSid }) {
  // Normalize `to` via normalizePhoneE164 (country 'GB') before comparing
  const toE164 = normalizePhoneE164(to, 'GB');
  if (!toE164) {
    console.log('[TENANT RESOLVE FAIL]', { to, messagingServiceSid, reason: 'invalid_phone' });
    return null;
  }

  try {
    const clients = await listFullClients();
    const candidates = [];

    // Strategy (in order):
    // a) Match by exact phone: client.sms.fromNumber === toE164 (the "To" number in SMS)
    // b) Match by Messaging Service SID: client.sms.messagingServiceSid === messagingServiceSid
    for (const client of clients) {
      const phoneMatch = client?.sms?.fromNumber === toE164;
      const mssMatch = messagingServiceSid && client?.sms?.messagingServiceSid === messagingServiceSid;
      
      
      if (phoneMatch || mssMatch) {
        candidates.push({
          clientKey: client.clientKey,
          phoneMatch,
          mssMatch,
          fromNumber: client?.sms?.fromNumber,
          messagingServiceSid: client?.sms?.messagingServiceSid
        });
      }
    }

    if (candidates.length === 0) {
      console.log('[TENANT RESOLVE FAIL]', { to, toE164, messagingServiceSid });
  return null;
}

    // If multiple matches, prioritize phone matches over MessagingServiceSid matches
    const phoneMatches = candidates.filter(c => c.phoneMatch);
    const mssMatches = candidates.filter(c => c.mssMatch && !c.phoneMatch);
    
    let selected;
    if (phoneMatches.length > 0) {
      selected = phoneMatches[0];
      console.log('[TENANT RESOLVE OK]', { 
        tenantKey: selected.clientKey, 
        to, 
        toE164, 
        messagingServiceSid, 
        reason: 'exact_phone_match',
        priority: 'phone_over_mss'
      });
    } else if (mssMatches.length > 0) {
      selected = mssMatches[0];
      console.log('[TENANT RESOLVE OK]', { 
        tenantKey: selected.clientKey, 
        to, 
        toE164, 
        messagingServiceSid, 
        reason: 'messaging_service_match',
        priority: 'mss_fallback'
      });
    } else {
      selected = candidates[0];
      console.log('[TENANT RESOLVE OK]', { 
        tenantKey: selected.clientKey, 
        to, 
        toE164, 
        messagingServiceSid, 
        reason: 'first_match',
        priority: 'fallback'
      });
    }

    if (candidates.length > 1) {
      console.log('[TENANT RESOLVE AMBIGUOUS]', { 
        to, 
        toE164, 
        messagingServiceSid, 
        candidates: candidates.map(c => c.clientKey),
        selected: selected.clientKey,
        phoneMatches: phoneMatches.map(c => c.clientKey),
        mssMatches: mssMatches.map(c => c.clientKey)
      });
    }

    return selected.clientKey;
  } catch (error) {
    console.log('[TENANT RESOLVE FAIL]', { to, toE164, messagingServiceSid, error: error.message });
  return null;
}
}

// Simple {{var}} template renderer for SMS bodies
function renderTemplate(str, vars = {}) {
  try {
    return String(str).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => {
      const v = vars[k];
      return (v === undefined || v === null) ? '' : String(v);
    });
  } catch { return String(str || ''); }
}

// Appointment reminder system
async function scheduleAppointmentReminders({ appointmentId, clientKey, leadPhone, appointmentTime, clientSettings }) {
  if (typeof query === 'undefined') {
    console.warn('[REMINDER] scheduleAppointmentReminders: query helper unavailable, skipping');
    return;
  }
  try {
    const settings = {
      confirmation_enabled: true,
      '24hour_enabled': true,
      '1hour_enabled': true,
      confirmation_template: "Hi! Your appointment is confirmed for {appointment_time}. We look forward to seeing you!",
      '24hour_template': "Reminder: You have an appointment tomorrow at {appointment_time}. Reply STOP to opt out.",
      '1hour_template': "Your appointment is in 1 hour at {appointment_time}. See you soon!",
      ...clientSettings
    };

    const reminders = [];

    // Immediate confirmation (if not already sent)
    if (settings.confirmation_enabled) {
      reminders.push({
        appointment_id: appointmentId,
        client_key: clientKey,
        lead_phone: leadPhone,
        appointment_time: appointmentTime,
        reminder_type: 'confirmation',
        scheduled_for: new Date(), // Send immediately
        status: 'pending'
      });
    }

    // 24-hour reminder
    if (settings['24hour_enabled']) {
      const reminder24h = new Date(appointmentTime.getTime() - 24 * 60 * 60 * 1000);
      if (reminder24h > new Date()) { // Only schedule if it's in the future
        reminders.push({
          appointment_id: appointmentId,
          client_key: clientKey,
          lead_phone: leadPhone,
          appointment_time: appointmentTime,
          reminder_type: '24hour',
          scheduled_for: reminder24h,
          status: 'pending'
        });
      }
    }

    // 1-hour reminder
    if (settings['1hour_enabled']) {
      const reminder1h = new Date(appointmentTime.getTime() - 60 * 60 * 1000);
      if (reminder1h > new Date()) { // Only schedule if it's in the future
        reminders.push({
          appointment_id: appointmentId,
          client_key: clientKey,
          lead_phone: leadPhone,
          appointment_time: appointmentTime,
          reminder_type: '1hour',
          scheduled_for: reminder1h,
          status: 'pending'
        });
      }
    }

    // Insert reminders into database
    for (const reminder of reminders) {
      await query(`
        INSERT INTO appointment_reminders 
        (appointment_id, client_key, lead_phone, appointment_time, reminder_type, scheduled_for, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        reminder.appointment_id,
        reminder.client_key,
        reminder.lead_phone,
        reminder.appointment_time,
        reminder.reminder_type,
        reminder.scheduled_for,
        reminder.status
      ]);
    }

    console.log(`Scheduled ${reminders.length} reminders for appointment ${appointmentId}`);
  } catch (error) {
    console.error('Failed to schedule reminders:', error);
    throw error;
  }
}

async function sendScheduledReminders() {
  if (typeof query === 'undefined') {
    console.warn('[REMINDER] sendScheduledReminders: query helper unavailable, skipping');
    return;
  }
  try {
    // Get pending reminders that are due
    const reminders = await query(`
      SELECT * FROM appointment_reminders 
      WHERE status = 'pending' 
      AND scheduled_for <= NOW()
      ORDER BY scheduled_for ASC
      LIMIT 50
    `);

    for (const reminder of reminders.rows) {
      try {
        await sendReminderSMS(reminder);
        
        // Mark as sent
        await query(`
          UPDATE appointment_reminders 
          SET status = 'sent', sent_at = NOW()
          WHERE id = $1
        `, [reminder.id]);
        
        console.log(`Sent ${reminder.reminder_type} reminder for appointment ${reminder.appointment_id}`);
      } catch (error) {
        console.error(`Failed to send reminder ${reminder.id}:`, error);
        
        // Mark as failed
        await query(`
          UPDATE appointment_reminders 
          SET status = 'failed', error_message = $1
          WHERE id = $2
        `, [error.message, reminder.id]);
      }
    }
  } catch (error) {
    console.error('Failed to process scheduled reminders:', error);
  }
}

async function sendReminderSMS(reminder) {
  if (typeof query === 'undefined') {
    console.warn('[REMINDER] sendReminderSMS: query helper unavailable, skipping');
    return;
  }
  try {
    // Get client settings
    const client = await query(`
      SELECT reminder_settings FROM tenants WHERE client_key = $1
    `, [reminder.client_key]);
    
    const settings = client.rows[0]?.reminder_settings || {
      confirmation_template: "Hi! Your appointment is confirmed for {appointment_time}. We look forward to seeing you!",
      '24hour_template': "Reminder: You have an appointment tomorrow at {appointment_time}. Reply STOP to opt out.",
      '1hour_template': "Your appointment is in 1 hour at {appointment_time}. See you soon!"
    };

    // Get SMS config for this client
    const clientData = await query(`
      SELECT * FROM tenants WHERE client_key = $1
    `, [reminder.client_key]);
    
    if (!clientData.rows[0]) {
      throw new Error('Client not found');
    }

    const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(clientData.rows[0]);
    
    if (!configured) {
      throw new Error('SMS not configured for client');
    }

    // Format appointment time
    const appointmentTime = new Date(reminder.appointment_time).toLocaleString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Get template based on reminder type
    const templateKey = `${reminder.reminder_type}_template`;
    const template = settings[templateKey] || settings.confirmation_template;
    
    // Render template
    const body = renderTemplate(template, {
      appointment_time: appointmentTime,
      lead_phone: reminder.lead_phone
    });

    // Send SMS
    const payload = { to: reminder.lead_phone, body };
    if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid;
    else if (fromNumber) payload.from = fromNumber;
    
    const result = await smsClient.messages.create(payload);
    
    // Update with SMS SID
    await query(`
      UPDATE appointment_reminders 
      SET sms_sid = $1
      WHERE id = $2
    `, [result.sid, reminder.id]);

  } catch (error) {
    console.error('Failed to send reminder SMS:', error);
    throw error;
  }
}


// === Clients (DB-backed)
async function getClientFromHeader(req) {
  const key = req.get('X-Client-Key') || null;
  if (!key) return null;
  return await getFullClient(key);
}
// Single source of truth for tenant timezone on the server.
// Use this everywhere instead of process.env.TZ / TIMEZONE directly.
function pickTimezone(client) { return resolveTenantTimezone(client, TIMEZONE); }
function pickCalendarId(client) { return client?.calendarId || GOOGLE_CALENDAR_ID; }
function smsConfig(client) {
  const messagingServiceSid = client?.sms?.messagingServiceSid || TWILIO_MESSAGING_SERVICE_SID || null;
  const fromNumber = client?.sms?.fromNumber || TWILIO_FROM_NUMBER || null;
  const smsClient = defaultSmsClient;
  const configured = !!(smsClient && (messagingServiceSid || fromNumber));
  return { messagingServiceSid, fromNumber, smsClient, configured };
}

// Expose a simple notify helper for SMS so other modules/routes can reuse Twilio
app.locals.notifySend = async ({ to, from, message, idempotencyKey }) => {
  const { smsClient, configured } = smsConfig();
  if (!configured) throw new Error('SMS not configured');
  const payload = { to, body: message };
  if (from) payload.from = from;
  return smsClient.messages.create(payload);
};


// Idempotency
const idemCache = new Map();
const IDEM_TTL_MS = 10 * 60_000;
function getCachedIdem(key) {
  const v = idemCache.get(key);
  if (!v) return null;
  if (Date.now() - v.at > IDEM_TTL_MS) { idemCache.delete(key); return null; }
  return v;
}
function setCachedIdem(key, status, body) { if (!key) return; idemCache.set(key, { at: Date.now(), status, body }); }
function deriveIdemKey(req) {
  const headerKey = req.get('Idempotency-Key');
  if (headerKey) return headerKey;
  const h = createHash('sha256').update(JSON.stringify(req.body || {})).digest('hex');
  return 'auto:' + h;
}


// Real decision maker contact research only - no fake contacts

// moved: /api/test* endpoints + /api/test/sms-status-webhook → routes/dev-test-mount.js

// UK Business Search endpoint (PUBLIC - no auth required) - WITH REAL API
// FILTERS FOR MOBILE NUMBERS ONLY BY DEFAULT
// moved: /api/uk-business-search, /api/decision-maker-contacts, /api/industry-categories → routes/company-enrichment-mount.js

// Helper function to generate realistic decision makers
function generateRealisticDecisionMakers(business, industry, targetRole) {
  const commonNames = ['John', 'Sarah', 'Michael', 'Emma', 'David', 'Lisa', 'James', 'Anna', 'Robert', 'Maria', 'Chris', 'Jennifer', 'Mark', 'Laura', 'Paul', 'Nicola'];
  const surnames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Hernandez'];
  
  const industryTitles = {
    'dentist': {
      'primary': ['Practice Owner', 'Principal Dentist', 'Clinical Director', 'Managing Partner', 'Owner', 'Manager'],
      'secondary': ['Practice Manager', 'Clinical Lead', 'Senior Dentist'],
      'gatekeeper': ['Reception Manager', 'Patient Coordinator', 'Office Manager']
    },
    'plumber': {
      'primary': ['Business Owner', 'Managing Director', 'Company Director'],
      'secondary': ['Operations Manager', 'Service Manager', 'Team Leader'],
      'gatekeeper': ['Office Manager', 'Customer Service Manager', 'Receptionist']
    },
    'restaurant': {
      'primary': ['Restaurant Owner', 'Managing Director', 'General Manager', 'Owner', 'Manager'],
      'secondary': ['Head Chef', 'Operations Manager', 'Assistant Manager'],
      'gatekeeper': ['Reception Manager', 'Host Manager', 'Customer Service Lead']
    },
    'fitness': {
      'primary': ['Gym Owner', 'Managing Director', 'Franchise Owner', 'Owner', 'Manager'],
      'secondary': ['General Manager', 'Operations Manager', 'Head Trainer'],
      'gatekeeper': ['Membership Manager', 'Reception Manager', 'Customer Service Lead']
    },
    'beauty_salon': {
      'primary': ['Salon Owner', 'Managing Director', 'Business Owner'],
      'secondary': ['Salon Manager', 'Senior Stylist', 'Operations Manager'],
      'gatekeeper': ['Reception Manager', 'Appointment Coordinator', 'Customer Service Manager']
    },
    'gardening': {
      'primary': ['Garden Owner', 'Managing Director', 'Business Owner'],
      'secondary': ['Operations Manager', 'Team Leader', 'Senior Gardener'],
      'gatekeeper': ['Office Manager', 'Customer Service Manager', 'Receptionist']
    }
  };
  
  const titles = industryTitles[industry]?.[targetRole] || ['Manager', 'Director', 'Owner'];
  const firstName = commonNames[Math.floor(Math.random() * commonNames.length)];
  const lastName = surnames[Math.floor(Math.random() * surnames.length)];
  const title = titles[Math.floor(Math.random() * titles.length)];
  
  const businessDomain = business.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.co.uk';
  const personalEmail = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${businessDomain}`;
  
  const areaCodes = ['20', '161', '121', '113', '141', '131', '151', '117', '191', '114'];
  const areaCode = areaCodes[Math.floor(Math.random() * areaCodes.length)];
  const number = Math.floor(Math.random() * 9000000) + 1000000;
  const directPhone = `+44 ${areaCode} ${number}`;
  
  return {
    primary: [
      {
        type: "email",
        value: personalEmail,
        confidence: 0.85,
        source: "realistic_generation",
        title: title,
        name: `${firstName} ${lastName}`
      },
      {
        type: "phone",
        value: directPhone,
        confidence: 0.8,
        source: "realistic_generation",
        title: title,
        name: `${firstName} ${lastName}`
      }
    ],
    secondary: [
      {
        type: "email",
        value: `manager@${businessDomain}`,
        confidence: 0.7,
        source: "realistic_generation",
        title: "Manager",
        name: "Manager"
      }
    ],
    gatekeeper: [
      {
        type: "email",
        value: `info@${businessDomain}`,
        confidence: 0.9,
        source: "realistic_generation",
        title: "General Contact",
        name: "General Contact"
      }
    ]
  };
}

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

// Add caching middleware to frequently accessed endpoints
app.use('/api/stats', cacheMiddleware({ ttl: 60000 })); // 1 minute cache
app.use('/api/analytics', cacheMiddleware({ ttl: 300000 })); // 5 minute cache
// moved: GET /api/clients/:key response caching → routes/clients-api.js (cacheMiddleware on /:key)

app.use(vapiWebhooks);

// Helper functions

// Helpers for hours/closures
function asJson(val, fallback) {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(String(val)); } catch { return fallback; }
}
function hoursFor(client) {
  return asJson(client?.booking?.hours, null)
      || asJson(client?.hoursJson, null)
      || { mon:['09:00-17:00'], tue:['09:00-17:00'], wed:['09:00-17:00'], thu:['09:00-17:00'], fri:['09:00-17:00'] };
}

// moved: /api/calendar/find-slots → routes/calendar-api.js

// Retry helper
async function withRetry(fn, { retries = 2, delayMs = 250 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      const status = e?.response?.status || e?.code || e?.status || 0;
      const retriable = (status === 429) || (status >= 500) || !status;
      if (!retriable || i === retries) throw e;
      await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}

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

// Booking (auto-book + branded SMS)
// Helper to check if a client is a demo client
function isDemoClient(client) {
  if (!client) return false;
  const clientKey = client.clientKey || '';
  // Check if client key starts with "demo-" or matches demo patterns
  if (clientKey.startsWith('demo-') || clientKey.includes('-demo')) return true;
  // Check if client has demo flag
  if (client.isDemo === true || client.demo === true) return true;
  // Check if client key is in demo list (including our specific demo clients)
  const demoKeys = ['demo-client', 'demo_client', 'stay-focused-fitness-chris'];
  if (demoKeys.includes(clientKey.toLowerCase())) return true;
  return false;
}

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
function calculateCacheHitRate(tenantKey) {
  // This is a simplified calculation - in production you'd want more sophisticated tracking
  const tenantCacheKeys = Array.from(cache.keys()).filter(key => key.includes(tenantKey));
  return tenantCacheKeys.length > 0 ? Math.min(95, tenantCacheKeys.length * 10) : 0; // Mock calculation
}

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
function startReminders() {
  // Disabled to prevent crashes
  console.log('[REMINDERS] Reminder system disabled');
}

// startReminders(); // Disabled to prevent crashes



// === Google Sheets ledger helper ===
async function appendToSheet({ spreadsheetId, sheetName, values }) {
  try {
    const { google } = await import('googleapis');
    const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [values] }
    });
  } catch (err) {
    console.warn('appendToSheet failed', err?.response?.data || String(err));
  }
}



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
registerMainHttpRoutes.demoSetupAndErrorHandler(app, { demoSetupRouter, errorHandler });

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
  getActiveRequests: () => activeRequests,
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
    isShuttingDown = true;
    await closeDatabase();
  },
});

startServer();
