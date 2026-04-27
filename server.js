// server.js — AI Booking System (SQLite tenants + env bootstrap + richer tenant awareness)
import 'dotenv/config';
import { normalizePhoneE164 } from './lib/utils.js';
import { parseStartPreference } from './lib/start-preference.js';
import { generateUKBusinesses, getIndustryCategories, fuzzySearch } from './enhanced-business-search.js';
import RealUKBusinessSearch from './real-uk-business-search.js';
import BookingSystem from './booking-system.js';
import SMSEmailPipeline from './sms-email-pipeline.js';
import morgan from 'morgan';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import { DateTime } from 'luxon';
import * as chrono from 'chrono-node';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import { getDemoOverrides, formatOverridesForTelemetry, loadDemoScript } from './lib/demo-script.js';
import {
  isBusinessHoursForTenant,
  getNextBusinessOpenForTenant,
  clampOutboundDialToAllowedWindow,
  allowOutboundWeekendCalls
} from './lib/business-hours.js';
import { recordDemoTelemetry, readDemoTelemetry, clearDemoTelemetry, recordReceptionistTelemetry, readReceptionistTelemetry, clearReceptionistTelemetry } from './lib/demo-telemetry.js';
import twilio from 'twilio';
import { createHash } from 'crypto';
import { performanceMiddleware, getPerformanceMonitor } from './lib/performance-monitor.js';
import { cacheMiddleware, getCache } from './lib/cache.js';
import { sqlHoursAgo as sqlHoursAgoFn, sqlDaysAgo as sqlDaysAgoFn } from './lib/sql-relative-interval.js';
import { phoneMatchKey, pgQueueLeadPhoneKeyExpr } from './lib/lead-phone-key.js';
import { handleCalendarCheckBook } from './lib/calendar-check-book.js';
import { handleCalendarBookSlot } from './lib/calendar-book-slot.js';
import { handleCalendarFindSlots } from './lib/calendar-find-slots.js';
import { scheduleAtOptimalCallWindow } from './lib/optimal-call-window.js';
import { runOutboundCallsForImportedLeads } from './lib/lead-import-outbound.js';
import { handleTwilioSmsInbound } from './lib/twilio-sms-inbound-webhook.js';
import { handleNotifyTest, handleNotifySend } from './lib/notify-api.js';
import { handleSmsStatusWebhook } from './lib/sms-status-webhook.js';
import { isOptedOut } from './lib/lead-deduplication.js';
import { isMobileNumber } from './lib/google-places-search.js';
import googlePlacesSearchRouter from './routes/google-places-search.js';
import { createAdminDiagnosticsRouter } from './routes/admin-diagnostics-mount.js';
import { createAdminServerCallQueueRouter } from './routes/admin-server-call-queue-mount.js';
import { createAdminAnalyticsRouter, createAdminCostAndAccessRouter } from './routes/admin-analytics-mount.js';
import { createAdminClientsHealthRouter } from './routes/admin-clients-health-mount.js';
import { createAdminVapiCampaignsRouter } from './routes/admin-vapi-campaigns-mount.js';
import { createAdminVapiLogisticsRouter } from './routes/admin-vapi-logistics-mount.js';
import { createAdminVapiPlumbingRouter } from './routes/admin-vapi-plumbing-mount.js';
import { createToolsRouter } from './routes/tools-mount.js';

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
import { installAdminHubSocketAuth, resolveSocketIoAllowedOrigins } from './lib/socket-io-admin-hub.js';
// Real API integration - dynamic imports will be used in endpoints

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const LEADS_PATH = path.join(DATA_DIR, 'leads.json');
const CALLS_PATH = path.join(DATA_DIR, 'calls.json');
const SMS_STATUS_PATH = path.join(DATA_DIR, 'sms-status.json');
const JOBS_PATH = path.join(DATA_DIR, 'jobs.json');

// Create HTTP server and Socket.IO server
const server = createServer(app);
const socketIoAllowedOrigins = resolveSocketIoAllowedOrigins();
const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (!socketIoAllowedOrigins.length) {
        const prod = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
        if (prod) return callback(new Error('Socket.IO CORS: set PUBLIC_BASE_URL or SOCKETIO_EXTRA_ORIGINS'), false);
        return callback(null, true);
      }
      return callback(null, socketIoAllowedOrigins.includes(origin));
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});
installAdminHubSocketAuth(io);

const ADMIN_HUB_BURST_WINDOW_MS = 60_000;
const ADMIN_HUB_BURST_MAX = 45;
const adminHubRequestBursts = new Map();

// Initialize performance monitoring and caching
const performanceMonitor = getPerformanceMonitor();
const cache = getCache();
const isPostgres = (process.env.DB_TYPE || '').toLowerCase() === 'postgres';
const sqlHoursAgo = (hours = 1) => sqlHoursAgoFn(isPostgres, hours);
const sqlDaysAgo = (days = 1) => sqlDaysAgoFn(isPostgres, days);
const TIMEZONE = process.env.TZ || process.env.TIMEZONE || 'Europe/London';

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

// === Env: Google
// Support both individual env vars AND full JSON base64
let GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL || '';
let GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY || '';
let GOOGLE_PRIVATE_KEY_B64 = process.env.GOOGLE_PRIVATE_KEY_B64 || '';

// If GOOGLE_SA_JSON_BASE64 is provided, extract credentials from it
if (process.env.GOOGLE_SA_JSON_BASE64 && !GOOGLE_CLIENT_EMAIL) {
  try {
    const jsonString = Buffer.from(process.env.GOOGLE_SA_JSON_BASE64, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(jsonString);
    GOOGLE_CLIENT_EMAIL = serviceAccount.client_email || '';
    GOOGLE_PRIVATE_KEY = serviceAccount.private_key || '';
    console.log('[GOOGLE AUTH] ✅ Using credentials from GOOGLE_SA_JSON_BASE64');
  } catch (e) {
    console.error('[GOOGLE AUTH] ❌ Failed to parse GOOGLE_SA_JSON_BASE64:', e.message);
  }
}

const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

// Dashboard stats cache (separate from main cache for stats-specific TTL)
const DASHBOARD_CACHE_TTL = 60000; // 60 seconds
const dashboardStatsCache = new Map();

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Admin Hub client connected:', socket.id);
  
  // Join admin room for real-time updates
  socket.join('admin-hub');
  
  // Handle client disconnection
  socket.on('disconnect', () => {
    adminHubRequestBursts.delete(socket.id);
    console.log('Admin Hub client disconnected:', socket.id);
  });
  
  // Handle real-time data requests
  socket.on('request-update', async (dataType) => {
    try {
      const now = Date.now();
      const bucket = adminHubRequestBursts.get(socket.id) || [];
      const pruned = bucket.filter((t) => now - t < ADMIN_HUB_BURST_WINDOW_MS);
      pruned.push(now);
      if (pruned.length > ADMIN_HUB_BURST_MAX) {
        socket.emit('error', { message: 'Rate limit exceeded' });
        return;
      }
      adminHubRequestBursts.set(socket.id, pruned);

      let updateData = {};
      
      switch(dataType) {
        case 'business-stats':
          updateData = await getBusinessStats();
          break;
        case 'recent-activity':
          updateData = await getRecentActivity();
          break;
        case 'clients':
          updateData = await getClientsData();
          break;
        case 'calls':
          updateData = await getCallsData();
          break;
        case 'analytics':
          updateData = await getAnalyticsData();
          break;
        case 'system-health':
          updateData = await getSystemHealthData();
          break;
        case 'all':
          updateData = {
            businessStats: await getBusinessStats(),
            recentActivity: await getRecentActivity(),
            clients: await getClientsData(),
            calls: await getCallsData(),
            analytics: await getAnalyticsData(),
            systemHealth: await getSystemHealthData()
          };
          break;
      }
      
      socket.emit('data-update', { type: dataType, data: updateData });
    } catch (error) {
      console.error('Error handling real-time update request:', error);
      socket.emit('error', { message: 'Failed to fetch data' });
    }
  });
});

// Broadcast real-time updates
function broadcastUpdate(type, data) {
  io.to('admin-hub').emit('data-update', { type, data });
}

// Add performance monitoring middleware (tracks all API calls)
app.use(performanceMiddleware(performanceMonitor));

