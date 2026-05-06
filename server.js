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
import compression from 'compression';
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
import { createCallWithKey as vapiCreateCallWithKey } from './lib/vapi.js';
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
import {
  registerHealthMonitoringAndIntakeRouters,
  registerProbesNotifyMetaRouters,
} from './app/register-http-routes.js';
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
// Real API integration - dynamic imports will be used in endpoints

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
app.use(backendStatusRouter);

// Query perf, rate-limit, analytics, active-indicator, performance/stats, cache → routes/ops.js
app.use(opsRouter);

// moved: /api/admin/clients/* → routes/admin-multi-client.js

// moved: /api/reports/* → routes/reports.js

// moved: /api/sms/templates* → routes/sms-templates.js

// moved: /api/monitoring/(dashboard|client-usage|performance-trends) → routes/monitoring-dashboard.js

// moved: /api-docs → routes/api-docs.js

// moved: /api/(sms-delivery-rate|calendar-sync|quality-metrics) → routes/quick-win-metrics.js


// moved: /api/health/comprehensive, /api/call-status, /health/lb → routes/health-and-diagnostics.js

// --- Tenant header normalizer ---
app.use((req, _res, next) => {
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
});

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
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

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
registerHealthMonitoringAndIntakeRouters(app, {
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

registerProbesNotifyMetaRouters(app, {
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
app.use(
  '/api/leads',
  createLeadsFollowupsRouter({
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
  })
);
// moved: /api/leads/recall, /api/leads/nudge, /api/leads/:id → routes/leads-followups.js

// Retry processor - runs every 5 minutes to process pending retries

// Start processors with cron jobs (better than setInterval for production)
// These will be scheduled in the cron section below

// moved: /admin/vapi/cold-call-assistant and /tools/* → routes/admin-vapi-campaigns-mount.js and routes/tools-mount.js

// Helper function to run logistics outreach
async function runLogisticsOutreach({ assistantId, businesses, tenantKey, vapiKey }) {
  if (!vapiKey) {
    throw new Error('VAPI API key not configured');
  }

  const results = [];
  const batchSize = 3; // Process 3 calls at a time
  
  for (let i = 0; i < businesses.length; i += batchSize) {
    const batch = businesses.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (business, index) => {
      try {
        // Add staggered delay within batch
        await new Promise(resolve => setTimeout(resolve, index * 2000));
        
        const callData = {
          assistantId,
          customer: {
            number: business.phone,
            name: business.name || 'Business'
          },
          metadata: {
            tenantKey,
            leadPhone: business.phone,
            businessName: business.name,
            businessAddress: business.address,
            businessWebsite: business.website,
            decisionMaker: business.decisionMaker,
            callTime: new Date().toISOString(),
            priority: i + index + 1
          }
        };

        try {
          const callResult = await vapiCreateCallWithKey({ vapiKey, callData });
          results.push({
            businessName: business.name,
            phone: business.phone,
            status: 'call_initiated',
            callId: callResult.id,
            priority: i + index + 1,
            message: 'Call initiated successfully'
          });
          
          console.log(`[LOGISTICS CALL] Initiated for ${business.name} (${business.phone})`);
        } catch (error) {
          results.push({
            businessName: business.name,
            phone: business.phone,
            status: 'call_failed',
            error: error?.vapi?.message || error?.message || 'Unknown error',
            message: 'Failed to initiate call'
          });
          
          console.error(`[LOGISTICS CALL ERROR] Failed to call ${business.name}:`, error?.vapi || error);
        }
        
      } catch (error) {
        results.push({
          businessName: business.name,
          phone: business.phone,
          status: 'call_failed',
          error: error.message,
          message: 'Call failed due to error'
        });
        
        console.error(`[LOGISTICS CALL ERROR] Error calling ${business.name}:`, error.message);
      }
    });
    
    await Promise.all(batchPromises);
    
    // Delay between batches
    if (i + batchSize < businesses.length) {
      console.log(`[LOGISTICS OUTREACH] Batch ${Math.floor(i/batchSize) + 1} completed. Waiting 5s before next batch.`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  return results;
}

// moved: /admin/vapi/logistics-* → routes/admin-vapi-logistics-mount.js

// moved: /admin/vapi/cold-call-campaign → routes/admin-vapi-campaigns-mount.js

// Start cold call campaign with advanced optimization
async function startColdCallCampaign(campaign) {
  const results = [];
  
  try {
    console.log(`[COLD CALL CAMPAIGN] Starting optimized campaign ${campaign.id} with ${campaign.businesses.length} businesses`);
    
    // Sort businesses by priority (decision maker available, website, etc.)
    const prioritizedBusinesses = campaign.businesses.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;
      
      // Prioritize businesses with decision maker info
      if (a.decisionMaker?.name) scoreA += 10;
      if (b.decisionMaker?.name) scoreB += 10;
      
      // Prioritize businesses with websites
      if (a.website) scoreA += 5;
      if (b.website) scoreB += 5;
      
      // Prioritize businesses with email addresses
      if (a.email) scoreA += 3;
      if (b.email) scoreB += 3;
      
      return scoreB - scoreA;
    });
    
    // Process businesses in optimized batches
    const batchSize = 3; // Smaller batches for better quality
    for (let i = 0; i < prioritizedBusinesses.length; i += batchSize) {
      const batch = prioritizedBusinesses.slice(i, i + batchSize);
      
      // Process batch with intelligent timing
      const batchPromises = batch.map(async (business, index) => {
        try {
          // Add staggered delay within batch
          await new Promise(resolve => setTimeout(resolve, index * 1000));
          
          // Enhanced call data with decision maker context
          const callData = {
            assistantId: campaign.assistantId,
            customer: {
              number: business.phone,
              name: business.decisionMaker?.name || business.name
            },
            metadata: {
              businessId: business.id,
              businessName: business.name,
              businessAddress: business.address,
              businessWebsite: business.website,
              businessEmail: business.email,
              decisionMaker: business.decisionMaker,
              campaignId: campaign.id,
              priority: i + index + 1,
              callTime: new Date().toISOString()
            },
            // Add context for better personalization
            context: {
              practiceName: business.name,
              location: business.address,
              decisionMakerName: business.decisionMaker?.name,
              decisionMakerRole: business.decisionMaker?.role,
              website: business.website
            }
          };

          // Make the call via VAPI
          try {
            const callRes = await vapiCreateCallWithKey({ vapiKey, callData });
            results.push({
              businessId: business.id,
              businessName: business.name,
              phone: business.phone,
              decisionMaker: business.decisionMaker,
              status: 'call_initiated',
              callId: callRes.id,
              priority: i + index + 1,
              message: 'Call initiated successfully',
              timestamp: new Date().toISOString()
            });
            
            console.log(`[COLD CALL] Call initiated for ${business.name} (${business.phone}) - Priority: ${i + index + 1}`);
          } catch (error) {
            results.push({
              businessId: business.id,
              businessName: business.name,
              phone: business.phone,
              status: 'call_failed',
              error: error?.vapi?.message || error?.message || 'Unknown error',
              message: 'Failed to initiate call',
              timestamp: new Date().toISOString()
            });
            
            console.error(`[COLD CALL ERROR] Failed to call ${business.name}:`, error?.vapi || error);
          }
          
        } catch (error) {
          results.push({
            businessId: business.id,
            businessName: business.name,
            phone: business.phone,
            status: 'call_failed',
            error: error.message,
            message: 'Call failed due to error',
            timestamp: new Date().toISOString()
          });
          
          console.error(`[COLD CALL ERROR] Error calling ${business.name}:`, error.message);
        }
      });
      
      // Wait for batch to complete
      await Promise.all(batchPromises);
      
      // Intelligent delay between batches based on success rate
      const successRate = results.filter(r => r.status === 'call_initiated').length / results.length;
      const delay = successRate > 0.8 ? 3000 : 5000; // Shorter delay if high success rate
      
      if (i + batchSize < prioritizedBusinesses.length) {
        console.log(`[COLD CALL CAMPAIGN] Batch ${Math.floor(i/batchSize) + 1} completed. Success rate: ${(successRate * 100).toFixed(1)}%. Waiting ${delay}ms before next batch.`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    console.log(`[COLD CALL CAMPAIGN] Completed optimized campaign ${campaign.id}. Results:`, results.length);
    
  } catch (error) {
    console.error(`[COLD CALL CAMPAIGN ERROR]`, error.message);
  }
  
  return results;
}

// A/B Testing for Cold Call Scripts
// moved: /admin/vapi/ab-test-assistant → routes/admin-vapi-campaigns-mount.js

// Lead Scoring and Qualification System
// moved: /admin/vapi/lead-scoring → routes/admin-vapi-campaigns-mount.js

// Get optimal calling time based on business data
function getOptimalCallTime(business) {
  // Analyze business name and location for optimal timing
  const name = business.name.toLowerCase();
  const address = business.address?.toLowerCase() || '';
  
  // Dental practices typically best called 9-10 AM or 2-3 PM
  if (name.includes('dental') || name.includes('dentist')) {
    return '09:00-10:00 or 14:00-15:00';
  }
  
  // Law firms prefer morning calls
  if (name.includes('law') || name.includes('legal')) {
    return '09:00-11:00';
  }
  
  // Beauty salons prefer afternoon
  if (name.includes('beauty') || name.includes('salon')) {
    return '14:00-16:00';
  }
  
  // Default optimal times
  return '09:00-10:00 or 14:00-15:00';
}

// Advanced Analytics and Optimization
// moved: /admin/vapi/campaign-analytics/:campaignId → routes/admin-vapi-campaigns-mount.js

// Multi-Channel Follow-up System
// moved: /admin/vapi/follow-up-sequence → routes/admin-vapi-campaigns-mount.js

// Generate follow-up plan based on call outcome
function generateFollowUpPlan(call) {
  const outcomes = {
    'voicemail': 'Email immediately, retry call in 2 hours',
    'interested': 'Send demo confirmation email and calendar invite',
    'objection': 'Send objection handling email, follow-up call in 3 days',
    'not_interested': 'Send case study email, follow-up call in 1 week',
    'no_answer': 'Retry call at different time, send email',
    'busy': 'Send email, retry call next day'
  };
  
  return outcomes[call.outcome] || 'Standard follow-up sequence';
}

// Generate voicemail follow-up email
function generateVoicemailFollowUpEmail(call) {
  return {
    subject: `Hi ${call.decisionMaker?.name || 'there'}, following up on my call about our premium £500/month booking service`,
    body: `Hi ${call.decisionMaker?.name || 'there'},

I left you a voicemail earlier about helping ${call.businessName} increase appointment bookings by 300% with our premium £500/month service.

I wanted to follow up with some quick information:

✅ We've helped 500+ dental practices increase bookings
✅ Our AI handles calls 24/7, never misses a patient  
✅ Automatically books appointments in your calendar
✅ Premium service includes dedicated account manager
✅ Most practices see 20-30 extra bookings per month worth £10,000-15,000
✅ ROI typically achieved within 30 days

Our premium service pays for itself with just 2-3 extra bookings per month. Most practices see 20-30 extra bookings monthly.

Would you be available for a quick 15-minute demo this week? I can show you exactly how this works and the ROI you can expect.

Best regards,
Sarah
AI Booking Solutions

P.S. If you're not the right person, could you please forward this to the practice owner or manager?`
  };
}

// Generate demo confirmation email
function generateDemoConfirmationEmail(call) {
  return {
    subject: `Demo confirmed - How to increase ${call.businessName} bookings by 300% with our premium £500/month service`,
    body: `Hi ${call.decisionMaker?.name},

Great speaking with you! I'm excited to show you how we can help ${call.businessName} increase bookings by 300% with our premium £500/month service.

Demo Details:
📅 Date: [To be confirmed]
⏰ Duration: 15 minutes
🎯 Focus: How our premium AI service can handle your patient calls 24/7
💰 Investment: £500/month (typically pays for itself with 2-3 extra bookings)

What you'll see:
• Live demo of our premium AI booking system
• How it integrates with your calendar
• Real results from similar practices (20-30 extra bookings monthly)
• Custom setup for your practice
• Dedicated account manager benefits
• ROI calculations and projections

Our premium service typically generates £10,000-15,000 in additional revenue monthly for practices like yours.

I'll send you a calendar invite shortly. Looking forward to showing you how this can transform your practice!

Best regards,
Sarah
AI Booking Solutions`
  };
}

// Generate objection handling email
function generateObjectionHandlingEmail(call) {
  return {
    subject: `Addressing your concerns about our premium £500/month AI booking service for ${call.businessName}`,
    body: `Hi ${call.decisionMaker?.name},

I understand your concerns about [objection]. Let me address this directly:

[OBJECTION-SPECIFIC CONTENT]

But here's what I want you to know about our premium £500/month service:
• We've helped 500+ practices overcome these same concerns
• Most practices see ROI within 30 days
• Our premium service pays for itself with just 2-3 extra bookings per month
• Most practices see 20-30 extra bookings worth £10,000-15,000 monthly
• We offer a 30-day money-back guarantee
• Setup takes less than 30 minutes
• Includes dedicated account manager and priority support

The numbers speak for themselves: £500 investment typically generates £10,000-15,000 in additional revenue monthly.

I'd love to show you a quick 15-minute demo to address your specific concerns and show you the ROI calculations. Would you be available this week?

Best regards,
Sarah
AI Booking Solutions`
  };
}

// Dynamic Script Personalization System
// moved: /admin/vapi/personalized-assistant → routes/admin-vapi-campaigns-mount.js

// Generate personalized script based on business data
function generatePersonalizedScript(business, industry, region) {
  const businessName = business.name;
  const decisionMaker = business.decisionMaker?.name || 'there';
  const location = business.address || business.city || business.region || '';
  const regionHint = region || business.region || location;
  const website = business.website ? `I noticed on ${business.website} that` : '';
  
  const services = Array.isArray(business.services)
    ? business.services
    : typeof business.services === 'string'
      ? business.services.split(',').map(s => s.trim()).filter(Boolean)
      : [];
  const servicesSummary = services.length
    ? services.slice(0, 2).join(' & ')
    : null;
  const primaryService = services.length ? services[0] : 'appointments';
  const bookingLink = business.bookingLink || business.bookingUrl || null;
  
  // Industry-specific personalization
  const industryContext = getIndustryContext(industry);
  
  // Regional personalization
  const regionalContext = getRegionalContext(regionHint || location);

  const introWebsiteLine = website
    ? `${website} you offer ${servicesSummary || primaryService}. `
    : '';
  const serviceHook = servicesSummary
    ? ` enquiries for ${servicesSummary}`
    : ` new enquiries`;
  
  const firstMessage = `Hi ${decisionMaker}, this is Sarah from AI Booking Solutions. We've helped ${industryContext.examplePractice} in ${regionalContext.city} capture more ${industryContext.metric} automatically. ${introWebsiteLine}Do you have 90 seconds to see how this could handle ${serviceHook} at ${businessName}?`;
  
  const systemMessage = `You are Sarah, calling ${decisionMaker} at ${businessName} in ${regionalContext.city}.

BUSINESS CONTEXT:
- Practice: ${businessName}
- Location: ${location}
- Decision Maker: ${decisionMaker}
- Industry: ${industry}
- Website: ${business.website || 'Not available'}
- Services: ${servicesSummary || primaryService}
- Booking Link: ${bookingLink || 'Not configured'}

INDUSTRY-SPECIFIC INSIGHTS:
${industryContext.insights}

REGIONAL CONTEXT:
${regionalContext.insights}

PERSONALIZATION RULES:
- Use ${decisionMaker}'s name frequently
- Reference ${businessName} specifically
- Mention ${regionalContext.city} when relevant
- Use ${industryContext.language} appropriate for ${industry}
- Reference ${industryContext.painPoints} as pain points
- Use ${regionalContext.examples} as local examples
- Highlight services such as ${servicesSummary || primaryService}
- Offer to text the booking link if interest is shown${bookingLink ? ` (link: ${bookingLink})` : ''}

CONVERSATION FLOW:
1. RAPPORT: "Hi ${decisionMaker}, this is Sarah from AI Booking Solutions"
2. CONTEXT: "We've helped ${industryContext.examplePractice} in ${regionalContext.city} increase ${industryContext.metric} by 300%"
3. PERSONAL: "${servicesSummary ? `I noticed you focus on ${servicesSummary}. ` : ''}Do you have 90 seconds to hear how this could work for ${businessName}?"
4. QUALIFY: "Are you the owner or manager of ${businessName}?"
5. PAIN: "What's your biggest challenge with ${industryContext.metric} at ${businessName}?"
6. VALUE: "We help practices like ${businessName} increase ${industryContext.metric} by 300%"
7. CLOSE: "Would you be available for a 15-minute demo to see how this could work for ${businessName}?${bookingLink ? ` I can also text over the booking link (${bookingLink}) if that's easier.` : ''}"

OBJECTION HANDLING:
- Too expensive: "What's the cost of losing patients at ${businessName}? Our service pays for itself with 2-3 extra bookings per month"
- Too busy: "That's exactly why ${businessName} needs this - it saves you time by handling bookings automatically"
- Not interested: "I understand. Can I send you a case study showing how we helped ${industryContext.examplePractice} increase bookings by 300%?"

RULES:
- Always use ${decisionMaker}'s name
- Always reference ${businessName}
- Keep calls under 3 minutes
- Focus on ${industryContext.painPoints}
- Use ${regionalContext.examples} for social proof`;
  
  return {
    firstMessage,
    systemMessage,
    personalization: {
      businessName,
      decisionMaker,
      industry,
      region: regionalContext.city,
      website: !!business.website
    }
  };
}

// Get industry-specific context
function getIndustryContext(industry) {
  const normalized = String(industry || '').toLowerCase().replace(/\s+/g, '_');
  
  const contexts = {
    dentist: {
      examplePractice: 'Birmingham Dental Care',
      language: 'professional medical',
      painPoints: 'missed calls, no-shows, scheduling gaps, treatment plan follow-ups',
      insights: 'Dental practices typically lose 4-5 patients monthly from missed calls. Most practices see 15-20 extra bookings per month with our system.',
      metric: 'dental appointments'
    },
    dental_practice: null,
    dental: null,
    orthodontics: {
      examplePractice: 'Leeds Orthodontic Studio',
      language: 'professional medical',
      painPoints: 'consult requests left waiting, financing questions, treatment plan follow-up',
      insights: 'Orthodontic teams often juggle new consults with existing patients. Automating follow-up adds 10-15 new starts per month.',
      metric: 'consultations and treatment starts'
    },
    lawyer: {
      examplePractice: 'Manchester Legal Associates',
      language: 'professional legal',
      painPoints: 'missed consultations, case intake, client communication',
      insights: 'Law firms typically lose 3-4 consultations monthly from missed calls. Most firms see 12-18 extra consultations per month with our system.',
      metric: 'consultations'
    },
    legal: null,
    law_firm: null,
    beauty_salon: {
      examplePractice: 'London Beauty Studio',
      language: 'friendly professional',
      painPoints: 'missed appointments, no-shows, last-minute cancellations',
      insights: 'Beauty salons typically lose 6-8 appointments monthly from missed calls. Most salons see 20-25 extra bookings per month with our system.',
      metric: 'beauty appointments'
    },
    salon: null,
    spa: {
      examplePractice: 'Brighton Wellness Spa',
      language: 'friendly professional',
      painPoints: 'packages not upsold, missed voicemails, therapists double-booked',
      insights: 'Spas recover 15-20 lost bookings per month once follow-up is automated.',
      metric: 'treatments and packages'
    },
    veterinary: {
      examplePractice: 'Northside Veterinary Clinic',
      language: 'warm clinical',
      painPoints: 'emergency enquiries, follow-ups, surgery scheduling',
      insights: 'Vets often miss urgent calls after hours. Our system rebooks 10-15 pet appointments monthly.',
      metric: 'pet appointments'
    },
    vet: null,
    fitness: {
      examplePractice: 'Total Performance PT Studio',
      language: 'energetic professional',
      painPoints: 'trial sign-ups, intro calls, class bookings, no-shows',
      insights: 'Studios see 20-30% more trial conversions when leads get a fast callback.',
      metric: 'fitness consultations and sessions'
    },
    gym: null,
    personal_training: null,
    physiotherapy: {
      examplePractice: 'Manchester Physio Clinic',
      language: 'professional clinical',
      painPoints: 'treatment plan adherence, initial assessments, cancellations',
      insights: 'Physio clinics recover 8-12 treatment bookings monthly with persistent follow-up.',
      metric: 'treatment sessions'
    },
    chiropractic: {
      examplePractice: 'Bristol Chiropractic Centre',
      language: 'professional clinical',
      painPoints: 'initial consults, care plan enrolments, missed voicemails',
      insights: 'Chiropractors close 12-15 extra care plans each month when every lead is called back within 5 minutes.',
      metric: 'consults and care plans'
    },
    accountant: {
      examplePractice: 'Leeds Tax Advisors',
      language: 'trusted advisor',
      painPoints: 'tax season enquiries, consultation scheduling, document collection',
      insights: 'Accountancy firms convert 10-12 extra consultations per month by tightening follow-up during busy seasons.',
      metric: 'consultations'
    },
    accounting: null,
    finance: {
      examplePractice: 'City Financial Planning',
      language: 'trusted advisor',
      painPoints: 'initial discovery calls, onboarding paperwork, follow-ups',
      insights: 'Financial planners close 3-5 additional clients monthly when no new enquiry waits longer than 5 minutes.',
      metric: 'financial consultations'
    },
    medspa: {
      examplePractice: 'Chelsea Aesthetics',
      language: 'luxury professional',
      painPoints: 'cosmetic consults, treatment upsells, membership plans',
      insights: 'Medspas add 12-18 high-ticket procedures monthly when leads get immediate callbacks.',
      metric: 'aesthetic consultations'
    },
    tattoo: {
      examplePractice: 'Ink Lab London',
      language: 'creative professional',
      painPoints: 'design consultations, deposit collection, scheduling',
      insights: 'Studios recover 10+ bookings per month by chasing enquiries automatically.',
      metric: 'tattoo consultations'
    }
  };
  
  const normalizedKey = (() => {
    if (contexts[normalized]) return normalized;
    if (normalized.includes('dent')) return 'dentist';
    if (normalized.includes('law')) return 'lawyer';
    if (normalized.includes('beauty') || normalized.includes('salon')) return 'beauty_salon';
    if (normalized.includes('vet')) return 'veterinary';
    if (normalized.includes('fit') || normalized.includes('gym') || normalized.includes('pt')) return 'fitness';
    if (normalized.includes('physio')) return 'physiotherapy';
    if (normalized.includes('chiro')) return 'chiropractic';
    if (normalized.includes('account')) return 'accountant';
    if (normalized.includes('finance')) return 'finance';
    if (normalized.includes('spa')) return 'spa';
    if (normalized.includes('tattoo') || normalized.includes('ink')) return 'tattoo';
    return 'dentist';
  })();
  
  const selected = contexts[normalizedKey];
  if (selected) {
    return {
      examplePractice: selected.examplePractice,
      language: selected.language,
      painPoints: selected.painPoints,
      insights: selected.insights,
      metric: selected.metric || 'appointments'
    };
  }
  
  return {
    examplePractice: 'Local Practice',
    language: 'professional and friendly',
    painPoints: 'missed calls, slow follow-up, manual scheduling',
    insights: 'Businesses typically lose 5-10 opportunities monthly from slow follow-up. Most see 25% more bookings with our system.',
    metric: 'appointments'
  };
}

// Get regional context
function getRegionalContext(location) {
  const locationLower = location.toLowerCase();
  
  if (locationLower.includes('london')) {
    return {
      city: 'London',
      insights: 'London practices face high competition and need every advantage. We\'ve helped 50+ London practices increase bookings.',
      examples: 'London Dental Care, Central London Practice'
    };
  } else if (locationLower.includes('manchester')) {
    return {
      city: 'Manchester',
      insights: 'Manchester practices benefit from our system\'s efficiency. We\'ve helped 30+ Manchester practices increase bookings.',
      examples: 'Manchester Dental Group, Northern Practice'
    };
  } else if (locationLower.includes('birmingham')) {
    return {
      city: 'Birmingham',
      insights: 'Birmingham practices see great results with our system. We\'ve helped 25+ Birmingham practices increase bookings.',
      examples: 'Birmingham Dental Care, Midlands Practice'
    };
  } else {
    return {
      city: 'your area',
      insights: 'Practices in your area benefit from our system\'s efficiency. We\'ve helped hundreds of UK practices increase bookings.',
      examples: 'local practices, similar businesses'
    };
  }
}

// moved: /admin/vapi/test-connection, /admin/vapi/test-call, /admin/vapi/assistants, /admin/vapi/phone-numbers, /admin/vapi/calls → routes/admin-vapi-plumbing-mount.js

// moved: /api/onboard-client → routes/client-ops-mount.js

/** Tenant keys allowed to use dashboard A/B setup without API key (override with DASHBOARD_SELF_SERVICE_CLIENT_KEYS). */
function getDashboardSelfServiceClientKeys() {
  const e = process.env.DASHBOARD_SELF_SERVICE_CLIENT_KEYS;
  if (e === undefined) {
    // Default: primary outreach tenant can use A/B setup without API key.
    return ['d2d-xpress-tom'];
  }
  return String(e)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
function isDashboardSelfServiceClient(clientKey) {
  return getDashboardSelfServiceClientKeys().includes(clientKey);
}
const DASHBOARD_SELF_SERVICE_VAPI_AB_KEYS = new Set([
  'outboundAbVoiceExperiment',
  'outboundAbOpeningExperiment',
  'outboundAbScriptExperiment',
  'outboundAbExperiment',
  'outboundAbFocusDimension',
  'outboundAbMinSamplesPerVariant',
  'outboundAbSampleReadyEmail'
]);

function isVapiOutboundAbExperimentOnlyPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'vapi') return false;
  const v = body.vapi;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const vk = Object.keys(v);
  if (vk.length === 0) return false;
  for (const k of vk) {
    if (!DASHBOARD_SELF_SERVICE_VAPI_AB_KEYS.has(k)) return false;
    const val = v[k];
    if (val !== null && val !== undefined && typeof val !== 'string') return false;
  }
  return true;
}

// moved: PATCH /api/clients/:clientKey/config → routes/client-ops-mount.js

/** Shared create path for outbound A/B (dimension + variants + optional experiment name — auto-generated if blank). */
async function runOutboundAbTestSetup(clientKey, body, res) {
  try {
    const { isOutboundAbReviewPending, OUTBOUND_AB_REVIEW_PENDING_MESSAGE } = await import(
      './lib/outbound-ab-review-lock.js'
    );
    invalidateClientCache(clientKey);
    const lockClient = await getFullClient(clientKey);
    if (isOutboundAbReviewPending(lockClient?.vapi)) {
      res.status(423).json({ ok: false, error: OUTBOUND_AB_REVIEW_PENDING_MESSAGE });
      return;
    }
    const { OUTBOUND_AB_VAPI_KEYS } = await import('./lib/outbound-ab-variant.js');
    const { experimentName, variants, replaceExisting = true, dimension } = body || {};
    const dimRaw = dimension != null ? String(dimension).trim().toLowerCase() : '';
    if (dimRaw !== 'voice' && dimRaw !== 'opening' && dimRaw !== 'script') {
      res.status(400).json({
        ok: false,
        error: 'dimension is required: "voice", "opening", or "script"'
      });
      return;
    }
    const validateVoiceIdForAb =
      dimRaw === 'voice'
        ? (await import('./lib/elevenlabs-voice-id.js')).validateElevenLabsVoiceIdForAb
        : null;
    let nameTrim = experimentName != null ? String(experimentName).trim() : '';
    if (!nameTrim) {
      const slug = String(clientKey)
        .replace(/[^a-z0-9_-]+/gi, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 24);
      nameTrim = `ab_${slug || 'tenant'}_${nanoid(10)}`;
    }
    if (!Array.isArray(variants) || variants.length < 1) {
      res.status(400).json({ ok: false, error: 'At least one variant is required' });
      return;
    }
    let variantsList = [...variants];
    if (variantsList.length === 1) {
      const { resolveOutboundAbBaselineForDimension } = await import('./lib/outbound-ab-baseline.js');
      const baseline = await resolveOutboundAbBaselineForDimension(clientKey, lockClient, dimRaw, {
        excludeSameDimensionExperiment: true
      });
      const u = variantsList[0];
      if (dimRaw === 'voice') {
        let ch = u.voice != null ? String(u.voice).trim() : '';
        if (!ch) {
          res.status(400).json({ ok: false, error: 'Challenger voice is empty' });
          return;
        }
        const voiceCheck = validateVoiceIdForAb(ch);
        if (!voiceCheck.ok) {
          res.status(400).json({ ok: false, error: voiceCheck.error });
          return;
        }
        ch = voiceCheck.id;
        if (baseline && ch === baseline) {
          res.status(400).json({
            ok: false,
            error: 'New voice matches your current live assistant voice. Use a different voice ID for the test.'
          });
          return;
        }
        variantsList = [{ name: 'control' }, { name: 'variant_b', voice: ch }];
      } else if (dimRaw === 'opening') {
        const ch = u.firstMessage != null ? String(u.firstMessage).trim() : '';
        if (!ch) {
          res.status(400).json({ ok: false, error: 'Challenger opening line is empty' });
          return;
        }
        if (baseline && ch === baseline) {
          res.status(400).json({
            ok: false,
            error: 'Opening line matches your current live assistant line. Change the uploaded text to run a test.'
          });
          return;
        }
        variantsList = [{ name: 'control' }, { name: 'variant_b', firstMessage: ch }];
      } else {
        const ch =
          u.script != null
            ? String(u.script).trim()
            : u.systemMessage != null
              ? String(u.systemMessage).trim()
              : '';
        if (!ch) {
          res.status(400).json({ ok: false, error: 'Challenger script is empty' });
          return;
        }
        if (baseline && ch === baseline) {
          res.status(400).json({
            ok: false,
            error: 'Script matches your current live assistant script. Change the uploaded script to run a test.'
          });
          return;
        }
        variantsList = [{ name: 'control' }, { name: 'variant_b', script: ch }];
      }
    }
    if (variantsList.length < 2) {
      res.status(400).json({ ok: false, error: 'At least two variants are required' });
      return;
    }
    const mapped = [];
    for (const v of variantsList) {
      const vn = String(v.name || v.variantName || '').trim();
      if (!vn) {
        res.status(400).json({ ok: false, error: 'Each variant needs a name' });
        return;
      }
      const isControlArm = vn.toLowerCase() === 'control';
      const voice = v.voice != null ? String(v.voice).trim() : '';
      const firstMessage = v.firstMessage != null ? String(v.firstMessage).trim() : '';
      const script =
        v.script != null
          ? String(v.script).trim()
          : v.systemMessage != null
            ? String(v.systemMessage).trim()
            : '';
      const config = {};
      if (dimRaw === 'voice') {
        if (isControlArm) {
          mapped.push({ name: vn, config: {} });
          continue;
        }
        if (!voice) {
          res.status(400).json({
            ok: false,
            error: `Variant "${vn}": voice experiments require a non-empty voice ID per variant`
          });
          return;
        }
        const voiceCheck = validateVoiceIdForAb(voice);
        if (!voiceCheck.ok) {
          res.status(400).json({ ok: false, error: voiceCheck.error });
          return;
        }
        config.voice = voiceCheck.id;
      } else if (dimRaw === 'opening') {
        if (isControlArm) {
          mapped.push({ name: vn, config: {} });
          continue;
        }
        if (!firstMessage) {
          res.status(400).json({
            ok: false,
            error: `Variant "${vn}": opening-line experiments require a non-empty opening line per variant`
          });
          return;
        }
        config.firstMessage = firstMessage;
      } else {
        if (isControlArm) {
          mapped.push({ name: vn, config: {} });
          continue;
        }
        if (!script) {
          res.status(400).json({
            ok: false,
            error: `Variant "${vn}": script experiments require non-empty script (system instructions) per variant`
          });
          return;
        }
        config.script = script;
      }
      mapped.push({ name: vn, config });
    }
    if (replaceExisting) {
      const { deactivateAbTestExperimentsByName } = await import('./db.js');
      const vapiKeyForDim = OUTBOUND_AB_VAPI_KEYS[dimRaw];
      const prevExp =
        lockClient?.vapi && typeof lockClient.vapi === 'object'
          ? String(lockClient.vapi[vapiKeyForDim] || '').trim()
          : '';
      if (prevExp && prevExp !== nameTrim) {
        await deactivateAbTestExperimentsByName(clientKey, prevExp);
      }
      await deactivateAbTestExperimentsByName(clientKey, nameTrim);
    }
    await createABTestExperiment({
      clientKey,
      experimentName: nameTrim,
      variants: mapped,
      isActive: true
    });
    const vapiKey = OUTBOUND_AB_VAPI_KEYS[dimRaw];
    const { updateClientConfig } = await import('./lib/client-onboarding.js');
    await updateClientConfig(clientKey, {
      vapi: { [vapiKey]: nameTrim, outboundAbFocusDimension: dimRaw }
    });
    const { getOutboundAbExperimentSummary } = await import('./db.js');
    const { enrichOutboundAbDashboardSummariesFromAssistant } = await import(
      './lib/outbound-ab-dashboard-enrich.js'
    );
    const summaryClient = await getFullClient(clientKey, { bypassCache: true });
    let voiceSummary = null;
    let openingSummary = null;
    let scriptSummary = null;
    if (dimRaw === 'voice') {
      voiceSummary = await getOutboundAbExperimentSummary(clientKey, nameTrim);
    } else if (dimRaw === 'opening') {
      openingSummary = await getOutboundAbExperimentSummary(clientKey, nameTrim);
    } else {
      scriptSummary = await getOutboundAbExperimentSummary(clientKey, nameTrim);
    }
    if (summaryClient) {
      await enrichOutboundAbDashboardSummariesFromAssistant(
        summaryClient,
        { voiceSummary, openingSummary, scriptSummary, legacyOutboundAbSummary: null },
        {}
      );
    }
    const slotSummary =
      dimRaw === 'voice' ? voiceSummary : dimRaw === 'opening' ? openingSummary : scriptSummary;
    res.json({
      ok: true,
      experimentName: nameTrim,
      dimension: dimRaw,
      vapiKey,
      variantCount: mapped.length,
      outboundAbFocusDimension: dimRaw,
      slotSummary
    });
  } catch (error) {
    console.error('[OUTBOUND AB TEST SETUP ERROR]', error);
    res.status(500).json({ ok: false, error: error.message || String(error) });
  }
}

/** Update challenger variant_config in place (same experiment row ids — assignments stay valid). */
async function runOutboundAbChallengerUpdate(clientKey, body, res) {
  try {
    const { isOutboundAbReviewPending, OUTBOUND_AB_REVIEW_PENDING_MESSAGE } = await import(
      './lib/outbound-ab-review-lock.js'
    );
    invalidateClientCache(clientKey);
    const lockClient = await getFullClient(clientKey);
    if (isOutboundAbReviewPending(lockClient?.vapi)) {
      res.status(423).json({ ok: false, error: OUTBOUND_AB_REVIEW_PENDING_MESSAGE });
      return;
    }
    const { OUTBOUND_AB_VAPI_KEYS } = await import('./lib/outbound-ab-variant.js');
    const dimRaw = body?.dimension != null ? String(body.dimension).trim().toLowerCase() : '';
    if (dimRaw !== 'voice' && dimRaw !== 'opening' && dimRaw !== 'script') {
      res.status(400).json({ ok: false, error: 'dimension must be voice, opening, or script' });
      return;
    }
    const vapiKey = OUTBOUND_AB_VAPI_KEYS[dimRaw];
    const expName =
      lockClient?.vapi && typeof lockClient.vapi === 'object'
        ? String(lockClient.vapi[vapiKey] || '').trim()
        : '';
    if (!expName) {
      res.status(404).json({
        ok: false,
        error: 'No active outbound A/B experiment configured for this dimension.'
      });
      return;
    }
    const { resolveChallengerVariantNameForExperiment, updateActiveAbTestVariantConfig } = await import('./db.js');
    const challengerName = await resolveChallengerVariantNameForExperiment(clientKey, expName);
    if (!challengerName) {
      res.status(404).json({ ok: false, error: 'No challenger variant row found for this experiment.' });
      return;
    }
    let ch = '';
    if (dimRaw === 'voice') {
      ch = body.voice != null ? String(body.voice).trim() : '';
      const { validateElevenLabsVoiceIdForAb } = await import('./lib/elevenlabs-voice-id.js');
      const voiceCheck = validateElevenLabsVoiceIdForAb(ch);
      if (!voiceCheck.ok) {
        res.status(400).json({ ok: false, error: voiceCheck.error });
        return;
      }
      ch = voiceCheck.id;
    } else if (dimRaw === 'opening') {
      ch = body.firstMessage != null ? String(body.firstMessage).trim() : '';
    } else {
      ch =
        body.script != null
          ? String(body.script).trim()
          : body.systemMessage != null
            ? String(body.systemMessage).trim()
            : '';
    }
    if (!ch) {
      res.status(400).json({ ok: false, error: 'Challenger value is empty' });
      return;
    }
    const { resolveOutboundAbBaselineForDimension } = await import('./lib/outbound-ab-baseline.js');
    const baseline = await resolveOutboundAbBaselineForDimension(clientKey, lockClient, dimRaw, {
      excludeSameDimensionExperiment: true
    });
    if (baseline && ch === baseline) {
      res.status(400).json({
        ok: false,
        error: 'New value matches your live assistant for this dimension. Use a different challenger.'
      });
      return;
    }
    const config =
      dimRaw === 'voice' ? { voice: ch } : dimRaw === 'opening' ? { firstMessage: ch } : { script: ch };
    const updated = await updateActiveAbTestVariantConfig({
      clientKey,
      experimentName: expName,
      variantName: challengerName,
      variantConfig: config
    });
    if (!updated) {
      res.status(500).json({
        ok: false,
        error: 'Could not update challenger (experiment may have been deactivated).'
      });
      return;
    }
    const { getOutboundAbExperimentSummary } = await import('./db.js');
    const { enrichOutboundAbDashboardSummariesFromAssistant } = await import(
      './lib/outbound-ab-dashboard-enrich.js'
    );
    const summaryClient = await getFullClient(clientKey, { bypassCache: true });
    let voiceSummary = null;
    let openingSummary = null;
    let scriptSummary = null;
    if (dimRaw === 'voice') {
      voiceSummary = await getOutboundAbExperimentSummary(clientKey, expName);
    } else if (dimRaw === 'opening') {
      openingSummary = await getOutboundAbExperimentSummary(clientKey, expName);
    } else {
      scriptSummary = await getOutboundAbExperimentSummary(clientKey, expName);
    }
    if (summaryClient) {
      await enrichOutboundAbDashboardSummariesFromAssistant(
        summaryClient,
        { voiceSummary, openingSummary, scriptSummary, legacyOutboundAbSummary: null },
        {}
      );
    }
    const slotSummary =
      dimRaw === 'voice' ? voiceSummary : dimRaw === 'opening' ? openingSummary : scriptSummary;
    res.json({
      ok: true,
      experimentName: expName,
      dimension: dimRaw,
      variantName: challengerName,
      slotSummary
    });
  } catch (error) {
    console.error('[OUTBOUND AB CHALLENGER PATCH]', error);
    res.status(500).json({ ok: false, error: error.message || String(error) });
  }
}

/** Deactivate experiment for one dimension and clear vapi slot (+ refocus if needed). */
async function runOutboundAbDimensionStop(clientKey, dimRaw, res) {
  try {
    const { isOutboundAbReviewPending, OUTBOUND_AB_REVIEW_PENDING_MESSAGE } = await import(
      './lib/outbound-ab-review-lock.js'
    );
    invalidateClientCache(clientKey);
    const lockClient = await getFullClient(clientKey);
    if (isOutboundAbReviewPending(lockClient?.vapi)) {
      res.status(423).json({ ok: false, error: OUTBOUND_AB_REVIEW_PENDING_MESSAGE });
      return;
    }
    const { OUTBOUND_AB_VAPI_KEYS } = await import('./lib/outbound-ab-variant.js');
    const { deactivateAbTestExperimentsByName, deactivateAllActiveOutboundAbSliceExperiments } =
      await import('./db.js');
    const { vapiPatchAfterStopOutboundAbDimension } = await import('./lib/outbound-ab-focus.js');
    const { updateClientConfig } = await import('./lib/client-onboarding.js');
    const d = String(dimRaw || '').trim().toLowerCase();
    if (d !== 'voice' && d !== 'opening' && d !== 'script') {
      res.status(400).json({ ok: false, error: 'dimension must be voice, opening, or script' });
      return;
    }
    const vapiKey = OUTBOUND_AB_VAPI_KEYS[d];
    const expName =
      lockClient?.vapi && typeof lockClient.vapi === 'object'
        ? String(lockClient.vapi[vapiKey] || '').trim()
        : '';
    if (expName) {
      await deactivateAbTestExperimentsByName(clientKey, expName);
    }
    const sliceExperimentsDeactivated = await deactivateAllActiveOutboundAbSliceExperiments(
      clientKey,
      d
    );
    const vapiPatch = vapiPatchAfterStopOutboundAbDimension(lockClient.vapi, d);
    await updateClientConfig(clientKey, { vapi: vapiPatch });
    invalidateClientCache(clientKey);
    const after = await getFullClient(clientKey);
    const v = after?.vapi && typeof after.vapi === 'object' ? after.vapi : {};
    const trimDial = (x) => (x != null && String(x).trim() !== '' ? String(x).trim() : '');
    const voiceExp = trimDial(v.outboundAbVoiceExperiment);
    const openingExp = trimDial(v.outboundAbOpeningExperiment);
    const scriptExp = trimDial(v.outboundAbScriptExperiment);
    const focusStored = trimDial(v.outboundAbFocusDimension).toLowerCase();
    const focusValid =
      focusStored === 'voice' || focusStored === 'opening' || focusStored === 'script' ? focusStored : '';
    const { resolveOutboundAbDimensionsForDial, outboundAbDialWarning } = await import('./lib/outbound-ab-focus.js');
    const dialPairs = resolveOutboundAbDimensionsForDial({
      voiceExp,
      openingExp,
      scriptExp,
      focusDimension: focusValid
    });
    const dialActiveDimensions = dialPairs.map((pair) => pair[0]);
    const dialWarning = outboundAbDialWarning({
      voiceExp,
      openingExp,
      scriptExp,
      focusDimension: focusValid
    });
    res.json({
      ok: true,
      dimension: d,
      stoppedExperimentName: expName || null,
      sliceExperimentsDeactivated,
      dashboardDial: {
        dialActiveDimensions,
        dialWarning,
        focusDimension: focusValid || null
      }
    });
  } catch (error) {
    console.error('[OUTBOUND AB DIMENSION STOP]', error);
    res.status(500).json({ ok: false, error: error.message || String(error) });
  }
}

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
app.use(demoSetupRouter);

// Error handling middleware (must be last)
app.use(errorHandler);

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
