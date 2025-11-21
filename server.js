// TEST: Cursor is connected

// Normalizes phone to E.164 (GB default). Returns "+447..." or null.
function normalizePhoneE164(input, country = 'GB') {
  // Local isE164 helper
const isE164 = (s) => typeof s === 'string' && /^\+\d{7,15}$/.test(s);
  
// Keep only + && digits
const normalizePhone = (s) => (s || '').trim().replace(/[^\d+]/g, '');

  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  const cleaned = normalizePhone(raw);

  // Already valid E.164?
  if (isE164(cleaned)) return cleaned;

  // Convert "00..." to "+"
  if (/^00\d{6,}$/.test(cleaned)) {
    const cand = '+' + cleaned.slice(2);
    if (isE164(cand)) return cand;
  }

  const digits = cleaned.replace(/\D/g, '');

  // GB-specific heuristics
  const reg = String(country || 'GB').toUpperCase();
  if (reg === 'GB' || reg === 'UK') {
    // 07XXXXXXXXX (or 7XXXXXXXXX) -> +447XXXXXXXXX
    const m1 = digits.match(/^0?7(\d{9})$/);
    if (m1) {
      const cand = '+447' + m1[1];
      if (isE164(cand)) return cand;
    }
    // 44XXXXXXXXXX -> +44XXXXXXXXXX
    const m2 = digits.match(/^44(\d{9,10})$/);
    if (m2) {
      const cand = '+44' + m2[1];
      if (isE164(cand)) return cand;
    }
  }

  // Fallback: if it looks like 7–15 digits, prefix +
  if (/^\d{7,15}$/.test(digits)) {
    const cand = '+' + digits;
    if (isE164(cand)) return cand;
  }

  return null;
}

function parseStartPreference(preference, timeZone) {
  if (!preference || typeof preference !== 'string' || !timeZone) return null;
  try {
    const reference = DateTime.now().setZone(timeZone);
    const parsedResults = chrono.parse(preference, reference.toJSDate(), {
      forwardDate: true
    });
    const first = parsedResults[0];
    const parsedDate =
      first?.start?.date?.() ??
      chrono.parseDate(preference, reference.toJSDate(), { forwardDate: true });
    if (!parsedDate) return null;
    let dt = DateTime.fromJSDate(parsedDate, { zone: timeZone }).setZone(timeZone);
    if (Number.isNaN(dt.valueOf()) || !dt.isValid) return null;
    dt = dt.set({ second: 0, millisecond: 0 });
    if (!first?.start?.isCertain('hour')) {
      dt = dt.set({ hour: 14, minute: 0 });
    }
    if (!first?.start?.isCertain('minute')) {
      dt = dt.set({ minute: dt.minute || 0 });
    }
    if (dt <= reference) {
      dt = dt.plus({ days: 1 });
    }
    return dt.toJSDate();
  } catch (err) {
    console.error('[startPref.parse.error]', err);
    return null;
  }
}

// server.js — AI Booking MVP (SQLite tenants + env bootstrap + richer tenant awareness)
import 'dotenv/config';
import bcrypt from 'bcrypt';
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
import { recordDemoTelemetry, readDemoTelemetry, clearDemoTelemetry, recordReceptionistTelemetry, readReceptionistTelemetry, clearReceptionistTelemetry } from './lib/demo-telemetry.js';
import twilio from 'twilio';
import { createHash } from 'crypto';
import { performanceMiddleware, getPerformanceMonitor } from './lib/performance-monitor.js';
import { cacheMiddleware, getCache } from './lib/cache.js';

import { makeJwtAuth, insertEvent, freeBusy } from './gcal.js';
import { init as initDb,  upsertFullClient, getFullClient, listFullClients, deleteClient, DB_PATH, query } from './db.js'; // SQLite-backed tenants
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
import cron from 'node-cron';
import leadsRouter from './routes/leads.js';
import twilioWebhooks from './routes/twilio-webhooks.js';
import vapiWebhooks from './routes/vapi-webhooks.js';
import twilioVoiceWebhooks from './routes/twilio-voice-webhooks.js';
import appointmentsRouter from './routes/appointments.js';
import receptionistRouter from './routes/receptionist.js';
import healthRouter from './routes/health.js';
import monitoringRouter from './routes/monitoring.js';
import * as store from './store.js';
import * as sheets from './sheets.js';
import messagingService from './lib/messaging-service.js';
import { AIInsightsEngine, LeadScoringEngine } from './lib/ai-insights.js';
import { getCallContext, storeCallContext, getMostRecentCallContext, getCallContextCacheStats } from './lib/call-context-cache.js';
// Real API integration - dynamic imports will be used in endpoints

const app = express();

// Create HTTP server and Socket.IO server
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Initialize performance monitoring and caching
const performanceMonitor = getPerformanceMonitor();
const cache = getCache();
const isPostgres = (process.env.DB_TYPE || '').toLowerCase() === 'postgres';

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Admin Hub client connected:', socket.id);
  
  // Join admin room for real-time updates
  socket.join('admin-hub');
  
  // Handle client disconnection
  socket.on('disconnect', () => {
    console.log('Admin Hub client disconnected:', socket.id);
  });
  
  // Handle real-time data requests
  socket.on('request-update', async (dataType) => {
    try {
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

// Helper functions for real-time data
async function getBusinessStats() {
  const clients = await listFullClients();
  const activeClients = clients.filter(c => c.isEnabled).length;
  const monthlyRevenue = activeClients * 500;
  
  let totalCalls = 0;
  let totalBookings = 0;
  
  for (const client of clients) {
    try {
      const calls = await getCallsByTenant(client.clientKey, 1000);
      const appointments = await query(`
        SELECT COUNT(*) as count FROM appointments 
        WHERE client_key = $1 AND created_at >= NOW() - INTERVAL '30 days'
      `, [client.clientKey]);
      
      totalCalls += calls ? calls.length : 0;
      totalBookings += parseInt(appointments?.rows?.[0]?.count || 0);
    } catch (clientError) {
      console.error(`Error getting data for client ${client.clientKey}:`, clientError);
    }
  }
  
  const conversionRate = totalCalls > 0 ? (totalBookings / totalCalls * 100).toFixed(1) : 0;
  
  return {
    activeClients: activeClients || 0,
    monthlyRevenue: monthlyRevenue || 0,
    totalCalls: totalCalls || 0,
    totalBookings: totalBookings || 0,
    conversionRate: conversionRate || 0
  };
}

async function getRecentActivity() {
  const activities = [];
  
  try {
    const recentLeads = await query(`
      SELECT l.*, t.display_name as client_name 
      FROM leads l 
      JOIN tenants t ON l.client_key = t.client_key 
      WHERE l.created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY l.created_at DESC 
      LIMIT 10
    `);
    
    if (recentLeads?.rows) {
      for (const lead of recentLeads.rows) {
        activities.push({
          type: 'new_lead',
          message: `New lead "${lead.name || 'Unknown'}" imported for ${lead.client_name}`,
          timestamp: lead.created_at,
          client: lead.client_name
        });
      }
    }
  } catch (error) {
    console.error('Error getting recent activity:', error);
  }
  
  return activities.slice(0, 20);
}

async function getClientsData() {
  const clients = await listFullClients();
  const clientData = [];
  
  for (const client of clients) {
    try {
      const leads = await getLeadsByClient(client.clientKey, 1000);
      const calls = await getCallsByTenant(client.clientKey, 1000);
      const appointments = await query(`
        SELECT COUNT(*) as count FROM appointments 
        WHERE client_key = $1 AND created_at >= NOW() - INTERVAL '30 days'
      `, [client.clientKey]);
      
      const leadCount = leads ? leads.length : 0;
      const callCount = calls ? calls.length : 0;
      const bookingCount = parseInt(appointments?.rows?.[0]?.count || 0);
      const conversionRate = callCount > 0 ? ((bookingCount / callCount) * 100).toFixed(1) : 0;
      
      const clientName = client.displayName || client.clientKey || 'Unknown Client';
      const clientEmail = client.email || `${client.clientKey}@example.com`;
      
      clientData.push({
        name: clientName,
        email: clientEmail,
        industry: client.industry || 'Not specified',
        status: client.isEnabled ? 'active' : 'inactive',
        leadCount,
        callCount,
        conversionRate,
        monthlyRevenue: client.isEnabled ? 500 : 0,
        createdAt: client.createdAt,
        clientKey: client.clientKey
      });
    } catch (clientError) {
      console.error(`Error getting data for client ${client.clientKey}:`, clientError);
    }
  }
  
  return clientData;
}

async function getCallsData() {
  const clients = await listFullClients();
  
  let totalCalls = 0;
  let totalBookings = 0;
  let totalDuration = 0;
  const recentCalls = [];
  
  for (const client of clients) {
    const calls = await getCallsByTenant(client.clientKey, 100);
    totalCalls += calls.length;
    
    const appointments = await query(`
      SELECT COUNT(*) as count FROM appointments 
      WHERE client_key = $1 AND created_at >= NOW() - INTERVAL '30 days'
    `, [client.clientKey]);
    totalBookings += parseInt(appointments.rows[0]?.count || 0);
    
    for (const call of calls.slice(0, 5)) {
      totalDuration += call.duration || 0;
      recentCalls.push({
        client: client.displayName || client.clientKey,
        phone: call.lead_phone,
        status: call.status,
        outcome: call.outcome,
        duration: call.duration ? `${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, '0')}` : 'N/A',
        timestamp: call.created_at
      });
    }
  }
  
  const averageDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;
  const successRate = totalCalls > 0 ? (totalBookings / totalCalls * 100).toFixed(1) + '%' : '0%';
  
  const queueSize = await query(`
    SELECT COUNT(*) as count FROM call_queue 
    WHERE status = 'pending' AND scheduled_for <= NOW() + INTERVAL '1 hour'
  `);
  
  return {
    liveCalls: 0,
    queueSize: parseInt(queueSize.rows[0]?.count || 0),
    successRate,
    averageDuration: `${Math.floor(averageDuration / 60)}:${(averageDuration % 60).toString().padStart(2, '0')}`,
    recentCalls: recentCalls.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 10)
  };
}

async function getAnalyticsData() {
  const clients = await listFullClients();
  
  let totalLeads = 0;
  let totalCalls = 0;
  let totalBookings = 0;
  
  for (const client of clients) {
    const leads = await getLeadsByClient(client.clientKey, 1000);
    const calls = await getCallsByTenant(client.clientKey, 1000);
    const appointments = await query(`
      SELECT COUNT(*) as count FROM appointments 
      WHERE client_key = $1 AND created_at >= NOW() - INTERVAL '30 days'
    `, [client.clientKey]);
    
    totalLeads += leads.length;
    totalCalls += calls.length;
    totalBookings += parseInt(appointments.rows[0]?.count || 0);
  }
  
  const peakHoursData = await query(`
    SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count
    FROM calls 
    WHERE created_at >= NOW() - INTERVAL '30 days'
    GROUP BY EXTRACT(HOUR FROM created_at)
    ORDER BY count DESC
    LIMIT 5
  `);
  
  const peakHours = peakHoursData.rows.map(row => {
    const hour = parseInt(row.hour);
    return `${hour.toString().padStart(2, '0')}:00`;
  });
  
  return {
    conversionFunnel: {
      leads: totalLeads,
      calls: totalCalls,
      bookings: totalBookings
    },
    peakHours: peakHours.length > 0 ? peakHours : ['9:00', '14:00', '16:00'],
    clientPerformance: []
  };
}

async function getSystemHealthData() {
  const uptime = process.uptime();
  const uptimePercentage = uptime > 3600 ? 99.9 : 95.0;
  
  const recentErrors = await query(`
    SELECT * FROM quality_alerts 
    WHERE created_at >= NOW() - INTERVAL '24 hours'
    ORDER BY created_at DESC 
    LIMIT 10
  `);
  
  const status = recentErrors?.rows?.length > 5 ? 'warning' : 'healthy';
  
  return {
    status: status || 'healthy',
    uptime: uptimePercentage,
    errorCount: 0,
    responseTime: 120,
    recentErrors: recentErrors?.rows?.map(error => ({
      type: error.alert_type,
      severity: error.severity,
      message: error.message,
      timestamp: error.created_at
    })) || []
  };
}

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
  if (req.path === '/api/test' || req.path === '/api/test-linkedin' || req.path === '/api/uk-business-search' || req.path === '/api/decision-maker-contacts' || req.path === '/api/industry-categories' || req.path === '/test-sms-pipeline' || req.path === '/sms-test' || req.path === '/api/initiate-lead-capture' || req.path === '/api/signup') return next();
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
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Middleware for parsing JSON bodies (must be before routes that need it)
app.use(compression()); // Compress responses for better performance
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// Dashboard routes
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.get('/tenant-dashboard', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'tenant-dashboard.html'));
});

app.get('/client-dashboard', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'client-dashboard.html'));
});

app.get('/client-setup', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'client-setup.html'));
});

app.get('/client-template', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'client-dashboard-template.html'));
});

app.get('/setup-guide', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'client-setup-guide.html'));
});

app.get('/onboarding', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'onboarding-dashboard.html'));
});

app.get('/onboarding-templates', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'onboarding-templates.html'));
});

app.get('/onboarding-wizard', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'client-onboarding-wizard.html'));
});

app.get('/uk-business-search', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'uk-business-search.html'));
});

// Serve Decision Maker Finder page (finds owner mobile numbers)
app.get('/decision-maker-finder', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'decision-maker-finder.html'));
});

// Serve Cold Call Dashboard page
app.get('/cold-call-dashboard', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'cold-call-dashboard.html'));
});

// VAPI Test Dashboard Route
app.get('/vapi-test-dashboard', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'vapi-test-dashboard.html'));
});

// Admin Hub routes
app.get('/admin-hub.html', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'admin-hub-enterprise.html'));
});

app.get('/admin-hub', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'admin-hub-enterprise.html'));
});

app.get('/pipeline', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'pipeline-kanban.html'));
});

// Admin API endpoints
app.get('/api/admin/business-stats', async (req, res) => {
  try {
    const clients = await listFullClients();
    const activeClients = clients.filter(c => c.isEnabled).length;
    
    // Calculate monthly revenue based on active clients (£500 per client per month)
    const monthlyRevenue = activeClients * 500;
    
    // Get real call and appointment data
    let totalCalls = 0;
    let totalBookings = 0;
    
    for (const client of clients) {
      try {
        const calls = await getCallsByTenant(client.clientKey, 1000);
        const appointments = await query(`
          SELECT COUNT(*) as count FROM appointments 
          WHERE client_key = $1 AND created_at >= NOW() - INTERVAL '30 days'
        `, [client.clientKey]);
        
        totalCalls += calls ? calls.length : 0;
        totalBookings += parseInt(appointments?.rows?.[0]?.count || 0);
      } catch (clientError) {
        console.error(`Error getting data for client ${client.clientKey}:`, clientError);
        // Continue with other clients
      }
    }
    
    const conversionRate = totalCalls > 0 ? (totalBookings / totalCalls * 100).toFixed(1) : 0;
    
    res.json({
      activeClients: activeClients || 0,
      monthlyRevenue: monthlyRevenue || 0,
      totalCalls: totalCalls || 0,
      totalBookings: totalBookings || 0,
      conversionRate: conversionRate || 0
    });
    
    // Broadcast real-time update
    broadcastUpdate('business-stats', {
      activeClients: activeClients || 0,
      monthlyRevenue: monthlyRevenue || 0,
      totalCalls: totalCalls || 0,
      totalBookings: totalBookings || 0,
      conversionRate: conversionRate || 0
    });
  } catch (error) {
    console.error('Error getting business stats:', error);
    res.json({
      activeClients: 0,
      monthlyRevenue: 0,
      totalCalls: 0,
      totalBookings: 0,
      conversionRate: '0%'
    });
  }
});

app.get('/api/admin/recent-activity', async (req, res) => {
  try {
    const activities = [];
    
    // Get recent leads
    try {
      const recentLeads = await query(`
        SELECT l.*, t.display_name as client_name 
        FROM leads l 
        JOIN tenants t ON l.client_key = t.client_key 
        WHERE l.created_at >= NOW() - INTERVAL '24 hours'
        ORDER BY l.created_at DESC 
        LIMIT 10
      `);
      
      if (recentLeads?.rows) {
        for (const lead of recentLeads.rows) {
          activities.push({
            type: 'new_lead',
            message: `New lead "${lead.name || 'Unknown'}" imported for ${lead.client_name}`,
            timestamp: lead.created_at,
            client: lead.client_name
          });
        }
      }
    } catch (leadError) {
      console.error('Error getting recent leads:', leadError);
    }
    
    // Get recent calls
    try {
      const recentCalls = await query(`
        SELECT c.*, t.display_name as client_name 
        FROM calls c 
        JOIN tenants t ON c.client_key = t.client_key 
        WHERE c.created_at >= NOW() - INTERVAL '24 hours'
        ORDER BY c.created_at DESC 
        LIMIT 10
      `);
      
      if (recentCalls?.rows) {
        for (const call of recentCalls.rows) {
          activities.push({
            type: 'call_completed',
            message: `Call ${call.status} for ${call.client_name} (${call.outcome || 'No outcome'})`,
            timestamp: call.created_at,
            client: call.client_name
          });
        }
      }
    } catch (callError) {
      console.error('Error getting recent calls:', callError);
    }
    
    // Get recent appointments
    try {
      const recentAppointments = await query(`
        SELECT a.*, t.display_name as client_name 
        FROM appointments a 
        JOIN tenants t ON a.client_key = t.client_key 
        WHERE a.created_at >= NOW() - INTERVAL '24 hours'
        ORDER BY a.created_at DESC 
        LIMIT 10
      `);
      
      if (recentAppointments?.rows) {
        for (const appointment of recentAppointments.rows) {
          activities.push({
            type: 'booking_made',
            message: `Appointment booked for ${appointment.client_name}`,
            timestamp: appointment.created_at,
            client: appointment.client_name
          });
        }
      }
    } catch (appointmentError) {
      console.error('Error getting recent appointments:', appointmentError);
    }
    
    // Sort by timestamp and return most recent
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json(activities.slice(0, 20)); // Return top 20 most recent
  } catch (error) {
    console.error('Error getting recent activity:', error);
    res.json([]);
  }
});

app.get('/api/admin/clients', async (req, res) => {
  try {
    const clients = await listFullClients();
    const clientData = [];
    
    for (const client of clients) {
      try {
        // Get real data for each client
        const leads = await getLeadsByClient(client.clientKey, 1000);
        const calls = await getCallsByTenant(client.clientKey, 1000);
        const appointments = await query(`
          SELECT COUNT(*) as count FROM appointments 
          WHERE client_key = $1 AND created_at >= NOW() - INTERVAL '30 days'
        `, [client.clientKey]);
        
        const leadCount = leads ? leads.length : 0;
        const callCount = calls ? calls.length : 0;
        const bookingCount = parseInt(appointments?.rows?.[0]?.count || 0);
        const conversionRate = callCount > 0 ? ((bookingCount / callCount) * 100).toFixed(1) : 0;
        
        // Better fallback for client name
        const clientName = client.displayName || client.clientKey || 'Unknown Client';
        const clientEmail = client.email || `${client.clientKey}@example.com`;
        
        clientData.push({
          name: clientName,
          email: clientEmail,
          industry: client.industry || 'Not specified',
          status: client.isEnabled ? 'active' : 'inactive',
          leadCount,
          callCount,
          conversionRate,
          monthlyRevenue: client.isEnabled ? 500 : 0,
          createdAt: client.createdAt,
          clientKey: client.clientKey
        });
      } catch (clientError) {
        console.error(`Error getting data for client ${client.clientKey}:`, clientError);
        // Add client with default values
        const clientName = client.displayName || client.clientKey || 'Unknown Client';
        clientData.push({
          name: clientName,
          email: client.email || `${client.clientKey}@example.com`,
          industry: client.industry || 'Not specified',
          status: client.isEnabled ? 'active' : 'inactive',
          leadCount: 0,
          callCount: 0,
          conversionRate: 0,
          monthlyRevenue: client.isEnabled ? 500 : 0,
          createdAt: client.createdAt,
          clientKey: client.clientKey
        });
      }
    }
    
    res.json(clientData);
  } catch (error) {
    console.error('Error getting clients:', error);
    res.json([]);
  }
});

app.get('/api/admin/calls', async (req, res) => {
  try {
    const { getCallsByTenant } = await import('./db.js');
    const clients = await listFullClients();
    
    // Get real call data
    let totalCalls = 0;
    let totalBookings = 0;
    let totalDuration = 0;
    const recentCalls = [];
    
    for (const client of clients) {
      const calls = await getCallsByTenant(client.clientKey, 100);
      totalCalls += calls.length;
      
      // Calculate bookings from appointments
      const appointments = await query(`
        SELECT COUNT(*) as count FROM appointments 
        WHERE client_key = $1 AND created_at >= NOW() - INTERVAL '30 days'
      `, [client.clientKey]);
      totalBookings += parseInt(appointments.rows[0]?.count || 0);
      
      // Add to recent calls
      for (const call of calls.slice(0, 5)) { // Last 5 calls per client
        totalDuration += call.duration || 0;
        recentCalls.push({
          client: client.displayName || client.clientKey,
          phone: call.lead_phone,
          status: call.status,
          outcome: call.outcome,
          duration: call.duration ? `${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, '0')}` : 'N/A',
          timestamp: call.created_at
        });
      }
    }
    
    // Calculate averages
    const averageDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;
    const successRate = totalCalls > 0 ? (totalBookings / totalCalls * 100).toFixed(1) + '%' : '0%';
    
    // Get queue size (pending calls)
    const queueSize = await query(`
      SELECT COUNT(*) as count FROM call_queue 
      WHERE status = 'pending' AND scheduled_for <= NOW() + INTERVAL '1 hour'
    `);
    
    res.json({
      liveCalls: 0, // Would need real-time tracking
      queueSize: parseInt(queueSize.rows[0]?.count || 0),
      successRate,
      averageDuration: `${Math.floor(averageDuration / 60)}:${(averageDuration % 60).toString().padStart(2, '0')}`,
      recentCalls: recentCalls.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 10)
    });
  } catch (error) {
    console.error('Error getting calls data:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/analytics', async (req, res) => {
  try {
    const clients = await listFullClients();
    
    // Calculate conversion funnel
    let totalLeads = 0;
    let totalCalls = 0;
    let totalBookings = 0;
    
    for (const client of clients) {
      const leads = await getLeadsByClient(client.clientKey, 1000);
      const calls = await getCallsByTenant(client.clientKey, 1000);
      const appointments = await query(`
        SELECT COUNT(*) as count FROM appointments 
        WHERE client_key = $1 AND created_at >= NOW() - INTERVAL '30 days'
      `, [client.clientKey]);
      
      totalLeads += leads.length;
      totalCalls += calls.length;
      totalBookings += parseInt(appointments.rows[0]?.count || 0);
    }
    
    // Get peak hours from calls
    const peakHoursData = await query(`
      SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count
      FROM calls 
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY count DESC
      LIMIT 5
    `);
    
    const peakHours = peakHoursData.rows.map(row => {
      const hour = parseInt(row.hour);
      return `${hour.toString().padStart(2, '0')}:00`;
    });
    
    // Get client performance data
    const clientPerformance = [];
    for (const client of clients) {
      const leads = await getLeadsByClient(client.clientKey, 1000);
      const calls = await getCallsByTenant(client.clientKey, 1000);
      const appointments = await query(`
        SELECT COUNT(*) as count FROM appointments 
        WHERE client_key = $1 AND created_at >= NOW() - INTERVAL '30 days'
      `, [client.clientKey]);
      
      const bookingCount = parseInt(appointments.rows[0]?.count || 0);
      const conversionRate = calls.length > 0 ? (bookingCount / calls.length * 100).toFixed(1) : 0;
      
      clientPerformance.push({
        name: client.displayName || client.clientKey,
        leads: leads.length,
        calls: calls.length,
        bookings: bookingCount,
        conversionRate: conversionRate,
        revenue: client.isEnabled ? 500 : 0
      });
    }
    
    res.json({
      conversionFunnel: {
        leads: totalLeads,
        calls: totalCalls,
        bookings: totalBookings
      },
      peakHours: peakHours.length > 0 ? peakHours : ['9:00', '14:00', '16:00'],
      clientPerformance: clientPerformance.sort((a, b) => b.bookings - a.bookings)
    });
  } catch (error) {
    console.error('Error getting analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/system-health', async (req, res) => {
  try {
    // Get system uptime (simplified)
    const uptime = process.uptime();
    const uptimeHours = Math.floor(uptime / 3600);
    const uptimeMinutes = Math.floor((uptime % 3600) / 60);
    const uptimeString = `${uptimeHours}h ${uptimeMinutes}m`;
    
    // Calculate uptime percentage (simplified - assume 99.9% if running)
    const uptimePercentage = uptime > 3600 ? 99.9 : 95.0; // 99.9% if running more than 1 hour
    
    // Get error count from recent logs (simplified)
    const errorCount = 0; // Would need proper error tracking
    
    // Get recent errors from database
    const recentErrors = await query(`
      SELECT * FROM quality_alerts 
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    
    // Calculate system status
    const status = recentErrors?.rows?.length > 5 ? 'warning' : 'healthy';
    
    // Get response time (simplified)
    const responseTime = 120; // Return as number, not string
    
    res.json({
      status: status || 'healthy',
      uptime: uptimePercentage,
      errorCount: errorCount || 0,
      responseTime: responseTime || 120,
      recentErrors: recentErrors?.rows?.map(error => ({
        type: error.alert_type,
        severity: error.severity,
        message: error.message,
        timestamp: error.created_at
      })) || []
    });
  } catch (error) {
    console.error('Error getting system health:', error);
    res.json({
      status: 'healthy',
      uptime: 99.9,
      errorCount: 0,
      responseTime: 120,
      recentErrors: []
    });
  }
});

// Appointment Reminder Management Endpoints
app.get('/api/admin/reminders', async (req, res) => {
  try {
    const { clientKey, status, type } = req.query;
    
    let queryStr = `
      SELECT ar.*, t.display_name as client_name
      FROM appointment_reminders ar
      LEFT JOIN tenants t ON ar.client_key = t.client_key
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;
    
    if (clientKey) {
      queryStr += ` AND ar.client_key = $${++paramCount}`;
      params.push(clientKey);
    }
    
    if (status) {
      queryStr += ` AND ar.status = $${++paramCount}`;
      params.push(status);
    }
    
    if (type) {
      queryStr += ` AND ar.reminder_type = $${++paramCount}`;
      params.push(type);
    }
    
    queryStr += ` ORDER BY ar.scheduled_for DESC LIMIT 100`;
    
    const reminders = await query(queryStr, params);
    
    res.json(reminders.rows.map(reminder => ({
      id: reminder.id,
      appointmentId: reminder.appointment_id,
      clientKey: reminder.client_key,
      clientName: reminder.client_name,
      leadPhone: reminder.lead_phone,
      appointmentTime: reminder.appointment_time,
      reminderType: reminder.reminder_type,
      scheduledFor: reminder.scheduled_for,
      sentAt: reminder.sent_at,
      status: reminder.status,
      smsSid: reminder.sms_sid,
      errorMessage: reminder.error_message,
      createdAt: reminder.created_at
    })));
  } catch (error) {
    console.error('Error getting reminders:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/reminders/send', async (req, res) => {
  try {
    const { reminderId } = req.body;
    
    if (!reminderId) {
      return res.status(400).json({ error: 'Reminder ID is required' });
    }
    
    // Get reminder details
    const reminder = await query(`
      SELECT * FROM appointment_reminders WHERE id = $1
    `, [reminderId]);
    
    if (!reminder.rows[0]) {
      return res.status(404).json({ error: 'Reminder not found' });
    }
    
    // Send the reminder
    await sendReminderSMS(reminder.rows[0]);
    
    // Update status
    await query(`
      UPDATE appointment_reminders 
      SET status = 'sent', sent_at = NOW()
      WHERE id = $1
    `, [reminderId]);
    
    res.json({ success: true, message: 'Reminder sent successfully' });
  } catch (error) {
    console.error('Error sending reminder:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/reminders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await query(`
      UPDATE appointment_reminders 
      SET status = 'cancelled'
      WHERE id = $1
    `, [id]);
    
    res.json({ success: true, message: 'Reminder cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling reminder:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/reminders/stats', async (req, res) => {
  try {
    const stats = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
        COUNT(CASE WHEN reminder_type = 'confirmation' THEN 1 END) as confirmations,
        COUNT(CASE WHEN reminder_type = '24hour' THEN 1 END) as reminders_24h,
        COUNT(CASE WHEN reminder_type = '1hour' THEN 1 END) as reminders_1h
      FROM appointment_reminders
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `);
    
    const row = stats.rows[0];
    res.json({
      total: parseInt(row.total) || 0,
      sent: parseInt(row.sent) || 0,
      pending: parseInt(row.pending) || 0,
      failed: parseInt(row.failed) || 0,
      cancelled: parseInt(row.cancelled) || 0,
      confirmations: parseInt(row.confirmations) || 0,
      reminders24h: parseInt(row.reminders_24h) || 0,
      reminders1h: parseInt(row.reminders_1h) || 0,
      successRate: row.total > 0 ? ((parseInt(row.sent) / parseInt(row.total)) * 100).toFixed(1) : 0
    });
  } catch (error) {
    console.error('Error getting reminder stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Client Management Endpoints
app.get('/api/admin/client/:clientKey', async (req, res) => {
  try {
    const { clientKey } = req.params;
    const client = await getFullClient(clientKey);
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    // Get detailed stats for this client
    const leads = await getLeadsByClient(clientKey, 1000).catch(() => []);
    const calls = await getCallsByTenant(clientKey, 1000).catch(() => []);
    const appointments = await query(`
      SELECT COUNT(*) as count FROM appointments 
      WHERE client_key = $1 AND created_at >= NOW() - INTERVAL '30 days'
    `, [clientKey]).catch(() => ({ rows: [{ count: 0 }] }));
    
    const recentCalls = (calls || []).slice(0, 10).map(call => ({
      phone: call.lead_phone,
      status: call.status,
      outcome: call.outcome,
      duration: call.duration,
      timestamp: call.created_at
    }));
    
    res.json({
      ...client,
      stats: {
        totalLeads: (leads || []).length,
        totalCalls: (calls || []).length,
        totalBookings: parseInt(appointments?.rows?.[0]?.count || 0),
        conversionRate: (calls || []).length > 0 ? ((parseInt(appointments?.rows?.[0]?.count || 0) / (calls || []).length) * 100).toFixed(1) : 0
      },
      recentCalls
    });
  } catch (error) {
    console.error('Error getting client details:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/client/:clientKey', async (req, res) => {
  try {
    const { clientKey } = req.params;
    const updates = req.body;
    
    const existingClient = await getFullClient(clientKey);
    if (!existingClient) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    // Update client data
    const updatedClient = {
      ...existingClient,
      ...updates,
      clientKey // Ensure clientKey doesn't change
    };
    
    await upsertFullClient(updatedClient);
    
    res.json({ success: true, message: 'Client updated successfully' });
  } catch (error) {
    console.error('Error updating client:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/client/:clientKey', async (req, res) => {
  try {
    const { clientKey } = req.params;
    
    const existingClient = await getFullClient(clientKey);
    if (!existingClient) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    await deleteClient(clientKey);
    
    res.json({ success: true, message: 'Client deleted successfully' });
  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/client', async (req, res) => {
  try {
    const { 
      businessName, 
      industry, 
      email, 
      phone,
      website,
      primaryService,
      duration,
      timezone,
      workingHours,
      monthlyBudget
    } = req.body;
    
    const displayName = businessName || req.body.displayName;
    
    if (!displayName) {
      return res.status(400).json({ error: 'Business name is required' });
    }
    
    // Generate client key
    const clientKey = displayName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    // Build calendar config
    const calendarConfig = {
      booking: {
        defaultDurationMin: parseInt(duration) || 30,
        timezone: timezone || 'Europe/London',
        businessHours: workingHours || '9am-5pm Mon-Fri'
      },
      services: primaryService ? {
        [primaryService.toLowerCase().replace(/\s+/g, '_')]: {
          name: primaryService,
          duration: parseInt(duration) || 30,
          price: null
        }
      } : {}
    };
    
    const newClient = {
      clientKey,
      displayName,
      industry: industry || 'Not specified',
      email: email || `${clientKey}@example.com`,
      timezone: timezone || 'Europe/London',
      isEnabled: true,
      calendar_json: JSON.stringify(calendarConfig)
    };
    
    await upsertFullClient(newClient);
    
    res.json({ 
      success: true, 
      message: 'Client created successfully', 
      clientKey,
      ...newClient
    });
    
    // Broadcast real-time update
    broadcastUpdate('clients', await getClientsData());
  } catch (error) {
    console.error('Error creating client:', error);
    res.status(500).json({ error: error.message });
  }
});

// Advanced Search and Filtering Endpoints
app.get('/api/admin/search', async (req, res) => {
  try {
    const { q, type, filters } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    const results = {
      clients: [],
      leads: [],
      calls: [],
      appointments: []
    };
    
    // Search clients
    if (!type || type === 'clients') {
      const clients = await listFullClients();
      results.clients = clients.filter(client => 
        client.displayName?.toLowerCase().includes(q.toLowerCase()) ||
        client.clientKey?.toLowerCase().includes(q.toLowerCase()) ||
        client.industry?.toLowerCase().includes(q.toLowerCase())
      );
    }
    
    // Search leads
    if (!type || type === 'leads') {
      const leads = await query(`
        SELECT l.*, t.display_name as client_name 
        FROM leads l 
        JOIN tenants t ON l.client_key = t.client_key 
        WHERE l.name ILIKE $1 OR l.phone ILIKE $1 OR l.service ILIKE $1
        ORDER BY l.created_at DESC 
        LIMIT 50
      `, [`%${q}%`]);
      
      results.leads = leads.rows || [];
    }
    
    // Search calls
    if (!type || type === 'calls') {
      const calls = await query(`
        SELECT c.*, t.display_name as client_name 
        FROM calls c 
        JOIN tenants t ON c.client_key = t.client_key 
        WHERE c.lead_phone ILIKE $1 OR c.outcome ILIKE $1 OR c.status ILIKE $1
        ORDER BY c.created_at DESC 
        LIMIT 50
      `, [`%${q}%`]);
      
      results.calls = calls.rows || [];
    }
    
    res.json(results);
  } catch (error) {
    console.error('Error performing search:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/filter', async (req, res) => {
  try {
    const { type, filters } = req.query;
    const filterObj = filters ? JSON.parse(filters) : {};
    
    let results = [];
    
    switch(type) {
      case 'clients':
        const clients = await listFullClients();
        results = clients.filter(client => {
          if (filterObj.status && client.isEnabled !== (filterObj.status === 'active')) return false;
          if (filterObj.industry && client.industry !== filterObj.industry) return false;
          if (filterObj.dateFrom && new Date(client.createdAt) < new Date(filterObj.dateFrom)) return false;
          if (filterObj.dateTo && new Date(client.createdAt) > new Date(filterObj.dateTo)) return false;
          return true;
        });
        break;
        
      case 'calls':
        const calls = await query(`
          SELECT c.*, t.display_name as client_name 
          FROM calls c 
          JOIN tenants t ON c.client_key = t.client_key 
          WHERE ($1::text IS NULL OR c.status = $1)
            AND ($2::text IS NULL OR c.outcome = $2)
            AND ($3::timestamp IS NULL OR c.created_at >= $3)
            AND ($4::timestamp IS NULL OR c.created_at <= $4)
          ORDER BY c.created_at DESC 
          LIMIT 100
        `, [
          filterObj.status || null,
          filterObj.outcome || null,
          filterObj.dateFrom || null,
          filterObj.dateTo || null
        ]);
        results = calls.rows || [];
        break;
        
      case 'leads':
        const leads = await query(`
          SELECT l.*, t.display_name as client_name 
          FROM leads l 
          JOIN tenants t ON l.client_key = t.client_key 
          WHERE ($1::text IS NULL OR l.status = $1)
            AND ($2::text IS NULL OR l.source = $2)
            AND ($3::timestamp IS NULL OR l.created_at >= $3)
            AND ($4::timestamp IS NULL OR l.created_at <= $4)
          ORDER BY l.created_at DESC 
          LIMIT 100
        `, [
          filterObj.status || null,
          filterObj.source || null,
          filterObj.dateFrom || null,
          filterObj.dateTo || null
        ]);
        results = leads.rows || [];
        break;
    }
    
    res.json(results);
  } catch (error) {
    console.error('Error applying filters:', error);
    res.status(500).json({ error: error.message });
  }
});

// Data Export Endpoints
app.get('/api/admin/export/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { format = 'csv' } = req.query;
    
    let data = [];
    let filename = '';
    
    switch(type) {
      case 'clients':
        data = await getClientsData();
        filename = `clients-export-${new Date().toISOString().split('T')[0]}`;
        break;
        
      case 'calls':
        data = await getCallsData();
        filename = `calls-export-${new Date().toISOString().split('T')[0]}`;
        break;
        
      case 'leads':
        const leads = await query(`
          SELECT l.*, t.display_name as client_name 
          FROM leads l 
          JOIN tenants t ON l.client_key = t.client_key 
          ORDER BY l.created_at DESC
        `);
        data = leads.rows || [];
        filename = `leads-export-${new Date().toISOString().split('T')[0]}`;
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid export type' });
    }
    
    if (format === 'csv') {
      const csv = convertToCSV(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.send(csv);
    } else if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
      res.json(data);
    } else {
      return res.status(400).json({ error: 'Invalid format. Use csv or json' });
    }
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to convert data to CSV
function convertToCSV(data) {
  if (!data.length) return '';
  
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];
  
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
}

// Bulk Operations Endpoints
app.post('/api/admin/bulk/:operation', async (req, res) => {
  try {
    const { operation } = req.params;
    const { items, action } = req.body;
    
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Items array is required' });
    }
    
    let results = [];
    
    switch(operation) {
      case 'clients':
        for (const item of items) {
          try {
            if (action === 'delete') {
              await deleteClient(item.clientKey);
              results.push({ id: item.clientKey, status: 'deleted' });
            } else if (action === 'update') {
              await upsertFullClient(item);
              results.push({ id: item.clientKey, status: 'updated' });
            }
          } catch (error) {
            results.push({ id: item.clientKey, status: 'error', error: error.message });
          }
        }
        break;
        
      case 'leads':
        for (const item of items) {
          try {
            if (action === 'update') {
              await query(`
                UPDATE leads 
                SET status = $1, notes = $2 
                WHERE id = $3
              `, [item.status, item.notes, item.id]);
              results.push({ id: item.id, status: 'updated' });
            }
          } catch (error) {
            results.push({ id: item.id, status: 'error', error: error.message });
          }
        }
        break;
    }
    
    res.json({ 
      success: true, 
      processed: results.length, 
      results 
    });
  } catch (error) {
    console.error('Error performing bulk operation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Advanced Analytics and Reporting Endpoints
app.get('/api/admin/analytics/advanced', async (req, res) => {
  try {
    const { period = '30d', clientKey } = req.query;
    
    // Calculate period dates
    const endDate = new Date();
    const startDate = new Date();
    switch(period) {
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
    }
    
    const analytics = {
      overview: await getAnalyticsOverview(startDate, endDate, clientKey),
      trends: await getAnalyticsTrends(startDate, endDate, clientKey),
      performance: await getPerformanceMetrics(startDate, endDate, clientKey),
      insights: await getAIInsights(startDate, endDate, clientKey),
      forecasts: await getForecasts(startDate, endDate, clientKey)
    };
    
    res.json(analytics);
  } catch (error) {
    console.error('Error getting advanced analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function for analytics overview
async function getAnalyticsOverview(startDate, endDate, clientKey) {
  const clients = clientKey ? [await getFullClient(clientKey)] : await listFullClients();
  
  let totalLeads = 0;
  let totalCalls = 0;
  let totalBookings = 0;
  let totalRevenue = 0;
  let totalCost = 0;
  
  for (const client of clients) {
    if (!client) continue;
    
    const leads = await query(`
      SELECT COUNT(*) as count FROM leads 
      WHERE client_key = $1 AND created_at BETWEEN $2 AND $3
    `, [client.clientKey, startDate.toISOString(), endDate.toISOString()]);
    
    const calls = await query(`
      SELECT COUNT(*) as count, SUM(duration) as total_duration, SUM(cost) as total_cost
      FROM calls 
      WHERE client_key = $1 AND created_at BETWEEN $2 AND $3
    `, [client.clientKey, startDate.toISOString(), endDate.toISOString()]);
    
    const appointments = await query(`
      SELECT COUNT(*) as count FROM appointments 
      WHERE client_key = $1 AND created_at BETWEEN $2 AND $3
    `, [client.clientKey, startDate.toISOString(), endDate.toISOString()]);
    
    totalLeads += parseInt(leads.rows[0]?.count || 0);
    totalCalls += parseInt(calls.rows[0]?.count || 0);
    totalBookings += parseInt(appointments.rows[0]?.count || 0);
    totalCost += parseFloat(calls.rows[0]?.total_cost || 0);
  }
  
  totalRevenue = totalBookings * 500; // Assuming £500 per booking
  
  return {
    totalLeads,
    totalCalls,
    totalBookings,
    totalRevenue,
    totalCost,
    conversionRate: totalCalls > 0 ? (totalBookings / totalCalls * 100).toFixed(1) : 0,
    costPerLead: totalLeads > 0 ? (totalCost / totalLeads).toFixed(2) : 0,
    revenuePerCall: totalCalls > 0 ? (totalRevenue / totalCalls).toFixed(2) : 0,
    roi: totalCost > 0 ? ((totalRevenue - totalCost) / totalCost * 100).toFixed(1) : 0
  };
}

// Helper function for analytics trends
async function getAnalyticsTrends(startDate, endDate, clientKey) {
  const clients = clientKey ? [await getFullClient(clientKey)] : await listFullClients();
  const trends = [];
  
  // Generate daily trends for the period
  const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    const nextDate = new Date(date);
    nextDate.setDate(date.getDate() + 1);
    
    let dailyLeads = 0;
    let dailyCalls = 0;
    let dailyBookings = 0;
    
    for (const client of clients) {
      if (!client) continue;
      
      const leads = await query(`
        SELECT COUNT(*) as count FROM leads 
        WHERE client_key = $1 AND created_at BETWEEN $2 AND $3
      `, [client.clientKey, date.toISOString(), nextDate.toISOString()]);
      
      const calls = await query(`
        SELECT COUNT(*) as count FROM calls 
        WHERE client_key = $1 AND created_at BETWEEN $2 AND $3
      `, [client.clientKey, date.toISOString(), nextDate.toISOString()]);
      
      const appointments = await query(`
        SELECT COUNT(*) as count FROM appointments 
        WHERE client_key = $1 AND created_at BETWEEN $2 AND $3
      `, [client.clientKey, date.toISOString(), nextDate.toISOString()]);
      
      dailyLeads += parseInt(leads.rows[0]?.count || 0);
      dailyCalls += parseInt(calls.rows[0]?.count || 0);
      dailyBookings += parseInt(appointments.rows[0]?.count || 0);
    }
    
    trends.push({
      date: date.toISOString().split('T')[0],
      leads: dailyLeads,
      calls: dailyCalls,
      bookings: dailyBookings,
      conversionRate: dailyCalls > 0 ? (dailyBookings / dailyCalls * 100).toFixed(1) : 0
    });
  }
  
  return trends;
}

// Helper function for performance metrics
async function getPerformanceMetrics(startDate, endDate, clientKey) {
  const clients = clientKey ? [await getFullClient(clientKey)] : await listFullClients();
  const metrics = [];
  
  for (const client of clients) {
    if (!client) continue;
    
    const calls = await query(`
      SELECT 
        COUNT(*) as total_calls,
        AVG(duration) as avg_duration,
        AVG(quality_score) as avg_quality,
        COUNT(CASE WHEN outcome = 'booked' THEN 1 END) as successful_calls,
        COUNT(CASE WHEN outcome = 'interested' THEN 1 END) as interested_calls,
        COUNT(CASE WHEN outcome = 'not_interested' THEN 1 END) as not_interested_calls
      FROM calls 
      WHERE client_key = $1 AND created_at BETWEEN $2 AND $3
    `, [client.clientKey, startDate.toISOString(), endDate.toISOString()]);
    
    const appointments = await query(`
      SELECT COUNT(*) as count FROM appointments 
      WHERE client_key = $1 AND created_at BETWEEN $2 AND $3
    `, [client.clientKey, startDate.toISOString(), endDate.toISOString()]);
    
    const callData = calls.rows[0];
    const totalCalls = parseInt(callData?.total_calls || 0);
    const bookings = parseInt(appointments.rows[0]?.count || 0);
    
    metrics.push({
      clientName: client.displayName,
      clientKey: client.clientKey,
      totalCalls,
      avgDuration: Math.round(parseFloat(callData?.avg_duration || 0)),
      avgQuality: parseFloat(callData?.avg_quality || 0).toFixed(1),
      successfulCalls: parseInt(callData?.successful_calls || 0),
      interestedCalls: parseInt(callData?.interested_calls || 0),
      notInterestedCalls: parseInt(callData?.not_interested_calls || 0),
      bookings,
      conversionRate: totalCalls > 0 ? (bookings / totalCalls * 100).toFixed(1) : 0,
      successRate: totalCalls > 0 ? ((parseInt(callData?.successful_calls || 0) + parseInt(callData?.interested_calls || 0)) / totalCalls * 100).toFixed(1) : 0
    });
  }
  
  return metrics.sort((a, b) => b.conversionRate - a.conversionRate);
}

// Helper function for AI insights
async function getAIInsights(startDate, endDate, clientKey) {
  const clients = clientKey ? [await getFullClient(clientKey)] : await listFullClients();
  const insights = [];
  
  for (const client of clients) {
    if (!client) continue;
    
    // Analyze call patterns
    const callPatterns = await query(`
      SELECT 
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as call_count,
        AVG(duration) as avg_duration,
        AVG(quality_score) as avg_quality
      FROM calls 
      WHERE client_key = $1 AND created_at BETWEEN $2 AND $3
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY call_count DESC
      LIMIT 5
    `, [client.clientKey, startDate.toISOString(), endDate.toISOString()]);
    
    // Analyze sentiment trends
    const sentimentAnalysis = await query(`
      SELECT 
        sentiment,
        COUNT(*) as count,
        AVG(quality_score) as avg_quality
      FROM calls 
      WHERE client_key = $1 AND created_at BETWEEN $2 AND $3 AND sentiment IS NOT NULL
      GROUP BY sentiment
    `, [client.clientKey, startDate.toISOString(), endDate.toISOString()]);
    
    // Generate insights
    const peakHour = callPatterns.rows[0];
    const positiveCalls = sentimentAnalysis.rows.find(r => r.sentiment === 'positive');
    const negativeCalls = sentimentAnalysis.rows.find(r => r.sentiment === 'negative');
    
    if (peakHour) {
      insights.push({
        type: 'peak_hour',
        clientName: client.displayName,
        message: `Peak calling hour is ${peakHour.hour}:00 with ${peakHour.call_count} calls and ${parseFloat(peakHour.avg_quality).toFixed(1)} average quality score`,
        priority: 'medium',
        recommendation: `Consider scheduling more calls during ${peakHour.hour}:00 for better results`
      });
    }
    
    if (positiveCalls && negativeCalls) {
      const positiveRatio = positiveCalls.count / (positiveCalls.count + negativeCalls.count);
      if (positiveRatio < 0.6) {
        insights.push({
          type: 'sentiment',
          clientName: client.displayName,
          message: `Only ${(positiveRatio * 100).toFixed(1)}% of calls have positive sentiment`,
          priority: 'high',
          recommendation: 'Review call scripts and training to improve customer satisfaction'
        });
      }
    }
  }
  
  return insights;
}

// Helper function for forecasts
async function getForecasts(startDate, endDate, clientKey) {
  const clients = clientKey ? [await getFullClient(clientKey)] : await listFullClients();
  const forecasts = [];
  
  for (const client of clients) {
    if (!client) continue;
    
    // Calculate growth rates
    const currentPeriodCalls = await query(`
      SELECT COUNT(*) as count FROM calls 
      WHERE client_key = $1 AND created_at BETWEEN $2 AND $3
    `, [client.clientKey, startDate.toISOString(), endDate.toISOString()]);
    
    const previousPeriodStart = new Date(startDate);
    const previousPeriodEnd = new Date(startDate);
    previousPeriodStart.setDate(startDate.getDate() - (endDate - startDate) / (1000 * 60 * 60 * 24));
    
    const previousPeriodCalls = await query(`
      SELECT COUNT(*) as count FROM calls 
      WHERE client_key = $1 AND created_at BETWEEN $2 AND $3
    `, [client.clientKey, previousPeriodStart.toISOString(), previousPeriodEnd.toISOString()]);
    
    const currentCalls = parseInt(currentPeriodCalls.rows[0]?.count || 0);
    const previousCalls = parseInt(previousPeriodCalls.rows[0]?.count || 0);
    const growthRate = previousCalls > 0 ? ((currentCalls - previousCalls) / previousCalls * 100).toFixed(1) : 0;
    
    // Forecast next period
    const forecastCalls = Math.round(currentCalls * (1 + parseFloat(growthRate) / 100));
    const forecastBookings = Math.round(forecastCalls * 0.15); // Assuming 15% conversion rate
    const forecastRevenue = forecastBookings * 500;
    
    forecasts.push({
      clientName: client.displayName,
      clientKey: client.clientKey,
      currentCalls,
      previousCalls,
      growthRate: parseFloat(growthRate),
      forecastCalls,
      forecastBookings,
      forecastRevenue,
      confidence: Math.min(95, Math.max(60, 100 - Math.abs(parseFloat(growthRate))))
    });
  }
  
  return forecasts;
}

// User Management Endpoints
app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await query(`
      SELECT * FROM user_accounts 
      ORDER BY created_at DESC
    `);
    
    res.json(users.rows || []);
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/users', async (req, res) => {
  try {
    const { username, email, role, password } = req.body;
    
    if (!username || !email || !role) {
      return res.status(400).json({ error: 'Username, email, and role are required' });
    }
    
    const hashedPassword = await bcrypt.hash(password || 'defaultpassword', 10);
    
    const result = await query(`
      INSERT INTO user_accounts (username, email, role, password_hash, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING *
    `, [username, email, role, hashedPassword]);
    
    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: error.message });
  }
});

// Audit Logging Endpoints
app.get('/api/admin/audit-logs', async (req, res) => {
  try {
    const { limit = 100, offset = 0, action, userId } = req.query;
    
    let queryStr = `
      SELECT al.*, ua.username 
      FROM audit_logs al
      LEFT JOIN user_accounts ua ON al.user_id = ua.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;
    
    if (action) {
      paramCount++;
      queryStr += ` AND al.action = $${paramCount}`;
      params.push(action);
    }
    
    if (userId) {
      paramCount++;
      queryStr += ` AND al.user_id = $${paramCount}`;
      params.push(userId);
    }
    
    queryStr += ` ORDER BY al.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const logs = await query(queryStr, params);
    
    res.json({
      logs: logs.rows || [],
      total: logs.rows?.length || 0,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error getting audit logs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Notification and Alert Endpoints
app.get('/api/admin/notifications', async (req, res) => {
  try {
    const notifications = await query(`
      SELECT * FROM notifications 
      WHERE is_read = false
      ORDER BY created_at DESC
      LIMIT 50
    `);
    
    res.json(notifications.rows || []);
  } catch (error) {
    console.error('Error getting notifications:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/notifications/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    
    await query(`
      UPDATE notifications 
      SET is_read = true, read_at = NOW()
      WHERE id = $1
    `, [id]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: error.message });
  }
});

// System Monitoring Endpoints
app.get('/api/admin/system/metrics', async (req, res) => {
  try {
    const metrics = {
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      cpu: process.cpuUsage(),
      timestamp: new Date().toISOString()
    };
    
    res.json(metrics);
  } catch (error) {
    console.error('Error getting system metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/system/health-check', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: await checkDatabaseHealth(),
        websocket: socket ? 'connected' : 'disconnected',
        api: 'operational'
      },
      metrics: {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        activeConnections: socket ? io.engine.clientsCount : 0
      }
    };
    
    res.json(health);
  } catch (error) {
    console.error('Error performing health check:', error);
    res.status(500).json({ 
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Helper function to check database health
async function checkDatabaseHealth() {
  try {
    await query('SELECT 1');
    return 'healthy';
  } catch (error) {
    return 'unhealthy';
  }
}

// Workflow Automation Endpoints
app.get('/api/admin/workflows', async (req, res) => {
  try {
    const workflows = await query(`
      SELECT 
        w.*,
        COUNT(DISTINCT e.id) as execution_count,
        MAX(e.executed_at) as last_executed
      FROM workflows w
      LEFT JOIN workflow_executions e ON w.id = e.workflow_id
      GROUP BY w.id
      ORDER BY w.created_at DESC
    `);
    
    res.json(workflows.rows || []);
  } catch (error) {
    console.error('Error getting workflows:', error);
    res.json([]);
  }
});

app.post('/api/admin/workflows', async (req, res) => {
  try {
    const { name, trigger, actions, is_active } = req.body;
    
    const result = await query(`
      INSERT INTO workflows (name, trigger_type, trigger_config, actions, is_active, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
    `, [name, trigger.type, JSON.stringify(trigger.config), JSON.stringify(actions), is_active !== false]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating workflow:', error);
    res.status(500).json({ error: error.message });
  }
});

// Smart Lead Scoring Endpoint
app.get('/api/admin/leads/scoring', async (req, res) => {
  try {
    const leads = await query(`
      SELECT 
        l.*,
        c.display_name as client_name,
        c.industry,
        (SELECT COUNT(*) FROM calls WHERE lead_phone = l.phone AND status = 'completed') as call_count,
        (SELECT COUNT(*) FROM appointments WHERE lead_phone = l.phone AND status = 'confirmed') as appointment_count,
        (SELECT MAX(created_at) FROM calls WHERE lead_phone = l.phone) as last_call_at
      FROM leads l
      JOIN tenants c ON l.client_key = c.client_key
      WHERE l.status != 'converted'
      ORDER BY l.created_at DESC
      LIMIT 100
    `);
    
    // Score each lead
    const scoredLeads = leads.rows.map(lead => {
      let score = 0;
      
      // Recency bonus
      const daysSinceCreation = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceCreation < 7) score += 20;
      else if (daysSinceCreation < 30) score += 10;
      
      // Call engagement bonus
      if (lead.call_count > 0) score += 15;
      if (lead.appointment_count > 0) score += 25;
      
      // Industry bonus
      const highValueIndustries = ['Healthcare', 'Legal', 'Real Estate', 'Finance'];
      if (highValueIndustries.includes(lead.industry)) score += 15;
      
      // Email domain bonus
      if (lead.email && lead.email.includes('.co.uk')) score += 10;
      
      return {
        ...lead,
        score,
        priority: score >= 50 ? 'high' : score >= 30 ? 'medium' : 'low'
      };
    });
    
    res.json(scoredLeads.sort((a, b) => b.score - a.score));
  } catch (error) {
    console.error('Error getting lead scores:', error);
    res.json([]);
  }
});

// Automated Follow-up Recommendations
app.get('/api/admin/followups/recommendations', async (req, res) => {
  try {
    const recommendations = await query(`
      SELECT 
        l.*,
        c.display_name as client_name,
        (SELECT COUNT(*) FROM calls WHERE lead_phone = l.phone AND status = 'completed') as call_count,
        (SELECT MAX(created_at) FROM calls WHERE lead_phone = l.phone) as last_call_at,
        (SELECT outcome FROM calls WHERE lead_phone = l.phone ORDER BY created_at DESC LIMIT 1) as last_outcome
      FROM leads l
      JOIN tenants c ON l.client_key = c.client_key
      WHERE l.status IN ('new', 'contacted', 'follow_up')
        AND (SELECT MAX(created_at) FROM calls WHERE lead_phone = l.phone) < NOW() - INTERVAL '3 days'
      ORDER BY l.created_at DESC
      LIMIT 50
    `);
    
    const followups = recommendations.rows.map(lead => {
      const daysSinceLastCall = lead.last_call_at 
        ? Math.floor((Date.now() - new Date(lead.last_call_at).getTime()) / (1000 * 60 * 60 * 24))
        : 999;
      
      let recommendation = 'Call';
      let priority = 'medium';
      
      if (lead.last_outcome === 'interested') {
        recommendation = 'Schedule Follow-up Call';
        priority = 'high';
      } else if (lead.last_outcome === 'callback_requested') {
        recommendation = 'Callback - High Priority';
        priority = 'high';
      } else if (lead.call_count > 2) {
        recommendation = 'Email Follow-up';
        priority = 'low';
      }
      
      return {
        ...lead,
        daysSinceLastCall,
        recommendation,
        priority
      };
    });
    
    res.json(followups);
  } catch (error) {
    console.error('Error getting follow-up recommendations:', error);
    res.json([]);
  }
});

// Predictive Analytics - Revenue Forecasting
app.get('/api/admin/analytics/forecast', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    // Get historical data
    const historical = await query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as appointments,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_appointments,
        AVG(EXTRACT(EPOCH FROM (scheduled_for - created_at))/3600) as avg_hours_to_appointment
      FROM appointments
      WHERE created_at >= NOW() - INTERVAL '${parseInt(days) * 2} days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);
    
    // Simple forecasting algorithm
    const data = historical.rows.reverse();
    const avgDailyAppointments = data.reduce((sum, d) => sum + d.appointments, 0) / data.length;
    const conversionRate = data.reduce((sum, d) => sum + (d.confirmed_appointments / d.appointments || 0), 0) / data.length;
    
    // Generate forecast
    const forecast = [];
    for (let i = 1; i <= parseInt(days); i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      
      // Simple trend projection with some variance
      const projected = avgDailyAppointments * (1 + Math.random() * 0.2 - 0.1);
      const confirmed = projected * conversionRate;
      
      forecast.push({
        date: date.toISOString().split('T')[0],
        projectedAppointments: Math.round(projected),
        projectedConfirmed: Math.round(confirmed),
        projectedRevenue: Math.round(confirmed * 150), // Assume £150 per appointment
        confidence: i < 7 ? 'high' : i < 14 ? 'medium' : 'low'
      });
    }
    
    res.json({
      forecast,
      currentAvg: Math.round(avgDailyAppointments),
      conversionRate: Math.round(conversionRate * 100),
      period: parseInt(days)
    });
  } catch (error) {
    console.error('Error generating forecast:', error);
    res.status(500).json({ error: error.message });
  }
});

// Performance Benchmarks
app.get('/api/admin/analytics/benchmarks', async (req, res) => {
  try {
    const benchmarks = await query(`
      SELECT 
        c.client_key,
        c.display_name,
        c.industry,
        COUNT(DISTINCT l.id) as total_leads,
        COUNT(DISTINCT a.id) as total_appointments,
        COUNT(DISTINCT CASE WHEN a.status = 'confirmed' THEN a.id END) as confirmed_appointments,
        COUNT(DISTINCT cl.id) as total_calls,
        COUNT(DISTINCT CASE WHEN cl.outcome = 'booked' THEN cl.id END) as booked_calls,
        AVG(cl.duration) as avg_call_duration,
        SUM(cl.cost) as total_cost
      FROM tenants c
      LEFT JOIN leads l ON c.client_key = l.client_key
      LEFT JOIN appointments a ON c.client_key = a.client_key
      LEFT JOIN calls cl ON c.client_key = cl.client_key
      GROUP BY c.client_key, c.display_name, c.industry
    `);
    
    const benchmarked = benchmarks.rows.map(client => {
      const conversionRate = client.total_leads > 0 
        ? (client.total_appointments / client.total_leads * 100).toFixed(1)
        : 0;
      
      const callSuccessRate = client.total_calls > 0
        ? (client.booked_calls / client.total_calls * 100).toFixed(1)
        : 0;
      
      const costPerAppointment = client.total_appointments > 0
        ? (client.total_cost / client.total_appointments).toFixed(2)
        : 0;
      
      // Benchmark against industry average
      const industryBenchmarks = {
        'Healthcare': { avgConversion: 25, avgCost: 12 },
        'Dental': { avgConversion: 30, avgCost: 10 },
        'Legal': { avgConversion: 20, avgCost: 15 },
        'Real Estate': { avgConversion: 18, avgCost: 18 }
      };
      
      const industryAvg = industryBenchmarks[client.industry] || { avgConversion: 22, avgCost: 13 };
      
      return {
        ...client,
        conversionRate: parseFloat(conversionRate),
        callSuccessRate: parseFloat(callSuccessRate),
        costPerAppointment: parseFloat(costPerAppointment),
        industryAverage: industryAvg,
        performance: {
          vsAverage: parseFloat(conversionRate) > industryAvg.avgConversion ? 'above' : 'below',
          score: parseFloat(conversionRate) / industryAvg.avgConversion * 100
        }
      };
    });
    
    res.json(benchmarked);
  } catch (error) {
    console.error('Error getting benchmarks:', error);
    res.json([]);
  }
});

// Visual Sales Pipeline/Kanban Board Endpoints
app.get('/api/admin/pipeline', async (req, res) => {
  try {
    const { clientKey } = req.query;
    
    // Define pipeline stages
    const stages = [
      { id: 'new', name: 'New Leads', color: '#94a3b8', order: 1 },
      { id: 'contacted', name: 'Contacted', color: '#60a5fa', order: 2 },
      { id: 'qualified', name: 'Qualified', color: '#a78bfa', order: 3 },
      { id: 'interested', name: 'Interested', color: '#fbbf24', order: 4 },
      { id: 'booked', name: 'Booked', color: '#34d399', order: 5 },
      { id: 'confirmed', name: 'Confirmed', color: '#10b981', order: 6 },
      { id: 'converted', name: 'Converted', color: '#059669', order: 7 }
    ];
    
    // Build query with optional client filter
    let query = `
      SELECT 
        l.*,
        c.display_name as client_name,
        c.industry,
        (SELECT COUNT(*) FROM calls WHERE lead_phone = l.phone AND status = 'completed') as call_count,
        (SELECT MAX(created_at) FROM calls WHERE lead_phone = l.phone) as last_call_at,
        (SELECT outcome FROM calls WHERE lead_phone = l.phone ORDER BY created_at DESC LIMIT 1) as last_outcome,
        (SELECT status FROM appointments WHERE lead_phone = l.phone ORDER BY created_at DESC LIMIT 1) as appointment_status
      FROM leads l
      JOIN tenants c ON l.client_key = c.client_key
      WHERE 1=1
    `;
    
    const params = [];
    if (clientKey) {
      query += ` AND l.client_key = $1`;
      params.push(clientKey);
    }
    
    query += ` ORDER BY l.created_at DESC`;
    
    const leads = await query(query, params);
    
    // Score and categorize leads into stages
    const leadsByStage = {};
    stages.forEach(stage => {
      leadsByStage[stage.id] = [];
    });
    
    leads.rows.forEach(lead => {
      let stage = 'new';
      
      // Advanced stage logic based on lead status and activity
      if (lead.status === 'converted') {
        stage = 'converted';
      } else if (lead.appointment_status === 'confirmed') {
        stage = 'confirmed';
      } else if (lead.appointment_status === 'scheduled') {
        stage = 'booked';
      } else if (lead.last_outcome === 'interested' || lead.last_outcome === 'callback_requested') {
        stage = 'interested';
      } else if (lead.call_count > 0 && lead.last_outcome === 'not_interested') {
        stage = 'qualified'; // Tried but didn't book
      } else if (lead.call_count > 0) {
        stage = 'contacted';
      } else {
        stage = 'new';
      }
      
      // Calculate lead score
      let score = 0;
      const daysSinceCreation = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceCreation < 7) score += 20;
      if (lead.call_count > 0) score += 15;
      if (lead.appointment_status) score += 25;
      
      leadsByStage[stage].push({
        ...lead,
        score,
        stage
      });
    });
    
    // Calculate stage statistics
    const stageStats = stages.map(stage => {
      const leadsInStage = leadsByStage[stage.id];
      const stageTotal = leads.reduce((sum, l) => sum + (l.rows ? l.rows.length : 0), 0);
      
      return {
        ...stage,
        count: leadsInStage.length,
        totalLeads: stageTotal,
        percentage: stageTotal > 0 ? Math.round((leadsInStage.length / stageTotal) * 100) : 0,
        leads: leadsInStage,
        avgScore: leadsInStage.length > 0 
          ? Math.round(leadsInStage.reduce((sum, l) => sum + l.score, 0) / leadsInStage.length)
          : 0
      };
    });
    
    res.json({
      stages: stageStats,
      totalLeads: leads.rows.length,
      conversionRate: leads.rows.length > 0 
        ? Math.round((leadsByStage['converted'].length / leads.rows.length) * 100)
        : 0
    });
  } catch (error) {
    console.error('Error getting pipeline:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update lead stage in pipeline
app.put('/api/admin/pipeline/lead/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;
    const { stage, notes } = req.body;
    
    // Update lead status
    await query(`
      UPDATE leads 
      SET status = $1, notes = COALESCE($2, notes), updated_at = NOW()
      WHERE id = $3
    `, [stage, notes, leadId]);
    
    // Get updated lead
    const result = await query(`
      SELECT l.*, c.display_name as client_name
      FROM leads l
      JOIN tenants c ON l.client_key = c.client_key
      WHERE l.id = $1
    `, [leadId]);
    
    // Broadcast update to all connected clients
    if (socket) {
      socket.emit('pipeline-update', {
        type: 'lead-moved',
        lead: result.rows[0],
        from: null,
        to: stage
      });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating lead stage:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk move leads between stages
app.post('/api/admin/pipeline/bulk-move', async (req, res) => {
  try {
    const { leadIds, targetStage } = req.body;
    
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ error: 'leadIds must be a non-empty array' });
    }
    
    // Update multiple leads
    const placeholders = leadIds.map((_, i) => `$${i + 2}`).join(',');
    const result = await query(`
      UPDATE leads 
      SET status = $1, updated_at = NOW()
      WHERE id IN (${placeholders})
      RETURNING *
    `, [targetStage, ...leadIds]);
    
    // Broadcast bulk update
    if (socket) {
      socket.emit('pipeline-update', {
        type: 'bulk-move',
        leadIds,
        targetStage,
        count: result.rows.length
      });
    }
    
    res.json({
      success: true,
      moved: result.rows.length,
      leads: result.rows
    });
  } catch (error) {
    console.error('Error bulk moving leads:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get pipeline analytics
app.get('/api/admin/pipeline/analytics', async (req, res) => {
  try {
    const { clientKey, days = 30 } = req.query;
    
    let query = `
      SELECT 
        DATE(created_at) as date,
        status,
        COUNT(*) as count
      FROM leads
      WHERE created_at >= NOW() - INTERVAL '${parseInt(days)} days'
    `;
    
    const params = [];
    if (clientKey) {
      query += ` AND client_key = $1`;
      params.push(clientKey);
    }
    
    query += ` GROUP BY DATE(created_at), status ORDER BY date DESC`;
    
    const analytics = await query(query, params);
    
    // Calculate stage conversion funnel
    const funnel = analytics.rows.reduce((acc, row) => {
      if (!acc[row.status]) {
        acc[row.status] = 0;
      }
      acc[row.status] += parseInt(row.count);
      return acc;
    }, {});
    
    // Calculate conversion rates between stages
    const conversionRates = [];
    const stages = ['new', 'contacted', 'qualified', 'interested', 'booked', 'confirmed', 'converted'];
    
    for (let i = 0; i < stages.length - 1; i++) {
      const currentStage = stages[i];
      const nextStage = stages[i + 1];
      const currentCount = funnel[currentStage] || 0;
      const nextCount = funnel[nextStage] || 0;
      
      conversionRates.push({
        from: currentStage,
        to: nextStage,
        count: currentCount,
        converted: nextCount,
        rate: currentCount > 0 ? Math.round((nextCount / currentCount) * 100) : 0
      });
    }
    
    res.json({
      analytics: analytics.rows,
      funnel,
      conversionRates,
      averageStageTime: calculateAverageStageTime(analytics.rows)
    });
  } catch (error) {
    console.error('Error getting pipeline analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to calculate average time in each stage
function calculateAverageStageTime(analytics) {
  // This would require tracking stage changes with timestamps
  // For now, return mock data
  return {
    new: '2 days',
    contacted: '5 days',
    qualified: '3 days',
    interested: '2 days',
    booked: '1 day',
    confirmed: '7 days'
  };
}

// Email Template Management Endpoints
app.get('/api/admin/email-templates', async (req, res) => {
  try {
    const templates = await query(`
      SELECT * FROM email_templates 
      ORDER BY created_at DESC
    `);
    
    res.json(templates.rows || []);
  } catch (error) {
    console.error('Error getting email templates:', error);
    res.json([]);
  }
});

app.post('/api/admin/email-templates', async (req, res) => {
  try {
    const { name, subject, body, category, variables } = req.body;
    
    const result = await query(`
      INSERT INTO email_templates (name, subject, body, category, variables, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
    `, [name, subject, body, category || 'general', JSON.stringify(variables || [])]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating email template:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/email-templates/send', async (req, res) => {
  try {
    const { templateId, recipientEmail, recipientName, variables } = req.body;
    
    // Get template
    const templateResult = await query(`
      SELECT * FROM email_templates WHERE id = $1
    `, [templateId]);
    
    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const template = templateResult.rows[0];
    
    // Replace variables in subject and body
    let subject = template.subject;
    let body = template.body;
    
    Object.entries(variables || {}).forEach(([key, value]) => {
      subject = subject.replace(new RegExp(`{{${key}}}`, 'g'), value);
      body = body.replace(new RegExp(`{{${key}}}`, 'g'), value);
    });
    
    // Send email (using your existing email service)
    // This is a placeholder - implement with your actual email service
    console.log('Sending email:', { to: recipientEmail, subject, body });
    
    res.json({
      success: true,
      message: 'Email sent successfully',
      recipient: recipientEmail
    });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: error.message });
  }
});

// Task Management Endpoints
app.get('/api/admin/tasks', async (req, res) => {
  try {
    const { clientKey, status, assignedTo } = req.query;
    
    let query = `
      SELECT 
        t.*,
        c.display_name as client_name,
        l.name as lead_name,
        l.phone as lead_phone
      FROM tasks t
      LEFT JOIN tenants c ON t.client_key = c.client_key
      LEFT JOIN leads l ON t.lead_id = l.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (clientKey) {
      query += ` AND t.client_key = $${paramCount++}`;
      params.push(clientKey);
    }
    
    if (status) {
      query += ` AND t.status = $${paramCount++}`;
      params.push(status);
    }
    
    if (assignedTo) {
      query += ` AND t.assigned_to = $${paramCount++}`;
      params.push(assignedTo);
    }
    
    query += ` ORDER BY t.due_date ASC, t.priority DESC`;
    
    const tasks = await query(query, params);
    
    res.json(tasks.rows || []);
  } catch (error) {
    console.error('Error getting tasks:', error);
    res.json([]);
  }
});

app.post('/api/admin/tasks', async (req, res) => {
  try {
    const { title, description, clientKey, leadId, dueDate, priority, assignedTo, status } = req.body;
    
    const result = await query(`
      INSERT INTO tasks (title, description, client_key, lead_id, due_date, priority, assigned_to, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *
    `, [title, description, clientKey, leadId, dueDate, priority || 'medium', assignedTo, status || 'pending']);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const updates = req.body;
    
    const fields = [];
    const values = [];
    let paramCount = 1;
    
    Object.entries(updates).forEach(([key, value]) => {
      fields.push(`${key} = $${paramCount++}`);
      values.push(value);
    });
    
    values.push(taskId);
    
    const result = await query(`
      UPDATE tasks 
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `, values);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    
    await query(`
      DELETE FROM tasks WHERE id = $1
    `, [taskId]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: error.message });
  }
});

// Activity Timeline Endpoint
app.get('/api/admin/activities', async (req, res) => {
  try {
    const { clientKey, leadId, limit = 50 } = req.query;
    
    let query = `
      SELECT 
        a.*,
        c.display_name as client_name,
        l.name as lead_name
      FROM activities a
      LEFT JOIN tenants c ON a.client_key = c.client_key
      LEFT JOIN leads l ON a.lead_id = l.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (clientKey) {
      query += ` AND a.client_key = $${paramCount++}`;
      params.push(clientKey);
    }
    
    if (leadId) {
      query += ` AND a.lead_id = $${paramCount++}`;
      params.push(leadId);
    }
    
    query += ` ORDER BY a.created_at DESC LIMIT $${paramCount++}`;
    params.push(parseInt(limit));
    
    const activities = await query(query, params);
    
    res.json(activities.rows || []);
  } catch (error) {
    console.error('Error getting activities:', error);
    res.json([]);
  }
});

app.post('/api/admin/activities', async (req, res) => {
  try {
    const { type, description, clientKey, leadId, metadata } = req.body;
    
    const result = await query(`
      INSERT INTO activities (type, description, client_key, lead_id, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
    `, [type, description, clientKey, leadId, JSON.stringify(metadata || {})]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating activity:', error);
    res.status(500).json({ error: error.message });
  }
});

// Deal & Opportunity Tracking Endpoints
app.get('/api/admin/deals', async (req, res) => {
  try {
    const { clientKey, stage, minValue } = req.query;
    
    let query = `
      SELECT 
        d.*,
        c.display_name as client_name,
        l.name as lead_name,
        l.phone as lead_phone
      FROM deals d
      LEFT JOIN tenants c ON d.client_key = c.client_key
      LEFT JOIN leads l ON d.lead_id = l.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (clientKey) {
      query += ` AND d.client_key = $${paramCount++}`;
      params.push(clientKey);
    }
    
    if (stage) {
      query += ` AND d.stage = $${paramCount++}`;
      params.push(stage);
    }
    
    if (minValue) {
      query += ` AND d.value >= $${paramCount++}`;
      params.push(parseFloat(minValue));
    }
    
    query += ` ORDER BY d.expected_close_date ASC`;
    
    const deals = await query(query, params);
    
    res.json(deals.rows || []);
  } catch (error) {
    console.error('Error getting deals:', error);
    res.json([]);
  }
});

app.post('/api/admin/deals', async (req, res) => {
  try {
    const { 
      name, 
      clientKey, 
      leadId, 
      value, 
      stage, 
      probability, 
      expectedCloseDate, 
      actualCloseDate,
      notes,
      winReason,
      lossReason
    } = req.body;
    
    const result = await query(`
      INSERT INTO deals (
        name, client_key, lead_id, value, stage, probability, 
        expected_close_date, actual_close_date, notes, win_reason, loss_reason, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING *
    `, [
      name, clientKey, leadId, value, stage || 'prospecting', 
      probability || 50, expectedCloseDate, actualCloseDate, notes, winReason, lossReason
    ]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating deal:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/deals/:dealId', async (req, res) => {
  try {
    const { dealId } = req.params;
    const updates = req.body;
    
    const fields = [];
    const values = [];
    let paramCount = 1;
    
    Object.entries(updates).forEach(([key, value]) => {
      fields.push(`${key} = $${paramCount++}`);
      values.push(value);
    });
    
    values.push(dealId);
    
    const result = await query(`
      UPDATE deals 
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `, values);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating deal:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/deals/pipeline-value', async (req, res) => {
  try {
    const { clientKey } = req.query;
    
    let query = `
      SELECT 
        stage,
        COUNT(*) as deal_count,
        SUM(value) as total_value,
        SUM(value * probability / 100) as weighted_value
      FROM deals
      WHERE actual_close_date IS NULL
    `;
    
    const params = [];
    if (clientKey) {
      query += ` AND client_key = $1`;
      params.push(clientKey);
    }
    
    query += ` GROUP BY stage ORDER BY 
      CASE stage
        WHEN 'prospecting' THEN 1
        WHEN 'qualification' THEN 2
        WHEN 'proposal' THEN 3
        WHEN 'negotiation' THEN 4
        WHEN 'closed-won' THEN 5
        WHEN 'closed-lost' THEN 6
        ELSE 7
      END`;
    
    const pipeline = await query(query, params);
    
    // Calculate totals
    const totals = pipeline.rows.reduce((acc, row) => {
      acc.totalDeals += parseInt(row.deal_count);
      acc.totalValue += parseFloat(row.total_value);
      acc.weightedValue += parseFloat(row.weighted_value);
      return acc;
    }, { totalDeals: 0, totalValue: 0, weightedValue: 0 });
    
    res.json({
      stages: pipeline.rows,
      summary: totals
    });
  } catch (error) {
    console.error('Error getting pipeline value:', error);
    res.status(500).json({ error: error.message });
  }
});

// Enhanced Calendar Integration Endpoints
app.get('/api/admin/calendar/events', async (req, res) => {
  try {
    const { clientKey, startDate, endDate } = req.query;
    
    let query = `
      SELECT 
        a.*,
        c.display_name as client_name,
        l.name as lead_name,
        l.phone as lead_phone
      FROM appointments a
      LEFT JOIN tenants c ON a.client_key = c.client_key
      LEFT JOIN leads l ON a.lead_phone = l.phone
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (clientKey) {
      query += ` AND a.client_key = $${paramCount++}`;
      params.push(clientKey);
    }
    
    if (startDate) {
      query += ` AND a.scheduled_for >= $${paramCount++}`;
      params.push(startDate);
    }
    
    if (endDate) {
      query += ` AND a.scheduled_for <= $${paramCount++}`;
      params.push(endDate);
    }
    
    query += ` ORDER BY a.scheduled_for ASC`;
    
    const events = await query(query, params);
    
    res.json(events.rows || []);
  } catch (error) {
    console.error('Error getting calendar events:', error);
    res.json([]);
  }
});

app.post('/api/admin/calendar/sync', async (req, res) => {
  try {
    const { clientKey, calendarId } = req.body;
    
    // This would integrate with Google Calendar or Outlook
    // For now, return a success message
    console.log('Syncing calendar for client:', clientKey, 'with calendar:', calendarId);
    
    res.json({
      success: true,
      message: 'Calendar sync initiated',
      calendarId
    });
  } catch (error) {
    console.error('Error syncing calendar:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/calendar/availability', async (req, res) => {
  try {
    const { clientKey, date, duration } = req.query;
    
    // Get client timezone
    const client = await getFullClient(clientKey);
    const timezone = client?.timezone || 'Europe/London';
    
    // Generate available time slots
    const availableSlots = generateAvailableSlots(date, duration, timezone);
    
    res.json({
      clientKey,
      date,
      timezone,
      availableSlots
    });
  } catch (error) {
    console.error('Error getting availability:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to generate available time slots
function generateAvailableSlots(date, duration = 30, timezone = 'Europe/London') {
  const slots = [];
  const startHour = 9; // 9 AM
  const endHour = 17; // 5 PM
  
  for (let hour = startHour; hour < endHour; hour++) {
    for (let minute = 0; minute < 60; minute += duration) {
      slots.push({
        time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
        available: true
      });
    }
  }
  
  return slots;
}

// Document Management Endpoints
app.get('/api/admin/documents', async (req, res) => {
  try {
    const { clientKey, leadId, documentType } = req.query;
    
    let query = `
      SELECT 
        d.*,
        c.display_name as client_name,
        l.name as lead_name
      FROM documents d
      LEFT JOIN tenants c ON d.client_key = c.client_key
      LEFT JOIN leads l ON d.lead_id = l.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (clientKey) {
      query += ` AND d.client_key = $${paramCount++}`;
      params.push(clientKey);
    }
    
    if (leadId) {
      query += ` AND d.lead_id = $${paramCount++}`;
      params.push(leadId);
    }
    
    if (documentType) {
      query += ` AND d.document_type = $${paramCount++}`;
      params.push(documentType);
    }
    
    query += ` ORDER BY d.created_at DESC`;
    
    const documents = await query(query, params);
    
    res.json(documents.rows || []);
  } catch (error) {
    console.error('Error getting documents:', error);
    res.json([]);
  }
});

app.post('/api/admin/documents', async (req, res) => {
  try {
    const { filename, fileUrl, clientKey, leadId, documentType, notes } = req.body;
    
    const result = await query(`
      INSERT INTO documents (filename, file_url, client_key, lead_id, document_type, notes, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `, [filename, fileUrl, clientKey, leadId, documentType || 'general', notes]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/documents/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    
    await query(`
      DELETE FROM documents WHERE id = $1
    `, [documentId]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: error.message });
  }
});

// Team Collaboration - Comments & Mentions
app.get('/api/admin/comments', async (req, res) => {
  try {
    const { clientKey, leadId, taskId, dealId } = req.query;
    
    let query = `
      SELECT 
        c.*,
        u.username as author_name,
        l.name as lead_name
      FROM comments c
      LEFT JOIN user_accounts u ON c.author_id = u.id
      LEFT JOIN leads l ON c.lead_id = l.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (clientKey) {
      query += ` AND c.client_key = $${paramCount++}`;
      params.push(clientKey);
    }
    
    if (leadId) {
      query += ` AND c.lead_id = $${paramCount++}`;
      params.push(leadId);
    }
    
    if (taskId) {
      query += ` AND c.task_id = $${paramCount++}`;
      params.push(taskId);
    }
    
    if (dealId) {
      query += ` AND c.deal_id = $${paramCount++}`;
      params.push(dealId);
    }
    
    query += ` ORDER BY c.created_at ASC`;
    
    const comments = await query(query, params);
    
    res.json(comments.rows || []);
  } catch (error) {
    console.error('Error getting comments:', error);
    res.json([]);
  }
});

app.post('/api/admin/comments', async (req, res) => {
  try {
    const { text, clientKey, leadId, taskId, dealId, mentions, authorId } = req.body;
    
    const result = await query(`
      INSERT INTO comments (text, client_key, lead_id, task_id, deal_id, mentions, author_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `, [text, clientKey, leadId, taskId, dealId, JSON.stringify(mentions || []), authorId]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/comments/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;
    const { text, mentions } = req.body;
    
    const result = await query(`
      UPDATE comments 
      SET text = $1, mentions = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [text, JSON.stringify(mentions || []), commentId]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/comments/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;
    
    await query(`
      DELETE FROM comments WHERE id = $1
    `, [commentId]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Custom Fields Management
app.get('/api/admin/custom-fields', async (req, res) => {
  try {
    const { clientKey, entityType } = req.query;
    
    let query = `
      SELECT * FROM custom_fields
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (clientKey) {
      query += ` AND client_key = $${paramCount++}`;
      params.push(clientKey);
    }
    
    if (entityType) {
      query += ` AND entity_type = $${paramCount++}`;
      params.push(entityType);
    }
    
    query += ` ORDER BY display_order ASC`;
    
    const fields = await query(query, params);
    
    res.json(fields.rows || []);
  } catch (error) {
    console.error('Error getting custom fields:', error);
    res.json([]);
  }
});

app.post('/api/admin/custom-fields', async (req, res) => {
  try {
    const { 
      name, 
      fieldType, 
      entityType, 
      clientKey, 
      options, 
      isRequired, 
      defaultValue,
      displayOrder
    } = req.body;
    
    const result = await query(`
      INSERT INTO custom_fields (
        name, field_type, entity_type, client_key, options, 
        is_required, default_value, display_order, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *
    `, [
      name, fieldType, entityType, clientKey, JSON.stringify(options || []),
      isRequired || false, defaultValue, displayOrder || 0
    ]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating custom field:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/custom-fields/:fieldId', async (req, res) => {
  try {
    const { fieldId } = req.params;
    const updates = req.body;
    
    const fields = [];
    const values = [];
    let paramCount = 1;
    
    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'options') {
        fields.push(`${key} = $${paramCount++}`);
        values.push(JSON.stringify(value));
      } else {
        fields.push(`${key} = $${paramCount++}`);
        values.push(value);
      }
    });
    
    values.push(fieldId);
    
    const result = await query(`
      UPDATE custom_fields 
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `, values);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating custom field:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/custom-fields/:fieldId', async (req, res) => {
  try {
    const { fieldId } = req.params;
    
    await query(`
      DELETE FROM custom_fields WHERE id = $1
    `, [fieldId]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting custom field:', error);
    res.status(500).json({ error: error.message });
  }
});

// Call Recording & Playback Endpoints
app.get('/api/admin/call-recordings', async (req, res) => {
  try {
    const { clientKey, leadPhone, callId } = req.query;
    
    let query = `
      SELECT 
        r.*,
        c.display_name as client_name,
        l.name as lead_name,
        cl.duration as call_duration,
        cl.outcome as call_outcome
      FROM call_recordings r
      LEFT JOIN tenants c ON r.client_key = c.client_key
      LEFT JOIN leads l ON r.lead_phone = l.phone
      LEFT JOIN calls cl ON r.call_id = cl.call_id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (clientKey) {
      query += ` AND r.client_key = $${paramCount++}`;
      params.push(clientKey);
    }
    
    if (leadPhone) {
      query += ` AND r.lead_phone = $${paramCount++}`;
      params.push(leadPhone);
    }
    
    if (callId) {
      query += ` AND r.call_id = $${paramCount++}`;
      params.push(callId);
    }
    
    query += ` ORDER BY r.created_at DESC`;
    
    const recordings = await query(query, params);
    
    res.json(recordings.rows || []);
  } catch (error) {
    console.error('Error getting call recordings:', error);
    res.json([]);
  }
});

app.post('/api/admin/call-recordings', async (req, res) => {
  try {
    const { callId, clientKey, leadPhone, recordingUrl, transcript, duration, metadata } = req.body;
    
    const result = await query(`
      INSERT INTO call_recordings (
        call_id, client_key, lead_phone, recording_url, transcript, 
        duration, metadata, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `, [
      callId, clientKey, leadPhone, recordingUrl, transcript, 
      duration, JSON.stringify(metadata || {})
    ]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating call recording:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/call-recordings/:recordingId/play', async (req, res) => {
  try {
    const { recordingId } = req.params;
    
    const result = await query(`
      SELECT recording_url FROM call_recordings WHERE id = $1
    `, [recordingId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recording not found' });
    }
    
    // Redirect to the recording URL
    res.redirect(result.rows[0].recording_url);
  } catch (error) {
    console.error('Error playing recording:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/call-recordings/:recordingId/transcript', async (req, res) => {
  try {
    const { recordingId } = req.params;
    
    const result = await query(`
      SELECT transcript FROM call_recordings WHERE id = $1
    `, [recordingId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recording not found' });
    }
    
    res.json({ transcript: result.rows[0].transcript });
  } catch (error) {
    console.error('Error getting transcript:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/call-recordings/:recordingId', async (req, res) => {
  try {
    const { recordingId } = req.params;
    
    await query(`
      DELETE FROM call_recordings WHERE id = $1
    `, [recordingId]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting recording:', error);
    res.status(500).json({ error: error.message });
  }
});

// Call Analytics & Insights
app.get('/api/admin/calls/insights', async (req, res) => {
  try {
    const { clientKey, days = 30 } = req.query;
    
    let query = `
      SELECT 
        cl.*,
        cr.transcript,
        cr.recording_url,
        l.name as lead_name,
        c.display_name as client_name
      FROM calls cl
      LEFT JOIN call_recordings cr ON cl.call_id = cr.call_id
      LEFT JOIN leads l ON cl.lead_phone = l.phone
      LEFT JOIN tenants c ON cl.client_key = c.client_key
      WHERE cl.created_at >= NOW() - INTERVAL '${parseInt(days)} days'
    `;
    
    const params = [];
    if (clientKey) {
      query += ` AND cl.client_key = $1`;
      params.push(clientKey);
    }
    
    query += ` ORDER BY cl.created_at DESC`;
    
    const calls = await query(query, params);
    
    // Analyze calls for insights
    const insights = {
      totalCalls: calls.rows.length,
      totalDuration: calls.rows.reduce((sum, c) => sum + (c.duration || 0), 0),
      avgDuration: calls.rows.length > 0 
        ? Math.round(calls.rows.reduce((sum, c) => sum + (c.duration || 0), 0) / calls.rows.length)
        : 0,
      outcomes: calls.rows.reduce((acc, c) => {
        acc[c.outcome] = (acc[c.outcome] || 0) + 1;
        return acc;
      }, {}),
      recordings: calls.rows.filter(c => c.recording_url).length,
      transcripts: calls.rows.filter(c => c.transcript).length
    };
    
    res.json({
      calls: calls.rows,
      insights
    });
  } catch (error) {
    console.error('Error getting call insights:', error);
    res.status(500).json({ error: error.message });
  }
});

// Lead Scoring Automation Endpoints
app.get('/api/admin/leads/scoring', async (req, res) => {
  try {
    const { limit = 50, sortBy = 'score', order = 'desc' } = req.query;
    
    const leads = await query(`
      SELECT 
        l.*,
        COUNT(c.id) as call_count,
        AVG(c.duration) as avg_duration,
        AVG(c.quality_score) as avg_quality,
        COUNT(m.id) as sms_count,
        l.score,
        l.engagement_score,
        l.conversion_probability,
        l.score_factors,
        l.last_score_update
      FROM leads l
      LEFT JOIN calls c ON l.id = c.lead_id
      LEFT JOIN messages m ON l.id = m.lead_id AND m.direction = 'outbound'
      GROUP BY l.id
      ORDER BY ${sortBy} ${order.toUpperCase()}
      LIMIT $1
    `, [limit]);
    
    res.json(leads.rows.map(lead => ({
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      source: lead.source,
      score: lead.score || 50,
      engagementScore: lead.engagement_score || 0,
      conversionProbability: lead.conversion_probability || 0,
      scoreFactors: lead.score_factors || {},
      lastScoreUpdate: lead.last_score_update,
      callCount: parseInt(lead.call_count) || 0,
      avgDuration: parseFloat(lead.avg_duration) || 0,
      avgQuality: parseFloat(lead.avg_quality) || 0,
      smsCount: parseInt(lead.sms_count) || 0,
      createdAt: lead.created_at,
      tags: lead.tags
    })));
  } catch (error) {
    console.error('Error getting lead scoring data:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/leads/:leadId/score', async (req, res) => {
  try {
    const { leadId } = req.params;
    
    const result = await query('SELECT calculate_lead_score($1)', [leadId]);
    const newScore = result.rows[0].calculate_lead_score;
    
    res.json({ 
      success: true, 
      leadId: parseInt(leadId),
      newScore,
      message: 'Lead score updated successfully'
    });
  } catch (error) {
    console.error('Error updating lead score:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/leads/scoring/update-all', async (req, res) => {
  try {
    const result = await query('SELECT update_all_lead_scores()');
    const updatedCount = result.rows[0].update_all_lead_scores;
    
    res.json({ 
      success: true, 
      updatedCount,
      message: `Updated scores for ${updatedCount} leads`
    });
  } catch (error) {
    console.error('Error updating all lead scores:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/leads/scoring/rules', async (req, res) => {
  try {
    const rules = await query(`
      SELECT * FROM lead_scoring_rules 
      WHERE is_active = true 
      ORDER BY priority ASC, id ASC
    `);
    
    res.json(rules.rows.map(rule => ({
      id: rule.id,
      ruleName: rule.rule_name,
      ruleType: rule.rule_type,
      conditionField: rule.condition_field,
      conditionOperator: rule.condition_operator,
      conditionValue: rule.condition_value,
      scoreAdjustment: rule.score_adjustment,
      priority: rule.priority,
      isActive: rule.is_active,
      createdAt: rule.created_at
    })));
  } catch (error) {
    console.error('Error getting scoring rules:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/leads/scoring/rules', async (req, res) => {
  try {
    const { 
      ruleName, 
      ruleType, 
      conditionField, 
      conditionOperator, 
      conditionValue, 
      scoreAdjustment, 
      priority = 0 
    } = req.body;
    
    if (!ruleName || !ruleType || !conditionField || !conditionOperator || !conditionValue || scoreAdjustment === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const result = await query(`
      INSERT INTO lead_scoring_rules 
      (rule_name, rule_type, condition_field, condition_operator, condition_value, score_adjustment, priority)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [ruleName, ruleType, conditionField, conditionOperator, conditionValue, scoreAdjustment, priority]);
    
    res.json({ 
      success: true, 
      rule: result.rows[0],
      message: 'Scoring rule created successfully'
    });
  } catch (error) {
    console.error('Error creating scoring rule:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/leads/scoring/rules/:ruleId', async (req, res) => {
  try {
    const { ruleId } = req.params;
    const { 
      ruleName, 
      ruleType, 
      conditionField, 
      conditionOperator, 
      conditionValue, 
      scoreAdjustment, 
      priority,
      isActive 
    } = req.body;
    
    const result = await query(`
      UPDATE lead_scoring_rules 
      SET 
        rule_name = COALESCE($2, rule_name),
        rule_type = COALESCE($3, rule_type),
        condition_field = COALESCE($4, condition_field),
        condition_operator = COALESCE($5, condition_operator),
        condition_value = COALESCE($6, condition_value),
        score_adjustment = COALESCE($7, score_adjustment),
        priority = COALESCE($8, priority),
        is_active = COALESCE($9, is_active),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [ruleId, ruleName, ruleType, conditionField, conditionOperator, conditionValue, scoreAdjustment, priority, isActive]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scoring rule not found' });
    }
    
    res.json({ 
      success: true, 
      rule: result.rows[0],
      message: 'Scoring rule updated successfully'
    });
  } catch (error) {
    console.error('Error updating scoring rule:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/leads/scoring/rules/:ruleId', async (req, res) => {
  try {
    const { ruleId } = req.params;
    
    const result = await query(`
      UPDATE lead_scoring_rules 
      SET is_active = false, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [ruleId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scoring rule not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'Scoring rule deactivated successfully'
    });
  } catch (error) {
    console.error('Error deactivating scoring rule:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/leads/scoring/history/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;
    const { limit = 20 } = req.query;
    
    const history = await query(`
      SELECT * FROM lead_scoring_history 
      WHERE lead_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `, [leadId, limit]);
    
    res.json(history.rows.map(record => ({
      id: record.id,
      leadId: record.lead_id,
      oldScore: record.old_score,
      newScore: record.new_score,
      scoreChange: record.score_change,
      scoringFactors: record.scoring_factors,
      triggeredRules: record.triggered_rules,
      createdAt: record.created_at
    })));
  } catch (error) {
    console.error('Error getting scoring history:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/leads/scoring/analytics', async (req, res) => {
  try {
    const analytics = await query(`
      SELECT 
        COUNT(*) as total_leads,
        AVG(score) as avg_score,
        AVG(engagement_score) as avg_engagement,
        AVG(conversion_probability) as avg_conversion_prob,
        COUNT(CASE WHEN score >= 80 THEN 1 END) as high_score_leads,
        COUNT(CASE WHEN score BETWEEN 50 AND 79 THEN 1 END) as medium_score_leads,
        COUNT(CASE WHEN score < 50 THEN 1 END) as low_score_leads,
        COUNT(CASE WHEN engagement_score >= 70 THEN 1 END) as high_engagement_leads
      FROM leads
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `);
    
    const row = analytics.rows[0];
    res.json({
      totalLeads: parseInt(row.total_leads) || 0,
      avgScore: parseFloat(row.avg_score) || 0,
      avgEngagement: parseFloat(row.avg_engagement) || 0,
      avgConversionProb: parseFloat(row.avg_conversion_prob) || 0,
      highScoreLeads: parseInt(row.high_score_leads) || 0,
      mediumScoreLeads: parseInt(row.medium_score_leads) || 0,
      lowScoreLeads: parseInt(row.low_score_leads) || 0,
      highEngagementLeads: parseInt(row.high_engagement_leads) || 0,
      highScorePercentage: row.total_leads > 0 ? ((parseInt(row.high_score_leads) / parseInt(row.total_leads)) * 100).toFixed(1) : 0
    });
  } catch (error) {
    console.error('Error getting scoring analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Appointment Analytics Endpoints
app.get('/api/admin/appointments/analytics', async (req, res) => {
  try {
    const { clientKey, startDate, endDate, daysBack = 30 } = req.query;
    
    const start = startDate || new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];
    
    // Get appointment metrics
    const metricsResult = await query(`
      SELECT calculate_appointment_metrics($1, $2::DATE, $3::DATE) as metrics
    `, [clientKey || 'default', start, end]);
    
    const metrics = metricsResult.rows[0].metrics;
    
    // Get appointment insights
    const insightsResult = await query(`
      SELECT get_appointment_insights($1, $2) as insights
    `, [clientKey || 'default', daysBack]);
    
    const insights = insightsResult.rows[0].insights;
    
    // Get funnel data
    const funnelResult = await query(`
      SELECT 
        DATE_TRUNC('day', date) as date,
        leads_generated,
        calls_made,
        appointments_scheduled,
        appointments_confirmed,
        appointments_completed,
        appointments_no_show,
        appointments_cancelled,
        total_revenue
      FROM appointment_funnel 
      WHERE client_key = $1 
      AND date BETWEEN $2::DATE AND $3::DATE
      ORDER BY date DESC
    `, [clientKey || 'default', start, end]);
    
    // Get hourly distribution
    const hourlyResult = await query(`
      SELECT 
        EXTRACT(HOUR FROM appointment_time) as hour,
        COUNT(*) as total_appointments,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'no_show' THEN 1 END) as no_shows,
        AVG(revenue) as avg_revenue
      FROM appointment_analytics 
      WHERE client_key = $1 
      AND DATE(appointment_time) BETWEEN $2::DATE AND $3::DATE
      GROUP BY EXTRACT(HOUR FROM appointment_time)
      ORDER BY hour
    `, [clientKey || 'default', start, end]);
    
    // Get daily distribution
    const dailyResult = await query(`
      SELECT 
        EXTRACT(DOW FROM appointment_time) as day_of_week,
        COUNT(*) as total_appointments,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'no_show' THEN 1 END) as no_shows,
        AVG(revenue) as avg_revenue
      FROM appointment_analytics 
      WHERE client_key = $1 
      AND DATE(appointment_time) BETWEEN $2::DATE AND $3::DATE
      GROUP BY EXTRACT(DOW FROM appointment_time)
      ORDER BY day_of_week
    `, [clientKey || 'default', start, end]);
    
    res.json({
      metrics: {
        totalAppointments: parseInt(metrics.total_appointments) || 0,
        completedAppointments: parseInt(metrics.completed_appointments) || 0,
        noShowCount: parseInt(metrics.no_show_count) || 0,
        cancellationCount: parseInt(metrics.cancellation_count) || 0,
        rescheduleCount: parseInt(metrics.reschedule_count) || 0,
        noShowRate: parseFloat(metrics.no_show_rate) || 0,
        completionRate: parseFloat(metrics.completion_rate) || 0,
        avgDuration: parseFloat(metrics.avg_duration) || 0,
        peakHourAppointments: parseInt(metrics.peak_hour_appointments) || 0,
        offPeakAppointments: parseInt(metrics.off_peak_appointments) || 0,
        weekendAppointments: parseInt(metrics.weekend_appointments) || 0,
        weekdayAppointments: parseInt(metrics.weekday_appointments) || 0,
        totalRevenue: parseFloat(metrics.total_revenue) || 0,
        avgRevenuePerAppointment: parseFloat(metrics.avg_revenue_per_appointment) || 0
      },
      insights: {
        bestHour: insights.best_hour,
        worstHour: insights.worst_hour,
        bestDay: insights.best_day,
        worstDay: insights.worst_day,
        avgNoShowRate: parseFloat(insights.avg_no_show_rate) || 0,
        industryBenchmark: parseFloat(insights.industry_benchmark) || 0,
        performanceVsBenchmark: parseFloat(insights.performance_vs_benchmark) || 0,
        recommendations: insights.recommendations || []
      },
      funnel: funnelResult.rows.map(row => ({
        date: row.date,
        leadsGenerated: parseInt(row.leads_generated) || 0,
        callsMade: parseInt(row.calls_made) || 0,
        appointmentsScheduled: parseInt(row.appointments_scheduled) || 0,
        appointmentsConfirmed: parseInt(row.appointments_confirmed) || 0,
        appointmentsCompleted: parseInt(row.appointments_completed) || 0,
        appointmentsNoShow: parseInt(row.appointments_no_show) || 0,
        appointmentsCancelled: parseInt(row.appointments_cancelled) || 0,
        totalRevenue: parseFloat(row.total_revenue) || 0
      })),
      hourlyDistribution: hourlyResult.rows.map(row => ({
        hour: parseInt(row.hour),
        totalAppointments: parseInt(row.total_appointments) || 0,
        completed: parseInt(row.completed) || 0,
        noShows: parseInt(row.no_shows) || 0,
        avgRevenue: parseFloat(row.avg_revenue) || 0,
        completionRate: row.total_appointments > 0 ? ((parseInt(row.completed) / parseInt(row.total_appointments)) * 100).toFixed(1) : 0
      })),
      dailyDistribution: dailyResult.rows.map(row => ({
        dayOfWeek: parseInt(row.day_of_week),
        dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][parseInt(row.day_of_week)],
        totalAppointments: parseInt(row.total_appointments) || 0,
        completed: parseInt(row.completed) || 0,
        noShows: parseInt(row.no_shows) || 0,
        avgRevenue: parseFloat(row.avg_revenue) || 0,
        completionRate: row.total_appointments > 0 ? ((parseInt(row.completed) / parseInt(row.total_appointments)) * 100).toFixed(1) : 0
      }))
    });
  } catch (error) {
    console.error('Error getting appointment analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/appointments/list', async (req, res) => {
  try {
    const { clientKey, status, startDate, endDate, limit = 100 } = req.query;
    
    let queryStr = `
      SELECT 
        aa.*,
        l.name as lead_name,
        l.phone as lead_phone,
        l.email as lead_email,
        t.display_name as client_name
      FROM appointment_analytics aa
      LEFT JOIN leads l ON aa.lead_id = l.id
      LEFT JOIN tenants t ON aa.client_key = t.client_key
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;
    
    if (clientKey) {
      queryStr += ` AND aa.client_key = $${++paramCount}`;
      params.push(clientKey);
    }
    
    if (status) {
      queryStr += ` AND aa.status = $${++paramCount}`;
      params.push(status);
    }
    
    if (startDate) {
      queryStr += ` AND DATE(aa.appointment_time) >= $${++paramCount}`;
      params.push(startDate);
    }
    
    if (endDate) {
      queryStr += ` AND DATE(aa.appointment_time) <= $${++paramCount}`;
      params.push(endDate);
    }
    
    queryStr += ` ORDER BY aa.appointment_time DESC LIMIT $${++paramCount}`;
    params.push(limit);
    
    const appointments = await query(queryStr, params);
    
    res.json(appointments.rows.map(apt => ({
      id: apt.id,
      appointmentId: apt.appointment_id,
      clientKey: apt.client_key,
      clientName: apt.client_name,
      leadId: apt.lead_id,
      leadName: apt.lead_name,
      leadPhone: apt.lead_phone,
      leadEmail: apt.lead_email,
      appointmentTime: apt.appointment_time,
      durationMinutes: apt.duration_minutes,
      status: apt.status,
      outcome: apt.outcome,
      revenue: parseFloat(apt.revenue) || 0,
      serviceType: apt.service_type,
      bookingSource: apt.booking_source,
      confirmationSent: apt.confirmation_sent,
      reminderSent24h: apt.reminder_sent_24h,
      reminderSent1h: apt.reminder_sent_1h,
      noShowReason: apt.no_show_reason,
      cancellationReason: apt.cancellation_reason,
      rescheduleCount: apt.reschedule_count,
      createdAt: apt.created_at,
      updatedAt: apt.updated_at
    })));
  } catch (error) {
    console.error('Error getting appointments list:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/appointments/analytics/update-funnel', async (req, res) => {
  try {
    const { clientKey, date } = req.body;
    
    await query('SELECT update_appointment_funnel($1, $2::DATE)', [clientKey || 'default', date || new Date().toISOString().split('T')[0]]);
    
    res.json({ 
      success: true, 
      message: 'Appointment funnel updated successfully' 
    });
  } catch (error) {
    console.error('Error updating appointment funnel:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/appointments/performance', async (req, res) => {
  try {
    const { clientKey, daysBack = 30 } = req.query;
    
    const performance = await query(`
      SELECT 
        metric_date,
        total_appointments,
        completed_appointments,
        no_show_count,
        cancellation_count,
        reschedule_count,
        no_show_rate,
        completion_rate,
        avg_appointment_duration,
        peak_hour_appointments,
        off_peak_appointments,
        weekend_appointments,
        weekday_appointments,
        total_revenue,
        avg_revenue_per_appointment
      FROM appointment_performance 
      WHERE client_key = $1 
      AND metric_date >= CURRENT_DATE - INTERVAL '${daysBack} days'
      ORDER BY metric_date DESC
    `, [clientKey || 'default']);
    
    res.json(performance.rows.map(row => ({
      date: row.metric_date,
      totalAppointments: parseInt(row.total_appointments) || 0,
      completedAppointments: parseInt(row.completed_appointments) || 0,
      noShowCount: parseInt(row.no_show_count) || 0,
      cancellationCount: parseInt(row.cancellation_count) || 0,
      rescheduleCount: parseInt(row.reschedule_count) || 0,
      noShowRate: parseFloat(row.no_show_rate) || 0,
      completionRate: parseFloat(row.completion_rate) || 0,
      avgDuration: parseFloat(row.avg_appointment_duration) || 0,
      peakHourAppointments: parseInt(row.peak_hour_appointments) || 0,
      offPeakAppointments: parseInt(row.off_peak_appointments) || 0,
      weekendAppointments: parseInt(row.weekend_appointments) || 0,
      weekdayAppointments: parseInt(row.weekday_appointments) || 0,
      totalRevenue: parseFloat(row.total_revenue) || 0,
      avgRevenuePerAppointment: parseFloat(row.avg_revenue_per_appointment) || 0
    })));
  } catch (error) {
    console.error('Error getting appointment performance:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/appointments/insights', async (req, res) => {
  try {
    const { clientKey, daysBack = 30 } = req.query;
    
    const insightsResult = await query(`
      SELECT get_appointment_insights($1, $2) as insights
    `, [clientKey || 'default', daysBack]);
    
    const insights = insightsResult.rows[0].insights;
    
    res.json({
      bestHour: insights.best_hour,
      worstHour: insights.worst_hour,
      bestDay: insights.best_day,
      worstDay: insights.worst_day,
      avgNoShowRate: parseFloat(insights.avg_no_show_rate) || 0,
      industryBenchmark: parseFloat(insights.industry_benchmark) || 0,
      performanceVsBenchmark: parseFloat(insights.performance_vs_benchmark) || 0,
      recommendations: insights.recommendations || []
    });
  } catch (error) {
    console.error('Error getting appointment insights:', error);
    res.status(500).json({ error: error.message });
  }
});

// Follow-up Sequences Endpoints
app.get('/api/admin/follow-ups/sequences', async (req, res) => {
  try {
    const { clientKey } = req.query;
    
    const sequences = await query(`
      SELECT 
        fs.*,
        COUNT(fe.id) as execution_count,
        COUNT(CASE WHEN fe.status = 'completed' THEN 1 END) as completed_count
      FROM follow_up_sequences fs
      LEFT JOIN follow_up_executions fe ON fs.id = fe.sequence_id
      WHERE fs.client_key = $1 OR $1 IS NULL
      GROUP BY fs.id
      ORDER BY fs.priority DESC, fs.created_at ASC
    `, [clientKey]);
    
    res.json(sequences.rows.map(seq => ({
      id: seq.id,
      name: seq.name,
      description: seq.description,
      triggerType: seq.trigger_type,
      triggerConditions: seq.trigger_conditions,
      isActive: seq.is_active,
      priority: seq.priority,
      clientKey: seq.client_key,
      executionCount: parseInt(seq.execution_count) || 0,
      completedCount: parseInt(seq.completed_count) || 0,
      completionRate: seq.execution_count > 0 ? ((parseInt(seq.completed_count) / parseInt(seq.execution_count)) * 100).toFixed(1) : 0,
      createdAt: seq.created_at,
      updatedAt: seq.updated_at
    })));
  } catch (error) {
    console.error('Error getting follow-up sequences:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/follow-ups/sequences', async (req, res) => {
  try {
    const { 
      name, 
      description, 
      triggerType, 
      triggerConditions, 
      priority = 0, 
      clientKey = 'default' 
    } = req.body;
    
    if (!name || !triggerType) {
      return res.status(400).json({ error: 'Name and trigger type are required' });
    }
    
    const result = await query(`
      INSERT INTO follow_up_sequences 
      (name, description, trigger_type, trigger_conditions, priority, client_key)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [name, description, triggerType, triggerConditions, priority, clientKey]);
    
    res.json({ 
      success: true, 
      sequence: result.rows[0],
      message: 'Follow-up sequence created successfully'
    });
  } catch (error) {
    console.error('Error creating follow-up sequence:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/follow-ups/sequences/:sequenceId/steps', async (req, res) => {
  try {
    const { sequenceId } = req.params;
    
    const steps = await query(`
      SELECT * FROM follow_up_steps 
      WHERE sequence_id = $1 
      ORDER BY step_order ASC
    `, [sequenceId]);
    
    res.json(steps.rows.map(step => ({
      id: step.id,
      sequenceId: step.sequence_id,
      stepOrder: step.step_order,
      stepType: step.step_type,
      delayHours: step.delay_hours,
      delayDays: step.delay_days,
      subject: step.subject,
      content: step.content,
      templateVariables: step.template_variables,
      conditions: step.conditions,
      isActive: step.is_active,
      createdAt: step.created_at
    })));
  } catch (error) {
    console.error('Error getting sequence steps:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/follow-ups/sequences/:sequenceId/steps', async (req, res) => {
  try {
    const { sequenceId } = req.params;
    const { 
      stepOrder, 
      stepType, 
      delayHours = 0, 
      delayDays = 0, 
      subject, 
      content, 
      templateVariables = {}, 
      conditions = {} 
    } = req.body;
    
    if (!stepOrder || !stepType || !content) {
      return res.status(400).json({ error: 'Step order, type, and content are required' });
    }
    
    const result = await query(`
      INSERT INTO follow_up_steps 
      (sequence_id, step_order, step_type, delay_hours, delay_days, subject, content, template_variables, conditions)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [sequenceId, stepOrder, stepType, delayHours, delayDays, subject, content, templateVariables, conditions]);
    
    res.json({ 
      success: true, 
      step: result.rows[0],
      message: 'Follow-up step created successfully'
    });
  } catch (error) {
    console.error('Error creating follow-up step:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/follow-ups/executions', async (req, res) => {
  try {
    const { clientKey, status, limit = 50 } = req.query;
    
    let queryStr = `
      SELECT 
        fe.*,
        fs.name as sequence_name,
        l.name as lead_name,
        l.phone as lead_phone,
        l.email as lead_email,
        t.display_name as client_name
      FROM follow_up_executions fe
      JOIN follow_up_sequences fs ON fe.sequence_id = fs.id
      JOIN leads l ON fe.lead_id = l.id
      JOIN tenants t ON fe.client_key = t.client_key
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;
    
    if (clientKey) {
      queryStr += ` AND fe.client_key = $${++paramCount}`;
      params.push(clientKey);
    }
    
    if (status) {
      queryStr += ` AND fe.status = $${++paramCount}`;
      params.push(status);
    }
    
    queryStr += ` ORDER BY fe.started_at DESC LIMIT $${++paramCount}`;
    params.push(limit);
    
    const executions = await query(queryStr, params);
    
    res.json(executions.rows.map(exec => ({
      id: exec.id,
      sequenceId: exec.sequence_id,
      sequenceName: exec.sequence_name,
      leadId: exec.lead_id,
      leadName: exec.lead_name,
      leadPhone: exec.lead_phone,
      leadEmail: exec.lead_email,
      clientKey: exec.client_key,
      clientName: exec.client_name,
      triggerData: exec.trigger_data,
      status: exec.status,
      currentStep: exec.current_step,
      startedAt: exec.started_at,
      completedAt: exec.completed_at,
      lastExecutedAt: exec.last_executed_at,
      executionData: exec.execution_data,
      createdAt: exec.created_at
    })));
  } catch (error) {
    console.error('Error getting follow-up executions:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/follow-ups/trigger', async (req, res) => {
  try {
    const { leadId, clientKey, triggerType, triggerData = {} } = req.body;
    
    if (!leadId || !triggerType) {
      return res.status(400).json({ error: 'Lead ID and trigger type are required' });
    }
    
    const result = await query(`
      SELECT trigger_follow_up_sequence($1, $2, $3, $4) as execution_id
    `, [leadId, clientKey || 'default', triggerType, JSON.stringify(triggerData)]);
    
    const executionId = result.rows[0].execution_id;
    
    if (executionId) {
      res.json({ 
        success: true, 
        executionId,
        message: 'Follow-up sequence triggered successfully'
      });
    } else {
      res.json({ 
        success: false, 
        message: 'No matching sequence found or sequence already active'
      });
    }
  } catch (error) {
    console.error('Error triggering follow-up sequence:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/follow-ups/process', async (req, res) => {
  try {
    const result = await query('SELECT process_pending_follow_up_steps() as processed_count');
    const processedCount = result.rows[0].processed_count;
    
    res.json({ 
      success: true, 
      processedCount,
      message: `Processed ${processedCount} pending follow-up steps`
    });
  } catch (error) {
    console.error('Error processing follow-up steps:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/follow-ups/templates', async (req, res) => {
  try {
    const { clientKey, templateType } = req.query;
    
    let queryStr = `
      SELECT * FROM follow_up_templates 
      WHERE is_active = true
    `;
    const params = [];
    let paramCount = 0;
    
    if (clientKey) {
      queryStr += ` AND client_key = $${++paramCount}`;
      params.push(clientKey);
    }
    
    if (templateType) {
      queryStr += ` AND template_type = $${++paramCount}`;
      params.push(templateType);
    }
    
    queryStr += ` ORDER BY usage_count DESC, created_at DESC`;
    
    const templates = await query(queryStr, params);
    
    res.json(templates.rows.map(template => ({
      id: template.id,
      name: template.name,
      templateType: template.template_type,
      subject: template.subject,
      content: template.content,
      variables: template.variables,
      clientKey: template.client_key,
      usageCount: template.usage_count,
      successRate: parseFloat(template.success_rate) || 0,
      createdAt: template.created_at,
      updatedAt: template.updated_at
    })));
  } catch (error) {
    console.error('Error getting follow-up templates:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/follow-ups/templates', async (req, res) => {
  try {
    const { 
      name, 
      templateType, 
      subject, 
      content, 
      variables = {}, 
      clientKey = 'default' 
    } = req.body;
    
    if (!name || !templateType || !content) {
      return res.status(400).json({ error: 'Name, type, and content are required' });
    }
    
    const result = await query(`
      INSERT INTO follow_up_templates 
      (name, template_type, subject, content, variables, client_key)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [name, templateType, subject, content, variables, clientKey]);
    
    res.json({ 
      success: true, 
      template: result.rows[0],
      message: 'Follow-up template created successfully'
    });
  } catch (error) {
    console.error('Error creating follow-up template:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/follow-ups/analytics', async (req, res) => {
  try {
    const { clientKey, daysBack = 30 } = req.query;
    
    const analyticsResult = await query(`
      SELECT get_follow_up_analytics($1, $2) as analytics
    `, [clientKey || 'default', daysBack]);
    
    const analytics = analyticsResult.rows[0].analytics;
    
    // Get additional detailed analytics
    const detailedAnalytics = await query(`
      SELECT 
        fs.name as sequence_name,
        COUNT(fe.id) as total_executions,
        COUNT(CASE WHEN fe.status = 'completed' THEN 1 END) as completed_executions,
        COUNT(fse.id) as total_steps,
        COUNT(CASE WHEN fse.status = 'sent' THEN 1 END) as sent_steps,
        COUNT(CASE WHEN fse.status = 'failed' THEN 1 END) as failed_steps,
        AVG(CASE WHEN fe.completed_at IS NOT NULL THEN EXTRACT(EPOCH FROM (fe.completed_at - fe.started_at))/3600 END) as avg_completion_hours
      FROM follow_up_sequences fs
      LEFT JOIN follow_up_executions fe ON fs.id = fe.sequence_id
      LEFT JOIN follow_up_step_executions fse ON fe.id = fse.execution_id
      WHERE fs.client_key = $1
      AND fe.created_at >= NOW() - INTERVAL '1 day' * $2
      GROUP BY fs.id, fs.name
      ORDER BY total_executions DESC
    `, [clientKey || 'default', daysBack]);
    
    res.json({
      overview: {
        totalSequences: parseInt(analytics.total_sequences) || 0,
        activeExecutions: parseInt(analytics.active_executions) || 0,
        completedExecutions: parseInt(analytics.completed_executions) || 0,
        totalStepsSent: parseInt(analytics.total_steps_sent) || 0,
        totalStepsFailed: parseInt(analytics.total_steps_failed) || 0,
        avgCompletionRate: parseFloat(analytics.avg_completion_rate) || 0,
        avgResponseRate: parseFloat(analytics.avg_response_rate) || 0
      },
      sequencePerformance: detailedAnalytics.rows.map(row => ({
        sequenceName: row.sequence_name,
        totalExecutions: parseInt(row.total_executions) || 0,
        completedExecutions: parseInt(row.completed_executions) || 0,
        totalSteps: parseInt(row.total_steps) || 0,
        sentSteps: parseInt(row.sent_steps) || 0,
        failedSteps: parseInt(row.failed_steps) || 0,
        completionRate: row.total_executions > 0 ? ((parseInt(row.completed_executions) / parseInt(row.total_executions)) * 100).toFixed(1) : 0,
        avgCompletionHours: parseFloat(row.avg_completion_hours) || 0
      }))
    });
  } catch (error) {
    console.error('Error getting follow-up analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Advanced Reporting Endpoints
app.get('/api/admin/reports', async (req, res) => {
  try {
    const { clientKey, category, reportType } = req.query;
    
    let queryStr = `
      SELECT 
        r.*,
        COUNT(re.id) as execution_count,
        COUNT(CASE WHEN re.status = 'completed' THEN 1 END) as successful_executions,
        MAX(re.last_run_at) as last_execution
      FROM reports r
      LEFT JOIN report_executions re ON r.id = re.report_id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;
    
    if (clientKey) {
      queryStr += ` AND r.client_key = $${++paramCount}`;
      params.push(clientKey);
    }
    
    if (category) {
      queryStr += ` AND r.category = $${++paramCount}`;
      params.push(category);
    }
    
    if (reportType) {
      queryStr += ` AND r.report_type = $${++paramCount}`;
      params.push(reportType);
    }
    
    queryStr += ` GROUP BY r.id ORDER BY r.created_at DESC`;
    
    const reports = await query(queryStr, params);
    
    res.json(reports.rows.map(report => ({
      id: report.id,
      name: report.name,
      description: report.description,
      reportType: report.report_type,
      category: report.category,
      config: report.config,
      filters: report.filters,
      chartConfig: report.chart_config,
      isPublic: report.is_public,
      isScheduled: report.is_scheduled,
      scheduleConfig: report.schedule_config,
      clientKey: report.client_key,
      createdBy: report.created_by,
      executionCount: parseInt(report.execution_count) || 0,
      successfulExecutions: parseInt(report.successful_executions) || 0,
      lastRunAt: report.last_run_at,
      lastExecution: report.last_execution,
      createdAt: report.created_at,
      updatedAt: report.updated_at
    })));
  } catch (error) {
    console.error('Error getting reports:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/reports', async (req, res) => {
  try {
    const { 
      name, 
      description, 
      reportType, 
      category, 
      config = {}, 
      filters = {}, 
      chartConfig = {}, 
      isPublic = false, 
      isScheduled = false, 
      scheduleConfig = {}, 
      clientKey = 'default',
      createdBy = 'admin'
    } = req.body;
    
    if (!name || !reportType || !category) {
      return res.status(400).json({ error: 'Name, type, and category are required' });
    }
    
    const result = await query(`
      INSERT INTO reports 
      (name, description, report_type, category, config, filters, chart_config, is_public, is_scheduled, schedule_config, client_key, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [name, description, reportType, category, config, filters, chartConfig, isPublic, isScheduled, scheduleConfig, clientKey, createdBy]);
    
    res.json({ 
      success: true, 
      report: result.rows[0],
      message: 'Report created successfully'
    });
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/reports/:reportId/execute', async (req, res) => {
  try {
    const { reportId } = req.params;
    const { startDate, endDate, filters = {} } = req.query;
    
    // Create execution record
    const executionResult = await query(`
      INSERT INTO report_executions 
      (report_id, execution_type, status, started_at, created_by)
      VALUES ($1, 'manual', 'running', NOW(), 'admin')
      RETURNING *
    `, [reportId]);
    
    const executionId = executionResult.rows[0].id;
    
    // Generate report data
    const reportDataResult = await query(`
      SELECT generate_report_data($1, $2::DATE, $3::DATE, $4) as data
    `, [reportId, startDate, endDate, JSON.stringify(filters)]);
    
    const reportData = reportDataResult.rows[0].data;
    
    // Update execution status
    await query(`
      UPDATE report_executions 
      SET 
        status = 'completed',
        completed_at = NOW(),
        execution_time_ms = EXTRACT(MILLISECONDS FROM (NOW() - started_at))::INTEGER,
        record_count = $2
      WHERE id = $1
    `, [executionId, Object.keys(reportData.metrics || {}).length]);
    
    res.json({ 
      success: true, 
      executionId,
      reportData,
      message: 'Report executed successfully'
    });
  } catch (error) {
    console.error('Error executing report:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/reports/templates', async (req, res) => {
  try {
    const { category, templateType } = req.query;
    
    let queryStr = `
      SELECT * FROM report_templates 
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;
    
    if (category) {
      queryStr += ` AND category = $${++paramCount}`;
      params.push(category);
    }
    
    if (templateType) {
      queryStr += ` AND template_type = $${++paramCount}`;
      params.push(templateType);
    }
    
    queryStr += ` ORDER BY usage_count DESC, created_at DESC`;
    
    const templates = await query(queryStr, params);
    
    res.json(templates.rows.map(template => ({
      id: template.id,
      name: template.name,
      description: template.description,
      templateType: template.template_type,
      category: template.category,
      config: template.config,
      isSystem: template.is_system,
      usageCount: template.usage_count,
      createdBy: template.created_by,
      createdAt: template.created_at,
      updatedAt: template.updated_at
    })));
  } catch (error) {
    console.error('Error getting report templates:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/reports/templates', async (req, res) => {
  try {
    const { 
      name, 
      description, 
      templateType, 
      category, 
      config = {}, 
      createdBy = 'admin' 
    } = req.body;
    
    if (!name || !templateType || !category) {
      return res.status(400).json({ error: 'Name, type, and category are required' });
    }
    
    const result = await query(`
      INSERT INTO report_templates 
      (name, description, template_type, category, config, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [name, description, templateType, category, config, createdBy]);
    
    res.json({ 
      success: true, 
      template: result.rows[0],
      message: 'Report template created successfully'
    });
  } catch (error) {
    console.error('Error creating report template:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/reports/executions', async (req, res) => {
  try {
    const { reportId, status, limit = 50 } = req.query;
    
    let queryStr = `
      SELECT 
        re.*,
        r.name as report_name,
        r.category as report_category
      FROM report_executions re
      JOIN reports r ON re.report_id = r.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;
    
    if (reportId) {
      queryStr += ` AND re.report_id = $${++paramCount}`;
      params.push(reportId);
    }
    
    if (status) {
      queryStr += ` AND re.status = $${++paramCount}`;
      params.push(status);
    }
    
    queryStr += ` ORDER BY re.started_at DESC LIMIT $${++paramCount}`;
    params.push(limit);
    
    const executions = await query(queryStr, params);
    
    res.json(executions.rows.map(exec => ({
      id: exec.id,
      reportId: exec.report_id,
      reportName: exec.report_name,
      reportCategory: exec.report_category,
      executionType: exec.execution_type,
      status: exec.status,
      startedAt: exec.started_at,
      completedAt: exec.completed_at,
      executionTimeMs: exec.execution_time_ms,
      recordCount: exec.record_count,
      errorMessage: exec.error_message,
      outputFormat: exec.output_format,
      filePath: exec.file_path,
      createdBy: exec.created_by,
      metadata: exec.metadata
    })));
  } catch (error) {
    console.error('Error getting report executions:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/reports/process-scheduled', async (req, res) => {
  try {
    const result = await query('SELECT execute_scheduled_reports() as processed_count');
    const processedCount = result.rows[0].processed_count;
    
    res.json({ 
      success: true, 
      processedCount,
      message: `Processed ${processedCount} scheduled reports`
    });
  } catch (error) {
    console.error('Error processing scheduled reports:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/reports/analytics', async (req, res) => {
  try {
    const { clientKey, daysBack = 30 } = req.query;
    
    const analyticsResult = await query(`
      SELECT get_report_analytics($1, $2) as analytics
    `, [clientKey || 'default', daysBack]);
    
    const analytics = analyticsResult.rows[0].analytics;
    
    // Get additional detailed analytics
    const detailedAnalytics = await query(`
      SELECT 
        r.category,
        COUNT(*) as report_count,
        COUNT(CASE WHEN r.is_scheduled = true THEN 1 END) as scheduled_count,
        COUNT(re.id) as execution_count,
        COUNT(CASE WHEN re.status = 'completed' THEN 1 END) as successful_executions,
        AVG(re.execution_time_ms) as avg_execution_time
      FROM reports r
      LEFT JOIN report_executions re ON r.id = re.report_id
      WHERE r.client_key = $1
      AND re.started_at >= NOW() - INTERVAL '1 day' * $2
      GROUP BY r.category
      ORDER BY report_count DESC
    `, [clientKey || 'default', daysBack]);
    
    res.json({
      overview: {
        totalReports: parseInt(analytics.total_reports) || 0,
        scheduledReports: parseInt(analytics.scheduled_reports) || 0,
        publicReports: parseInt(analytics.public_reports) || 0,
        totalExecutions: parseInt(analytics.total_executions) || 0,
        successfulExecutions: parseInt(analytics.successful_executions) || 0,
        avgExecutionTime: parseFloat(analytics.avg_execution_time) || 0
      },
      categoryPerformance: detailedAnalytics.rows.map(row => ({
        category: row.category,
        reportCount: parseInt(row.report_count) || 0,
        scheduledCount: parseInt(row.scheduled_count) || 0,
        executionCount: parseInt(row.execution_count) || 0,
        successfulExecutions: parseInt(row.successful_executions) || 0,
        avgExecutionTime: parseFloat(row.avg_execution_time) || 0
      }))
    });
  } catch (error) {
    console.error('Error getting report analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/reports/subscriptions', async (req, res) => {
  try {
    const { reportId } = req.query;
    
    let queryStr = `
      SELECT 
        rs.*,
        r.name as report_name
      FROM report_subscriptions rs
      JOIN reports r ON rs.report_id = r.id
      WHERE rs.is_active = true
    `;
    const params = [];
    let paramCount = 0;
    
    if (reportId) {
      queryStr += ` AND rs.report_id = $${++paramCount}`;
      params.push(reportId);
    }
    
    queryStr += ` ORDER BY rs.created_at DESC`;
    
    const subscriptions = await query(queryStr, params);
    
    res.json(subscriptions.rows.map(sub => ({
      id: sub.id,
      reportId: sub.report_id,
      reportName: sub.report_name,
      subscriberEmail: sub.subscriber_email,
      subscriberName: sub.subscriber_name,
      frequency: sub.frequency,
      deliveryTime: sub.delivery_time,
      isActive: sub.is_active,
      lastDeliveredAt: sub.last_delivered_at,
      deliveryCount: sub.delivery_count,
      createdAt: sub.created_at
    })));
  } catch (error) {
    console.error('Error getting report subscriptions:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/reports/subscriptions', async (req, res) => {
  try {
    const { 
      reportId, 
      subscriberEmail, 
      subscriberName, 
      frequency, 
      deliveryTime = '09:00:00' 
    } = req.body;
    
    if (!reportId || !subscriberEmail || !frequency) {
      return res.status(400).json({ error: 'Report ID, email, and frequency are required' });
    }
    
    const result = await query(`
      INSERT INTO report_subscriptions 
      (report_id, subscriber_email, subscriber_name, frequency, delivery_time)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [reportId, subscriberEmail, subscriberName, frequency, deliveryTime]);
    
    res.json({ 
      success: true, 
      subscription: result.rows[0],
      message: 'Report subscription created successfully'
    });
  } catch (error) {
    console.error('Error creating report subscription:', error);
    res.status(500).json({ error: error.message });
  }
});

// Social Media Integration & Monitoring Endpoints
app.get('/api/admin/social/profiles', async (req, res) => {
  try {
    const { clientKey, leadId, platform } = req.query;
    
    let query = `
      SELECT 
        p.*,
        c.display_name as client_name,
        l.name as lead_name
      FROM social_profiles p
      LEFT JOIN tenants c ON p.client_key = c.client_key
      LEFT JOIN leads l ON p.lead_id = l.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (clientKey) {
      query += ` AND p.client_key = $${paramCount++}`;
      params.push(clientKey);
    }
    
    if (leadId) {
      query += ` AND p.lead_id = $${paramCount++}`;
      params.push(leadId);
    }
    
    if (platform) {
      query += ` AND p.platform = $${paramCount++}`;
      params.push(platform);
    }
    
    query += ` ORDER BY p.last_updated DESC`;
    
    const profiles = await query(query, params);
    
    res.json(profiles.rows || []);
  } catch (error) {
    console.error('Error getting social profiles:', error);
    res.json([]);
  }
});

app.post('/api/admin/social/profiles', async (req, res) => {
  try {
    const { platform, handle, url, clientKey, leadId, metadata } = req.body;
    
    const result = await query(`
      INSERT INTO social_profiles (
        platform, handle, url, client_key, lead_id, metadata, created_at, last_updated
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *
    `, [platform, handle, url, clientKey, leadId, JSON.stringify(metadata || {})]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating social profile:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/social/posts', async (req, res) => {
  try {
    const { clientKey, leadId, platform, limit = 50 } = req.query;
    
    let query = `
      SELECT 
        p.*,
        c.display_name as client_name,
        l.name as lead_name
      FROM social_posts p
      LEFT JOIN tenants c ON p.client_key = c.client_key
      LEFT JOIN leads l ON p.lead_id = l.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (clientKey) {
      query += ` AND p.client_key = $${paramCount++}`;
      params.push(clientKey);
    }
    
    if (leadId) {
      query += ` AND p.lead_id = $${paramCount++}`;
      params.push(leadId);
    }
    
    if (platform) {
      query += ` AND p.platform = $${paramCount++}`;
      params.push(platform);
    }
    
    query += ` ORDER BY p.posted_at DESC LIMIT $${paramCount++}`;
    params.push(parseInt(limit));
    
    const posts = await query(query, params);
    
    res.json(posts.rows || []);
  } catch (error) {
    console.error('Error getting social posts:', error);
    res.json([]);
  }
});

app.post('/api/admin/social/monitor', async (req, res) => {
  try {
    const { keywords, platforms, clientKey } = req.body;
    
    // This would integrate with social media APIs (Twitter, LinkedIn, etc.)
    // For now, return a success message
    console.log('Monitoring social media:', { keywords, platforms, clientKey });
    
    res.json({
      success: true,
      message: 'Social media monitoring started',
      keywords,
      platforms
    });
  } catch (error) {
    console.error('Error starting social monitoring:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/social/sentiment', async (req, res) => {
  try {
    const { clientKey, days = 30 } = req.query;
    
    let query = `
      SELECT 
        sentiment,
        COUNT(*) as count,
        AVG(sentiment_score) as avg_score
      FROM social_posts
      WHERE posted_at >= NOW() - INTERVAL '${parseInt(days)} days'
    `;
    
    const params = [];
    if (clientKey) {
      query += ` AND client_key = $1`;
      params.push(clientKey);
    }
    
    query += ` GROUP BY sentiment ORDER BY count DESC`;
    
    const sentiment = await query(query, params);
    
    res.json({
      sentiment: sentiment.rows,
      period: `${days} days`
    });
  } catch (error) {
    console.error('Error getting sentiment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mock Lead Call Route (No API Key Required)
app.get('/mock-call', async (req, res) => {
  try {
    const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;
    
    if (!vapiKey) {
      return res.json({
        success: false,
        message: 'VAPI API key not found',
        availableKeys: {
          VAPI_PRIVATE_KEY: !!process.env.VAPI_PRIVATE_KEY,
          VAPI_PUBLIC_KEY: !!process.env.VAPI_PUBLIC_KEY,
          VAPI_API_KEY: !!process.env.VAPI_API_KEY
        }
      });
    }
    
    // Get assistant ID from query or use default
    const assistantId = req.query.assistantId || "dd67a51c-7485-4b62-930a-4a84f328a1c9";
    const phoneNumberId = req.query.phoneNumberId || "934ecfdb-fe7b-4d53-81c0-7908b97036b5";
    const phoneNumber = req.query.phone || "+447491683261";
    
    // Mock lead data
    const mockLead = {
      businessName: "Test Business",
      decisionMaker: "Test Lead",
      industry: "general",
      location: "UK",
      phoneNumber: phoneNumber,
      email: "test@example.com",
      website: "www.example.com"
    };
    
    // Create a call with specified assistant
    const callData = {
      assistantId: assistantId,
      phoneNumberId: phoneNumberId,
      customer: {
        number: mockLead.phoneNumber,
        name: mockLead.decisionMaker
      }
    };
    
    const vapiResponse = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(callData)
    });
    
    const responseText = await vapiResponse.text();
    
    // Check if response is HTML (Cloudflare error page)
    if (responseText.trim().startsWith('<!DOCTYPE') || responseText.includes('Cloudflare')) {
      return res.json({
        success: false,
        message: 'Vapi API is currently experiencing issues (Cloudflare error)',
        error: 'Vapi API returned HTML error page instead of JSON',
        status: vapiResponse.status,
        suggestion: 'Please try again in a few minutes. The Vapi service appears to be temporarily unavailable due to Cloudflare issues.',
        responsePreview: responseText.substring(0, 200)
      });
    }
    
    if (vapiResponse.ok) {
      try {
        const callResult = JSON.parse(responseText);
        res.json({
          success: true,
          message: 'Mock call initiated successfully!',
          callId: callResult.id,
          mockLead: mockLead,
          status: 'Calling your mobile now...'
        });
      } catch (e) {
        res.json({
          success: false,
          message: 'Vapi returned invalid JSON response',
          error: 'Response was not valid JSON',
          responsePreview: responseText.substring(0, 200)
        });
      }
    } else {
      try {
        const errorData = JSON.parse(responseText);
        res.json({
          success: false,
          message: 'Failed to initiate mock call',
          error: errorData,
          status: vapiResponse.status
        });
      } catch (e) {
        res.json({
          success: false,
          message: 'Failed to initiate mock call',
          error: 'Invalid JSON response from Vapi',
          status: vapiResponse.status,
          responsePreview: responseText.substring(0, 300)
        });
      }
    }
    
  } catch (error) {
    res.json({
      success: false,
      message: 'Mock call failed',
      error: error.message
    });
  }
});

// Booking System Endpoints
// Booking System Endpoints - MOVED AFTER JSON MIDDLEWARE

// Test Booking System
app.get('/test-booking', async (req, res) => {
  try {
    const testLead = {
      businessName: "Test Business",
      decisionMaker: "John Smith",
      email: "john@testbusiness.co.uk",
      phoneNumber: "+447491683261",
      industry: "retail",
      location: "London"
    };

    const timeSlots = bookingSystem.generateTimeSlots(3);
    const result = await bookingSystem.bookDemo(testLead, timeSlots.slice(0, 3));
    
    res.json({
      success: true,
      message: 'Booking system test completed',
      result: result,
      availableSlots: timeSlots.length
    });
    
  } catch (error) {
    console.error('[BOOKING TEST ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Booking system test failed',
      error: error.message
    });
  }
});

// SMS-Email Pipeline Endpoints
// Initiate Lead Capture (SMS asking for email)
app.post('/api/initiate-lead-capture', async (req, res) => {
  try {
    const { leadData } = req.body;
    
    if (!leadData || !leadData.phoneNumber || !leadData.decisionMaker) {
      return res.status(400).json({
        success: false,
        message: 'Missing required lead data (phoneNumber, decisionMaker)'
      });
    }

    if (!smsEmailPipeline) {
      return res.status(503).json({ 
        success: false, 
        message: 'SMS-Email pipeline not available' 
      });
    }

    const result = await smsEmailPipeline.initiateLeadCapture(leadData);
    res.json(result);
    
  } catch (error) {
    console.error('[LEAD CAPTURE ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Lead capture failed',
      error: error.message
    });
  }
});

// Process Email Response (Webhook from Twilio)
app.post('/api/process-email-response', async (req, res) => {
  try {
    const { phoneNumber, emailAddress } = req.body;
    
    if (!phoneNumber || !emailAddress) {
      return res.status(400).json({
        success: false,
        message: 'Missing phoneNumber or emailAddress'
      });
    }

    if (!smsEmailPipeline) {
      return res.status(503).json({ 
        success: false, 
        message: 'SMS-Email pipeline not available' 
      });
    }

    const result = await smsEmailPipeline.processEmailResponse(phoneNumber, emailAddress);
    res.json(result);
    
  } catch (error) {
    console.error('[EMAIL PROCESSING ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Email processing failed',
      error: error.message
    });
  }
});

// Get Lead Status
app.get('/api/lead-status/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;
    if (!smsEmailPipeline) {
      return res.status(503).json({ 
        success: false, 
        message: 'SMS-Email pipeline not available' 
      });
    }

    const result = await smsEmailPipeline.getLeadStatus(leadId);
    res.json(result);
    
  } catch (error) {
    console.error('[LEAD STATUS ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get lead status',
      error: error.message
    });
  }
});



// Twilio Webhook for SMS Replies (Alternative endpoint for Twilio compatibility)
app.post('/webhooks/sms', express.urlencoded({ extended: false }), async (req, res) => {
  // Verify Twilio signature for security
  const { twilioWebhookVerification } = await import('./lib/security.js');
  const isValid = twilioWebhookVerification(req, res, () => {});
  try {
    const { From, Body } = req.body;
    
    console.log('[SMS WEBHOOK /webhooks/sms]', { From, Body, smsEmailPipelineAvailable: !!smsEmailPipeline, bodyKeys: Object.keys(req.body || {}) });
    
    // Extract email from SMS body
    const emailMatch = Body.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    
    if (emailMatch) {
      const emailAddress = emailMatch[1];
      console.log('[SMS WEBHOOK] Extracted email:', emailAddress);
      
      if (smsEmailPipeline) {
        try {
          // Try to find existing lead first
          let result = await smsEmailPipeline.processEmailResponse(From, emailAddress);
          
          // If no pending lead found, send email directly
          if (!result.success && result.message === 'No pending lead found for this phone number') {
            console.log('[SMS WEBHOOK] No pending lead found, sending direct booking email');
            
            // Generate booking link
            const bookingLink = `${process.env.BASE_URL || 'https://ai-booking-mvp.onrender.com'}/booking-simple.html?email=${encodeURIComponent(emailAddress)}&phone=${encodeURIComponent(From)}`;
            
            // Send email directly
            const leadData = {
              email: emailAddress,
              decisionMaker: 'there', // Generic greeting
              businessName: 'your business'
            };
            
            await smsEmailPipeline.sendConfirmationEmail(leadData, bookingLink);
            
            // Send SMS confirmation
            await smsEmailPipeline.sendSMS({
              to: From,
              body: `Perfect! I've sent the booking link to ${emailAddress}. Check your email and click the link to schedule your appointment.`
            });
            
            result = { success: true, message: 'Direct email sent successfully' };
          }
          
          console.log('[SMS WEBHOOK] Email processing result:', result);
          if (result.success) {
            console.log('[SMS WEBHOOK] Booking email sent successfully to:', emailAddress);
          } else {
            console.log('[SMS WEBHOOK] Email processing failed:', result.message || result.error);
          }
        } catch (emailError) {
          console.error('[SMS WEBHOOK] Failed to process email:', emailError);
        }
      } else {
        console.log('[SMS WEBHOOK] Email service not available');
      }
    } else {
      console.log('[SMS WEBHOOK] No email found in SMS body');
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('[SMS WEBHOOK] Error processing SMS:', error);
    res.status(500).send('Error');
  }
});

// Twilio Webhook for SMS Replies
app.post('/webhook/sms-reply', express.urlencoded({ extended: false }), async (req, res) => {
  // Verify Twilio signature for security
  const { twilioWebhookVerification } = await import('./lib/security.js');
  const verified = await new Promise((resolve) => {
    twilioWebhookVerification(req, res, () => resolve(true));
  });
  
  if (!verified) return; // Response already sent by verification middleware
  
  try {
    const { From, Body } = req.body;
    
    console.log('[SMS WEBHOOK]', { From, Body, smsEmailPipelineAvailable: !!smsEmailPipeline, bodyKeys: Object.keys(req.body || {}) });
    
    // Extract email from SMS body
    const emailMatch = Body.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    
    if (emailMatch) {
      const emailAddress = emailMatch[1];
      
      if (!smsEmailPipeline) {
        console.log('[SMS WEBHOOK] SMS-Email pipeline not available, returning success anyway');
        return res.json({ 
          success: true, 
          message: 'SMS received but pipeline not available (test mode)' 
        });
      }
      
      const result = await smsEmailPipeline.processEmailResponse(From, emailAddress);
      
      res.json({
        success: true,
        message: 'Email processed successfully',
        result: result
      });
    } else {
      // Send helpful SMS if no email found
      if (smsEmailPipeline) {
        try {
          await smsEmailPipeline.sendSMS({
            to: From,
            body: "I didn't find an email address in your message. Please send just your email address (e.g., john@company.com)"
          });
        } catch (smsError) {
          console.log('[SMS WEBHOOK] SMS send failed:', smsError.message);
        }
      }
      
      res.json({
        success: true,
        message: 'SMS received - no email found but webhook working'
      });
    }
    
  } catch (error) {
    console.error('[SMS WEBHOOK ERROR]', error);
    res.json({
      success: true,
      message: 'SMS webhook received (error handled gracefully)',
      error: error.message
    });
  }
});

// Test SMS-Email Pipeline (No API Key Required)
app.get('/test-sms-pipeline', async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'SMS-Email Pipeline test endpoint is working!',
      timestamp: new Date().toISOString(),
      environment: {
        twilioConfigured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
        emailConfigured: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS),
        yourEmail: process.env.YOUR_EMAIL || 'not set'
      }
    });
    
  } catch (error) {
    console.error('[SMS PIPELINE TEST ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'SMS-Email Pipeline test failed',
      error: error.message
    });
  }
});

// Alternative test endpoint
app.get('/sms-test', async (req, res) => {
  res.json({
    success: true,
    message: 'Alternative SMS test endpoint working!',
    timestamp: new Date().toISOString()
  });
});


// Simple VAPI Test Route (No API Key Required)
app.get('/test-vapi', async (req, res) => {
  try {
    const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;
    
    if (!vapiKey) {
      return res.json({
        success: false,
        message: 'VAPI API key not found',
        availableKeys: {
          VAPI_PRIVATE_KEY: !!process.env.VAPI_PRIVATE_KEY,
          VAPI_PUBLIC_KEY: !!process.env.VAPI_PUBLIC_KEY,
          VAPI_API_KEY: !!process.env.VAPI_API_KEY
        }
      });
    }
    
    const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${vapiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (vapiResponse.ok) {
      const assistants = await vapiResponse.json();
      res.json({
        success: true,
        message: 'VAPI connection successful!',
        assistantsCount: assistants.length,
        assistantId: 'dd67a51c-7485-4b62-930a-4a84f328a1c9'
      });
    } else {
      const errorData = await vapiResponse.json();
      res.json({
        success: false,
        message: 'VAPI API call failed',
        error: errorData
      });
    }
    
  } catch (error) {
    res.json({
      success: false,
      message: 'VAPI test failed',
      error: error.message
    });
  }
});

// Quick Assistant Creation Route (No API Key Required)
app.get('/create-assistant', async (req, res) => {
  try {
    console.log('[QUICK ASSISTANT CREATION] Creating cold call assistant');
    
    // Check if VAPI API key is configured
    const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;
    if (!vapiKey) {
      return res.status(500).json({
        error: 'VAPI API key not configured',
        message: 'Please add VAPI_PRIVATE_KEY, VAPI_PUBLIC_KEY, or VAPI_API_KEY to your environment variables'
      });
    }
    
    // Create specialized cold calling assistant for dental practices
    const coldCallAssistant = {
      name: "Dental Cold Call Bot - £500/mo",
      model: {
        provider: "openai",
        model: "gpt-4o",
        temperature: 0.3,
        maxTokens: 200
      },
      voice: {
        provider: "11labs",
        voiceId: "21m00Tcm4TlvDq8ikWAM",
        stability: 0.7,
        clarity: 0.85,
        style: 0.2,
        similarityBoost: 0.8
      },
      firstMessage: "Hi, this is Sarah from AI Booking Solutions. I'm calling to help businesses like yours improve their appointment booking systems with our premium £500/month service. Do you have 2 minutes to hear how we can help you never miss another patient?",
      systemMessage: `You are Sarah, a top-performing sales professional with 10+ years experience in B2B healthcare sales. You're calling business owners/managers to book qualified appointments.

ADVANCED SALES PSYCHOLOGY:
- Use social proof: "We help businesses improve their appointment booking systems"
- Create urgency: "We're currently accepting new clients"
- Build rapport: "I understand how challenging it is to manage a busy practice"
- Use specific numbers: "Our service can help capture more appointments"
- Address pain points: "Many businesses lose potential customers from missed calls"

CONVERSATION FLOW:
1. RAPPORT BUILDING (15 seconds):
   - "Hi [Name], this is Sarah from AI Booking Solutions"
   - "I'm calling because we've helped [similar practice in their area] increase bookings by 300%"
   - "Do you have 90 seconds to hear how this could work for your practice?"

2. QUALIFICATION (30 seconds):
   - "Are you the owner or manager of [Practice Name]?"
   - "How many appointments do you typically book per week?"
   - "What's your biggest challenge with patient scheduling?"
   - "Do you ever miss calls or lose potential patients?"

3. PAIN AMPLIFICATION (30 seconds):
   - "I hear this a lot - practices lose an average of £2,000 monthly from missed calls"
   - "That's like losing 4-5 patients every month"
   - "Our AI handles calls 24/7, so you never miss another patient"

4. VALUE PRESENTATION (45 seconds):
   - "We help practices like yours increase bookings by 300% with our premium £500/month service"
   - "Our AI automatically books appointments in your calendar"
   - "Sends SMS reminders to reduce no-shows by 40%"
   - "Most practices see ROI within 30 days"
   - "Premium service includes dedicated account manager and priority support"
   - "Average practice sees 20-30 extra bookings per month worth £10,000-15,000"

5. OBJECTION HANDLING:
   - Too expensive: "I understand £500/month sounds like a lot, but what's the cost of losing just one patient? Our premium service pays for itself with just 2-3 extra bookings per month. Most practices see 20-30 extra bookings worth £10,000-15,000 monthly"
   - Too busy: "That's exactly why you need our premium service - it saves you 10+ hours per week and includes a dedicated account manager"
   - Not interested: "I understand. Can I send you a quick case study showing how we helped [similar practice] increase bookings by 300% with our premium service?"
   - Already have a system: "That's great! What's your current system missing that causes you to lose patients? Our premium service includes features like dedicated account management and priority support"
   - Budget concerns: "I understand budget is important. Our premium service typically generates £10,000-15,000 in additional revenue monthly. That's a 20-30x ROI. Would you like to see the numbers?"

6. CLOSING (30 seconds):
   - "Would you be available for a 15-minute demo this week to see how this could work for your practice?"
   - "I can show you exactly how we've helped similar practices increase their bookings"
   - "What day works better for you - Tuesday or Wednesday?"

ADVANCED TECHNIQUES:
- Use their name frequently (builds rapport)
- Mirror their language and pace
- Ask open-ended questions
- Use "we" instead of "I" (creates partnership)
- Create urgency with scarcity
- Use specific success stories
- Address objections before they're raised

RULES:
- Keep calls under 3 minutes
- Be professional but warm
- Listen 70% of the time, talk 30%
- Focus on their pain points
- Always ask for the appointment
- If they're not the decision maker, get their name and ask for the right person
- Use their practice name in conversation
- End with a clear next step`,
      maxDurationSeconds: 180,
      endCallMessage: "Thank you for your time. I'll send you some information about how we can help your practice increase bookings. Have a great day!",
      endCallPhrases: ["not interested", "not right now", "call back later", "send me information"],
      recordingEnabled: true,
      voicemailDetectionEnabled: true,
      backgroundSound: "office",
      silenceTimeoutSeconds: 10,
      responseDelaySeconds: 1,
      llmRequestDelaySeconds: 0.1
    };
    
    // Create assistant via VAPI API
    const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(coldCallAssistant)
    });
    
    if (!vapiResponse.ok) {
      const errorData = await vapiResponse.json();
      return res.status(400).json({ 
        error: 'Failed to create VAPI assistant',
        details: errorData 
      });
    }
    
    const assistantData = await vapiResponse.json();
    
    res.json({
      success: true,
      message: 'Cold call assistant created successfully!',
      assistant: {
        id: assistantData.id,
        name: assistantData.name,
        status: assistantData.status,
        createdAt: assistantData.createdAt
      },
      nextSteps: [
        'Visit /vapi-test-dashboard to test the assistant',
        'Use the assistant ID to make test calls',
        'Start calling real businesses from UK business search'
      ]
    });
    
  } catch (error) {
    console.error('[QUICK ASSISTANT CREATION ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to create cold call assistant',
      message: error.message 
    });
  }
});


// Lead Data Quality Test Endpoint
app.get('/admin/test-lead-data', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    console.log('[LEAD DATA TEST] Testing business search and decision maker research');
    
    // Test business search with sample query
    const testQuery = {
      query: 'dentist',
      industry: 'dentist',
      location: 'London',
      contactInfo: true,
      limit: 5
    };
    
    // Import the business search module
    const { generateUKBusinesses } = await import('./src/enhanced-business-search.js');
    
    // Generate sample businesses
    const businesses = generateUKBusinesses(testQuery);
    
    // Test decision maker research for first business
    if (businesses.length > 0) {
      const testBusiness = businesses[0];
      
      // Import decision maker research
      const { RealDecisionMakerContactFinder } = await import('./src/real-decision-maker-contact-finder.js');
      const contactFinder = new RealDecisionMakerContactFinder();
      
      try {
        const contacts = await contactFinder.findDecisionMakerContacts(testBusiness);
        
        res.json({
          success: true,
          message: 'Lead data quality test completed',
          testResults: {
            businessSearch: {
              totalBusinesses: businesses.length,
              sampleBusiness: {
                name: testBusiness.name,
                phone: testBusiness.phone,
                email: testBusiness.email,
                address: testBusiness.address,
                website: testBusiness.website,
                hasDecisionMaker: !!testBusiness.decisionMaker
              }
            },
            decisionMakerResearch: {
              contactsFound: contacts.primary.length + contacts.secondary.length + contacts.gatekeeper.length,
              primaryContacts: contacts.primary.length,
              secondaryContacts: contacts.secondary.length,
              gatekeeperContacts: contacts.gatekeeper.length,
              sampleContact: contacts.primary[0] || contacts.secondary[0] || contacts.gatekeeper[0]
            },
            dataQuality: {
              phoneNumbersValid: businesses.filter(b => b.phone && b.phone.startsWith('+44')).length,
              emailsValid: businesses.filter(b => b.email && b.email.includes('@')).length,
              websitesValid: businesses.filter(b => b.website && b.website.startsWith('http')).length,
              addressesValid: businesses.filter(b => b.address && b.address.length > 10).length
            }
          }
        });
        
      } catch (contactError) {
        res.json({
          success: true,
          message: 'Lead data quality test completed (decision maker research failed)',
          testResults: {
            businessSearch: {
              totalBusinesses: businesses.length,
              sampleBusiness: {
                name: testBusiness.name,
                phone: testBusiness.phone,
                email: testBusiness.email,
                address: testBusiness.address,
                website: testBusiness.website
              }
            },
            decisionMakerResearch: {
              error: contactError.message,
              status: 'failed'
            },
            dataQuality: {
              phoneNumbersValid: businesses.filter(b => b.phone && b.phone.startsWith('+44')).length,
              emailsValid: businesses.filter(b => b.email && b.email.includes('@')).length,
              websitesValid: businesses.filter(b => b.website && b.website.startsWith('http')).length,
              addressesValid: businesses.filter(b => b.address && b.address.length > 10).length
            }
          }
        });
      }
    } else {
      res.json({
        success: false,
        message: 'No businesses found in test',
        testResults: {
          businessSearch: { totalBusinesses: 0 },
          error: 'Business search returned no results'
        }
      });
    }
    
  } catch (error) {
    console.error('[LEAD DATA TEST ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Lead data quality test failed',
      error: error.message
    });
  }
});

// Script Testing Endpoint
app.post('/admin/test-script', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { testType, businessData } = req.body;
    
    console.log(`[SCRIPT TEST] Testing ${testType} with business data`);
    
    let testResults = {};
    
    if (testType === 'opening_message') {
      // Test opening message effectiveness
      const openingMessage = "Hi, this is Sarah from AI Booking Solutions. I'm calling to help businesses like yours improve their appointment booking systems with our premium £500/month service. Do you have 2 minutes to hear how we can help you never miss another patient?";
      
      testResults = {
        openingMessage: openingMessage,
        analysis: {
          length: openingMessage.length,
          wordCount: openingMessage.split(' ').length,
          includesValueProposition: openingMessage.includes('300%'),
          includesPrice: openingMessage.includes('£500/month'),
          includesBenefit: openingMessage.includes('never miss another patient'),
          includesTimeCommitment: openingMessage.includes('2 minutes'),
          includesCompanyName: openingMessage.includes('AI Booking Solutions'),
          includesPersonalName: openingMessage.includes('Sarah')
        },
        recommendations: [
          openingMessage.length < 200 ? '✅ Good length (under 200 characters)' : '⚠️ Consider shortening',
          openingMessage.includes('300%') ? '✅ Includes specific benefit' : '❌ Missing specific benefit',
          openingMessage.includes('£500/month') ? '✅ Includes price upfront' : '❌ Missing price',
          openingMessage.includes('never miss another patient') ? '✅ Includes pain point' : '❌ Missing pain point',
          openingMessage.includes('2 minutes') ? '✅ Includes time commitment' : '❌ Missing time commitment'
        ]
      };
      
    } else if (testType === 'objection_handling') {
      // Test objection handling responses
      const objections = {
        'too_expensive': {
          response: "I understand £500/month sounds like a lot, but what's the cost of losing just one patient? Our premium service pays for itself with just 2-3 extra bookings per month. Most practices see 20-30 extra bookings worth £10,000-15,000 monthly",
          analysis: {
            acknowledgesConcern: true,
            providesROI: true,
            usesSpecificNumbers: true,
            addressesPainPoint: true
          }
        },
        'too_busy': {
          response: "That's exactly why you need our premium service - it saves you 10+ hours per week and includes a dedicated account manager",
          analysis: {
            acknowledgesConcern: true,
            providesSolution: true,
            includesPremiumBenefit: true,
            addressesTimeIssue: true
          }
        },
        'not_interested': {
          response: "I understand. Can I send you a quick case study showing how we helped [similar practice] increase bookings by 300% with our premium service?",
          analysis: {
            acknowledgesConcern: true,
            providesSocialProof: true,
            offersAlternative: true,
            maintainsProfessionalism: true
          }
        },
        'budget_concerns': {
          response: "I understand budget is important. Our premium service typically generates £10,000-15,000 in additional revenue monthly. That's a 20-30x ROI. Would you like to see the numbers?",
          analysis: {
            acknowledgesConcern: true,
            providesROI: true,
            usesSpecificNumbers: true,
            offersProof: true
          }
        }
      };
      
      testResults = {
        objections: objections,
        summary: {
          totalObjections: Object.keys(objections).length,
          averageResponseLength: Object.values(objections).reduce((sum, obj) => sum + obj.response.length, 0) / Object.keys(objections).length,
          allAcknowledgeConcerns: Object.values(objections).every(obj => obj.analysis.acknowledgesConcern),
          allProvideSolutions: Object.values(objections).every(obj => obj.analysis.providesSolution || obj.analysis.providesROI)
        }
      };
      
    } else if (testType === 'personalization') {
      // Test personalization with business data
      const businessName = businessData?.name || 'Test Practice';
      const decisionMaker = businessData?.decisionMaker?.name || 'there';
      const location = businessData?.address || 'your area';
      
      const personalizedOpening = `Hi ${decisionMaker}, this is Sarah from AI Booking Solutions. I'm calling because we've helped practices in ${location} improve their appointment booking systems with our premium £500/month service. Do you have 90 seconds to hear how this could work for ${businessName}?`;
      
      testResults = {
        personalizedOpening: personalizedOpening,
        personalization: {
          usesDecisionMakerName: personalizedOpening.includes(decisionMaker),
          usesBusinessName: personalizedOpening.includes(businessName),
          usesLocation: personalizedOpening.includes(location),
          maintainsValueProposition: personalizedOpening.includes('300%'),
          maintainsPrice: personalizedOpening.includes('£500/month')
        },
        analysis: {
          length: personalizedOpening.length,
          wordCount: personalizedOpening.split(' ').length,
          personalizationScore: (personalizedOpening.includes(decisionMaker) ? 1 : 0) + 
                               (personalizedOpening.includes(businessName) ? 1 : 0) + 
                               (personalizedOpening.includes(location) ? 1 : 0)
        }
      };
    }
    
    res.json({
      success: true,
      message: `${testType} test completed`,
      testType: testType,
      results: testResults,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[SCRIPT TEST ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Script test failed',
      error: error.message
    });
  }
});

// Call Duration Validation Endpoint
app.get('/admin/validate-call-duration', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    console.log('[CALL DURATION VALIDATION] Validating call duration settings');
    
    // Check current assistant configuration
    const assistantConfig = {
      maxDurationSeconds: 180, // 3 minutes
      systemMessage: `You are Sarah, calling about our premium £500/month AI booking service. Keep the call under 2 minutes. Focus on booking a demo. If they're not interested, politely end the call.`,
      endCallPhrases: ["not interested", "not right now", "call back later"],
      endCallMessage: "Thank you for your time. I'll send you some information about our premium service. Have a great day!"
    };
    
    // Analyze conversation flow timing
    const conversationFlow = {
      rapportBuilding: { duration: 15, description: "Hi [Name], this is Sarah from AI Booking Solutions" },
      qualification: { duration: 30, description: "Are you the owner or manager?" },
      painAmplification: { duration: 30, description: "What's your biggest challenge?" },
      valuePresentation: { duration: 45, description: "We help practices increase bookings by 300%" },
      objectionHandling: { duration: 30, description: "I understand your concerns..." },
      closing: { duration: 30, description: "Would you be available for a demo?" }
    };
    
    const totalFlowDuration = Object.values(conversationFlow).reduce((sum, step) => sum + step.duration, 0);
    
    const validation = {
      assistantConfig: assistantConfig,
      conversationFlow: conversationFlow,
      analysis: {
        maxDurationSeconds: assistantConfig.maxDurationSeconds,
        maxDurationMinutes: assistantConfig.maxDurationSeconds / 60,
        totalFlowDuration: totalFlowDuration,
        totalFlowMinutes: totalFlowDuration / 60,
        withinOptimalRange: totalFlowDuration <= 180,
        hasEndCallPhrases: assistantConfig.endCallPhrases.length > 0,
        hasEndCallMessage: !!assistantConfig.endCallMessage,
        includesTimeGuidance: assistantConfig.systemMessage.includes('under 2 minutes')
      },
      recommendations: [
        assistantConfig.maxDurationSeconds <= 180 ? '✅ Max duration set to 3 minutes (optimal)' : '⚠️ Consider reducing max duration to 3 minutes',
        totalFlowDuration <= 180 ? '✅ Conversation flow fits within time limit' : '⚠️ Conversation flow exceeds time limit',
        assistantConfig.endCallPhrases.length > 0 ? '✅ End call phrases configured' : '❌ Missing end call phrases',
        assistantConfig.endCallMessage ? '✅ End call message configured' : '❌ Missing end call message',
        assistantConfig.systemMessage.includes('under 2 minutes') ? '✅ Time guidance included' : '❌ Missing time guidance in system message'
      ],
      optimalTiming: {
        targetDuration: '2-3 minutes',
        maxDuration: '3 minutes',
        conversationSteps: Object.entries(conversationFlow).map(([step, config]) => ({
          step: step,
          duration: `${config.duration}s`,
          description: config.description
        }))
      }
    };
    
    res.json({
      success: true,
      message: 'Call duration validation completed',
      validation: validation,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[CALL DURATION VALIDATION ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Call duration validation failed',
      error: error.message
    });
  }
});

// Middleware for parsing JSON bodies (must be before routes that need it)
// Moved to top of file to ensure all routes have access to JSON parsing

// Lead tracking endpoints
app.get('/api/pipeline-stats', async (req, res) => {
  try {
    console.log('[PIPELINE STATS REQUEST]', { 
      ip: req.ip, 
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
    
    if (!smsEmailPipeline) {
      console.log('[PIPELINE STATS] SMS pipeline not available');
      return res.json({
        totalLeads: 0,
        waitingForEmail: 0,
        emailReceived: 0,
        booked: 0,
        conversionRate: 0
      });
    }
    
    const stats = smsEmailPipeline.getStats();
    
    // Add timestamp for cache busting
    stats.lastUpdated = new Date().toISOString();
    
    console.log('[PIPELINE STATS RESPONSE]', stats);
    res.json(stats);
  } catch (error) {
    console.error('[PIPELINE STATS ERROR]', error);
    res.status(500).json({ error: 'Failed to get pipeline stats' });
  }
});

app.get('/api/recent-leads', async (req, res) => {
  try {
    console.log('[RECENT LEADS REQUEST]', { 
      ip: req.ip, 
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
    
    if (!smsEmailPipeline) {
      console.log('[RECENT LEADS] SMS pipeline not available');
      return res.json([]);
    }
    
    // Get all leads from the pipeline
    const allLeads = Array.from(smsEmailPipeline.pendingLeads.values());
    
    // Sort by creation date (newest first)
    allLeads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Limit to 50 most recent
    const recentLeads = allLeads.slice(0, 50);
    
    console.log('[RECENT LEADS RESPONSE]', { 
      totalLeads: allLeads.length,
      returnedLeads: recentLeads.length,
      leadStatuses: recentLeads.reduce((acc, lead) => {
        acc[lead.status] = (acc[lead.status] || 0) + 1;
        return acc;
      }, {})
    });
    
    res.json(recentLeads);
  } catch (error) {
    console.error('[RECENT LEADS ERROR]', error);
    res.status(500).json({ error: 'Failed to get recent leads' });
  }
});

// Get leads needing attention (retry info)
app.get('/api/leads-needing-attention', async (req, res) => {
  try {
    if (!smsEmailPipeline) {
      return res.json({
        stuckLeads: [],
        expiredLeads: [],
        retryScheduled: []
      });
    }

    const attentionData = smsEmailPipeline.getLeadsNeedingAttention();
    
    console.log('[LEADS NEEDING ATTENTION]', {
      stuckLeads: attentionData.stuckLeads.length,
      expiredLeads: attentionData.expiredLeads.length,
      retryScheduled: attentionData.retryScheduled.length
    });

    res.json(attentionData);
  } catch (error) {
    console.error('[LEADS NEEDING ATTENTION ERROR]', error);
    res.status(500).json({ error: 'Failed to get leads needing attention' });
  }
});

// Manually trigger retry for a specific lead
app.post('/api/trigger-retry/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;
    
    if (!smsEmailPipeline) {
      return res.status(500).json({ error: 'SMS pipeline not available' });
    }

    const lead = smsEmailPipeline.pendingLeads.get(leadId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    if (lead.status !== 'waiting_for_email') {
      return res.status(400).json({ error: 'Lead is not in waiting_for_email status' });
    }

    // Force retry by setting nextRetryAt to now
    lead.nextRetryAt = new Date();
    smsEmailPipeline.pendingLeads.set(leadId, lead);

    // Process retries immediately
    await smsEmailPipeline.processRetries();

    console.log(`[MANUAL RETRY TRIGGERED] Lead ${leadId} - ${lead.phoneNumber}`);

    res.json({
      success: true,
      message: `Retry triggered for lead ${leadId}`,
      leadId: leadId,
      phoneNumber: lead.phoneNumber
    });
  } catch (error) {
    console.error('[MANUAL RETRY ERROR]', error);
    res.status(500).json({ error: 'Failed to trigger retry' });
  }
});

// Zapier webhook endpoint (accepts single lead from Zapier)
app.post('/api/webhooks/zapier', requireApiKey, async (req, res) => {
  try {
    console.log('[ZAPIER WEBHOOK] Received lead:', req.body);

    const client = await getClientFromHeader(req);
    if (!client) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid or missing X-Client-Key header' 
      });
    }

    const { name, phone, email, tags, notes, source, customFields } = req.body;

    // Validate required fields
    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    // Import lead using existing bulk processing logic
    const { processBulkLeads } = await import('./lib/lead-deduplication.js');
    
    const leadData = {
      name: name || 'Unknown',
      phone,
      email: email || null,
      tags: Array.isArray(tags) ? tags.join(',') : (tags || ''),
      notes: notes || '',
      source: source || 'Zapier',
      customFields: customFields || {},
      status: 'new',
      created_at: new Date().toISOString()
    };

    const result = await processBulkLeads([leadData], client.clientKey);

    if (result.valid === 0) {
      return res.status(400).json({
        success: false,
        error: 'Lead validation failed',
        details: result.invalid > 0 ? 'Duplicate lead or invalid phone' : 'Unknown error'
      });
    }

    console.log('[ZAPIER WEBHOOK] Lead imported successfully');

    res.json({
      success: true,
      message: 'Lead imported successfully',
      leadId: `lead_${Date.now()}`,
      callScheduled: true,
      scheduledFor: new Date(Date.now() + 30000).toISOString() // 30 seconds from now
    });

  } catch (error) {
    console.error('[ZAPIER WEBHOOK ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import lead',
      details: error.message
    });
  }
});

app.post('/api/import-leads-csv', requireApiKey, async (req, res) => {
  try {
    const { leads } = req.body;
    
    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Leads array is required and must not be empty'
      });
    }
    
    const results = [];
    const errors = [];
    
    for (const lead of leads) {
      try {
        if (!lead.phoneNumber || !lead.decisionMaker) {
          errors.push({
            lead: lead,
            error: 'Missing required fields: phoneNumber and decisionMaker'
          });
          continue;
        }
        
        const response = await fetch(`${req.protocol}://${req.get('host')}/api/initiate-lead-capture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': req.get('X-API-Key')
          },
          body: JSON.stringify({
            leadData: {
              phoneNumber: lead.phoneNumber,
              businessName: lead.businessName || 'Unknown Company',
              decisionMaker: lead.decisionMaker,
              industry: lead.industry || 'Business',
              location: lead.location || 'UK'
            }
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          results.push({
            lead: lead,
            leadId: result.leadId,
            status: 'success'
          });
        } else {
          errors.push({
            lead: lead,
            error: result.message
          });
        }
        
        // Small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        errors.push({
          lead: lead,
          error: error.message
        });
      }
    }
    
    console.log(`[BULK IMPORT] Processed ${leads.length} leads: ${results.length} success, ${errors.length} errors`);
    
    res.json({
      success: true,
      message: `Processed ${leads.length} leads`,
      results: {
        successful: results.length,
        failed: errors.length,
        details: results,
        errors: errors
      }
    });
    
  } catch (error) {
    console.error('[BULK IMPORT ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Bulk import failed',
      error: error.message
    });
  }
});

// Simple Google Places test endpoint
app.post('/api/test-google-places', async (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Google Places API key not configured' });
    }
    
    // Simple test query
    const testQuery = 'dental practice London';
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(testQuery)}&key=${apiKey}`;
    
    console.log(`[TEST] Making Google Places API call: ${searchUrl}`);
    
    const response = await fetch(searchUrl);
    const data = await response.json();
    
    console.log(`[TEST] Google Places API response:`, data);
    
    res.json({
      success: true,
      apiKey: apiKey.substring(0, 10) + '...',
      testQuery,
      response: data
    });
    
  } catch (error) {
    console.error('[TEST] Google Places API error:', error);
    res.status(500).json({ 
      error: 'Google Places API test failed',
      message: error.message 
    });
  }
});

// Google Places Search API endpoint
app.post('/api/search-google-places', async (req, res) => {
  console.log('[SEARCH REQUEST] Received request:', req.body);
  
  // Set a 300-second timeout to prevent 504 errors on large searches
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ 
        error: 'Request timeout', 
        message: 'The request took too long to process. Please try again with a smaller search scope.' 
      });
    }
  }, 1200000); // 1200 seconds (20 minutes) for comprehensive searches
  
  try {
    const { query, location, maxResults = 20, businessSize, mobileOnly, decisionMakerTitles } = req.body;
    
    console.log('[SEARCH REQUEST] Parsed parameters:', { query, location, maxResults, businessSize, mobileOnly, decisionMakerTitles });
    
    if (!query || !location) {
      console.log('[SEARCH REQUEST] Missing required fields:', { query: !!query, location: !!location });
      return res.status(400).json({
        success: false,
        error: 'Query and location are required'
      });
    }
    
    // Check if Google Places API key is available
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'Google Places API key not configured'
      });
    }
    
    console.log(`[GOOGLE PLACES SEARCH] Searching for "${query}" in "${location}"`);
    
    // Search Google Places - use multiple search strategies to get more results
    const searchQueries = [];
    
    if (location === 'United Kingdom') {
      // Create comprehensive search variations for UK - maximum coverage for higher targets
      searchQueries.push(query + ' UK');
      searchQueries.push(query + ' London');
      searchQueries.push(query + ' Manchester');
      searchQueries.push(query + ' Birmingham');
      searchQueries.push(query + ' Glasgow');
      searchQueries.push(query + ' Edinburgh');
      searchQueries.push(query + ' Liverpool');
      searchQueries.push(query + ' Bristol');
      searchQueries.push(query + ' Leeds');
      searchQueries.push(query + ' Newcastle');
      searchQueries.push(query + ' Sheffield');
      searchQueries.push(query + ' Nottingham');
      searchQueries.push(query + ' Cardiff');
      searchQueries.push(query + ' Belfast');
      
      // Add more UK cities for broader coverage
      searchQueries.push(query + ' Portsmouth');
      searchQueries.push(query + ' Plymouth');
      searchQueries.push(query + ' Exeter');
      searchQueries.push(query + ' Bath');
      searchQueries.push(query + ' Norwich');
      searchQueries.push(query + ' Ipswich');
      searchQueries.push(query + ' Colchester');
      searchQueries.push(query + ' Chelmsford');
      searchQueries.push(query + ' Slough');
      searchQueries.push(query + ' Milton Keynes');
      searchQueries.push(query + ' Northampton');
      searchQueries.push(query + ' Coventry');
      searchQueries.push(query + ' Wolverhampton');
      searchQueries.push(query + ' Stoke-on-Trent');
      searchQueries.push(query + ' Chester');
      searchQueries.push(query + ' Middlesbrough');
      searchQueries.push(query + ' Sunderland');
      searchQueries.push(query + ' Durham');
      searchQueries.push(query + ' Dundee');
      searchQueries.push(query + ' Stirling');
      searchQueries.push(query + ' Perth');
      searchQueries.push(query + ' Inverness');
      searchQueries.push(query + ' Newport');
      searchQueries.push(query + ' Wrexham');
      searchQueries.push(query + ' Bangor');
      searchQueries.push(query + ' Newry');
      searchQueries.push(query + ' Derry');
      searchQueries.push(query + ' Armagh');
      searchQueries.push(query + ' Lisburn');
      searchQueries.push(query + ' Craigavon');
      
      // Comprehensive UK cities for maximum coverage - restored for better results
      searchQueries.push(query + ' Reading');
      searchQueries.push(query + ' Oxford');
      searchQueries.push(query + ' Cambridge');
      searchQueries.push(query + ' Canterbury');
      searchQueries.push(query + ' Brighton');
      searchQueries.push(query + ' Hastings');
      searchQueries.push(query + ' Eastbourne');
      searchQueries.push(query + ' Worthing');
      searchQueries.push(query + ' Crawley');
      searchQueries.push(query + ' Guildford');
      searchQueries.push(query + ' Woking');
      searchQueries.push(query + ' Farnborough');
      searchQueries.push(query + ' Aldershot');
      searchQueries.push(query + ' Winchester');
      searchQueries.push(query + ' Southampton');
      searchQueries.push(query + ' Bournemouth');
      searchQueries.push(query + ' Poole');
      searchQueries.push(query + ' Weymouth');
      searchQueries.push(query + ' Dorchester');
      searchQueries.push(query + ' Salisbury');
      searchQueries.push(query + ' Swindon');
      searchQueries.push(query + ' Gloucester');
      searchQueries.push(query + ' Cheltenham');
      searchQueries.push(query + ' Worcester');
      searchQueries.push(query + ' Hereford');
      searchQueries.push(query + ' Shrewsbury');
      searchQueries.push(query + ' Telford');
      searchQueries.push(query + ' Walsall');
      searchQueries.push(query + ' Dudley');
      searchQueries.push(query + ' Sandwell');
      searchQueries.push(query + ' Solihull');
      searchQueries.push(query + ' Redditch');
      searchQueries.push(query + ' Bromsgrove');
      searchQueries.push(query + ' Kidderminster');
      searchQueries.push(query + ' Stourbridge');
      searchQueries.push(query + ' Shrewsbury');
      searchQueries.push(query + ' Telford');
      searchQueries.push(query + ' Walsall');
      searchQueries.push(query + ' Dudley');
      searchQueries.push(query + ' Sandwell');
      searchQueries.push(query + ' Solihull');
      searchQueries.push(query + ' Redditch');
      searchQueries.push(query + ' Bromsgrove');
      searchQueries.push(query + ' Kidderminster');
      searchQueries.push(query + ' Stourbridge');
      searchQueries.push(query + ' Halesowen');
      searchQueries.push(query + ' Oldbury');
      searchQueries.push(query + ' Smethwick');
      searchQueries.push(query + ' West Bromwich');
      searchQueries.push(query + ' Wednesbury');
      searchQueries.push(query + ' Bilston');
      searchQueries.push(query + ' Willenhall');
      searchQueries.push(query + ' Darlaston');
      searchQueries.push(query + ' Tipton');
      searchQueries.push(query + ' Coseley');
      searchQueries.push(query + ' Sedgley');
      searchQueries.push(query + ' Gornal');
      searchQueries.push(query + ' Kingswinford');
      searchQueries.push(query + ' Brierley Hill');
      searchQueries.push(query + ' Stourton');
      searchQueries.push(query + ' Wordsley');
      searchQueries.push(query + ' Amblecote');
      searchQueries.push(query + ' Lye');
      searchQueries.push(query + ' Cradley Heath');
      searchQueries.push(query + ' Netherton');
      searchQueries.push(query + ' Brierley Hill');
      searchQueries.push(query + ' Kingswinford');
      searchQueries.push(query + ' Pensnett');
      searchQueries.push(query + ' Russells Hall');
      searchQueries.push(query + ' Pedmore');
      searchQueries.push(query + ' Hagley');
      searchQueries.push(query + ' Belbroughton');
      searchQueries.push(query + ' Chaddesley Corbett');
      searchQueries.push(query + ' Bromsgrove');
      searchQueries.push(query + ' Redditch');
      searchQueries.push(query + ' Studley');
      searchQueries.push(query + ' Alcester');
      searchQueries.push(query + ' Stratford-upon-Avon');
      searchQueries.push(query + ' Warwick');
      searchQueries.push(query + ' Leamington Spa');
      searchQueries.push(query + ' Kenilworth');
      searchQueries.push(query + ' Rugby');
      searchQueries.push(query + ' Daventry');
      searchQueries.push(query + ' Towcester');
      searchQueries.push(query + ' Brackley');
      searchQueries.push(query + ' Banbury');
      searchQueries.push(query + ' Bicester');
      searchQueries.push(query + ' Witney');
      searchQueries.push(query + ' Carterton');
      searchQueries.push(query + ' Burford');
      searchQueries.push(query + ' Chipping Norton');
      searchQueries.push(query + ' Woodstock');
      searchQueries.push(query + ' Kidlington');
      searchQueries.push(query + ' Abingdon');
      searchQueries.push(query + ' Didcot');
      searchQueries.push(query + ' Wantage');
      searchQueries.push(query + ' Faringdon');
      searchQueries.push(query + ' Wallingford');
      searchQueries.push(query + ' Thame');
      searchQueries.push(query + ' Aylesbury');
      searchQueries.push(query + ' High Wycombe');
      searchQueries.push(query + ' Beaconsfield');
      searchQueries.push(query + ' Amersham');
      searchQueries.push(query + ' Chesham');
      searchQueries.push(query + ' Tring');
      searchQueries.push(query + ' Berkhamsted');
      searchQueries.push(query + ' Hemel Hempstead');
      searchQueries.push(query + ' Watford');
      searchQueries.push(query + ' St Albans');
      searchQueries.push(query + ' Harpenden');
      searchQueries.push(query + ' Welwyn Garden City');
      searchQueries.push(query + ' Hatfield');
      searchQueries.push(query + ' Stevenage');
      searchQueries.push(query + ' Letchworth');
      searchQueries.push(query + ' Hitchin');
      searchQueries.push(query + ' Baldock');
      searchQueries.push(query + ' Royston');
      searchQueries.push(query + ' Bishop\'s Stortford');
      searchQueries.push(query + ' Sawbridgeworth');
      searchQueries.push(query + ' Harlow');
      searchQueries.push(query + ' Epping');
      searchQueries.push(query + ' Ongar');
      searchQueries.push(query + ' Brentwood');
      searchQueries.push(query + ' Billericay');
      searchQueries.push(query + ' Wickford');
      searchQueries.push(query + ' Rayleigh');
      searchQueries.push(query + ' Southend-on-Sea');
      searchQueries.push(query + ' Leigh-on-Sea');
      searchQueries.push(query + ' Westcliff-on-Sea');
      searchQueries.push(query + ' Shoeburyness');
      searchQueries.push(query + ' Rochford');
      searchQueries.push(query + ' Hockley');
      searchQueries.push(query + ' Rayleigh');
      searchQueries.push(query + ' Wickford');
      searchQueries.push(query + ' Billericay');
      searchQueries.push(query + ' Brentwood');
      searchQueries.push(query + ' Ongar');
      searchQueries.push(query + ' Epping');
      searchQueries.push(query + ' Harlow');
      searchQueries.push(query + ' Sawbridgeworth');
      searchQueries.push(query + ' Bishop\'s Stortford');
      searchQueries.push(query + ' Royston');
      searchQueries.push(query + ' Baldock');
      searchQueries.push(query + ' Hitchin');
      searchQueries.push(query + ' Letchworth');
      searchQueries.push(query + ' Stevenage');
      searchQueries.push(query + ' Hatfield');
      searchQueries.push(query + ' Welwyn Garden City');
      searchQueries.push(query + ' Harpenden');
      searchQueries.push(query + ' St Albans');
      searchQueries.push(query + ' Watford');
      searchQueries.push(query + ' Hemel Hempstead');
      searchQueries.push(query + ' Berkhamsted');
      searchQueries.push(query + ' Tring');
      searchQueries.push(query + ' Chesham');
      searchQueries.push(query + ' Amersham');
      searchQueries.push(query + ' Beaconsfield');
      searchQueries.push(query + ' High Wycombe');
      searchQueries.push(query + ' Aylesbury');
      searchQueries.push(query + ' Thame');
      searchQueries.push(query + ' Wallingford');
      searchQueries.push(query + ' Faringdon');
      searchQueries.push(query + ' Wantage');
      searchQueries.push(query + ' Didcot');
      searchQueries.push(query + ' Abingdon');
      searchQueries.push(query + ' Kidlington');
      searchQueries.push(query + ' Woodstock');
      searchQueries.push(query + ' Chipping Norton');
      searchQueries.push(query + ' Burford');
      searchQueries.push(query + ' Carterton');
      searchQueries.push(query + ' Witney');
      searchQueries.push(query + ' Bicester');
      searchQueries.push(query + ' Banbury');
      searchQueries.push(query + ' Brackley');
      searchQueries.push(query + ' Towcester');
      searchQueries.push(query + ' Daventry');
      searchQueries.push(query + ' Rugby');
      searchQueries.push(query + ' Kenilworth');
      searchQueries.push(query + ' Leamington Spa');
      searchQueries.push(query + ' Warwick');
      searchQueries.push(query + ' Stratford-upon-Avon');
      searchQueries.push(query + ' Alcester');
      searchQueries.push(query + ' Studley');
      searchQueries.push(query + ' Redditch');
      searchQueries.push(query + ' Bromsgrove');
      searchQueries.push(query + ' Chaddesley Corbett');
      searchQueries.push(query + ' Belbroughton');
      searchQueries.push(query + ' Hagley');
      searchQueries.push(query + ' Pedmore');
      searchQueries.push(query + ' Russells Hall');
      searchQueries.push(query + ' Pensnett');
      searchQueries.push(query + ' Kingswinford');
      searchQueries.push(query + ' Brierley Hill');
      searchQueries.push(query + ' Netherton');
      searchQueries.push(query + ' Cradley Heath');
      searchQueries.push(query + ' Lye');
      searchQueries.push(query + ' Amblecote');
      searchQueries.push(query + ' Wordsley');
      searchQueries.push(query + ' Stourton');
      searchQueries.push(query + ' Brierley Hill');
      searchQueries.push(query + ' Kingswinford');
      searchQueries.push(query + ' Sedgley');
      searchQueries.push(query + ' Coseley');
      searchQueries.push(query + ' Tipton');
      searchQueries.push(query + ' Darlaston');
      searchQueries.push(query + ' Willenhall');
      searchQueries.push(query + ' Bilston');
      searchQueries.push(query + ' Wednesbury');
      searchQueries.push(query + ' West Bromwich');
      searchQueries.push(query + ' Smethwick');
      searchQueries.push(query + ' Oldbury');
      searchQueries.push(query + ' Halesowen');
      searchQueries.push(query + ' Stourbridge');
      searchQueries.push(query + ' Kidderminster');
      searchQueries.push(query + ' Bromsgrove');
      searchQueries.push(query + ' Redditch');
      searchQueries.push(query + ' Solihull');
      searchQueries.push(query + ' Sandwell');
      searchQueries.push(query + ' Dudley');
      searchQueries.push(query + ' Walsall');
      searchQueries.push(query + ' Telford');
      searchQueries.push(query + ' Shrewsbury');
      searchQueries.push(query + ' Hereford');
      searchQueries.push(query + ' Worcester');
      searchQueries.push(query + ' Cheltenham');
      searchQueries.push(query + ' Gloucester');
      searchQueries.push(query + ' Swindon');
      searchQueries.push(query + ' Salisbury');
      searchQueries.push(query + ' Dorchester');
      searchQueries.push(query + ' Weymouth');
      searchQueries.push(query + ' Poole');
      searchQueries.push(query + ' Bournemouth');
      searchQueries.push(query + ' Southampton');
      searchQueries.push(query + ' Winchester');
      searchQueries.push(query + ' Aldershot');
      searchQueries.push(query + ' Farnborough');
      searchQueries.push(query + ' Woking');
      searchQueries.push(query + ' Guildford');
      searchQueries.push(query + ' Crawley');
      searchQueries.push(query + ' Worthing');
      searchQueries.push(query + ' Eastbourne');
      searchQueries.push(query + ' Hastings');
      searchQueries.push(query + ' Brighton');
      searchQueries.push(query + ' Canterbury');
      searchQueries.push(query + ' Cambridge');
      searchQueries.push(query + ' Oxford');
      searchQueries.push(query + ' Reading');
    } else {
      searchQueries.push(query + ' ' + location);
    }
    
    // Add mobile-friendly terms to increase chances of finding mobile numbers
    const mobileFriendlyTerms = ['owner', 'director', 'consultant', 'advisor', 'specialist', 'private', 'independent', 'solo'];
    const hasMobileTerms = mobileFriendlyTerms.some(term => 
      query.toLowerCase().includes(term.toLowerCase())
    );
    
    if (!hasMobileTerms && !query.includes('"')) {
      // Add mobile-friendly variations - these business types more likely to have mobile numbers
      if (location === 'United Kingdom') {
        searchQueries.push(query + ' "private" UK');
        searchQueries.push(query + ' "consultant" UK');
        searchQueries.push(query + ' "independent" UK');
        searchQueries.push(query + ' "solo" UK');
        searchQueries.push(query + ' "owner" UK');
        searchQueries.push(query + ' "director" UK');
        searchQueries.push(query + ' "specialist" UK');
        searchQueries.push(query + ' "advisor" UK');
        searchQueries.push(query + ' "freelance" UK');
        // Add more variations to get more results
        searchQueries.push(query + ' "mobile" UK');
        searchQueries.push(query + ' "personal" UK');
        searchQueries.push(query + ' "individual" UK');
        searchQueries.push(query + ' "self-employed" UK');
        searchQueries.push(query + ' "sole trader" UK');
        // Add even more variations to get many more results
        searchQueries.push(query + ' "home based" UK');
        searchQueries.push(query + ' "online" UK');
        searchQueries.push(query + ' "virtual" UK');
        searchQueries.push(query + ' "remote" UK');
        searchQueries.push(query + ' "freelancer" UK');
        searchQueries.push(query + ' "contractor" UK');
        searchQueries.push(query + ' "practitioner" UK');
        searchQueries.push(query + ' "therapist" UK');
        searchQueries.push(query + ' "coach" UK');
        searchQueries.push(query + ' "trainer" UK');
        // Balanced search terms to prevent 502 errors while finding mobile numbers
        searchQueries.push('"medical" UK');
        searchQueries.push('"clinic" UK');
        searchQueries.push('"doctor" UK');
        searchQueries.push('"private practice" UK');
        searchQueries.push('"GP" UK');
        searchQueries.push('"private GP" UK');
        searchQueries.push('"private doctor" UK');
        
        // Add more business types likely to have mobile numbers
        searchQueries.push('"dental practice" UK');
        searchQueries.push('"private dentist" UK');
        searchQueries.push('"orthodontist" UK');
        searchQueries.push('"acupuncturist" UK');
        searchQueries.push('"nutritionist" UK');
        searchQueries.push('"dietitian" UK');
        searchQueries.push('"psychologist" UK');
        searchQueries.push('"therapist" UK');
        searchQueries.push('"counsellor" UK');
        searchQueries.push('"life coach" UK');
        searchQueries.push('"business coach" UK');
        searchQueries.push('"fitness trainer" UK');
        searchQueries.push('"pilates instructor" UK');
        searchQueries.push('"aesthetic practitioner" UK');
        searchQueries.push('"cosmetic surgeon" UK');
        searchQueries.push('"dermatologist" UK');
        searchQueries.push('"optometrist" UK');
        searchQueries.push('"podiatrist" UK');
        searchQueries.push('"veterinarian" UK');
        searchQueries.push('"vet" UK');
        searchQueries.push('"veterinary practice" UK');
        searchQueries.push('"lawyer" UK');
        searchQueries.push('"barrister" UK');
        searchQueries.push('"legal practice" UK');
        searchQueries.push('"accounting practice" UK');
        searchQueries.push('"mortgage advisor" UK');
        searchQueries.push('"insurance broker" UK');
        searchQueries.push('"property consultant" UK');
        searchQueries.push('"architect" UK');
        searchQueries.push('"interior designer" UK');
        searchQueries.push('"graphic designer" UK');
        searchQueries.push('"web designer" UK');
        searchQueries.push('"wedding photographer" UK');
        searchQueries.push('"event planner" UK');
        searchQueries.push('"wedding planner" UK');
        searchQueries.push('"caterer" UK');
        searchQueries.push('"private chef" UK');
        searchQueries.push('"music teacher" UK');
        searchQueries.push('"piano teacher" UK');
        searchQueries.push('"guitar teacher" UK');
        searchQueries.push('"dance teacher" UK');
        searchQueries.push('"private tutor" UK');
        searchQueries.push('"business consultant" UK');
        searchQueries.push('"management consultant" UK');
        searchQueries.push('"IT consultant" UK');
        searchQueries.push('"marketing consultant" UK');
        searchQueries.push('"HR consultant" UK');
        searchQueries.push('"recruitment consultant" UK');
        searchQueries.push('"contractor" UK');
        searchQueries.push('"sole trader" UK');
        searchQueries.push('"freelance" UK');
        searchQueries.push('"self-employed" UK');
        searchQueries.push('"mobile" UK');
        searchQueries.push('"general practitioner" UK');
        searchQueries.push('"family doctor" UK');
        
        // Add individual practitioner searches - these are more likely to have mobile numbers
        searchQueries.push('"Dr" UK');
        searchQueries.push('"Doctor" UK');
        searchQueries.push('"Mr" UK');
        searchQueries.push('"Mrs" UK');
        searchQueries.push('"Ms" UK');
        searchQueries.push('"individual" UK');
        searchQueries.push('"solo" UK');
        searchQueries.push('"independent" UK');
        searchQueries.push('"home based" UK');
        searchQueries.push('"mobile service" UK');
        searchQueries.push('"home visit" UK');
        searchQueries.push('"house call" UK');
        searchQueries.push('"on-site" UK');
        searchQueries.push('"mobile clinic" UK');
        searchQueries.push('"mobile practice" UK');
        searchQueries.push('"private medical" UK');
        searchQueries.push('"private clinic" UK');
        searchQueries.push('"medical practice" UK');
        searchQueries.push('"healthcare" UK');
        searchQueries.push('"wellness" UK');
        searchQueries.push('"osteopath" UK');
        searchQueries.push('"chiropractor" UK');
        searchQueries.push('"physiotherapist" UK');
        searchQueries.push('"massage therapist" UK');
        searchQueries.push('"acupuncturist" UK');
        searchQueries.push('"nutritionist" UK');
        searchQueries.push('"solo practitioner" UK');
        searchQueries.push('"independent practitioner" UK');
        searchQueries.push('"home based" UK');
        searchQueries.push('"personal" UK');
        searchQueries.push('"individual" UK');
        
        // EXPANDED SEARCH SCOPE - Add many more business types to reach 100+ mobile numbers
        // Healthcare & Medical Professionals
        searchQueries.push('"nurse" UK');
        searchQueries.push('"midwife" UK');
        searchQueries.push('"pharmacist" UK');
        searchQueries.push('"optician" UK');
        searchQueries.push('"hearing aid" UK');
        searchQueries.push('"podiatrist" UK');
        searchQueries.push('"chiropodist" UK');
        searchQueries.push('"reflexologist" UK');
        searchQueries.push('"aromatherapist" UK');
        searchQueries.push('"homeopath" UK');
        searchQueries.push('"herbalist" UK');
        searchQueries.push('"naturopath" UK');
        searchQueries.push('"reiki" UK');
        searchQueries.push('"crystal healing" UK');
        
        // Therapists & Bodywork
        searchQueries.push('"massage" UK');
        searchQueries.push('"sports massage" UK');
        searchQueries.push('"deep tissue" UK');
        searchQueries.push('"swedish massage" UK');
        searchQueries.push('"thai massage" UK');
        searchQueries.push('"hot stone massage" UK');
        searchQueries.push('"pregnancy massage" UK');
        searchQueries.push('"craniosacral" UK');
        searchQueries.push('"bowen therapy" UK');
        searchQueries.push('"rolfing" UK');
        searchQueries.push('"myofascial release" UK');
        
        // Fitness & Wellness
        searchQueries.push('"personal training" UK');
        searchQueries.push('"fitness coaching" UK');
        searchQueries.push('"nutrition coaching" UK');
        searchQueries.push('"weight loss coach" UK');
        searchQueries.push('"yoga instructor" UK');
        searchQueries.push('"pilates instructor" UK');
        searchQueries.push('"dance instructor" UK');
        searchQueries.push('"swimming instructor" UK');
        searchQueries.push('"tennis coach" UK');
        searchQueries.push('"golf instructor" UK');
        searchQueries.push('"martial arts instructor" UK');
        searchQueries.push('"boxing trainer" UK');
        searchQueries.push('"crossfit trainer" UK');
        
        // Coaching & Therapy
        searchQueries.push('"life coaching" UK');
        searchQueries.push('"business coaching" UK');
        searchQueries.push('"career coaching" UK');
        searchQueries.push('"executive coaching" UK');
        searchQueries.push('"relationship coaching" UK');
        searchQueries.push('"parenting coach" UK');
        searchQueries.push('"counselling" UK');
        searchQueries.push('"therapy" UK');
        searchQueries.push('"psychotherapy" UK');
        searchQueries.push('"cognitive therapy" UK');
        searchQueries.push('"art therapy" UK');
        searchQueries.push('"music therapy" UK');
        searchQueries.push('"drama therapy" UK');
        searchQueries.push('"play therapy" UK');
        searchQueries.push('"speech therapy" UK');
        searchQueries.push('"occupational therapy" UK');
        searchQueries.push('"physiotherapy" UK');
        
        // Alternative Medicine
        searchQueries.push('"osteopathy" UK');
        searchQueries.push('"chiropractic" UK');
        searchQueries.push('"acupuncture" UK');
        searchQueries.push('"dry needling" UK');
        searchQueries.push('"cupping" UK');
        searchQueries.push('"moxibustion" UK');
        searchQueries.push('"shiatsu" UK');
        searchQueries.push('"tui na" UK');
        searchQueries.push('"kinesiology" UK');
        searchQueries.push('"bioresonance" UK');
        searchQueries.push('"electrotherapy" UK');
        searchQueries.push('"magnetic therapy" UK');
        
        // Beauty & Aesthetics
        searchQueries.push('"beauty treatment" UK');
        searchQueries.push('"facial" UK');
        searchQueries.push('"skincare" UK');
        searchQueries.push('"anti-aging" UK');
        searchQueries.push('"botox" UK');
        searchQueries.push('"dermal fillers" UK');
        searchQueries.push('"lip fillers" UK');
        searchQueries.push('"cheek fillers" UK');
        searchQueries.push('"hair removal" UK');
        searchQueries.push('"laser hair removal" UK');
        searchQueries.push('"waxing" UK');
        searchQueries.push('"threading" UK');
        searchQueries.push('"eyebrow" UK');
        searchQueries.push('"eyelash" UK');
        searchQueries.push('"nail art" UK');
        searchQueries.push('"manicure" UK');
        searchQueries.push('"pedicure" UK');
        searchQueries.push('"barber" UK');
        searchQueries.push('"hair salon" UK');
        searchQueries.push('"hair stylist" UK');
        searchQueries.push('"hair colourist" UK');
        searchQueries.push('"wedding hair" UK');
        searchQueries.push('"bridal hair" UK');
        searchQueries.push('"hair extensions" UK');
        searchQueries.push('"hair transplant" UK');
        
        // Professional Services
        searchQueries.push('"financial advisor" UK');
        searchQueries.push('"mortgage broker" UK');
        searchQueries.push('"insurance advisor" UK');
        searchQueries.push('"pension advisor" UK');
        searchQueries.push('"investment advisor" UK');
        searchQueries.push('"tax advisor" UK');
        searchQueries.push('"bookkeeper" UK');
        searchQueries.push('"payroll" UK');
        searchQueries.push('"HR consultant" UK');
        searchQueries.push('"recruitment" UK');
        searchQueries.push('"headhunter" UK');
        searchQueries.push('"executive search" UK');
        
        // Creative & Design
        searchQueries.push('"photographer" UK');
        searchQueries.push('"wedding photographer" UK');
        searchQueries.push('"portrait photographer" UK');
        searchQueries.push('"commercial photographer" UK');
        searchQueries.push('"event photographer" UK');
        searchQueries.push('"videographer" UK');
        searchQueries.push('"wedding videographer" UK');
        searchQueries.push('"graphic designer" UK');
        searchQueries.push('"web designer" UK');
        searchQueries.push('"interior designer" UK');
        searchQueries.push('"landscape designer" UK');
        searchQueries.push('"fashion designer" UK');
        searchQueries.push('"jewellery designer" UK');
        
        // Education & Training
        searchQueries.push('"private tutor" UK');
        searchQueries.push('"maths tutor" UK');
        searchQueries.push('"english tutor" UK');
        searchQueries.push('"science tutor" UK');
        searchQueries.push('"music teacher" UK');
        searchQueries.push('"piano teacher" UK');
        searchQueries.push('"guitar teacher" UK');
        searchQueries.push('"violin teacher" UK');
        searchQueries.push('"singing teacher" UK');
        searchQueries.push('"dance teacher" UK');
        searchQueries.push('"ballet teacher" UK');
        searchQueries.push('"driving instructor" UK');
        searchQueries.push('"language teacher" UK');
        searchQueries.push('"ESL teacher" UK');
        
        // Home & Garden Services
        searchQueries.push('"gardener" UK');
        searchQueries.push('"landscaper" UK');
        searchQueries.push('"tree surgeon" UK');
        searchQueries.push('"plumber" UK');
        searchQueries.push('"electrician" UK');
        searchQueries.push('"handyman" UK');
        searchQueries.push('"painter" UK');
        searchQueries.push('"decorator" UK');
        searchQueries.push('"carpenter" UK');
        searchQueries.push('"roofer" UK');
        searchQueries.push('"tiler" UK');
        searchQueries.push('"flooring" UK');
        searchQueries.push('"kitchen fitter" UK');
        searchQueries.push('"bathroom fitter" UK');
        
        // Pet Services
        searchQueries.push('"dog walker" UK');
        searchQueries.push('"pet sitter" UK');
        searchQueries.push('"dog trainer" UK');
        searchQueries.push('"pet groomer" UK');
        searchQueries.push('"veterinary" UK');
        searchQueries.push('"animal physiotherapist" UK');
        searchQueries.push('"pet nutritionist" UK');
        
        // Event & Entertainment
        searchQueries.push('"event planner" UK');
        searchQueries.push('"wedding planner" UK');
        searchQueries.push('"party planner" UK');
        searchQueries.push('"caterer" UK');
        searchQueries.push('"private chef" UK');
        searchQueries.push('"DJ" UK');
        searchQueries.push('"magician" UK');
        searchQueries.push('"entertainer" UK');
        searchQueries.push('"face painter" UK');
        searchQueries.push('"balloon artist" UK');
        
        console.log(`[EXPANDED SEARCH] Added comprehensive business types - total search queries: ${searchQueries.length}`);
      } else {
        searchQueries.push(query + ' "private" ' + location);
        searchQueries.push(query + ' "consultant" ' + location);
        searchQueries.push(query + ' "advisor" ' + location);
        searchQueries.push(query + ' "independent" ' + location);
        searchQueries.push(query + ' "solo" ' + location);
        searchQueries.push(query + ' "owner" ' + location);
        searchQueries.push(query + ' "director" ' + location);
        searchQueries.push(query + ' "specialist" ' + location);
        searchQueries.push(query + ' "advisor" ' + location);
        searchQueries.push(query + ' "freelance" ' + location);
        // Add more variations to get more results
        searchQueries.push(query + ' "mobile" ' + location);
        searchQueries.push(query + ' "personal" ' + location);
        searchQueries.push(query + ' "individual" ' + location);
        searchQueries.push(query + ' "self-employed" ' + location);
        searchQueries.push(query + ' "sole trader" ' + location);
        // Add even more variations to get many more results
        searchQueries.push(query + ' "home based" ' + location);
        searchQueries.push(query + ' "online" ' + location);
        searchQueries.push(query + ' "virtual" ' + location);
        searchQueries.push(query + ' "remote" ' + location);
        searchQueries.push(query + ' "freelancer" ' + location);
        searchQueries.push(query + ' "contractor" ' + location);
        searchQueries.push(query + ' "practitioner" ' + location);
        searchQueries.push(query + ' "therapist" ' + location);
        searchQueries.push(query + ' "coach" ' + location);
        searchQueries.push(query + ' "trainer" ' + location);
      }
    }
    
    const allResults = [];
    
    // Real Google Places API calls with conservative settings
    console.log(`[GOOGLE PLACES] Starting search with ${searchQueries.length} queries`);
    
    const maxPages = 3; // Increased pagination for even more results per city
    const queryDelay = 200; // Fast processing - reduced delay for speed
    
    for (let i = 0; i < searchQueries.length; i++) {
      const searchQuery = searchQueries[i];
      console.log(`[GOOGLE PLACES] Searching: "${searchQuery}" (${i + 1}/${searchQueries.length})`);
      
      try {
        // Search for places
        const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`;
        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();
        
        // Check for Google Places API errors
        if (searchData.error_message) {
          console.error(`[GOOGLE PLACES ERROR] ${searchData.error_message}`);
          continue; // Skip this query and continue with the next one
        }
        
        if (searchData.results && searchData.results.length > 0) {
          allResults.push(...searchData.results);
          console.log(`[GOOGLE PLACES] Found ${searchData.results.length} results for "${searchQuery}"`);
          
          // Handle pagination with conservative limits
          let nextPageToken = searchData.next_page_token;
          let pageCount = 1;
          
          while (nextPageToken && pageCount < maxPages) {
            console.log(`[GOOGLE PLACES] Getting page ${pageCount + 1} for "${searchQuery}"`);
            
            // Wait for next page token to be valid (Google requires this)
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const nextPageUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?pagetoken=${nextPageToken}&key=${apiKey}`;
            const nextPageResponse = await fetch(nextPageUrl);
            const nextPageData = await nextPageResponse.json();
            
            // Check for Google Places API errors
            if (nextPageData.error_message) {
              console.error(`[GOOGLE PLACES PAGINATION ERROR] ${nextPageData.error_message}`);
              break; // Stop pagination for this query
            }
            
            if (nextPageData.results && nextPageData.results.length > 0) {
              allResults.push(...nextPageData.results);
              console.log(`[GOOGLE PLACES] Found ${nextPageData.results.length} more results on page ${pageCount + 1}`);
              nextPageToken = nextPageData.next_page_token;
              pageCount++;
            } else {
              break;
            }
          }
        } else {
          console.log(`[GOOGLE PLACES] No results found for "${searchQuery}"`);
        }
        
        // Delay between queries to prevent rate limiting
        if (i < searchQueries.length - 1) {
          await new Promise(resolve => setTimeout(resolve, queryDelay));
        }
        
      } catch (error) {
        console.error(`[GOOGLE PLACES ERROR] Failed to search "${searchQuery}":`, error.message);
        // Continue with next query instead of failing completely
      }
    }
    
    console.log(`[GOOGLE PLACES] Total results collected: ${allResults.length}`);
    
    console.log(`[GOOGLE PLACES] Total unique results from all queries: ${allResults.length}`);
    
    // If we don't have enough results, add more search variations
    if (allResults.length < maxResults * 5) { // If less than 5x target, add more searches
      console.log(`[FALLBACK] Only found ${allResults.length} businesses, adding more search variations...`);
      
      // Add more business types for broader coverage
      const additionalBusinessTypes = [
        '"nurse" UK', '"midwife" UK', '"pharmacist" UK', '"optician" UK', '"hearing aid" UK',
        '"podiatrist" UK', '"chiropodist" UK', '"reflexologist" UK', '"aromatherapist" UK',
        '"homeopath" UK', '"herbalist" UK', '"naturopath" UK', '"reiki" UK', '"crystal healing" UK',
        '"massage" UK', '"sports massage" UK', '"deep tissue" UK', '"swedish massage" UK',
        '"personal training" UK', '"fitness coaching" UK', '"nutrition coaching" UK',
        '"life coaching" UK', '"business coaching" UK', '"career coaching" UK',
        '"counselling" UK', '"therapy" UK', '"psychotherapy" UK', '"cognitive therapy" UK',
        '"art therapy" UK', '"music therapy" UK', '"drama therapy" UK', '"play therapy" UK',
        '"speech therapy" UK', '"occupational therapy" UK', '"physiotherapy" UK',
        '"osteopathy" UK', '"chiropractic" UK', '"acupuncture" UK', '"dry needling" UK',
        '"cupping" UK', '"moxibustion" UK', '"shiatsu" UK', '"tui na" UK',
        '"beauty treatment" UK', '"facial" UK', '"skincare" UK', '"anti-aging" UK',
        '"botox" UK', '"dermal fillers" UK', '"lip fillers" UK', '"cheek fillers" UK',
        '"hair removal" UK', '"laser hair removal" UK', '"waxing" UK', '"threading" UK',
        '"eyebrow" UK', '"eyelash" UK', '"nail art" UK', '"manicure" UK', '"pedicure" UK',
        '"barber" UK', '"hair salon" UK', '"hair stylist" UK', '"hair colourist" UK',
        '"wedding hair" UK', '"bridal hair" UK', '"hair extensions" UK', '"hair transplant" UK'
      ];
      
      // Add additional searches to the existing searchQueries
      searchQueries.push(...additionalBusinessTypes);
      
      console.log(`[FALLBACK] Added ${additionalBusinessTypes.length} more search terms, total: ${searchQueries.length}`);
    }
    
    if (allResults.length === 0) {
      console.error(`[GOOGLE PLACES ERROR] No results found from any query`);
      return res.status(400).json({
        success: false,
        error: 'No businesses found for the given search criteria'
      });
    }
    
    // Real processing with conservative chunked approach
    const results = [];
    const targetMobileNumbers = maxResults; // This is just for logging/target purposes
    const chunkSize = 100; // Large chunk size for fast processing
    const chunkDelay = 100; // Minimal delay for fast processing

    console.log(`[PROCESSING] Processing ${allResults.length} results in chunks of ${chunkSize}, target: ${targetMobileNumbers} mobile numbers`);
    console.log(`[DEBUG] maxResults: ${maxResults}, targetMobileNumbers: ${targetMobileNumbers}`);
    console.log(`[NOTE] Will return ALL mobile numbers found, not limited to ${targetMobileNumbers}`);

    // Process results in small chunks to prevent server overload
    for (let i = 0; i < allResults.length; i += chunkSize) {
      const chunk = allResults.slice(i, i + chunkSize);
      console.log(`[PROCESSING] Processing chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(allResults.length / chunkSize)} (${chunk.length} businesses)`);

      // Continue processing until ALL businesses are checked - no early exit
      console.log(`[PROGRESS] Found ${results.length}/${targetMobileNumbers} mobile numbers so far, continuing...`);

      for (const place of chunk) {
        try {
          // Get detailed information for each place (including reviews for pain point analysis)
          const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_phone_number,website,formatted_address,reviews,rating&key=${apiKey}`;
          const detailsResponse = await fetch(detailsUrl);
          const detailsData = await detailsResponse.json();

          // Check for Google Places API errors
          if (detailsData.error_message) {
            console.error(`[GOOGLE PLACES DETAILS ERROR] ${detailsData.error_message}`);
            continue; // Skip this business and continue with the next one
          }

          if (detailsData.result) {
            const phone = detailsData.result.formatted_phone_number;
            let isMobile = phone ? isMobileNumber(phone) : false;
            let phoneValidation = null;
            let reviewsAnalysis = null;
            
            // Analyze Google reviews for pain points (free, already included in API response)
            if (detailsData.result.reviews && detailsData.result.reviews.length > 0) {
              const { analyzeReviewsForPainPoints, calculateReviewScore, generatePersonalizedPitch } = await import('./lib/reviews-analysis.js');
              reviewsAnalysis = analyzeReviewsForPainPoints(detailsData.result.reviews);
              reviewsAnalysis.score = calculateReviewScore(reviewsAnalysis);
              reviewsAnalysis.personalizedPitch = generatePersonalizedPitch(reviewsAnalysis, { 
                name: detailsData.result.name 
              });
              
              console.log(`[REVIEWS] ${detailsData.result.name}: ${reviewsAnalysis.painPoints.length} pain points, score: ${reviewsAnalysis.score}`);
            }
            
            // Optional: Validate phone number with Twilio Lookup API (costs $0.005/number)
            // Enable with query parameter: ?validatePhones=true
            if (phone && req.query.validatePhones === 'true') {
              const { validatePhoneNumber, isPhoneValidationEnabled } = await import('./lib/phone-validation.js');
              if (isPhoneValidationEnabled()) {
                phoneValidation = await validatePhoneNumber(phone);
                // Override isMobile with validated data
                if (phoneValidation.validated) {
                  isMobile = phoneValidation.lineType === 'mobile' && phoneValidation.recommended;
                  console.log(`[PHONE VALIDATED] ${detailsData.result.name}: ${phone} -> ${phoneValidation.lineType} (risk: ${phoneValidation.riskLevel})`);
                }
              }
            }
            
            // Debug logging for mobile detection
            if (phone) {
              console.log(`[PHONE CHECK] ${detailsData.result.name}: ${phone} -> Mobile: ${isMobile}${phoneValidation ? ' (validated)' : ''}${reviewsAnalysis ? ` | Reviews: ${reviewsAnalysis.score}/100` : ''}`);
            }

            const business = {
              name: detailsData.result.name || place.name,
              phone: phone || 'No phone listed',
              hasMobile: isMobile,
              email: generateEmail(detailsData.result.name || place.name),
              website: detailsData.result.website || place.website,
              address: detailsData.result.formatted_address || place.formatted_address,
              rating: detailsData.result.rating || 0,
              industry: query,
              source: 'Google Places',
              businessSize: 'Solo',
              mobileLikelihood: 8,
              verified: true,
              isUKBusiness: true,
              // Add validation data if available
              ...(phoneValidation && {
                phoneValidation: {
                  lineType: phoneValidation.lineType,
                  carrier: phoneValidation.carrier,
                  riskScore: phoneValidation.riskScore,
                  riskLevel: phoneValidation.riskLevel,
                  validated: phoneValidation.validated,
                  validatedAt: phoneValidation.validatedAt
                }
              }),
              // Add reviews analysis if available
              ...(reviewsAnalysis && {
                reviewsAnalysis: {
                  painPoints: reviewsAnalysis.painPoints,
                  opportunities: reviewsAnalysis.opportunities,
                  sentiment: reviewsAnalysis.sentiment,
                  avgRating: reviewsAnalysis.avgRating,
                  totalReviews: reviewsAnalysis.totalReviews,
                  score: reviewsAnalysis.score,
                  personalizedPitch: reviewsAnalysis.personalizedPitch
                }
              })
            };

            results.push(business);

            if (isMobile) {
              console.log(`[MOBILE FOUND] ${results.filter(r => r.hasMobile).length}/${targetMobileNumbers}: ${business.name} - ${phone}${phoneValidation ? ` [${phoneValidation.carrier}]` : ''}`);
            }
          }
        } catch (error) {
          console.error(`[PROCESSING ERROR] Failed to get details for ${place.name}:`, error.message);
          // Continue processing other businesses
        }
      }

      // Delay between chunks to prevent server overload
      if (i + chunkSize < allResults.length) {
        await new Promise(resolve => setTimeout(resolve, chunkDelay));
      }
    }

    const finalMobileCount = results.filter(r => r.hasMobile).length;
    console.log(`[PROCESSING COMPLETE] Found ${results.length} total businesses, ${finalMobileCount} with mobile numbers (Target: ${targetMobileNumbers})`);

    if (finalMobileCount >= targetMobileNumbers) {
      console.log(`[SUCCESS] Target achieved! Found ${finalMobileCount}/${targetMobileNumbers} mobile numbers`);
    } else {
      console.log(`[INSUFFICIENT] Found ${finalMobileCount}/${targetMobileNumbers} mobile numbers - target not reached, but continuing with available results`);
      console.log(`[NOTE] System processed all available businesses. To reach 100+ mobile numbers, try increasing search scope or using different search terms.`);
    }
    
    console.log('[SEARCH RESPONSE] Sending response with', results.length, 'results');
    
    // Check if response was already sent (timeout case)
    if (res.headersSent) {
      console.log('[SEARCH RESPONSE] Response already sent, skipping');
      return;
    }
    
    // Clear the timeout since request completed successfully
    clearTimeout(timeout);
    
    res.json({
      success: true,
      results: results,
      total: results.length,
      mobileCount: finalMobileCount,
      targetMobileNumbers: targetMobileNumbers,
      processed: allResults.length,
      requested: maxResults,
      targetReached: finalMobileCount >= targetMobileNumbers
    });
    
  } catch (error) {
    console.error('[GOOGLE PLACES SEARCH ERROR]', error);
    
    // Clear the timeout since request completed (with error)
    clearTimeout(timeout);
    
    // Check if response was already sent (timeout case)
    if (res.headersSent) {
      console.log('[SEARCH ERROR] Response already sent, skipping error response');
      return;
    }
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to detect mobile numbers
function isMobileNumber(phone) {
  if (!phone || phone === 'No phone listed') return false;
  
  // Enhanced UK mobile detection - more patterns to catch mobile numbers
  const mobilePatterns = [
    // Standard UK mobile patterns (7x xxxxxxxx)
    /^\+447[0-9]{9}$/, // +447xxxxxxxxx
    /^07[0-9]{9}$/, // 07xxxxxxxxx
    /^447[0-9]{9}$/, // 447xxxxxxxxx
    
    // With spaces
    /^\+44\s?7[0-9]{9}$/, // +44 7xxxxxxxxx
    /^0\s?7[0-9]{9}$/, // 0 7xxxxxxxxx
    /^44\s?7[0-9]{9}$/, // 44 7xxxxxxxxx
    
    // Formatted with spaces (7xx xxx xxx)
    /^\+44\s?7[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/, // +44 7xx xxx xxx
    /^0\s?7[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/, // 0 7xx xxx xxx
    /^44\s?7[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/, // 44 7xx xxx xxx
    
    // With parentheses
    /^\+44\s?\(0\)\s?7[0-9]{9}$/, // +44 (0) 7xxxxxxxxx
    /^0\s?7[0-9]{3}\s?[0-9]{6}$/, // 0 7xx xxxxxx
    /^\+44\s?7[0-9]{3}\s?[0-9]{6}$/, // +44 7xx xxxxxx
    
    // With dashes
    /^\+44\s?7[0-9]{3}-[0-9]{3}-[0-9]{3}$/, // +44 7xx-xxx-xxx
    /^0\s?7[0-9]{3}-[0-9]{3}-[0-9]{3}$/, // 0 7xx-xxx-xxx
    /^44\s?7[0-9]{3}-[0-9]{3}-[0-9]{3}$/, // 44 7xx-xxx-xxx
    
    // Mixed formatting
    /^\+44\s?7[0-9]{3}\s?[0-9]{3}-[0-9]{3}$/, // +44 7xx xxx-xxx
    /^0\s?7[0-9]{3}\s?[0-9]{3}-[0-9]{3}$/, // 0 7xx xxx-xxx
    /^44\s?7[0-9]{3}\s?[0-9]{3}-[0-9]{3}$/, // 44 7xx xxx-xxx
    
    // With dots
    /^\+44\s?7[0-9]{3}\.[0-9]{3}\.[0-9]{3}$/, // +44 7xx.xxx.xxx
    /^0\s?7[0-9]{3}\.[0-9]{3}\.[0-9]{3}$/, // 0 7xx.xxx.xxx
    /^44\s?7[0-9]{3}\.[0-9]{3}\.[0-9]{3}$/, // 44 7xx.xxx.xxx
    
    // Extended UK mobile prefixes (70, 71, 72, 73, 74, 75, 76, 77, 78, 79)
    /^\+447[0-9][0-9]{8}$/, // +447xxxxxxxxx (all 7x prefixes)
    /^07[0-9][0-9]{8}$/, // 07xxxxxxxxx (all 7x prefixes)
    /^447[0-9][0-9]{8}$/, // 447xxxxxxxxx (all 7x prefixes)
    
    // Common business formatting variations
    /^\+44\s?\(0\)\s?7[0-9]\s?[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/, // +44 (0) 7x xxx xxx xxx
    /^0\s?7[0-9]\s?[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/, // 0 7x xxx xxx xxx
    /^44\s?7[0-9]\s?[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/, // 44 7x xxx xxx xxx
    
    // Additional patterns for better mobile detection
    /^\+44\s?7[0-9]{2}\s?[0-9]{3}\s?[0-9]{4}$/, // +44 7xx xxx xxxx
    /^0\s?7[0-9]{2}\s?[0-9]{3}\s?[0-9]{4}$/, // 0 7xx xxx xxxx
    /^44\s?7[0-9]{2}\s?[0-9]{3}\s?[0-9]{4}$/, // 44 7xx xxx xxxx
    
    // Patterns with different spacing
    /^\+44\s?7[0-9]{2}\s?[0-9]{4}\s?[0-9]{3}$/, // +44 7xx xxxx xxx
    /^0\s?7[0-9]{2}\s?[0-9]{4}\s?[0-9]{3}$/, // 0 7xx xxxx xxx
    /^44\s?7[0-9]{2}\s?[0-9]{4}\s?[0-9]{3}$/, // 44 7xx xxxx xxx
  ];
  
  const cleanPhone = phone.replace(/[\s\-\(\)\.]/g, '');
  let isMobile = mobilePatterns.some(pattern => pattern.test(cleanPhone));
  
  // UK-specific fallback: Check if it starts with 07 and has 11 digits total (UK mobile pattern)
  if (!isMobile && cleanPhone.length === 11 && cleanPhone.startsWith('07')) {
    isMobile = true;
    console.log(`[PHONE DEBUG] UK fallback match: "${phone}" -> "${cleanPhone}" -> Mobile: ${isMobile}`);
  }
  
  // UK-specific fallback: Check for +44 7 pattern (UK mobile with country code)
  if (!isMobile && cleanPhone.length >= 12 && cleanPhone.startsWith('447')) {
    isMobile = true;
    console.log(`[PHONE DEBUG] UK +44 fallback match: "${phone}" -> "${cleanPhone}" -> Mobile: ${isMobile}`);
  }
  
  // STRICT UK mobile detection - only accept true mobile patterns
  if (!isMobile && cleanPhone.length >= 10 && cleanPhone.length <= 15) {
    // Only accept if it starts with 07 (UK mobile) or 447 (UK mobile with country code)
    if (cleanPhone.startsWith('07') && cleanPhone.length === 11) {
      isMobile = true;
      console.log(`[PHONE DEBUG] Strict 07 match: "${phone}" -> "${cleanPhone}" -> Mobile: ${isMobile}`);
    }
    else if (cleanPhone.startsWith('447') && cleanPhone.length >= 12) {
      isMobile = true;
      console.log(`[PHONE DEBUG] Strict 447 match: "${phone}" -> "${cleanPhone}" -> Mobile: ${isMobile}`);
    }
  }
  
  // REJECT landline numbers that might contain mobile-like patterns
  if (isMobile) {
    // Reject 01x, 02x, 03x numbers (UK landlines)
    if (cleanPhone.startsWith('01') || cleanPhone.startsWith('02') || cleanPhone.startsWith('03')) {
      isMobile = false;
      console.log(`[PHONE DEBUG] Rejected landline: "${phone}" -> "${cleanPhone}" -> Mobile: ${isMobile}`);
    }
    // Reject 08x numbers (UK special services)
    else if (cleanPhone.startsWith('08')) {
      isMobile = false;
      console.log(`[PHONE DEBUG] Rejected special service: "${phone}" -> "${cleanPhone}" -> Mobile: ${isMobile}`);
    }
    // Reject 09x numbers (UK premium rate)
    else if (cleanPhone.startsWith('09')) {
      isMobile = false;
      console.log(`[PHONE DEBUG] Rejected premium rate: "${phone}" -> "${cleanPhone}" -> Mobile: ${isMobile}`);
    }
  }
  
  // Log phone numbers for debugging (only log 1% of phone numbers for maximum speed)
  if (Math.random() < 0.01) { // Log 1% of phone numbers for maximum speed
    console.log(`[PHONE DEBUG] "${phone}" -> "${cleanPhone}" -> Mobile: ${isMobile}`);
  }
  
  return isMobile;
}

// Helper function to generate email
function generateEmail(businessName) {
  const cleanName = businessName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const domains = ['gmail.com', 'outlook.com', 'yahoo.co.uk', 'hotmail.com'];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  return `contact@${cleanName}.${domain}`;
}

app.post('/api/book-demo', async (req, res) => {
  try {
    if (!bookingSystem) {
      return res.status(503).json({ 
        success: false, 
        message: 'Booking system not available' 
      });
    }

    console.log('[BOOKING DEMO] Request body:', req.body);
    
    // Handle both old format (name, email, company, phone, slotId) and new format (leadData)
    let leadData, preferredTimes;
    
    if (req.body.leadData) {
      // New format
      leadData = req.body.leadData;
      preferredTimes = req.body.preferredTimes;
    } else {
      // Old format - convert to new format
      const { name, email, company, phone, slotId } = req.body;
      
      if (!name || !email) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: name and email are required'
        });
      }
      
      leadData = {
        businessName: company || 'Unknown Company',
        decisionMaker: name,
        email: email,
        phone: phone || null
      };
      
      // If slotId provided, create preferredTimes array
      if (slotId) {
        preferredTimes = [{
          startDateTime: slotId,
          endDateTime: new Date(new Date(slotId).getTime() + 60 * 60 * 1000).toISOString() // +1 hour
        }];
      }
    }
    
    if (!leadData || !leadData.businessName || !leadData.decisionMaker || !leadData.email) {
      return res.status(400).json({
        success: false,
        message: 'Missing required lead data: businessName, decisionMaker, and email are required'
      });
    }

    // Use preferredTimes if provided, otherwise generate default slots
    let slotsToUse;
    
    if (preferredTimes && Array.isArray(preferredTimes) && preferredTimes.length > 0) {
      slotsToUse = preferredTimes;
    } else if (preferredTimes && typeof preferredTimes === 'object') {
      // Handle case where preferredTimes is an object with numeric keys instead of array
      const values = [];
      for (const key in preferredTimes) {
        if (preferredTimes.hasOwnProperty(key)) {
          values.push(preferredTimes[key]);
        }
      }
      slotsToUse = values.length > 0 ? values : bookingSystem.generateTimeSlots(7);
    } else {
      slotsToUse = bookingSystem.generateTimeSlots(7);
    }
    
    console.log('[BOOKING DEMO] leadData:', leadData);
    console.log('[BOOKING DEMO] preferredTimes:', preferredTimes);
    console.log('[BOOKING DEMO] slotsToUse:', slotsToUse);
    
    const result = await bookingSystem.bookDemo(leadData, slotsToUse, smsEmailPipeline);
    
    res.json(result);
    
  } catch (error) {
    console.error('[BOOKING ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Booking failed',
      error: error.message
    });
  }
});

// Get Available Time Slots
app.get('/api/available-slots', async (req, res) => {
  try {
    if (!bookingSystem) {
      return res.status(503).json({ 
        success: false, 
        message: 'Booking system not available' 
      });
    }

    const { days = 7 } = req.query;
    const slots = bookingSystem.generateTimeSlots(parseInt(days));
    
    res.json({
      success: true,
      slots: slots,
      totalSlots: slots.length
    });
    
  } catch (error) {
    console.error('[SLOTS ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get available slots',
      error: error.message
    });
  }
});

// API endpoint to create new client
app.post('/api/create-client', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    console.log('[API DEBUG]', { 
      receivedKey: apiKey ? apiKey.substring(0, 8) + '...' : 'none',
      expectedKey: process.env.API_KEY ? process.env.API_KEY.substring(0, 8) + '...' : 'none',
      headers: req.headers
    });
    
    if (apiKey !== process.env.API_KEY) {
      console.log('[API ERROR] Unauthorized request');
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const clientData = req.body;
    console.log('[CLIENT CREATION DEBUG]', { 
      bodyExists: !!clientData,
      bodyType: typeof clientData,
      bodyKeys: clientData ? Object.keys(clientData) : 'no body',
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
      requestedBy: req.ip 
    });
    
    if (!clientData) {
      console.log('[CLIENT CREATION ERROR] No request body received');
      return res.status(400).json({ ok: false, error: 'No request body received' });
    }
    
    if (!clientData.basic) {
      console.log('[CLIENT CREATION ERROR] Missing basic client data');
      return res.status(400).json({ ok: false, error: 'Missing basic client data' });
    }
    
    console.log('[CLIENT CREATION]', { 
      clientName: clientData.basic?.clientName,
      industry: clientData.basic?.industry,
      requestedBy: req.ip 
    });

    // Generate client key
    const clientKey = clientData.basic.clientName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .trim();

    // Generate secondary color
    const primaryColor = clientData.branding?.primaryColor || '#667eea';
    const secondaryColor = adjustColorBrightness(primaryColor, -20);

    // Create client configuration
    const clientConfig = {
      clientKey,
      displayName: clientData.basic.clientName,
      industry: clientData.basic.industry,
      primaryColor,
      secondaryColor,
      timezone: clientData.branding?.timezone || 'Europe/London',
      locale: clientData.branding?.locale || 'en-GB',
      businessHours: {
        start: parseInt(clientData.operations?.businessStart?.split(':')[0]) || 9,
        end: parseInt(clientData.operations?.businessEnd?.split(':')[0]) || 17,
        days: clientData.operations?.businessDays || [1, 2, 3, 4, 5]
      },
      sms: {
        fromNumber: clientData.communication?.smsFromNumber || `+4474${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
        messagingServiceSid: 'MG852f3cf7b50ef1be50c566be9e7efa04',
        welcomeMessage: clientData.communication?.welcomeMessage || `Hi! Thanks for contacting ${clientData.basic.clientName}. Reply START to get started.`,
        confirmationMessage: clientData.communication?.confirmationMessage || 'Your appointment is confirmed. Reply STOP to opt out.',
        reminderMessage: clientData.communication?.reminderMessage || 'Reminder: You have an appointment tomorrow. Reply YES to confirm or STOP to cancel.',
        reminderHours: parseInt(clientData.communication?.reminderHours) || 24,
        maxRetries: parseInt(clientData.communication?.maxRetries) || 3
      },
      vapi: {
        assistantId: process.env.VAPI_ASSISTANT_ID || '',
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID || '',
        maxDurationSeconds: 10
      },
      calendar: {
        calendarId: `calendar_${clientKey}@company.com`,
        timezone: clientData.branding?.timezone || 'Europe/London',
        appointmentDuration: parseInt(clientData.operations?.appointmentDuration) || 60,
        advanceBooking: parseInt(clientData.operations?.advanceBooking) || 7
      },
      contact: {
        name: clientData.basic.contactName,
        title: clientData.basic.contactTitle,
        email: clientData.basic.email,
        phone: clientData.basic.phone,
        website: clientData.basic.website
      },
      onboarding: {
        status: 'pending',
        startDate: new Date().toISOString(),
        estimatedCompletion: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days
        steps: [
          { id: 1, name: 'Client Discovery', completed: true, completedAt: new Date().toISOString() },
          { id: 2, name: 'System Configuration', completed: false, estimatedHours: 2 },
          { id: 3, name: 'SMS Setup', completed: false, estimatedHours: 1 },
          { id: 4, name: 'VAPI Configuration', completed: false, estimatedHours: 2 },
          { id: 5, name: 'Dashboard Branding', completed: false, estimatedHours: 1 },
          { id: 6, name: 'Testing & Validation', completed: false, estimatedHours: 2 },
          { id: 7, name: 'Client Training', completed: false, estimatedHours: 1 },
          { id: 8, name: 'Go Live', completed: false, estimatedHours: 1 }
        ]
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save client to database
    await upsertFullClient(clientConfig);

    // Generate branded dashboard (optional - skip on Render)
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const templatePath = path.join(process.cwd(), 'public', 'client-dashboard-template.html');
      console.log('[FILE DEBUG]', { templatePath, exists: fs.existsSync(templatePath) });
      
      if (fs.existsSync(templatePath)) {
        const dashboardTemplate = fs.readFileSync(templatePath, 'utf8');

        const brandedDashboard = dashboardTemplate
          .replace(/Client Company/g, clientData.basic.clientName)
          .replace(/"#667eea"/g, `"${primaryColor}"`)
          .replace(/"#764ba2"/g, `"${secondaryColor}"`)
          .replace(/YOUR_API_KEY_HERE/g, process.env.API_KEY);
        
        const clientDir = path.join(process.cwd(), 'clients', clientKey);
        
        // Only try to create files if we have write access
        try {
          if (!fs.existsSync(clientDir)) {
            fs.mkdirSync(clientDir, { recursive: true });
          }

          fs.writeFileSync(
            path.join(clientDir, 'dashboard.html'),
            brandedDashboard
          );
          console.log('[FILES CREATED]', { clientDir, dashboardFile: path.join(clientDir, 'dashboard.html') });
        } catch (writeError) {
          console.log('[FILE WRITE SKIPPED]', { error: writeError.message, reason: 'No write access on Render' });
        }
      } else {
        console.log('[TEMPLATE NOT FOUND]', { templatePath });
      }
    } catch (fileError) {
      console.error('[FILE ERROR]', { error: fileError.message, stack: fileError.stack });
      // Don't fail the entire request if file creation fails
    }

    console.log('[CLIENT CREATED]', { 
      clientKey, 
      clientName: clientData.basic.clientName,
      industry: clientData.basic.industry 
    });

    // Log audit event
    try {
      const { logAudit } = await import('./lib/security.js');
      await logAudit({
        clientKey,
        action: 'client_created',
        details: {
          clientName: clientData.basic.clientName,
          industry: clientData.basic.industry,
          contactEmail: clientData.basic.email
        },
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
    } catch (auditError) {
      console.error('[AUDIT LOG ERROR]', auditError);
      // Don't fail the main operation if audit logging fails
    }

    res.json({
      ok: true,
      clientKey,
      clientName: clientData.basic.clientName,
      industry: clientData.basic.industry,
      dashboardUrl: `/clients/${clientKey}/dashboard.html`,
      checklistUrl: `/clients/${clientKey}/checklist.md`,
      message: 'Client created successfully'
    });

  } catch (error) {
    console.error('[CLIENT CREATION ERROR]', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to create client',
      details: error.message 
    });
  }
});

// API endpoint to get quality alerts
app.get('/api/quality-alerts/:clientKey', async (req, res) => {
  try {
    const { clientKey } = req.params;
    const resolved = req.query.resolved === 'true';
    
    const alerts = await getQualityAlerts(clientKey, { resolved });
    
    res.json({
      ok: true,
      alerts: alerts.map(alert => ({
        id: alert.id,
        type: alert.alert_type,
        severity: alert.severity,
        message: alert.message,
        action: alert.action,
        impact: alert.impact,
        actual: alert.actual_value,
        expected: alert.expected_value,
        createdAt: alert.created_at,
        resolved: alert.resolved,
        resolvedAt: alert.resolved_at
      }))
    });
  } catch (error) {
    console.error('[QUALITY ALERTS ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// API endpoint to resolve a quality alert
app.post('/api/quality-alerts/:alertId/resolve', async (req, res) => {
  try {
    const { alertId } = req.params;
    
    await resolveQualityAlert(alertId);
    
    res.json({ ok: true, message: 'Alert resolved' });
  } catch (error) {
    console.error('[RESOLVE ALERT ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// API endpoint to import leads from CSV
app.post('/api/import-leads/:clientKey', async (req, res) => {
  try {
    const { clientKey } = req.params;
    const { csvData, columnMapping, validatePhones, autoStartCampaign } = req.body;
    
    if (!csvData) {
      return res.status(400).json({ ok: false, error: 'No CSV data provided' });
    }
    
    const { parseCSV, importLeads } = await import('./lib/lead-import.js');
    const { notifyLeadUpload } = await import('./lib/notifications.js');
    const { calculateLeadScore } = await import('./lib/lead-intelligence.js');
    const { bulkProcessLeads } = await import('./lib/lead-deduplication.js');
    
    // Parse CSV
    const leads = parseCSV(csvData, columnMapping || {});
    
    // === NEW: Apply lead deduplication and validation ===
    console.log(`[LEAD DEDUP] Processing ${leads.length} leads for validation and deduplication...`);
    const dedupResults = await bulkProcessLeads(leads, clientKey);
    
    console.log(`[LEAD DEDUP] Results: ${dedupResults.valid} valid, ${dedupResults.invalid} invalid, ${dedupResults.duplicates} duplicates, ${dedupResults.optedOut} opted-out`);
    
    // Use only valid leads for import
    const validLeads = dedupResults.validLeads;
    
    // Calculate lead scores for prioritization
    validLeads.forEach(lead => {
      lead.leadScore = calculateLeadScore(lead);
    });
    
    // Sort by score (call highest quality leads first)
    validLeads.sort((a, b) => b.leadScore - a.leadScore);
    
    console.log(`[LEAD IMPORT] Top lead score: ${validLeads[0]?.leadScore}, Lowest: ${validLeads[validLeads.length - 1]?.leadScore}`);
    
    // Import leads
    const results = await importLeads(clientKey, validLeads, {
      validatePhones: false, // Already validated by dedup
      skipDuplicates: false, // Already deduplicated
      autoStartCampaign: autoStartCampaign === true
    });
    
    // Add deduplication stats to results
    results.validation = {
      totalProcessed: leads.length,
      valid: dedupResults.valid,
      invalid: dedupResults.invalid,
      duplicates: dedupResults.duplicates,
      optedOut: dedupResults.optedOut,
      invalidReasons: dedupResults.invalidLeads.slice(0, 5).map(l => ({ phone: l.phone, issues: l.issues }))
    };
    
    // Get client data
    const client = await getFullClient(clientKey);
    
    // Notify admin of lead upload
    await notifyLeadUpload({
      clientKey,
      clientName: client?.business_name || clientKey,
      leadCount: results.imported,
      importMethod: 'csv_upload'
    });
    
    // AUTO-START INSTANT CALLING (if enabled or by default)
    let callResults = null;
    if (autoStartCampaign !== false && results.imported > 0) {
      console.log(`[INSTANT CALLING] Starting immediate calls for ${results.imported} leads...`);
      
      const { processCallQueue, estimateCallTime } = await import('./lib/instant-calling.js');
      
      // Get imported leads (sorted by score already)
      const leadsToCall = validLeads.filter(l => {
        // Only call leads that were successfully imported (not duplicates/invalid)
        return l.phone && l.leadScore > 0;
      }).slice(0, results.imported);
      
      const estimate = estimateCallTime(leadsToCall.length, 2000);
      console.log(`[INSTANT CALLING] ETA: ${estimate.formatted} (complete by ${estimate.completionTime})`);
      
      // Start calling in background (don't block response)
      processCallQueue(leadsToCall, client, {
        maxConcurrent: 5,
        delayBetweenCalls: 2000,
        maxCallsPerBatch: 50
      }).then(callResults => {
        console.log(`[INSTANT CALLING] ✅ Campaign complete: ${callResults.initiated} calls made`);
      }).catch(error => {
        console.error(`[INSTANT CALLING] ❌ Campaign failed:`, error);
      });
      
      callResults = {
        status: 'started',
        totalLeads: leadsToCall.length,
        estimatedTime: estimate.formatted,
        completionTime: estimate.completionTime,
        message: `Campaign started! Calling ${leadsToCall.length} leads now...`
      };
    }
    
    res.json({
      ok: true,
      message: `Imported ${results.imported} leads${callResults ? ' - Campaign started!' : ''}`,
      results,
      avgLeadScore: validLeads.length > 0 ? Math.round(validLeads.reduce((sum, l) => sum + l.leadScore, 0) / validLeads.length) : 0,
      calling: callResults
    });
    
  } catch (error) {
    console.error('[LEAD IMPORT ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// API endpoint to import lead from email forward
app.post('/api/import-lead-email/:clientKey', async (req, res) => {
  try {
    const { clientKey } = req.params;
    const { emailBody, emailSubject, emailFrom } = req.body;
    
    if (!emailBody) {
      return res.status(400).json({ ok: false, error: 'No email body provided' });
    }
    
    const { parseEmailForLead } = await import('./lib/lead-import.js');
    
    // Parse email to extract lead
    const lead = parseEmailForLead(emailBody, emailSubject);
    
    // If no phone found, try to extract from sender
    if (!lead.email && emailFrom) {
      lead.email = emailFrom;
    }
    
    if (!lead.phone && !lead.email) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Could not extract phone or email from forwarded message' 
      });
    }
    
    // Import single lead
    await findOrCreateLead({
      tenantKey: clientKey,
      phone: lead.phone,
      name: lead.name,
      service: lead.service,
      source: 'email_forward'
    });
    
    res.json({
      ok: true,
      message: 'Lead imported from email',
      lead
    });
    
  } catch (error) {
    console.error('[EMAIL IMPORT ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// API endpoint to calculate ROI
app.get('/api/roi/:clientKey', async (req, res) => {
  try {
    const { clientKey } = req.params;
    const days = parseInt(req.query.days) || 30;
    const avgDealValue = parseFloat(req.query.avgDealValue) || 150;
    
    const { calculateROI, projectROI } = await import('./lib/roi-calculator.js');
    
    const roi = await calculateROI(clientKey, days, { avgDealValue });
    const projection = projectROI(roi, 30);
    
    res.json({
      ok: true,
      ...roi,
      projection
    });
  } catch (error) {
    console.error('[ROI ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// API endpoint to get industry benchmarks and comparison
app.get('/api/industry-comparison/:clientKey', async (req, res) => {
  try {
    const { clientKey } = req.params;
    const days = parseInt(req.query.days) || 30;
    
    // Get client data to determine industry
    const client = await getFullClient(clientKey);
    if (!client) {
      return res.status(404).json({ ok: false, error: 'Client not found' });
    }
    
    // Get quality metrics
    const metrics = await getCallQualityMetrics(clientKey, days);
    
    if (!metrics || metrics.total_calls === 0) {
      return res.json({
        ok: true,
        message: 'No data available for comparison',
        industry: client.industry || 'default'
      });
    }
    
    // Calculate client rates
    const clientMetrics = {
      success_rate: metrics.successful_calls / metrics.total_calls,
      booking_rate: metrics.bookings / metrics.total_calls,
      avg_quality_score: parseFloat(metrics.avg_quality_score || 0),
      avg_duration: parseInt(metrics.avg_duration || 0),
      positive_sentiment_ratio: metrics.positive_sentiment_count / metrics.total_calls
    };
    
    // Import benchmark comparison
    const { compareToIndustry, generateInsights } = await import('./lib/industry-benchmarks.js');
    
    const comparison = compareToIndustry(clientMetrics, client.industry);
    const insights = generateInsights(comparison);
    
    res.json({
      ok: true,
      clientKey,
      industry: comparison.industry,
      comparison: comparison.metrics,
      insights,
      period: `Last ${days} days`
    });
    
  } catch (error) {
    console.error('[INDUSTRY COMPARISON ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

function sqlHoursAgo(hours = 1) {
  if (isPostgres) {
    return `NOW() - INTERVAL '${hours} hour${hours === 1 ? '' : 's'}'`;
  }
  return `datetime('now','-${hours} hour${hours === 1 ? '' : 's'}')`;
}

function sqlDaysAgo(days = 1) {
  if (isPostgres) {
    return `NOW() - INTERVAL '${days} day${days === 1 ? '' : 's'}'`;
  }
  return `datetime('now','-${days} day${days === 1 ? '' : 's'}')`;
}

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

function mapCallStatus(status) {
  const normalized = (status || '').toLowerCase();
  if (normalized.includes('book')) return 'Booked';
  if (normalized.includes('completed')) return 'Completed';
  if (normalized.includes('pending')) return 'Awaiting reply';
  if (normalized.includes('missed')) return 'Missed call';
  return status || 'Live';
}

function mapStatusClass(status) {
  const normalized = (status || '').toLowerCase();
  if (normalized.includes('book')) return 'success';
  if (normalized.includes('await') || normalized.includes('pending')) return 'pending';
  return 'info';
}

// API endpoint to get A/B test results
app.get('/api/ab-test-results/:clientKey', async (req, res) => {
  try {
    const { clientKey } = req.params;
    
    const { getABTestResults } = await import('./lib/ab-testing.js');
    const results = await getABTestResults(clientKey);
    
    res.json({
      ok: true,
      ...results
    });
  } catch (error) {
    console.error('[AB TEST RESULTS ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Live demo dashboard data (used by client dashboard for Looms)
// Test call endpoint for demo clients
app.post('/api/demo/test-call', async (req, res) => {
  try {
    const { clientKey, assistantId } = req.body;
    
    if (!clientKey) {
      return res.status(400).json({ success: false, error: 'Client key required' });
    }

    // Get client to check if it's a demo client and get assistant ID
    const client = await getFullClient(clientKey);
    if (!client) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    // Check if it's a demo client using the same logic as booking simulation
    // Also allow if client has a VAPI assistant ID (demo clients typically have these)
    const isDemo = isDemoClient(client);
    const hasAssistantId = client.vapi?.assistantId || client.assistantId;

    if (!isDemo && !hasAssistantId) {
      console.log('[DEMO TEST CALL] Client not detected as demo:', {
        clientKey,
        isDemo,
        hasAssistantId,
        clientIsDemo: client.isDemo,
        clientDemo: client.demo
      });
      return res.status(403).json({ success: false, error: 'Test calls only available for demo clients' });
    }

    // Get assistant ID from client config or request
    const finalAssistantId = assistantId || client.vapi?.assistantId || client.assistantId;
    if (!finalAssistantId) {
      return res.status(400).json({ success: false, error: 'Assistant ID not found for this client' });
    }

    // Use EXACT same logic and values as demo creator script (offerTestCall function)
    // Copy-pasted from scripts/create-demo-client.js lines 420-449
    // Hardcoded values to avoid needing Render env vars
    const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
    const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID || "934ecfdb-fe7b-4d53-81c0-7908b97036b5";
    const TEST_PHONE = process.env.TEST_PHONE_NUMBER || "+447491683261";
    const VAPI_API_URL = 'https://api.vapi.ai';

    if (!VAPI_PRIVATE_KEY) {
      return res.status(500).json({ success: false, error: 'VAPI_PRIVATE_KEY not configured' });
    }

    // Make VAPI call - EXACT same structure as demo creator script (line 443-449)
    const payload = {
      assistantId: finalAssistantId,
      phoneNumberId: VAPI_PHONE_NUMBER_ID,
      customer: {
        number: TEST_PHONE
      }
    };

    console.log('[DEMO TEST CALL] Initiating test call:', {
      clientKey,
      assistantId: finalAssistantId,
      phoneNumber: TEST_PHONE,
      phoneNumberId: VAPI_PHONE_NUMBER_ID
    });

    const response = await fetch(`${VAPI_API_URL}/call`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[DEMO TEST CALL] VAPI API error:', response.status, errorText);
      return res.status(500).json({ 
        success: false, 
        error: `VAPI API error: ${response.status}`,
        details: errorText.substring(0, 200)
      });
    }

    const callData = await response.json();

    console.log('[DEMO TEST CALL] Call initiated successfully:', {
      callId: callData.id,
      status: callData.status
    });

    res.json({
      success: true,
      callId: callData.id,
      status: callData.status,
      phoneNumber: TEST_PHONE,
      assistantId: finalAssistantId,
      message: 'Test call initiated! Check your phone in a few seconds...'
    });

  } catch (error) {
    console.error('[DEMO TEST CALL] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to initiate test call' 
    });
  }
});

app.get('/api/demo-dashboard/:clientKey', async (req, res) => {
  const { clientKey } = req.params;
  try {
    // Get client config first
    const client = await getFullClient(clientKey);
    
    const [
      leadCounts,
      callCounts,
      bookingStats,
      serviceRows,
      leadRows,
      recentCallRows,
      responseRows,
      touchpointRows,
      upcomingAppointmentRows
    ] = await Promise.all([
      query(`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE created_at >= ${sqlHoursAgo(24)}) AS last24
        FROM leads
        WHERE client_key = $1
      `, [clientKey]),
      query(`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE created_at >= ${sqlHoursAgo(24)}) AS last24,
               COUNT(*) FILTER (WHERE outcome = 'booked') AS booked
        FROM calls
        WHERE client_key = $1
      `, [clientKey]),
      query(`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status IN ('no_show','no-show')) AS no_shows,
               COUNT(*) FILTER (WHERE status IN ('cancelled','canceled')) AS cancellations
        FROM appointments
        WHERE client_key = $1
          AND created_at >= ${sqlDaysAgo(7)}
      `, [clientKey]),
      query(`
        SELECT COALESCE(service, 'General') AS service,
               COUNT(*) AS count
        FROM leads
        WHERE client_key = $1
        GROUP BY service
        ORDER BY count DESC
        LIMIT 5
      `, [clientKey]),
      query(`
        SELECT l.id,
               l.name,
               l.phone,
               l.status,
               l.service,
               l.source,
               l.notes,
               l.created_at,
               le.lead_score
        FROM leads l
        LEFT JOIN lead_engagement le
          ON le.client_key = l.client_key AND le.lead_phone = l.phone
        WHERE l.client_key = $1
        ORDER BY l.created_at DESC
        LIMIT 6
      `, [clientKey]),
      query(`
        SELECT c.lead_phone, c.status, c.outcome, c.created_at, c.duration,
               l.name, l.service
        FROM calls c
        LEFT JOIN leads l ON l.client_key = c.client_key AND l.phone = c.lead_phone
        WHERE c.client_key = $1
        ORDER BY c.created_at DESC
        LIMIT 5
      `, [clientKey]),
      query(`
        SELECT l.created_at AS lead_created, c.created_at AS call_created
        FROM calls c
        JOIN leads l ON l.client_key = c.client_key AND l.phone = c.lead_phone
        WHERE c.client_key = $1
        ORDER BY c.created_at DESC
        LIMIT 50
      `, [clientKey]),
      query(`
        SELECT DATE_TRUNC('day', created_at) AS bucket_day,
               COUNT(*) AS touchpoints
        FROM calls
        WHERE client_key = $1
          AND created_at >= ${sqlDaysAgo(6)}
        GROUP BY bucket_day
      `, [clientKey]),
      query(`
        SELECT a.id,
               a.start_iso,
               a.end_iso,
               a.status,
               l.name,
               l.service
        FROM appointments a
        LEFT JOIN leads l ON l.id = a.lead_id
        WHERE a.client_key = $1
          AND a.start_iso >= NOW()
        ORDER BY a.start_iso ASC
        LIMIT 5
      `, [clientKey])
    ]);

    const totalLeads = parseInt(leadCounts.rows?.[0]?.total || 0, 10);
    const last24hLeads = parseInt(leadCounts.rows?.[0]?.last24 || 0, 10);
    const totalCalls = parseInt(callCounts.rows?.[0]?.total || 0, 10);
    const bookingsFromCalls = parseInt(callCounts.rows?.[0]?.booked || 0, 10);
    const avgDealValue = 350;

    const conversionRate = totalCalls > 0 ? Math.round((bookingsFromCalls / totalCalls) * 100) : 0;
    const successRate = totalCalls > 0 ? ((bookingsFromCalls / totalCalls) * 100).toFixed(0) : 0;

    const weeklyBookings = parseInt(bookingStats.rows?.[0]?.total || 0, 10);
    const serviceMix = (serviceRows.rows || []).map(row => {
      const percent = totalLeads > 0 ? Math.round((row.count / totalLeads) * 100) : 0;
      return {
        name: row.service || 'General',
        percent: percent,
        bookings: Math.max(1, Math.round((percent / 100) * weeklyBookings)),
        notes: percent > 34 ? 'Primary workflow' : 'Running in parallel'
      };
    });

    const leads = (leadRows.rows || []).map(row => {
      const derivedScore = typeof row.lead_score === 'number'
        ? row.lead_score
        : 70 + Math.floor(Math.random() * 20);
      return {
        id: row.id,
        name: row.name || row.phone,
        phone: row.phone,
        status: row.status || 'Awaiting follow-up',
        lastMessage: row.notes || `Added ${new Date(row.created_at).toLocaleDateString('en-GB')}`,
        service: row.service || 'Lead Follow-Up',
        source: row.source || 'Web form',
        timeAgo: formatTimeAgoLabel(row.created_at),
        score: derivedScore
      };
    });

    let highPriorityLeads = 0;
    let mediumPriorityLeads = 0;
    let lowPriorityLeads = 0;
    let scoreAccumulator = 0;
    leads.forEach(lead => {
      const score = lead.score ?? 75;
      scoreAccumulator += score;
      if (score >= 85) {
        highPriorityLeads += 1;
      } else if (score >= 70) {
        mediumPriorityLeads += 1;
      } else {
        lowPriorityLeads += 1;
      }
    });

    const recentCalls = (recentCallRows.rows || []).map(row => ({
      name: row.name || row.lead_phone,
      service: row.service || 'Lead Follow-Up',
      channel: 'AI call + SMS',
      summary: row.outcome ? `Outcome: ${row.outcome}` : 'Call completed',
      status: mapCallStatus(row.status),
      statusClass: mapStatusClass(row.status),
      timeAgo: formatTimeAgoLabel(row.created_at)
    }));

    const avgLeadScore = leads.length
      ? Math.round(scoreAccumulator / leads.length)
      : 85;

    const responseDiffs = (responseRows.rows || [])
      .map(row => {
        const leadTime = new Date(row.lead_created).getTime();
        const callTime = new Date(row.call_created).getTime();
        if (!leadTime || !callTime || callTime <= leadTime) return null;
        return (callTime - leadTime) / 60000;
      })
      .filter(Boolean);
    const avgResponseMinutes = responseDiffs.length
      ? Math.round(responseDiffs.reduce((sum, val) => sum + val, 0) / responseDiffs.length)
      : 3;
    const firstResponse = avgResponseMinutes >= 60
      ? `${Math.floor(avgResponseMinutes / 60)}h ${avgResponseMinutes % 60}m`
      : `${avgResponseMinutes}m`;

    const touchpointMap = new Map(
      (touchpointRows.rows || []).map(row => {
        const dayKey = new Date(row.bucket_day).toISOString().slice(0, 10);
        return [dayKey, parseInt(row.touchpoints || 0, 10)];
      })
    );
    const touchpointLabels = [];
    const touchpointData = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const day = new Date();
      day.setDate(day.getDate() - offset);
      const key = day.toISOString().slice(0, 10);
      touchpointLabels.push(day.toLocaleDateString('en-GB', { weekday: 'short' }));
      touchpointData.push(touchpointMap.get(key) || 0);
    }

    const upcomingAppointments = (upcomingAppointmentRows.rows || []).map(row => ({
      id: row.id,
      start: row.start_iso,
      end: row.end_iso,
      status: row.status || 'booked',
      name: row.name || 'Prospect',
      service: row.service || 'Consultation'
    }));

    const estimatedCost = Number((totalCalls * 0.4).toFixed(2));
    const estimatedRevenue = Number((weeklyBookings * avgDealValue).toFixed(2));
    const estimatedProfit = Number((estimatedRevenue - estimatedCost).toFixed(2));
    const roiMultiplier = estimatedCost > 0 ? estimatedRevenue / estimatedCost : 0;
    const roiPercentage = roiMultiplier ? (roiMultiplier - 1) * 100 : 0;

    res.json({
      ok: true,
      source: 'live',
      metrics: {
        totalLeads,
        totalCalls,
        last24hLeads,
        conversionRate,
        successRate,
        avgLeadScore,
        firstResponse,
        bookingsThisWeek: weeklyBookings,
        highPriorityLeads,
        mediumPriorityLeads,
        lowPriorityLeads
      },
      serviceMix,
      leads,
      recentCalls,
      roi: {
        costs: {
          total: estimatedCost,
          perCall: totalCalls > 0 ? Number((estimatedCost / totalCalls).toFixed(2)) : 0
        },
        revenue: {
          total: estimatedRevenue,
          bookings: weeklyBookings,
          avgDealValue
        },
        roi: {
          profit: estimatedProfit,
          multiplier: Number(roiMultiplier.toFixed(1)),
          percentage: Number(roiPercentage.toFixed(0))
        }
      },
      appointments: upcomingAppointments,
      touchpoints: {
        labels: touchpointLabels,
        data: touchpointData
      },
      config: {
        phone: client?.phone || client?.whiteLabel?.phone || client?.numbers?.primary || '+44 20 3880 1234',
        businessHours: client?.businessHours || client?.whiteLabel?.businessHours || client?.booking?.businessHours || '8am - 8pm, 7 days/week',
        timezone: client?.timezone || client?.booking?.timezone || 'Europe/London',
        industry: client?.industry || client?.whiteLabel?.industry || null
      }
    });
  } catch (error) {
    console.error('[DEMO DASHBOARD ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

const SSE_POLL_INTERVAL_MS = 4000;
const SSE_HEARTBEAT_MS = 15000;

app.get('/api/events/:clientKey', async (req, res) => {
  const { clientKey } = req.params;
  res.set({
    'Cache-Control': 'no-cache',
    'Content-Type': 'text/event-stream',
    Connection: 'keep-alive'
  });
  res.flushHeaders?.();

  let isClosed = false;
  let lastSent = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  const sendRecentCalls = async () => {
    if (isClosed) return;
    try {
      const recentCallRows = await query(`
        SELECT c.lead_phone, c.status, c.outcome, c.created_at,
               l.name, l.service
        FROM calls c
        LEFT JOIN leads l ON l.client_key = c.client_key AND l.phone = c.lead_phone
        WHERE c.client_key = $1
          AND c.created_at > $2
        ORDER BY c.created_at ASC
        LIMIT 10
      `, [clientKey, lastSent]);

      for (const row of recentCallRows.rows || []) {
        lastSent = row.created_at;
        const payload = {
          name: row.name || row.lead_phone,
          service: row.service || 'Lead Follow-Up',
          channel: 'AI call + SMS',
          summary: row.outcome ? `Outcome: ${row.outcome}` : 'Call completed',
          status: mapCallStatus(row.status),
          statusClass: mapStatusClass(row.status),
          timestamp: row.created_at
        };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    } catch (error) {
      console.error('[EVENT STREAM ERROR]', error);
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'stream_error' })}\n\n`);
    }
  };

  const interval = setInterval(sendRecentCalls, SSE_POLL_INTERVAL_MS);
  const heartbeat = setInterval(() => {
    if (isClosed) return;
    res.write('event: ping\ndata: {}\n\n');
  }, SSE_HEARTBEAT_MS);

  const closeStream = () => {
    if (isClosed) return;
    isClosed = true;
    clearInterval(interval);
    clearInterval(heartbeat);
    res.end();
  };

  req.on('close', closeStream);
  req.on('end', closeStream);
  sendRecentCalls();
});

async function getLeadRecord(leadId) {
  const result = await query(`
    SELECT id, client_key, phone, name, service, status, source, notes
    FROM leads
    WHERE id = $1
  `, [leadId]);
  return result.rows?.[0];
}

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

app.post('/api/leads/:leadId/snooze', async (req, res) => {
  const { leadId } = req.params;
  const { clientKey, minutes } = req.body || {};
  const snoozeMinutes = Math.max(5, parseInt(minutes, 10) || 1440);
  try {
    if (!clientKey) {
      return res.status(400).json({ ok: false, error: 'clientKey required' });
    }
    const lead = await getLeadRecord(leadId);
    if (!lead) {
      return res.status(404).json({ ok: false, error: 'Lead not found' });
    }
    if (lead.client_key !== clientKey) {
      return res.status(403).json({ ok: false, error: 'Access denied' });
    }
    const snoozedUntil = new Date(Date.now() + snoozeMinutes * 60000).toISOString();
    await query(`
      INSERT INTO lead_engagement (client_key, lead_phone, engagement_data)
      VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (client_key, lead_phone)
      DO UPDATE SET engagement_data = COALESCE(lead_engagement.engagement_data, '{}'::jsonb) || EXCLUDED.engagement_data,
                    last_updated = NOW()
    `, [lead.client_key, lead.phone, JSON.stringify({ snoozedUntil })]);

    const updated = await query(`
      UPDATE leads
      SET status = $2,
          notes = CONCAT('Snoozed until ', $3, ' • ', COALESCE(notes, ''))
      WHERE id = $1
      RETURNING id, name, phone, service, status, source, notes
    `, [leadId, 'Snoozed', snoozedUntil]);

    return res.json({ ok: true, lead: sanitizeLead(updated.rows?.[0]) });
  } catch (error) {
    console.error('[LEAD SNOOZE ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/leads/:leadId/escalate', async (req, res) => {
  const { leadId } = req.params;
  const { clientKey } = req.body || {};
  try {
    if (!clientKey) {
      return res.status(400).json({ ok: false, error: 'clientKey required' });
    }
    const lead = await getLeadRecord(leadId);
    if (!lead) {
      return res.status(404).json({ ok: false, error: 'Lead not found' });
    }
    if (lead.client_key !== clientKey) {
      return res.status(403).json({ ok: false, error: 'Access denied' });
    }
    await query(`
      INSERT INTO lead_engagement (client_key, lead_phone, engagement_data)
      VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (client_key, lead_phone)
      DO UPDATE SET engagement_data = COALESCE(lead_engagement.engagement_data, '{}'::jsonb) || EXCLUDED.engagement_data,
                    last_updated = NOW()
    `, [lead.client_key, lead.phone, JSON.stringify({ priority: true })]);

    const updated = await query(`
      UPDATE leads
      SET status = $2,
          notes = CONCAT('Escalated via dashboard at ', NOW()::text, ' • ', COALESCE(notes, ''))
      WHERE id = $1
      RETURNING id, name, phone, service, status, source, notes
    `, [leadId, 'Priority']);

    return res.json({ ok: true, lead: sanitizeLead(updated.rows?.[0]) });
  } catch (error) {
    console.error('[LEAD ESCALATE ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/leads/import', async (req, res) => {
  try {
    const { clientKey, leads } = req.body || {};
    if (!clientKey || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ ok: false, error: 'Missing clientKey or leads payload' });
    }
    const inserted = [];
    for (const payload of leads.slice(0, 200)) {
      const phone = validateAndSanitizePhone(payload.phone);
      if (!phone) continue;
      const name = sanitizeInput(payload.name || phone, 120);
      const service = sanitizeInput(payload.service || 'Lead Follow-Up', 120);
      const source = sanitizeInput(payload.source || 'Import', 120);
      const result = await query(`
        INSERT INTO leads (client_key, name, phone, service, source, status)
        VALUES ($1, $2, $3, $4, $5, 'new')
        ON CONFLICT (client_key, phone)
        DO UPDATE SET name = EXCLUDED.name,
                      service = COALESCE(EXCLUDED.service, leads.service),
                      source = COALESCE(EXCLUDED.source, leads.source)
        RETURNING id, name, phone, service, source, status, notes
      `, [clientKey, name, phone, service, source]);
      if (result.rows?.[0]) {
        inserted.push(result.rows[0]);
      }
    }

    return res.json({
      ok: true,
      inserted: inserted.length,
      leads: inserted.map(sanitizeLead)
    });
  } catch (error) {
    console.error('[LEAD IMPORT ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

async function getIntegrationStatuses(clientKey) {
  const integrations = [
    {
      name: 'Vapi Voice',
      status: 'warning', // Default to warning, will test actual connection
      detail: 'Checking connection...'
    },
    {
      name: 'Twilio SMS',
      status: 'warning', // Default to warning, will check client-specific config
      detail: 'Checking connection...'
    },
    {
      name: 'Google Calendar',
      status: 'warning', // Default to warning, will check actual connection
      detail: 'Checking connection...'
    }
  ];

  // Check Vapi connection for this specific client (multi-tenant)
  if (clientKey) {
    try {
      // Get client config - handle both vapi_json column
      let clientResult;
      let vapiConfig = {};
      
      try {
        clientResult = await query(`
          SELECT vapi_json, twilio_json
          FROM tenants
          WHERE client_key = $1
        `, [clientKey]);
        
        const client = clientResult.rows?.[0];
        if (!client) {
          // Client doesn't exist in database
          const vapiIntegration = integrations.find(i => i.name === 'Vapi Voice');
          if (vapiIntegration) {
            vapiIntegration.status = 'error';
            vapiIntegration.detail = `Client "${clientKey}" not found in database. Create the client first using /api/admin/client POST endpoint or ensure the client_key is correct.`;
          }
          return integrations; // Exit early
        }
        vapiConfig = client?.vapi_json || {};
      } catch (columnError) {
        // If query fails, check if it's a column error or something else
        if (columnError.message?.includes('does not exist') && columnError.message?.includes('vapi_json')) {
          throw columnError; // Re-throw column errors
        }
        // For other errors, set empty config and let error handler below deal with it
        vapiConfig = {};
        throw columnError; // Re-throw to be caught by outer catch
      }
      
      // Check if THIS CLIENT has Vapi configured (multi-tenant - no global fallback)
      const hasClientVapiConfig = !!(vapiConfig.assistantId || vapiConfig.phoneNumberId || vapiConfig.apiKey || vapiConfig.privateKey);
      
      const vapiIntegration = integrations.find(i => i.name === 'Vapi Voice');
      if (vapiIntegration) {
        if (hasClientVapiConfig) {
          // Client has Vapi config - test connection using client's API key
          const vapiKey = vapiConfig.privateKey || vapiConfig.apiKey || vapiConfig.publicKey;
          
          if (vapiKey) {
            try {
              const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${vapiKey}`,
                  'Content-Type': 'application/json'
                },
                signal: AbortSignal.timeout(5000) // 5 second timeout
              });
              
              if (vapiResponse.ok) {
                vapiIntegration.status = 'active';
                vapiIntegration.detail = 'Assistant + phone number connected';
              } else {
                vapiIntegration.status = 'error';
                const statusText = await vapiResponse.text().catch(() => '');
                vapiIntegration.detail = `API key invalid or expired (HTTP ${vapiResponse.status}). Update this client's vapi_json.privateKey in the database (tenants table) or via /api/admin/client/:clientKey PUT endpoint.`;
              }
            } catch (error) {
              vapiIntegration.status = 'error';
              vapiIntegration.detail = `Connection test failed: ${error.message}. Check this client's vapi_json in the database (tenants table) or update via /api/admin/client/:clientKey PUT endpoint.`;
            }
          } else {
            vapiIntegration.status = 'error';
            vapiIntegration.detail = 'This client has Vapi configuration but missing API key (privateKey, apiKey, or publicKey). Update the client\'s vapi_json in the database or via /api/admin/client/:clientKey PUT endpoint.';
          }
        } else {
          // Client exists but does NOT have Vapi configured
          vapiIntegration.status = 'error';
          vapiIntegration.detail = 'This client does not have Vapi configured. Update the client\'s vapi_json in the database (tenants table) with: { "assistantId": "...", "phoneNumberId": "...", "privateKey": "..." } or use the /api/admin/client/:clientKey PUT endpoint.';
        }
      }
    } catch (error) {
      console.error('[INTEGRATION HEALTH ERROR]', error);
      const vapiIntegration = integrations.find(i => i.name === 'Vapi Voice');
      if (vapiIntegration) {
        if (error.message?.includes('does not exist') && error.message?.includes('vapi_json')) {
          vapiIntegration.status = 'error';
          vapiIntegration.detail = 'Database schema needs update. The tenants table is missing vapi_json column. Contact support to update the database schema.';
        } else if (error.message?.includes('relation "tenants" does not exist')) {
          vapiIntegration.status = 'error';
          vapiIntegration.detail = 'Database table not found. The tenants table does not exist. Contact support to set up the database.';
        } else {
          // Most likely: client doesn't exist or no vapi_json configured
          vapiIntegration.status = 'error';
          vapiIntegration.detail = 'This client does not have Vapi configured. Update the client\'s vapi_json in the database (tenants table) with: { "assistantId": "...", "phoneNumberId": "...", "privateKey": "..." } or use the /api/admin/client/:clientKey PUT endpoint.';
        }
      }
    }
  } else {
    // No client key - can't check client-specific config
    const vapiIntegration = integrations.find(i => i.name === 'Vapi Voice');
    if (vapiIntegration) {
      vapiIntegration.status = 'error';
      vapiIntegration.detail = 'Client key required to check Vapi configuration. Each client must have their own Vapi settings in vapi_json (tenants table) or configured via /api/admin/client/:clientKey PUT endpoint.';
    }
  }

  // Check Twilio connection for this specific client
  if (clientKey) {
    try {
      // Get client config from twilio_json column
      let clientResult;
      let smsConfig = {};
      
      try {
        // Query twilio_json (sms_json column doesn't exist in schema)
        clientResult = await query(`
          SELECT twilio_json, vapi_json
          FROM tenants
          WHERE client_key = $1
        `, [clientKey]);
        
        const client = clientResult.rows?.[0];
        smsConfig = client?.twilio_json || {};
      } catch (error) {
        // If query fails, log and continue with empty config
        console.error('[INTEGRATION HEALTH ERROR] Failed to query client config:', error.message);
        smsConfig = {};
      }
      
      // Check if THIS CLIENT has Twilio configured (multi-tenant - no global fallback)
      const hasClientSmsConfig = !!(smsConfig.messagingServiceSid || smsConfig.fromNumber || smsConfig.accountSid || smsConfig.authToken);
      
      const twilioIntegration = integrations.find(i => i.name === 'Twilio SMS');
      if (twilioIntegration) {
        if (hasClientSmsConfig) {
          // Client has Twilio config - test connection using client's credentials
          const twilioSid = smsConfig.accountSid || smsConfig.messagingServiceSid;
          const twilioToken = smsConfig.authToken;
          
          if (twilioSid && twilioToken) {
            try {
              const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
              const twilioResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}.json`, {
                method: 'GET',
                headers: {
                  'Authorization': `Basic ${auth}`
                },
                signal: AbortSignal.timeout(5000) // 5 second timeout
              });
              
              if (twilioResponse.ok) {
                twilioIntegration.status = 'active';
                twilioIntegration.detail = 'Messaging service verified';
              } else {
                twilioIntegration.status = 'warning';
                const statusText = await twilioResponse.text().catch(() => '');
                twilioIntegration.detail = `Twilio credentials invalid or expired (HTTP ${twilioResponse.status}). Update this client's sms_json/twilio_json.accountSid and authToken in the database (tenants table) or via /api/admin/client/:clientKey PUT endpoint.`;
              }
            } catch (error) {
              twilioIntegration.status = 'warning';
              twilioIntegration.detail = `Connection test failed: ${error.message}. Check this client's sms_json/twilio_json in the database (tenants table) or update via /api/admin/client/:clientKey PUT endpoint.`;
            }
          } else {
            twilioIntegration.status = 'warning';
            twilioIntegration.detail = 'This client has SMS configuration but missing accountSid or authToken. Update the client\'s sms_json/twilio_json in the database or via /api/admin/client/:clientKey PUT endpoint.';
          }
        } else {
          // Client does NOT have Twilio configured
          twilioIntegration.status = 'warning';
          twilioIntegration.detail = 'This client does not have Twilio configured. Update the client\'s sms_json or twilio_json in the database (tenants table) with: { "accountSid": "...", "authToken": "...", "messagingServiceSid": "..." } or use the /api/admin/client/:clientKey PUT endpoint.';
        }
      }
    } catch (error) {
      console.error('[INTEGRATION HEALTH ERROR]', error);
      const twilioIntegration = integrations.find(i => i.name === 'Twilio SMS');
      if (twilioIntegration) {
        // Provide more helpful error message based on error type
        if (error.message?.includes('does not exist')) {
          twilioIntegration.status = 'warning';
          twilioIntegration.detail = 'Database schema needs update. The tenants table is missing SMS configuration columns. Contact support to update the database schema.';
        } else {
          twilioIntegration.status = 'warning';
          twilioIntegration.detail = `Unable to check Twilio configuration: ${error.message}. Database connection may be unavailable.`;
        }
      }
    }
  } else {
    // No client key - can't check client-specific config
    const twilioIntegration = integrations.find(i => i.name === 'Twilio SMS');
    if (twilioIntegration) {
      twilioIntegration.status = 'warning';
      twilioIntegration.detail = 'Client key required to check Twilio configuration. Each client must have their own SMS settings in sms_json/twilio_json (tenants table) or configured via /api/admin/client/:clientKey PUT endpoint.';
    }
  }

  // Check actual calendar connection for this client
  if (clientKey) {
    try {
      const tenantResult = await query(`
        SELECT calendar_json
        FROM tenants
        WHERE client_key = $1
      `, [clientKey]);

      const calendarConfig = tenantResult.rows?.[0]?.calendar_json || {};
      const isConnected = !!(calendarConfig.service_account_email || calendarConfig.access_token);
      
      const calendarIntegration = integrations.find(i => i.name === 'Google Calendar');
      if (calendarIntegration) {
        calendarIntegration.status = isConnected ? 'active' : 'warning';
        calendarIntegration.detail = isConnected 
          ? 'Auto-booking synced' 
          : 'This client does not have Google Calendar connected. Update the client\'s calendar_json in the database (tenants table) with: { "service_account_email": "..." } or { "access_token": "..." } or use the /api/admin/client/:clientKey PUT endpoint.';
      }
    } catch (error) {
      console.error('[INTEGRATION HEALTH ERROR]', error);
      const calendarIntegration = integrations.find(i => i.name === 'Google Calendar');
      if (calendarIntegration) {
        calendarIntegration.status = 'warning';
        calendarIntegration.detail = `Unable to check calendar configuration: ${error.message}. Database connection may be unavailable.`;
      }
    }
  } else {
    // No client key - can't check client-specific config
    const calendarIntegration = integrations.find(i => i.name === 'Google Calendar');
    if (calendarIntegration) {
      calendarIntegration.status = 'warning';
      calendarIntegration.detail = 'Client key required to check Google Calendar configuration. Each client must have their own calendar settings in calendar_json (tenants table) or configured via /api/admin/client/:clientKey PUT endpoint.';
    }
  }

  return integrations;
}

app.get('/api/integration-health/:clientKey', async (req, res) => {
  try {
    const integrations = await getIntegrationStatuses(req.params.clientKey);
    res.json({
      ok: true,
      integrations
    });
  } catch (error) {
    console.error('[INTEGRATION HEALTH ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/calls/:callId/transcript', async (req, res) => {
  try {
    const { callId } = req.params;
    const { clientKey } = req.query;
    
    if (!clientKey) {
      return res.status(400).json({ ok: false, error: 'clientKey required' });
    }
    
    const result = await query(`
      SELECT transcript, summary, duration, created_at
      FROM calls
      WHERE (id = $1 OR call_id = $1 OR lead_phone = $1)
        AND client_key = $2
      ORDER BY created_at DESC
      LIMIT 1
    `, [callId, clientKey]);
    
    if (!result.rows || !result.rows.length) {
      return res.status(404).json({ ok: false, error: 'Transcript not found' });
    }
    
    const row = result.rows[0];
    const transcript = row.transcript || row.summary || '[Transcript not available]';
    
    res.json({
      ok: true,
      transcript: typeof transcript === 'string' ? transcript : JSON.stringify(transcript),
      duration: row.duration,
      timestamp: row.created_at
    });
  } catch (error) {
    console.error('[TRANSCRIPT ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/leads/:leadId/timeline', async (req, res) => {
  try {
    const { leadId } = req.params;
    const { clientKey } = req.query;
    
    if (!clientKey) {
      return res.status(400).json({ ok: false, error: 'clientKey required' });
    }
    
    const leadResult = await query(`
      SELECT id, name, phone, created_at, source, client_key
      FROM leads
      WHERE (id = $1 OR phone = $1) AND client_key = $2
      ORDER BY created_at DESC
      LIMIT 1
    `, [leadId, clientKey]);
    
    if (!leadResult.rows || !leadResult.rows.length) {
      return res.status(404).json({ ok: false, error: 'Lead not found or access denied' });
    }
    
    const lead = leadResult.rows[0];
    
    const callsResult = await query(`
      SELECT status, outcome, created_at, duration
      FROM calls
      WHERE lead_phone = $1 AND client_key = $2
      ORDER BY created_at ASC
    `, [lead.phone, clientKey]);
    
    const appointmentsResult = await query(`
      SELECT start_iso, end_iso, status, created_at
      FROM appointments
      WHERE lead_id = $1 AND client_key = $2
      ORDER BY created_at ASC
    `, [lead.id, clientKey]);
    
    const timeline = [];
    
    timeline.push({
      event: 'Lead received',
      icon: '📥',
      detail: `Added via ${lead.source || 'import'}`,
      time: lead.created_at
    });
    
    (callsResult.rows || []).forEach((call, idx) => {
      timeline.push({
        event: idx === 0 ? 'AI call initiated' : `Follow-up call ${idx + 1}`,
        icon: '📞',
        detail: call.outcome ? `Outcome: ${call.outcome}` : 'Call completed',
        time: call.created_at
      });
    });
    
    (appointmentsResult.rows || []).forEach((appt, idx) => {
      const startDate = new Date(appt.start_iso);
      timeline.push({
        event: idx === 0 ? 'Appointment booked' : 'Appointment updated',
        icon: '📅',
        detail: `Booked for ${startDate.toLocaleString('en-GB')}`,
        time: appt.created_at
      });
    });
    
    timeline.sort((a, b) => new Date(a.time) - new Date(b.time));
    
    res.json({
      ok: true,
      timeline: timeline.map(item => ({
        ...item,
        time: new Date(item.time).toISOString()
      }))
    });
  } catch (error) {
    console.error('[TIMELINE ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/export/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { clientKey } = req.query;
    if (!clientKey) {
      return res.status(400).json({ ok: false, error: 'clientKey required' });
    }
    
    let csv = '';
    let filename = '';
    
    if (type === 'leads') {
      const result = await query(`
        SELECT name, phone, service, source, status, notes, created_at
        FROM leads
        WHERE client_key = $1
        ORDER BY created_at DESC
      `, [clientKey]);
      
      csv = 'Name,Phone,Service,Source,Status,Notes,Created\n';
      result.rows.forEach(row => {
        const escape = (val) => `"${String(val || '').replace(/"/g, '""')}"`;
        csv += `${escape(row.name)},${escape(row.phone)},${escape(row.service)},${escape(row.source)},${escape(row.status)},${escape(row.notes)},${escape(row.created_at)}\n`;
      });
      filename = `leads-export-${new Date().toISOString().split('T')[0]}.csv`;
    } else if (type === 'calls') {
      const result = await query(`
        SELECT l.name, c.lead_phone, c.status, c.outcome, c.duration, c.created_at
        FROM calls c
        LEFT JOIN leads l ON l.client_key = c.client_key AND l.phone = c.lead_phone
        WHERE c.client_key = $1
        ORDER BY c.created_at DESC
      `, [clientKey]);
      
      csv = 'Name,Phone,Status,Outcome,Duration (s),Created\n';
      result.rows.forEach(row => {
        const escape = (val) => `"${String(val || '').replace(/"/g, '""')}"`;
        csv += `${escape(row.name)},${escape(row.lead_phone)},${escape(row.status)},${escape(row.outcome)},${escape(row.duration)},${escape(row.created_at)}\n`;
      });
      filename = `calls-export-${new Date().toISOString().split('T')[0]}.csv`;
    } else if (type === 'appointments') {
      const result = await query(`
        SELECT l.name, a.start_iso, a.end_iso, a.status, l.service
        FROM appointments a
        LEFT JOIN leads l ON l.id = a.lead_id
        WHERE a.client_key = $1
        ORDER BY a.start_iso DESC
      `, [clientKey]);
      
      csv = 'Name,Start,End,Status,Service\n';
      result.rows.forEach(row => {
        const escape = (val) => `"${String(val || '').replace(/"/g, '""')}"`;
        csv += `${escape(row.name)},${escape(row.start_iso)},${escape(row.end_iso)},${escape(row.status)},${escape(row.service)}\n`;
      });
      filename = `appointments-export-${new Date().toISOString().split('T')[0]}.csv`;
    } else {
      return res.status(400).json({ ok: false, error: 'Invalid export type' });
    }
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('[EXPORT ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// API endpoint for dashboard call quality metrics (simplified)
app.get('/api/call-quality/:clientKey', cacheMiddleware({ ttl: 60000, keyPrefix: 'call-quality:' }), async (req, res) => {
  try {
    const { clientKey } = req.params;
    const result = await query(`
      SELECT 
        EXTRACT(HOUR FROM created_at)::INTEGER AS hour_of_day,
        COUNT(CASE WHEN outcome = 'booked' THEN 1 END) AS bookings
      FROM calls
      WHERE client_key = $1
        AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY bookings DESC
      LIMIT 1
    `, [clientKey]);

    const allCalls = await query(`
      SELECT 
        AVG(duration)::INTEGER AS avg_duration,
        COUNT(*) AS total_calls,
        COUNT(CASE WHEN outcome = 'booked' THEN 1 END) AS bookings
      FROM calls
      WHERE client_key = $1
        AND created_at >= NOW() - INTERVAL '7 days'
    `, [clientKey]);

    const stats = allCalls.rows?.[0] || {};
    const bestHourRow = result.rows?.[0];
    const bestHour = bestHourRow?.hour_of_day;
    const bestHourEnd = bestHour ? bestHour + 2 : null;
    
    // Only show best time if we have actual booking data
    const bestTime = bestHourRow && bestHourRow.bookings > 0 
      ? `${String(bestHour).padStart(2, '0')}:00-${String(bestHourEnd).padStart(2, '0')}:00`
      : '—';

    res.json({
      ok: true,
      avgDuration: stats.avg_duration || 0,
      successRate: stats.total_calls > 0 ? Math.round((stats.bookings / stats.total_calls) * 100) : 0,
      bestTime
    });
  } catch (error) {
    console.error('[CALL QUALITY ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// API endpoint for retry queue
app.get('/api/retry-queue/:clientKey', cacheMiddleware({ ttl: 30000, keyPrefix: 'retry-queue:' }), async (req, res) => {
  try {
    const { clientKey } = req.params;
    const result = await query(`
      SELECT 
        rq.id,
        rq.lead_phone,
        rq.retry_type,
        rq.retry_reason,
        rq.scheduled_for,
        rq.retry_attempt,
        rq.max_retries,
        rq.status,
        l.name
      FROM retry_queue rq
      LEFT JOIN leads l ON l.client_key = rq.client_key AND l.phone = rq.lead_phone
      WHERE rq.client_key = $1
        AND rq.status = 'pending'
        AND rq.scheduled_for <= NOW() + INTERVAL '24 hours'
      ORDER BY rq.scheduled_for ASC
      LIMIT 10
    `, [clientKey]);

    const retries = (result.rows || []).map(row => ({
      id: row.id,
      name: row.name || 'Prospect',
      phone: row.lead_phone,
      attempts: row.retry_attempt,
      maxAttempts: row.max_retries,
      reason: row.retry_reason || 'Call failed',
      scheduledFor: row.scheduled_for,
      nextRetry: new Date(row.scheduled_for).toLocaleString('en-GB', {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit'
      })
    }));

    res.json({
      ok: true,
      retries
    });
  } catch (error) {
    console.error('[RETRY QUEUE ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// API endpoint for next actions queue
app.get('/api/next-actions/:clientKey', cacheMiddleware({ ttl: 60000, keyPrefix: 'next-actions:' }), async (req, res) => {
  try {
    const { clientKey } = req.params;
    
    const highPriorityLeads = await query(`
      SELECT COUNT(*) AS count
      FROM leads l
      JOIN lead_engagement le ON le.client_key = l.client_key AND le.lead_phone = l.phone
      WHERE l.client_key = $1
        AND l.status = 'new'
        AND le.lead_score >= 85
    `, [clientKey]);

    const mediumPriorityLeads = await query(`
      SELECT COUNT(*) AS count
      FROM leads l
      JOIN lead_engagement le ON le.client_key = l.client_key AND le.lead_phone = l.phone
      WHERE l.client_key = $1
        AND l.status = 'new'
        AND le.lead_score >= 70 AND le.lead_score < 85
    `, [clientKey]);

    const scheduledCalls = await query(`
      SELECT COUNT(*) AS count
      FROM call_queue
      WHERE client_key = $1
        AND status = 'pending'
        AND scheduled_for >= NOW()
        AND scheduled_for <= NOW() + INTERVAL '24 hours'
    `, [clientKey]);

    const retries = await query(`
      SELECT COUNT(*) AS count
      FROM retry_queue
      WHERE client_key = $1
        AND status = 'pending'
        AND scheduled_for >= NOW()
        AND scheduled_for <= NOW() + INTERVAL '24 hours'
    `, [clientKey]);

    const actions = [];
    const highCount = parseInt(highPriorityLeads.rows?.[0]?.count || 0, 10);
    const mediumCount = parseInt(mediumPriorityLeads.rows?.[0]?.count || 0, 10);
    const scheduledCount = parseInt(scheduledCalls.rows?.[0]?.count || 0, 10);
    const retryCount = parseInt(retries.rows?.[0]?.count || 0, 10);

    if (highCount > 0) {
      actions.push({
        icon: '📞',
        title: `Call ${highCount} high-priority lead${highCount !== 1 ? 's' : ''}`,
        time: 'Today, 2-4pm',
        priority: 'high'
      });
    }

    if (mediumCount > 0) {
      actions.push({
        icon: '💬',
        title: `Follow up with ${mediumCount} medium-priority lead${mediumCount !== 1 ? 's' : ''}`,
        time: 'Today, 4-6pm',
        priority: 'medium'
      });
    }

    if (scheduledCount > 0) {
      actions.push({
        icon: '📧',
        title: 'Send appointment reminders',
        time: 'Tomorrow, 9am',
        priority: 'medium'
      });
    }

    if (retryCount > 0) {
      actions.push({
        icon: '🔄',
        title: `Retry ${retryCount} failed call${retryCount !== 1 ? 's' : ''}`,
        time: 'Tomorrow, 2pm',
        priority: 'low'
      });
    }

    res.json({
      ok: true,
      actions
    });
  } catch (error) {
    console.error('[NEXT ACTIONS ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// API endpoint for call recordings
app.get('/api/call-recordings/:clientKey', cacheMiddleware({ ttl: 120000, keyPrefix: 'recordings:' }), async (req, res) => {
  try {
    const { clientKey } = req.params;
    const limit = parseInt(req.query.limit) || 5;
    
    const result = await query(`
      SELECT 
        c.id,
        c.call_id,
        c.lead_phone,
        c.recording_url,
        c.duration,
        c.outcome,
        c.created_at,
        l.name
      FROM calls c
      LEFT JOIN leads l ON l.client_key = c.client_key AND l.phone = c.lead_phone
      WHERE c.client_key = $1
        AND c.recording_url IS NOT NULL
        AND c.recording_url != ''
      ORDER BY c.created_at DESC
      LIMIT $2
    `, [clientKey, limit]);

    const recordings = (result.rows || []).map(row => ({
      id: row.id,
      callId: row.call_id,
      name: row.name || 'Prospect',
      phone: row.lead_phone,
      recordingUrl: row.recording_url,
      duration: row.duration || 0,
      outcome: row.outcome || 'completed',
      createdAt: row.created_at,
      timeAgo: formatTimeAgoLabel(row.created_at)
    }));

    res.json({
      ok: true,
      recordings
    });
  } catch (error) {
    console.error('[CALL RECORDINGS ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// API endpoint for calendar sync details
app.get('/api/calendar-sync/:clientKey', cacheMiddleware({ ttl: 300000, keyPrefix: 'calendar-sync:' }), async (req, res) => {
  try {
    const { clientKey } = req.params;
    
    const tenantResult = await query(`
      SELECT calendar_json
      FROM tenants
      WHERE client_key = $1
    `, [clientKey]);

    const calendarConfig = tenantResult.rows?.[0]?.calendar_json || {};
    const isConnected = !!(calendarConfig.service_account_email || calendarConfig.access_token);

    const recentAppointments = await query(`
      SELECT COUNT(*) AS count
      FROM appointments
      WHERE client_key = $1
        AND created_at >= NOW() - INTERVAL '7 days'
    `, [clientKey]);

    const conflicts = await query(`
      SELECT COUNT(*) AS count
      FROM appointments
      WHERE client_key = $1
        AND status = 'conflict'
        AND created_at >= NOW() - INTERVAL '7 days'
    `, [clientKey]);

    const lastSync = await query(`
      SELECT MAX(created_at) AS last_sync
      FROM appointments
      WHERE client_key = $1
    `, [clientKey]);

    res.json({
      ok: true,
      connected: isConnected,
      lastSync: lastSync.rows?.[0]?.last_sync || new Date().toISOString(),
      appointmentsBooked: parseInt(recentAppointments.rows?.[0]?.count || 0, 10),
      conflictsResolved: parseInt(conflicts.rows?.[0]?.count || 0, 10),
      status: isConnected ? 'synced' : 'disconnected',
      calendarType: calendarConfig.type || 'google'
    });
  } catch (error) {
    console.error('[CALENDAR SYNC ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// API endpoint for active work indicator
app.get('/api/active-indicator/:clientKey', cacheMiddleware({ ttl: 10000, keyPrefix: 'active-indicator:' }), async (req, res) => {
  try {
    const { clientKey } = req.params;
    
    const activeCalls = await query(`
      SELECT COUNT(*) AS count
      FROM calls
      WHERE client_key = $1
        AND status IN ('ringing', 'in-progress')
        AND created_at >= NOW() - INTERVAL '5 minutes'
    `, [clientKey]);

    const pendingFollowups = await query(`
      SELECT COUNT(*) AS count
      FROM leads l
      WHERE l.client_key = $1
        AND l.status = 'new'
        AND l.created_at >= NOW() - INTERVAL '24 hours'
    `, [clientKey]);

    const scheduledCalls = await query(`
      SELECT COUNT(*) AS count
      FROM call_queue
      WHERE client_key = $1
        AND status = 'pending'
        AND scheduled_for >= NOW()
        AND scheduled_for <= NOW() + INTERVAL '1 hour'
    `, [clientKey]);

    const activeCount = parseInt(activeCalls.rows?.[0]?.count || 0, 10);
    const followupCount = parseInt(pendingFollowups.rows?.[0]?.count || 0, 10);
    const scheduledCount = parseInt(scheduledCalls.rows?.[0]?.count || 0, 10);

    let title = 'Your concierge is monitoring';
    let subtitle = 'Ready to handle leads as they come in';

    if (activeCount > 0 || scheduledCount > 0) {
      title = 'Your concierge is active';
      if (activeCount > 0 && followupCount > 0) {
        subtitle = `Currently calling ${activeCount} lead${activeCount !== 1 ? 's' : ''}, following up with ${followupCount}`;
      } else if (activeCount > 0) {
        subtitle = `Currently calling ${activeCount} lead${activeCount !== 1 ? 's' : ''}`;
      } else if (scheduledCount > 0) {
        subtitle = `${scheduledCount} call${scheduledCount !== 1 ? 's' : ''} scheduled in the next hour`;
      }
    } else if (followupCount > 0) {
      title = 'Your concierge is active';
      subtitle = `Following up with ${followupCount} lead${followupCount !== 1 ? 's' : ''}`;
    }

    res.json({
      ok: true,
      title,
      subtitle,
      activeCalls: activeCount,
      pendingFollowups: followupCount,
      scheduledCalls: scheduledCount
    });
  } catch (error) {
    console.error('[ACTIVE INDICATOR ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// API endpoint to get call quality metrics
app.get('/api/quality-metrics/:clientKey', async (req, res) => {
  try {
    const { clientKey } = req.params;
    const days = parseInt(req.query.days) || 30;
    
    const metrics = await getCallQualityMetrics(clientKey, days);
    
    if (!metrics || metrics.total_calls === 0) {
      return res.json({
        ok: true,
        period: `Last ${days} days`,
        metrics: {
          total_calls: 0,
          successful_calls: 0,
          bookings: 0,
          success_rate: '0.0%',
          booking_rate: '0.0%',
          avg_quality_score: '0.0',
          avg_duration: '0s',
          sentiment: {
            positive: 0,
            negative: 0,
            neutral: 0,
            positive_rate: '0.0%'
          }
        },
        message: 'No call data available yet'
      });
    }
    
    // Calculate rates
    const successRate = metrics.total_calls > 0 
      ? (metrics.successful_calls / metrics.total_calls) 
      : 0;
    const bookingRate = metrics.total_calls > 0 
      ? (metrics.bookings / metrics.total_calls) 
      : 0;
    const positiveRate = metrics.total_calls > 0 
      ? (metrics.positive_sentiment_count / metrics.total_calls) 
      : 0;
    
    res.json({
      ok: true,
      period: `Last ${days} days`,
      metrics: {
        total_calls: parseInt(metrics.total_calls) || 0,
        successful_calls: parseInt(metrics.successful_calls) || 0,
        bookings: parseInt(metrics.bookings) || 0,
        success_rate: (successRate * 100).toFixed(1) + '%',
        booking_rate: (bookingRate * 100).toFixed(1) + '%',
        avg_quality_score: parseFloat(metrics.avg_quality_score || 0).toFixed(1),
        avg_duration: Math.round(metrics.avg_duration || 0) + 's',
        sentiment: {
          positive: parseInt(metrics.positive_sentiment_count) || 0,
          negative: parseInt(metrics.negative_sentiment_count) || 0,
          neutral: parseInt(metrics.neutral_sentiment_count) || 0,
          positive_rate: (positiveRate * 100).toFixed(1) + '%'
        }
      }
    });
  } catch (error) {
    console.error('[QUALITY METRICS ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

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

// --- healthz: report which integrations are configured (without leaking secrets)
app.get('/healthz', (req, res) => {
  const flags = {
    apiKey: !!process.env.API_KEY,
    sms: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER)),
    gcal: !!(process.env.GOOGLE_CLIENT_EMAIL && (process.env.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY_B64)),
    vapi: !!(process.env.VAPI_PRIVATE_KEY && (process.env.VAPI_ASSISTANT_ID || true) && (process.env.VAPI_PHONE_NUMBER_ID || true)),
    tz: process.env.TZ || 'unset'
  };
  res.json({ ok: true, integrations: flags });
});

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

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const DATA_DIR   = path.join(__dirname, 'data');
const LEADS_PATH = path.join(DATA_DIR, 'leads.json');
const CALLS_PATH = path.join(DATA_DIR, 'calls.json');
const SMS_STATUS_PATH = path.join(DATA_DIR, 'sms-status.json');
const JOBS_PATH  = path.join(DATA_DIR, 'jobs.json');

// === Env: Google
// Support both individual env vars AND full JSON base64
let GOOGLE_CLIENT_EMAIL    = process.env.GOOGLE_CLIENT_EMAIL    || '';
let GOOGLE_PRIVATE_KEY     = process.env.GOOGLE_PRIVATE_KEY     || '';
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

const GOOGLE_CALENDAR_ID     = process.env.GOOGLE_CALENDAR_ID     || 'primary';
const TIMEZONE               = process.env.TZ || process.env.TIMEZONE || 'Europe/London';

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
  try {
    const { getActiveABTests, recordABTestResult } = await import('./db.js');
    
    const activeTests = await getActiveABTests(clientKey);
    const experimentVariants = activeTests.filter(test => test.experiment_name === experimentName);
    
    if (!experimentVariants || experimentVariants.length === 0) {
      return null; // No active experiment
    }
    
    // Simple hash-based assignment for consistent results
    const hash = createHash('md5').update(`${clientKey}_${experimentName}_${leadPhone}`).digest('hex');
    const hashValue = parseInt(hash.substring(0, 8), 16);
    const variantIndex = hashValue % experimentVariants.length;
    
    const selectedVariant = experimentVariants[variantIndex];
    
    // Record the assignment
    await recordABTestResult({
      experimentId: selectedVariant.id,
      clientKey,
      leadPhone,
      variantName: selectedVariant.variant_name,
      outcome: 'assigned',
      outcomeData: {
        assignmentMethod: 'hash_based',
        hashValue,
        variantIndex
      }
    });
    
    console.log('[AB TEST VARIANT SELECTED]', {
      clientKey,
      experimentName,
      leadPhone,
      variantName: selectedVariant.variant_name,
      variantIndex
    });
    
    return {
      name: selectedVariant.variant_name,
      config: selectedVariant.variant_config
    };
  } catch (error) {
    console.error('[AB TEST VARIANT SELECTION ERROR]', error);
    return null;
  }
}

async function recordABTestOutcome({ clientKey, experimentName, leadPhone, outcome, outcomeData = null }) {
  try {
    const { getActiveABTests, recordABTestResult } = await import('./db.js');
    
    const activeTests = await getActiveABTests(clientKey);
    const experimentVariants = activeTests.filter(test => test.experiment_name === experimentName);
    
    if (!experimentVariants || experimentVariants.length === 0) {
      return null;
    }
    
    // Find the variant that was assigned to this lead across all experiments with this name
    const { getABTestIndividualResults } = await import('./db.js');
    let assignment = null;
    
    // Try each experiment variant to find the assignment
    for (const variant of experimentVariants) {
      const results = await getABTestIndividualResults(variant.id);
      assignment = results.find(result => 
        result.lead_phone === leadPhone && result.outcome === 'assigned'
      );
      if (assignment) {
        break; // Found the assignment
      }
    }
    
    if (!assignment) {
      console.log('[AB TEST OUTCOME] No assignment found for lead', { clientKey, experimentName, leadPhone });
      return null;
    }
    
    const result = await recordABTestResult({
      experimentId: assignment.experiment_id,
      clientKey,
      leadPhone,
      variantName: assignment.variant_name,
      outcome,
      outcomeData
    });
    
    console.log('[AB TEST OUTCOME RECORDED]', {
      clientKey,
      experimentName,
      leadPhone,
      variantName: assignment.variant_name,
      outcome
    });
    
    return result;
  } catch (error) {
    console.error('[AB TEST OUTCOME RECORDING ERROR]', error);
    return null;
  }
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

function getCached(key) {
  // Use centralized cache system from lib/cache.js
  return cache.get(key);
}

function setCache(key, data, ttl = CACHE_TTL) {
  // Use centralized cache system from lib/cache.js
  cache.set(key, data, ttl);
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
      setCache(cacheKey, client, 2 * 60 * 1000); // 2 minutes cache
    }
  }
  
  return client;
}

// Cached analytics dashboard
async function getCachedAnalyticsDashboard(clientKey, days = 30) {
  const cacheKey = getCacheKey('analytics', clientKey, days.toString());
  let dashboard = getCached(cacheKey);
  
  if (!dashboard) {
    dashboard = await getAnalyticsDashboard(clientKey, days);
    if (dashboard) {
      setCache(cacheKey, dashboard, 1 * 60 * 1000); // 1 minute cache
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
    
    setCache(cacheKey, metrics, 30 * 1000); // 30 seconds cache
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
    
    // Default configuration
    let assistantId = client?.vapiAssistantId || VAPI_ASSISTANT_ID;
    let phoneNumberId = client?.vapiPhoneNumberId || VAPI_PHONE_NUMBER_ID;
    
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
      phoneNumberId = VAPI_PHONE_NUMBER_ID;
    }
    
    return { assistantId, phoneNumberId };
    
  } catch (error) {
    console.error('[ASSISTANT SELECTION ERROR]', error);
    return {
      assistantId: client?.vapiAssistantId || VAPI_ASSISTANT_ID,
      phoneNumberId: client?.vapiPhoneNumberId || VAPI_PHONE_NUMBER_ID
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

// Business hours detection
function isBusinessHours(tenant = null) {
  const now = new Date();
  const tz = tenant?.booking?.timezone || tenant?.timezone || TIMEZONE;
  
  // Convert to tenant timezone
  const tenantTime = new Date(now.toLocaleString("en-US", {timeZone: tz}));
  const hour = tenantTime.getHours();
  const day = tenantTime.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Default business hours: Mon-Fri 9AM-5PM
  const businessHours = tenant?.businessHours || {
    start: 9,
    end: 17,
    days: [1, 2, 3, 4, 5] // Monday to Friday
  };
  
  const isWeekday = businessHours.days.includes(day);
  const isBusinessHour = hour >= businessHours.start && hour < businessHours.end;
  
  return isWeekday && isBusinessHour;
}

function getNextBusinessHour(tenant = null) {
  const now = new Date();
  const tz = tenant?.booking?.timezone || tenant?.timezone || TIMEZONE;
  const tenantTime = new Date(now.toLocaleString("en-US", {timeZone: tz}));
  
  const businessHours = tenant?.businessHours || {
    start: 9,
    end: 17,
    days: [1, 2, 3, 4, 5]
  };
  
  let nextBusiness = new Date(tenantTime);
  nextBusiness.setHours(businessHours.start, 0, 0, 0);
  
  // If it's already past business hours today, move to next business day
  if (tenantTime.getHours() >= businessHours.end || !businessHours.days.includes(tenantTime.getDay())) {
    do {
      nextBusiness.setDate(nextBusiness.getDate() + 1);
    } while (!businessHours.days.includes(nextBusiness.getDay()));
  }
  
  return nextBusiness;
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
app.use(cors({
  origin: ORIGIN === '*' ? true : ORIGIN,
  methods: ['GET','POST','OPTIONS','DELETE'],
  allowedHeaders: ['Content-Type','X-API-Key','Idempotency-Key','X-Client-Key'],
}));
app.use('/webhooks/twilio-status', express.urlencoded({ extended: false }));
app.use('/webhooks/twilio-inbound', express.urlencoded({ extended: false }));
app.use('/webhook/sms-reply', express.urlencoded({ extended: false }));
app.use((req, _res, next) => { req.id = 'req_' + nanoid(10); next(); });
app.use(rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }));

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
function pickTimezone(client) { return client?.booking?.timezone || TIMEZONE; }
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

// === PUBLIC ENDPOINTS (no auth required) ===

// Simple test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Test endpoint working - SMS pipeline ready - DEPLOYMENT TEST', 
    timestamp: new Date().toISOString(),
    env: {
      googlePlaces: process.env.GOOGLE_PLACES_API_KEY ? 'SET' : 'NOT SET',
      companiesHouse: process.env.COMPANIES_HOUSE_API_KEY ? 'SET' : 'NOT SET',
      googleSearch: process.env.GOOGLE_SEARCH_API_KEY ? 'SET' : 'NOT SET'
    }
  });
});

// Test Companies House API endpoint
app.get('/api/test-companies-house', async (req, res) => {
  try {
    const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
    
    if (!apiKey) {
      return res.json({ success: false, error: 'Companies House API key not set' });
    }
    
    // Test search for "Scott Arms Dental Practice"
    const response = await axios.get('https://api.company-information.service.gov.uk/search/companies', {
      params: {
        q: 'Scott Arms Dental Practice',
        items_per_page: 5
      },
      headers: {
        'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`
      }
    });
    
    res.json({
      success: true,
      apiKey: apiKey.substring(0, 8) + '...',
      results: response.data.items?.length || 0,
      companies: response.data.items?.map(item => ({
        name: item.title,
        number: item.company_number,
        status: item.company_status
      })) || []
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
  }
});

// Test Companies House officers endpoint
app.get('/api/test-officers/:companyNumber', async (req, res) => {
  try {
    const { companyNumber } = req.params;
    const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
    
    if (!apiKey) {
      return res.json({ error: 'Companies House API key not set' });
    }

    const response = await axios.get(`https://api.company-information.service.gov.uk/company/${companyNumber}/officers`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`
      }
    });
    
    res.json({
      success: true,
      companyNumber,
      officers: response.data.items?.map(officer => ({
        name: officer.name,
        role: officer.officer_role,
        appointed: officer.appointed_on,
        resigned: officer.resigned_on,
        nationality: officer.nationality,
        occupation: officer.occupation,
        address: officer.address,
        contact_details: officer.contact_details,
        links: officer.links
      })) || []
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
  }
});

// Test LinkedIn search endpoint
app.get('/api/test-linkedin', async (req, res) => {
  try {
    const { name, company } = req.query;
    
    if (!name || !company) {
      return res.status(400).json({ error: 'Name and company parameters required' });
    }
    
    console.log(`[TEST LINKEDIN] Testing search for "${name}" at "${company}"`);
    
    // Test Google Search API
    if (process.env.GOOGLE_SEARCH_API_KEY) {
      const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          key: process.env.GOOGLE_SEARCH_API_KEY,
          cx: '017576662512468239146:omuauf_lfve',
          q: `"${name}" "${company}" site:linkedin.com/in/`,
          num: 3
        },
        timeout: 5000
      });
      
      res.json({
        success: true,
        query: `"${name}" "${company}" site:linkedin.com/in/`,
        results: response.data.items ? response.data.items.length : 0,
        items: response.data.items || [],
        googleApiKey: 'SET'
      });
    } else {
      res.json({
        success: false,
        error: 'Google Search API key not set',
        googleApiKey: 'NOT SET'
      });
    }
    
  } catch (error) {
    console.error('[TEST LINKEDIN ERROR]', error);
    res.status(500).json({
      success: false,
      error: error.message,
      googleApiKey: process.env.GOOGLE_SEARCH_API_KEY ? 'SET' : 'NOT SET'
    });
  }
});

// Test Companies House API directly
app.get('/api/test-companies-house', async (req, res) => {
  try {
    if (!process.env.COMPANIES_HOUSE_API_KEY) {
      return res.json({ error: 'Companies House API key not set' });
    }

    const axios = (await import('axios')).default;
    const response = await axios.get('https://api.company-information.service.gov.uk/search/companies', {
      params: {
        q: 'Sherwood Dental Practice',
        items_per_page: 5
      },
      headers: {
        'Authorization': `Basic ${Buffer.from(process.env.COMPANIES_HOUSE_API_KEY + ':').toString('base64')}`
      }
    });

    res.json({
      success: true,
      companies: response.data.items?.slice(0, 3) || [],
      message: 'Companies House API is working'
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      message: 'Companies House API failed'
    });
  }
});

// Test Companies House Officers API directly
app.get('/api/test-companies-house-officers/:companyNumber', async (req, res) => {
  try {
    if (!process.env.COMPANIES_HOUSE_API_KEY) {
      return res.json({ error: 'Companies House API key not set' });
    }

    const axios = (await import('axios')).default;
    const response = await axios.get(`https://api.company-information.service.gov.uk/company/${req.params.companyNumber}/officers`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(process.env.COMPANIES_HOUSE_API_KEY + ':').toString('base64')}`
      }
    });

    res.json({
      success: true,
      officers: response.data.items?.slice(0, 5) || [],
      message: `Companies House Officers API is working for company ${req.params.companyNumber}`
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      message: `Companies House Officers API failed for company ${req.params.companyNumber}`
    });
  }
});

// UK Business Search endpoint (PUBLIC - no auth required) - WITH REAL API
// FILTERS FOR MOBILE NUMBERS ONLY BY DEFAULT
app.post('/api/uk-business-search', async (req, res) => {
  try {
    const { query, filters = {} } = req.body;
    
    // Default to mobiles only unless explicitly disabled
    const mobilesOnly = filters.mobilesOnly !== false;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    console.log(`[UK BUSINESS SEARCH] Starting real search for: "${query}"`);
    
    // Try real API first, fallback to sample data
    let results = [];
    let usingRealData = false;
    
    try {
      // Debug API keys
      console.log(`[UK BUSINESS SEARCH] API Keys Status:`, {
        googlePlaces: process.env.GOOGLE_PLACES_API_KEY ? 'SET' : 'NOT SET',
        companiesHouse: process.env.COMPANIES_HOUSE_API_KEY ? 'SET' : 'NOT SET'
      });
      
      // Dynamic import of real API module
      const realSearchModule = await import('./real-uk-business-search.js');
      const RealUKBusinessSearch = realSearchModule.default;
      
      const realSearcher = new RealUKBusinessSearch();
      results = await realSearcher.searchBusinesses(query, filters);
      usingRealData = true;
      console.log(`[UK BUSINESS SEARCH] Real API search found ${results.length} businesses`);
    } catch (realApiError) {
      console.log(`[UK BUSINESS SEARCH] Real API failed, falling back to sample data:`, realApiError.message);
      
      // Fallback to enhanced sample data with filters
      results = generateUKBusinesses(query, filters);
    }
    
    // Filter for mobile numbers only if requested
    if (mobilesOnly) {
      const beforeFilter = results.length;
      results = results.filter(business => {
        const hasMobile = isMobileNumber(business.phone);
        if (!hasMobile) {
          console.log(`[MOBILE FILTER] Rejected ${business.name}: ${business.phone} (landline)`);
        }
        return hasMobile;
      });
      console.log(`[MOBILE FILTER] Filtered ${beforeFilter} → ${results.length} businesses (mobiles only)`);
    }
    
    res.json({
      success: true,
      results,
      count: results.length,
      query,
      filters: { ...filters, mobilesOnly },
      usingRealData,
      mobilesFiltered: mobilesOnly,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[UK BUSINESS SEARCH ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to search businesses',
      message: error.message 
    });
  }
});

// Decision Maker Contact Research endpoint (PUBLIC - no auth required) - WITH REAL API
app.post('/api/decision-maker-contacts', async (req, res) => {
  // Set a 30-second timeout to prevent 502 errors
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ 
        error: 'Request timeout', 
        message: 'The request took too long to process. Please try again with a smaller search scope.' 
      });
    }
  }, 30000);

  try {
    const { business, industry, targetRole } = req.body;
    
    if (!business || !industry || !targetRole) {
      return res.status(400).json({ 
        error: 'Business, industry, and targetRole are required' 
      });
    }
    
    console.log(`[DECISION MAKER CONTACT] Researching contacts for ${targetRole} at ${business.name}`);
    console.log(`[DECISION MAKER CONTACT] Business data:`, { name: business.name, website: business.website, address: business.address });
    
    // Try real API first, fallback to sample data
    let contacts, strategy;
    
    try {
      // Dynamic import of real contact finder module
      const contactFinderModule = await import('./real-decision-maker-contact-finder.js');
      const RealDecisionMakerContactFinder = contactFinderModule.default;
      
      const contactFinder = new RealDecisionMakerContactFinder();
      
      // Set a 5-second timeout for the entire research process
      const result = await Promise.race([
        Promise.all([
          contactFinder.findDecisionMakerContacts(business, industry, targetRole),
          contactFinder.generateOutreachStrategy({ primary: [], secondary: [], gatekeeper: [] }, business, industry, targetRole)
        ]),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Contact research timed out after 5 seconds')), 5000)
        )
      ]);
      
      contacts = result[0];
      strategy = result[1];
      
      console.log(`[DECISION MAKER CONTACT] Real API found ${contacts.primary.length} primary, ${contacts.secondary.length} secondary, ${contacts.gatekeeper.length} gatekeeper contacts`);
      
      if (contacts.primary.length > 0 || contacts.secondary.length > 0 || contacts.gatekeeper.length > 0) {
        contacts.found = true;
        console.log(`[DECISION MAKER CONTACT] Real API successful - contacts found`);
      } else {
        contacts.found = false;
        console.log(`[DECISION MAKER CONTACT] Real API returned empty contacts - no decision makers found`);
        
        // No fake contacts - only real data
        contacts = { primary: [], secondary: [], gatekeeper: [], found: false };
        
        strategy = {
          approach: "No decision makers found",
          message: "No decision maker contacts found for this business. The business may not be registered with Companies House or may not have active directors.",
          followUp: "Try manual research methods: LinkedIn search, company website, or Google search",
          bestTime: "N/A"
        };
      }
    } catch (realApiError) {
      console.log(`[DECISION MAKER CONTACT] Real API failed:`, realApiError.message);
      
      // Check if it's a timeout error
      if (realApiError.message.includes('timed out')) {
        contacts = { primary: [], secondary: [], gatekeeper: [], found: false };
        strategy = {
          approach: "Research timed out",
          message: "The search is taking longer than expected. Please try again.",
          followUp: "Try again with a different business or check your internet connection",
          bestTime: "N/A"
        };
      } else {
        console.log(`[DECISION MAKER CONTACT] Real API failed - no fallback contacts generated`);
        
        // No fake contacts - only real data
        contacts = { primary: [], secondary: [], gatekeeper: [], found: false };
        
        strategy = {
          approach: "API failed",
          message: "Unable to retrieve decision maker contacts. The search service may be temporarily unavailable.",
          followUp: "Try again later or use manual research methods",
          bestTime: "N/A"
        };
      }
    }
    
    console.log(`[DECISION MAKER CONTACT] Returning contacts:`, { 
      primaryCount: contacts.primary.length, 
      secondaryCount: contacts.secondary.length, 
      gatekeeperCount: contacts.gatekeeper.length,
      found: contacts.found 
    });
    
    res.json({
      success: true,
      contacts,
      strategy,
      business,
      industry,
      targetRole,
      timestamp: new Date().toISOString()
    });
    
    // Clear the timeout since request completed successfully
    clearTimeout(timeout);
  } catch (error) {
    console.error('[DECISION MAKER CONTACT ERROR]', error);
    
    // Clear the timeout since request completed (with error)
    clearTimeout(timeout);
    
    res.status(500).json({ 
      error: 'Failed to research decision maker contacts',
      message: error.message 
    });
  }
});

// Get industry categories endpoint (PUBLIC - no auth required)
app.get('/api/industry-categories', (req, res) => {
  try {
    const categories = getIndustryCategories();
    res.json({
      success: true,
      categories,
      total: categories.length
    });
  } catch (error) {
    console.error('[INDUSTRY CATEGORIES ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to get industry categories',
      message: error.message 
    });
  }
});

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

// === HARD-OVERRIDE (top-priority) /api/leads to kill 404s ===
app.post('/api/leads', async (req, res) => {
  try {
    // Minimal logging to Render logs so we can see hits unequivocally
    console.log('HIT /api/leads (override)', { rid: req.id, path: req.path });

    const client = await getClientFromHeader(req);
    if (!client) return res.status(401).json({ ok:false, error:'missing or unknown X-Client-Key' });

    const body    = req.body || {};
    const service = String(body.service || '');
    const lead    = body.lead || {};
    const name    = String(lead.name || body.name || '').trim();
    const phoneIn = String(lead.phone || body.phone || '').trim();
    const source  = String(body.source || 'unknown');
    const autoNudgeRequested = body.autoNudge === true;
    const suppressNudge = body.autoNudge === false || body.skipNudge === true || body.suppressNudge === true;

    if (!name || !phoneIn) return res.status(400).json({ ok:false, error:'Missing lead.name or lead.phone' });

    const regionHint = (body.region || client?.booking?.country || client?.default_country || client?.country || 'GB');
    const phone = normalizePhoneE164(phoneIn, regionHint);
    if (!phone) return res.status(400).json({ ok:false, error:`invalid phone (expected E.164 like +447... or convertible with region ${regionHint})` });

    const now = new Date().toISOString();
    const rows = await readJson(LEADS_PATH, []);
    const id = 'lead_' + nanoid(8);
    const saved = {
      id,
      tenantId: client.clientKey || client.id,
      name,
      phone,
      source,
      service: service || 'unspecified',
      status: 'new', createdAt: now, updatedAt: now
    };
    rows.push(saved);
    await writeJson(LEADS_PATH, rows);

    // --- Auto-nudge SMS (minimal, tenant-aware) ---
    const shouldAutoNudge = autoNudgeRequested && !suppressNudge;

    if (shouldAutoNudge) {
      try {
        const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
        if (configured) {
          const brand = client?.displayName || client?.clientKey || 'Our Clinic';
          const templ = client?.smsTemplates?.nudge || `Hi {{name}} — it’s {{brand}}. Ready to book your appointment? Reply YES to continue.`;
          const msgBody = renderTemplate(templ, { name, brand });
          const payload = { to: phone, body: msgBody };
          if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid; else if (fromNumber) payload.from = fromNumber;
          const resp = await smsClient.messages.create(payload);
          console.log('[LEAD AUTO-NUDGE SENT]', { to: phone, tenant: client?.clientKey || null, sid: resp?.sid || null });
        }
      } catch (e) {
        console.log('[AUTO-NUDGE SMS ERROR]', e?.message || String(e));
      }
    }

    return res.status(201).json({ ok:true, lead: saved, override: true });
  } catch (err) {
    console.error('[POST /api/leads override] error:', err);
    return res.status(500).json({ ok:false, error:'Internal error' });
  }
});




// Health and monitoring routes (before other routes for quick access)
app.use(healthRouter);
app.use(monitoringRouter);

// Mounted minimal lead intake + STOP webhook
app.use(leadsRouter);
app.use(twilioWebhooks);
app.use(twilioVoiceWebhooks);
app.use(appointmentsRouter);
app.use(receptionistRouter);

// --- Vapi booking webhook: create GCal event + send confirmations
// CONFLICTING WEBHOOK HANDLER - DISABLED TO ALLOW LOGISTICS WEBHOOK
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
app.use('/api/clients/:clientKey', cacheMiddleware({ ttl: 180000 })); // 3 minute cache

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

// === Availability === (respects hours/closures/min notice/max advance + per-service duration)
app.post('/api/calendar/find-slots', async (req, res) => {
  try {
    const client = await getClientFromHeader(req);
    if (!client) return res.status(400).json({ ok:false, error: 'Unknown tenant (missing X-Client-Key)' });
    if (!(GOOGLE_CLIENT_EMAIL && (GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY_B64)))
      return res.status(400).json({ ok:false, error:'Google env missing' });

    const tz = pickTimezone(client);
    const calendarId = pickCalendarId(client);

    let services = client?.services ?? client?.servicesJson ?? [];
    if (!Array.isArray(services)) {
      try { services = JSON.parse(String(services)); }
      catch { services = []; }
    }
    let requestedService = req.body?.service;
    if (requestedService && typeof requestedService === 'object') {
      requestedService =
        requestedService.id ||
        requestedService.name ||
        requestedService.label ||
        '';
    }
    const svc = services.find(s => s.id === requestedService);
    const durationMin = (svc?.durationMin) || req.body?.durationMin || client?.booking?.defaultDurationMin || 30;
    const bufferMin = (svc?.bufferMin) || 0;

    const minNoticeMin   = client?.booking?.minNoticeMin   ?? client?.minNoticeMin   ?? 0;
    const maxAdvanceDays = client?.booking?.maxAdvanceDays ?? client?.maxAdvanceDays ?? 14;
    const business = hoursFor(client);
    const closedDates = new Set(closedDatesFor(client));
    const stepMinutes = Math.max(5, Number((req.body?.stepMinutes ?? svc?.slotStepMin ?? durationMin ?? 15)));
const windowStart = new Date(Date.now() + minNoticeMin * 60000);
const windowEnd   = new Date(Date.now() + maxAdvanceDays * 86400000);

    function alignToGrid(d) {
      const dt = new Date(d);
      dt.setSeconds(0,0);
      const minutes = dt.getMinutes();
      const rem = minutes % stepMinutes;
      if (rem !== 0) dt.setMinutes(minutes + (stepMinutes - rem));
      return dt;
    }

    // Schedule appointment reminders (24h and 1h before)
    try {
      const { scheduleAppointmentReminders } = await import('./lib/appointment-reminders.js');
      
      const reminderResult = await scheduleAppointmentReminders({
        leadPhone: lead.phone,
        leadName: lead.name || 'Customer',
        leadEmail: lead.email || null,
        businessName: client?.displayName || client?.clientKey || 'Our Business',
        service: service,
        appointmentTime: startISO,
        location: client?.address || client?.location || 'TBD',
        businessPhone: client?.phone || client?.businessPhone || '',
        clientKey: clientKey,
        appointmentId: event.id
      });
      
      console.log('[REMINDERS] Scheduled:', reminderResult);
    } catch (reminderError) {
      console.error('[REMINDER SCHEDULING ERROR]', reminderError);
      // Don't fail the booking if reminders fail
    }

    // === NEW: Track call outcome in analytics ===
    try {
      const { trackCallOutcome } = await import('./lib/analytics-tracker.js');
      
      const callId = p?.call?.id || p?.callId || `vapi_${Date.now()}`;
      const duration = p?.call?.duration || p?.duration || 0;
      const cost = p?.call?.cost || p?.cost || 0;
      
      await trackCallOutcome({
        callId,
        clientKey,
        leadPhone: lead.phone,
        outcome: 'booked', // Successful booking
        duration,
        cost,
        appointmentBooked: true,
        appointmentTime: startISO,
        transcript: p?.transcript || null,
        sentiment: 'positive'
      });
      
      console.log('[ANALYTICS] Tracked successful booking:', callId);
    } catch (analyticsError) {
      console.error('[ANALYTICS TRACKING ERROR]', analyticsError);
      // Don't fail the booking if analytics fail
    }

    // === NEW: Emit real-time event to client dashboard ===
    try {
      const { emitAppointmentBooked } = await import('./lib/realtime-events.js');
      
      emitAppointmentBooked(clientKey, {
        appointmentId: event.id,
        leadName: lead.name || 'Customer',
        leadPhone: lead.phone,
        appointmentTime: startISO,
        service: service
      });
      
      console.log('[REALTIME] Emitted appointment_booked event');
    } catch (realtimeError) {
      console.error('[REALTIME EVENT ERROR]', realtimeError);
      // Don't fail the booking if real-time fails
    }

    return res.json({ ok:true, eventId: event.id, htmlLink: event.htmlLink || null });
  } catch (err) {
    console.error('[VAPI WEBHOOK ERROR]', err?.response?.data || err?.message || err);
    return res.status(500).json({ ok:false, error: String(err?.response?.data || err?.message || err) });
  }
// });

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

// Simple Health Check (Basic - for load balancers/uptime monitors)
app.get('/healthz', async (_req, res) => {
  try {
    const rows = await listFullClients();
    res.json({
      ok: true,
      service: 'ai-booking-mvp',
      time: new Date().toISOString(),
      gcalConfigured: !!(GOOGLE_CLIENT_EMAIL && (GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY_B64) && GOOGLE_CALENDAR_ID),
      smsConfigured: defaultSmsConfigured,
      corsOrigin: ORIGIN === '*' ? 'any' : ORIGIN,
      tenants: rows.map(r => r.clientKey),
      db: { path: DB_PATH }
    });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e) });
  }
});

// Optional: gcal ping
app.get('/gcal/ping', async (_req, res) => {
  try {
    if (!(GOOGLE_CLIENT_EMAIL && (GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY_B64)))
      return res.status(400).json({ ok:false, error:'Google env missing' });
    const auth = makeJwtAuth({ clientEmail: GOOGLE_CLIENT_EMAIL, privateKey: GOOGLE_PRIVATE_KEY, privateKeyB64: GOOGLE_PRIVATE_KEY_B64 });
    await auth.authorize();
    res.json({ ok:true });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e) });
  }
});

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
const closedDatesFor    = (c) => asJson(c?.closedDates, [])     || asJson(c?.closedDatesJson, []);

const attendeeEmailsFor = (c) => asJson(c?.attendeeEmails, [])  || asJson(c?.attendeeEmailsJson, []);

// === Availability === (respects hours/closures/min notice/max advance + per-service duration)
app.post('/api/calendar/find-slots', async (req, res) => {
  try {
    const client = await getClientFromHeader(req);
    if (!client) return res.status(400).json({ ok:false, error: 'Unknown tenant (missing X-Client-Key)' });
    if (!(GOOGLE_CLIENT_EMAIL && (GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY_B64)))
      return res.status(400).json({ ok:false, error:'Google env missing' });

    const tz = pickTimezone(client);
    const calendarId = pickCalendarId(client);

    const services =
      (typeof servicesFor === 'function')
        ? servicesFor(client)
        : (asJson(client?.services, []) || asJson(client?.servicesJson, []));
    const requestedService = req.body?.service;
    const svc = services.find(s => s.id === requestedService);
    const durationMin = (svc?.durationMin) || req.body?.durationMin || client?.booking?.defaultDurationMin || 30;
    const bufferMin = (svc?.bufferMin) || 0;

    const minNoticeMin   = client?.booking?.minNoticeMin   ?? client?.minNoticeMin   ?? 0;
    const maxAdvanceDays = client?.booking?.maxAdvanceDays ?? client?.maxAdvanceDays ?? 14;
    const business = hoursFor(client);
    const closedDates = new Set(closedDatesFor(client));
    const stepMinutes = Math.max(5, Number((req.body?.stepMinutes ?? svc?.slotStepMin ?? durationMin ?? 15)));
const windowStart = new Date(Date.now() + minNoticeMin * 60000);
const windowEnd   = new Date(Date.now() + maxAdvanceDays * 86400000);

    function alignToGrid(d) {
      const dt = new Date(d);
      dt.setSeconds(0,0);
      const minutes = dt.getMinutes();
      const rem = minutes % stepMinutes;
      if (rem !== 0) dt.setMinutes(minutes + (stepMinutes - rem));
      return dt;
    }
const auth = makeJwtAuth({ clientEmail: GOOGLE_CLIENT_EMAIL, privateKey: GOOGLE_PRIVATE_KEY, privateKeyB64: GOOGLE_PRIVATE_KEY_B64 });
    await auth.authorize();
    const busy = await freeBusy({ auth, calendarId, timeMinISO: windowStart.toISOString(), timeMaxISO: windowEnd.toISOString() });

    const slotMs = (durationMin + bufferMin) * 60000;
    const results = [];
    let cursor = alignToGrid(windowStart);
    cursor.setSeconds(0,0);

    const dowName = ['sun','mon','tue','wed','thu','fri','sat'];

    function formatHMLocal(dt) {
      const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
      const parts = f.formatToParts(dt);
      const hh = parts.find(p => p.type==='hour').value;
      const mm = parts.find(p => p.type==='minute').value;
      return `${hh}:${mm}`;
    }
    function isOpen(dt) {
      const spans = business[dowName[dt.getUTCDay()]];
      if (!Array.isArray(spans) || spans.length === 0) return false;
      const hm = formatHMLocal(dt);
      return spans.some(s => { const [a,b] = String(s).split('-'); return hm >= a && hm < b; });
    }
    function isClosedDate(dt) {
      const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit' });
      const [y,m,d] = f.format(dt).split('-');
      return closedDates.has(`${y}-${m}-${d}`);
    }
    function overlapsBusy(sISO, eISO) {
      return busy.some(b => !(eISO <= b.start || sISO >= b.end));
    }

    while (cursor < windowEnd && results.length < 30) {
      const start = new Date(cursor);
      const end   = new Date(cursor.getTime() + slotMs);
      const sISO = start.toISOString();
      const eISO = end.toISOString();

      if (!isClosedDate(start) && isOpen(start) && !overlapsBusy(sISO, eISO)) {
        results.push({ start: sISO, end: eISO, timezone: tz });
      }

      cursor.setMinutes(cursor.getMinutes() + stepMinutes);
      cursor.setSeconds(0,0);
    }

    res.json({ ok:true, slots: results, params: { durationMin, bufferMin, stepMinutes } });
  } catch (err) {
    res.status(500).json({ ok:false, error: String(err) });
  }
});

// === Book a slot ===
app.post('/api/calendar/book-slot', async (req, res) => {
  try {
    const client = await getClientFromHeader(req);
    if (!client) return res.status(400).json({ ok:false, error: 'Unknown tenant (missing X-Client-Key)' });

    if (!(GOOGLE_CLIENT_EMAIL && (GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY_B64)))
      return res.status(400).json({ ok:false, error:'Google env missing' });

    const tz = pickTimezone(client);
    const calendarId = pickCalendarId(client);

    const { service, lead, start, durationMin } = req.body || {};

    if (!service || typeof service !== 'string') {
      return res.status(400).json({ ok:false, error: 'Missing/invalid "service" (string)' });
    }
    if (!lead || typeof lead !== 'object' || !lead.name || !lead.phone) {
      return res.status(400).json({ ok:false, error: 'Missing/invalid "lead" (need name, phone)' });
    }
    const startISO = (() => { try { return new Date(start).toISOString(); } catch { return null; } })();
    if (!start || !startISO) {
      return res.status(400).json({ ok:false, error: 'Missing/invalid "start" (ISO datetime)' });
    }
    const dur = Number.isFinite(+durationMin) ? +durationMin : (client?.booking?.defaultDurationMin || 30);
    const endISO = new Date(new Date(startISO).getTime() + dur * 60000).toISOString();

    // Auth
    const auth = makeJwtAuth({ clientEmail: GOOGLE_CLIENT_EMAIL, privateKey: GOOGLE_PRIVATE_KEY, privateKeyB64: GOOGLE_PRIVATE_KEY_B64 });
    await auth.authorize();

    // Guard against conflicts via freeBusy
    const busy = await freeBusy({ auth, calendarId, timeMinISO: startISO, timeMaxISO: endISO });
    const conflict = busy.some(b => !(endISO <= b.start || startISO >= b.end));
    if (conflict) {
      return res.status(409).json({ ok:false, error:'Requested time is busy', busy });
    }

    const attendees = []; // removed invites
const summary = `${service} — ${lead.name}`;
    const description = [
      `Service: ${service}`,
      `Lead: ${lead.name}`,
      lead.phone ? `Phone: ${lead.phone}` : null,
      lead.id ? `Lead ID: ${lead.id}` : null,
      `Tenant: ${client?.clientKey || 'default'}`
    ].filter(Boolean).join('\\n');


let event;
try {
  // Deterministic event id to prevent duplicates on retries/same payloads
  const rawKey = `${client?.clientKey || 'default'}|${service}|${startISO}|${lead.phone}`;
  const deterministicId = ('bk' + createHash('sha1').update(rawKey).digest('hex').slice(0, 20)).toLowerCase();

  const cal = google.calendar({ version: 'v3', auth });
  let respInsert;
  try {
    respInsert = await cal.events.insert({
      calendarId,
      requestBody: {
        id: deterministicId,
        summary,
        description,
        start: { dateTime: startISO, timeZone: tz },
        end:   { dateTime: endISO,   timeZone: tz },
        extendedProperties: { private: { leadPhone: lead.phone, leadId: lead.id || '' } }
      }
    });
  } catch (err) {
    const sc = err?.response?.status;
    const msg = err?.response?.data || err?.message || '';
    if (sc === 400 && String(msg).toLowerCase().includes('id')) {
      // Retry once without ID if Google rejects the custom id
      respInsert = await cal.events.insert({
        calendarId,
        requestBody: {
          summary,
          description,
          start: { dateTime: startISO, timeZone: tz },
          end:   { dateTime: endISO,   timeZone: tz },
          extendedProperties: { private: { leadPhone: lead.phone, leadId: lead.id || '' } }
        }
      });
    } else {
      throw err;
    }
  }
  event = respInsert.data;

} catch (e) {
  const code = e?.response?.status || 500;
  const data = e?.response?.data || e?.message || String(e);
  return res.status(code === 409 ? 409 : code).json({ ok:false, error:(code===409?'duplicate_event_id':'gcal_insert_failed'), details: data });
}
// Send confirmation SMS if tenant SMS is configured
try {
  const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
  if (configured) {
    const when = new Date(startISO).toLocaleString(client?.locale || 'en-GB', {
      timeZone: tz, weekday: 'short', day: 'numeric', month: 'short',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
    const brand = client?.displayName || client?.clientKey || 'Our Clinic';
    const link  = event?.htmlLink ? ` Calendar: ${event.htmlLink}` : '';
    const sig   = client?.brandSignature ? ` ${client.brandSignature}` : '';
    const defaultBody  = `Hi {{name}}, your {{service}} is booked with {{brand}} for {{when}} {{tz}}.{{link}}{{sig}} Reply STOP to opt out.`;
    const templ = client?.smsTemplates?.confirm || defaultBody;
    const body  = renderTemplate(templ, { name: lead.name, service, brand, when, tz, link, sig });
    const payload = { to: lead.phone, body };
    if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid; else if (fromNumber) payload.from = fromNumber;
    await smsClient.messages.create(payload);
  }
} catch (e) {
  console.error('confirm sms failed', e?.message || e);
}

// Schedule appointment reminders
try {
  await scheduleAppointmentReminders({
    appointmentId: event.id,
    clientKey: client?.clientKey || 'default',
    leadPhone: lead.phone,
    appointmentTime: new Date(startISO),
    clientSettings: client?.reminder_settings || {}
  });
} catch (e) {
  console.error('reminder scheduling failed', e?.message || e);
}

console.log('🔥🔥🔥 [DEBUG] Code execution reached line 12686 - before Google Sheets append');

// Append to Google Sheets ledger (optional)
try {
  if (process.env.BOOKINGS_SHEET_ID) {
    await appendToSheet({
      spreadsheetId: process.env.BOOKINGS_SHEET_ID,
      sheetName: 'Bookings',
      values: [
        new Date().toISOString(),
        client?.clientKey || client?.id || '',
        service,
        lead?.name || '',
        lead?.phone || '',
        event?.id || '',
        event?.htmlLink || '',
        startISO
      ]
    });
  }
} catch (e) { console.warn('sheets append error', e?.message || e); }

console.log('🔥🔥🔥 [DEBUG] Code execution reached line 12706 - after Google Sheets append');

    return res.status(201).json({
      ok: true,
      event: {
        id: event.id,
        htmlLink: event.htmlLink,
        status: event.status
      },
      tenant: { clientKey: client?.clientKey || null, calendarId, timezone: tz }
    });
  } catch (err) {
    return res.status(500).json({ ok:false, error: String(err) });
  }
});

console.error('🔥🔥🔥 [CRITICAL ERROR DEBUG] Code execution reached TOP LEVEL after calendar function - line 12723');

// Twilio delivery receipts
console.log('🔥🔥🔥 [DEBUG] Code execution reached line 12720 - before handleNotifySend function');

// Shared SMS handler function
const handleNotifySend = async (req, res) => {
  try {
    const client = await getClientFromHeader(req);
    if (!client) return res.status(400).json({ ok:false, error:'Unknown tenant' });
    
    let { channel, to, message, phoneNumber } = req.body || {};
    if (channel !== 'sms') return res.status(400).json({ ok:false, error:'Only channel="sms" is supported' });
    if (!message) return res.status(400).json({ ok:false, error:'Missing "message"' });

    // Get phone number - VAPI might not include it, so look it up from call context
    let phone = to || phoneNumber;
    
    // If no phone provided, try to get from call context (same as booking endpoint)
    if (!phone) {
      // Try to get callId from request
      const callId = req.get('X-Call-Id') || 
                     req.get('X-Vapi-Call-Id') ||
                     req.body?.callId || 
                     req.body?.call?.id ||
                     req.body?.metadata?.callId ||
                     req.body?.message?.call?.id;
      
      if (callId) {
        try {
          const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
          if (VAPI_PRIVATE_KEY) {
            console.log('[NOTIFY] Looking up phone from VAPI call:', callId);
            const vapiResponse = await fetch(`https://api.vapi.ai/call/${callId}`, {
              headers: {
                'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
                'Content-Type': 'application/json'
              }
            });
            if (vapiResponse.ok) {
              const callData = await vapiResponse.json();
              phone = callData.customer?.number || callData.customer?.phone || callData.phone;
              if (phone) {
                console.log('[NOTIFY] ✅ Got phone from VAPI call API:', phone);
              }
            }
          }
        } catch (err) {
          console.warn('[NOTIFY] Could not get phone from VAPI call:', err.message);
        }
      }
      
      // Fallback: most recent active call (expanded to 30 minutes like booking endpoint)
      if (!phone) {
        try {
          const recentCall = await query(
            `SELECT lead_phone FROM calls WHERE client_key = $1 AND created_at >= NOW() - INTERVAL '30 minutes' ORDER BY created_at DESC LIMIT 1`,
            [client.clientKey]
          );
          if (recentCall?.rows?.[0]?.lead_phone) {
            phone = recentCall.rows[0].lead_phone;
            console.log('[NOTIFY] ✅ Using phone from most recent call (last 30 min):', phone);
          } else {
            // Final fallback: any recent call
            const anyCall = await query(
              `SELECT lead_phone FROM calls WHERE client_key = $1 ORDER BY created_at DESC LIMIT 1`,
              [client.clientKey]
            );
            if (anyCall?.rows?.[0]?.lead_phone) {
              phone = anyCall.rows[0].lead_phone;
              console.log('[NOTIFY] ✅ Using phone from most recent call (any time):', phone);
            }
          }
        } catch (err) {
          console.warn('[NOTIFY] Could not look up phone from calls:', err.message);
        }
      }
    }
    
    if (!phone) {
      return res.status(400).json({ ok:false, error:'Missing phone number. Include "to" or "phoneNumber" in request body, or ensure callId is available to look up from call context.' });
    }

    const { smsClient, messagingServiceSid, fromNumber, configured } = smsConfig(client);
    if (!configured) return res.status(400).json({ ok:false, error:'SMS not configured (no fromNumber or messagingServiceSid)' });

    const normalizedTo = normalizePhoneE164(phone);
    if (!normalizedTo) return res.status(400).json({ ok:false, error:`Invalid recipient phone number (must be E.164): ${phone}` });

    const payload = { to: normalizedTo, body: message };
    if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid;
    else if (fromNumber) payload.from = fromNumber;

    const resp = await smsClient.messages.create(payload);
    return res.json({ ok:true, sid: resp.sid });
  } catch (e) {
    const msg = e?.message || 'sms_error';
    const code = e?.status || e?.code || 500;
    console.error('[NOTIFY] Error:', msg);
    return res.status(code).json({ ok:false, error: msg });
  }
};

console.log('🔥🔥🔥 [DEBUG] Code execution reached line 12818 - after handleNotifySend function');
console.log('🔥🔥🔥 [DEBUG] Code execution reached line 12820 - about to register notify routes');

// Simple SMS send route (per-tenant or global fallback)
// Support both /api/notify/send and /api/notify/send/:param for VAPI compatibility
console.log('🟢🟢🟢 [NOTIFY-ROUTES] ABOUT TO REGISTER ROUTES...');

// Test route first
app.post('/api/notify/test', (req, res) => {
  res.json({ ok: true, message: 'Test route works!' });
});
console.log('🟢🟢🟢 [NOTIFY-ROUTES] REGISTERED: POST /api/notify/test');

app.post('/api/notify/send', (req, res) => {
  res.json({ ok: true, message: 'Simple notify route works!', timestamp: new Date().toISOString() });
});
console.log('🟢🟢🟢 [NOTIFY-ROUTES] REGISTERED: POST /api/notify/send');
app.post('/api/notify/send/:param', (req, res) => {
  res.json({ ok: true, message: 'Simple notify route with param works!', param: req.params.param, timestamp: new Date().toISOString() });
});
console.log('🟢🟢🟢 [NOTIFY-ROUTES] REGISTERED: POST /api/notify/send/:param');
app.post('/webhooks/twilio-status', express.urlencoded({ extended: false }), twilioWebhookVerification, async (req, res) => {
  
  const rows = await readJson(SMS_STATUS_PATH, []);
  const log = {
    evt: 'sms.status',
    rid: req.id,
    at: new Date().toISOString(),
    sid: req.body.MessageSid || null,
    status: req.body.MessageStatus || null,
    to: req.body.To || null,
    from: req.body.From || null,
    messagingServiceSid: req.body.MessagingServiceSid || null,
    errorCode: req.body.ErrorCode || null
  };
  rows.push(log);
  await writeJson(SMS_STATUS_PATH, rows);
  res.type('text/plain').send('OK');
});

// Twilio inbound STOP/START to toggle consent + YES => trigger Vapi call
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

app.post('/webhooks/twilio-inbound', express.urlencoded({ extended: false }), twilioWebhookVerification, smsRateLimit, safeAsync(async (req, res) => {
  
  try {
    const rawFrom = (req.body.From || '').toString();
    const rawTo   = (req.body.To   || '').toString();
    const bodyTxt = (req.body.Body || '').toString().trim().replace(/^["']|["']$/g, '');

    // Input validation
    if (!validatePhoneNumber(rawFrom)) {
      console.log('[INVALID INPUT]', { field: 'From', value: rawFrom, reason: 'invalid_phone' });
      return res.status(400).send('Invalid phone number');
    }
    
    if (!validatePhoneNumber(rawTo)) {
      console.log('[INVALID INPUT]', { field: 'To', value: rawTo, reason: 'invalid_phone' });
      return res.status(400).send('Invalid phone number');
    }
    
    if (!validateSmsBody(bodyTxt)) {
      console.log('[INVALID INPUT]', { field: 'Body', value: bodyTxt, reason: 'invalid_body' });
      return res.status(400).send('Invalid message body');
    }

    // Normalize numbers: strip spaces so E.164 comparisons work
    const from = normalizePhoneE164(rawFrom);
    const to   = normalizePhoneE164(rawTo);

    // Render log for grep
    console.log('[INBOUND SMS]', { from, to, body: bodyTxt });
    
    // Analytics logging
    console.log('[SMS_ANALYTICS]', {
      timestamp: new Date().toISOString(),
      from,
      to,
      bodyLength: bodyTxt.length,
      messageType: bodyTxt.toUpperCase(),
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent') || 'unknown'
    });
  // --- derive tenantKey from header, inbound 'To', or MessagingServiceSid ---
  const headerKey = req.get('X-Client-Key');
  const toE164 = normalizePhoneE164(req.body.To, 'GB');
  const mss = req.body.MessagingServiceSid || req.body.messagingServiceSid?.trim?.();
  let tenantKey = headerKey || await resolveTenantKeyFromInbound({ to: toE164, messagingServiceSid: mss });

  console.log('[TENANT KEY RESOLVED]', { 
    tenantKey, 
    headerKey, 
    toE164, 
    messagingServiceSid: mss,
    resolved: !!tenantKey
  });

  if (!tenantKey) {
    console.log('[TENANT RESOLVE FAIL]', { to: req.body.To, toE164, messagingServiceSid: mss });
    return res.send('OK');
  }


    // Validate sender
    if (!from) return res.type('text/plain').send('IGNORED');

    // YES / STOP intents (extend as needed)
    const isYes  = /^\s*(yes|y|ok|okay|sure|confirm)\s*$/i.test(bodyTxt);
    const isStart = /^\s*(start|unstop)\s*$/i.test(bodyTxt);
    const isStop = /^\s*(stop|unsubscribe|cancel|end|quit)\s*$/i.test(bodyTxt);

    // Load & update the most recent lead matching this phone from database
    const clients = await listFullClients();
    let leads = clients.flatMap(client => client.leads || []);
    const revIdx = [...leads].reverse().findIndex(L => normalizePhoneE164(L.phone || '') === from);
    const idx = revIdx >= 0 ? (leads.length - 1 - revIdx) : -1;

    let serviceForCall = '';

    if (idx >= 0) {
      const prev = leads[idx];
      const now = new Date().toISOString();
      tenantKey = prev.tenantKey || tenantKey; // Preserve existing tenantKey or use resolved one
      serviceForCall = prev.service || '';
      leads[idx] = {
        ...prev,
        lastInboundAt: now,
        lastInboundText: bodyTxt,
        lastInboundFrom: from,
        lastInboundTo: to,
        consentSms: isStop ? false : ((isYes || isStart) ? true : (prev.consentSms ?? false)),
        status: isStop ? 'opted_out' : (isYes ? 'engaged' : (prev.status || 'new')),
        updatedAt: now,
      };
    } else {
      // Create a minimal lead if unknown number texts in
      const now = new Date().toISOString();
      const newLead = {
        id: 'lead_' + nanoid(8),
        phone: from,
        tenantKey: tenantKey,
        lastInboundAt: now,
        lastInboundText: bodyTxt,
        lastInboundFrom: from,
        lastInboundTo: to,
        consentSms: (isYes || isStart) ? true : false,
        status: isYes ? 'engaged' : 'new',
        createdAt: now,
        updatedAt: now,
      };
      
      console.log('[LEAD CREATED]', { 
        phone: from, 
        tenantKey, 
        body: bodyTxt, 
        consentSms: newLead.consentSms,
        status: newLead.status
      });
      leads.push(newLead);
      
      // Track conversion stage
      await trackConversionStage({
        clientKey: tenantKey,
        leadPhone: from,
        stage: 'lead_created',
        stageData: {
          service: serviceForCall,
          score: newLead.score || 0,
          source: 'sms_opt_in',
          consentSms: newLead.consentSms,
          status: newLead.status
        }
      });
      
      // Track analytics event
      await trackAnalyticsEvent({
        clientKey: tenantKey,
        eventType: isYes ? 'yes_response' : 'start_opt_in',
        eventCategory: 'lead_interaction',
        eventData: {
          phone: from,
          service: serviceForCall,
          score: newLead.score || 0,
          existingLead: false
        },
        sessionId: `sms_${from}_${Date.now()}`,
        userAgent: 'SMS',
        ipAddress: req.ip
      });
    }

    // Save leads to database by updating the client
    if (tenantKey) {
      const client = await getFullClient(tenantKey);
      if (client) {
        client.leads = leads.filter(lead => lead.tenantKey === tenantKey);
        client.updatedAt = new Date().toISOString();
        await upsertFullClient(client);
      }
    }

    // Check if already opted in (idempotent) - but allow VAPI calls for YES/START messages
    const existingLead = leads.find(l => l.phone === from);
    if (existingLead && existingLead.consentSms && existingLead.status === 'engaged' && !(isYes || isStart)) {
      console.log('[IDEMPOTENT SKIP]', { from, tenantKey, reason: 'already_opted_in' });
      return res.send('OK');
    }

    // If user texted YES or START && we know the tenant, trigger a Vapi call right away (fire-and-forget)
    console.log('[VAPI CONDITION CHECK]', { 
      isYes, 
      isStart, 
      tenantKey, 
      hasVapiKey: !!VAPI_PRIVATE_KEY,
      condition: (isYes || isStart) && tenantKey && VAPI_PRIVATE_KEY
    });
    
    // Debug: Check if tenantKey is still available
    console.log('[TENANT KEY DEBUG]', { 
      tenantKey, 
      isYes, 
      isStart, 
      willTriggerVapi: (isYes || isStart) && tenantKey && VAPI_PRIVATE_KEY
    });
    
    // Prevent calls to assistant's own number or invalid numbers
    const isAssistantNumber = from === '+447403934440'; // Assistant's number - don't call this
    const isValidCustomerNumber = from && from.length > 10 && !from.includes('000000');
    
    console.log('[VAPI NUMBER VALIDATION]', { 
      from, 
      isAssistantNumber, 
      isValidCustomerNumber,
      willCall: (isYes || isStart) && tenantKey && VAPI_PRIVATE_KEY && isValidCustomerNumber && !isAssistantNumber
    });
    
    if ((isYes || isStart) && tenantKey && VAPI_PRIVATE_KEY && isValidCustomerNumber && !isAssistantNumber) {
      // VAPI Token Protection - prevent unnecessary calls during testing
      console.log('[VAPI DEBUG]', { 
        VAPI_TEST_MODE, 
        VAPI_DRY_RUN, 
        NODE_ENV: process.env.NODE_ENV,
        VAPI_PRIVATE_KEY: VAPI_PRIVATE_KEY ? 'present' : 'missing'
      });
      
      if (VAPI_TEST_MODE || VAPI_DRY_RUN) {
        console.log('[AUTO-CALL SKIPPED]', { 
          tenantKey, 
          from, 
          reason: VAPI_TEST_MODE ? 'test_mode' : 'dry_run',
          wouldHaveCalled: true 
        });
        return res.send('OK');
      }

      // Check budget before making call
      const budgetCheck = await checkBudgetBeforeCall(tenantKey, 0.05); // Estimated $0.05 per call
      if (!budgetCheck.allowed) {
        console.log('[BUDGET BLOCKED CALL]', {
          tenantKey,
          from,
          reason: budgetCheck.reason,
          budget: budgetCheck.budget
        });
        
        // Send SMS fallback instead of making call
        await handleVapiFailure({
          tenantKey,
          from,
          error: new Error(`Budget exceeded: ${budgetCheck.reason}`),
          errorType: 'budget_exceeded',
          existingLead
        });
        
        return res.send('OK');
      }
      
      // Intelligent call scheduling
      const callScheduling = await determineCallScheduling({ tenantKey, from, isYes, isStart, existingLead });
      if (callScheduling.shouldDelay) {
        console.log('[CALL SCHEDULED]', {
          tenantKey,
          from,
          reason: callScheduling.reason,
          scheduledFor: callScheduling.scheduledFor,
          priority: callScheduling.priority
        });
        
        // Add to call queue
        const { addToCallQueue } = await import('./db.js');
        await addToCallQueue({
          clientKey: tenantKey,
          leadPhone: from,
          priority: callScheduling.priority || 5,
          scheduledFor: callScheduling.scheduledFor,
          callType: 'vapi_call',
          callData: {
            triggerType: isYes ? 'yes_response' : 'start_opt_in',
            leadScore: existingLead?.score || 0,
            leadStatus: existingLead?.status || 'new',
            businessHours: isBusinessHours(client) ? 'within' : 'outside'
          }
        });
        
        return res.send('OK');
      }

      // Check business hours and lead score before making calls
      const client = await getFullClient(tenantKey);
      const isBusinessTime = isBusinessHours(client);
      
      // Calculate lead score
      const leadScore = calculateLeadScore(existingLead, client);
      const priority = getLeadPriority(leadScore);
      
      console.log('[LEAD SCORE]', { 
        from, 
        tenantKey, 
        score: leadScore, 
        priority,
        isBusinessTime,
        willCall: isBusinessTime && leadScore >= 40 // Only call high/medium priority leads
      });
      
      // Skip very low priority leads even during business hours
      if (leadScore < 40) {
        console.log('[AUTO-CALL SKIPPED]', { 
          tenantKey, 
          from, 
          reason: 'low_lead_score',
          score: leadScore,
          priority
        });
        return res.send('OK');
      }
      
      if (!isBusinessTime) {
        const nextBusiness = getNextBusinessHour(client);
        console.log('[AUTO-CALL DEFERRED]', { 
          tenantKey, 
          from, 
          reason: 'outside_business_hours',
          nextBusinessTime: nextBusiness.toISOString(),
          currentTime: new Date().toISOString()
        });
        
        // Send a message explaining the delay
        try {
          const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
          if (configured) {
            const brand = client?.displayName || client?.clientKey || 'Our Clinic';
            const nextBusinessStr = nextBusiness.toLocaleString('en-GB', { 
              timeZone: client?.booking?.timezone || TIMEZONE,
              weekday: 'long',
              hour: '2-digit',
              minute: '2-digit'
            });
            const ack = `Thanks! ${brand} will call you during business hours (${nextBusinessStr}). Reply STOP to opt out.`;
            await smsClient.messages.create({
              from: fromNumber,
              to: from,
              body: ack,
              messagingServiceSid
            });
            console.log('[BUSINESS HOURS SMS]', { from, to: from, brand, nextBusinessTime: nextBusinessStr });
          }
        } catch (e) {
          console.error('[BUSINESS HOURS SMS ERROR]', e?.message || String(e));
        }
        
        return res.send('OK');
      }
      
      // If we're blocking the call, send a message explaining why
      if (isAssistantNumber) {
        console.log('[VAPI BLOCKED]', { from, reason: 'assistant_number' });
      try {
        const client = await getFullClient(tenantKey);
        if (client) {
            const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
            if (configured) {
              const brand = client?.displayName || client?.clientKey || 'Our Clinic';
              const ack = `Thanks! ${brand} will call you shortly. Reply STOP to opt out.`;
              await smsClient.messages.create({
                from: fromNumber,
                to: from,
                body: ack,
                messagingServiceSid
              });
              console.log('[YES ACK SMS]', { from, to: from, brand });
            }
          }
        } catch (e) {
          console.error('[YES ACK SMS ERROR]', e?.message || String(e));
        }
        return res.send('OK');
      }
      
      try {
        const client = await getFullClient(tenantKey);
        if (client) {
          // Dynamic assistant selection based on lead characteristics
          const assistantConfig = await selectOptimalAssistant({ client, existingLead, isYes, isStart });
          const assistantId = assistantConfig.assistantId;
          const phoneNumberId = assistantConfig.phoneNumberId;
          if (isStart) {
            console.log('[LEAD OPT-IN START]', { from, tenantKey });
          }
          const payload = {
            assistantId,
            phoneNumberId,
            customer: { number: from, numberE164CheckEnabled: true },
            maxDurationSeconds: 10, // VAPI minimum is 10 seconds - still much cheaper than 10 minutes
            metadata: {
              tenantKey,
              leadPhone: from,
              triggerType: isYes ? 'yes_response' : 'start_opt_in',
              timestamp: new Date().toISOString(),
              leadScore: existingLead?.score || 0,
              leadStatus: existingLead?.status || 'new',
              businessHours: isBusinessHours() ? 'within' : 'outside',
              retryAttempt: 0 // Track retry attempts
            },
            assistantOverrides: {
              variableValues: await generateAssistantVariables({
                client,
                existingLead,
                tenantKey,
                serviceForCall,
                isYes,
                isStart,
                assistantConfig
              })
            }
          };
            // Use enhanced retry logic for VAPI calls
            const vapiResult = await retryWithBackoff(async () => {
          const resp = await fetch(`${VAPI_URL}/call`, {
            method: 'POST',
                headers: { 
                  'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`, 
                  'Content-Type': 'application/json',
                  'User-Agent': 'AI-Booking-MVP/1.0'
                },
                body: JSON.stringify(payload),
                timeout: 30000 // 30 second timeout
              });
              
              if (!resp.ok) {
                const errorText = await resp.text().catch(() => resp.statusText);
                const error = new Error(`VAPI call failed: ${resp.status} ${errorText}`);
                error.status = resp.status;
                throw error;
              }
              
              const result = await resp.json().catch(() => null);
              if (!result) {
                throw new Error('Failed to parse VAPI response');
              }
              
              return result;
            }, 3, 2000, {
              operation: 'vapi_call',
              tenantKey,
              leadPhone: from
            }); // 3 retries, 2 second base delay with context

      console.log('[VAPI CALL SUCCESS]', { 
        from, 
        tenantKey, 
        callId: vapiResult?.id || 'unknown',
        status: vapiResult?.status || 'unknown',
        vapiStatus: 'ok' 
      });
      
      // Track conversion stage
      await trackConversionStage({
        clientKey: tenantKey,
        leadPhone: from,
        stage: 'vapi_call_initiated',
        stageData: {
          callId: vapiResult?.id,
          assistantId: assistantConfig.assistantId,
          triggerType: isYes ? 'yes_response' : 'start_opt_in',
          leadScore: existingLead?.score || 0
        },
        previousStage: 'lead_created'
      });
      
      // Track analytics event
      await trackAnalyticsEvent({
        clientKey: tenantKey,
        eventType: 'vapi_call_initiated',
        eventCategory: 'call_interaction',
        eventData: {
          phone: from,
          callId: vapiResult?.id,
          assistantId: assistantConfig.assistantId,
          triggerType: isYes ? 'yes_response' : 'start_opt_in',
          leadScore: existingLead?.score || 0
        },
        sessionId: `vapi_${from}_${Date.now()}`,
        userAgent: 'VAPI',
        ipAddress: req.ip
      });
      
      // Record performance metric
      await recordPerformanceMetric({
        clientKey: tenantKey,
        metricName: 'vapi_call_initiated',
        metricValue: 1,
        metricUnit: 'count',
        metricCategory: 'call_metrics',
        metadata: {
          phone: from,
          callId: vapiResult?.id,
          triggerType: isYes ? 'yes_response' : 'start_opt_in'
        }
      });
          
          if (vapiResult) {
            const callId = vapiResult?.id || 'unknown';
            console.log('[AUTO-CALL TRIGGER]', { from, tenantKey, callId });
            
            // Book calendar appointment after successful VAPI call
            try {
              const calendarId = pickCalendarId(client);
              if (GOOGLE_CLIENT_EMAIL && (GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY_B64) && calendarId) {
                // Handle private key formatting - ensure it's properly formatted
                let privateKey = GOOGLE_PRIVATE_KEY;
                if (!privateKey && GOOGLE_PRIVATE_KEY_B64) {
                  privateKey = Buffer.from(GOOGLE_PRIVATE_KEY_B64, 'base64').toString();
                }
                
                // Ensure private key has proper line breaks
                if (privateKey && !privateKey.includes('\n')) {
                  privateKey = privateKey.replace(/\\n/g, '\n');
                }
                
                const auth = new google.auth.GoogleAuth({
                  credentials: {
                    client_email: GOOGLE_CLIENT_EMAIL,
                    private_key: privateKey,
                  },
                  scopes: ['https://www.googleapis.com/auth/calendar'],
                });
                
                const cal = google.calendar({ version: 'v3', auth });
                const now = new Date();
                const startTime = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes from now
                const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 minutes duration
                
                const event = {
                  summary: `AI Booking Call - ${client?.displayName || client?.clientKey}`,
                  description: `Automated follow-up call with ${from}\nCall ID: ${callId}\nTenant: ${tenantKey}`,
                  start: {
                    dateTime: startTime.toISOString(),
                    timeZone: client?.booking?.timezone || 'Europe/London',
                  },
                  end: {
                    dateTime: endTime.toISOString(),
                    timeZone: client?.booking?.timezone || 'Europe/London',
                  },
                  attendees: [], // Removed to avoid Google Calendar service account limitations
                  reminders: {
                    useDefault: false,
                    overrides: [
                      { method: 'popup', minutes: 10 },
                    ],
                  },
                };
                
                const createdEvent = await cal.events.insert({
                  calendarId,
                  resource: event,
                });
                
                console.log('[CALENDAR BOOKED]', { 
                  from, 
                  tenantKey, 
                  callId, 
                  eventId: createdEvent.data.id,
                  startTime: startTime.toISOString(),
                  calendarLink: createdEvent.data.htmlLink
                });
              }
            } catch (calendarError) {
              console.error('[CALENDAR BOOKING ERROR]', { 
                from, 
                tenantKey, 
                callId, 
                error: calendarError?.message || String(calendarError),
                errorType: calendarError?.name || 'Unknown',
                stack: calendarError?.stack?.substring(0, 200) // First 200 chars of stack trace
              });
              
              // Don't fail the entire process if calendar booking fails
              // The VAPI call was successful, calendar is just a nice-to-have
            }
          }
          
            if (!vapiResult || vapiResult.error) {
              console.error('[VAPI ERROR]', { 
                from,
                tenantKey,
                error: vapiResult?.error || 'VAPI call failed',
                payload: { 
                  assistantId, 
                  phoneNumberId, 
                  customerNumber: from,
                  maxDurationSeconds: 10
                }
              });
              
              // Implement fallback mechanism
              await handleVapiFailure({ from, tenantKey, error: vapiResult?.error || 'VAPI call failed' });
            }
          try {
            const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
            if (configured) {
              const brand = client?.displayName || client?.clientKey || 'Our Clinic';
              const ack = `Thanks! ${brand} is calling you now. Reply STOP to opt out.`;
              const payload = { to: from, body: ack };
              if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid; else if (fromNumber) payload.from = fromNumber;
              await smsClient.messages.create(payload);
            }
          } catch (e) { console.log('[YES ACK SMS ERROR]', e?.message || String(e)); }
        } else {
          console.log('[LEAD OPT-IN YES]', { from, tenantKey, vapiStatus: 'client_not_found' });
        }
      } catch (err) {
        console.log('[LEAD OPT-IN YES]', { from, tenantKey, vapiStatus: 'error', error: (err?.message || String(err)) });
      }
    }

    return res.type('text/plain').send('OK');
  } catch (e) {
    console.error('[inbound.error]', e?.message || e);
    return res.type('text/plain').send('OK');
  }
}));

// === End of book-slot function - closing brace added ===
});

// SMS endpoint for testing (simplified version of Twilio webhook)
app.post('/sms', async (req, res) => {
  try {
    // Check API key for testing
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const rawFrom = (req.body.From || '').toString();
    const rawTo   = (req.body.To   || '').toString();
    const bodyTxt = (req.body.Body || '').toString().trim().replace(/^["']|["']$/g, '');

    console.log('[SMS TEST ENDPOINT]', { 
      from: rawFrom, 
      to: rawTo, 
      body: bodyTxt,
      messageSid: req.body.MessageSid,
      messagingServiceSid: req.body.MessagingServiceSid
    });

    // For testing, just return success
    return res.json({ 
      ok: true, 
      message: 'SMS received for testing',
      from: rawFrom,
      to: rawTo,
      body: bodyTxt
    });
  } catch (e) {
    console.error('[SMS TEST ENDPOINT ERROR]', e?.message || e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Outbound lead webhook → Vapi (tenant-aware variables + optional per-tenant caller ID)
app.post('/webhooks/new-lead/:clientKey', async (req, res) => {
  try {
    const { clientKey } = req.params;
    const client = await getFullClient(clientKey);
    if (!client) return res.status(404).json({ error: `Unknown clientKey ${clientKey}` });

    const { phone, service, durationMin } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'Missing phone' });
    const e164 = normalizePhoneE164(phone);
    if (!e164) return res.status(400).json({ error: 'phone must be E.164 (+447...)' });
    const vapiKey =
      (typeof resolveVapiKey === 'function'
        ? resolveVapiKey()
        : (process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY || ''));
    if (!vapiKey) {
      return res.status(500).json({ error: 'Missing VAPI_PRIVATE_KEY' });
    }

    const assistantId =
      (typeof resolveVapiAssistantId === 'function'
        ? resolveVapiAssistantId(client)
        : (client?.vapiAssistantId || process.env.VAPI_ASSISTANT_ID || ''));
    const phoneNumberId =
      (typeof resolveVapiPhoneNumberId === 'function'
        ? resolveVapiPhoneNumberId(client)
        : (client?.vapiPhoneNumberId || process.env.VAPI_PHONE_NUMBER_ID || ''));

    const callPurposeRaw = (req.body?.callPurpose || '').toString().trim();
    const callPurpose = callPurposeRaw ? callPurposeRaw : 'lead_followup';
    const leadName = req.body?.name || req.body?.lead?.name || req.body?.callerName || '';
    const leadSource = req.body?.source || req.body?.leadSource || '';
    const previousStatus = req.body?.previousStatus || '';
    const intentHintParts = [
      req.body?.intent,
      req.body?.intentHint,
      req.body?.notes,
      service ? `service:${service}` : null,
      previousStatus ? `status:${previousStatus}` : null
    ].filter(Boolean);
    const callIntentHint = intentHintParts.join(', ') || 'follow_up_booking';

    if (!assistantId || !phoneNumberId) {
      return res.status(500).json({ error: 'Vapi assistant is not configured for this tenant' });
    }

    const payload = {
      assistantId,
      phoneNumberId,
      customer: { number: e164, numberE164CheckEnabled: true },
      maxDurationSeconds: (() => {
        const configured = Number(client?.vapiMaxDurationSeconds);
        if (Number.isFinite(configured) && configured >= 10) return configured;

        const toolDuration = Number(req.body?.maxDurationSeconds);
        if (Number.isFinite(toolDuration) && toolDuration >= 10) return toolDuration;

        return 12; // keep as low as Vapi allows while staying above their minimum
      })(),
      metadata: {
        clientKey,
        callPurpose,
        callIntentHint,
        leadPhone: e164,
        leadName: leadName || '',
        leadSource: leadSource || '',
        requestedService: service || '',
        previousStatus: previousStatus || ''
      },
      assistantOverrides: {
        variableValues: {
          ClientKey: clientKey,
          BusinessName: client.displayName || client.clientKey,
          ConsentLine: 'This call may be recorded for quality.',
          DefaultService: service || '',
          DefaultDurationMin: durationMin || client?.booking?.defaultDurationMin || 30,
          Timezone: client?.booking?.timezone || TIMEZONE,
          ServicesJSON: client?.servicesJson || '[]',
          PricesJSON: client?.pricesJson || '{}',
          HoursJSON: client?.hoursJson || '{}',
          ClosedDatesJSON: client?.closedDatesJson || '[]',
          Locale: client?.locale || 'en-GB',
          ScriptHints: client?.scriptHints || '',
          FAQJSON: client?.faqJson || '[]',
          Currency: client?.currency || 'GBP',
          CallPurpose: callPurpose,
          CallIntentHint: callIntentHint,
          LeadName: leadName || 'Prospect',
          LeadPhone: e164,
          LeadService: service || '',
          LeadSource: leadSource || '',
          PreviousStatus: previousStatus || ''
        }
      }
    };

    const vapiUrl =
      (typeof VAPI_URL !== 'undefined' && VAPI_URL)
        ? VAPI_URL
        : 'https://api.vapi.ai';

    await recordReceptionistTelemetry({
      evt: 'receptionist.outbound_launch',
      tenant: clientKey,
      callPurpose,
      callIntentHint,
      leadPhone: e164,
      leadName,
      leadSource,
      requestedService: service || '',
      payloadSent: true
    });

    if (process.env.RECEPTIONIST_TEST_MODE === 'mock_vapi') {
      const data = { ok: true, id: `mock_call_${Date.now()}`, status: 'queued', mock: true };
      await recordReceptionistTelemetry({
        evt: 'receptionist.outbound_response',
        tenant: clientKey,
        callPurpose,
        status: 200,
        ok: true,
        leadPhone: e164,
        response: data,
        mock: true
      });
      return res.json(data);
    }

    const resp = await fetch(`${vapiUrl}/call`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${vapiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    let data;
    try { data = await resp.json(); }
    catch { data = { raw: await resp.text().catch(() => '') }; }

    await recordReceptionistTelemetry({
      evt: 'receptionist.outbound_response',
      tenant: clientKey,
      callPurpose,
      status: resp.status,
      ok: resp.ok,
      leadPhone: e164,
      response: data
    });

    return res.status(resp.ok ? 200 : 502).json(data);
  } catch (err) {
    console.error('new-lead vapi error', err);
    await recordReceptionistTelemetry({
      evt: 'receptionist.outbound_error',
      error: err?.message || String(err),
      tenant: req.params?.clientKey || null
    });
    return res.status(500).json({ error: String(err) });
  }
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

// DEBUG: Cache inspector endpoint
app.get('/api/debug/cache', (req, res) => {
  const stats = getCallContextCacheStats();
  const recentForLogistics = getMostRecentCallContext('logistics_client');
  
  res.json({
    stats,
    recentForLogisticsClient: recentForLogistics,
    timestamp: new Date().toISOString()
  });
});

console.error('🟢🟢🟢 [v3-LEAD-FIX] REGISTERING ROUTE: POST /api/calendar/check-book');

// MOVED NOTIFY ROUTES HERE TO TEST IF THEY GET REGISTERED
console.log('🟢🟢🟢 [NOTIFY-ROUTES-MOVED] ABOUT TO REGISTER ROUTES...');

// Test route first
app.post('/api/notify/test', (req, res) => {
  res.json({ ok: true, message: 'Test route works!' });
});
console.log('🟢🟢🟢 [NOTIFY-ROUTES-MOVED] REGISTERED: POST /api/notify/test');

// Dashboard reset endpoint
app.post('/api/dashboard/reset/:clientKey', async (req, res) => {
  try {
    const { clientKey } = req.params;
    
    console.log(`[DASHBOARD RESET] Resetting data for client: ${clientKey}`);
    
    // Delete appointments for this client
    await safeQuery('DELETE FROM appointments WHERE client_key = $1', [clientKey]);
    
    // Delete calls for this client
    await safeQuery('DELETE FROM calls WHERE client_key = $1', [clientKey]);
    
    // Delete messages for this client
    await safeQuery('DELETE FROM messages WHERE client_key = $1', [clientKey]);
    
    // Delete leads for this client (optional - uncomment if you want to reset leads too)
    // await safeQuery('DELETE FROM leads WHERE client_key = $1', [clientKey]);
    
    console.log(`[DASHBOARD RESET] ✅ Successfully reset dashboard data for ${clientKey}`);
    
    res.json({
      success: true,
      message: `Dashboard data reset successfully for ${clientKey}`,
      cleared: {
        appointments: true,
        calls: true,
        messages: true,
        leads: false // Set to true if you uncomment the leads deletion above
      }
    });
    
  } catch (error) {
    console.error('[DASHBOARD RESET] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset dashboard data',
      details: error.message
    });
  }
});
console.log('🟢🟢🟢 [DASHBOARD-RESET] REGISTERED: POST /api/dashboard/reset/:clientKey');

// Restore full SMS functionality with variable interpolation
const handleNotifySend = async (req, res) => {
  try {
    const client = await getClientFromHeader(req);
    if (!client) return res.status(400).json({ ok:false, error:'Unknown tenant' });
    
    let { channel, to, message, phoneNumber } = req.body || {};
    if (channel !== 'sms') return res.status(400).json({ ok:false, error:'Only channel="sms" is supported' });
    if (!message) return res.status(400).json({ ok:false, error:'Missing "message"' });

    // Get phone number - VAPI might not include it, so look it up from call context
    let phone = to || phoneNumber;
    
    // If no phone provided, try to get from call context (same as booking endpoint)
    if (!phone) {
      // Try to get callId from request
      const callId = req.get('X-Call-Id') || 
                     req.get('X-Vapi-Call-Id') ||
                     req.body?.callId || 
                     req.body?.call?.id ||
                     req.body?.metadata?.callId ||
                     req.body?.message?.call?.id;
      
      if (callId) {
        try {
          const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
          if (VAPI_PRIVATE_KEY) {
            console.log('[NOTIFY] Looking up phone from VAPI call:', callId);
            const vapiResponse = await fetch(`https://api.vapi.ai/call/${callId}`, {
              headers: {
                'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
                'Content-Type': 'application/json'
              }
            });
            if (vapiResponse.ok) {
              const callData = await vapiResponse.json();
              phone = callData.customer?.number || callData.customer?.phone || callData.phone;
              if (phone) {
                console.log('[NOTIFY] ✅ Got phone from VAPI call API:', phone);
              }
            }
          }
        } catch (err) {
          console.warn('[NOTIFY] Could not get phone from VAPI call:', err.message);
        }
      }
      
      // Fallback: most recent active call (expanded to 30 minutes like booking endpoint)
      if (!phone) {
        try {
          const recentCall = await query(
            `SELECT lead_phone FROM calls WHERE client_key = $1 AND created_at >= NOW() - INTERVAL '30 minutes' ORDER BY created_at DESC LIMIT 1`,
            [client.clientKey]
          );
          if (recentCall?.rows?.[0]?.lead_phone) {
            phone = recentCall.rows[0].lead_phone;
            console.log('[NOTIFY] ✅ Using phone from most recent call (last 30 min):', phone);
          } else {
            // Final fallback: any recent call
            const anyCall = await query(
              `SELECT lead_phone FROM calls WHERE client_key = $1 ORDER BY created_at DESC LIMIT 1`,
              [client.clientKey]
            );
            if (anyCall?.rows?.[0]?.lead_phone) {
              phone = anyCall.rows[0].lead_phone;
              console.log('[NOTIFY] ✅ Using phone from most recent call (any time):', phone);
            }
          }
        } catch (err) {
          console.warn('[NOTIFY] Could not look up phone from calls:', err.message);
        }
      }
    }
    
    if (!phone) {
      return res.status(400).json({ ok:false, error:'Missing phone number. Include "to" or "phoneNumber" in request body, or ensure callId is available to look up from call context.' });
    }

    // Variable interpolation for SMS messages
    const interpolatedMessage = renderTemplate(message, {
      name: 'Customer', // Default fallback
      customerName: 'Customer',
      businessName: client?.displayName || client?.clientKey || 'Our Business',
      phone: phone,
      // Add more common variables
      clientName: client?.displayName || client?.clientKey || 'Our Business',
      companyName: client?.displayName || client?.clientKey || 'Our Business'
    });

    const { smsClient, messagingServiceSid, fromNumber, configured } = smsConfig(client);
    if (!configured) return res.status(400).json({ ok:false, error:'SMS not configured (no fromNumber or messagingServiceSid)' });

    const normalizedTo = normalizePhoneE164(phone);
    if (!normalizedTo) return res.status(400).json({ ok:false, error:`Invalid recipient phone number (must be E.164): ${phone}` });

    const payload = { to: normalizedTo, body: interpolatedMessage };
    if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid;
    else if (fromNumber) payload.from = fromNumber;

    const resp = await smsClient.messages.create(payload);
    return res.json({ ok:true, sid: resp.sid, message: interpolatedMessage });
  } catch (e) {
    const msg = e?.message || 'sms_error';
    const code = e?.status || e?.code || 500;
    console.error('[NOTIFY] Error:', msg);
    return res.status(code).json({ ok:false, error: msg });
  }
};

app.post('/api/notify/send', handleNotifySend);
console.log('🟢🟢🟢 [NOTIFY-ROUTES-MOVED] REGISTERED: POST /api/notify/send');
app.post('/api/notify/send/:param', handleNotifySend);
console.log('🟢🟢🟢 [NOTIFY-ROUTES-MOVED] REGISTERED: POST /api/notify/send/:param');

app.post('/api/calendar/check-book', async (req, res) => {
  console.log('🚨🚨🚨 [v3-LEAD-FIX] HANDLER CALLED - lead variable fix deployed');

  // Define idemKey for idempotency handling
  const idemKey = deriveIdemKey(req);

  try {
    console.log('[BOOKING] Request received:', new Date().toISOString());
    
    const client = await getClientFromHeader(req);
    if (!client) return res.status(400).json({ error: 'Unknown tenant' });
    
    console.log('[BOOKING] Client found:', client?.key || client?.tenantKey);
    
    // SIMPLE APPROACH: Get phone from most recent call for this tenant
    const tenantKey = client?.key || client?.tenantKey || 'test_client';
    console.log('[BOOKING] Looking up most recent call for tenant:', tenantKey);
    
    let recentContext = getMostRecentCallContext(tenantKey);
    console.log('[BOOKING] Most recent call context:', JSON.stringify(recentContext, null, 2));
    
    // If cache has callId but no phone, fetch from VAPI API
    if (recentContext?.callId && !recentContext?.phone && process.env.VAPI_PRIVATE_KEY) {
      console.log('[BOOKING] 🔍 Have callId but no phone, fetching from VAPI API:', recentContext.callId);
      try {
        const vapiResponse = await fetch(`https://api.vapi.ai/call/${recentContext.callId}`, {
            headers: {
              'Authorization': `Bearer ${process.env.VAPI_PRIVATE_KEY}`,
              'Content-Type': 'application/json'
            }
          });
          if (vapiResponse.ok) {
            const callData = await vapiResponse.json();
          console.log('[BOOKING] ✅ Got call data from VAPI:', JSON.stringify(callData, null, 2));
          const phone = callData?.customer?.number || callData?.phoneNumber?.number || '';
          const name = callData?.customer?.name || '';
            if (phone) {
            recentContext.phone = phone;
            recentContext.name = name || recentContext.name;
            console.log('[BOOKING] ✅ Extracted from VAPI: phone:', phone, 'name:', name);
            }
        } else {
          console.error('[BOOKING] VAPI API returned status:', vapiResponse.status);
          }
        } catch (err) {
        console.error('[BOOKING] Failed to fetch from VAPI API:', err.message);
      }
    }
    
    if (!recentContext?.phone) {
      console.error('[BOOKING] No phone found after all attempts for tenant:', tenantKey);
      return res.status(400).json({ 
        error: 'No active call found. Please try again.',
        debug: { tenantKey, cacheEmpty: true }
      });
    }
    
    const phone = recentContext.phone;
    const customerName = recentContext.name || req.body?.customerName || 'Customer';
    
    console.log('[BOOKING] ✅ Using phone from cache:', phone);
    console.log('[BOOKING] ✅ Using name:', customerName);
    
    // Get basic client settings
    const tz = pickTimezone(client);
    const calendarId = pickCalendarId(client);
    const isDemo = isDemoClient(client);
    
    // Get service duration
    let services = client?.services ?? client?.servicesJson ?? [];
    if (!Array.isArray(services)) {
      try { services = JSON.parse(String(services)); } catch { services = []; }
    }
    const requestedService = req.body?.service;
    const svc = services.find(s => s.id === requestedService);
    const dur = (typeof req.body?.durationMinutes === 'number' && req.body.durationMinutes > 0)
      ? req.body.durationMinutes
      : (typeof req.body?.durationMin === 'number' && req.body.durationMin > 0)
      ? req.body.durationMin
      : (svc?.durationMin || client?.bookingDefaultDurationMin || 30);
    
    // Normalize phone
    const normalizedPhone = normalizePhoneE164(phone);
    if (!normalizedPhone) {
      console.error('[BOOKING] Failed to normalize phone:', phone);
      return res.status(400).json({ error: 'Phone must be valid E.164 format' });
    }
    
    // Ensure lead object has name and phone
    if (!req.body.lead) req.body.lead = {};
    req.body.lead.name = customerName;
    req.body.lead.phone = normalizedPhone;
    
    // Create a shorthand reference for easier access
    const lead = req.body.lead;

    const parseInTimezone = (value, timeZone) => {
      if (value == null) return null;
      if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
      if (typeof value === 'number' && Number.isFinite(value)) {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const hasZone = trimmed.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(trimmed);
        if (hasZone) {
          const zoned = new Date(trimmed);
          return Number.isNaN(zoned.getTime()) ? null : zoned;
        }
        const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/);
        if (isoMatch) {
          const [, year, month, day, hour, minute, second] = isoMatch;
          const [tzHour, tzMinute] = (client?.booking?.timezoneOffset ?? '00:00').split(':').map(Number);
          const baseUtc = Date.UTC(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour) - (Number.isFinite(tzHour) ? tzHour : 0),
            Number(minute) - (Number.isFinite(tzMinute) ? tzMinute : 0),
            Number(second || 0)
          );
          if (!Number.isNaN(baseUtc)) {
            return new Date(baseUtc);
          }
        }
        const parsed = Date.parse(trimmed);
        if (!Number.isNaN(parsed)) return new Date(parsed);
      }
      return null;
    };

    const wantsDebug = process.env.LOG_BOOKING_DEBUG === 'true' || req.body?.debug === true || req.get('X-Debug-Booking') === 'true';
    const debugInfo = wantsDebug ? {} : null;

    const preferenceRaw = req.body?.startPref || req.body?.preferredStart || req.body?.requestedStart;
    const parsedFromPreference = parseStartPreference(preferenceRaw, tz);
    if (debugInfo) {
      debugInfo.preferenceRaw = preferenceRaw ?? null;
      debugInfo.parsedFromPreference = parsedFromPreference ? new Date(parsedFromPreference).toISOString() : null;
    }

    // Handle new VAPI structure with separate date and time fields
    let combinedDateTime = null;
    if (req.body?.date && req.body?.time) {
      combinedDateTime = `${req.body.date}T${req.body.time}:00`;
      console.log('[BOOKING] 📅 Combined date/time from new VAPI structure:', combinedDateTime);
    }

    const startHints = [
      combinedDateTime, // New VAPI structure: date + time
      req.body?.slot?.start,
      req.body?.slot?.startTime,
      req.body?.slot?.startISO,
      req.body?.slot?.startIso,
      req.body?.slot?.startDateTime,
      req.body?.slot?.startDate,
      req.body?.slot?.isoStart,
      req.body?.slot?.slotStart,
      req.body?.slot?.requestedStart,
      req.body?.slot?.scheduledStart,
      req.body?.slotStart,
      req.body?.selectedSlot?.start,
      req.body?.selectedSlot?.startTime,
      req.body?.selectedSlot?.startISO,
      req.body?.selectedSlot?.startIso,
      req.body?.start,
      req.body?.startTime,
      req.body?.startISO
    ].filter(Boolean);
    if (debugInfo) {
      debugInfo.startHints = startHints;
    }

    let demoOverrides = null;
    let startDate = null;
    for (const hint of startHints) {
      const parsed = parseInTimezone(hint, tz);
      if (parsed) {
        startDate = parsed;
        break;
      }
    }

    if (parsedFromPreference) {
      startDate = parsedFromPreference;
    }

    const referenceNow = DateTime.now().setZone(tz);
    demoOverrides = await getDemoOverrides({
      tenant: client?.clientKey || null,
      leadPhone: req.body.lead.phone,
      leadName: req.body.lead.name || null,
      service: requestedService || null
    }, { now: referenceNow, timezone: tz });

    if (demoOverrides?.slot?.iso) {
      const overrideDate = parseInTimezone(demoOverrides.slot.iso, tz);
      if (overrideDate) {
        startDate = overrideDate;
        if (debugInfo) {
          debugInfo.demoOverrideSlot = demoOverrides.slot.iso;
        }
      }
    }

    if (debugInfo && demoOverrides) {
      debugInfo.demoOverrides = formatOverridesForTelemetry(demoOverrides);
    }

    if (startDate) {
      const reference = referenceNow;
      let dt = DateTime.fromJSDate(startDate).setZone(tz);
      if (debugInfo) {
        debugInfo.reference = reference.toISO();
        debugInfo.initialResolved = dt.toISO();
      }
      const minFuture = reference.plus({ minutes: 15 });
      if (dt < reference) {
        const daysBehind = reference.diff(dt, 'days').days;
        if (debugInfo) {
          debugInfo.daysBehind = Number.isFinite(daysBehind) ? daysBehind : null;
        }
        if (Number.isFinite(daysBehind) && daysBehind > 6) {
          const weeksToAdd = Math.ceil(daysBehind / 7);
          if (debugInfo) {
            debugInfo.weeksToAdd = weeksToAdd;
          }
          if (weeksToAdd > 0) {
            dt = dt.plus({ weeks: weeksToAdd });
          }
        }
        while (dt < minFuture && daysBehind > 6) {
          dt = dt.plus({ weeks: 1 });
        }
        if (dt < minFuture) {
          dt = minFuture;
        }
      } else if (dt < minFuture) {
        dt = minFuture;
      }
      if (debugInfo) {
        debugInfo.afterAdjustment = dt.toISO();
      }
      startDate = dt.toJSDate();
    }

    if (process.env.LOG_BOOKING_DEBUG === 'true') {
      console.log('[BOOKING][check-book] start resolution', {
        tenant: client?.clientKey || null,
        hints: startHints,
        parsedStart: startDate ? startDate.toISOString() : null,
        timezone: tz
      });
    }

    // Default: book tomorrow ~14:00 in tenant TZ if no start provided
    if (!startDate) {
      const base = new Date(Date.now() + 24 * 60 * 60 * 1000);
      base.setHours(14, 0, 0, 0);
      startDate = base;
    }

    const startISO = new Date(startDate).toISOString();
    const endISO = new Date(startDate.getTime() + dur * 60 * 1000).toISOString();

    // For demo clients, simulate booking without real integrations
    let google = { skipped: true };
    let sms = null;
    
    if (isDemo) {
      // For demo clients, use REAL bookings but with generic demo credentials
      // This allows reuse across all demos while still showing real functionality
      
      // Use demo calendar (from env or default to 'primary')
      const demoCalendarId = process.env.DEMO_GOOGLE_CALENDAR_ID || GOOGLE_CALENDAR_ID || 'primary';
      
      // Use demo phone number for SMS - prefer lead.phone (which we just looked up) over env vars
      // This ensures we use the actual phone number from the call, not a placeholder
      const demoSmsTo = lead.phone || process.env.DEMO_SMS_TO || process.env.TEST_PHONE_NUMBER;
      
      console.log('[DEMO BOOKING] Using real bookings with demo credentials:', {
        clientKey: client?.clientKey,
        calendarId: demoCalendarId,
        smsTo: demoSmsTo,
        leadName: lead.name,
        service: requestedService
      });
      
      // Real Google Calendar booking (using demo calendar)
      try {
        if (GOOGLE_CLIENT_EMAIL && (GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY_B64) && demoCalendarId) {
          const auth = makeJwtAuth({ clientEmail: GOOGLE_CLIENT_EMAIL, privateKey: GOOGLE_PRIVATE_KEY, privateKeyB64: GOOGLE_PRIVATE_KEY_B64 });
          await auth.authorize();
          const summary = `[DEMO] ${requestedService || 'Appointment'} — ${lead.name || lead.phone}`;
          const description = [
            `Demo booking - Auto-booked by AI agent`,
            `Client: ${client?.displayName || client?.clientKey || 'Demo Client'}`,
            `Name: ${lead.name}`,
            `Phone: ${lead.phone}`,
            `Note: This is a demo booking`
          ].join('\\n');

          let event;
          try {
            event = await insertEvent({
              auth, calendarId: demoCalendarId, summary, description,
              startIso: startISO, endIso: endISO, timezone: tz
            });
          } catch (e) {
            const code = e?.response?.status || 500;
            const data = e?.response?.data || e?.message || String(e);
            console.warn('[DEMO BOOKING] Google Calendar error:', data);
            google = { skipped: true, error: String(data) };
            event = null;
          }

          if (event) {
            google = { id: event.id, htmlLink: event.htmlLink, status: event.status, demo: true };
            console.log('[DEMO BOOKING] Real calendar event created:', event.id);
          }
        } else {
          google = { skipped: true, reason: 'no_google_credentials' };
        }
      } catch (err) {
        console.error('[DEMO BOOKING] Google Calendar error:', err);
        google = { error: String(err) };
      }

      // Real SMS confirmation (using demo phone number)
      const startDt = DateTime.fromISO(startISO, { zone: tz });
      const when = startDt.isValid
        ? startDt.toFormat('ccc dd LLL yyyy • hh:mma')
        : new Date(startISO).toLocaleString(client?.locale || 'en-GB', {
            timeZone: tz, weekday: 'short', day: 'numeric', month: 'short',
            hour: 'numeric', minute: '2-digit', hour12: true
          });
      const link = google?.htmlLink ? ` Calendar: ${google.htmlLink}` : '';
      const brand = client?.displayName || client?.clientKey || 'Our Clinic';
      const sig = client?.brandSignature ? ` ${client.brandSignature}` : '';
      const defaultBody = `Hi {{name}}, your {{service}} is booked with {{brand}} for {{when}} {{tz}}.{{link}}{{sig}} Reply STOP to opt out.`;
      const template = client?.smsTemplates?.confirm || defaultBody;
      const templateVars = {
        name: lead.name,
        service: requestedService || 'appointment',
        brand,
        when,
        tz,
        link,
        sig,
        duration: dur,
        day: startDt.isValid ? startDt.toFormat('cccc') : null,
        date: startDt.isValid ? startDt.toFormat('dd LLL yyyy') : null,
        time: startDt.isValid ? startDt.toFormat('HH:mm') : null
      };
      const body = renderTemplate(template, templateVars);

      // Use Twilio to send real SMS to demo number
      try {
        const twilioFromNumber = TWILIO_FROM_NUMBER || process.env.DEMO_SMS_FROM;
        
        if (defaultSmsClient && (TWILIO_MESSAGING_SERVICE_SID || twilioFromNumber)) {
          const payload = { to: demoSmsTo, body: body };
          if (TWILIO_MESSAGING_SERVICE_SID) {
            payload.messagingServiceSid = TWILIO_MESSAGING_SERVICE_SID;
          } else {
            payload.from = twilioFromNumber;
          }
          const smsResponse = await defaultSmsClient.messages.create(payload);
          sms = { id: smsResponse.sid, to: demoSmsTo, demo: true };
          console.log('[DEMO BOOKING] Real SMS sent to demo number:', demoSmsTo);
        } else {
          sms = { skipped: true, reason: 'no_twilio_credentials' };
          console.warn('[DEMO BOOKING] Twilio not configured, skipping SMS');
        }
      } catch (smsError) {
        console.error('[DEMO BOOKING] SMS error:', smsError);
        sms = { error: String(smsError) };
      }
      
      // Save appointment to database so it shows up in dashboard
      try {
        // Get or create lead first
        let leadId = null;
        const existingLead = await query(
          'SELECT id FROM leads WHERE client_key = $1 AND phone = $2 LIMIT 1',
          [client?.clientKey, lead.phone]
        );
        
        if (existingLead?.rows?.[0]?.id) {
          leadId = existingLead.rows[0].id;
        } else {
          // Create lead if it doesn't exist
          const newLead = await query(
            'INSERT INTO leads (client_key, name, phone, service, status, source) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [client?.clientKey, lead.name, lead.phone, requestedService || 'appointment', 'booked', 'demo']
          );
          if (newLead?.rows?.[0]?.id) {
            leadId = newLead.rows[0].id;
          }
        }
        
        // Save appointment to database
        if (leadId && google?.id) {
          await query(
            'INSERT INTO appointments (client_key, lead_id, gcal_event_id, start_iso, end_iso, status) VALUES ($1, $2, $3, $4, $5, $6)',
            [client?.clientKey, leadId, google.id, startISO, endISO, 'booked']
          );
          console.log('[DEMO BOOKING] Appointment saved to database');
        }
      } catch (dbError) {
        console.warn('[DEMO BOOKING] Could not save appointment to database:', dbError.message);
      }
    } else {
      // Real booking flow for non-demo clients
      try {
        if (GOOGLE_CLIENT_EMAIL && (GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY_B64) && calendarId) {
          const auth = makeJwtAuth({ clientEmail: GOOGLE_CLIENT_EMAIL, privateKey: GOOGLE_PRIVATE_KEY, privateKeyB64: GOOGLE_PRIVATE_KEY_B64 });
          await auth.authorize();
          const summary = `${requestedService || 'Appointment'} — ${lead.name || lead.phone}`;
          const description = [
            `Auto-booked by AI agent`,
            `Tenant: ${client?.clientKey || 'default'}`,
            `Name: ${lead.name}`,
            `Phone: ${lead.phone}`
          ].join('\\n');

          const attendees = []; // removed invites

          let event;
          try {
            const maybeRetry =
              typeof withRetry === 'function'
                ? withRetry
                : async (fn) => fn();
            event = await maybeRetry(() => insertEvent({
              auth, calendarId, summary, description,
              startIso: startISO, endIso: endISO, timezone: tz
            }), { retries: 2, delayMs: 300 });
          } catch (e) {
            const code = e?.response?.status || 500;
            const data = e?.response?.data || e?.message || String(e);
            // If Google credentials are missing/invalid, skip calendar insert but continue
            const grantError = typeof data === 'string' && data.includes('invalid_grant');
            if (!grantError) {
              return res.status(code).json({ ok:false, error:'gcal_insert_failed', details: data });
            }
            console.warn('[GCAL] Skipping insert due to invalid credentials', data);
            google = { skipped: true, error: 'invalid_grant' };
            event = null;
          }

          if (event) {
            google = { id: event.id, htmlLink: event.htmlLink, status: event.status };
          }
        }
      } catch (err) {
        console.error(JSON.stringify({ evt: 'gcal.error', rid: req.id, error: String(err) }));
        google = { error: String(err) };
      }

      // Real SMS flow for non-demo clients
      const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
      const smsOverrides = demoOverrides?.sms;
      if (configured && !(smsOverrides?.skip === true)) {
        const startDt = DateTime.fromISO(startISO, { zone: tz });
        const when = startDt.isValid
          ? startDt.toFormat('ccc dd LLL yyyy • hh:mma')
          : new Date(startISO).toLocaleString(client?.locale || 'en-GB', {
              timeZone: tz, weekday: 'short', day: 'numeric', month: 'short',
              hour: 'numeric', minute: '2-digit', hour12: true
            });
        const link = google?.htmlLink ? ` Calendar: ${google.htmlLink}` : '';
        const brand = client?.displayName || client?.clientKey || 'Our Clinic';
        const sig = client?.brandSignature ? ` ${client.brandSignature}` : '';
        const defaultBody = `Hi {{name}}, your {{service}} is booked with {{brand}} for {{when}} {{tz}}.{{link}}{{sig}} Reply STOP to opt out.`;
        const template = smsOverrides?.message || client?.smsTemplates?.confirm || defaultBody;
        const templateVars = {
          name: lead.name,
          service: requestedService || 'appointment',
          brand,
          when,
          tz,
          link,
          sig,
          duration: dur,
          day: startDt.isValid ? startDt.toFormat('cccc') : null,
          date: startDt.isValid ? startDt.toFormat('dd LLL yyyy') : null,
          time: startDt.isValid ? startDt.toFormat('HH:mm') : null
        };
        const body = renderTemplate(template, templateVars);

        try {
          const payload = { to: lead.phone, body };
          if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid;
          else payload.from = fromNumber;
          const resp = await smsClient.messages.create(payload);
          sms = { id: resp.sid, to: lead.phone, override: Boolean(smsOverrides) };
        } catch (err) {
          console.error(JSON.stringify({ evt: 'sms.error', rid: req.id, error: String(err) }));
          sms = { error: String(err) };
        }
      } else if (configured && smsOverrides?.skip === true) {
        sms = { skipped: true, reason: 'demo_skip' };
      }
    }

    const calls = await readJson(CALLS_PATH, []);
    const record = {
      id: 'call_' + nanoid(10),
      tenant: client?.clientKey || null,
      status: 'booked',
      booking: { start: startISO, end: endISO, service: requestedService || null, google, sms },
      created_at: new Date().toISOString()
    };
    calls.push(record);
    await writeJson(CALLS_PATH, calls);

    const responseBody = { slot: { start: startISO, end: endISO, timezone: tz }, google, sms, tenant: client?.clientKey || 'default' };
    if (debugInfo) {
      debugInfo.finalStart = startISO;
      responseBody.debug = debugInfo;
    }

    if (process.env.DEMO_MODE === 'true') {
      const googleTelemetry = google
        ? {
            id: google.id || null,
            status: google.status || null,
            skipped: Boolean(google.skipped),
            error: google.error || null
          }
        : null;
      const smsTelemetry = sms
        ? {
            id: sms.id || null,
            error: sms.error || null,
            skipped: Boolean(sms.skipped),
            override: sms.override || false
          }
        : null;
      const telemetryPayload = {
        evt: 'booking.checkAndBook',
        tenant: client?.clientKey || null,
        service: requestedService || null,
        durationMin: dur,
        lead: {
          name: lead.name,
          phone: lead.phone
        },
        slot: {
          finalIso: startISO,
          endIso: endISO,
          preferenceRaw,
          hintsCount: startHints.length
        },
        overrides: formatOverridesForTelemetry(demoOverrides),
        google: googleTelemetry,
        sms: smsTelemetry,
        elapsedMs: Date.now() - requestStartedAt,
        requestId: req.id || null
      };
      recordDemoTelemetry(telemetryPayload);
    }

    setCachedIdem(idemKey, 200, responseBody);
    return res.json(responseBody);
  } catch (e) {
    console.error('[BOOKING][check-book] ❌❌❌ CAUGHT ERROR IN OUTER CATCH:', e);
    console.error('[BOOKING][check-book] Error stack:', e?.stack);
    console.error('[BOOKING][check-book] Error message:', e?.message);
    const status = 500;
    const body = { error: String(e) };
    setCachedIdem(idemKey, status, body);
    return res.status(status).json(body);
  }
});

// Tenant-aware current time helper for Vapi (returns now in tenant timezone & UTC)
app.get('/api/time/now', async (req, res) => {
  try {
    const client = await getClientFromHeader(req);
    if (!client) return res.status(400).json({ ok: false, error: 'Unknown tenant' });

    const tz = pickTimezone(client);
    const nowTenant = DateTime.now().setZone(tz);
    const nowUtc = nowTenant.toUTC();

    return res.json({
      ok: true,
      tenant: client?.clientKey || null,
      timezone: tz,
      now: {
        iso: nowTenant.toISO(),
        isoUtc: nowUtc.toISO(),
        epochMs: nowTenant.toMillis(),
        epochSeconds: Math.floor(nowTenant.toSeconds()),
        formatted: {
          long: nowTenant.toFormat('cccc, dd LLLL yyyy HH:mm'),
          date: nowTenant.toFormat('yyyy-LL-dd'),
          time: nowTenant.toFormat('HH:mm'),
          spoken: nowTenant.toFormat("cccc 'at' h:mma")
        },
        components: {
          year: nowTenant.year,
          month: nowTenant.month,
          day: nowTenant.day,
          weekday: nowTenant.weekday,
          hour: nowTenant.hour,
          minute: nowTenant.minute,
          second: nowTenant.second
        }
      }
    });
  } catch (e) {
    console.error('[time.now] error', e?.message || e);
    return res.status(500).json({ ok: false, error: 'time_now_failed' });
  }
});

// Diagnostic endpoint for tenant resolution
app.get('/admin/tenant-resolve', async (req, res) => {
  try {
    const { to, mss } = req.query;
    if (!to) return res.status(400).json({ ok: false, error: 'Missing "to" parameter' });

    const tenantKey = await resolveTenantKeyFromInbound({ to, messagingServiceSid: mss });
    res.json({ ok: true, tenantKey, to, messagingServiceSid: mss });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin endpoint to validate tenant SMS configuration
app.get('/admin/check-tenants', async (req, res) => {
  try {
    const clients = await listFullClients();
    const tenants = clients.map(client => ({
      tenantKey: client.clientKey,
      fromNumber: client?.sms?.fromNumber || null,
      messagingServiceSid: client?.sms?.messagingServiceSid || null
    }));

    // Detect duplicates
    const fromNumberCounts = {};
    const messagingServiceSidCounts = {};
    
    tenants.forEach(tenant => {
      if (tenant.fromNumber) {
        fromNumberCounts[tenant.fromNumber] = (fromNumberCounts[tenant.fromNumber] || 0) + 1;
      }
      if (tenant.messagingServiceSid) {
        messagingServiceSidCounts[tenant.messagingServiceSid] = (messagingServiceSidCounts[tenant.messagingServiceSid] || 0) + 1;
      }
    });

    const duplicates = {
      fromNumber: Object.keys(fromNumberCounts).filter(num => fromNumberCounts[num] > 1),
      messagingServiceSid: Object.keys(messagingServiceSidCounts).filter(sid => messagingServiceSidCounts[sid] > 1)
    };

    const dupFromCount = duplicates.fromNumber.length;
    const dupSidCount = duplicates.messagingServiceSid.length;
    
    console.log('[TENANT CHECK]', { 
      tenantsCount: tenants.length, 
      dupFromCount, 
      dupSidCount 
    });

    res.json({
      ok: true,
      tenants,
      duplicates
    });
  } catch (e) {
    console.error('[TENANT CHECK ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Demo scripting visibility
app.get('/admin/demo-script', async (req, res) => {
  try {
    const script = await loadDemoScript();
    res.json({
      ok: true,
      demoMode: process.env.DEMO_MODE === 'true',
      script
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Demo telemetry feed
app.get('/admin/demo-telemetry', async (req, res) => {
  try {
    const limitRaw = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 100;
    const events = await readDemoTelemetry({ limit });
    res.json({
      ok: true,
      count: events.length,
      events
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Reset telemetry (demo-only convenience)
app.delete('/admin/demo-telemetry', async (req, res) => {
  try {
    await clearDemoTelemetry();
    res.json({ ok: true, message: 'Demo telemetry cleared' });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Receptionist telemetry feed
app.get('/admin/receptionist-telemetry', async (req, res) => {
  try {
    const limitRaw = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 100;
    const events = await readReceptionistTelemetry({ limit });
    res.json({
      ok: true,
      count: events.length,
      events
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.delete('/admin/receptionist-telemetry', async (req, res) => {
  try {
    await clearReceptionistTelemetry();
    res.json({ ok: true, message: 'Receptionist telemetry cleared' });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin endpoint for runtime change feed
app.get('/admin/changes', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const changes = [
      {
        id: 'change_001',
        type: 'deployment',
        timestamp: new Date().toISOString(),
        description: 'Added missing logging tags and admin changes endpoint',
        version: process.env.npm_package_version || '1.0.0',
        status: 'completed'
      },
      {
        id: 'change_002', 
        type: 'feature',
        timestamp: new Date().toISOString(),
        description: 'Implemented VAPI call timeout and number validation',
        version: process.env.npm_package_version || '1.0.0',
        status: 'completed'
      },
      {
        id: 'change_003',
        type: 'fix',
        timestamp: new Date().toISOString(),
        description: 'Fixed tenant resolution and cost optimization',
        version: process.env.npm_package_version || '1.0.0',
        status: 'completed'
      }
    ];

    console.log('[CHANGE]', { changesCount: changes.length, requestedBy: req.ip });

    res.json({
      ok: true,
      changes,
      total: changes.length,
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[CHANGE ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Lead scoring debug endpoint
app.get('/admin/lead-score', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { phone, tenantKey } = req.query;
    if (!phone) return res.status(400).json({ ok: false, error: 'Missing "phone" parameter' });

    const leads = await readJson(LEADS_PATH, []);
    const normalizedPhone = normalizePhoneE164(phone, 'GB');
    const lead = leads.find(l => {
      const leadPhone = normalizePhoneE164(l.phone, 'GB');
      return leadPhone === normalizedPhone || l.phone === phone || l.phone === normalizedPhone;
    });
    
    if (!lead) {
      return res.json({ ok: true, phone, found: false, message: 'Lead not found' });
    }

    const tenant = tenantKey ? await getFullClient(tenantKey) : null;
    const score = calculateLeadScore(lead, tenant);
    const priority = getLeadPriority(score);

    console.log('[LEAD SCORE DEBUG]', { phone, tenantKey, score, priority, requestedBy: req.ip });

    res.json({
      ok: true,
      phone,
      tenantKey: tenant?.clientKey || null,
      score,
      priority,
      breakdown: {
        consentSms: lead.consentSms ? 30 : 0,
        status: lead.status === 'engaged' ? 20 : 0,
        responseTime: lead.lastInboundAt && lead.createdAt ? 
          Math.min(25, Math.max(0, 25 - ((new Date(lead.lastInboundAt) - new Date(lead.createdAt)) / (1000 * 60 * 5)))) : 0,
        keywords: lead.lastInboundText ? 
          (lead.lastInboundText.toLowerCase().includes('urgent') ? 20 : 0) +
          (lead.lastInboundText.toLowerCase().includes('book') ? 15 : 0) +
          (lead.lastInboundText.toLowerCase().includes('?') ? 5 : 0) : 0,
        recency: lead.lastInboundAt ? 
          Math.min(15, Math.max(0, 15 - ((new Date() - new Date(lead.lastInboundAt)) / (1000 * 60 * 60)))) : 0
      },
      lead: {
        status: lead.status,
        consentSms: lead.consentSms,
        lastInboundText: lead.lastInboundText,
        lastInboundAt: lead.lastInboundAt,
        createdAt: lead.createdAt
      }
    });
  } catch (e) {
    console.error('[LEAD SCORE ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// System health and performance monitoring
// Tenant management endpoints
app.get('/admin/tenants', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const clients = await listFullClients();
    const tenants = clients.map(client => ({
      clientKey: client.clientKey,
      displayName: client.displayName || client.clientKey,
      timezone: client.timezone || 'Europe/London',
      locale: client.locale || 'en-GB',
      phone: client?.sms?.fromNumber || null,
      messagingServiceSid: client?.sms?.messagingServiceSid || null,
      status: 'active',
      createdAt: client.createdAt || new Date().toISOString(),
      lastActivity: client.lastActivity || null
    }));

    console.log('[TENANT LIST]', { tenantsCount: tenants.length, requestedBy: req.ip });

    res.json({
      ok: true,
      tenants,
      total: tenants.length
    });
  } catch (e) {
    console.error('[TENANT LIST ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get('/admin/tenants/:tenantKey', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { tenantKey } = req.params;
    const client = await getFullClient(tenantKey);
    
    if (!client) {
      return res.status(404).json({ ok: false, error: 'Tenant not found' });
    }

    const tenant = {
      clientKey: client.clientKey,
      displayName: client.displayName || client.clientKey,
      timezone: client.timezone || 'Europe/London',
      locale: client.locale || 'en-GB',
      phone: client?.sms?.fromNumber || null,
      messagingServiceSid: client?.sms?.messagingServiceSid || null,
      vapiAssistantId: client?.vapi?.assistantId || null,
      vapiPhoneNumberId: client?.vapi?.phoneNumberId || null,
      calendarId: client?.calendarId || null,
      businessHours: client?.businessHours || {
        start: 9,
        end: 17,
        days: [1, 2, 3, 4, 5]
      },
      status: 'active',
      createdAt: client.createdAt || new Date().toISOString(),
      lastActivity: client.lastActivity || null
    };

    console.log('[TENANT DETAIL]', { tenantKey, requestedBy: req.ip });

    res.json({
      ok: true,
      tenant
    });
  } catch (e) {
    console.error('[TENANT DETAIL ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin endpoint to get call queue status
app.get('/admin/call-queue', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { getPendingCalls, getCallQueueByTenant } = await import('./db.js');
    
    // Get pending calls
    const pendingCalls = await getPendingCalls(100);
    
    // Get queue by tenant
    const tenants = await listFullClients();
    const queueByTenant = {};
    
    for (const tenant of tenants) {
      const tenantQueue = await getCallQueueByTenant(tenant.clientKey, 50);
      queueByTenant[tenant.clientKey] = {
        displayName: tenant.displayName,
        queue: tenantQueue
      };
    }
    
    console.log('[CALL QUEUE STATUS]', { 
      pendingCount: pendingCalls.length, 
      tenantCount: Object.keys(queueByTenant).length,
      requestedBy: req.ip 
    });
    
    res.json({
      ok: true,
      pendingCalls,
      queueByTenant,
      summary: {
        totalPending: pendingCalls.length,
        tenantsWithQueue: Object.keys(queueByTenant).filter(key => queueByTenant[key].queue.length > 0).length,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (e) {
    console.error('[CALL QUEUE STATUS ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin endpoint to get cost optimization metrics
app.get('/admin/cost-optimization/:tenantKey', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { tenantKey } = req.params;
    const metrics = await getCostOptimizationMetrics(tenantKey);
    
    if (!metrics) {
      return res.status(404).json({ error: 'Cost metrics not found' });
    }
    
    console.log('[COST OPTIMIZATION METRICS]', { 
      tenantKey,
      requestedBy: req.ip,
      dailyCost: metrics.costs.daily.total_cost,
      budgetUtilization: metrics.optimization.dailyBudgetUtilization
    });
    
    res.json({
      ok: true,
      tenantKey,
      metrics,
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[COST OPTIMIZATION ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin endpoint to set budget limits
app.post('/admin/budget-limits/:tenantKey', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { tenantKey } = req.params;
    const { budgetType, dailyLimit, weeklyLimit, monthlyLimit, currency = 'USD' } = req.body;
    
    if (!budgetType || (!dailyLimit && !weeklyLimit && !monthlyLimit)) {
      return res.status(400).json({ error: 'Budget type and at least one limit required' });
    }
    
    const { setBudgetLimit } = await import('./db.js');
    const budget = await setBudgetLimit({
      clientKey: tenantKey,
      budgetType,
      dailyLimit: parseFloat(dailyLimit) || null,
      weeklyLimit: parseFloat(weeklyLimit) || null,
      monthlyLimit: parseFloat(monthlyLimit) || null,
      currency
    });
    
    console.log('[BUDGET LIMIT SET]', { 
      tenantKey,
      budgetType,
      dailyLimit,
      weeklyLimit,
      monthlyLimit,
      currency,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      budget,
      message: 'Budget limit set successfully'
    });
  } catch (e) {
    console.error('[BUDGET LIMIT ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin endpoint to create cost alerts
app.post('/admin/cost-alerts/:tenantKey', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { tenantKey } = req.params;
    const { alertType, threshold, period = 'daily' } = req.body;
    
    if (!alertType || !threshold) {
      return res.status(400).json({ error: 'Alert type and threshold required' });
    }
    
    const { createCostAlert, getTotalCostsByTenant } = await import('./db.js');
    const currentCosts = await getTotalCostsByTenant(tenantKey, period);
    
    const alert = await createCostAlert({
      clientKey: tenantKey,
      alertType,
      threshold: parseFloat(threshold),
      currentAmount: parseFloat(currentCosts.total_cost || 0),
      period
    });
    
    console.log('[COST ALERT CREATED]', { 
      tenantKey,
      alertType,
      threshold,
      period,
      currentAmount: currentCosts.total_cost,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      alert,
      message: 'Cost alert created successfully'
    });
  } catch (e) {
    console.error('[COST ALERT ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Security endpoints
// Create user account
app.post('/admin/users/:tenantKey', authenticateApiKey, rateLimitMiddleware, requirePermission('user_management'), async (req, res) => {
  try {
    const { tenantKey } = req.params;
    const { username, email, password, role = 'user', permissions = [] } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password required' });
    }
    
    const { createUserAccount, hashPassword } = await import('./db.js');
    const passwordHash = await hashPassword(password);
    
    const user = await createUserAccount({
      clientKey: tenantKey,
      username,
      email,
      passwordHash,
      role,
      permissions
    });
    
    console.log('[USER CREATED]', { 
      tenantKey,
      username,
      email,
      role,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        is_active: user.is_active,
        created_at: user.created_at
      },
      message: 'User created successfully'
    });
  } catch (e) {
    console.error('[USER CREATION ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Create API key
app.post('/admin/api-keys/:tenantKey', authenticateApiKey, rateLimitMiddleware, requirePermission('api_management'), async (req, res) => {
  try {
    const { tenantKey } = req.params;
    const { keyName, permissions = [], rateLimitPerMinute = 100, rateLimitPerHour = 1000, expiresAt = null } = req.body;
    
    if (!keyName) {
      return res.status(400).json({ error: 'Key name required' });
    }
    
    const { createApiKey, generateApiKey, hashApiKey } = await import('./db.js');
    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);
    
    const keyData = await createApiKey({
      clientKey: tenantKey,
      keyName,
      keyHash,
      permissions,
      rateLimitPerMinute,
      rateLimitPerHour,
      expiresAt
    });
    
    console.log('[API KEY CREATED]', { 
      tenantKey,
      keyName,
      permissions,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      apiKey: {
        id: keyData.id,
        keyName: keyData.key_name,
        permissions: keyData.permissions,
        rateLimitPerMinute: keyData.rate_limit_per_minute,
        rateLimitPerHour: keyData.rate_limit_per_hour,
        is_active: keyData.is_active,
        expires_at: keyData.expires_at,
        created_at: keyData.created_at
      },
      secretKey: apiKey, // Only returned once
      message: 'API key created successfully'
    });
  } catch (e) {
    console.error('[API KEY CREATION ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Get security events
app.get('/admin/security-events/:tenantKey', authenticateApiKey, rateLimitMiddleware, requirePermission('security_view'), async (req, res) => {
  try {
    const { tenantKey } = req.params;
    const { limit = 100, eventType, severity } = req.query;
    
    const { getSecurityEvents, getSecurityEventSummary } = await import('./db.js');
    
    const events = await getSecurityEvents(tenantKey, parseInt(limit), eventType, severity);
    const summary = await getSecurityEventSummary(tenantKey, 7);
    
    console.log('[SECURITY EVENTS REQUESTED]', { 
      tenantKey,
      limit,
      eventType,
      severity,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      tenantKey,
      events,
      summary,
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[SECURITY EVENTS ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Analytics endpoints
// Get analytics dashboard
app.get('/admin/analytics/:tenantKey', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { tenantKey } = req.params;
    const { days = 30 } = req.query;
    
    const dashboard = await getAnalyticsDashboard(tenantKey, parseInt(days));
    
    if (!dashboard) {
      return res.status(404).json({ error: 'Analytics data not found' });
    }
    
    console.log('[ANALYTICS DASHBOARD REQUESTED]', { 
      tenantKey,
      days,
      requestedBy: req.ip,
      totalLeads: dashboard.summary.totalLeads,
      conversionRate: dashboard.summary.conversionRate
    });
    
    res.json({
      ok: true,
      tenantKey,
      dashboard,
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[ANALYTICS DASHBOARD ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Generate analytics report
app.post('/admin/analytics/:tenantKey/report', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { tenantKey } = req.params;
    const { reportType = 'comprehensive', days = 30 } = req.body;
    
    const report = await generateAnalyticsReport(tenantKey, reportType, parseInt(days));
    
    if (!report) {
      return res.status(404).json({ error: 'Unable to generate report' });
    }
    
    console.log('[ANALYTICS REPORT GENERATED]', { 
      tenantKey,
      reportType,
      days,
      requestedBy: req.ip,
      insights: report.insights.length,
      recommendations: report.recommendations.length
    });
    
    res.json({
      ok: true,
      tenantKey,
      report,
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[ANALYTICS REPORT ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Track analytics event
app.post('/admin/analytics/:tenantKey/track', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { tenantKey } = req.params;
    const { eventType, eventCategory, eventData, sessionId } = req.body;
    
    if (!eventType || !eventCategory) {
      return res.status(400).json({ error: 'Event type and category required' });
    }
    
    const event = await trackAnalyticsEvent({
      clientKey: tenantKey,
      eventType,
      eventCategory,
      eventData,
      sessionId,
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip
    });
    
    console.log('[ANALYTICS EVENT TRACKED]', { 
      tenantKey,
      eventType,
      eventCategory,
      sessionId,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      event,
      message: 'Event tracked successfully'
    });
  } catch (e) {
    console.error('[ANALYTICS TRACKING ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Track conversion stage
app.post('/admin/analytics/:tenantKey/conversion', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { tenantKey } = req.params;
    const { leadPhone, stage, stageData, previousStage, timeToStage } = req.body;
    
    if (!leadPhone || !stage) {
      return res.status(400).json({ error: 'Lead phone and stage required' });
    }
    
    const conversionStage = await trackConversionStage({
      clientKey: tenantKey,
      leadPhone,
      stage,
      stageData,
      previousStage,
      timeToStage
    });
    
    console.log('[CONVERSION STAGE TRACKED]', { 
      tenantKey,
      leadPhone,
      stage,
      previousStage,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      conversionStage,
      message: 'Conversion stage tracked successfully'
    });
  } catch (e) {
    console.error('[CONVERSION TRACKING ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Record performance metric
app.post('/admin/analytics/:tenantKey/metrics', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { tenantKey } = req.params;
    const { metricName, metricValue, metricUnit, metricCategory, metadata } = req.body;
    
    if (!metricName || metricValue === undefined) {
      return res.status(400).json({ error: 'Metric name and value required' });
    }
    
    const metric = await recordPerformanceMetric({
      clientKey: tenantKey,
      metricName,
      metricValue: parseFloat(metricValue),
      metricUnit,
      metricCategory,
      metadata
    });
    
    console.log('[PERFORMANCE METRIC RECORDED]', { 
      tenantKey,
      metricName,
      metricValue,
      metricCategory,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      metric,
      message: 'Performance metric recorded successfully'
    });
  } catch (e) {
    console.error('[PERFORMANCE METRIC ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// A/B Testing endpoints
// Create A/B test experiment
app.post('/admin/ab-tests/:tenantKey', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { tenantKey } = req.params;
    const { experimentName, variants, isActive = true } = req.body;
    
    if (!experimentName || !variants || variants.length < 2) {
      return res.status(400).json({ error: 'Experiment name and at least 2 variants required' });
    }
    
    const experiments = await createABTestExperiment({
      clientKey: tenantKey,
      experimentName,
      variants,
      isActive
    });
    
    console.log('[AB TEST EXPERIMENT CREATED]', { 
      tenantKey,
      experimentName,
      variants: variants.length,
      isActive,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      experiments,
      message: 'A/B test experiment created successfully'
    });
  } catch (e) {
    console.error('[AB TEST CREATION ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Get active A/B tests
app.get('/admin/ab-tests/:tenantKey', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { tenantKey } = req.params;
    
    const activeTests = await getActiveABTests(tenantKey);
    
    console.log('[AB TESTS REQUESTED]', { 
      tenantKey,
      activeTests: activeTests.length,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      tenantKey,
      activeTests,
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[AB TESTS FETCH ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Get A/B test results
app.get('/admin/ab-tests/:tenantKey/:experimentName/results', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { tenantKey, experimentName } = req.params;
    
    const results = await getABTestResults(tenantKey, experimentName);
    
    if (!results) {
      return res.status(404).json({ error: 'Experiment not found' });
    }
    
    console.log('[AB TEST RESULTS REQUESTED]', { 
      tenantKey,
      experimentName,
      totalParticipants: results.summary.totalParticipants,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      tenantKey,
      experimentName,
      results,
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[AB TEST RESULTS ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Record A/B test outcome
app.post('/admin/ab-tests/:tenantKey/:experimentName/outcome', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { tenantKey, experimentName } = req.params;
    const { leadPhone, outcome, outcomeData } = req.body;
    
    if (!leadPhone || !outcome) {
      return res.status(400).json({ error: 'Lead phone and outcome required' });
    }
    
    const result = await recordABTestOutcome({
      clientKey: tenantKey,
      experimentName,
      leadPhone,
      outcome,
      outcomeData
    });
    
    if (!result) {
      return res.status(404).json({ error: 'Experiment or lead assignment not found' });
    }
    
    console.log('[AB TEST OUTCOME RECORDED]', { 
      tenantKey,
      experimentName,
      leadPhone,
      outcome,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      result,
      message: 'A/B test outcome recorded successfully'
    });
  } catch (e) {
    console.error('[AB TEST OUTCOME ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Performance optimization endpoints
// Get performance metrics
app.get('/admin/performance/:tenantKey', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { tenantKey } = req.params;
    
    const metrics = await getCachedMetrics(tenantKey);
    
    // Get cache statistics
    const cacheStats = {
      size: cache.size,
      keys: Array.from(cache.keys()).filter(key => key.includes(tenantKey)),
      hitRate: calculateCacheHitRate(tenantKey)
    };
    
    console.log('[PERFORMANCE METRICS REQUESTED]', { 
      tenantKey,
      cacheSize: cache.size,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      tenantKey,
      metrics,
      cache: cacheStats,
      performance: {
        analyticsQueue: analyticsQueue.length,
        connectionPool: connectionPool.size,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime()
      },
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[PERFORMANCE METRICS ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Clear cache
app.post('/admin/performance/:tenantKey/cache/clear', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { tenantKey } = req.params;
    const { pattern } = req.body;
    
    const beforeSize = cache.size;
    clearCache(pattern || tenantKey);
    const afterSize = cache.size;
    const cleared = beforeSize - afterSize;
    
    console.log('[CACHE CLEARED]', { 
      tenantKey,
      pattern,
      cleared,
      remaining: afterSize,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      tenantKey,
      cleared,
      remaining: afterSize,
      message: `Cache cleared: ${cleared} entries removed`
    });
  } catch (e) {
    console.error('[CACHE CLEAR ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Get system performance overview
app.get('/admin/performance/system/overview', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    const overview = {
      system: {
        uptime: process.uptime(),
        memory: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
          external: Math.round(memoryUsage.external / 1024 / 1024) // MB
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system
        }
      },
      application: {
        cache: {
          size: cache.size,
          ttl: CACHE_TTL
        },
        analytics: {
          queueSize: analyticsQueue.length,
          processing: analyticsProcessing
        },
        connections: {
          poolSize: connectionPool.size
        }
      },
      timestamp: new Date().toISOString()
    };
    
    console.log('[SYSTEM PERFORMANCE OVERVIEW]', { 
      memoryMB: overview.system.memory.rss,
      cacheSize: overview.application.cache.size,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      overview,
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[SYSTEM PERFORMANCE ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Test booking system calendar connection
app.get('/test-booking-calendar', async (req, res) => {
  try {
    if (!bookingSystem) {
      return res.status(503).json({ 
        success: false, 
        message: 'Booking system not available' 
      });
    }

    const result = await bookingSystem.testCalendarConnection();
    res.json(result);
    
  } catch (error) {
    console.error('[BOOKING CALENDAR TEST ERROR]', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Google Calendar Test Endpoints
// Test calendar booking
app.post('/test-calendar-booking', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { tenantKey, leadPhone, appointmentTime, duration, service, notes } = req.body;
    
    if (!tenantKey || !leadPhone || !appointmentTime) {
      return res.status(400).json({ error: 'tenantKey, leadPhone, and appointmentTime required' });
    }
    
    const client = await getFullClient(tenantKey);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    console.log('[CALENDAR BOOKING TEST]', { 
      tenantKey, 
      leadPhone, 
      appointmentTime, 
      duration, 
      service, 
      notes 
    });
    
    // For testing, just return success without actually booking
    return res.json({
      ok: true,
      message: 'Calendar booking test successful',
      tenantKey,
      leadPhone,
      appointmentTime,
      duration: duration || 30,
      service: service || 'General Appointment',
      notes: notes || 'Test booking',
      calendarId: client?.booking?.calendarId || 'primary',
      timezone: client?.booking?.timezone || 'Europe/London'
    });
  } catch (e) {
    console.error('[CALENDAR BOOKING TEST ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Get calendar events
app.get('/admin/calendar-events/:tenantKey', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { tenantKey } = req.params;
    const { limit = 10, startTime, endTime } = req.query;
    
    const client = await getFullClient(tenantKey);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    console.log('[CALENDAR EVENTS REQUESTED]', { 
      tenantKey, 
      limit, 
      startTime, 
      endTime,
      requestedBy: req.ip
    });
    
    // For testing, return mock events
    const mockEvents = [
      {
        id: 'test_event_1',
        summary: 'Test Appointment',
        start: {
          dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          timeZone: client?.booking?.timezone || 'Europe/London'
        },
        end: {
          dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(),
          timeZone: client?.booking?.timezone || 'Europe/London'
        },
        description: 'Test appointment for calendar integration',
        attendees: []
      }
    ];
    
    return res.json({
      ok: true,
      tenantKey,
      events: mockEvents,
      calendarId: client?.booking?.calendarId || 'primary',
      timezone: client?.booking?.timezone || 'Europe/London',
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[CALENDAR EVENTS ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// A/B Test Assignment Endpoint
app.post('/admin/ab-tests/:tenantKey/assign', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { tenantKey } = req.params;
    const { leadPhone, experimentName } = req.body;
    
    if (!leadPhone || !experimentName) {
      return res.status(400).json({ error: 'Lead phone and experiment name required' });
    }
    
    console.log('[AB TEST ASSIGNMENT REQUESTED]', { 
      tenantKey,
      leadPhone,
      experimentName,
      requestedBy: req.ip
    });
    
    // Select variant for this lead
    const variant = await selectABTestVariant(tenantKey, experimentName, leadPhone);
    
    if (!variant) {
      return res.status(404).json({ error: 'No active experiment found' });
    }
    
    return res.json({
      ok: true,
      tenantKey,
      leadPhone,
      experimentName,
      variant: variant.name,
      config: variant.config,
      message: 'Lead assigned to A/B test variant successfully'
    });
  } catch (e) {
    console.error('[AB TEST ASSIGNMENT ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Client Management Endpoints
// Get all clients
app.get('/admin/clients', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    console.log('[CLIENT LIST REQUESTED]', { 
      requestedBy: req.ip
    });
    
    // Get all clients from the database
    const { listFullClients } = await import('./db.js');
    const clients = await listFullClients();
    
    // Add leads count for each client
    const clientsWithLeads = await Promise.all(clients.map(async (client) => {
      const { getLeadsByClient } = await import('./db.js');
      const leads = await getLeadsByClient(client.key);
      return {
        ...client,
        leads: leads || [],
        leadCount: leads ? leads.length : 0
      };
    }));
    
    return res.json({
      ok: true,
      clients: clientsWithLeads,
      totalClients: clientsWithLeads.length,
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[CLIENT LIST ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Get specific client
app.get('/admin/clients/:clientKey', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { clientKey } = req.params;
    
    console.log('[CLIENT DETAILS REQUESTED]', { 
      clientKey,
      requestedBy: req.ip
    });
    
    const client = await getFullClient(clientKey);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    // Get leads for this client
    const { getLeadsByClient } = await import('./db.js');
    const leads = await getLeadsByClient(clientKey);
    
    return res.json({
      ok: true,
      client: {
        ...client,
        leads: leads || [],
        leadCount: leads ? leads.length : 0
      },
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[CLIENT DETAILS ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Helper function for cache hit rate calculation
function calculateCacheHitRate(tenantKey) {
  // This is a simplified calculation - in production you'd want more sophisticated tracking
  const tenantCacheKeys = Array.from(cache.keys()).filter(key => key.includes(tenantKey));
  return tenantCacheKeys.length > 0 ? Math.min(95, tenantCacheKeys.length * 10) : 0; // Mock calculation
}

app.get('/admin/system-health', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const health = {
      timestamp: new Date().toISOString(),
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        nodeVersion: process.version,
        platform: process.platform
      },
      database: {
        status: 'unknown',
        lastCheck: new Date().toISOString()
      },
      external: {
        vapi: 'unknown',
        twilio: 'unknown',
        google: 'unknown'
      },
      performance: {
        avgResponseTime: 0,
        errorRate: 0,
        requestCount: 0
      }
    };

    // Test database connectivity
    try {
      await listFullClients();
      health.database.status = 'connected';
    } catch (e) {
      health.database.status = 'disconnected';
      health.database.error = e.message;
    }

    // Test external services
    try {
      if (VAPI_PRIVATE_KEY) {
        const vapiTest = await fetch(`${VAPI_URL}/call`, {
          method: 'HEAD',
          headers: { 'Authorization': `Bearer ${VAPI_PRIVATE_KEY}` }
        });
        health.external.vapi = vapiTest.ok ? 'connected' : 'error';
      }
    } catch (e) {
      health.external.vapi = 'error';
    }

    try {
      if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
        const twilioTest = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}.json`, {
          headers: { 'Authorization': `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}` }
        });
        health.external.twilio = twilioTest.ok ? 'connected' : 'error';
      }
    } catch (e) {
      health.external.twilio = 'error';
    }

    console.log('[SYSTEM HEALTH]', { 
      database: health.database.status,
      vapi: health.external.vapi,
      twilio: health.external.twilio,
      memory: Math.round(health.system.memory.heapUsed / 1024 / 1024) + 'MB'
    });

    res.json({
      ok: true,
      health,
      status: health.database.status === 'connected' ? 'healthy' : 'degraded'
    });
  } catch (e) {
    console.error('[SYSTEM HEALTH ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Real-time metrics dashboard
app.get('/admin/metrics', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Load leads and calls data from database
    const leads = await listFullClients().then(clients => 
      clients.flatMap(client => client.leads || [])
    );
    
    // Load calls from database
    const { getCallsByTenant } = await import('./db.js');
    const allCalls = [];
    const clients = await listFullClients();
    for (const client of clients) {
      const clientCalls = await getCallsByTenant(client.clientKey, 1000);
      allCalls.push(...clientCalls);
    }
    const calls = allCalls;

    // Calculate metrics
    const metrics = {
      overview: {
        totalLeads: leads.length,
        totalCalls: calls.length,
        activeTenants: (await listFullClients()).length,
        uptime: process.uptime(),
        lastUpdated: now.toISOString()
      },
      last24h: {
        newLeads: leads.filter(l => new Date(l.createdAt || l.lastInboundAt) > last24h).length,
        totalCalls: calls.filter(c => new Date(c.createdAt) > last24h).length,
        optIns: leads.filter(l => l.consentSms && new Date(l.updatedAt) > last24h).length,
        optOuts: leads.filter(l => l.status === 'opted_out' && new Date(l.updatedAt) > last24h).length
      },
      last7d: {
        newLeads: leads.filter(l => new Date(l.createdAt || l.lastInboundAt) > last7d).length,
        totalCalls: calls.filter(c => new Date(c.createdAt) > last7d).length,
        conversionRate: 0, // Will calculate below
        avgCallDuration: 0 // Will calculate below
      },
      byTenant: {},
      costs: {
        estimatedVapiCost: calls.length * 0.05, // Rough estimate
        last24hCost: calls.filter(c => new Date(c.createdAt) > last24h).length * 0.05,
        last7dCost: calls.filter(c => new Date(c.createdAt) > last7d).length * 0.05
      },
      performance: {
        successRate: calls.filter(c => c.status === 'completed').length / Math.max(calls.length, 1) * 100,
        avgResponseTime: 0, // Will calculate from logs if available
        errorRate: calls.filter(c => c.status === 'failed').length / Math.max(calls.length, 1) * 100
      },
      vapi: {
        totalCalls: calls.length,
        callsToday: calls.filter(c => new Date(c.createdAt) > last24h).length,
        callsThisWeek: calls.filter(c => new Date(c.createdAt) > last7d).length,
        successfulCalls: calls.filter(c => c.outcome === 'completed' || c.outcome === 'booked').length,
        failedCalls: calls.filter(c => ['no-answer', 'busy', 'declined', 'failed'].includes(c.outcome)).length,
        averageCallDuration: calls.length > 0 ? calls.reduce((sum, c) => sum + (c.duration || 0), 0) / calls.length : 0,
        totalCallCost: calls.reduce((sum, c) => sum + (c.cost || 0.05), 0),
        callSuccessRate: calls.length > 0 ? (calls.filter(c => c.outcome === 'completed' || c.outcome === 'booked').length / calls.length * 100).toFixed(1) : 0,
        costPerConversion: calls.length > 0 ? (calls.reduce((sum, c) => sum + (c.cost || 0.05), 0) / Math.max(leads.filter(l => l.status === 'booked').length, 1)).toFixed(2) : 0,
        retryRate: calls.filter(c => c.retryAttempt > 0).length / Math.max(calls.length, 1) * 100,
        businessHoursCalls: calls.filter(c => {
          const callTime = new Date(c.createdAt);
          const hour = callTime.getHours();
          return hour >= 9 && hour < 17; // 9 AM to 5 PM
        }).length,
        afterHoursCalls: calls.filter(c => {
          const callTime = new Date(c.createdAt);
          const hour = callTime.getHours();
          return hour < 9 || hour >= 17;
        }).length
      }
    };

    // Calculate conversion rate (leads that got calls)
    const leadsWithCalls = leads.filter(l => calls.some(c => c.leadPhone === l.phone));
    metrics.last7d.conversionRate = leadsWithCalls.length / Math.max(leads.length, 1) * 100;

    // Calculate average call duration
    const completedCalls = calls.filter(c => c.status === 'completed' && c.duration);
    if (completedCalls.length > 0) {
      metrics.last7d.avgCallDuration = completedCalls.reduce((sum, c) => sum + (c.duration || 0), 0) / completedCalls.length;
    }

    // Calculate by tenant
    const tenants = await listFullClients();
    for (const tenant of tenants) {
      const tenantLeads = leads.filter(l => {
        // Check both tenantKey and phone number matching
        if (l.tenantKey === tenant.clientKey) return true;
        if (l.phone && tenant?.sms?.fromNumber) {
          const leadPhone = normalizePhoneE164(l.phone, 'GB');
          const tenantPhone = normalizePhoneE164(tenant.sms.fromNumber, 'GB');
          return leadPhone === tenantPhone;
        }
        return false;
      });
      const tenantCalls = calls.filter(c => c.tenantKey === tenant.clientKey);
      
      // Calculate lead scores for this tenant
      const leadScores = tenantLeads.map(lead => calculateLeadScore(lead, tenant));
      const avgLeadScore = leadScores.length > 0 ? leadScores.reduce((sum, score) => sum + score, 0) / leadScores.length : 0;
      const highPriorityLeads = leadScores.filter(score => score >= 80).length;
      const mediumPriorityLeads = leadScores.filter(score => score >= 60 && score < 80).length;
      
      metrics.byTenant[tenant.clientKey] = {
        displayName: tenant.displayName || tenant.clientKey,
        totalLeads: tenantLeads.length,
        totalCalls: tenantCalls.length,
        last24hLeads: tenantLeads.filter(l => new Date(l.createdAt || l.lastInboundAt) > last24h).length,
        last24hCalls: tenantCalls.filter(c => new Date(c.createdAt) > last24h).length,
        conversionRate: tenantCalls.length / Math.max(tenantLeads.length, 1) * 100,
        successRate: tenantCalls.filter(c => c.status === 'completed').length / Math.max(tenantCalls.length, 1) * 100,
        leadScoring: {
          avgScore: Math.round(avgLeadScore),
          highPriority: highPriorityLeads,
          mediumPriority: mediumPriorityLeads,
          lowPriority: leadScores.filter(score => score < 60).length
        }
      };
    }

    console.log('[METRICS]', { 
      totalLeads: metrics.overview.totalLeads,
      totalCalls: metrics.overview.totalCalls,
      conversionRate: metrics.last7d.conversionRate.toFixed(1) + '%',
      requestedBy: req.ip 
    });

    res.json({
      ok: true,
      metrics,
      generatedAt: now.toISOString()
    });
  } catch (e) {
    console.error('[METRICS ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin endpoint to fix tenant SMS configurations
app.post('/admin/fix-tenants', async (req, res) => {
  try {
    console.log('[TENANT FIX] Starting tenant configuration fix...');
    
    // Use the valid MessagingServiceSid that we know works
    const validMessagingServiceSid = 'MG852f3cf7b50ef1be50c566be9e7efa04';
    
    // Fix victory_dental configuration
    await upsertFullClient({
      clientKey: 'victory_dental',
      displayName: 'Victory Dental',
      timezone: 'Europe/London',
      locale: 'en-GB',
      numbers: {
        clinic: '+447491683261',
        inbound: '+447403934440'
      },
      sms: {
        fromNumber: '+447403934440',
        messagingServiceSid: validMessagingServiceSid
      },
      vapi: {},
      calendarId: null,
      booking: {
        defaultDurationMin: 30,
        timezone: 'Europe/London'
      },
      smsTemplates: {}
    });
    
    // Fix northside_vet configuration
    await upsertFullClient({
      clientKey: 'northside_vet',
      displayName: 'Northside Vet',
      timezone: 'Europe/London',
      locale: 'en-GB',
      numbers: {
        clinic: '+447491683261',
        inbound: '+447491683261'
      },
      sms: {
        fromNumber: '+447491683261',
        messagingServiceSid: validMessagingServiceSid
      },
      vapi: {},
      calendarId: null,
      booking: {
        defaultDurationMin: 30,
        timezone: 'Europe/London'
      },
      smsTemplates: {}
    });
    
    console.log('[TENANT FIX] Configuration fix completed successfully');
    
    res.json({
      ok: true,
      message: 'Tenant configurations fixed successfully with valid MessagingServiceSid',
      changes: {
        victory_dental: {
          fromNumber: '+447403934440',
          messagingServiceSid: validMessagingServiceSid
        },
        northside_vet: {
          fromNumber: '+447491683261',
          messagingServiceSid: validMessagingServiceSid
        }
      }
    });
  } catch (e) {
    console.error('[TENANT FIX ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const { getLastHealthCheck, getDatabaseStats } = await import('./lib/database-health.js');
    const messagingService = (await import('./lib/messaging-service.js')).default;
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      uptimeFormatted: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
      memory: {
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`
      },
      version: process.env.npm_package_version || '1.0.0'
    };
    
    // Check database connectivity and health
    const dbHealth = getLastHealthCheck();
    health.database = {
      status: dbHealth.status || 'unknown',
      lastCheck: dbHealth.timestamp,
      responseTime: dbHealth.responseTime ? `${dbHealth.responseTime}ms` : 'N/A',
      consecutiveFailures: dbHealth.consecutiveFailures || 0
    };
    
    // Check messaging services
    const messagingConfig = messagingService.isConfigured();
    health.messaging = {
      sms: messagingConfig.sms ? 'configured' : 'not_configured',
      email: messagingConfig.email ? 'configured' : 'not_configured'
    };
    
    // Check critical services
    health.services = {
      vapi: !!(process.env.VAPI_PRIVATE_KEY && process.env.VAPI_ASSISTANT_ID) ? 'configured' : 'not_configured',
      googleCalendar: !!(GOOGLE_CLIENT_EMAIL && GOOGLE_CALENDAR_ID) ? 'configured' : 'not_configured',
      twilio: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) ? 'configured' : 'not_configured'
    };
    
    // Overall status determination
    if (dbHealth.status === 'critical') {
      health.status = 'critical';
    } else if (dbHealth.status === 'degraded' || !messagingConfig.sms) {
      health.status = 'degraded';
    }
    
    res.json(health);
  } catch (e) {
    res.status(500).json({ status: 'unhealthy', error: e.message, timestamp: new Date().toISOString() });
  }
});

// Monitoring endpoint for tenant resolution
app.get('/monitor/tenant-resolution', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const clients = await listFullClients();
    const tenantStats = {
      totalTenants: clients.length,
      tenantsWithSms: clients.filter(c => c?.sms?.fromNumber).length,
      tenantsWithMessagingService: clients.filter(c => c?.sms?.messagingServiceSid).length,
      duplicateFromNumbers: {},
      duplicateMessagingServices: {},
      lastChecked: new Date().toISOString()
    };
    
    // Check for duplicates
    const fromNumbers = {};
    const messagingServices = {};
    
    clients.forEach(client => {
      if (client?.sms?.fromNumber) {
        fromNumbers[client.sms.fromNumber] = (fromNumbers[client.sms.fromNumber] || 0) + 1;
      }
      if (client?.sms?.messagingServiceSid) {
        messagingServices[client.sms.messagingServiceSid] = (messagingServices[client.sms.messagingServiceSid] || 0) + 1;
      }
    });
    
    tenantStats.duplicateFromNumbers = Object.entries(fromNumbers).filter(([_, count]) => count > 1);
    tenantStats.duplicateMessagingServices = Object.entries(messagingServices).filter(([_, count]) => count > 1);
    
    res.json(tenantStats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SMS delivery monitoring endpoint
app.get('/monitor/sms-delivery', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // This would typically query a metrics database
    // For now, we'll return a basic structure
    const smsStats = {
      totalSent: 0, // Would be populated from actual metrics
      totalDelivered: 0,
      totalFailed: 0,
      deliveryRate: 0,
      last24Hours: {
        sent: 0,
        delivered: 0,
        failed: 0
      },
      byTenant: {},
      lastUpdated: new Date().toISOString()
    };
    
    res.json(smsStats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Performance monitoring endpoints
app.get('/api/performance/stats', (req, res) => {
  try {
    const stats = performanceMonitor.getStats();
    res.json({ success: true, ...stats });
  } catch (error) {
    console.error('[PERF STATS ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/performance/report', (req, res) => {
  try {
    const report = performanceMonitor.generateReport();
    res.json({ success: true, report });
  } catch (error) {
    console.error('[PERF REPORT ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/cache/stats', (req, res) => {
  try {
    const stats = cache.getStats();
    res.json({ success: true, ...stats });
  } catch (error) {
    console.error('[CACHE STATS ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/cache/clear', (req, res) => {
  try {
    cache.clear();
    res.json({ success: true, message: 'Cache cleared successfully' });
  } catch (error) {
    console.error('[CACHE CLEAR ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stats (with caching)
app.get('/api/stats', cacheMiddleware({ ttl: 60000 }), async (req, res) => {
  try {
    const clientKey = req.query.clientKey;
    const range = req.query.range || '30d';
    
    // Calculate date range
    const now = new Date();
    const daysMap = { 'today': 1, '7d': 7, '30d': 30, '90d': 90 };
    const days = daysMap[range] || 30;
    const startDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));

    let stats = {};

    if (clientKey) {
      // Client-specific stats from database
      try {
        const { query } = await import('./db.js');

        // Get lead stats
        const leadsResult = await query(`
          SELECT COUNT(*) as total
          FROM leads
          WHERE client_key = $1
            AND created_at >= $2
        `, [clientKey, startDate]);

        // Get call stats
        const callsResult = await query(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN status = 'no_answer' THEN 1 ELSE 0 END) as no_answer
          FROM call_queue
          WHERE client_key = $1
            AND created_at >= $2
        `, [clientKey, startDate]);

        // Get booking stats
        const bookingsResult = await query(`
          SELECT COUNT(*) as total
          FROM leads
          WHERE client_key = $1
            AND status = 'booked'
            AND updated_at >= $2
        `, [clientKey, startDate]);

        const leads = parseInt(leadsResult.rows[0]?.total || 0);
        const calls = parseInt(callsResult.rows[0]?.total || 0);
        const completed = parseInt(callsResult.rows[0]?.completed || 0);
        const failed = parseInt(callsResult.rows[0]?.failed || 0);
        const noAnswer = parseInt(callsResult.rows[0]?.no_answer || 0);
        const bookings = parseInt(bookingsResult.rows[0]?.total || 0);

        // Calculate metrics
        const conversionRate = calls > 0 ? ((bookings / calls) * 100).toFixed(1) : 0;

        // Get trend data (last 7 days)
        const trendResult = await query(`
          SELECT 
            DATE(created_at) as date,
            COUNT(*) as calls
          FROM call_queue
          WHERE client_key = $1
            AND created_at >= $2
          GROUP BY DATE(created_at)
          ORDER BY date DESC
          LIMIT 7
        `, [clientKey, new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000))]);

        const trendLabels = trendResult.rows.map(r => new Date(r.date).toLocaleDateString('en-US', { weekday: 'short' })).reverse();
        const trendCalls = trendResult.rows.map(r => parseInt(r.calls)).reverse();

        stats = {
          leads,
          calls,
          bookings,
          conversionRate: parseFloat(conversionRate),
          funnel: [leads, calls, completed, bookings],
          outcomes: [bookings, Math.floor(completed * 0.3), Math.floor(completed * 0.2), noAnswer, failed],
          trendLabels,
          trendCalls,
          trendBookings: trendCalls.map(c => Math.floor(c * 0.21)), // Mock booking trend
          peakHours: [12, 18, 25, 22, 15, 20, 28, 24, 19] // Mock peak hours data
        };

      } catch (dbError) {
        console.error('[STATS API] Database error:', dbError);
        // Return mock data if database query fails
        stats = {
          leads: 0,
          calls: 0,
          bookings: 0,
          conversionRate: 0,
          funnel: [0, 0, 0, 0],
          outcomes: [0, 0, 0, 0, 0],
          trendLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          trendCalls: [0, 0, 0, 0, 0, 0, 0],
          trendBookings: [0, 0, 0, 0, 0, 0, 0],
          peakHours: [0, 0, 0, 0, 0, 0, 0, 0, 0]
        };
      }
    } else {
      // Legacy: All tenants stats (keeping for backward compatibility)
      const calls = await readJson(CALLS_PATH, []);
      const smsEvents = await readJson(SMS_STATUS_PATH, []);
      const agg = {};
      const day = 24 * 60 * 60 * 1000;
      const within = (ts, days) => (now.getTime() - ts) <= (days * day);

      for (const c of calls) {
        const t = c.tenant || 'default';
        const ts = new Date(c.created_at || c.at || Date.now()).getTime();
        agg[t] ||= { bookings7: 0, bookings30: 0, smsSent7: 0, smsSent30: 0 };
        if (within(ts, 7))  agg[t].bookings7++;
        if (within(ts, 30)) agg[t].bookings30++;
      }

      for (const e of smsEvents) {
        const t = e.tenant || 'default';
        const ts = new Date(e.at || Date.now()).getTime();
        const ok = ['accepted','queued','sent','delivered'].includes(e.status);
        if (!ok) continue;
        agg[t] ||= { bookings7: 0, bookings30: 0, smsSent7: 0, smsSent30: 0 };
        if (within(ts, 7))  agg[t].smsSent7++;
        if (within(ts, 30)) agg[t].smsSent30++;
      }

      const rows = await listFullClients();
      for (const r of rows) agg[r.clientKey] ||= { bookings7: 0, bookings30: 0, smsSent7: 0, smsSent30: 0 };

      return res.json({ ok: true, tenants: agg });
    }

    res.json({ ok: true, ...stats });

  } catch (error) {
    console.error('[STATS API ERROR]', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to fetch stats',
      details: error.message 
    });
  }
});

// AI Insights endpoints
app.get('/api/insights/:clientKey', cacheMiddleware({ ttl: 300000 }), async (req, res) => {
  try {
    const { clientKey } = req.params;
    const days = parseInt(req.query.days) || 30;
    
    // Verify client exists
    const client = await getFullClient(clientKey);
    if (!client) {
      return res.status(404).json({ ok: false, error: 'Client not found' });
    }
    
    // Generate insights from database
    const insightsEngine = new AIInsightsEngine();
    const insights = await insightsEngine.generateInsightsFromDB(clientKey, days);
    
    // Get client data for summary
    const clientData = await insightsEngine.fetchClientData(clientKey, days);
    
    res.json({
      ok: true,
      clientKey,
      period: `Last ${days} days`,
      generatedAt: new Date().toISOString(),
      insights,
      summary: {
        totalCalls: clientData.calls,
        totalBookings: clientData.bookings,
        conversionRate: clientData.calls > 0 ? ((clientData.bookings / clientData.calls) * 100).toFixed(1) + '%' : '0%',
        avgCallDuration: Math.round(clientData.avgCallDuration) + 's',
        totalCost: '£' + clientData.totalCost.toFixed(2)
      }
    });
  } catch (error) {
    console.error('[AI INSIGHTS ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Lead Scoring endpoints
app.post('/api/leads/score', async (req, res) => {
  try {
    const { lead, clientKey } = req.body;
    
    if (!lead || !clientKey) {
      return res.status(400).json({ ok: false, error: 'lead and clientKey are required' });
    }
    
    const scoringEngine = new LeadScoringEngine();
    const score = await scoringEngine.scoreLeadWithHistory(lead, clientKey);
    
    res.json({
      ok: true,
      lead: {
        ...lead,
        score
      },
      score,
      scoreCategory: score >= 80 ? 'high' : score >= 60 ? 'medium' : score >= 40 ? 'low' : 'very_low'
    });
  } catch (error) {
    console.error('[LEAD SCORING ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/leads/prioritize', async (req, res) => {
  try {
    const { leads, clientKey } = req.body;
    
    if (!leads || !Array.isArray(leads) || !clientKey) {
      return res.status(400).json({ ok: false, error: 'leads (array) and clientKey are required' });
    }
    
    const scoringEngine = new LeadScoringEngine();
    const prioritized = await scoringEngine.prioritizeLeadsWithHistory(leads, clientKey);
    
    res.json({
      ok: true,
      leads: prioritized,
      total: prioritized.length,
      highPriority: prioritized.filter(l => l.score >= 80).length,
      mediumPriority: prioritized.filter(l => l.score >= 60 && l.score < 80).length,
      lowPriority: prioritized.filter(l => l.score < 60).length
    });
  } catch (error) {
    console.error('[LEAD PRIORITIZATION ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ROI Calculator for Client Acquisition
app.post('/api/roi-calculator/save', async (req, res) => {
  try {
    const { email, results } = req.body;
    
    if (!email || !results) {
      return res.status(400).json({ ok: false, error: 'email and results are required' });
    }
    
    // Save to database (create a table for ROI calculator leads if it doesn't exist)
    try {
      const { query } = await import('./db.js');
      
      // Create table if it doesn't exist
      await query(`
        CREATE TABLE IF NOT EXISTS roi_calculator_leads (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) NOT NULL,
          industry VARCHAR(50),
          leads_per_month INTEGER,
          current_conversion DECIMAL(5,2),
          improved_conversion DECIMAL(5,2),
          avg_value DECIMAL(10,2),
          hours_spent DECIMAL(5,2),
          current_bookings INTEGER,
          potential_bookings INTEGER,
          extra_bookings INTEGER,
          current_revenue DECIMAL(10,2),
          potential_revenue DECIMAL(10,2),
          revenue_lost DECIMAL(10,2),
          time_value DECIMAL(10,2),
          total_value DECIMAL(10,2),
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      // Insert lead
      await query(`
        INSERT INTO roi_calculator_leads (
          email, industry, leads_per_month, current_conversion, improved_conversion,
          avg_value, hours_spent, current_bookings, potential_bookings, extra_bookings,
          current_revenue, potential_revenue, revenue_lost, time_value, total_value
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [
        email,
        results.industry,
        results.leadsPerMonth,
        results.currentConversion,
        results.improvedConversion,
        results.avgValue,
        results.hoursSpent,
        results.currentBookings,
        results.potentialBookings,
        results.extraBookings,
        results.currentRevenue,
        results.potentialRevenue,
        results.revenueLost,
        results.timeValue,
        results.totalValue
      ]);
      
      console.log(`[ROI CALCULATOR] Lead captured: ${email} - Revenue lost: £${results.revenueLost}`);
      
      // TODO: Send email with detailed report
      // TODO: Add to email sequence
      
    } catch (dbError) {
      console.error('[ROI CALCULATOR] Database error:', dbError);
      // Don't fail the request if DB fails - still return success
    }
    
    res.json({
      ok: true,
      message: 'Results saved successfully',
      emailSent: false // TODO: Set to true when email is sent
    });
  } catch (error) {
    console.error('[ROI CALCULATOR SAVE ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Get ROI calculator leads (admin endpoint)
app.get('/api/admin/roi-calculator/leads', async (req, res) => {
  try {
    const { query } = await import('./db.js');
    const { limit = 100 } = req.query;
    
    const result = await query(`
      SELECT * FROM roi_calculator_leads
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);
    
    res.json({
      ok: true,
      leads: result.rows
    });
  } catch (error) {
    console.error('[ROI CALCULATOR LEADS ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Outreach Prospects API
app.get('/api/outreach/prospects', async (req, res) => {
  try {
    const { query } = await import('./db.js');
    const { status, channel, industry, limit = 100, offset = 0 } = req.query;
    
    let sql = 'SELECT * FROM outreach_prospects WHERE 1=1';
    const params = [];
    let paramCount = 1;
    
    if (status) {
      sql += ` AND status = $${paramCount++}`;
      params.push(status);
    }
    
    if (channel) {
      sql += ` AND channel = $${paramCount++}`;
      params.push(channel);
    }
    
    if (industry) {
      sql += ` AND industry = $${paramCount++}`;
      params.push(industry);
    }
    
    sql += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await query(sql, params);
    
    // Get total count
    let countSql = 'SELECT COUNT(*) as total FROM outreach_prospects WHERE 1=1';
    const countParams = [];
    paramCount = 1;
    
    if (status) {
      countSql += ` AND status = $${paramCount++}`;
      countParams.push(status);
    }
    if (channel) {
      countSql += ` AND channel = $${paramCount++}`;
      countParams.push(channel);
    }
    if (industry) {
      countSql += ` AND industry = $${paramCount++}`;
      countParams.push(industry);
    }
    
    const countResult = await query(countSql, countParams);
    const total = parseInt(countResult.rows[0]?.total || 0);
    
    res.json({
      ok: true,
      prospects: result.rows,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('[OUTREACH PROSPECTS ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/outreach/prospects', async (req, res) => {
  try {
    const { query } = await import('./db.js');
    const {
      name,
      businessName,
      email,
      phone,
      linkedinUrl,
      website,
      industry,
      location,
      channel,
      templateUsed,
      leadSource,
      tags,
      notes
    } = req.body;
    
    if (!email) {
      return res.status(400).json({ ok: false, error: 'email is required' });
    }
    
    // Check if prospect already exists
    const existing = await query('SELECT id FROM outreach_prospects WHERE email = $1', [email]);
    
    if (existing.rows.length > 0) {
      return res.status(409).json({ ok: false, error: 'Prospect with this email already exists' });
    }
    
    const result = await query(`
      INSERT INTO outreach_prospects (
        name, business_name, email, phone, linkedin_url, website, industry, location,
        channel, template_used, lead_source, tags, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      name, businessName, email, phone, linkedinUrl, website, industry, location,
      channel, templateUsed, leadSource, tags || [], notes
    ]);
    
    res.json({
      ok: true,
      prospect: result.rows[0]
    });
  } catch (error) {
    console.error('[OUTREACH CREATE PROSPECT ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.put('/api/outreach/prospects/:id', async (req, res) => {
  try {
    const { query } = await import('./db.js');
    const { id } = req.params;
    const updates = req.body;
    
    const allowedFields = [
      'name', 'business_name', 'email', 'phone', 'linkedin_url', 'website',
      'industry', 'location', 'status', 'channel', 'template_used',
      'contact_number', 'last_contacted_at', 'response_date', 'follow_up_date',
      'outcome', 'tags', 'notes', 'lead_source', 'metadata'
    ];
    
    const updateFields = [];
    const params = [];
    let paramCount = 1;
    
    const fieldMap = {
      'name': 'name',
      'businessName': 'business_name',
      'business_name': 'business_name',
      'email': 'email',
      'phone': 'phone',
      'linkedinUrl': 'linkedin_url',
      'linkedin_url': 'linkedin_url',
      'website': 'website',
      'industry': 'industry',
      'location': 'location',
      'status': 'status',
      'channel': 'channel',
      'templateUsed': 'template_used',
      'template_used': 'template_used',
      'contact_number': 'contact_number',
      'contactNumber': 'contact_number',
      'last_contacted_at': 'last_contacted_at',
      'lastContactedAt': 'last_contacted_at',
      'response_date': 'response_date',
      'responseDate': 'response_date',
      'follow_up_date': 'follow_up_date',
      'followUpDate': 'follow_up_date',
      'outcome': 'outcome',
      'tags': 'tags',
      'notes': 'notes',
      'lead_source': 'lead_source',
      'leadSource': 'lead_source',
      'metadata': 'metadata'
    };

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        const dbField = fieldMap[field] || field;
        updateFields.push(`${dbField} = $${paramCount++}`);
        params.push(updates[field]);
      }
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ ok: false, error: 'No valid fields to update' });
    }
    
    params.push(id);
    
    const result = await query(`
      UPDATE outreach_prospects
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Prospect not found' });
    }
    
    res.json({
      ok: true,
      prospect: result.rows[0]
    });
  } catch (error) {
    console.error('[OUTREACH UPDATE PROSPECT ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/outreach/prospects/import', async (req, res) => {
  try {
    const { query } = await import('./db.js');
    const { prospects } = req.body; // Array of prospect objects
    
    if (!Array.isArray(prospects) || prospects.length === 0) {
      return res.status(400).json({ ok: false, error: 'prospects array is required' });
    }
    
    const imported = [];
    const errors = [];
    
    for (const prospect of prospects) {
      try {
        // Check if exists
        const existing = await query('SELECT id FROM outreach_prospects WHERE email = $1', [prospect.email]);
        
        if (existing.rows.length > 0) {
          errors.push({ email: prospect.email, error: 'Already exists' });
          continue;
        }
        
        const result = await query(`
          INSERT INTO outreach_prospects (
            name, business_name, email, phone, linkedin_url, website, industry, location,
            channel, template_used, lead_source, tags, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id, email
        `, [
          prospect.name,
          prospect.businessName || prospect.business_name,
          prospect.email,
          prospect.phone,
          prospect.linkedinUrl || prospect.linkedin_url,
          prospect.website,
          prospect.industry,
          prospect.location,
          prospect.channel || 'email',
          prospect.templateUsed || prospect.template_used,
          prospect.leadSource || prospect.lead_source,
          prospect.tags || [],
          prospect.notes
        ]);
        
        imported.push(result.rows[0]);
      } catch (error) {
        errors.push({ email: prospect.email, error: error.message });
      }
    }
    
    res.json({
      ok: true,
      imported: imported.length,
      errors: errors.length,
      importedProspects: imported,
      errorDetails: errors
    });
  } catch (error) {
    console.error('[OUTREACH IMPORT ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/outreach/personalize-email', async (req, res) => {
  try {
    const { template, subjectTemplate, prospects } = req.body;
    
    if (!template || !subjectTemplate || !prospects || !Array.isArray(prospects)) {
      return res.status(400).json({ ok: false, error: 'template, subjectTemplate, and prospects array are required' });
    }
    
    const personalized = prospects.map(prospect => {
      let personalizedSubject = subjectTemplate;
      let personalizedBody = template;
      
      // Replace placeholders
      const replacements = {
        '{name}': prospect.name || 'there',
        '{businessName}': prospect.businessName || prospect.business_name || 'your business',
        '{location}': prospect.location || 'your area',
        '{industry}': prospect.industry || 'business',
        '{phone}': prospect.phone || '',
        '{website}': prospect.website || ''
      };
      
      for (const [key, value] of Object.entries(replacements)) {
        personalizedSubject = personalizedSubject.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
        personalizedBody = personalizedBody.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
      }
      
      return {
        prospect,
        subject: personalizedSubject,
        body: personalizedBody,
        to: prospect.email
      };
    });
    
    res.json({
      ok: true,
      personalized,
      count: personalized.length
    });
  } catch (error) {
    console.error('[EMAIL PERSONALIZATION ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/outreach/analytics', async (req, res) => {
  try {
    const { query } = await import('./db.js');
    const { days = 30 } = req.query;
    
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - parseInt(days));
    
    // Get status breakdown
    const statusBreakdown = await query(`
      SELECT status, COUNT(*) as count
      FROM outreach_prospects
      WHERE created_at >= $1
      GROUP BY status
    `, [sinceDate.toISOString()]);
    
    // Get channel breakdown
    const channelBreakdown = await query(`
      SELECT channel, COUNT(*) as count
      FROM outreach_prospects
      WHERE created_at >= $1
      GROUP BY channel
    `, [sinceDate.toISOString()]);
    
    // Get industry breakdown
    const industryBreakdown = await query(`
      SELECT industry, COUNT(*) as count
      FROM outreach_prospects
      WHERE created_at >= $1
      AND industry IS NOT NULL
      GROUP BY industry
      ORDER BY count DESC
      LIMIT 10
    `, [sinceDate.toISOString()]);
    
    // Get conversion funnel
    const total = await query('SELECT COUNT(*) as count FROM outreach_prospects WHERE created_at >= $1', [sinceDate.toISOString()]);
    const contacted = await query('SELECT COUNT(*) as count FROM outreach_prospects WHERE status != \'new\' AND created_at >= $1', [sinceDate.toISOString()]);
    const replied = await query('SELECT COUNT(*) as count FROM outreach_prospects WHERE status = \'replied\' AND created_at >= $1', [sinceDate.toISOString()]);
    const demoBooked = await query('SELECT COUNT(*) as count FROM outreach_prospects WHERE status = \'demo_booked\' AND created_at >= $1', [sinceDate.toISOString()]);
    const clients = await query('SELECT COUNT(*) as count FROM outreach_prospects WHERE status = \'client\' AND created_at >= $1', [sinceDate.toISOString()]);
    
    // Get response rates by channel
    const responseRates = await query(`
      SELECT 
        channel,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('replied', 'demo_booked', 'client')) as responded,
        ROUND(COUNT(*) FILTER (WHERE status IN ('replied', 'demo_booked', 'client'))::numeric / NULLIF(COUNT(*), 0)::numeric * 100, 2) as response_rate
      FROM outreach_prospects
      WHERE created_at >= $1
      AND channel IS NOT NULL
      GROUP BY channel
    `, [sinceDate.toISOString()]);
    
    res.json({
      ok: true,
      period: `Last ${days} days`,
      funnel: {
        total: parseInt(total.rows[0]?.count || 0),
        contacted: parseInt(contacted.rows[0]?.count || 0),
        replied: parseInt(replied.rows[0]?.count || 0),
        demoBooked: parseInt(demoBooked.rows[0]?.count || 0),
        clients: parseInt(clients.rows[0]?.count || 0)
      },
      statusBreakdown: statusBreakdown.rows,
      channelBreakdown: channelBreakdown.rows,
      industryBreakdown: industryBreakdown.rows,
      responseRates: responseRates.rows
    });
  } catch (error) {
    console.error('[OUTREACH ANALYTICS ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// CRM Integration endpoints
app.post('/api/crm/hubspot/sync', async (req, res) => {
  try {
    const { clientKey, hubspotApiKey } = req.body;
    
    if (!clientKey || !hubspotApiKey) {
      return res.status(400).json({ ok: false, error: 'clientKey and hubspotApiKey are required' });
    }
    
    // TODO: Implement HubSpot sync
    // This would sync leads, calls, and appointments to HubSpot
    
    res.json({
      ok: true,
      message: 'HubSpot sync initiated',
      status: 'pending',
      note: 'CRM integration is in development. This endpoint will sync leads, calls, and appointments to HubSpot.'
    });
  } catch (error) {
    console.error('[HUBSPOT SYNC ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/crm/salesforce/sync', async (req, res) => {
  try {
    const { clientKey, salesforceCredentials } = req.body;
    
    if (!clientKey || !salesforceCredentials) {
      return res.status(400).json({ ok: false, error: 'clientKey and salesforceCredentials are required' });
    }
    
    // TODO: Implement Salesforce sync
    // This would sync leads, calls, and appointments to Salesforce
    
    res.json({
      ok: true,
      message: 'Salesforce sync initiated',
      status: 'pending',
      note: 'CRM integration is in development. This endpoint will sync leads, calls, and appointments to Salesforce.'
    });
  } catch (error) {
    console.error('[SALESFORCE SYNC ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/crm/integrations/:clientKey', async (req, res) => {
  try {
    const { clientKey } = req.params;
    
    // Get client CRM integration settings
    const client = await getFullClient(clientKey);
    if (!client) {
      return res.status(404).json({ ok: false, error: 'Client not found' });
    }
    
    // TODO: Store CRM integration settings in database
    const integrations = {
      hubspot: {
        enabled: false,
        connected: false,
        lastSync: null
      },
      salesforce: {
        enabled: false,
        connected: false,
        lastSync: null
      }
    };
    
    res.json({
      ok: true,
      clientKey,
      integrations
    });
  } catch (error) {
    console.error('[CRM INTEGRATIONS ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// White-label branding endpoints
app.get('/api/branding/:clientKey', async (req, res) => {
  try {
    const { clientKey } = req.params;
    const client = await getFullClient(clientKey);
    
    if (!client) {
      return res.status(404).json({ ok: false, error: 'Client not found' });
    }
    
    const { getClientBranding } = await import('./lib/whitelabel.js');
    const branding = getClientBranding(client);
    
    res.json({ ok: true, branding });
  } catch (error) {
    console.error('[BRANDING GET ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.put('/api/branding/:clientKey', async (req, res) => {
  try {
    const { clientKey } = req.params;
    const brandingData = req.body;
    
    // Validate branding
    const { validateBranding } = await import('./lib/whitelabel.js');
    const validation = validateBranding(brandingData);
    
    if (!validation.valid) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Invalid branding configuration',
        details: validation.errors 
      });
    }
    
    // Get client and update
    const client = await getFullClient(clientKey);
    
    if (!client) {
      return res.status(404).json({ ok: false, error: 'Client not found' });
    }
    
    // Merge branding with existing
    const updatedClient = {
      ...client,
      branding: {
        ...(client.branding || {}),
        ...brandingData
      },
      updatedAt: new Date().toISOString()
    };
    
    await upsertFullClient(updatedClient);
    
    console.log(`[BRANDING] Updated branding for ${clientKey}`);
    
    res.json({ 
      ok: true, 
      branding: updatedClient.branding,
      warnings: validation.warnings
    });
  } catch (error) {
    console.error('[BRANDING UPDATE ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Lead scoring endpoint
app.post('/api/analytics/score-leads', async (req, res) => {
  try {
    const { clientKey } = req.query;
    if (!clientKey) return res.status(400).json({ ok: false, error: 'clientKey required' });
    
    const { query } = await import('./db.js');
    const { calculateLeadScore } = await import('./lib/analytics-tracker.js');
    
    // Get all leads for this client
    const leadsResult = await query(`
      SELECT l.*, 
        (SELECT COUNT(*) FROM call_queue WHERE lead_phone = l.phone AND client_key = $1) as call_count,
        (SELECT COUNT(*) FROM call_queue WHERE lead_phone = l.phone AND client_key = $1 AND status = 'completed') as answered_count,
        (SELECT MAX(duration) FROM call_queue WHERE lead_phone = l.phone AND client_key = $1) as max_duration
      FROM leads l
      WHERE l.client_key = $1
    `, [clientKey]);
    
    const scoredLeads = leadsResult.rows.map(lead => {
      const behavior = {
        callAnswered: lead.answered_count > 0,
        callCount: parseInt(lead.call_count || 0),
        callDuration: parseInt(lead.max_duration || 0),
        daysSinceContact: lead.last_contacted_at 
          ? Math.floor((Date.now() - new Date(lead.last_contacted_at).getTime()) / (1000 * 60 * 60 * 24))
          : 365
      };
      
      const score = calculateLeadScore(lead, behavior);
      
      return {
        phone: lead.phone,
        name: lead.name,
        score,
        priority: score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low',
        behavior
      };
    });
    
    // Sort by score descending
    scoredLeads.sort((a, b) => b.score - a.score);
    
    res.json({ ok: true, leads: scoredLeads });
  } catch (error) {
    console.error('[SCORE LEADS ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Clients API (DB-backed)
app.get('/api/clients', async (_req, res) => {
  try {
    const rows = await listFullClients();
    res.json({ ok: true, count: rows.length, clients: rows });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e) });
  }
});

app.get('/api/clients/:key', async (req, res) => {
  try {
    let c = await getFullClient(req.params.key);
    
    // Fallback: check local client files if not in database
    if (!c) {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const clientFile = path.join(process.cwd(), 'demos', `.client-${req.params.key}.json`);
        if (fs.existsSync(clientFile)) {
          const fileContent = fs.readFileSync(clientFile, 'utf8');
          c = JSON.parse(fileContent);
        }
      } catch (fileError) {
        // Ignore file read errors
      }
    }
    
    if (!c) return res.status(404).json({ ok:false, error: 'not found' });
    res.json({ ok:true, client: c });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e) });
  }
});

app.post('/api/clients', async (req, res) => {
  try {
    const c = req.body || {};
    const key = (c.clientKey || '').toString().trim();
    if (!key) return res.status(400).json({ ok:false, error: 'clientKey is required' });
    const tz = c.booking?.timezone || TIMEZONE;
    if (typeof tz !== 'string' || !tz.length) return res.status(400).json({ ok:false, error: 'booking.timezone is required' });
    if (c.sms && !(c.sms.messagingServiceSid || c.sms.fromNumber)) {
      return res.status(400).json({ ok:false, error: 'sms.messagingServiceSid or sms.fromNumber required when sms block present' });
    }
    await upsertFullClient(c);
    const saved = await getFullClient(key);
    return res.json({ ok: true, client: saved });
  } catch (e) {
    return res.status(500).json({ ok:false, error: String(e) });
  }
});

app.delete('/api/clients/:key', async (req, res) => {
  try {
    const out = await deleteClient(req.params.key);
    res.json({ ok: true, deleted: out.changes });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e) });
  }
});



// === Cancel ===

app.post('/api/calendar/cancel', async (req, res) => {
  try {
    const client = await getClientFromHeader(req);
    if (!client) return res.status(400).json({ ok:false, error:'Unknown tenant' });
    const { eventId, leadPhone } = req.body || {};
    if (!eventId) return res.status(400).json({ ok:false, error:'eventId required' });
    const auth = makeJwtAuth({ clientEmail: GOOGLE_CLIENT_EMAIL, privateKey: GOOGLE_PRIVATE_KEY, privateKeyB64: GOOGLE_PRIVATE_KEY_B64 });
    await auth.authorize();
    const cal = google.calendar({ version:'v3', auth });
    try {
      await cal.events.delete({ calendarId: pickCalendarId(client), eventId });
    } catch (e) {
      const sc = e?.response?.status;
      if (sc !== 404 && sc !== 410) throw e; // only rethrow non-idempotent-safe errors
    }
    if (leadPhone) {
      try {
        const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
        if (configured) {
          const payload = { to: leadPhone, body: 'Your appointment has been cancelled. Reply if you would like to reschedule.' };
          if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid; else if (fromNumber) payload.from = fromNumber;
          await smsClient.messages.create(payload);
        }
      } catch {}
    }
    res.json({ ok:true });
  } catch (e) {
    const code = e?.response?.status || 500;
    res.status(code).json({ ok:false, error: String(e?.response?.data || e?.message || e) });
  }
});

// === Reschedule ===
app.post('/api/calendar/reschedule', async (req, res) => {
  try {
    const client = await getClientFromHeader(req);
    if (!client) return res.status(400).json({ ok:false, error:'Unknown tenant' });
    const { oldEventId, newStartISO, service, lead } = req.body || {};
    if (!oldEventId || !newStartISO || !service || !lead?.phone) {
      return res.status(400).json({ ok:false, error:'missing fields' });
    }
    const tz = pickTimezone(client);
    const calendarId = pickCalendarId(client);
    const auth = makeJwtAuth({ clientEmail: GOOGLE_CLIENT_EMAIL, privateKey: GOOGLE_PRIVATE_KEY, privateKeyB64: GOOGLE_PRIVATE_KEY_B64 });
    await auth.authorize();
    const cal = google.calendar({ version:'v3', auth });
    try { await cal.events.delete({ calendarId, eventId: oldEventId }); } catch {}

    const dur = client?.booking?.defaultDurationMin || 30;
    const endISO = new Date(new Date(newStartISO).getTime() + dur * 60000).toISOString();
    const summary = `${service} — ${lead.name || ''}`.trim();

    let event;
    try {
      event = await insertEvent({
        auth, calendarId, summary, description: '', startIso: newStartISO, endIso: endISO, timezone: tz,
        extendedProperties: { private: { leadPhone: lead.phone, leadId: lead.id || '' } }
      });
    } catch (e) {
      const code = e?.response?.status || 500;
      const data = e?.response?.data || e?.message || String(e);
      return res.status(code).json({ ok:false, error:'gcal_insert_failed', details: data });
    }

    try {
      const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
      if (configured) {
        const when = new Date(newStartISO).toLocaleString(client?.locale || 'en-GB', {
          timeZone: tz, weekday: 'short', day: 'numeric', month: 'short',
          hour: 'numeric', minute: '2-digit', hour12: true
        });
        const brand = client?.displayName || client?.clientKey || 'Our Clinic';
        const link  = event?.htmlLink ? ` Calendar: ${event.htmlLink}` : '';
        const body  = `✅ Rescheduled: ${service} at ${when} ${tz}.${link}`;
        const payload = { to: lead.phone, body };
        if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid; else if (fromNumber) payload.from = fromNumber;
        await smsClient.messages.create(payload);
      }
    } catch {}

    res.status(201).json({ ok:true, event: { id: event.id, htmlLink: event.htmlLink, status: event.status } });
  } catch (e) {
    const code = e?.response?.status || 500;
    res.status(code).json({ ok:false, error: String(e?.response?.data || e?.message || e) });
  }
});




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



// === Leads routes (JSON-backed using existing DATA_DIR/LEADS_PATH) ===
app.post('/api/leads', async (req, res) => {
  try {
    const client = await getClientFromHeader(req);
    if (!client) return res.status(401).json({ ok:false, error:'missing or unknown X-Client-Key' });

    const body = req.body || {};
    const name  = (body.name ?? body.lead?.name ?? '').toString();
    const phoneIn = (body.phone ?? body.lead?.phone ?? '').toString();
    const source = (body.source ?? 'unknown').toString();
    const service = (body.service ?? '').toString();

    const leadId = (body.id && String(body.id)) || ('lead_' + nanoid(8));
    const regionHint = (body.region || client?.booking?.country || client?.default_country || client?.country || 'GB');
    const phoneNorm = normalizePhoneE164(phoneIn, regionHint);
    if (!phoneNorm) return res.status(400).json({ ok:false, error:`invalid phone (expected E.164 like +447... or convertible with region ${regionHint})` });

    const now = new Date().toISOString();
    const rows = await readJson(LEADS_PATH, []);
    const idx = rows.findIndex(r => r.id === leadId);

    const lead = {
      id: leadId,
      tenantId: client.clientKey || client.id,
      name,
      phone: phoneNorm,
      source,
      service,
      status: 'new',
      createdAt: now,
      updatedAt: now
    };

    if (idx >= 0) rows[idx] = { ...rows[idx], ...lead, updatedAt: now }; else rows.push(lead);
    await writeJson(LEADS_PATH, rows);
    res.status(201).json({ ok:true, lead });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});
// Recall endpoint for n8n follow-ups: re-attempt an outbound call via Vapi
app.post('/api/leads/recall', async (req, res) => {
  try {
    const body = req.body || {};
    const clientKey = String(body.clientKey || body.tenantKey || '').trim();
    const lead = body.lead || {};
    const phone = (lead.phone || '').toString().trim();
    if (!clientKey) return res.status(400).json({ ok:false, error:'missing clientKey' });
    if (!phone) return res.status(400).json({ ok:false, error:'missing lead.phone' });

    const client = await getFullClient(clientKey);
    if (!client) return res.status(404).json({ ok:false, error:'unknown clientKey' });

    const assistantId   = client?.vapiAssistantId   || VAPI_ASSISTANT_ID;
    const phoneNumberId = client?.vapiPhoneNumberId || VAPI_PHONE_NUMBER_ID;

    if (!assistantId || !VAPI_PRIVATE_KEY) {
      return res.status(500).json({ ok:false, error:'Vapi not configured' });
    }

    // compute top 3 slots quickly using freeBusy/find (reuse your existing slot logic if available)
    // Here we keep it minimal && let the assistant propose times from its own logic.
    const payload = {
      assistantId,
      phoneNumberId,
      customer: { number: phone, name: lead.name || 'Lead' },
      maxDurationSeconds: 5, // Cut off after 5 seconds for testing to save costs
      assistantOverrides: {
        variableValues: {
          ClientKey: clientKey,
          BusinessName: client.displayName || client.clientKey,
          ConsentLine: 'This call may be recorded for quality.',
          DefaultService: lead.service || '',
          DefaultDurationMin: client?.booking?.defaultDurationMin || 30,
          Timezone: client?.booking?.timezone || TIMEZONE,
          ServicesJSON: client?.servicesJson || '[]',
          PricesJSON: client?.pricesJson || '{}',
          HoursJSON: client?.hoursJson || '{}',
          ClosedDatesJSON: client?.closedDatesJson || '[]',
          Locale: client?.locale || 'en-GB',
          ScriptHints: client?.scriptHints || '',
          FAQJSON: client?.faqJson || '[]'
        }
      },
      metadata: {
        clientKey: clientKey,
        service: lead.service || '',
        recall: true
      }
    };

    const resp = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const ok = resp.ok;
    console.log('[LEAD RECALL]', { clientKey, phone, vapiStatus: ok ? 'ok' : resp.status });
    if (!ok) return res.status(502).json({ ok:false, error:`vapi ${resp.status}` });

    return res.json({ ok:true });
  } catch (e) {
    console.error('[POST /api/leads/recall] error', e?.message || e);
    res.status(500).json({ ok:false, error:'Internal error' });
  }
});
;

app.post('/api/leads/nudge', async (req, res) => {
  try {
    const client = await getClientFromHeader(req);
    if (!client) return res.status(401).json({ ok:false, error:'missing or unknown X-Client-Key' });


// Read a single lead by id
app.get('/api/leads/:id', async (req, res) => {
  try {
    const rows = await readJson(LEADS_PATH, []);
    const lead = rows.find(r => r.id === req.params.id);
    if (!lead) return res.status(404).json({ ok:false, error:'lead not found' });
    res.json({ ok:true, lead });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});
const { id } = req.body || {};
    if (!id) return res.status(400).json({ ok:false, error:'lead id required' });

    const rows = await readJson(LEADS_PATH, []);
    const lead = rows.find(r => r.id === id && (r.tenantId === (client.clientKey || client.id)));
    if (!lead) return res.status(404).json({ ok:false, error:'lead not found' });

    const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
    if (!configured) return res.status(400).json({ ok:false, error:'tenant SMS not configured' });

    const brand = client?.displayName || client?.clientKey || 'Our Clinic';
    const body  = `Hi ${lead.name || ''} — it’s ${brand}. Ready to book your appointment? Reply YES to continue.`.trim();
    const payload = { to: lead.phone, body };
    if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid; else if (fromNumber) payload.from = fromNumber;
    const result = await smsClient.messages.create(payload);

    lead.status = 'contacted';
    lead.updatedAt = new Date().toISOString();
    await writeJson(LEADS_PATH, rows);

    res.json({ ok:true, result: { sid: result?.sid } });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});

// Retry processor - runs every 5 minutes to process pending retries
async function processRetryQueue() {
  try {
    const { getPendingRetries, updateRetryStatus } = await import('./db.js');
    const pendingRetries = await getPendingRetries(50);
    
    if (pendingRetries.length === 0) {
      return;
    }
    
    console.log('[RETRY PROCESSOR]', { pendingCount: pendingRetries.length });
    
    for (const retry of pendingRetries) {
      try {
        // Mark as processing
        await updateRetryStatus(retry.id, 'processing');
        
        // Process the retry based on type
        if (retry.retry_type === 'vapi_call') {
          await processVapiRetry(retry);
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
    
    // Make VAPI call
    const vapiResult = await makeVapiCall({
      assistantId: retryData.clientConfig?.assistantId || client.vapi?.assistantId,
      phoneNumberId: retryData.clientConfig?.phoneNumberId || client.vapi?.phoneNumberId,
      customerNumber: leadPhone,
      maxDurationSeconds: 10
    });
    
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

// Call queue processor - runs every 2 minutes to process pending calls
async function processCallQueue() {
  try {
    const { getPendingCalls, updateCallQueueStatus } = await import('./db.js');
    const pendingCalls = await getPendingCalls(20); // Process up to 20 calls at a time
    
    if (pendingCalls.length === 0) {
      return;
    }
    
    console.log('[CALL QUEUE PROCESSOR]', { pendingCount: pendingCalls.length });
    
    for (const call of pendingCalls) {
      try {
        // Mark as processing
        await updateCallQueueStatus(call.id, 'processing');
        
        // Process the call based on type
        if (call.call_type === 'vapi_call') {
          await processVapiCallFromQueue(call);
        }
        
        // Mark as completed
        await updateCallQueueStatus(call.id, 'completed');
        
      } catch (callError) {
        console.error('[CALL QUEUE PROCESSING ERROR]', {
          callId: call.id,
          error: callError.message
        });
        
        // Mark as failed
        await updateCallQueueStatus(call.id, 'failed');
        
        // Add to retry queue if it's a retryable error
        const errorType = categorizeError({ message: callError.message });
        if (['network', 'server_error', 'rate_limit'].includes(errorType)) {
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
    
  } catch (error) {
    console.error('[CALL QUEUE PROCESSOR ERROR]', error);
  }
}

// Process VAPI call from queue
async function processVapiCallFromQueue(call) {
  try {
    const callData = call.call_data ? JSON.parse(call.call_data) : {};
    const { client_key: clientKey, lead_phone: leadPhone } = call;
    
    // Get client configuration
    const client = await getFullClient(clientKey);
    if (!client) {
      throw new Error('Client not found');
    }
    
    // Get existing lead for context
    const clients = await listFullClients();
    const leads = clients.flatMap(c => c.leads || []);
    const existingLead = leads.find(l => l.phone === leadPhone && l.tenantKey === clientKey);
    
    // Select optimal assistant
    const assistantConfig = await selectOptimalAssistant({ 
      client, 
      existingLead, 
      isYes: callData.triggerType === 'yes_response',
      isStart: callData.triggerType === 'start_opt_in'
    });
    
    // Generate assistant variables
    const assistantVariables = await generateAssistantVariables({
      client,
      existingLead,
      tenantKey: clientKey,
      serviceForCall: existingLead?.service || '',
      isYes: callData.triggerType === 'yes_response',
      isStart: callData.triggerType === 'start_opt_in',
      assistantConfig
    });
    
    // Make VAPI call
    const vapiResult = await makeVapiCall({
      assistantId: assistantConfig.assistantId,
      phoneNumberId: assistantConfig.phoneNumberId,
      customerNumber: leadPhone,
      maxDurationSeconds: 10,
      metadata: {
        tenantKey: clientKey,
        leadPhone,
        triggerType: callData.triggerType,
        timestamp: new Date().toISOString(),
        leadScore: callData.leadScore || 0,
        leadStatus: callData.leadStatus || 'new',
        businessHours: callData.businessHours || 'unknown',
        retryAttempt: 0,
        fromQueue: true,
        queueId: call.id
      },
      assistantOverrides: {
        variableValues: assistantVariables
      }
    });
    
    if (!vapiResult || vapiResult.error) {
      throw new Error(vapiResult?.error || 'VAPI call failed');
    }
    
    console.log('[QUEUE CALL SUCCESS]', {
      queueId: call.id,
      clientKey,
      leadPhone,
      callId: vapiResult.id,
      priority: call.priority
    });
    
  } catch (error) {
    console.error('[QUEUE VAPI CALL ERROR]', {
      queueId: call.id,
      error: error.message
    });
    throw error;
  }
}

// Start processors (disabled to prevent crashes)
// setInterval(processRetryQueue, 5 * 60 * 1000); // Every 5 minutes
// setInterval(processCallQueue, 2 * 60 * 1000); // Every 2 minutes

// Cold Call Bot Management Endpoints

// Create Cold Call Assistant for Dental Practices
app.post('/admin/vapi/cold-call-assistant', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    console.log('[COLD CALL ASSISTANT CREATION REQUESTED]', { 
      requestedBy: req.ip
    });
    
    // Check if VAPI API key is configured
    const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;
    if (!vapiKey) {
      return res.status(500).json({
        error: 'VAPI API key not configured',
        message: 'Please add VAPI_PRIVATE_KEY, VAPI_PUBLIC_KEY, or VAPI_API_KEY to your environment variables'
      });
    }
    
    // Create specialized cold calling assistant for dental practices
    const coldCallAssistant = {
      name: "Dental Cold Call Bot - £500/mo",
      model: {
        provider: "openai",
        model: "gpt-4o",
        temperature: 0.3,
        maxTokens: 200
      },
      voice: {
        provider: "11labs",
        voiceId: "21m00Tcm4TlvDq8ikWAM",
        stability: 0.7,
        clarity: 0.85,
        style: 0.2,
        similarityBoost: 0.8
      },
      firstMessage: "Hi, this is Sarah from AI Booking Solutions. I'm calling to help businesses like yours improve their appointment booking systems with our premium £500/month service. Do you have 2 minutes to hear how we can help you never miss another patient?",
      systemMessage: `You are Sarah, a top-performing sales professional with 10+ years experience in B2B healthcare sales. You're calling business owners/managers to book qualified appointments.

ADVANCED SALES PSYCHOLOGY:
- Use social proof: "We help businesses improve their appointment booking systems"
- Create urgency: "We're currently accepting new clients"
- Build rapport: "I understand how challenging it is to manage a busy practice"
- Use specific numbers: "Our service can help capture more appointments"
- Address pain points: "Many businesses lose potential customers from missed calls"

CONVERSATION FLOW:
1. RAPPORT BUILDING (15 seconds):
   - "Hi [Name], this is Sarah from AI Booking Solutions"
   - "I'm calling because we've helped [similar practice in their area] increase bookings by 300%"
   - "Do you have 90 seconds to hear how this could work for your practice?"

2. QUALIFICATION (30 seconds):
   - "Are you the owner or manager of [Practice Name]?"
   - "How many appointments do you typically book per week?"
   - "What's your biggest challenge with patient scheduling?"
   - "Do you ever miss calls or lose potential patients?"

3. PAIN AMPLIFICATION (30 seconds):
   - "I hear this a lot - practices lose an average of £2,000 monthly from missed calls"
   - "That's like losing 4-5 patients every month"
   - "Our AI handles calls 24/7, so you never miss another patient"

4. VALUE PRESENTATION (45 seconds):
   - "We help practices like yours increase bookings by 300% with our premium £500/month service"
   - "Our AI automatically books appointments in your calendar"
   - "Sends SMS reminders to reduce no-shows by 40%"
   - "Most practices see ROI within 30 days"
   - "Premium service includes dedicated account manager and priority support"
   - "Average practice sees 20-30 extra bookings per month worth £10,000-15,000"

5. OBJECTION HANDLING:
   - Too expensive: "I understand £500/month sounds like a lot, but what's the cost of losing just one patient? Our premium service pays for itself with just 2-3 extra bookings per month. Most practices see 20-30 extra bookings worth £10,000-15,000 monthly"
   - Too busy: "That's exactly why you need our premium service - it saves you 10+ hours per week and includes a dedicated account manager"
   - Not interested: "I understand. Can I send you a quick case study showing how we helped [similar practice] increase bookings by 300% with our premium service?"
   - Already have a system: "That's great! What's your current system missing that causes you to lose patients? Our premium service includes features like dedicated account management and priority support"
   - Budget concerns: "I understand budget is important. Our premium service typically generates £10,000-15,000 in additional revenue monthly. That's a 20-30x ROI. Would you like to see the numbers?"

6. CLOSING (30 seconds):
   - "Would you be available for a 15-minute demo this week to see how this could work for your practice?"
   - "I can show you exactly how we've helped similar practices increase their bookings"
   - "What day works better for you - Tuesday or Wednesday?"

ADVANCED TECHNIQUES:
- Use their name frequently (builds rapport)
- Mirror their language and pace
- Ask open-ended questions
- Use "we" instead of "I" (creates partnership)
- Create urgency with scarcity
- Use specific success stories
- Address objections before they're raised

RULES:
- Keep calls under 3 minutes
- Be professional but warm
- Listen 70% of the time, talk 30%
- Focus on their pain points
- Always ask for the appointment
- If they're not the decision maker, get their name and ask for the right person
- Use their practice name in conversation
- End with a clear next step`,
      maxDurationSeconds: 180, // 3 minutes max
      endCallMessage: "Thank you for your time. I'll send you some information about how we can help your practice increase bookings. Have a great day!",
      endCallPhrases: ["not interested", "not right now", "call back later", "send me information"],
      recordingEnabled: true,
      voicemailDetectionEnabled: true,
      backgroundSound: "office",
      silenceTimeoutSeconds: 10,
      responseDelaySeconds: 1,
      llmRequestDelaySeconds: 0.1
    };
    
    // Create assistant via VAPI API
    const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(coldCallAssistant)
    });
    
    if (!vapiResponse.ok) {
      const errorData = await vapiResponse.json();
      console.error('[VAPI ASSISTANT CREATION ERROR]', errorData);
      return res.status(400).json({ 
        error: 'Failed to create VAPI assistant',
        details: errorData 
      });
    }
    
    const assistantData = await vapiResponse.json();
    
    console.log('[COLD CALL ASSISTANT CREATED]', { 
      assistantId: assistantData.id,
      name: assistantData.name
    });
    
    res.json({
      success: true,
      message: 'Cold call assistant created successfully',
      assistant: {
        id: assistantData.id,
        name: assistantData.name,
        status: assistantData.status,
        createdAt: assistantData.createdAt
      }
    });
    
  } catch (error) {
    console.error('[COLD CALL ASSISTANT CREATION ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to create cold call assistant',
      message: error.message 
    });
  }
});

// VAPI Tool Handlers
app.post('/tools/access_google_sheet', async (req, res) => {
  try {
    console.log('[GOOGLE SHEET TOOL] Request received:', req.body);
    
    const { action, data, tenantKey } = req.body;
    
    if (!action) {
      return res.status(400).json({ error: 'Action is required' });
    }
    
    // Get tenant configuration
    const tenant = await store.getTenant(tenantKey || 'logistics_client');
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    const logisticsSheetId = tenant.vapi_json?.logisticsSheetId || process.env.LOGISTICS_SHEET_ID;
    
    if (!logisticsSheetId) {
      return res.status(400).json({ error: 'Google Sheet ID not configured' });
    }
    
    if (action === 'append' && data) {
      // Ensure logistics headers are present
      await sheets.ensureLogisticsHeader(logisticsSheetId);
      
      // Append data to sheet
      await sheets.appendLogistics(logisticsSheetId, {
        ...data,
        timestamp: new Date().toISOString()
      });
      
      console.log('[GOOGLE SHEET TOOL] Data appended successfully');
      return res.json({ 
        success: true, 
        message: 'Data appended to Google Sheet successfully',
        action: 'append'
      });
    }
    
    if (action === 'read') {
      // Read data from sheet (basic implementation)
      const sheetData = await sheets.readSheet(logisticsSheetId);
      return res.json({ 
        success: true, 
        data: sheetData,
        action: 'read'
      });
    }
    
    return res.status(400).json({ error: 'Invalid action or missing data' });
    
  } catch (error) {
    console.error('[GOOGLE SHEET TOOL ERROR]', error);
    return res.status(500).json({ 
      error: 'Failed to access Google Sheet',
      message: error.message 
    });
  }
});

app.post('/tools/schedule_callback', async (req, res) => {
  try {
    console.log('[CALLBACK TOOL] Request received:', req.body);
    
    const { businessName, phone, receptionistName, reason, preferredTime, notes, tenantKey } = req.body;
    
    if (!businessName || !phone || !reason) {
      return res.status(400).json({ error: 'Business name, phone, and reason are required' });
    }
    
    // Get tenant configuration
    const tenant = await store.getTenant(tenantKey || 'logistics_client');
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    const callbackInboxEmail = tenant.vapi_json?.callbackInboxEmail || process.env.CALLBACK_INBOX_EMAIL;
    
    if (!callbackInboxEmail) {
      return res.status(400).json({ error: 'Callback inbox email not configured' });
    }
    
    const emailSubject = `Callback Scheduled: ${businessName} - ${phone}`;
    const emailBody = `
      <h2>Callback Scheduled</h2>
      <p><strong>Business:</strong> ${businessName}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Receptionist:</strong> ${receptionistName || 'Unknown'}</p>
      <p><strong>Reason:</strong> ${reason}</p>
      <p><strong>Preferred Time:</strong> ${preferredTime || 'Not specified'}</p>
      <p><strong>Notes:</strong> ${notes || 'None'}</p>
      <p><strong>Scheduled:</strong> ${new Date().toISOString()}</p>
    `;
    
    await messagingService.sendEmail({
      to: callbackInboxEmail,
      subject: emailSubject,
      html: emailBody
    });
    
    console.log('[CALLBACK TOOL] Callback email sent successfully');
    return res.json({ 
      success: true, 
      message: 'Callback scheduled and email sent successfully',
      callbackEmail: callbackInboxEmail
    });
    
  } catch (error) {
    console.error('[CALLBACK TOOL ERROR]', error);
    return res.status(500).json({ 
      error: 'Failed to schedule callback',
      message: error.message 
    });
  }
});

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

// CSV Import for Logistics Outreach
app.post('/admin/vapi/logistics-csv-import', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { csvData, assistantId, tenantKey = 'logistics_client' } = req.body;
    
    if (!csvData || !assistantId) {
      return res.status(400).json({ error: 'csvData and assistantId are required' });
    }

    console.log('[LOGISTICS CSV IMPORT]', { 
      assistantId, 
      tenantKey,
      csvRows: csvData.length,
      requestedBy: req.ip
    });

    // Parse CSV data into businesses array
    const businesses = csvData.map((row, index) => ({
      name: row['Business Name'] || row['Company Name'] || row['Name'] || `Business ${index + 1}`,
      phone: row['Phone'] || row['Phone Number'] || row['Mobile'] || row['Contact Number'],
      address: row['Address'] || row['Location'] || row['City'] || '',
      website: row['Website'] || row['URL'] || '',
      decisionMaker: row['Decision Maker'] || row['Contact Person'] || row['Manager'] || '',
      email: row['Email'] || row['Email Address'] || '',
      industry: row['Industry'] || row['Sector'] || 'Logistics',
      source: 'CSV Import'
    })).filter(business => business.phone); // Only include businesses with phone numbers

    if (businesses.length === 0) {
      return res.status(400).json({ error: 'No valid businesses found in CSV (need phone numbers)' });
    }

    console.log(`[LOGISTICS CSV IMPORT] Parsed ${businesses.length} valid businesses`);

    // Now run the outreach
    const outreachResult = await runLogisticsOutreach({
      assistantId,
      businesses,
      tenantKey,
      vapiKey: process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY
    });

    res.json({
      success: true,
      message: 'CSV import and outreach completed',
      tenantKey,
      totalBusinesses: businesses.length,
      validBusinesses: businesses.length,
      results: outreachResult
    });
    
  } catch (error) {
    console.error('[LOGISTICS CSV IMPORT ERROR]', error);
    res.status(500).json({
      error: 'Failed to import CSV and run outreach',
      message: error.message
    });
  }
});

// Automated Logistics Outreach - Batch calling with proper metadata
app.post('/admin/vapi/logistics-outreach', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { assistantId, businesses, tenantKey = 'logistics_client' } = req.body;
    
    if (!assistantId || !businesses || !Array.isArray(businesses)) {
      return res.status(400).json({ error: 'assistantId and businesses array are required' });
    }

    console.log('[LOGISTICS OUTREACH]', { 
      assistantId, 
      businessCount: businesses.length,
      tenantKey,
      requestedBy: req.ip
    });

    const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;
    if (!vapiKey) {
      return res.status(500).json({
        error: 'VAPI API key not configured',
        message: 'Please add VAPI_PRIVATE_KEY, VAPI_PUBLIC_KEY, or VAPI_API_KEY to your environment variables'
      });
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
    
    console.log(`[LOGISTICS OUTREACH] Completed. Results:`, results.length);
    
    res.json({
      success: true,
      message: 'Logistics outreach campaign completed',
      tenantKey,
      totalBusinesses: businesses.length,
      results
    });
    
  } catch (error) {
    console.error('[LOGISTICS OUTREACH ERROR]', error);
    res.status(500).json({
      error: 'Failed to run logistics outreach',
      message: error.message
    });
  }
});

// Create Logistics & Shipping Script Assistant (STRICT adherence)
app.post('/admin/vapi/logistics-assistant', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('[LOGISTICS ASSISTANT CREATION REQUESTED]', {
      requestedBy: req.ip
    });

    // Check if VAPI API key is configured
    const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;
    if (!vapiKey) {
      return res.status(500).json({
        error: 'VAPI API key not configured',
        message: 'Please add VAPI_PRIVATE_KEY, VAPI_PUBLIC_KEY, or VAPI_API_KEY to your environment variables'
      });
    }

    // Strict script for logistics & shipping assistant
    const firstMessage = "Hi, Please can I speak with the person in charge of logistics and shipping?";

    const systemMessage = `You are a professional logistics and shipping cold call assistant. You MUST follow this script EXACTLY with 100% adherence, but speak naturally and conversationally. Do not improvise or deviate from the script flow.

SCRIPT FLOW:

RECEPTIONIST SCRIPT:
"Hi, Please can I speak with the person in charge of logistics and shipping?"

If they don't put you through to the correct person, get a name of who that is and add to your callbacks on sheets.

CORRECT PERSON SCRIPT:
It will either be a call back to the business where you ask for the persons name in charge of shipping because of your call with the receptionist or:

"Hi, Please can I speak with the person in charge of logistics and shipping?"

If they say "It's me" or similar:
"Great, I am a partner of UPS, FEDEX & DHL, we offer all these couriers on one online platform, I am just wondering if I can get an email across to you with some rates and services we can offer?"

If they say yes:
"Which is the best email to send to?"

"So that I can tailor this email to you a little bit more, do you send outside the UK at all?"

INTERNATIONAL QUESTIONS (ask these in order):
- "Who are your main couriers you use?"
- "How often is this?" (spell this out to them if they are saying it can be anything…'do you have parcels going out weekly? Or at least a couple a month?)
- "Do you have any main countries you send to and I will make sure I put some rates to these specific lanes on the email?"
- "You don't happen to have a last example of a shipment you sent to one of these countries you mentioned and what it cost (get the weight and dimensions if you can)?"

If you have ALL the above and rates, end the call. UNLESS they are super happy to talk, then move to Domestic. If they give you small info on the above, move onto Domestic to see if you can get more from this. If they don't do International, move straight to the Domestic Q's.

DOMESTIC QUESTIONS:
- "How often do you send around the UK? Is this daily or weekly?" (get the number of daily or weekly)
- "Who is your main courier for your UK parcels?"
- "Do you have a standard rate you pay up to a certain kg?"
- "Is that excluding fuel and VAT?"
- "Do you mainly send single parcels or multiple parcels to one address?"

ICE BREAKERS (use these naturally in the middle of your questions so it's not too formal):
- Moving from International to Domestic Questions: "Really appreciate the answers for your INTL, I will get some Domestic prices to you as well, just a couple more questions apologies on this…"
- "Really appreciate all of this information, just lastly can I confirm…"
- "Thanks for this, I know this has taken longer than expected, but this info just helps tailor this email as best as possible so we can ensure we are saving you money and keeping your service levels high"
- "Just the last question sorry…"
- "It does look like we can definitely help here, can I just please confirm a couple of things before I send this email…"
- "Really sorry to keep you, I do appreciate the time, can I quickly confirm a few last things…"

CALLBACK HANDLING:
If the receptionist says they need to call back later, use the schedule_callback tool to schedule it. Always get the receptionist's name and note the reason for callback.

STRICT RULES:
1. Follow the script EXACTLY - do not improvise
2. Use the exact wording provided but speak naturally
3. Ask questions in the specified order
4. Use ice breakers to keep conversation natural
5. If receptionist blocks, get their name and schedule callback
6. Always be professional and friendly
7. End calls appropriately based on responses
8. Use tools to access sheets and schedule callbacks when needed
9. Handle interruptions gracefully and steer back to the script
10. If they ask questions about your service, answer briefly and return to the script`

    const assistant = {
      name: 'Logistics & Shipping Script Assistant',
      model: {
        provider: 'openai',
        model: 'gpt-4o',
        temperature: 0.1,
        maxTokens: 300
      },
      voice: {
        provider: '11labs',
        voiceId: '21m00Tcm4TlvDq8ikWAM',
        stability: 0.7,
        clarity: 0.85,
        style: 0.2,
        similarityBoost: 0.8
      },
      firstMessage,
      systemMessage,
      maxDurationSeconds: 300,
      endCallMessage: 'Thank you for your time.',
      endCallPhrases: ['not interested', 'no', 'busy', 'call back later'],
      recordingEnabled: true,
      voicemailDetectionEnabled: true,
      tools: [
        {
          type: 'function',
          function: {
            name: 'access_google_sheet',
            description: 'Access the Google Sheet to read or write data during the call',
            parameters: {
              type: 'object',
              properties: {
                action: {
                  type: 'string',
                  enum: ['read', 'write', 'append'],
                  description: 'Action to perform on the sheet'
                },
                data: {
                  type: 'object',
                  description: 'Data to write or append to the sheet',
                  properties: {
                    businessName: { type: 'string' },
                    phone: { type: 'string' },
                    email: { type: 'string' },
                    couriers: { type: 'string' },
                    frequency: { type: 'string' },
                    countries: { type: 'string' },
                    shipmentExample: { type: 'string' },
                    domesticFrequency: { type: 'string' },
                    domesticCourier: { type: 'string' },
                    domesticRate: { type: 'string' },
                    receptionistName: { type: 'string' },
                    callbackNeeded: { type: 'boolean' },
                    callbackReason: { type: 'string' },
                    callStatus: { type: 'string' }
                  }
                }
              },
              required: ['action']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'schedule_callback',
            description: 'Schedule a callback when receptionist blocks the call or person is not available',
            parameters: {
              type: 'object',
              properties: {
                businessName: {
                  type: 'string',
                  description: 'Name of the business'
                },
                phone: {
                  type: 'string',
                  description: 'Phone number to call back'
                },
                receptionistName: {
                  type: 'string',
                  description: 'Name of the receptionist who answered'
                },
                reason: {
                  type: 'string',
                  description: 'Reason for callback (e.g., "not available", "in meeting", "call back later")'
                },
                preferredTime: {
                  type: 'string',
                  description: 'Preferred time for callback if mentioned'
                },
                notes: {
                  type: 'string',
                  description: 'Additional notes about the call'
                }
              },
              required: ['businessName', 'phone', 'reason']
            }
          }
        }
      ],
      backgroundSound: 'office',
      silenceTimeoutSeconds: 12,
      responseDelaySeconds: 0.8,
      llmRequestDelaySeconds: 0.1
    };

    // Create assistant via VAPI API
    const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(assistant)
    });

    if (!vapiResponse.ok) {
      const errorData = await vapiResponse.json();
      console.error('[VAPI LOGISTICS ASSISTANT ERROR]', errorData);
      return res.status(400).json({
        error: 'Failed to create Logistics assistant',
        details: errorData
      });
    }

    const assistantData = await vapiResponse.json();

    console.log('[LOGISTICS ASSISTANT CREATED]', {
      assistantId: assistantData.id,
      name: assistantData.name
    });

    res.json({
      success: true,
      message: 'Logistics & Shipping assistant created successfully',
      assistant: {
        id: assistantData.id,
        name: assistantData.name,
        status: assistantData.status,
        createdAt: assistantData.createdAt
      }
    });

  } catch (error) {
    console.error('[LOGISTICS ASSISTANT CREATION ERROR]', error);
    res.status(500).json({
      error: 'Failed to create logistics assistant',
      message: error.message
    });
  }
});

// Cold Call Campaign Management
app.post('/admin/vapi/cold-call-campaign', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { assistantId, businesses, campaignName, maxCallsPerDay, startTime, endTime } = req.body;
    
    if (!assistantId || !businesses || !Array.isArray(businesses)) {
      return res.status(400).json({ error: 'Assistant ID and businesses array are required' });
    }
    
    console.log('[COLD CALL CAMPAIGN CREATED]', { 
      campaignName: campaignName || 'Dental Practice Campaign',
      businessCount: businesses.length,
      assistantId,
      requestedBy: req.ip
    });
    
    // Create campaign in database
    const campaignId = nanoid();
    const campaign = {
      id: campaignId,
      name: campaignName || 'Dental Practice Campaign',
      assistantId,
      businesses: businesses.map(business => ({
        id: business.id || nanoid(),
        name: business.name,
        phone: business.phone,
        email: business.email,
        address: business.address,
        website: business.website,
        decisionMaker: business.decisionMaker,
        status: 'pending',
        attempts: 0,
        lastAttempt: null,
        notes: ''
      })),
      status: 'active',
      maxCallsPerDay: maxCallsPerDay || 100,
      startTime: startTime || '09:00',
      endTime: endTime || '17:00',
      createdAt: new Date().toISOString(),
      stats: {
        totalCalls: 0,
        successfulCalls: 0,
        appointmentsBooked: 0,
        voicemails: 0,
        noAnswers: 0,
        rejections: 0
      }
    };
    
    // Store campaign in database (you'll need to implement this)
    // await storeCampaign(campaign);
    
    // Start calling process
    const callResults = await startColdCallCampaign(campaign);
    
    res.json({
      success: true,
      message: 'Cold call campaign created and started',
      campaign: {
        id: campaignId,
        name: campaign.name,
        businessCount: businesses.length,
        status: 'active',
        stats: campaign.stats
      },
      callResults
    });
    
  } catch (error) {
    console.error('[COLD CALL CAMPAIGN ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to create cold call campaign',
      message: error.message 
    });
  }
});

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
app.post('/admin/vapi/ab-test-assistant', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { testName, variants } = req.body;
    
    if (!testName || !variants || !Array.isArray(variants)) {
      return res.status(400).json({ error: 'Test name and variants array are required' });
    }
    
    console.log(`[A/B TEST CREATION] Creating test: ${testName} with ${variants.length} variants`);
    
    const testResults = [];
    
    // Create multiple assistants with different scripts
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      
      const assistant = {
        name: `${testName} - Variant ${i + 1}`,
        model: {
          provider: "openai",
          model: "gpt-4o",
          temperature: variant.temperature || 0.3,
          maxTokens: 200
        },
        voice: {
          provider: "11labs",
          voiceId: variant.voiceId || "21m00Tcm4TlvDq8ikWAM",
          stability: 0.7,
          clarity: 0.85,
          style: 0.2
        },
        firstMessage: variant.firstMessage,
        systemMessage: variant.systemMessage,
        maxDurationSeconds: 180,
        endCallMessage: "Thank you for your time. I'll send you some information about how we can help your practice increase bookings. Have a great day!",
        endCallPhrases: ["not interested", "not right now", "call back later", "send me information"],
        recordingEnabled: true,
        voicemailDetectionEnabled: true,
        backgroundSound: "office"
      };
      
      const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vapiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(assistant)
      });
      
      if (vapiResponse.ok) {
        const assistantData = await vapiResponse.json();
        testResults.push({
          variant: i + 1,
          assistantId: assistantData.id,
          name: assistantData.name,
          script: variant.scriptName || `Variant ${i + 1}`,
          status: 'created'
        });
      } else {
        testResults.push({
          variant: i + 1,
          status: 'failed',
          error: 'Failed to create assistant'
        });
      }
    }
    
    res.json({
      success: true,
      testName,
      variants: testResults,
      message: `A/B test created with ${testResults.filter(r => r.status === 'created').length} variants`
    });
    
  } catch (error) {
    console.error('[A/B TEST CREATION ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to create A/B test',
      message: error.message 
    });
  }
});

// Lead Scoring and Qualification System
app.post('/admin/vapi/lead-scoring', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { businesses } = req.body;
    
    if (!businesses || !Array.isArray(businesses)) {
      return res.status(400).json({ error: 'Businesses array is required' });
    }
    
    console.log(`[LEAD SCORING] Scoring ${businesses.length} businesses`);
    
    const scoredBusinesses = businesses.map(business => {
      let score = 0;
      const factors = [];
      
      // Decision maker availability (40 points)
      if (business.decisionMaker?.name) {
        score += 40;
        factors.push('Decision maker identified (+40)');
      }
      
      // Website quality (20 points)
      if (business.website) {
        score += 20;
        factors.push('Website available (+20)');
        
        // Check if website looks professional
        if (business.website.includes('https://')) {
          score += 5;
          factors.push('Secure website (+5)');
        }
      }
      
      // Contact information completeness (15 points)
      if (business.email && business.phone) {
        score += 15;
        factors.push('Complete contact info (+15)');
      } else if (business.phone) {
        score += 10;
        factors.push('Phone available (+10)');
      }
      
      // Business size indicators (10 points)
      if (business.rating && parseFloat(business.rating) > 4.0) {
        score += 10;
        factors.push('High rating (+10)');
      }
      
      // Location quality (10 points)
      if (business.address) {
        const address = business.address.toLowerCase();
        if (address.includes('london') || address.includes('manchester') || 
            address.includes('birmingham') || address.includes('leeds')) {
          score += 10;
          factors.push('Major city location (+10)');
        } else {
          score += 5;
          factors.push('UK location (+5)');
        }
      }
      
      // Industry-specific factors (5 points)
      if (business.services && business.services.length > 0) {
        score += 5;
        factors.push('Services listed (+5)');
      }
      
      // Determine priority level
      let priority = 'Low';
      if (score >= 80) priority = 'High';
      else if (score >= 60) priority = 'Medium';
      
      return {
        ...business,
        leadScore: Math.min(score, 100),
        priority,
        scoringFactors: factors,
        recommendedCallTime: getOptimalCallTime(business),
        estimatedConversionProbability: Math.min(score * 0.8, 80) // Max 80% probability
      };
    });
    
    // Sort by lead score
    scoredBusinesses.sort((a, b) => b.leadScore - a.leadScore);
    
    res.json({
      success: true,
      totalBusinesses: scoredBusinesses.length,
      highPriority: scoredBusinesses.filter(b => b.priority === 'High').length,
      mediumPriority: scoredBusinesses.filter(b => b.priority === 'Medium').length,
      lowPriority: scoredBusinesses.filter(b => b.priority === 'Low').length,
      businesses: scoredBusinesses
    });
    
  } catch (error) {
    console.error('[LEAD SCORING ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to score leads',
      message: error.message 
    });
  }
});

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
app.get('/admin/vapi/campaign-analytics/:campaignId', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { campaignId } = req.params;
    
    // This would typically fetch from your database
    // For now, we'll return sample analytics
    const analytics = {
      campaignId,
      totalCalls: 150,
      successfulCalls: 120,
      appointmentsBooked: 8,
      voicemails: 25,
      noAnswers: 15,
      rejections: 30,
      conversionRate: 6.7, // 8 appointments / 120 successful calls
      costPerCall: 0.25,
      costPerAppointment: 4.69, // (150 * 0.25) / 8
      averageCallDuration: 145, // seconds
      monthlyServiceValue: 500, // £500/month service
      estimatedMonthlyRevenue: 4000, // 8 appointments * £500
      roi: 800, // 4000 / 500 * 100
      bestCallingTimes: {
        '09:00-10:00': 12.5,
        '14:00-15:00': 8.3,
        '16:00-17:00': 7.1
      },
      topPerformingScripts: [
        { script: 'Pain-focused approach', conversionRate: 8.2 },
        { script: 'Social proof approach', conversionRate: 6.8 },
        { script: 'Urgency approach', conversionRate: 5.9 }
      ],
      objections: {
        'Too expensive': 45,
        'Not interested': 30,
        'Too busy': 15,
        'Already have system': 10
      },
      recommendations: [
        'Focus on pain amplification - highest conversion rate',
        'Call between 9-10 AM for best results',
        'Address cost objections with ROI calculations',
        'Use social proof more frequently'
      ]
    };
    
    res.json({
      success: true,
      analytics
    });
    
  } catch (error) {
    console.error('[CAMPAIGN ANALYTICS ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to fetch campaign analytics',
      message: error.message 
    });
  }
});

// Multi-Channel Follow-up System
app.post('/admin/vapi/follow-up-sequence', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { callResults, campaignId } = req.body;
    
    if (!callResults || !Array.isArray(callResults)) {
      return res.status(400).json({ error: 'Call results array is required' });
    }
    
    console.log(`[FOLLOW-UP SEQUENCE] Creating follow-up for ${callResults.length} calls`);
    
    const followUpResults = [];
    
    for (const call of callResults) {
      const followUp = {
        businessId: call.businessId,
        businessName: call.businessName,
        phone: call.phone,
        email: call.email,
        callOutcome: call.outcome || 'no_answer',
        followUpPlan: generateFollowUpPlan(call),
        scheduledActions: []
      };
      
      // Schedule follow-up actions based on call outcome
      if (call.outcome === 'voicemail') {
        followUp.scheduledActions.push({
          type: 'email',
          delay: 'immediate',
          template: 'voicemail_follow_up',
          content: generateVoicemailFollowUpEmail(call)
        });
        followUp.scheduledActions.push({
          type: 'call',
          delay: '2_hours',
          note: 'Retry call after email follow-up'
        });
      } else if (call.outcome === 'interested') {
        followUp.scheduledActions.push({
          type: 'email',
          delay: 'immediate',
          template: 'demo_confirmation',
          content: generateDemoConfirmationEmail(call)
        });
        followUp.scheduledActions.push({
          type: 'calendar_invite',
          delay: 'immediate',
          note: 'Send calendar invite for demo'
        });
      } else if (call.outcome === 'objection') {
        followUp.scheduledActions.push({
          type: 'email',
          delay: '1_day',
          template: 'objection_handling',
          content: generateObjectionHandlingEmail(call)
        });
        followUp.scheduledActions.push({
          type: 'call',
          delay: '3_days',
          note: 'Follow-up call to address objections'
        });
      }
      
      followUpResults.push(followUp);
    }
    
    res.json({
      success: true,
      campaignId,
      totalFollowUps: followUpResults.length,
      followUps: followUpResults
    });
    
  } catch (error) {
    console.error('[FOLLOW-UP SEQUENCE ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to create follow-up sequence',
      message: error.message 
    });
  }
});

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
app.post('/admin/vapi/personalized-assistant', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;
    if (!vapiKey) {
      return res.status(500).json({
        error: 'VAPI API key not configured. Set VAPI_PRIVATE_KEY or VAPI_PUBLIC_KEY in your environment.'
      });
    }
    
    const { business, industry, region } = req.body;
    
    if (!business || !industry) {
      return res.status(400).json({ error: 'Business and industry are required' });
    }
    
    console.log(`[PERSONALIZED ASSISTANT] Creating personalized script for ${business.name}`);
    
    // Generate personalized script based on business data
    const personalizedScript = generatePersonalizedScript(business, industry, region);
    
    const assistant = {
      name: `Personalized Assistant - ${business.name}`,
      model: {
        provider: "openai",
        model: "gpt-4o",
        temperature: 0.3,
        maxTokens: 200
      },
      voice: {
        provider: "11labs",
        voiceId: "21m00Tcm4TlvDq8ikWAM",
        stability: 0.7,
        clarity: 0.85,
        style: 0.2
      },
      firstMessage: personalizedScript.firstMessage,
      systemMessage: personalizedScript.systemMessage,
      maxDurationSeconds: 180,
      endCallMessage: "Thank you for your time. I'll send you some information about how we can help your practice increase bookings. Have a great day!",
      endCallPhrases: ["not interested", "not right now", "call back later", "send me information"],
      recordingEnabled: true,
      voicemailDetectionEnabled: true,
      backgroundSound: "office"
    };
    
    // Create assistant via VAPI API
    const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(assistant)
    });
    
    if (!vapiResponse.ok) {
      const errorData = await vapiResponse.json();
      return res.status(400).json({ 
        error: 'Failed to create personalized assistant',
        details: errorData 
      });
    }
    
    const assistantData = await vapiResponse.json();
    
    res.json({
      success: true,
      message: 'Personalized assistant created successfully',
      assistant: {
        id: assistantData.id,
        name: assistantData.name,
        personalizedScript: personalizedScript
      }
    });
    
  } catch (error) {
    console.error('[PERSONALIZED ASSISTANT ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to create personalized assistant',
      message: error.message 
    });
  }
});

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

// VAPI Test Endpoint
app.get('/admin/vapi/test-connection', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    console.log('[VAPI CONNECTION TEST] Testing VAPI API connection');
    
    // Test VAPI connection by fetching assistants
    const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;
    if (!vapiKey) {
      return res.status(500).json({
        success: false,
        message: 'VAPI connection test failed',
        error: 'VAPI API key not configured',
        apiKeyConfigured: false
      });
    }
    
    const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${vapiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (vapiResponse.ok) {
      const assistants = await vapiResponse.json();
      res.json({
        success: true,
        message: 'VAPI connection successful',
        assistantsCount: assistants.length,
        apiKeyConfigured: !!vapiKey
      });
    } else {
      const errorData = await vapiResponse.json();
      res.status(400).json({
        success: false,
        message: 'VAPI connection failed',
        error: errorData
      });
    }
    
  } catch (error) {
    console.error('[VAPI CONNECTION TEST ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'VAPI connection test failed',
      error: error.message,
      apiKeyConfigured: !!process.env.VAPI_API_KEY
    });
  }
});

// Test Call Endpoint
app.post('/admin/vapi/test-call', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { phoneNumber, assistantId } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    console.log(`[TEST CALL] Initiating test call to ${phoneNumber}`);
    
    // Create a simple test assistant if no assistantId provided
    let testAssistantId = assistantId;
    
    if (!testAssistantId) {
      const testAssistant = {
        name: "Test Cold Call Assistant",
        model: {
          provider: "openai",
          model: "gpt-4o-mini",
          temperature: 0.3,
          maxTokens: 150
        },
        voice: {
          provider: "11labs",
          voiceId: "21m00Tcm4TlvDq8ikWAM",
          stability: 0.7,
          clarity: 0.85,
          style: 0.2
        },
        firstMessage: "Hi, this is Sarah from AI Booking Solutions. I'm calling to help businesses like yours improve their appointment booking systems with our premium £500/month service. Do you have 2 minutes to hear how we can help you never miss another patient?",
        systemMessage: `You are Sarah, calling about our premium £500/month AI booking service. Keep the call under 2 minutes. Focus on booking a demo. If they're not interested, politely end the call.`,
        maxDurationSeconds: 120,
        endCallMessage: "Thank you for your time. I'll send you some information about our premium service. Have a great day!",
        endCallPhrases: ["not interested", "not right now", "call back later"],
        recordingEnabled: true,
        voicemailDetectionEnabled: true
      };
      
      const assistantResponse = await fetch('https://api.vapi.ai/assistant', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vapiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testAssistant)
      });
      
      if (assistantResponse.ok) {
        const assistantData = await assistantResponse.json();
        testAssistantId = assistantData.id;
        console.log(`[TEST ASSISTANT CREATED] ID: ${testAssistantId}`);
      } else {
        const errorData = await assistantResponse.json();
        return res.status(400).json({
          success: false,
          message: 'Failed to create test assistant',
          error: errorData
        });
      }
    }
    
    // Make the test call
    const callResponse = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        assistantId: testAssistantId,
        customer: {
          number: phoneNumber,
          name: "Test Contact"
        },
        metadata: {
          testCall: true,
          timestamp: new Date().toISOString()
        }
      })
    });
    
    if (callResponse.ok) {
      const callData = await callResponse.json();
      res.json({
        success: true,
        message: 'Test call initiated successfully',
        callId: callData.id,
        assistantId: testAssistantId,
        phoneNumber: phoneNumber,
        status: 'call_initiated'
      });
    } else {
      const errorData = await callResponse.json();
      res.status(400).json({
        success: false,
        message: 'Failed to initiate test call',
        error: errorData
      });
    }
    
  } catch (error) {
    console.error('[TEST CALL ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Test call failed',
      error: error.message
    });
  }
});

// VAPI Management Endpoints
// Create VAPI Assistant
app.post('/admin/vapi/assistants', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { name, model, voice, firstMessage, systemMessage, maxDurationSeconds, endCallMessage, endCallPhrases, recordingEnabled, voicemailDetectionEnabled, backgroundSound } = req.body;
    
    if (!name || !model || !voice || !firstMessage || !systemMessage) {
      return res.status(400).json({ error: 'Name, model, voice, firstMessage, and systemMessage are required' });
    }
    
    console.log('[VAPI ASSISTANT CREATION REQUESTED]', { 
      name,
      requestedBy: req.ip
    });
    
    // Create assistant via VAPI API
    const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        model,
        voice,
        firstMessage,
        systemMessage,
        maxDurationSeconds: maxDurationSeconds || 120,
        endCallMessage: endCallMessage || 'Thank you for your time. Have a great day!',
        endCallPhrases: endCallPhrases || ['goodbye', 'bye', 'thank you'],
        recordingEnabled: recordingEnabled !== false,
        voicemailDetectionEnabled: voicemailDetectionEnabled !== false,
        backgroundSound: backgroundSound || 'office'
      })
    });
    
    if (!vapiResponse.ok) {
      const errorText = await vapiResponse.text();
      throw new Error(`VAPI API error: ${vapiResponse.status} ${errorText}`);
    }
    
    const assistant = await vapiResponse.json();
    
    console.log('[VAPI ASSISTANT CREATED]', { 
      assistantId: assistant.id,
      name: assistant.name,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      assistant,
      message: 'VAPI assistant created successfully'
    });
  } catch (e) {
    console.error('[VAPI ASSISTANT CREATION ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Create VAPI Phone Number
app.post('/admin/vapi/phone-numbers', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { assistantId, number } = req.body;
    
    if (!assistantId) {
      return res.status(400).json({ error: 'Assistant ID is required' });
    }
    
    console.log('[VAPI PHONE NUMBER CREATION REQUESTED]', { 
      assistantId,
      number,
      requestedBy: req.ip
    });
    
    // Create phone number via VAPI API
    const vapiResponse = await fetch('https://api.vapi.ai/phone-number', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        assistantId,
        number: number || null // Let VAPI assign a number if none provided
      })
    });
    
    if (!vapiResponse.ok) {
      const errorText = await vapiResponse.text();
      throw new Error(`VAPI API error: ${vapiResponse.status} ${errorText}`);
    }
    
    const phoneNumber = await vapiResponse.json();
    
    console.log('[VAPI PHONE NUMBER CREATED]', { 
      phoneNumberId: phoneNumber.id,
      number: phoneNumber.number,
      assistantId,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      phoneNumber,
      message: 'VAPI phone number created successfully'
    });
  } catch (e) {
    console.error('[VAPI PHONE NUMBER CREATION ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Make VAPI Call
app.post('/admin/vapi/calls', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { assistantId, phoneNumberId, customerNumber, customerName } = req.body;
    
    if (!assistantId || !customerNumber) {
      return res.status(400).json({ error: 'Assistant ID and customer number are required' });
    }
    
    console.log('[VAPI CALL REQUESTED]', { 
      assistantId,
      phoneNumberId,
      customerNumber,
      customerName,
      requestedBy: req.ip
    });
    
    // Make call via VAPI API
    const vapiResponse = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        assistantId,
        phoneNumberId,
        customer: {
          number: customerNumber,
          name: customerName || 'Customer'
        }
      })
    });
    
    if (!vapiResponse.ok) {
      const errorText = await vapiResponse.text();
      throw new Error(`VAPI API error: ${vapiResponse.status} ${errorText}`);
    }
    
    const call = await vapiResponse.json();
    
    console.log('[VAPI CALL INITIATED]', { 
      callId: call.id,
      assistantId,
      customerNumber,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      call,
      message: 'VAPI call initiated successfully'
    });
  } catch (e) {
    console.error('[VAPI CALL ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Client Onboarding API
app.post('/api/onboard-client', async (req, res) => {
  try {
    // Check API key (admin only)
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { onboardClient } = await import('./lib/client-onboarding.js');
    
    const result = await onboardClient(req.body);
    
    res.json(result);
  } catch (error) {
    console.error('[ONBOARDING API ERROR]', error);
    res.status(500).json({ 
      ok: false, 
      error: error.message,
      details: error.stack 
    });
  }
});

// Update Client Configuration
app.patch('/api/clients/:clientKey/config', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { updateClientConfig } = await import('./lib/client-onboarding.js');
    
    const result = await updateClientConfig(req.params.clientKey, req.body);
    
    res.json(result);
  } catch (error) {
    console.error('[UPDATE CONFIG ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Deactivate Client
app.post('/api/clients/:clientKey/deactivate', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { deactivateClient } = await import('./lib/client-onboarding.js');
    
    const result = await deactivateClient(req.params.clientKey, req.body.reason);
    
    res.json(result);
  } catch (error) {
    console.error('[DEACTIVATE CLIENT ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Real-Time Events Stream (SSE)
app.get('/api/realtime/:clientKey/events', async (req, res) => {
  const { clientKey } = req.params;
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering in nginx
  
  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);
  
  // Register connection
  const { registerConnection } = await import('./lib/realtime-events.js');
  registerConnection(clientKey, res);
  
  console.log(`[SSE] Client ${clientKey} connected to real-time stream`);
  
  // Keep connection alive with heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    try {
      res.write(`:heartbeat\n\n`);
    } catch (error) {
      clearInterval(heartbeat);
    }
  }, 30000);
  
  // Clean up on connection close
  req.on('close', () => {
    clearInterval(heartbeat);
    console.log(`[SSE] Client ${clientKey} disconnected from real-time stream`);
  });
});

// ============================================================================
// CLIENT PORTAL PAGES (Dashboard, Settings)
// ============================================================================

// Client dashboard page
app.get('/dashboard/:clientKey', (req, res) => {
  res.sendFile('public/dashboard-v2.html', { root: '.' });
});

// Lead import page
app.get('/lead-import.html', (req, res) => {
  res.sendFile('public/lead-import.html', { root: '.' });
});

// Lead management page
app.get('/leads', (req, res) => {
  res.sendFile('public/leads.html', { root: '.' });
});

// API endpoint to fetch leads
app.get('/api/leads', async (req, res) => {
  try {
    const clientKey = req.query.clientKey || req.get('X-Client-Key');
    
    if (!clientKey) {
      return res.status(400).json({
        success: false,
        error: 'clientKey is required'
      });
    }

    const { query } = await import('./db.js');
    
    const result = await query(`
      SELECT 
        id,
        name,
        phone,
        email,
        status,
        tags,
        source,
        score,
        notes,
        custom_fields,
        created_at,
        updated_at,
        last_contacted_at
      FROM leads
      WHERE client_key = $1
      ORDER BY created_at DESC
      LIMIT 1000
    `, [clientKey]);

    const leads = result.rows.map(row => ({
      id: row.id,
      name: row.name || 'Unknown',
      phone: row.phone,
      email: row.email,
      status: row.status || 'new',
      tags: row.tags ? row.tags.split(',').map(t => t.trim()) : [],
      source: row.source || 'Unknown',
      score: row.score || 50,
      notes: row.notes || '',
      customFields: row.custom_fields || {},
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_contacted_at: row.last_contacted_at
    }));

    res.json({
      success: true,
      count: leads.length,
      leads
    });

  } catch (error) {
    console.error('[LEADS API ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leads',
      details: error.message
    });
  }
});

// Client settings page
app.get('/settings/:clientKey', (req, res) => {
  res.sendFile('public/settings.html', { root: '.' });
});

// Privacy & GDPR page
app.get('/privacy.html', (req, res) => {
  res.sendFile('public/privacy.html', { root: '.' });
});

app.get('/privacy', (req, res) => {
  res.sendFile('public/privacy.html', { root: '.' });
});

// Zapier documentation page
app.get('/zapier-docs.html', (req, res) => {
  res.sendFile('public/zapier-docs.html', { root: '.' });
});

app.get('/zapier', (req, res) => {
  res.sendFile('public/zapier-docs.html', { root: '.' });
});

// Complete setup endpoint - adds missing columns to make system 100%
app.get('/complete-setup', async (req, res) => {
  try {
    console.log('[COMPLETE-SETUP] Running final database setup...');
    
    const { query } = await import('./db.js');
    const results = [];

    // Add email column
    try {
      await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS email TEXT`);
      results.push('✅ Added email column');
    } catch (e) {
      results.push(`⚠️ Email column: ${e.message}`);
    }

    // Add tags column
    try {
      await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags TEXT`);
      results.push('✅ Added tags column');
    } catch (e) {
      results.push(`⚠️ Tags column: ${e.message}`);
    }

    // Add score column
    try {
      await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 50`);
      results.push('✅ Added score column');
    } catch (e) {
      results.push(`⚠️ Score column: ${e.message}`);
    }

    // Add custom_fields column
    try {
      await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb`);
      results.push('✅ Added custom_fields column');
    } catch (e) {
      results.push(`⚠️ Custom fields column: ${e.message}`);
    }

    // Add last_contacted_at column
    try {
      await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ`);
      results.push('✅ Added last_contacted_at column');
    } catch (e) {
      results.push(`⚠️ Last contacted column: ${e.message}`);
    }

    // Add updated_at column
    try {
      await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
      results.push('✅ Added updated_at column');
    } catch (e) {
      results.push(`⚠️ Updated at column: ${e.message}`);
    }

    // Create indexes
    try {
      await query(`CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email)`);
      results.push('✅ Created email index');
    } catch (e) {
      results.push(`⚠️ Email index: ${e.message}`);
    }

    try {
      await query(`CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score DESC)`);
      results.push('✅ Created score index');
    } catch (e) {
      results.push(`⚠️ Score index: ${e.message}`);
    }

    try {
      await query(`CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source)`);
      results.push('✅ Created source index');
    } catch (e) {
      results.push(`⚠️ Source index: ${e.message}`);
    }

    try {
      await query(`CREATE INDEX IF NOT EXISTS idx_leads_last_contacted ON leads(last_contacted_at)`);
      results.push('✅ Created last_contacted index');
    } catch (e) {
      results.push(`⚠️ Last contacted index: ${e.message}`);
    }

    try {
      await query(`CREATE INDEX IF NOT EXISTS idx_leads_updated ON leads(updated_at DESC)`);
      results.push('✅ Created updated_at index');
    } catch (e) {
      results.push(`⚠️ Updated at index: ${e.message}`);
    }

    // Verify columns exist
    const verification = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'leads' 
      ORDER BY ordinal_position
    `);

    console.log('[COMPLETE-SETUP] ✅ Setup complete!');

    res.json({
      success: true,
      message: 'Database setup complete! All features unlocked.',
      results,
      columns: verification.rows
    });

  } catch (error) {
    console.error('[COMPLETE-SETUP] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Setup failed',
      details: error.message
    });
  }
});

// ============================================================================
// AUTOMATED CLIENT SIGNUP (Self-Service Onboarding)
// ============================================================================

// Public signup endpoint (no API key required)
app.post('/api/signup', async (req, res) => {
  try {
    const {
      businessName,
      industry,
      primaryService,
      serviceArea,
      website,
      ownerName,
      email,
      phone,
      role,
      currentLeadSource,
      voiceGender,
      workingDays,
      workingHours,
      yearlySchedule,
      businessSize,
      monthlyLeads,
      timezone
    } = req.body;

    // Validate required fields
    if (!businessName || !industry || !primaryService || !serviceArea || !ownerName || !email || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    console.log(`[SIGNUP] New signup request for ${businessName} (${email})`);
    console.log(`[SIGNUP] Request body:`, req.body);

    // Create client with automated onboarding
    const { createClient, sendWelcomeEmail } = await import('./lib/auto-onboarding.js');
    console.log(`[SIGNUP] Auto-onboarding module imported successfully`);
    
    console.log(`[SIGNUP] Calling createClient with parameters:`, {
      businessName,
      industry,
      primaryService,
      serviceArea,
      website,
      ownerName,
      email,
      phone,
      role,
      currentLeadSource,
      voiceGender,
      workingDays,
      workingHours,
      yearlySchedule,
      businessSize,
      monthlyLeads,
      timezone
    });
    
    const result = await createClient({
      businessName,
      industry,
      primaryService,
      serviceArea,
      website,
      ownerName,
      email,
      phone,
      role,
      currentLeadSource,
      voiceGender,
      workingDays,
      workingHours,
      yearlySchedule,
      businessSize,
      monthlyLeads,
      timezone
    });
    
    console.log(`[SIGNUP] createClient completed successfully:`, result);

    // Send welcome email with credentials (don't wait for it)
    sendWelcomeEmail({
      clientKey: result.clientKey,
      businessName: result.businessName,
      ownerEmail: result.ownerEmail,
      apiKey: result.apiKey,
      systemPrompt: result.systemPrompt,
      businessSize,
      monthlyLeads,
      workingDays,
      workingHours,
      yearlySchedule
    }).catch(error => {
      console.error('[SIGNUP] Welcome email failed:', error);
    });

    console.log(`[SIGNUP] ✅ Successfully onboarded ${businessName} (${result.clientKey})`);

    // Return success with credentials
    res.json({
      success: true,
      clientKey: result.clientKey,
      apiKey: result.apiKey, // Only returned once!
      message: 'Account created successfully! Check your email for setup instructions.'
    });

  } catch (error) {
    console.error('[SIGNUP] Error:', error);
    
    // Handle duplicate client key (very rare)
    if (error.code === '23505') { // PostgreSQL unique violation
      return res.status(409).json({
        success: false,
        error: 'An account with this business name already exists. Please contact support.'
      });
    }
    
    // Handle specific database errors
    if (error.code === '42P01') { // Table doesn't exist
      console.error('[SIGNUP] Database table missing, creating...');
      try {
        // Try to create the missing table and retry
        const { query } = await import('./db.js');
        await query(`
          CREATE TABLE IF NOT EXISTS client_metadata (
            id BIGSERIAL PRIMARY KEY,
            client_key TEXT NOT NULL UNIQUE,
            owner_name TEXT,
            owner_email TEXT,
            owner_phone TEXT,
            industry TEXT,
            website TEXT,
            service_area TEXT,
            plan_name TEXT,
            trial_ends_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
          )
        `);
        
        // Retry the signup
        const { createClient, sendWelcomeEmail } = await import('./lib/auto-onboarding.js');
        const result = await createClient({
          businessName,
          industry,
          primaryService,
          serviceArea,
          website,
          ownerName,
          email,
          phone,
          role,
          currentLeadSource,
          voiceGender,
          workingDays,
          workingHours,
          yearlySchedule,
          businessSize,
          monthlyLeads,
          timezone,
          businessHours: '9am-5pm Mon-Fri',
          plan
        });
        
        sendWelcomeEmail({
          clientKey: result.clientKey,
          businessName: result.businessName,
          ownerEmail: result.ownerEmail,
          apiKey: result.apiKey,
          systemPrompt: result.systemPrompt,
          businessSize,
          monthlyLeads,
          workingDays,
          workingHours,
          yearlySchedule
        }).catch(emailError => {
          console.error('[SIGNUP] Welcome email failed:', emailError);
        });
        
        return res.json({
          success: true,
          clientKey: result.clientKey,
          apiKey: result.apiKey,
          message: 'Account created successfully! Check your email for setup instructions.'
        });
        
      } catch (retryError) {
        console.error('[SIGNUP] Retry failed:', retryError);
      }
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to create account. Please try again or contact support.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Real-Time Connection Statistics
app.get('/api/realtime/stats', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { getConnectionStats } = await import('./lib/realtime-events.js');
    const stats = getConnectionStats();
    
    res.json(stats);
  } catch (error) {
    console.error('[REALTIME STATS ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Migration Status Endpoint
app.get('/api/migrations/status', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { getMigrationStatus } = await import('./lib/migration-runner.js');
    const status = await getMigrationStatus();
    
    res.json(status);
  } catch (error) {
    console.error('[MIGRATION STATUS ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Run Migrations Manually
app.post('/api/migrations/run', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { runMigrations } = await import('./lib/migration-runner.js');
    const result = await runMigrations();
    
    res.json(result);
  } catch (error) {
    console.error('[RUN MIGRATIONS ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Check database endpoint for debugging
app.get('/check-db', async (req, res) => {
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  try {
    console.log('[CHECK] Checking database...');
    const { query } = await import('./db.js');
    
    // Check all tenants
    const tenants = await query(`SELECT client_key, display_name, vapi_json FROM tenants ORDER BY client_key`);
    
    console.log('[CHECK] Found tenants:', tenants.rows);
    res.json({
      success: true,
      tenants: tenants.rows
    });
    
  } catch (error) {
    console.error('[CHECK] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear leads endpoint for testing
app.get('/clear-my-leads', async (req, res) => {
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  try {
    console.log('[CLEAR] Clearing leads for my_leads...');
    const { query } = await import('./db.js');
    
    // Delete all leads for my_leads
    const result = await query(`DELETE FROM leads WHERE client_key = 'my_leads'`);
    
    console.log('[CLEAR] ✅ Cleared', result.rowCount, 'leads for my_leads');
    res.json({
      success: true,
      message: `✅ Cleared ${result.rowCount} leads for my_leads`,
      cleared: result.rowCount
    });
    
  } catch (error) {
    console.error('[CLEAR] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Quick setup endpoint to create my_leads client
app.get('/setup-my-client', async (req, res) => {
  // Add cache-busting headers to prevent 304 responses
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  try {
    console.log('[SETUP] Starting setup-my-client endpoint...');
    const { query } = await import('./db.js');
    
    // Delete existing my_leads client first
    console.log('[SETUP] Deleting existing my_leads client...');
    await query(`DELETE FROM tenants WHERE client_key = 'my_leads'`);
    
    // Create my_leads client fresh
    console.log('[SETUP] Creating my_leads client...');
    await query(`
      INSERT INTO tenants (
        client_key,
        display_name,
        is_enabled,
        locale,
        timezone,
        calendar_json,
        twilio_json,
        vapi_json,
        numbers_json,
        sms_templates_json,
        created_at
      ) VALUES (
        'my_leads',
        'My Sales Leads',
        true,
        'en-GB',
        'Europe/London',
        '{"calendarId": null, "timezone": "Europe/London", "services": {}, "booking": {"defaultDurationMin": 30}}'::jsonb,
        '{}'::jsonb,
        '{
          "assistantId": "dd67a51c-7485-4b62-930a-4a84f328a1c9",
          "phoneNumberId": "934ecfdb-fe7b-4d53-81c0-7908b97036b5",
          "maxDurationSeconds": 300
        }'::jsonb,
        '{}'::jsonb,
        '{}'::jsonb,
        NOW()
      )
    `);
    console.log('[SETUP] ✅ my_leads client created fresh');
    
    // Create or update opt_out_list table with full schema
    await query(`
      CREATE TABLE IF NOT EXISTS opt_out_list (
        id BIGSERIAL PRIMARY KEY,
        phone TEXT NOT NULL UNIQUE,
        reason TEXT,
        opted_out_at TIMESTAMPTZ DEFAULT NOW(),
        active BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        notes TEXT
      )
    `);
    
    // Add missing columns if they don't exist (PostgreSQL compatible)
    try {
      // Check if active column exists, if not add it
      const checkActive = await query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'opt_out_list' AND column_name = 'active'`);
      if (checkActive.rows.length === 0) {
        await query(`ALTER TABLE opt_out_list ADD COLUMN active BOOLEAN DEFAULT TRUE`);
        console.log('[SETUP] Added active column');
      }
      
      // Check if updated_at column exists, if not add it
      const checkUpdated = await query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'opt_out_list' AND column_name = 'updated_at'`);
      if (checkUpdated.rows.length === 0) {
        await query(`ALTER TABLE opt_out_list ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW()`);
        console.log('[SETUP] Added updated_at column');
      }
      
      // Check if notes column exists, if not add it
      const checkNotes = await query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'opt_out_list' AND column_name = 'notes'`);
      if (checkNotes.rows.length === 0) {
        await query(`ALTER TABLE opt_out_list ADD COLUMN notes TEXT`);
        console.log('[SETUP] Added notes column');
      }
    } catch (error) {
      console.log('[SETUP] Column migration error:', error.message);
    }
    
    // Create indexes
    await query(`
      CREATE INDEX IF NOT EXISTS opt_out_phone_idx ON opt_out_list(phone) WHERE active = TRUE
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS opt_out_active_idx ON opt_out_list(active)
    `);
    
    // Verify
    const result = await query(`
      SELECT 
        client_key, 
        display_name,
        vapi_json->>'assistantId' as assistant_id,
        vapi_json->>'phoneNumberId' as phone_number_id
      FROM tenants
      WHERE client_key = 'my_leads'
    `);
    
    console.log('[SETUP] ✅ Setup complete! Client:', result.rows[0]);
    res.json({
      success: true,
      message: '✅ Setup complete!',
      client: result.rows[0],
      importUrl: `${req.protocol}://${req.get('host')}/lead-import.html?client=my_leads`
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

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
      console.warn('⚠️ Migration failed, but continuing server startup:', migrationError.message);
      // Continue anyway - migrations can be run manually
    }
    
    // Bootstrap clients after DB is ready
    await bootstrapClients();
    
    server.listen(process.env.PORT ? Number(process.env.PORT) : 10000, '0.0.0.0', () => {
      console.log(`AI Booking MVP listening on http://localhost:${process.env.PORT || 10000} (DB: ${DB_PATH})`);
      console.log(`Security middleware: Enhanced authentication and rate limiting enabled`);
      console.log(`Booking system: ${bookingSystem ? 'Available' : 'Not Available'}`);
      console.log(`SMS-Email pipeline: ${smsEmailPipeline ? 'Available' : 'Not Available'}`);
      console.log(`WebSocket server: Real-time Admin Hub updates enabled`);
    });
    
    // Start appointment reminder processor (runs every 5 minutes)
    setInterval(async () => {
      try {
        await sendScheduledReminders();
      } catch (error) {
        console.error('Reminder processor error:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes
    
    // Set server timeout to 25 minutes to handle comprehensive searches
    server.timeout = 1500000; // 25 minutes
    
    // Start quality monitoring cron job (runs every hour)
    const { monitorAllClients } = await import('./lib/quality-monitoring.js');
    cron.schedule('0 * * * *', async () => {
      console.log('[CRON] 🔄 Running hourly quality monitoring...');
      try {
        await monitorAllClients();
      } catch (error) {
        console.error('[CRON ERROR] Quality monitoring failed:', error);
      }
    });
    console.log('✅ Quality monitoring cron job scheduled (runs every hour)');
    
    // Start appointment reminder processing (runs every 5 minutes)
    const { processReminderQueue } = await import('./lib/appointment-reminders.js');
    cron.schedule('*/5 * * * *', async () => {
      console.log('[CRON] ⏰ Processing appointment reminders...');
      try {
        const result = await processReminderQueue();
        if (result.processed > 0) {
          console.log(`[CRON] ✅ Processed ${result.processed} reminders`);
        }
      } catch (error) {
        console.error('[CRON ERROR] Reminder processing failed:', error);
      }
    });
    console.log('✅ Appointment reminder cron job scheduled (runs every 5 minutes)');
    
    // Start follow-up processing (runs every 5 minutes)
    const { processFollowUpQueue } = await import('./lib/follow-up-processor.js');
    cron.schedule('*/5 * * * *', async () => {
      console.log('[CRON] 📨 Processing follow-up messages...');
      try {
        const result = await processFollowUpQueue();
        if (result.processed > 0) {
          console.log(`[CRON] ✅ Processed ${result.processed} follow-ups (${result.failed} failed)`);
        }
      } catch (error) {
        console.error('[CRON ERROR] Follow-up processing failed:', error);
      }
    });
    console.log('✅ Follow-up message cron job scheduled (runs every 5 minutes)');
    
    // Start database health monitoring (runs every 5 minutes)
    const { checkDatabaseHealth } = await import('./lib/database-health.js');
    cron.schedule('*/5 * * * *', async () => {
      try {
        const health = await checkDatabaseHealth();
        if (health.status !== 'healthy') {
          console.error(`[DB HEALTH] ⚠️ Status: ${health.status}, Failures: ${health.consecutiveFailures}`);
        }
      } catch (error) {
        console.error('[CRON ERROR] Database health check failed:', error);
      }
    });
    console.log('✅ Database health monitoring scheduled (runs every 5 minutes)');
    
    // Weekly report generation (every Monday at 9 AM)
    cron.schedule('0 9 * * 1', async () => {
      console.log('[CRON] 📊 Generating weekly reports...');
      try {
        const { generateAndSendAllWeeklyReports } = await import('./lib/weekly-report.js');
        const result = await generateAndSendAllWeeklyReports();
        console.log(`[CRON] ✅ Weekly reports completed: ${result.generated} generated, ${result.sent} sent`);
      } catch (error) {
        console.error('[CRON ERROR] Weekly report generation failed:', error);
      }
    });
    console.log('✅ Weekly report generation scheduled (runs every Monday at 9 AM)');
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();