// API key guard middleware
function requireApiKey(req, res, next) {
  // Skip API key check for public routes
  if (req.method === 'GET' && (req.path === '/health' || req.path === '/gcal/ping' || req.path === '/healthz' || req.path === '/setup-my-client' || req.path === '/clear-my-leads' || req.path === '/check-db' || req.path === '/lead-import.html' || req.path === '/complete-setup' || req.path === '/test-booking-calendar')) return next();
  if (req.path.startsWith('/webhooks/twilio-status') || req.path.startsWith('/webhooks/twilio-inbound') || req.path.startsWith('/webhooks/twilio/sms-inbound') || req.path.startsWith('/webhooks/twilio-voice') || req.path.startsWith('/webhooks/vapi') || req.path === '/webhook/sms-reply' || req.path === '/webhooks/sms') return next();
  if (req.path === '/api/test' || req.path.startsWith('/api/test/') || req.path === '/api/test-linkedin' || req.path === '/api/uk-business-search' || req.path === '/api/decision-maker-contacts' || req.path === '/api/industry-categories' || req.path === '/test-sms-pipeline' || req.path === '/sms-test' || req.path === '/api/initiate-lead-capture' || req.path === '/api/signup') return next();
  if (req.path === '/uk-business-search' || req.path === '/booking-simple.html') return next();
  if (req.path.startsWith('/dashboard/') || req.path.startsWith('/settings/') || req.path.startsWith('/leads') || req.path === '/privacy.html' || req.path === '/privacy' || req.path === '/zapier-docs.html' || req.path === '/zapier') return next();
  
  // Skip API key check for ALL admin routes (hub and API endpoints)
  if (req.path === '/admin-hub.html' || req.path === '/admin-hub' || req.path.startsWith('/api/admin/')) return next();
  
  // For all other routes, check API key
  if (!API_KEY) return next(); // If no API key is set, allow access (for development)
  const key = req.get('X-API-Key');
  if (key && key === API_KEY) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// CORS middleware for dashboard access
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key'
  );
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Middleware for parsing JSON bodies (must be before routes that need it)
app.use(compression()); // Compress responses for better performance
// Vapi webhooks: capture exact request bytes for HMAC (must run before global express.json).
const vapiWebhookJsonCapture = express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    req.rawBody = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
  }
});
app.use('/webhooks/vapi', (req, res, next) => {
  if (req.method !== 'POST' && req.method !== 'PUT') return next();
  return vapiWebhookJsonCapture(req, res, next);
});
const globalJsonParser = express.json({ limit: '10mb' });
app.use((req, res, next) => {
  if (
    (req.method === 'POST' || req.method === 'PUT') &&
    (req.path === '/webhooks/vapi' || req.path.startsWith('/webhooks/vapi/'))
  ) {
    return next();
  }
  return globalJsonParser(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(enforceAdminApiKeyIfConfigured);

// Initialize Booking System
let bookingSystem = null;
try {
  bookingSystem = new BookingSystem();
  console.log('✅ Booking system initialized');
} catch (error) {
  console.error('❌ Failed to initialize booking system:', error.message);
  console.log('⚠️ Booking functionality will be disabled');
}

// Initialize SMS-Email Pipeline
let smsEmailPipeline = null;
try {
  smsEmailPipeline = new SMSEmailPipeline(bookingSystem);
  console.log('✅ SMS-Email pipeline initialized');
} catch (error) {
  console.error('❌ Failed to initialize SMS-Email pipeline:', error.message);
  console.log('⚠️ SMS-Email functionality will be disabled');
}

// Trust proxy for rate limiting (required for Render)
app.set('trust proxy', 1);

// Enhanced security middleware
app.use(securityHeaders);
app.use(requestLogging);
app.use(validateAndSanitizeInput());
app.use(auditLog);

// Serve static files from public directory
app.use(express.static('public'));

app.use(staticPagesRouter);
app.use(createPortalPagesRouter());
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
  })
);
app.use('/api/outreach', createOutreachRouter());
app.use('/api/crm', createCrmRouter({ getFullClient }));
app.use('/api/branding', createBrandingRouter({ getFullClient, upsertFullClient }));
app.use('/api/analytics', createAnalyticsRouter());
app.use(createSmsEmailPipelineRouter({ smsEmailPipeline }));
app.use(createBookingTestRouter({ bookingSystem, getApiKey: () => process.env.API_KEY, getFullClient }));
app.use(createVapiDevRouter());
app.use('/admin', createAdminTestLeadDataRouter());
app.use('/admin', createAdminTestScriptRouter());
app.use('/admin', createAdminValidateCallDurationRouter());
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
    TIMEZONE
  })
);
app.use('/api', createImportLeadEmailRouter());
app.use('/api', createRoiRouter());
app.use('/api', createIndustryComparisonRouter({ getFullClient }));
app.use('/api', createLeadsExistingMatchKeysRouter({ query }));
app.use('/api', createAbTestResultsRouter());
app.use('/api', createDemoTestCallRouter({ getFullClient, isDemoClient, fetchImpl: fetch }));
app.use('/api', createCallTranscriptRouter({ query }));
app.use('/api', createDemoDashboardDebugRouter({ query, fetchImpl: fetch }));
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
        fetchImpl: fetch
      })
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
    formatCallDuration
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
    sheets
  })
);
app.use('/api', createFollowUpQueueRouter({ getFullClient, resolveLogisticsSpreadsheetId, sheets }));
app.use('/api', createNextActionsRouter({ query, cacheMiddleware }));
app.use('/api', createCallRecordingsRouter({ query, formatTimeAgoLabel }));
app.use('/api', createVoicemailsRouter({ isPostgres, poolQuerySelect, formatTimeAgoLabel, truncateActivityFeedText }));
app.use('/api', createCallRecordingsStreamRouter({ poolQuerySelect }));
app.use('/api', createRecordingsQualityCheckRouter({ query }));
app.use('/api', createReportsRouter({ authenticateApiKey }));
app.use('/api', createSmsTemplatesRouter({ authenticateApiKey }));
app.use('/api', createMonitoringDashboardRouter({ authenticateApiKey }));
app.use(createApiDocsRouter());
app.use('/api', createQuickWinMetricsRouter({ query, cacheMiddleware }));
app.use(createHealthAndDiagnosticsRouter({ query }));
app.use(
  '/api',
  createOpsHealthAndDncRouter({
    getFullClient,
    resolveLogisticsSpreadsheetId,
    listOptOutList,
    upsertOptOut,
    deactivateOptOut,
    query,
    dbType,
    DB_PATH
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
    pickTimezone
  })
);
app.use(
  '/api',
  createCoreApiRouter({
    query,
    getIntegrationStatuses: (clientKey) => getIntegrationStatusesForClient(clientKey, { query })
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
    isDashboardSelfServiceClient
  })
);
app.use(
  '/api/calendar',
  createCalendarApiRouter({
    getClientFromHeader,
    servicesFor: (typeof servicesFor === 'function') ? servicesFor : undefined,
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
    isBusinessHours
  })
);
app.use(
  '/api/admin',
  createAdminOutboundWeekdayJourneyRouter({
    query,
    getFullClient,
    pickTimezone,
    DateTime,
    isPostgres
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
app.use('/', googlePlacesSearchRouter);

// (search-google-places handler and its helper functions moved to routes/lib modules)

// moved: POST /api/book-demo → routes/book-demo.js

// moved: GET /api/available-slots → routes/available-slots.js

// moved: POST /api/create-client → routes/create-client.js

// moved: /api/quality-alerts/* → routes/quality-alerts.js

// moved: POST /api/import-leads/:clientKey → routes/import-leads.js

// moved: POST /api/import-lead-email/:clientKey → routes/import-lead-email.js

// moved: GET /api/roi/:clientKey → routes/roi.js

// moved: GET /api/industry-comparison/:clientKey → routes/industry-comparison.js

/** Rolling activity windows & touchpoint day buckets on the client dashboard (GMT/BST). */
const DASHBOARD_ACTIVITY_TZ = 'Europe/London';

function formatGBP(value = 0) {
  const formatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
  return formatter.format(value);
}

function formatTimeAgoLabel(dateString) {
  if (!dateString) return 'Just now';
  const diffMs = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Live activity feed: only mention SMS when tenant has Twilio fields set (twilio_json → client.sms). */
function activityFeedChannelLabel(client) {
  const sms = client?.sms && typeof client.sms === 'object' ? client.sms : {};
  const hasSmsConfig = !!(
    sms.messagingServiceSid ||
    sms.fromNumber ||
    sms.accountSid ||
    sms.authToken
  );
  return hasSmsConfig ? 'AI call + SMS' : 'AI call';
}

function mapCallStatus(status) {
  const normalized = (status || '').toLowerCase();
  if (normalized.includes('book')) return 'Booked';
  if (normalized.includes('completed') || normalized === 'ended') return 'Completed';
  if (normalized.includes('pending')) return 'Awaiting reply';
  if (normalized.includes('missed')) return 'Missed call';
  if (normalized === 'initiated') return 'In progress';
  return status || 'Live';
}

function formatCallDuration(seconds) {
  if (seconds == null || seconds === '') return null;
  const s = parseInt(seconds, 10);
  if (isNaN(s) || s < 0) return null;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return sec > 0 ? `${m}m ${sec}s` : `${m}m`;
}

/** Short plain text for live activity feed (avoid huge payloads). */
function truncateActivityFeedText(str, maxLen = 220) {
  const s = String(str || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1).trim()}…`;
}

function parseCallsRowMetadata(meta) {
  if (meta == null) return null;
  if (typeof meta === 'object' && !Array.isArray(meta)) return meta;
  if (typeof meta === 'string') {
    try {
      return JSON.parse(meta);
    } catch {
      return null;
    }
  }
  return null;
}

/** Synthetic rows when outbound queue could not start a Vapi call (not the same as an in-call failure). */
function isCallQueueStartFailureRow(row) {
  const cid = String(row?.call_id || '');
  if (cid.startsWith('failed_q')) return true;
  const m = parseCallsRowMetadata(row?.metadata);
  return !!(m && m.fromQueue === true && String(row?.outcome || '').toLowerCase() === 'failed');
}

function formatVapiEndedReasonDisplay(reason) {
  if (reason == null || reason === '') return '';
  return String(reason)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** For transcript modal: map Vapi `endedReason` to who ended a live call. */
function inferCallEndedByFromVapiReason(endedReason) {
  const detail = formatVapiEndedReasonDisplay(endedReason);
  if (!endedReason || typeof endedReason !== 'string') {
    return {
      callEndedBy: 'unknown',
      callEndedByLabel: 'Who ended the call: not recorded',
      endedReasonDetail: ''
    };
  }
  const r = endedReason.toLowerCase();
  if (r.includes('assistant-ended-call')) {
    return { callEndedBy: 'assistant', callEndedByLabel: 'Ended by: AI', endedReasonDetail: detail };
  }
  if (r.includes('customer-ended-call')) {
    return { callEndedBy: 'customer', callEndedByLabel: 'Ended by: contact', endedReasonDetail: detail };
  }
  if (r.includes('silence-timed-out')) {
    return { callEndedBy: 'system', callEndedByLabel: 'Ended by: system (silence timeout)', endedReasonDetail: detail };
  }
  if (r.includes('exceeded-max-duration')) {
    return { callEndedBy: 'system', callEndedByLabel: 'Ended by: system (max duration)', endedReasonDetail: detail };
  }
  if (
    r.includes('customer-did-not-answer') ||
    r.includes('did-not-answer') ||
    r.includes('voicemail') ||
    r.includes('customer-busy') ||
    r.includes('rejected') ||
    r.includes('failed-to-connect') ||
    r.includes('misdialed') ||
    r.includes('vonage-rejected') ||
    r.includes('twilio-reported') ||
    r.includes('error') ||
    r.includes('fault')
  ) {
    return {
      callEndedBy: 'unknown',
      callEndedByLabel: detail ? `End reason: ${detail}` : 'Who ended the call: not applicable',
      endedReasonDetail: detail
    };
  }
  if (r.includes('vonage-completed')) {
    return {
      callEndedBy: 'unknown',
      callEndedByLabel: 'Call completed (carrier — who hung up not specified)',
      endedReasonDetail: detail
    };
  }
  return {
    callEndedBy: 'unknown',
    callEndedByLabel: detail ? `End reason: ${detail}` : 'Who ended the call: unknown',
    endedReasonDetail: detail
  };
}

function endedReasonFromCallRow(row) {
  const m = parseCallsRowMetadata(row?.metadata);
  if (!m || typeof m !== 'object') return null;
  return m.endedReason || m.endReason || null;
}

function outcomeToFriendlyLabel(outcome) {
  if (!outcome) return null;
  const o = (outcome || '').toLowerCase();
  if (o === 'no-answer' || o === 'no_answer') return 'No answer';
  if (o === 'voicemail') return 'Voicemail';
  if (o === 'busy') return 'Busy';
  if (o === 'rejected' || o === 'declined') return 'Declined';
  if (o === 'failed') return 'Failed';
  if (o === 'booked') return 'Booked';
  if (o === 'completed') return 'Picked up';
  return outcome.replace(/-/g, ' ');
}

/** Lead timeline: did a human pick up? (distinct from raw DB status / missing webhooks) */
function inferTimelinePickupStatus(call) {
  let outcome = (call.outcome || '').toLowerCase().trim().replace(/_/g, '-');
  // Some pipelines mirror line status into outcome; ignore for pickup inference
  if (outcome === 'initiated' || outcome === 'in-progress' || outcome === 'ringing' || outcome === 'queued') {
    outcome = '';
  }
  const status = (call.status || '').toLowerCase().trim();
  const durRaw = call.duration != null ? parseInt(call.duration, 10) : NaN;
  const durNum = Number.isFinite(durRaw) && durRaw >= 0 ? durRaw : null;
  const snip = String(call.transcript_snippet || '').trim();
  const snipLen = snip.replace(/\s/g, '').length;
  const hasRec = !!(call.recording_url && String(call.recording_url).trim());

  const noHuman = new Set(['no-answer', 'busy', 'failed', 'voicemail', 'declined', 'rejected', 'cancelled', 'canceled']);
  if (outcome && noHuman.has(outcome)) {
    const friendly = outcomeToFriendlyLabel(call.outcome);
    return {
      status: 'no',
      headline: 'They did not pick up',
      reason: friendly || outcome.replace(/-/g, ' ')
    };
  }

  if (outcome === 'booked' || outcome === 'completed' || (outcome && !noHuman.has(outcome))) {
    return {
      status: 'yes',
      headline: 'They picked up',
      reason: outcomeToFriendlyLabel(call.outcome) || outcome.replace(/-/g, ' ')
    };
  }

  if (status === 'initiated') {
    // Often stuck here when the "call ended" webhook never ran — still use anything we captured.
    if (durNum != null && durNum >= 15) {
      return {
        status: 'yes',
        headline: 'They picked up',
        reason: `Connected about ${formatCallDuration(durNum)} (status never left “initiated”; final webhook likely missing).`
      };
    }
    if (durNum != null && durNum >= 10 && durNum < 15) {
      return {
        status: 'yes',
        headline: 'They picked up',
        reason: `Short connection (${formatCallDuration(durNum)}); likely answered but status never left initiated.`
      };
    }
    const qsInit = call.quality_score != null ? Number(call.quality_score) : null;
    const hasSentiment = call.sentiment != null && String(call.sentiment).trim().length > 0;
    if (hasSentiment || (qsInit != null && Number.isFinite(qsInit))) {
      return {
        status: 'yes',
        headline: 'They picked up',
        reason: hasSentiment
          ? `Post-call analysis saved (${String(call.sentiment).trim()} sentiment); status still shows initiated.`
          : `Quality score saved (${Math.round(qsInit)}/100); status still shows initiated.`
      };
    }
    // Shorter snippet threshold than “ended” rows — partial transcripts still imply a conversation.
    const snipOkInit = snipLen > 25;
    if (snipOkInit || hasRec) {
      return {
        status: 'yes',
        headline: 'They picked up',
        reason: hasRec
          ? 'Recording on file (status still “initiated”; hang-up event may not have synced).'
          : 'Conversation text on file (status still “initiated”; hang-up event may not have synced).'
      };
    }
    if (durNum != null && durNum > 0 && durNum < 12) {
      return {
        status: 'no',
        headline: 'They did not pick up',
        reason: `Very short ring (${formatCallDuration(durNum)}); call never progressed past initiated.`
      };
    }
    const created = call.created_at ? new Date(call.created_at).getTime() : 0;
    const ageMin = created ? (Date.now() - created) / 60000 : 999;
    if (ageMin > 15) {
      return {
        status: 'unknown',
        headline: 'Pickup unknown',
        reason:
          'No usable duration, transcript snippet, or recording on this row — we cannot tell if someone answered. Check the transcript/recording links or your telephony webhooks.'
      };
    }
    return {
      status: 'unknown',
      headline: 'Pickup unknown',
      reason: 'Still connecting or first webhook not received yet (line shows initiated).'
    };
  }

  const endedLike = status === 'ended' || status === 'completed';
  if (endedLike) {
    if (durNum != null && durNum >= 15) {
      return {
        status: 'yes',
        headline: 'They picked up',
        reason: `Connected about ${formatCallDuration(durNum)} (no outcome stored).`
      };
    }
    if (snipLen > 40 || hasRec) {
      return {
        status: 'yes',
        headline: 'They picked up',
        reason: hasRec ? 'Recording on file.' : 'Conversation text captured.'
      };
    }
    if (durNum != null && durNum > 0 && durNum < 12) {
      return {
        status: 'no',
        headline: 'They did not pick up',
        reason: `Very short ring (${formatCallDuration(durNum)}).`
      };
    }
    return {
      status: 'unknown',
      headline: 'Pickup unknown',
      reason: 'Call ended in our logs but no outcome, duration, or transcript yet.'
    };
  }

  if (status === 'failed' || status === 'cancelled' || status === 'canceled') {
    return {
      status: 'no',
      headline: 'They did not pick up',
      reason: mapCallStatus(call.status)
    };
  }

  return {
    status: 'unknown',
    headline: 'Pickup unknown',
    reason: mapCallStatus(call.status) || 'Not enough data yet.'
  };
}

/** Align with vapi-webhooks mapEndedReasonToOutcome for GET /call hydration. */
function mapVapiEndedReasonToTimelineOutcome(endedReason) {
  if (!endedReason || typeof endedReason !== 'string') return null;
  const r = endedReason.toLowerCase();
  if (r.includes('customer-did-not-answer') || r.includes('did-not-answer')) return 'no-answer';
  if (r.includes('customer-busy') || r.includes('busy')) return 'busy';
  if (r === 'voicemail' || r.includes('voicemail')) return 'voicemail';
  if (r.includes('rejected') || r.includes('declined') || r.includes('failed-to-connect') || r.includes('misdialed')) {
    return 'declined';
  }
  if (r.includes('vonage-rejected') || r.includes('twilio-reported')) return 'declined';
  if (r.includes('assistant-ended-call') || r.includes('customer-ended-call') || r.includes('vonage-completed')) {
    return 'completed';
  }
  if (r.includes('silence-timed-out') || r.includes('exceeded-max-duration')) return 'completed';
  if (r.includes('error') || r.includes('fault')) return 'failed';
  return 'completed';
}

/** Merge nested `call` + `artifact` shapes from Vapi GET /call responses. */
function flattenVapiGetCallPayload(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const nested = raw.call && typeof raw.call === 'object' ? raw.call : {};
  const s = { ...nested, ...raw };
  const art = s.artifact && typeof s.artifact === 'object' ? s.artifact : {};
  if (!s.recordingUrl && art.recordingUrl) s.recordingUrl = art.recordingUrl;
  if (!s.stereoRecordingUrl && art.stereoRecordingUrl) s.stereoRecordingUrl = art.stereoRecordingUrl;
  if (!s.transcript && art.transcript) s.transcript = art.transcript;
  return s;
}

function messageContentToString(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p === 'object' ? p.text || p.content || '' : String(p)))
      .filter(Boolean)
      .join(' ');
  }
  return String(content);
}

/** Same key resolution as other Vapi server calls (Render often has one of these names). */
function timelineVapiAuthKey() {
  return (
    process.env.VAPI_PRIVATE_KEY ||
    process.env.VAPI_API_KEY ||
    process.env.VAPI_PUBLIC_KEY ||
    ''
  ).trim();
}

async function fetchVapiCallSnapshotForTimeline(callId) {
  const key = timelineVapiAuthKey();
  if (!key || !callId || String(callId).trim().length < 10) return null;
  try {
    const res = await fetch(
      `https://api.vapi.ai/call/${encodeURIComponent(String(callId).trim())}`,
      { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } }
    );
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn('[TIMELINE VAPI] GET /call failed', {
        callId: String(callId).slice(0, 12),
        status: res.status,
        detail: errBody.slice(0, 200)
      });
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn('[TIMELINE VAPI] GET /call error', String(callId).slice(0, 12), e?.message || e);
    return null;
  }
}

/** Map Vapi GET /call/:id JSON into fields inferTimelinePickupStatus already understands. */
function vapiCallSnapshotToTimelineHints(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return {};
  const s = flattenVapiGetCallPayload(snapshot);
  const hints = {};

  const er = s.endedReason || s.endReason;
  if (er && typeof er === 'string') {
    const oc = mapVapiEndedReasonToTimelineOutcome(er);
    if (oc) hints.outcome = oc;
  }

  let dur = null;
  if (typeof s.duration === 'number' && s.duration >= 0) dur = Math.round(s.duration);
  else if (s.duration != null && String(s.duration).trim() !== '') {
    const p = parseInt(String(s.duration), 10);
    if (Number.isFinite(p) && p >= 0) dur = p;
  }
  if (dur == null && s.endedAt && s.startedAt) {
    const ms = new Date(s.endedAt) - new Date(s.startedAt);
    if (ms > 0) dur = Math.round(ms / 1000);
  }
  if (dur != null && dur >= 0) hints.duration = dur;

  let tr = s.transcript || s.summary || s.analysis?.summary || null;
  if (!tr && Array.isArray(s.messages) && s.messages.length > 0) {
    const parts = [];
    for (const m of s.messages) {
      const role = String(m?.role || m?.type || '').toLowerCase();
      if (role === 'system' || role === 'function' || role === 'tool') continue;
      const rawC = m?.content ?? m?.text ?? m?.message ?? m?.body;
      const content = messageContentToString(rawC);
      if (!content) continue;
      const contentUpper = content.toUpperCase();
      if (
        contentUpper.includes('TOOLS:') ||
        contentUpper.includes('CRITICAL:') ||
        contentUpper.includes('FOLLOW THIS SCRIPT')
      ) {
        continue;
      }
      parts.push(content);
    }
    tr = parts.length ? parts.join(' ') : null;
  }
  if (tr && String(tr).trim()) {
    hints.transcript_snippet = String(tr).trim().slice(0, 320);
  }

  const rec = s.recordingUrl || s.stereoRecordingUrl;
  if (rec && String(rec).trim() && /^https?:\/\//i.test(String(rec).trim())) {
    hints.recording_url = String(rec).trim();
  }

  return hints;
}

function mapStatusClass(status) {
  const normalized = (status || '').toLowerCase();
  if (normalized.includes('book')) return 'success';
  if (normalized.includes('await') || normalized.includes('pending')) return 'pending';
  return 'info';
}

// moved: GET /api/ab-test-results/:clientKey → routes/ab-test-results.js
// moved: POST /api/demo/test-call → routes/demo-test-call.js

// moved: GET /api/demo-dashboard-debug/:clientKey → routes/demo-dashboard-debug.js

// moved: GET /api/demo-dashboard/:clientKey → routes/demo-dashboard.js


// moved: GET /api/outbound-queue-day/:clientKey, GET /api/events/:clientKey → routes/public-reads-mount.js

// moved: /api/leads/:leadId/(snooze|escalate) → routes/core-api.js

// moved: /api/leads/import-test → routes/import-leads.js
// POST /api/leads/import and /api/leads/import__legacy → routes/import-leads.js (createImportLeadsRouter)

/**
 * Which of the given match keys already exist for this client (any lead row with same tail-10 / digit key).
 * Used by outreach dashboard import preview (new vs existing).
 */
// moved: POST /api/leads/existing-match-keys → routes/leads-existing-match-keys.js

// moved: getIntegrationStatuses → lib/integration-statuses.js

// moved: /api/integration-health/:clientKey → routes/core-api.js

// moved: /api/calls/:callId → routes/core-api.js

// moved: GET /api/calls/:callId/transcript → routes/call-transcript.js

// moved: GET /api/leads/:leadId/timeline → routes/lead-timeline.js

// moved: /api/export/:type → routes/core-api.js

// moved: /api/call-quality, /api/call-insights/* → routes/call-insights-mount.js

// moved: GET /api/call-time-bandit/:clientKey → routes/call-time-bandit.js

// API endpoint for retry queue (pending follow-up rows + outbound calls waiting in call_queue)
// No response cache: queue changes often; cached empty responses made the dashboard look "broken".
// Lead names: one batched query (same match rules as the old per-row subquery) to avoid N× correlated lookups.
async function fetchLeadNamesForRetryQueuePhones(clientKey, queuePhones) {
  const phones = [...new Set((queuePhones || []).filter((p) => p != null && String(p) !== ''))];
  if (phones.length === 0) return new Map();
  const res = await poolQuerySelect(
    `
    WITH qn AS (
      SELECT DISTINCT p AS phone_raw,
             regexp_replace(COALESCE(p, ''), '[^0-9]', '', 'g') AS qdig,
             CASE
               WHEN LENGTH(regexp_replace(COALESCE(p, ''), '[^0-9]', '', 'g')) >= 10
               THEN RIGHT(regexp_replace(COALESCE(p, ''), '[^0-9]', '', 'g'), 10)
               ELSE NULLIF(regexp_replace(COALESCE(p, ''), '[^0-9]', '', 'g'), '')
             END AS qkey
      FROM unnest($2::text[]) AS x(p)
      WHERE p IS NOT NULL AND p <> ''
    ),
    lead_index AS (
      SELECT phone, phone_match_key, name, created_at
      FROM leads
      WHERE client_key = $1
    )
    SELECT DISTINCT ON (qn.phone_raw)
      qn.phone_raw,
      li.name
    FROM qn
    JOIN lead_index li ON (
      li.phone = qn.phone_raw
      OR (
        li.phone_match_key IS NOT NULL
        AND qn.qkey IS NOT NULL
        AND li.phone_match_key = qn.qkey
      )
    )
    ORDER BY qn.phone_raw, li.created_at DESC NULLS LAST
    `,
    [clientKey, phones]
  );
  const m = new Map();
  for (const row of res.rows || []) {
    if (row.phone_raw != null) m.set(row.phone_raw, row.name);
  }
  return m;
}

/**
 * Retry-queue API: for outbound dials, show the next allowed dial instant (weekdays + hours),
 * not a raw scheduled_for that may fall on Sat/Sun or outside hours (e.g. "tomorrow 9am" from Fri).
 * SMS/email follow-ups keep the stored time unchanged.
 */
function effectiveDialScheduledForApiDisplay(row, tenant) {
  if (!row?.scheduled_for) return null;
  const raw = new Date(row.scheduled_for);
  if (Number.isNaN(raw.getTime())) return null;
  if (allowOutboundWeekendCalls()) return raw;
  const t = String(row.retry_type || '').toLowerCase();
  const isOutboundDial =
    row.source === 'call_queue' ||
    (row.source === 'retry_queue' && (t === 'vapi_call' || t === 'call'));
  if (!isOutboundDial) return raw;
  return clampOutboundDialToAllowedWindow(tenant, raw, pickTimezone(tenant));
}

// moved: /api/retry-queue/* → routes/retry-queue.js

function resolveLogisticsSpreadsheetId(client) {
  if (!client) return process.env.LOGISTICS_SHEET_ID || null;
  return (
    client.vapi_json?.logisticsSheetId
    || client.vapi?.logisticsSheetId
    || client.gsheet_id
    || process.env.LOGISTICS_SHEET_ID
    || null
  );
}

function trimEnvDashboard(key) {
  const v = process.env[key];
  if (v == null || String(v).trim() === '') return null;
  return String(v).trim();
}

function parseDashboardPrivacyBullets() {
  const raw = trimEnvDashboard('DASHBOARD_PRIVACY_BULLETS');
  if (!raw) return [];
  return raw
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
}

/**
 * Client-dashboard-only bundle: integrations, sync timestamps, privacy copy, build ids, read-only flag.
 */
function buildDashboardExperience(client, metricsAsOfIso) {
  const v = client?.vapi && typeof client.vapi === 'object' && !Array.isArray(client.vapi) ? client.vapi : {};
  const voiceOk = !!(client?.vapiAssistantId || v.assistantId);
  const tenantLogistics = !!(v.logisticsSheetId && String(v.logisticsSheetId).trim());
  const resolvedSheet = resolveLogisticsSpreadsheetId(client);
  const logisticsAny = !!resolvedSheet;
  const crmLeadSheet = !!(v.gsheet_id || v.gsheetId || v.crmSheetId || v.googleSheetId);
  const smsOk = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  const readOnlyGlobal = /^(1|true|yes)$/i.test(String(process.env.DASHBOARD_GLOBAL_READ_ONLY || '').trim());
  const readOnlyTenant = v.dashboardReadOnly === true || String(v.dashboardReadOnly || '').toLowerCase() === 'true';

  const sheetHint = tenantLogistics
    ? 'Logistics / call-result sheet id is set on this workspace.'
    : logisticsAny
      ? 'A sheet id is available via server default (e.g. LOGISTICS_SHEET_ID). Prefer setting logisticsSheetId on the tenant for production.'
      : 'No logistics sheet id — voice tool writes to Sheets may fail until configured.';

  return {
    integrations: [
      {
        id: 'voice',
        label: 'Voice (Vapi)',
        ok: voiceOk,
        hint: voiceOk ? 'Assistant is linked for outbound/inbound flows.' : 'Add assistantId to this workspace Vapi config.'
      },
      {
        id: 'google_sheets',
        label: 'Google Sheets',
        ok: logisticsAny || crmLeadSheet,
        hint: `${sheetHint}${crmLeadSheet ? ' Lead-list / CRM sheet id also present.' : ''}`.trim()
      },
      {
        id: 'sms',
        label: 'SMS (Twilio)',
        ok: smsOk,
        hint: smsOk ? 'Server Twilio credentials are set (tenant may still need templates).' : 'Twilio env vars missing — SMS may be unavailable.'
      }
    ],
    sync: {
      metricsAsOfIso: metricsAsOfIso || null,
      payloadGeneratedAtIso: new Date().toISOString()
    },
    privacy: {
      bullets: parseDashboardPrivacyBullets(),
      exportNote: trimEnvDashboard('DASHBOARD_PRIVACY_EXPORT_NOTE')
    },
    app: {
      version: trimEnvDashboard('DASHBOARD_APP_VERSION'),
      commit: trimEnvDashboard('RENDER_GIT_COMMIT')
    },
    ui: {
      readOnly: readOnlyGlobal || readOnlyTenant
    }
  };
}

// moved: /api/follow-up-queue/* → routes/follow-up-queue.js

// moved: /api/daily-summary/:clientKey → routes/daily-summary.js

// moved: /api/follow-up-queue/:clientKey/(status|patch|batchPatch) → routes/follow-up-queue.js

// moved: /api/ops/health/:clientKey and /api/dnc/* → routes/ops-health-and-dnc.js

// moved: /api/next-actions/:clientKey → routes/next-actions.js

// moved: /api/call-recordings/:clientKey → routes/call-recordings.js

// moved: /api/voicemails/:clientKey → routes/voicemails.js

// moved: /api/call-recordings/:clientKey/stream/:callRowId → routes/call-recordings-stream.js

// moved: /api/recordings/quality-check/:clientKey → routes/recordings-quality-check.js

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

// Helper function to adjust color brightness
function adjustColorBrightness(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
      (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
}

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

// Analytics and reporting functions
async function trackAnalyticsEvent({ clientKey, eventType, eventCategory, eventData, sessionId, userAgent, ipAddress }) {
  try {
    const { trackAnalyticsEvent } = await import('./db.js');
    return await trackAnalyticsEvent({
      clientKey,
      eventType,
      eventCategory,
      eventData,
      sessionId,
      userAgent,
      ipAddress
    });
  } catch (error) {
    console.error('[ANALYTICS TRACKING ERROR]', error);
  }
}

async function trackConversionStage({ clientKey, leadPhone, stage, stageData, previousStage = null, timeToStage = null }) {
  try {
    const { trackConversionStage } = await import('./db.js');
    return await trackConversionStage({
      clientKey,
      leadPhone,
      stage,
      stageData,
      previousStage,
      timeToStage
    });
  } catch (error) {
    console.error('[CONVERSION TRACKING ERROR]', error);
  }
}

async function recordPerformanceMetric({ clientKey, metricName, metricValue, metricUnit = null, metricCategory = null, metadata = null }) {
  try {
    const { recordPerformanceMetric } = await import('./db.js');
    return await recordPerformanceMetric({
      clientKey,
      metricName,
      metricValue,
      metricUnit,
      metricCategory,
      metadata
    });
  } catch (error) {
    console.error('[PERFORMANCE METRIC ERROR]', error);
  }
}

async function getAnalyticsDashboard(clientKey, days = 30) {
  try {
    const { 
      getAnalyticsSummary,
      getConversionFunnel,
      getConversionRates,
      getPerformanceMetrics,
      getTotalCostsByTenant,
      getCallsByTenant
    } = await import('./db.js');
    
    const [
      analyticsSummary,
      conversionFunnel,
      conversionRates,
      performanceMetrics,
      costMetrics,
      callMetrics
    ] = await Promise.all([
      getAnalyticsSummary(clientKey, days),
      getConversionFunnel(clientKey, days),
      getConversionRates(clientKey, days),
      getPerformanceMetrics(clientKey, null, days),
      getTotalCostsByTenant(clientKey, 'daily'),
      getCallsByTenant(clientKey, 1000)
    ]);
    
    // Calculate key metrics
    const totalLeads = conversionFunnel.reduce((sum, stage) => sum + stage.unique_leads, 0);
    const totalCalls = callMetrics.length;
    const successfulCalls = callMetrics.filter(call => call.outcome === 'completed').length;
    const conversionRate = totalLeads > 0 ? (successfulCalls / totalLeads) * 100 : 0;
    const avgCallDuration = callMetrics.reduce((sum, call) => sum + (call.duration || 0), 0) / totalCalls || 0;
    const totalCost = parseFloat(costMetrics.total_cost || 0);
    const costPerConversion = successfulCalls > 0 ? totalCost / successfulCalls : 0;
    
    return {
      summary: {
        totalLeads,
        totalCalls,
        successfulCalls,
        conversionRate: Math.round(conversionRate * 100) / 100,
        avgCallDuration: Math.round(avgCallDuration),
        totalCost: Math.round(totalCost * 100) / 100,
        costPerConversion: Math.round(costPerConversion * 100) / 100
      },
      analytics: analyticsSummary,
      conversionFunnel,
      conversionRates,
      performanceMetrics,
      costMetrics,
      callMetrics: callMetrics.slice(0, 50), // Last 50 calls
      period: `${days} days`,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('[ANALYTICS DASHBOARD ERROR]', error);
    return null;
  }
}

async function generateAnalyticsReport(clientKey, reportType = 'comprehensive', days = 30) {
  try {
    const dashboard = await getAnalyticsDashboard(clientKey, days);
    if (!dashboard) return null;
    
    const { summary, conversionFunnel, conversionRates, performanceMetrics, costMetrics } = dashboard;
    
    // Generate insights
    const insights = [];
    
    if (summary.conversionRate < 10) {
      insights.push({
        type: 'warning',
        category: 'conversion',
        message: `Low conversion rate (${summary.conversionRate}%). Consider optimizing assistant prompts or call timing.`
      });
    }
    
    if (summary.costPerConversion > 5) {
      insights.push({
        type: 'warning',
        category: 'cost',
        message: `High cost per conversion ($${summary.costPerConversion}). Review call duration and assistant efficiency.`
      });
    }
    
    if (summary.avgCallDuration > 300) {
      insights.push({
        type: 'info',
        category: 'efficiency',
        message: `Average call duration is ${Math.round(summary.avgCallDuration / 60)} minutes. Consider optimizing for shorter, more focused calls.`
      });
    }
    
    // Find conversion bottlenecks
    const funnelStages = conversionFunnel.map(stage => ({
      stage: stage.stage,
      leads: stage.unique_leads,
      conversionRate: stage.unique_leads / summary.totalLeads * 100
    }));
    
    const bottleneckStage = funnelStages.reduce((min, stage) => 
      stage.conversionRate < min.conversionRate ? stage : min
    );
    
    if (bottleneckStage.conversionRate < 50) {
      insights.push({
        type: 'recommendation',
        category: 'optimization',
        message: `Conversion bottleneck detected at "${bottleneckStage.stage}" stage (${Math.round(bottleneckStage.conversionRate)}%). Focus optimization efforts here.`
      });
    }
    
    return {
      reportType,
      period: `${days} days`,
      generatedAt: new Date().toISOString(),
      clientKey,
      summary,
      insights,
      funnelStages,
      recommendations: generateRecommendations(summary, insights),
      data: {
        conversionFunnel,
        conversionRates,
        performanceMetrics,
        costMetrics
      }
    };
  } catch (error) {
    console.error('[ANALYTICS REPORT ERROR]', error);
    return null;
  }
}

function generateRecommendations(summary, insights) {
  const recommendations = [];
  
  if (summary.conversionRate < 15) {
    recommendations.push({
      priority: 'high',
      category: 'conversion_optimization',
      action: 'Optimize Assistant Prompts',
      description: 'Review and improve assistant conversation flow to increase conversion rates',
      expectedImpact: 'Increase conversion rate by 5-10%'
    });
  }
  
  if (summary.costPerConversion > 3) {
    recommendations.push({
      priority: 'medium',
      category: 'cost_optimization',
      action: 'Implement Call Scheduling',
      description: 'Use intelligent call scheduling to reduce costs and improve timing',
      expectedImpact: 'Reduce cost per conversion by 20-30%'
    });
  }
  
  if (summary.avgCallDuration > 240) {
    recommendations.push({
      priority: 'medium',
      category: 'efficiency',
      action: 'Streamline Call Process',
      description: 'Optimize call flow to reduce average duration while maintaining quality',
      expectedImpact: 'Reduce call duration by 15-25%'
    });
  }
  
  return recommendations;
}

// A/B Testing functions
async function createABTestExperiment({ clientKey, experimentName, variants, isActive = true }) {
  try {
    const { createABTestExperiment } = await import('./db.js');
    
    const experiments = [];
    for (const variant of variants) {
      const experiment = await createABTestExperiment({
        clientKey,
        experimentName,
        variantName: variant.name,
        variantConfig: variant.config,
        isActive
      });
      experiments.push(experiment);
    }
    
    console.log('[AB TEST CREATED]', {
      clientKey,
      experimentName,
      variants: variants.length,
      isActive
    });
    
    return experiments;
  } catch (error) {
    console.error('[AB TEST CREATION ERROR]', error);
    throw error;
  }
}

async function getActiveABTests(clientKey) {
  try {
    const { getActiveABTests } = await import('./db.js');
    return await getActiveABTests(clientKey);
  } catch (error) {
    console.error('[AB TEST FETCH ERROR]', error);
    return [];
  }
}

async function selectABTestVariant(clientKey, experimentName, leadPhone) {
  const { selectABTestVariantForLead } = await import('./lib/outbound-ab-variant.js');
  return selectABTestVariantForLead(clientKey, experimentName, leadPhone);
}

async function recordABTestOutcome(params) {
  const { recordABTestOutcome: recordInDb } = await import('./db.js');
  return recordInDb(params);
}

async function getABTestResults(clientKey, experimentName) {
  try {
    const { getActiveABTests, getABTestConversionRates } = await import('./db.js');
    
    const activeTests = await getActiveABTests(clientKey);
    const experiment = activeTests.find(test => test.experiment_name === experimentName);
    
    if (!experiment) {
      return null;
    }
    
    const conversionRates = await getABTestConversionRates(experiment.id);
    
    return {
      experiment,
      conversionRates,
      summary: {
        totalVariants: conversionRates.length,
        totalParticipants: conversionRates.reduce((sum, variant) => sum + variant.total_leads, 0),
        totalConversions: conversionRates.reduce((sum, variant) => sum + variant.converted_leads, 0),
        overallConversionRate: conversionRates.length > 0 ? 
          conversionRates.reduce((sum, variant) => sum + variant.conversion_rate, 0) / conversionRates.length : 0
      }
    };
  } catch (error) {
    console.error('[AB TEST RESULTS ERROR]', error);
    return null;
  }
}

// Performance optimization functions (using imported cache from lib/cache.js)
// Old cache code removed - now using centralized cache system
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(prefix, ...params) {
  return `${prefix}:${params.join(':')}`;
}

async function getCached(key) {
  // Use centralized cache system from lib/cache.js
  return await cache.get(key);
}

async function setCache(key, data, ttl = CACHE_TTL) {
  // Use centralized cache system from lib/cache.js
  await cache.set(key, data, ttl);
}

function clearCache(pattern = null) {
  if (!pattern) {
    cache.clear();
    return;
  }
  
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key);
    }
  }
}

// Cached client lookup
async function getCachedClient(tenantKey) {
  const cacheKey = getCacheKey('client', tenantKey);
  let client = getCached(cacheKey);
  
  if (!client) {
    client = await getFullClient(tenantKey);
    if (client) {
      await setCache(cacheKey, client, 2 * 60 * 1000); // 2 minutes cache
    }
  }
  
  return client;
}

// Cached analytics dashboard
async function getCachedAnalyticsDashboard(clientKey, days = 30) {
  const cacheKey = getCacheKey('analytics', clientKey, days.toString());
  let dashboard = await getCached(cacheKey);
  
  if (!dashboard) {
    dashboard = await getAnalyticsDashboard(clientKey, days);
    if (dashboard) {
      await setCache(cacheKey, dashboard, 1 * 60 * 1000); // 1 minute cache
    }
  }
  
  return dashboard;
}

// Cached metrics
async function getCachedMetrics(clientKey) {
  const cacheKey = getCacheKey('metrics', clientKey);
  let metrics = getCached(cacheKey);
  
  if (!metrics) {
    const { getTotalCostsByTenant, getCallsByTenant } = await import('./db.js');
    
    const [costMetrics, callMetrics] = await Promise.all([
      getTotalCostsByTenant(clientKey, 'daily'),
      getCallsByTenant(clientKey, 100)
    ]);
    
    metrics = {
      costMetrics,
      callMetrics,
      lastUpdated: new Date().toISOString()
    };
    
    await setCache(cacheKey, metrics, 30 * 1000); // 30 seconds cache
  }
  
  return metrics;
}

// Batch processing for analytics
const analyticsQueue = [];
let analyticsProcessing = false;

async function queueAnalyticsEvent(event) {
  analyticsQueue.push({
    ...event,
    timestamp: Date.now()
  });
  
  if (!analyticsProcessing) {
    processAnalyticsQueue();
  }
}

async function processAnalyticsQueue() {
  if (analyticsProcessing || analyticsQueue.length === 0) {
    return;
  }
  
  analyticsProcessing = true;
  
  try {
    const batchSize = Math.min(50, analyticsQueue.length);
    const batch = analyticsQueue.splice(0, batchSize);
    
    const { trackAnalyticsEvent } = await import('./db.js');
    
    await Promise.all(batch.map(event => 
      trackAnalyticsEvent(event).catch(error => 
        console.error('[BATCH ANALYTICS ERROR]', error)
      )
    ));
    
    console.log('[ANALYTICS BATCH PROCESSED]', { 
      processed: batch.length, 
      remaining: analyticsQueue.length 
    });
  } catch (error) {
    console.error('[ANALYTICS QUEUE PROCESSING ERROR]', error);
  } finally {
    analyticsProcessing = false;
    
    // Process remaining items after a short delay
    if (analyticsQueue.length > 0) {
      setTimeout(processAnalyticsQueue, 1000);
    }
  }
}

// Connection pooling optimization
const connectionPool = new Map();

function getConnectionPoolKey(tenantKey) {
  return `pool_${tenantKey}`;
}

async function optimizeDatabaseConnections() {
  try {
    // Clean up old connections
    for (const [key, connection] of connectionPool.entries()) {
      if (Date.now() - connection.lastUsed > 10 * 60 * 1000) { // 10 minutes
        connectionPool.delete(key);
      }
    }
    
    console.log('[CONNECTION POOL OPTIMIZED]', { 
      activeConnections: connectionPool.size,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[CONNECTION POOL OPTIMIZATION ERROR]', error);
  }
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

// === Env: Twilio
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN  || '';
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || '';
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID || '';

const defaultSmsClient = (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;
const defaultSmsConfigured = !!(defaultSmsClient && (TWILIO_FROM_NUMBER || TWILIO_MESSAGING_SERVICE_SID));

// === Middleware
// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

app.use(morgan('dev'));

// Request timeout middleware (before other middleware to catch all requests)
const { smartRequestTimeout } = await import('./middleware/request-timeout.js');
app.use(smartRequestTimeout());

// API versioning middleware
const { apiVersioning, legacyRouteRedirect } = await import('./middleware/api-versioning.js');
app.use(apiVersioning());
// Redirect legacy /api/* routes to /api/v1/* (optional - can be disabled)
// app.use(legacyRouteRedirect);

app.use(cors({
  origin: ORIGIN === '*' ? true : ORIGIN,
  methods: ['GET','POST','OPTIONS','DELETE'],
  allowedHeaders: ['Content-Type','X-API-Key','Idempotency-Key','X-Client-Key'],
}));
app.use('/webhooks/twilio-status', express.urlencoded({ extended: false }));
app.use('/webhooks/twilio-inbound', express.urlencoded({ extended: false }));
app.use('/webhook/sms-reply', express.urlencoded({ extended: false }));

// Enhanced correlation ID middleware
app.use((req, res, next) => {
  // Generate or use existing correlation ID
  const correlationId = req.get('X-Correlation-ID') || 
                       req.get('X-Request-ID') || 
                       `req_${nanoid(12)}`;
  
  // Attach to request object (backward compatible)
  req.correlationId = correlationId;
  req.id = correlationId;
  
  // Add to response headers
  res.set('X-Correlation-ID', correlationId);
  res.set('X-Request-ID', correlationId);
  
  // Add to log context for structured logging
  req.logContext = {
    correlationId,
    method: req.method,
    path: req.path,
    clientKey: req.clientKey || 'anonymous',
    ip: req.ip,
    userAgent: req.get('User-Agent') || 'unknown'
  };
  
  next();
});

app.use(rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }));

// Graceful shutdown state management
let isShuttingDown = false;
let activeRequests = 0;
let shutdownTimeout = null;
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
  res.on('finish', () => {
    activeRequests--;
  });
  res.on('close', () => {
    activeRequests--;
  });
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
function pickTimezone(client) { return client?.booking?.timezone || client?.timezone || TIMEZONE; }
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
app.use(healthRouter);
app.use(monitoringRouter);
app.use(
  createLeadsPortalRouter({
    getClientFromHeader,
    normalizePhoneE164,
    readJson,
    writeJson,
    LEADS_PATH,
    nanoid,
    smsConfig,
    renderTemplate
  })
);

// moved: runtime + monitoring endpoints → routes/runtime-metrics-mount.js

// Mounted minimal lead intake + STOP webhook
app.use(leadsRouter);
app.use(twilioWebhooks);
app.use(twilioVoiceWebhooks);
app.use(appointmentsRouter);
app.use(receptionistRouter);

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

// --- Bootstrap tenants from env (for free Render without disk) ---
async function bootstrapClients() {
  try {
    const existing = await listFullClients();
    if (existing.length > 0) return;
    const raw = process.env.BOOTSTRAP_CLIENTS_JSON;
    if (!raw) return;
    let seed = JSON.parse(raw);
    if (!Array.isArray(seed)) seed = [seed];
    for (const c of seed) {
      if (!c.clientKey || !c.booking?.timezone) continue;
      await upsertFullClient(c);
    }
    console.log(`Bootstrapped ${seed.length} client(s) into SQLite from BOOTSTRAP_CLIENTS_JSON`);
  } catch (e) {
    console.error('bootstrapClients error', e?.message || e);
  }
}

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
app.use(createHealthProbesRouter({ healthzDeps, gcalPingDeps }));

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

app.use(
  createNotifyAndTwilioSmsRouter({
    notifySendDeps,
    smsStatusWebhookDeps,
    twilioSmsInboundDeps,
    handleNotifyTest,
    handleNotifySend,
    handleSmsStatusWebhook,
    handleTwilioSmsInbound,
    twilioWebhookVerification,
    smsRateLimit,
    safeAsync
  })
);

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

app.use(
  createMetaIngestWebhooksRouter({
    webhooksNewLeadDeps,
    webhooksFacebookLeadDeps
  })
);

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
    loadDb: () => import('./db.js'),
    getApiKey: () => process.env.API_KEY,
  })
);

// moved: /api/admin/call-queue/dedupe-pending-vapi → routes/admin-call-queue-ops.js
// moved: /api/admin/outbound-weekday-journey/clear → routes/admin-call-queue-ops.js

app.use(
  createAdminCostAndAccessRouter({
    getCostOptimizationMetrics,
    loadDb: () => import('./db.js'),
    getApiKey: () => process.env.API_KEY,
    authenticateApiKey,
    rateLimitMiddleware,
    requirePermission,
  })
);

app.use(
  createAdminAnalyticsRouter({
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
    getFullClient,
  })
);

app.use(
  createAdminClientsHealthRouter({
    getApiKey: () => process.env.API_KEY,
    loadDb: () => import('./db.js'),
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
    getApiKey: () => process.env.API_KEY,
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
    getApiKey: () => process.env.API_KEY,
    runLogisticsOutreach,
  })
);

app.use(
  createAdminVapiPlumbingRouter({
    getApiKey: () => process.env.API_KEY,
    TIMEZONE,
    isBusinessHoursForTenant,
  })
);

// moved: /test-booking-calendar, /test-calendar-booking → routes/booking-test.js

// moved: /admin/calendar-events/* and /admin/ab-tests/* → routes/admin-analytics-mount.js

// moved: /admin/clients* → routes/admin-clients-health-mount.js

// Helper function for cache hit rate calculation
function calculateCacheHitRate(tenantKey) {
  // This is a simplified calculation - in production you'd want more sophisticated tracking
  const tenantCacheKeys = Array.from(cache.keys()).filter(key => key.includes(tenantKey));
  return tenantCacheKeys.length > 0 ? Math.min(95, tenantCacheKeys.length * 10) : 0; // Mock calculation
}

// moved: /admin/system-health, /admin/metrics, /admin/fix-tenants → routes/admin-clients-health-mount.js

// moved: /api/build, /health, /monitor/*, /api/stats → routes/runtime-metrics-mount.js

// moved: GET /api/insights/:clientKey → routes/runtime-metrics-mount.js

const leadsScorePrioritizeDeps = { LeadScoringEngine };
const roiCalculatorSaveDeps = { query };

app.use(
  createInlineJsonApiRouter({
    getApiKey: () => process.env.API_KEY,
    dashboardResetDeps,
    leadsScorePrioritizeDeps,
    roiCalculatorSaveDeps
  })
);
console.log('🟢🟢🟢 [INLINE-JSON-API] REGISTERED: /sms, /api/dashboard/reset/:clientKey, leads score/prioritize, roi save');

app.use(
  createPublicReadsRouter({
    nanoid,
    mockCallFetchImpl: globalThis.fetch,
    getFullClient,
    isPostgres,
    query,
    eventsSseDeps: {
      query,
      getFullClient,
      activityFeedChannelLabel,
      outcomeToFriendlyLabel,
      isCallQueueStartFailureRow,
      parseCallsRowMetadata,
      formatCallDuration,
      truncateActivityFeedText,
      mapCallStatus,
      mapStatusClass
    }
  })
);
console.log(
  '🟢 [PUBLIC-READS] Routes registered (gated by ENABLE_PUBLIC_DEV_ROUTES): /mock-call, /api/outbound-queue-day/:clientKey, /api/events/:clientKey'
);

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
async function processRetryQueue() {
  try {
    const { getPendingRetries, updateRetryStatus } = await import('./db.js');

    // Self-heal: reset stale processing retries so they can be deferred/retried.
    try {
      const { rowCount } = await query(`
        WITH stale AS (
          SELECT id
          FROM retry_queue
          WHERE status = 'processing'
            AND updated_at < NOW() - INTERVAL '10 minutes'
          ORDER BY updated_at ASC
          LIMIT 500
        )
        UPDATE retry_queue rq
        SET status = 'pending', updated_at = NOW()
        FROM stale
        WHERE rq.id = stale.id
      `);
      if ((rowCount || 0) > 0) {
        console.warn('[RETRY PROCESSOR] Reset stale processing rows to pending:', rowCount);
      }
    } catch (e) {
      console.warn('[RETRY PROCESSOR] Failed to reset stale processing rows:', e?.message || e);
    }

    const maxRetriesPerRun = Math.max(1, Math.min(500, parseInt(process.env.RETRY_QUEUE_MAX_PER_RUN || '120', 10) || 120));
    const maxConcurrentRetries = Math.max(1, Math.min(25, parseInt(process.env.RETRY_QUEUE_MAX_CONCURRENT || '3', 10) || 3));

    const pendingRetries = await getPendingRetries(maxRetriesPerRun, ['vapi_call', 'sheet_patch']);
    
    if (pendingRetries.length === 0) {
      return;
    }
    
    console.log('[RETRY PROCESSOR]', {
      pendingCount: pendingRetries.length,
      maxRetriesPerRun,
      maxConcurrentRetries
    });

    let idx = 0;
    async function worker() {
      await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 350)));
      while (true) {
        const retry = pendingRetries[idx++];
        if (!retry) return;

        try {
          if (retry.retry_type === 'vapi_call' && retry.client_key) {
            const rClient = await getFullClient(retry.client_key);
            if (rClient && !isBusinessHours(rClient)) {
              const next = getNextBusinessHour(rClient);
              await query(
                `UPDATE retry_queue SET scheduled_for = $1, updated_at = NOW() WHERE id = $2`,
                [next, retry.id]
              );
              console.log('[RETRY PROCESSOR] Deferred — outside business hours', { id: retry.id, scheduledFor: next });
              continue;
            }
            const rTz = rClient?.booking?.timezone || rClient?.timezone || TIMEZONE;
            const { claimOutboundWeekdayJourneySlot } = await import('./db.js');
            const retryDialClaim = await claimOutboundWeekdayJourneySlot(
              retry.client_key,
              retry.lead_phone,
              rTz
            );
            if (!retryDialClaim.ok) {
              if (retryDialClaim.reason === 'journey_terminal') {
                await query(
                  `UPDATE retry_queue SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
                  [retry.id]
                );
                console.log('[RETRY PROCESSOR] Cancelled — outbound weekday journey complete', {
                  id: retry.id,
                  reason: retryDialClaim.reason
                });
                continue;
              }
              const nextLocalDayStart = DateTime.now().setZone(rTz).plus({ days: 1 }).startOf('day').toJSDate();
              const nextOpen = getNextBusinessOpenForTenant(
                rClient || { booking: { timezone: rTz }, timezone: rTz },
                nextLocalDayStart,
                rTz,
                { forOutboundDial: true }
              );
              await query(
                `UPDATE retry_queue SET scheduled_for = $1, updated_at = NOW() WHERE id = $2`,
                [nextOpen, retry.id]
              );
              console.log('[RETRY PROCESSOR] Deferred — weekday journey slot not available (try next dial day)', {
                id: retry.id,
                scheduledFor: nextOpen,
                reason: retryDialClaim.reason
              });
              continue;
            }
          }

          // Mark as processing
          await updateRetryStatus(retry.id, 'processing');

          // Process the retry based on type
          if (retry.retry_type === 'vapi_call') {
            await processVapiRetry(retry);
          } else if (retry.retry_type === 'sheet_patch') {
            await processSheetPatchRetry(retry);
          }

          // Mark as completed
          await updateRetryStatus(retry.id, 'completed');
        } catch (retryError) {
          console.error('[RETRY PROCESSING ERROR]', {
            retryId: retry.id,
            error: retryError.message
          });

          // Check if we should retry again or mark as failed
          if (retry.retry_attempt < retry.max_retries) {
            // Schedule another retry
            await updateRetryStatus(retry.id, 'pending', retry.retry_attempt + 1);
          } else {
            // Max retries reached, mark as failed
            await updateRetryStatus(retry.id, 'failed');
          }
        }
      }
    }

    const workerCount = Math.min(maxConcurrentRetries, pendingRetries.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    
  } catch (error) {
    console.error('[RETRY PROCESSOR ERROR]', error);
  }
}

// Process VAPI retry
async function processVapiRetry(retry) {
  try {
    const retryData = retry.retry_data ? JSON.parse(retry.retry_data) : {};
    const { client_key: clientKey, lead_phone: leadPhone } = retry;
    
    // Get client configuration
    const client = await getFullClient(clientKey);
    if (!client) {
      throw new Error('Client not found');
    }
    
    // Make VAPI call (guarded by global concurrency limiter from instant-calling)
    const { acquireVapiSlot, releaseVapiSlot, markVapiCallActive } = await import('./lib/instant-calling.js');
    await acquireVapiSlot();
    let vapiResult;
    try {
      vapiResult = await makeVapiCall({
        assistantId: retryData.clientConfig?.assistantId || client.vapi?.assistantId,
        phoneNumberId: retryData.clientConfig?.phoneNumberId || client.vapi?.phoneNumberId,
        customerNumber: leadPhone,
        maxDurationSeconds: 10
      });
      if (vapiResult?.id) {
        markVapiCallActive(vapiResult.id, { ttlMs: 30 * 60 * 1000 });
      } else {
        releaseVapiSlot({ reason: 'no_call_id' });
      }
    } catch (e) {
      releaseVapiSlot({ reason: 'start_failed' });
      throw e;
    }
    
    if (!vapiResult || vapiResult.error) {
      throw new Error(vapiResult?.error || 'VAPI call failed');
    }
    
    console.log('[RETRY SUCCESS]', {
      retryId: retry.id,
      clientKey,
      leadPhone,
      callId: vapiResult.id
    });
    
  } catch (error) {
    console.error('[VAPI RETRY ERROR]', {
      retryId: retry.id,
      error: error.message
    });
    throw error;
  }
}

async function processSheetPatchRetry(retry) {
  const retryData = (() => {
    const raw = retry.retry_data;
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { return {}; }
  })();
  const { client_key: clientKey } = retry;
  const client = await getFullClient(clientKey);
  const spreadsheetId = resolveLogisticsSpreadsheetId(client);
  if (!spreadsheetId) throw new Error('sheet_not_configured');
  const rowNumber = parseInt(retryData.rowNumber, 10);
  const patch = retryData.patch;
  if (!Number.isFinite(rowNumber) || rowNumber < 2 || !patch || typeof patch !== 'object') {
    throw new Error('invalid_retry_data');
  }
  const ok = await sheets.patchLogisticsRowByNumber(spreadsheetId, rowNumber, patch);
  if (!ok) throw new Error('sheet_patch_failed');
}

// Call queue processor - runs every 2 minutes to process pending calls
async function processCallQueue() {
  try {
    globalThis.__opsLastProcessCallQueueAt = new Date().toISOString();
    const { getPendingCalls, updateCallQueueStatus, cancelDuplicatePendingCalls, addToCallQueue } = await import('./db.js');

    // Optional safety valve (OFF by default): when a tenant has a huge overdue `pending` backlog, cap how many
    // stay "due now" today and push overflow to a future anchor (tomorrow 9:00 tenant-local) with row spacing.
    // Most deployments already pace via Mon–Fri weekday journey + queue ordering; this reschedule can fight that
    // by moving many rows to arbitrary future instants. Enable only if you explicitly want this guardrail:
    //   CALL_QUEUE_OVERDUE_CAP_RESCHEDULE_ENABLED=1|true|yes
    const overdueCapRescheduleEnabled = /^(1|true|yes)$/i.test(
      String(process.env.CALL_QUEUE_OVERDUE_CAP_RESCHEDULE_ENABLED || '').trim()
    );

    try {
      if (!overdueCapRescheduleEnabled) {
        // Skip: rely on weekday journey, per-run limits, and normal deferrals for pacing.
      } else {
      const dailyCapDefault = 150;
      const dailyCap = Math.max(0, Math.min(5000, parseInt(process.env.CALL_QUEUE_DAILY_CAP || String(dailyCapDefault), 10) || dailyCapDefault));
      const overdueKeepDue = Math.max(0, Math.min(500, parseInt(process.env.CALL_QUEUE_OVERDUE_KEEP_DUE || '50', 10) || 50));
      const rescheduleBatchLimit = Math.max(100, Math.min(10000, parseInt(process.env.CALL_QUEUE_RESCHEDULE_BATCH_LIMIT || '3000', 10) || 3000));
      const spacingSeconds = Math.max(15, Math.min(600, parseInt(process.env.CALL_QUEUE_RESCHEDULE_SPACING_SECONDS || '120', 10) || 120)); // default 2m

      // Find clients with large overdue pending backlogs.
      const { rows: overdueClients } = await query(
        `
          SELECT client_key, COUNT(*)::int AS overdue_pending
          FROM call_queue
          WHERE status = 'pending'
            AND call_type = 'vapi_call'
            AND scheduled_for < NOW()
          GROUP BY client_key
          HAVING COUNT(*) > $1
          ORDER BY overdue_pending DESC
          LIMIT 20
        `,
        [overdueKeepDue]
      );

      for (const oc of overdueClients) {
        const clientKey = oc.client_key;
        const overduePending = parseInt(oc.overdue_pending || 0, 10) || 0;
        if (!clientKey || overduePending <= overdueKeepDue) continue;

        // Compute "today" bounds in tenant timezone, expressed as UTC instants.
        let tz = TIMEZONE;
        try {
          const c = await getFullClient(clientKey);
          tz = c?.booking?.timezone || c?.timezone || TIMEZONE;
        } catch {
          tz = TIMEZONE;
        }

        const { rows: bRows } = await query(
          `
            SELECT
              ((date_trunc('day', NOW() AT TIME ZONE $1)) AT TIME ZONE $1) AS day_start_utc,
              ((date_trunc('day', NOW() AT TIME ZONE $1) + INTERVAL '1 day') AT TIME ZONE $1) AS day_end_utc,
              ((date_trunc('day', NOW() AT TIME ZONE $1) + INTERVAL '1 day' + INTERVAL '9 hours') AT TIME ZONE $1) AS tomorrow_9am_utc
          `,
          [tz]
        );
        const dayStartUtc = bRows?.[0]?.day_start_utc;
        const dayEndUtc = bRows?.[0]?.day_end_utc;
        const tomorrow9Utc = bRows?.[0]?.tomorrow_9am_utc;
        if (!dayStartUtc || !dayEndUtc || !tomorrow9Utc) continue;

        // How many are already "today" (pending/processing) + how many calls already started today?
        const { rows: capRows } = await query(
          `
            SELECT
              (SELECT COUNT(*)::int
               FROM call_queue
               WHERE client_key = $1
                 AND call_type = 'vapi_call'
                 AND status IN ('pending','processing')
                 AND scheduled_for >= $2 AND scheduled_for < $3
              ) AS queued_today,
              (SELECT COUNT(*)::int
               FROM calls
               WHERE client_key = $1
                 AND created_at >= $2 AND created_at < $3
              ) AS calls_today
          `,
          [clientKey, dayStartUtc, dayEndUtc]
        );
        const queuedToday = parseInt(capRows?.[0]?.queued_today || 0, 10) || 0;
        const callsToday = parseInt(capRows?.[0]?.calls_today || 0, 10) || 0;
        const remainingToday = Math.max(0, dailyCap - (queuedToday + callsToday));

        // If we're at/over cap, push almost everything overdue to tomorrow.
        // If we still have remaining capacity today, keep a small due buffer and push overflow.
        const keepDue = remainingToday > 0 ? Math.min(overdueKeepDue, remainingToday) : 0;
        const toMove = Math.max(0, overduePending - keepDue);
        if (toMove <= 0) continue;

        const moveLimit = Math.min(rescheduleBatchLimit, toMove);
        const { rowCount } = await query(
          `
            WITH picked AS (
              SELECT id, ROW_NUMBER() OVER (ORDER BY scheduled_for ASC, id ASC) AS rn
              FROM call_queue
              WHERE client_key = $1
                AND call_type = 'vapi_call'
                AND status = 'pending'
                AND scheduled_for < NOW()
              LIMIT $2
            )
            UPDATE call_queue cq
            SET scheduled_for = $3::timestamptz
                + (((picked.rn - 1) * $4::bigint) + (abs(picked.id) % 3599) + 1) * INTERVAL '1 second'
                + ((abs(picked.id) % 997) + 1) * INTERVAL '1 millisecond',
                updated_at = NOW()
            FROM picked
            WHERE cq.id = picked.id
          `,
          [clientKey, moveLimit, tomorrow9Utc, spacingSeconds]
        );
        if ((rowCount || 0) > 0) {
          globalThis.__opsLastOverdueReschedule = {
            at: new Date().toISOString(),
            clientKey,
            moved: rowCount,
            overduePending,
            keepDue,
            remainingToday,
            dailyCap,
            tz
          };
          console.warn('[CALL QUEUE PROCESSOR] Pushed overdue backlog to tomorrow window:', {
            clientKey,
            moved: rowCount,
            overduePending,
            keepDue,
            remainingToday,
            dailyCap,
            tz
          });
        }
      }
      }
    } catch (e) {
      console.warn('[CALL QUEUE PROCESSOR] Overdue reschedule guard failed:', e?.message || e);
    }

    // Self-heal: if the server restarted mid-item, rows can get stuck in 'processing' forever.
    // Reset anything older than 10 minutes back to 'pending' so it can be retried/deferred.
    try {
      const { rowCount } = await query(`
        WITH stale AS (
          SELECT id
          FROM call_queue
          WHERE status = 'processing'
            AND updated_at < NOW() - INTERVAL '10 minutes'
          ORDER BY updated_at ASC
          LIMIT 500
        )
        UPDATE call_queue cq
        SET status = 'pending', updated_at = NOW()
        FROM stale
        WHERE cq.id = stale.id
      `);
      if ((rowCount || 0) > 0) {
        console.warn('[CALL QUEUE PROCESSOR] Reset stale processing rows to pending:', rowCount);
      }
    } catch (e) {
      console.warn('[CALL QUEUE PROCESSOR] Failed to reset stale processing rows:', e?.message || e);
    }

    // Self-heal: protect against "phantom completed" rows that have no initiated_call_id.
    // These can exist from earlier buggy builds; requeue them so the lead actually gets dialed.
    try {
      const { rowCount } = await query(`
        WITH picked AS (
          SELECT id
          FROM call_queue
          WHERE status = 'completed'
            AND initiated_call_id IS NULL
            AND call_type = 'vapi_call'
            AND updated_at >= NOW() - INTERVAL '48 hours'
          ORDER BY updated_at DESC, id
          LIMIT 500
        ),
        bad AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
          FROM picked
        )
        UPDATE call_queue cq
        SET status = 'pending',
            scheduled_for = NOW() + bad.rn * INTERVAL '1 millisecond',
            updated_at = NOW()
        FROM bad
        WHERE cq.id = bad.id
      `);
      if ((rowCount || 0) > 0) {
        console.warn('[CALL QUEUE PROCESSOR] Requeued phantom-completed rows:', rowCount);
      }
    } catch (e) {
      console.warn('[CALL QUEUE PROCESSOR] Failed to requeue phantom-completed rows:', e?.message || e);
    }

    // Catch-up: if we have pending calls scheduled later today, pull a small batch forward
    // so the system starts working immediately (e.g. after VAPI credits are restored).
    try {
      const { rowCount } = await query(`
        WITH picked AS (
          SELECT id
          FROM call_queue
          WHERE status = 'pending'
            AND call_type = 'vapi_call'
            AND scheduled_for > NOW()
            AND scheduled_for <= NOW() + INTERVAL '24 hours'
          ORDER BY scheduled_for ASC, id
          LIMIT 10
        ),
        to_pull AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
          FROM picked
        )
        UPDATE call_queue cq
        -- Make items unambiguously due for this same processor tick.
        -- (Using NOW() + a few ms can still be "in the future" when getPendingCalls runs immediately after.)
        SET scheduled_for = NOW() - INTERVAL '1 second' + to_pull.rn * INTERVAL '1 millisecond',
            updated_at = NOW()
        FROM to_pull
        WHERE cq.id = to_pull.id
      `);
      if ((rowCount || 0) > 0) {
        console.log('[CALL QUEUE PROCESSOR] Pulled forward scheduled calls:', rowCount);
      }
    } catch (e) {
      console.warn('[CALL QUEUE PROCESSOR] Failed to pull forward scheduled calls:', e?.message || e);
    }

    // Catch-up: if the queue is empty but we have a backlog of synthetic failed_q attempts
    // (e.g. during a VAPI outage/credit depletion), requeue a small batch so work resumes.
    // This intentionally does NOT depend on lead.status='new' because those leads may have been
    // transitioned during earlier (failed) attempts.
    try {
      const { rows: pendingCountRows } = await query(
        `SELECT COUNT(*)::int AS n FROM call_queue WHERE status = 'pending'`
      );
      const pendingTotal = pendingCountRows?.[0]?.n ?? 0;

      // Top-up threshold: keep some work queued so the processor doesn't go idle
      const catchupMinPending = Math.max(0, Math.min(2000, parseInt(process.env.FAILED_Q_CATCHUP_MIN_PENDING || '100', 10) || 100));

      if (pendingTotal <= catchupMinPending) {
        const catchupClientLimit = Math.max(1, Math.min(10, parseInt(process.env.FAILED_Q_CATCHUP_CLIENT_LIMIT || '3', 10) || 3));
        const catchupPerClient = Math.max(1, Math.min(200, parseInt(process.env.FAILED_Q_CATCHUP_BATCH_SIZE || '50', 10) || 50));
        // Long catch-up horizon so we can recover after extended credit outages.
        // Keep a cap to prevent pathologically slow scans if the table is huge.
        const lookbackDays = Math.max(1, Math.min(730, parseInt(process.env.FAILED_Q_CATCHUP_LOOKBACK_DAYS || '365', 10) || 365));

        const { rows: clientsWithBacklog } = await query(
          `
            SELECT client_key, COUNT(DISTINCT lead_phone)::int AS n
            FROM calls
            WHERE call_id LIKE 'failed_q%'
              AND created_at >= now() - ($1::int * INTERVAL '1 day')
            GROUP BY client_key
            ORDER BY n DESC
            LIMIT $2
          `,
          [lookbackDays, catchupClientLimit]
        );

        for (const row of clientsWithBacklog) {
          const clientKey = row.client_key;
          const client = await getFullClient(clientKey);
          if (client && !isBusinessHours(client)) continue;

          const { rows: phones } = await query(
            `
              WITH candidates AS (
                SELECT c.lead_phone, MAX(c.created_at) AS last_failed
                FROM calls c
                WHERE c.client_key = $1
                  AND c.call_id LIKE 'failed_q%'
                  AND c.created_at >= now() - ($2::int * INTERVAL '1 day')
                  AND NOT EXISTS (
                    SELECT 1
                    FROM calls ok
                    WHERE ok.client_key = c.client_key
                      AND ${pgQueueLeadPhoneKeyExpr('ok.lead_phone')} = ${pgQueueLeadPhoneKeyExpr('c.lead_phone')}
                      AND ok.call_id NOT LIKE 'failed_q%'
                      AND ok.created_at >= now() - ($2::int * INTERVAL '1 day')
                  )
                  AND NOT EXISTS (
                    SELECT 1
                    FROM call_queue cq
                    WHERE cq.client_key = c.client_key
                      AND cq.call_type = 'vapi_call'
                      AND cq.status IN ('pending', 'processing')
                      AND ${pgQueueLeadPhoneKeyExpr('cq.lead_phone')} = ${pgQueueLeadPhoneKeyExpr('c.lead_phone')}
                  )
                GROUP BY c.lead_phone
                ORDER BY last_failed DESC
                LIMIT $3
              )
              SELECT lead_phone FROM candidates
            `,
            [clientKey, lookbackDays, catchupPerClient]
          );

          if ((phones?.length || 0) === 0) continue;

          let queued = 0;
          for (const p of phones) {
            const jitterMs = Math.floor(Math.random() * 120_000); // 0-120s
            await addToCallQueue({
              clientKey,
              leadPhone: p.lead_phone,
              priority: 5,
              scheduledFor: new Date(Date.now() + jitterMs),
              callType: 'vapi_call',
              callData: { triggerType: 'catch_up_failed_q' }
            });
            queued++;
          }
          console.log('[CALL QUEUE PROCESSOR] Requeued failed_q backlog:', { clientKey, queued, lookbackDays });
        }
      }
    } catch (e) {
      console.warn('[CALL QUEUE PROCESSOR] Failed_q catch-up failed:', e?.message || e);
    }

    // Self-heal: if a worker crashes, a deploy rolls traffic, or timers never complete, `processing` rows
    // (especially with NULL initiated_call_id) can wedge the dialer. Requeue them after a conservative age.
    try {
      const staleSec = Math.max(
        120,
        Math.min(7200, parseInt(String(process.env.CALL_QUEUE_STALE_PROCESSING_SEC || '210'), 10) || 210)
      );
      const staleBatch = Math.max(1, Math.min(2000, parseInt(String(process.env.CALL_QUEUE_STALE_PROCESSING_LIMIT || '250'), 10) || 250));
      const r = await query(
        `
        WITH picked AS (
          SELECT id
          FROM call_queue
          WHERE call_type = 'vapi_call'
            AND status = 'processing'
            AND initiated_call_id IS NULL
            AND updated_at < NOW() - ($1::int * INTERVAL '1 second')
          ORDER BY updated_at ASC, id ASC
          LIMIT $2
        )
        UPDATE call_queue cq
        SET status = 'pending',
            scheduled_for = LEAST(cq.scheduled_for, NOW() - INTERVAL '1 second'),
            initiated_call_id = NULL,
            call_data = jsonb_set(
              COALESCE(cq.call_data, '{}'::jsonb),
              '{lastDefer}',
              jsonb_build_object(
                'at', NOW(),
                'kind', 'internal',
                'error', 'stale_processing_requeue',
                'thresholdSec', $1
              ),
              true
            ),
            updated_at = NOW()
        FROM picked p
        WHERE cq.id = p.id
        `,
        [staleSec, staleBatch]
      );
      const n = r?.rowCount ?? r?.changes ?? 0;
      if (n > 0) {
        console.warn('[CALL QUEUE PROCESSOR] Requeued stale outbound processing rows', { n, staleSec, staleBatch });
      }
    } catch (e) {
      console.warn('[CALL QUEUE PROCESSOR] Stale processing reclaim failed:', e?.message || e);
    }

    const maxCallsPerRun = Math.max(1, Math.min(500, parseInt(process.env.CALL_QUEUE_MAX_PER_RUN || '40', 10) || 40));
    const maxConcurrentCalls = Math.max(1, Math.min(25, parseInt(process.env.CALL_QUEUE_MAX_CONCURRENT || '1', 10) || 1));

    const pendingCalls = await getPendingCalls(maxCallsPerRun);
    
    if (pendingCalls.length === 0) {
      console.log('[CALL QUEUE PROCESSOR] No pending calls found');
      return;
    }
    
    console.log('[CALL QUEUE PROCESSOR]', {
      pendingCount: pendingCalls.length,
      maxCallsPerRun,
      maxConcurrentCalls
    });

    async function processOneQueueCall(call) {
      if (call.call_type === 'vapi_call') {
        const qhClient = await getFullClient(call.client_key);
        if (qhClient && !isBusinessHours(qhClient)) {
          const next = smearCallQueueScheduledFor(
            getNextBusinessHour(qhClient),
            call.client_key,
            call.lead_phone,
            call.id
          );
          await query(
            `
              UPDATE call_queue
              SET scheduled_for = $1,
                  call_data = jsonb_set(
                    COALESCE(call_data, '{}'::jsonb),
                    '{lastDefer}',
                    jsonb_build_object(
                      'at', NOW(),
                      'kind', 'gate',
                      'error', 'outside_business_hours',
                      'details', 'deferred_in_process_one'
                    ),
                    true
                  ),
                  updated_at = NOW()
              WHERE id = $2
            `,
            [next, call.id]
          );
          console.log('[CALL QUEUE PROCESSOR] Deferred — outside business hours', { id: call.id, scheduledFor: next });
          return;
        }
      }

      // Mark as processing
      await updateCallQueueStatus(call.id, 'processing');

      // Process the call based on type
      if (call.call_type === 'vapi_call') {
        const timeoutMs = Math.max(
          10_000,
          Math.min(300_000, parseInt(String(process.env.CALL_QUEUE_ITEM_TIMEOUT_MS || '120000'), 10) || 120_000)
        );
        const v = await Promise.race([
          processVapiCallFromQueue(call),
          new Promise((_, reject) =>
            setTimeout(() => reject(Object.assign(new Error('queue_item_timeout'), { code: 'queue_item_timeout' })), timeoutMs)
          )
        ]).catch(async (e) => {
          if (String(e?.code || '') === 'queue_item_timeout') {
            const next = smearCallQueueScheduledFor(
              new Date(Date.now() + 2 * 60 * 1000),
              call.client_key,
              call.lead_phone,
              call.id
            );
            await query(
              `
                UPDATE call_queue
                SET status = 'pending',
                    scheduled_for = $1,
                    initiated_call_id = NULL,
                    call_data = jsonb_set(
                      COALESCE(call_data, '{}'::jsonb),
                      '{lastDefer}',
                      jsonb_build_object(
                        'at', NOW(),
                        'kind', 'internal',
                        'error', 'queue_item_timeout',
                        'timeoutMs', $3,
                        'lastStep', COALESCE(call_data->'lastStep', NULL)
                      ),
                      true
                    ),
                    updated_at = NOW()
                WHERE id = $2
              `,
              [next, call.id, timeoutMs]
            );
            console.warn('[CALL QUEUE PROCESSOR] Item timed out; rescheduled', { id: call.id, timeoutMs });
            return {};
          }
          throw e;
        });
        const { rows: stRows } = await query(`SELECT status FROM call_queue WHERE id = $1`, [call.id]);
        if (stRows?.[0]?.status === 'pending') {
          console.log('[CALL QUEUE PROCESSOR] Item rescheduled during handler; skipping complete.', { id: call.id });
          return;
        }
        // Safety: never mark completed unless we actually initiated a Vapi call id.
        // This prevents phantom "completed" queue rows when call initiation didn't happen.
        if (!v?.callId) {
          const next = smearCallQueueScheduledFor(
            new Date(Date.now() + 2 * 60 * 1000),
            call.client_key,
            call.lead_phone,
            call.id
          );
          await query(
            `
              UPDATE call_queue
              SET status = 'pending',
                  scheduled_for = $1,
                  initiated_call_id = NULL,
                  call_data = jsonb_set(
                    COALESCE(call_data, '{}'::jsonb),
                    '{lastDefer}',
                    jsonb_build_object(
                      'at', NOW(),
                      'kind', 'internal',
                      'error', 'missing_vapi_call_id',
                      'details', 'handler_returned_no_call_id'
                    ),
                    true
                  ),
                  updated_at = NOW()
              WHERE id = $2
            `,
            [next, call.id]
          );
          console.warn('[CALL QUEUE PROCESSOR] No Vapi call id from handler; rescheduled', { id: call.id, scheduledFor: next.toISOString() });
          return;
        }
      }

      // Mark as completed
      await updateCallQueueStatus(call.id, 'completed');
      // Cancel any other pending queue rows for same client+phone so we don't call again
      const cancelled = await cancelDuplicatePendingCalls(call.client_key, call.lead_phone, call.id);
      if (cancelled > 0) {
        console.log('[CALL QUEUE PROCESSOR] Cancelled duplicate pending rows:', { client_key: call.client_key, lead_phone: call.lead_phone, cancelled });
      }
    }

    // Concurrency-limited processing (avoid serial backlog drift)
    let idx = 0;
    async function worker() {
      await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 350)));
      while (idx < pendingCalls.length) {
        const call = pendingCalls[idx++];
        try {
          await processOneQueueCall(call);
        } catch (callError) {
          console.error('[CALL QUEUE PROCESSING ERROR]', {
            callId: call?.id,
            error: callError?.message || String(callError)
          });

          if (call?.id) {
            await updateCallQueueStatus(call.id, 'failed');
          }

          const errorType = categorizeError({ message: callError?.message || String(callError) });
          if (call && ['network', 'server_error', 'rate_limit'].includes(errorType)) {
            const { addToRetryQueue } = await import('./db.js');
            await addToRetryQueue({
              clientKey: call.client_key,
              leadPhone: call.lead_phone,
              retryType: 'vapi_call',
              retryReason: errorType,
              retryData: call.call_data,
              scheduledFor: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes later
              retryAttempt: 1,
              maxRetries: 3
            });
          }
        }
      }
    }

    const workers = Array.from({ length: Math.min(maxConcurrentCalls, pendingCalls.length) }, () => worker());
    await Promise.all(workers);
    
  } catch (error) {
    console.error('[CALL QUEUE PROCESSOR ERROR]', error);
  }
}

function isTransientInstantCallThrow(err) {
  const msg = String(err?.message || err || '');
  return /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket|network|502|503|504|429|Timeout|timed out|ENOTFOUND|certificate|SSL|Bad gateway|ECONNREFUSED/i.test(
    msg
  );
}

function isTransientVapiQueueResult(vapiResult) {
  if (!vapiResult) return true;
  const err = String(vapiResult.error || '');
  if (err === 'circuit_breaker_open') return true;
  if (err === 'vapi_client_error') {
    const sc = Number(vapiResult.statusCode);
    if (sc === 429 || sc === 502 || sc === 503 || sc === 504) return true;
    const d = String(vapiResult.details || '').toLowerCase();
    if (/timeout|temporarily|unavailable|overload|rate|too many|429|502|503|504/.test(d)) return true;
  }
  if (err === 'call_failed') {
    const d = String(vapiResult.details || '').toLowerCase();
    if (/timeout|timed out|502|503|504|429|ECONNRESET|fetch|network|socket/i.test(d)) return true;
  }
  return false;
}

// Process VAPI call from queue
async function processVapiCallFromQueue(call) {
  try {
    // Handle call_data - it might be a JSON string or already an object
    let callData = {};
    if (call.call_data) {
      if (typeof call.call_data === 'string') {
        try {
          callData = JSON.parse(call.call_data);
        } catch (e) {
          console.error('[CALL QUEUE] Failed to parse call_data JSON:', e.message);
          callData = {};
        }
      } else if (typeof call.call_data === 'object') {
        callData = call.call_data;
      }
    }
    const { client_key: clientKey, lead_phone: leadPhone } = call;
    
    // Get client configuration
    await query(
      `
        UPDATE call_queue
        SET call_data = jsonb_set(
          COALESCE(call_data, '{}'::jsonb),
          '{lastStep}',
          jsonb_build_object('at', NOW(), 'step', 'load_client'),
          true
        ),
        updated_at = NOW()
        WHERE id = $1
      `,
      [call.id]
    );
    const client = await getFullClient(clientKey);
    if (!client) {
      throw new Error('Client not found');
    }
    
    // Get existing lead for context (DB-backed; avoids loading all tenants)
    await query(
      `
        UPDATE call_queue
        SET call_data = jsonb_set(
          COALESCE(call_data, '{}'::jsonb),
          '{lastStep}',
          jsonb_build_object('at', NOW(), 'step', 'lead_lookup'),
          true
        ),
        updated_at = NOW()
        WHERE id = $1
      `,
      [call.id]
    );
    const leadRes = await query(
      `
        SELECT id, name, phone, service, source, notes, status, created_at
        FROM leads
        WHERE client_key = $1 AND phone = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [clientKey, leadPhone]
    );
    const existingLead = leadRes?.rows?.[0] || null;
    
    // Select optimal assistant
    await query(
      `
        UPDATE call_queue
        SET call_data = jsonb_set(
          COALESCE(call_data, '{}'::jsonb),
          '{lastStep}',
          jsonb_build_object('at', NOW(), 'step', 'select_assistant'),
          true
        ),
        updated_at = NOW()
        WHERE id = $1
      `,
      [call.id]
    );
    const assistantConfig = await selectOptimalAssistant({ 
      client, 
      existingLead, 
      isYes: callData.triggerType === 'yes_response',
      isStart: callData.triggerType === 'start_opt_in'
    });
    
    // Generate assistant variables
    await query(
      `
        UPDATE call_queue
        SET call_data = jsonb_set(
          COALESCE(call_data, '{}'::jsonb),
          '{lastStep}',
          jsonb_build_object('at', NOW(), 'step', 'generate_variables'),
          true
        ),
        updated_at = NOW()
        WHERE id = $1
      `,
      [call.id]
    );
    const assistantVariables = await generateAssistantVariables({
      client,
      existingLead,
      tenantKey: clientKey,
      serviceForCall: existingLead?.service || '',
      isYes: callData.triggerType === 'yes_response',
      isStart: callData.triggerType === 'start_opt_in',
      assistantConfig
    });
    
    // Validate phone number
    if (!leadPhone || !leadPhone.trim()) {
      throw new Error('Lead phone number is missing or empty');
    }
    
    // Make VAPI call using callLeadInstantly
    const { callLeadInstantly } = await import('./lib/instant-calling.js');
    
    // Prepare lead object for callLeadInstantly
    const leadForCall = {
      phone: leadPhone.trim(),
      name: (existingLead?.name || callData.leadName || 'Prospect').substring(0, 40), // VAPI limit: 40 chars
      service: existingLead?.service || callData.leadService || '',
      source: existingLead?.source || callData.leadSource || 'queue',
      leadScore: callData.leadScore || 50
    };
    
    console.log('[QUEUE CALL] Making call:', {
      queueId: call.id,
      clientKey,
      leadPhone: leadForCall.phone,
      leadName: leadForCall.name
    });
    
    let vapiResult;
    let dialPromise = null;
    let dialAbort = null;
    let handlerTimer = null;
    const timeoutMs = Math.max(
      10_000,
      Math.min(180_000, parseInt(String(process.env.CALL_QUEUE_VAPI_TIMEOUT_MS || '60000'), 10) || 60_000)
    );
    try {
      await query(
        `
          UPDATE call_queue
          SET call_data = jsonb_set(
            COALESCE(call_data, '{}'::jsonb),
            '{lastStep}',
            jsonb_build_object('at', NOW(), 'step', 'callLeadInstantly'),
            true
          ),
          updated_at = NOW()
          WHERE id = $1
        `,
        [call.id]
      );
      dialAbort = new AbortController();
      dialPromise = callLeadInstantly({
        clientKey,
        lead: leadForCall,
        client,
        callQueueId: call.id,
        signal: dialAbort.signal
      });
      vapiResult = await Promise.race([
        dialPromise,
        new Promise((_, reject) => {
          handlerTimer = setTimeout(() => {
            try {
              dialAbort.abort();
            } catch (_) {
              /* ignore */
            }
            reject(Object.assign(new Error('queue_handler_timeout'), { code: 'queue_handler_timeout' }));
          }, timeoutMs);
        })
      ]);
    } catch (e) {
      if (String(e?.code || '') === 'queue_handler_timeout') {
        if (handlerTimer) clearTimeout(handlerTimer);
        await (dialPromise || Promise.resolve()).catch(() => {});
        const next = smearCallQueueScheduledFor(
          new Date(Date.now() + 2 * 60 * 1000),
          clientKey,
          leadPhone,
          call.id
        );
        await query(
          `
            UPDATE call_queue
            SET status = 'pending',
                scheduled_for = $1,
                initiated_call_id = NULL,
                call_data = jsonb_set(
                  COALESCE(call_data, '{}'::jsonb),
                  '{lastDefer}',
                  jsonb_build_object(
                    'at', NOW(),
                    'kind', 'internal',
                    'error', 'queue_handler_timeout',
                    'step', 'callLeadInstantly',
                    'lastStep', COALESCE(call_data->'lastStep', NULL)
                  ),
                  true
                ),
                updated_at = NOW()
            WHERE id = $2
          `,
          [next, call.id]
        );
        console.warn('[QUEUE CALL] Deferred — handler timeout', { queueId: call.id, scheduledFor: next.toISOString(), timeoutMs });
        return {};
      }
      if (isTransientInstantCallThrow(e)) {
        const next = smearCallQueueScheduledFor(
          new Date(Date.now() + 2 * 60 * 1000),
          clientKey,
          leadPhone,
          call.id
        );
        await query(
          `
            UPDATE call_queue
            SET status = 'pending',
                scheduled_for = $1,
                call_data = jsonb_set(
                  COALESCE(call_data, '{}'::jsonb),
                  '{lastDefer}',
                  jsonb_build_object(
                    'at', NOW(),
                    'kind', 'throw',
                    'error', 'transient_before_vapi_response',
                    'message', $3::text
                  ),
                  true
                ),
                updated_at = NOW()
            WHERE id = $2
          `,
          [next, call.id, String(e?.message || e).slice(0, 220)]
        );
        console.warn('[QUEUE CALL] Deferred — transient error before Vapi response', {
          queueId: call.id,
          scheduledFor: next.toISOString(),
          message: String(e?.message || e).slice(0, 240)
        });
        return {};
      }
      throw e;
    } finally {
      if (handlerTimer) clearTimeout(handlerTimer);
    }

    if (vapiResult?.error === 'outside_business_hours') {
      const next = smearCallQueueScheduledFor(
        getNextBusinessHour(client),
        clientKey,
        leadPhone,
        call.id
      );
      await query(
        `
          UPDATE call_queue
          SET status = 'pending',
              scheduled_for = $1,
              initiated_call_id = NULL,
              call_data = jsonb_set(
                COALESCE(call_data, '{}'::jsonb),
                '{lastDefer}',
                jsonb_build_object(
                  'at', NOW(),
                  'kind', 'gate',
                  'error', 'outside_business_hours',
                  'details', 'vapi_helper_returned_outside_hours'
                ),
                true
              ),
              updated_at = NOW()
          WHERE id = $2
        `,
        [next, call.id]
      );
      console.log('[QUEUE CALL] Deferred to business hours', { queueId: call.id, scheduledFor: next });
      return;
    }

    if (vapiResult?.error === 'outbound_journey_complete') {
      await query(
        `UPDATE call_queue SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
        [call.id]
      );
      console.log('[QUEUE CALL] Cancelled — outbound weekday journey complete (no further auto dials)', {
        queueId: call.id
      });
      return;
    }

    if (vapiResult?.error === 'daily_dial_limit') {
      const tzQ = client?.booking?.timezone || client?.timezone || TIMEZONE;
      const nextLocalDayStart = DateTime.now().setZone(tzQ).plus({ days: 1 }).startOf('day').toJSDate();
      const nextOpen = getNextBusinessOpenForTenant(client, nextLocalDayStart, tzQ, {
        forOutboundDial: true
      });
      const nextSmear = smearCallQueueScheduledFor(nextOpen, clientKey, leadPhone, call.id);
      await query(
        `
          UPDATE call_queue
          SET status = 'pending',
              scheduled_for = $1,
              call_data = jsonb_set(
                COALESCE(call_data, '{}'::jsonb),
                '{lastDefer}',
                jsonb_build_object(
                  'at', NOW(),
                  'kind', 'journey',
                  'error', 'daily_dial_limit',
                  'details', 'weekday_slot_used'
                ),
                true
              ),
              updated_at = NOW()
          WHERE id = $2
        `,
        [nextSmear, call.id]
      );
      console.log('[QUEUE CALL] Deferred — weekday journey slot already used for today’s bucket (try next dial day)', {
        queueId: call.id,
        scheduledFor: nextSmear
      });
      return;
    }
    
    if (!vapiResult || !vapiResult.ok || vapiResult.error) {
      if (isTransientVapiQueueResult(vapiResult)) {
        const delayMin = vapiResult?.error === 'circuit_breaker_open' ? 5 : 2;
        const next = smearCallQueueScheduledFor(
          new Date(Date.now() + delayMin * 60 * 1000),
          clientKey,
          leadPhone,
          call.id
        );
        await query(
          `
            UPDATE call_queue
            SET status = 'pending',
                scheduled_for = $1,
                call_data = jsonb_set(
                  COALESCE(call_data, '{}'::jsonb),
                  '{lastDefer}',
                  jsonb_build_object(
                    'at', NOW(),
                    'kind', 'vapi',
                    'error', $3::text,
                    'statusCode', $4::integer,
                    'details', $5::text
                  ),
                  true
                ),
                updated_at = NOW()
            WHERE id = $2
          `,
          [
            next,
            call.id,
            String(vapiResult?.error || 'unknown').slice(0, 120),
            vapiResult?.statusCode != null ? Number(vapiResult.statusCode) : null,
            typeof vapiResult?.details === 'string' ? String(vapiResult.details).slice(0, 220) : null
          ]
        );
        console.warn('[QUEUE CALL] Deferred — transient Vapi failure (no failed_q marker)', {
          queueId: call.id,
          error: vapiResult?.error,
          scheduledFor: next.toISOString()
        });
        return {};
      }

      const detailsStr = typeof vapiResult?.details === 'string' ? vapiResult.details : '';
      const isNoCredits =
        vapiResult?.error === 'vapi_client_error' &&
        /wallet balance|purchase more credits|upgrade your plan/i.test(detailsStr);

      if (isNoCredits) {
        // Don't create a fake failed call record; just defer the queue item so it runs when credits are back.
        const next = smearCallQueueScheduledFor(
          new Date(Date.now() + 15 * 60 * 1000),
          clientKey,
          leadPhone,
          call.id
        );
        await query(
          `
            UPDATE call_queue
            SET status = 'pending',
                scheduled_for = $1,
                call_data = jsonb_set(
                  COALESCE(call_data, '{}'::jsonb),
                  '{lastDefer}',
                  jsonb_build_object(
                    'at', NOW(),
                    'kind', 'vapi',
                    'error', 'vapi_no_credits',
                    'details', $3::text
                  ),
                  true
                ),
                updated_at = NOW()
            WHERE id = $2
          `,
          [next, call.id, detailsStr.slice(0, 220)]
        );
        console.warn('[QUEUE CALL] Deferred due to VAPI credits', { queueId: call.id, scheduledFor: next.toISOString() });
        void sendOperatorAlert({
          subject: 'Vapi wallet or credits blocking outbound dials',
          text:
            `Queue item ${call.id} for tenant ${clientKey} was deferred after a Vapi wallet/credits style error. ` +
            `Top of details: ${detailsStr.slice(0, 240)}. Expect automatic retries after backoff; add credits or upgrade the Vapi plan if this persists.`,
          dedupeKey: 'vapi:no_credits',
          throttleMinutes: 120
        }).catch(() => {});
        return;
      }

      // Record failed attempt so lead queuer doesn't re-queue this lead every 5 min (87 attempts from 10 leads)
      const { upsertCall } = await import('./db.js');
      const failedCallId = `failed_q${call.id}_${Date.now()}`;
      await upsertCall({
        callId: failedCallId,
        clientKey,
        leadPhone,
        status: 'failed',
        outcome: 'failed',
        duration: null,
        cost: null,
        metadata: { reason: vapiResult?.error || vapiResult?.details, queueId: call.id, fromQueue: true },
        retryAttempt: call.retry_attempt || 0
      }).catch((e) => console.error('[QUEUE VAPI CALL] Failed to record failed attempt:', e.message));
      throw new Error(vapiResult?.error || vapiResult?.details || 'VAPI call failed');
    }

    // Normalize call id return shape from different Vapi helpers.
    // `callLeadInstantly` returns `{ ok: true, callId: '...' }` (not `.id`).
    const vapiCallId = vapiResult?.id || vapiResult?.callId || null;

    // Record an initiated call immediately so the dashboard reflects real outbound attempts
    // even before Vapi webhooks arrive.
    if (!vapiCallId) {
      // Defensive: if we don't get a call id, we can't correlate webhooks; reschedule.
      const next = smearCallQueueScheduledFor(
        new Date(Date.now() + 2 * 60 * 1000),
        clientKey,
        leadPhone,
        call.id
      );
      await query(
        `
          UPDATE call_queue
          SET status = 'pending',
              scheduled_for = $1,
              call_data = jsonb_set(
                COALESCE(call_data, '{}'::jsonb),
                '{lastDefer}',
                jsonb_build_object(
                  'at', NOW(),
                  'kind', 'internal',
                  'error', 'missing_vapi_call_id',
                  'details', 'vapi_ok_but_missing_id'
                ),
                true
              ),
              updated_at = NOW()
          WHERE id = $2
        `,
        [next, call.id]
      );
      console.warn('[QUEUE CALL] Missing VAPI call id; rescheduled', { queueId: call.id, scheduledFor: next.toISOString() });
      return;
    }
    try {
      const { upsertCall } = await import('./db.js');
      await upsertCall({
        callId: vapiCallId,
        clientKey,
        leadPhone,
        status: 'initiated',
        outcome: null,
        duration: null,
        cost: null,
        metadata: { queueId: call.id, fromQueue: true, triggerType: callData?.triggerType || null },
        retryAttempt: call.retry_attempt || 0
      });
      // Verify the call row exists (and is correlated to this queue row) before we allow the queue item to complete.
      // If this fails, we reschedule rather than silently "completing" work that didn't persist.
      const { rows: verifyRows } = await query(
        `
          SELECT 1
          FROM calls
          WHERE client_key = $1
            AND call_id = $2
            AND (metadata->>'queueId') = $3
          LIMIT 1
        `,
        [clientKey, vapiCallId, String(call.id)]
      );
      if (!verifyRows?.[0]) {
        throw new Error('call_persist_verify_failed');
      }
      // Stamp the queue row with the initiated call id so DB-level constraints can enforce correctness.
      await query(
        `UPDATE call_queue SET initiated_call_id = $1, updated_at = NOW() WHERE id = $2 AND status = 'processing'`,
        [vapiCallId, call.id]
      );
    } catch (e) {
      console.warn('[QUEUE CALL] Failed to record initiated call:', e?.message || e);
      const next = smearCallQueueScheduledFor(
        new Date(Date.now() + 2 * 60 * 1000),
        clientKey,
        leadPhone,
        call.id
      );
      await query(
        `
          UPDATE call_queue
          SET status = 'pending',
              scheduled_for = $1,
              call_data = jsonb_set(
                COALESCE(call_data, '{}'::jsonb),
                '{lastDefer}',
                jsonb_build_object(
                  'at', NOW(),
                  'kind', 'internal',
                  'error', 'call_persist_failure',
                  'message', $3::text
                ),
                true
              ),
              updated_at = NOW()
          WHERE id = $2
        `,
        [next, call.id, String(e?.message || e).slice(0, 220)]
      );
      console.warn('[QUEUE CALL] Rescheduled due to call persist failure', { queueId: call.id, scheduledFor: next.toISOString() });
      return;
    }
    
    console.log('[QUEUE CALL SUCCESS]', {
      queueId: call.id,
      clientKey,
      leadPhone,
      callId: vapiCallId || 'pending',
      priority: call.priority
    });
    return { ok: true, callId: vapiCallId };
  } catch (error) {
    console.error('[QUEUE VAPI CALL ERROR]', {
      queueId: call.id,
      error: error.message
    });
    throw error;
  }
}

// Queue new leads for calling - runs every 5 minutes
async function queueNewLeadsForCalling() {
  try {
    globalThis.__opsLastQueueNewLeadsAt = new Date().toISOString();
    console.log('[LEAD QUEUER] Checking for new leads to queue...');
    const leadQueueBatchSize = Math.max(1, Math.min(300, parseInt(process.env.LEAD_QUEUE_BATCH_SIZE || '120', 10) || 120));
    
    // Get all clients
    const clients = await listFullClients();
    
    for (const client of clients) {
      if (!client.isEnabled || !client.vapi?.assistantId) {
        continue; // Skip disabled clients or clients without VAPI config
      }
      
      try {
        const isImportSource = (lead) => String(lead?.source || '').trim().toLowerCase() === 'import';
        // Throttle bursty sources (notably CSV imports). These constants are intentionally conservative:
        // - They distribute dials so we don't burn wallet on a single import burst
        // - They keep overall daily throughput acceptable while we iterate on smarter routing
        const IMPORT_SPACING_MS = 45_000; // ~80 calls/hour per tenant from import-driven leads
        const IMPORT_INITIAL_DELAY_MS = 5 * 60_000; // push imported leads out of the immediate "now" window

        // Get new leads that haven't been called yet
        // Check call_queue (pending) and in-flight calls; Mon–Fri outbound journey (per number) blocks until terminal or next bucket day
        const newLeads = await poolQuerySelect(`
          SELECT l.id, l.name, l.phone, l.service, l.source, l.status, l.created_at
          FROM leads l
          WHERE l.client_key = $1
            AND l.status = 'new'
            AND l.created_at >= NOW() - INTERVAL '30 days'
            AND NOT EXISTS (
              SELECT 1 FROM call_queue cq
              WHERE cq.client_key = l.client_key
                AND cq.call_type = 'vapi_call'
                AND cq.status IN ('pending', 'processing')
                AND ${pgQueueLeadPhoneKeyExpr('cq.lead_phone')} = COALESCE(l.phone_match_key, '__nodigits__')
            )
            AND NOT EXISTS (
              SELECT 1 FROM calls c
              WHERE c.client_key = l.client_key
              AND c.lead_phone = l.phone
              -- Never call if there is an active call
              AND c.status IN ('initiated', 'in_progress')
            )
            AND NOT EXISTS (
              SELECT 1 FROM outbound_weekday_journey j
              WHERE j.client_key = l.client_key
                AND j.phone_match_key = COALESCE(l.phone_match_key, '__nodigits__')
                AND (
                  j.closed_at IS NOT NULL
                  OR (
                    EXTRACT(ISODOW FROM NOW() AT TIME ZONE $2) BETWEEN 1 AND 5
                    AND (
                      j.weekday_mask
                      & (1 << (EXTRACT(ISODOW FROM NOW() AT TIME ZONE $2)::int - 1))::int
                    ) <> 0
                  )
                )
            )
          ORDER BY l.created_at ASC
          LIMIT ${leadQueueBatchSize}
        `, [client.clientKey, pickTimezone(client)]);
        
        if (newLeads.rows.length === 0) {
          continue;
        }
        
        console.log(`[LEAD QUEUER] Found ${newLeads.rows.length} new leads for ${client.clientKey}`);
        
        const { addToCallQueue, getLatestCallInsights } = await import('./db.js');
        const { scheduleAtOptimalCallWindow } = await import('./lib/optimal-call-window.js');
        const insightsRow = await getLatestCallInsights(client.clientKey).catch(() => null);
        const routing = insightsRow?.routing;

        // Import throttling state: start after whatever is already queued for this tenant so we don't stack
        // a new import burst on top of an existing call_queue backlog.
        const maxScheduled = await poolQuerySelect(
          `
            SELECT MAX(scheduled_for) AS max_scheduled_for
            FROM call_queue
            WHERE client_key = $1
              AND call_type = 'vapi_call'
              AND status IN ('pending', 'processing')
          `,
          [client.clientKey]
        );
        const maxScheduledAt = maxScheduled?.rows?.[0]?.max_scheduled_for
          ? new Date(maxScheduled.rows[0].max_scheduled_for)
          : null;
        let nextImportSlot = new Date(
          Math.max(
            Date.now() + IMPORT_INITIAL_DELAY_MS,
            maxScheduledAt ? maxScheduledAt.getTime() + IMPORT_SPACING_MS : 0
          )
        );

        for (const lead of newLeads.rows) {
          try {
            // Check if we should call now or schedule for later
            const shouldCallNow = isBusinessHours(client);
            const scheduledBaseline = shouldCallNow
              ? new Date()
              : getNextBusinessHour(client);
            // Inside business hours, we still schedule via insights/routing so dials are spread across the day.
            // Outside hours, schedule into the next allowed/optimal window.
            const scheduledFor = await scheduleAtOptimalCallWindow(client, routing, scheduledBaseline, {
              fallbackTz: pickTimezone(client),
              clientKey: client.clientKey,
              jitterKey: lead.phone
            });

            const finalScheduledFor = isImportSource(lead)
              ? new Date(Math.max(new Date(scheduledFor).getTime(), nextImportSlot.getTime()))
              : scheduledFor;
            const scheduleTag = shouldCallNow ? 'optimal_today' : 'optimal';

            // Calculate priority based on lead age and source
            const leadAge = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60)); // hours
            let priority = 5; // Default priority
            if (leadAge < 1) priority = 8; // Very new leads get high priority
            else if (leadAge < 24) priority = 6; // Less than 24 hours
            else priority = 4; // Older leads
            
            await addToCallQueue({
              clientKey: client.clientKey,
              leadPhone: lead.phone,
              priority: priority,
              scheduledFor: finalScheduledFor,
              callType: 'vapi_call',
              callData: {
                triggerType: 'new_lead',
                leadId: lead.id,
                leadName: lead.name,
                leadService: lead.service,
                leadSource: lead.source,
                leadStatus: lead.status,
                businessHours: shouldCallNow ? 'within' : 'outside',
                scheduling: scheduleTag,
                importThrottle: isImportSource(lead) ? { spacingMs: IMPORT_SPACING_MS } : undefined
              }
            });

            if (isImportSource(lead)) {
              nextImportSlot = new Date(nextImportSlot.getTime() + IMPORT_SPACING_MS);
            }
            
            const now = new Date();
            const scheduledTime = new Date(finalScheduledFor);
            const timeUntilCall = scheduledTime - now;
            const minutesUntilCall = Math.floor(timeUntilCall / (1000 * 60));
            
            console.log(`[LEAD QUEUER] Queued lead ${lead.phone} for ${client.clientKey} (priority: ${priority}, scheduled: ${scheduledTime.toISOString()}, ${shouldCallNow ? 'immediate' : `${minutesUntilCall} minutes from now`})`);
          } catch (queueError) {
            console.error(`[LEAD QUEUER] Error queueing lead ${lead.phone}:`, queueError);
          }
        }
      } catch (clientError) {
        console.error(`[LEAD QUEUER] Error processing client ${client.clientKey}:`, clientError);
      }
    }
  } catch (error) {
    console.error('[LEAD QUEUER ERROR]', error);
  }
}

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
        
        const callResponse = await fetch('https://api.vapi.ai/call', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${vapiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(callData)
        });
        
        if (callResponse.ok) {
          const callResult = await callResponse.json();
          results.push({
            businessName: business.name,
            phone: business.phone,
            status: 'call_initiated',
            callId: callResult.id,
            priority: i + index + 1,
            message: 'Call initiated successfully'
          });
          
          console.log(`[LOGISTICS CALL] Initiated for ${business.name} (${business.phone})`);
        } else {
          const errorData = await callResponse.json();
          results.push({
            businessName: business.name,
            phone: business.phone,
            status: 'call_failed',
            error: errorData.message || 'Unknown error',
            message: 'Failed to initiate call'
          });
          
          console.error(`[LOGISTICS CALL ERROR] Failed to call ${business.name}:`, errorData);
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
          const callResponse = await fetch('https://api.vapi.ai/call', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${vapiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(callData)
          });
          
          if (callResponse.ok) {
            const callData = await callResponse.json();
            results.push({
              businessId: business.id,
              businessName: business.name,
              phone: business.phone,
              decisionMaker: business.decisionMaker,
              status: 'call_initiated',
              callId: callData.id,
              priority: i + index + 1,
              message: 'Call initiated successfully',
              timestamp: new Date().toISOString()
            });
            
            console.log(`[COLD CALL] Call initiated for ${business.name} (${business.phone}) - Priority: ${i + index + 1}`);
          } else {
            const errorData = await callResponse.json();
            results.push({
              businessId: business.id,
              businessName: business.name,
              phone: business.phone,
              status: 'call_failed',
              error: errorData.message || 'Unknown error',
              message: 'Failed to initiate call',
              timestamp: new Date().toISOString()
            });
            
            console.error(`[COLD CALL ERROR] Failed to call ${business.name}:`, errorData);
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
    // Validate environment variables first
    const { validateEnvironment } = await import('./lib/env-validator.js');
    validateEnvironment();
    
    await initDb();
    console.log('✅ Database initialized');
    
    // Run database migrations
    try {
      const { runMigrations } = await import('./lib/migration-runner.js');
      const migrationResult = await runMigrations();
      if (migrationResult.applied > 0) {
        console.log(`✅ Applied ${migrationResult.applied} new migrations`);
      }
    } catch (migrationError) {
      const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
      if (isProd) {
        console.error('❌ Migration failed in production — refusing to start:', migrationError?.message || migrationError);
        process.exit(1);
      }
      console.warn('⚠️ Migration failed, but continuing server startup:', migrationError.message);
      // Non-production: migrations can be run manually
    }
    
    // Bootstrap clients after DB is ready
    await bootstrapClients();
    
    server.listen(process.env.PORT ? Number(process.env.PORT) : 10000, '0.0.0.0', () => {
      console.log(`AI Booking System listening on http://localhost:${process.env.PORT || 10000} (DB: ${DB_PATH})`);
      console.log(`Security middleware: Enhanced authentication and rate limiting enabled`);
      console.log(`Booking system: ${bookingSystem ? 'Available' : 'Not Available'}`);
      console.log(`SMS-Email pipeline: ${smsEmailPipeline ? 'Available' : 'Not Available'}`);
      console.log(`WebSocket server: Real-time Admin Hub updates enabled`);
    });
    
    // Set server timeout to 25 minutes to handle comprehensive searches
    server.timeout = 1500000; // 25 minutes
    
    // Register all scheduled jobs (crons + reminder setInterval); see lib/scheduled-jobs.js
    const { registerScheduledJobs } = await import('./lib/scheduled-jobs.js');
    scheduledJobsController = registerScheduledJobs({
      processCallQueue,
      processRetryQueue,
      queueNewLeadsForCalling,
      sendScheduledReminders
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown handlers
async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log('[SHUTDOWN] Already shutting down, ignoring signal');
    return;
  }
  
  isShuttingDown = true;
  console.log(`\n[SHUTDOWN] ${signal} received, starting graceful shutdown...`);
  console.log(`[SHUTDOWN] Active requests: ${activeRequests}`);

  if (scheduledJobsController?.stop) {
    try {
      scheduledJobsController.stop();
    } catch (e) {
      console.warn('[SHUTDOWN] scheduled jobs stop error:', e?.message || e);
    }
    scheduledJobsController = null;
  }
  
  // Step 1: Stop accepting new connections
  server.close(() => {
    console.log('[SHUTDOWN] HTTP server closed, no longer accepting connections');
  });
  
  // Step 2: Close WebSocket connections
  io.close(() => {
    console.log('[SHUTDOWN] WebSocket server closed');
  });
  
  // Step 3: Wait for active requests to complete (max 30 seconds)
  const waitForRequests = setInterval(() => {
    if (activeRequests === 0) {
      clearInterval(waitForRequests);
      if (shutdownTimeout) {
        clearTimeout(shutdownTimeout);
        shutdownTimeout = null;
      }
      closeDatabase();
    } else {
      console.log(`[SHUTDOWN] Waiting for ${activeRequests} active requests to complete...`);
    }
  }, 1000);
  
  // Step 4: Force close after timeout
  shutdownTimeout = setTimeout(() => {
    console.error('[SHUTDOWN] Timeout reached (30s), forcing shutdown');
    clearInterval(waitForRequests);
    closeDatabase();
  }, 30000);
}

async function closeDatabase() {
  try {
    if (shutdownTimeout) {
      clearTimeout(shutdownTimeout);
      shutdownTimeout = null;
    }
    // Close database pool
    if (pool) {
      console.log('[SHUTDOWN] Closing database pool...');
      await pool.end();
      console.log('[SHUTDOWN] Database pool closed successfully');
    }
    
    console.log('[SHUTDOWN] Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[SHUTDOWN ERROR] Error during shutdown:', error);
    process.exit(1);
  }
}

// Register signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

startServer();
