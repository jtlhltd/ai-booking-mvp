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

// server.js — AI Booking MVP (SQLite tenants + env bootstrap + richer tenant awareness)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import rateLimit from 'express-rate-limit';
import twilio from 'twilio';
import { createHash } from 'crypto';

import { makeJwtAuth, insertEvent, freeBusy } from './gcal.js';
import { init as initDb,  upsertFullClient, getFullClient, listFullClients, deleteClient, DB_PATH } from './db.js'; // SQLite-backed tenants
await initDb();
import { google } from 'googleapis';
import cron from 'node-cron';
import leadsRouter from './routes/leads.js';
import twilioWebhooks from './routes/twilio-webhooks.js';
import vapiWebhooks from './routes/vapi-webhooks.js';


const app = express();

// Trust proxy for rate limiting (required for Render)
app.set('trust proxy', 1);

// Serve static files from public directory
app.use(express.static('public'));

// Dashboard routes
app.get('/', (req, res) => {
  res.sendFile(new URL('./public/index.html', import.meta.url).pathname);
});

app.get('/tenant-dashboard', (req, res) => {
  res.sendFile(new URL('./public/tenant-dashboard.html', import.meta.url).pathname);
});

app.get('/client-dashboard', (req, res) => {
  res.sendFile(new URL('./public/client-dashboard.html', import.meta.url).pathname);
});

app.get('/client-setup', (req, res) => {
  res.sendFile(new URL('./public/client-setup.html', import.meta.url).pathname);
});

app.get('/client-template', (req, res) => {
  res.sendFile(new URL('./public/client-dashboard-template.html', import.meta.url).pathname);
});

app.get('/setup-guide', (req, res) => {
  res.sendFile(new URL('./public/client-setup-guide.html', import.meta.url).pathname);
});

app.get('/onboarding', (req, res) => {
  res.sendFile(new URL('./public/onboarding-dashboard.html', import.meta.url).pathname);
});

app.get('/onboarding-templates', (req, res) => {
  res.sendFile(new URL('./public/onboarding-templates.html', import.meta.url).pathname);
});

app.get('/onboarding-wizard', (req, res) => {
  res.sendFile(new URL('./public/client-onboarding-wizard.html', import.meta.url).pathname);
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
        assistantId: `asst_${clientKey}_${Date.now()}`,
        phoneNumberId: `phone_${clientKey}_${Date.now()}`,
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

    // Generate branded dashboard
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const templatePath = path.join(process.cwd(), 'public', 'client-dashboard-template.html');
      console.log('[FILE DEBUG]', { templatePath, exists: fs.existsSync(templatePath) });
      
      const dashboardTemplate = fs.readFileSync(templatePath, 'utf8');

    const brandedDashboard = dashboardTemplate
      .replace(/Client Company/g, clientData.basic.clientName)
      .replace(/"#667eea"/g, `"${primaryColor}"`)
      .replace(/"#764ba2"/g, `"${secondaryColor}"`)
      .replace(/YOUR_API_KEY_HERE/g, process.env.API_KEY);
    const clientDir = path.join(process.cwd(), 'clients', clientKey);
    
    if (!fs.existsSync(clientDir)) {
      fs.mkdirSync(clientDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(clientDir, 'dashboard.html'),
      brandedDashboard
    );

    // Create onboarding checklist
    const checklistContent = `# ${clientData.basic.clientName} - Onboarding Checklist

**Client Key:** ${clientKey}
**Industry:** ${clientData.basic.industry}
**Created:** ${new Date().toLocaleDateString()}

## Client Information
- **Company:** ${clientData.basic.clientName}
- **Contact:** ${clientData.basic.contactName} (${clientData.basic.contactTitle || 'N/A'})
- **Email:** ${clientData.basic.email}
- **Phone:** ${clientData.basic.phone || 'N/A'}
- **Website:** ${clientData.basic.website || 'N/A'}

## Branding
- **Primary Color:** ${primaryColor}
- **Secondary Color:** ${secondaryColor}
- **Logo Emoji:** ${clientData.branding?.logoEmoji || '🚀'}
- **Timezone:** ${clientData.branding?.timezone || 'Europe/London'}

## Business Hours
- **Hours:** ${clientData.operations?.businessStart || '09:00'} - ${clientData.operations?.businessEnd || '17:00'}
- **Days:** ${(clientData.operations?.businessDays || [1,2,3,4,5]).map(d => ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][d-1]).join(', ')}
- **Appointment Duration:** ${clientData.operations?.appointmentDuration || 60} minutes
- **Advance Booking:** ${clientData.operations?.advanceBooking || 7} days

## Communication
- **SMS Number:** ${clientData.communication?.smsFromNumber}
- **Welcome Message:** ${clientData.communication?.welcomeMessage}
- **Reminder Hours:** ${clientData.communication?.reminderHours || 24} hours before
- **Max Retries:** ${clientData.communication?.maxRetries || 3}

## Next Steps
1. Review configuration
2. Setup SMS numbers in Twilio
3. Configure VAPI assistant
4. Test system end-to-end
5. Schedule client training
6. Go live

## Files Generated
- \`clients/${clientKey}/dashboard.html\` - Branded client dashboard
- \`clients/${clientKey}/checklist.md\` - This checklist
`;

      fs.writeFileSync(
        path.join(clientDir, 'checklist.md'),
        checklistContent
      );
      
      console.log('[FILES CREATED]', { clientDir, dashboardFile: path.join(clientDir, 'dashboard.html'), checklistFile: path.join(clientDir, 'checklist.md') });
    } catch (fileError) {
      console.error('[FILE ERROR]', { error: fileError.message, stack: fileError.stack });
      // Don't fail the entire request if file creation fails
    }

    console.log('[CLIENT CREATED]', { 
      clientKey, 
      clientName: clientData.basic.clientName,
      industry: clientData.basic.industry 
    });

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
const GOOGLE_CLIENT_EMAIL    = process.env.GOOGLE_CLIENT_EMAIL    || '';
const GOOGLE_PRIVATE_KEY     = process.env.GOOGLE_PRIVATE_KEY     || '';
const GOOGLE_PRIVATE_KEY_B64 = process.env.GOOGLE_PRIVATE_KEY_B64 || '';
const GOOGLE_CALENDAR_ID     = process.env.GOOGLE_CALENDAR_ID     || 'primary';
const TIMEZONE               = process.env.TZ || process.env.TIMEZONE || 'Europe/London';

// Retry logic for external API calls
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      console.log(`[RETRY] Attempt ${attempt}/${maxRetries} failed, retrying in ${Math.round(delay)}ms`, { error: error.message });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
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
    // This would query the calls database
    // For now, return 0 (no rate limiting)
    return 0;
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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));
app.use(cors({
  origin: ORIGIN === '*' ? true : ORIGIN,
  methods: ['GET','POST','OPTIONS','DELETE'],
  allowedHeaders: ['Content-Type','X-API-Key','Idempotency-Key','X-Client-Key'],
}));
app.use('/webhooks/twilio-status', express.urlencoded({ extended: false }));
app.use('/webhooks/twilio-inbound', express.urlencoded({ extended: false }));
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
    return String(str).replace(/\\{\\{\\s*([a-zA-Z0-9_]+)\\s*\\}\\}/g, (_, k) => {
      const v = vars[k];
      return (v === undefined || v === null) ? '' : String(v);
    });
  } catch { return String(str || ''); }
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

// API key guard
function requireApiKey(req, res, next) {
  if (req.method === 'GET' && (req.path === '/health' || req.path === '/gcal/ping' || req.path === '/healthz')) return next();
  if (req.path.startsWith('/webhooks/twilio-status') || req.path.startsWith('/webhooks/twilio-inbound') || req.path.startsWith('/webhooks/twilio/sms-inbound') || req.path.startsWith('/webhooks/vapi')) return next();
  if (!API_KEY) return res.status(500).json({ error: 'Server missing API_KEY' });
  const key = req.get('X-API-Key');
  if (key && key === API_KEY) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}
app.use(requireApiKey);

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

    if (!service) return res.status(400).json({ ok:false, error:'Missing service' });
    if (!name || !phoneIn) return res.status(400).json({ ok:false, error:'Missing lead.name or lead.phone' });

    const regionHint = (body.region || client?.booking?.country || client?.default_country || client?.country || 'GB');
    const phone = normalizePhoneE164(phoneIn, regionHint);
    if (!phone) return res.status(400).json({ ok:false, error:`invalid phone (expected E.164 like +447... or convertible with region ${regionHint})` });

    const now = new Date().toISOString();
    const rows = await readJson(LEADS_PATH, []);
    const id = 'lead_' + nanoid(8);
    const saved = {
      id, tenantId: client.clientKey || client.id, name, phone, source, service,
      status: 'new', createdAt: now, updatedAt: now
    };
    rows.push(saved);
    await writeJson(LEADS_PATH, rows);

    // --- Auto-nudge SMS (minimal, tenant-aware) ---
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

    return res.status(201).json({ ok:true, lead: saved, override: true });
  } catch (err) {
    console.error('[POST /api/leads override] error:', err);
    return res.status(500).json({ ok:false, error:'Internal error' });
  }
});




// Mounted minimal lead intake + STOP webhook
app.use(leadsRouter);
app.use(twilioWebhooks);

// --- Vapi booking webhook: create GCal event + send confirmations
app.post('/webhooks/vapi', async (req, res) => {
  try {
    const p = req.body || {};

    // Accept multiple payload shapes from Vapi
    const clientKey =
      p?.metadata?.clientKey || p?.clientKey || req.get('X-Client-Key') || null;
    const service = p?.metadata?.service || p?.service || '';
    const lead    = p?.customer || p?.lead || p?.metadata?.lead || {};
    const slot    = p?.booking?.slot || p?.metadata?.selectedOption || p?.selectedSlot || p?.slot;

    if (!clientKey) return res.status(400).json({ ok:false, error:'missing clientKey' });
    if (!service)   return res.status(400).json({ ok:false, error:'missing service' });
    if (!lead?.phone) return res.status(400).json({ ok:false, error:'missing lead.phone' });
    if (!slot?.start) return res.status(400).json({ ok:false, error:'missing slot.start' });

    const client = await getFullClient(clientKey);
    if (!client) return res.status(404).json({ ok:false, error:'unknown tenant' });

    if (!(GOOGLE_CLIENT_EMAIL && (GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY_B64))) {
      return res.status(400).json({ ok:false, error:'Google env missing' });
    }

    const tz = pickTimezone(client);
    const calendarId = pickCalendarId(client);

    const startISO = new Date(slot.start).toISOString();
    const endISO = slot.end
      ? new Date(slot.end).toISOString()
      : new Date(new Date(slot.start).getTime() + (client?.booking?.defaultDurationMin || 30) * 60000).toISOString();

    // Authorize
    const auth = makeJwtAuth({ clientEmail: GOOGLE_CLIENT_EMAIL, privateKey: GOOGLE_PRIVATE_KEY, privateKeyB64: GOOGLE_PRIVATE_KEY_B64 });
    await auth.authorize();

    // Guard against conflicts
    const busy = await freeBusy({ auth, calendarId, timeMinISO: startISO, timeMaxISO: endISO });
    const conflict = busy.some(b => !(endISO <= b.start || startISO >= b.end));
    if (conflict) {
      return res.status(409).json({ ok:false, error:'slot_unavailable', busy });
    }

    // Create event (deterministic ID to prevent dupes)
    const { google } = await import('googleapis');
    const cal = google.calendar({ version: 'v3', auth });
    const summary = `${service} — ${lead.name || ''}`.trim();
    const description = [
      `Service: ${service}`,
      `Lead: ${lead.name || ''}`,
      lead.phone ? `Phone: ${lead.phone}` : null,
      `Tenant: ${client?.clientKey || 'default'}`
    ].filter(Boolean).join('\\n');

    let event;
    try {
      const rawKey = `${client?.clientKey || 'default'}|${service}|${startISO}|${lead.phone}`;
      const crypto = await import('crypto');
      const deterministicId = ('bk' + crypto.createHash('sha1').update(rawKey).digest('hex').slice(0, 20)).toLowerCase();

      event = (await cal.events.insert({
        calendarId,
        requestBody: {
          id: deterministicId,
          summary,
          description,
          start: { dateTime: startISO, timeZone: tz },
          end:   { dateTime: endISO,   timeZone: tz },
          extendedProperties: { private: { leadPhone: lead.phone, leadId: lead.id || '' } }
        }
      })).data;
    } catch (err) {
      // Retry without custom id if Google rejects it
      event = (await cal.events.insert({
        calendarId,
        requestBody: {
          summary,
          description,
          start: { dateTime: startISO, timeZone: tz },
          end:   { dateTime: endISO,   timeZone: tz },
          extendedProperties: { private: { leadPhone: lead.phone, leadId: lead.id || '' } }
        }
      })).data;
    }

    // Send confirmation SMS (tenant-aware)
    try {
      const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
      if (configured) {
        const when = new Date(startISO).toLocaleString(client?.locale || 'en-GB', {
          timeZone: tz, weekday:'short', day:'numeric', month:'short',
          hour:'numeric', minute:'2-digit', hour12:true
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
      console.error('[confirm sms failed]', e?.message || e);
    }

    return res.json({ ok:true, eventId: event.id, htmlLink: event.htmlLink || null });
  } catch (err) {
    console.error('[VAPI WEBHOOK ERROR]', err?.response?.data || err?.message || err);
    return res.status(500).json({ ok:false, error: String(err?.response?.data || err?.message || err) });
  }
});

app.use(vapiWebhooks);
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

// Health (DB)
app.get('/health', async (_req, res) => {
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
const servicesFor       = (c) => asJson(c?.services, [])        || asJson(c?.servicesJson, []);
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

    const services = servicesFor(client);
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

// Twilio delivery receipts

// Simple SMS send route (per-tenant or global fallback)
app.post('/api/notify/send', async (req, res) => {
  try {
    const client = await getClientFromHeader(req);
    const { channel, to, message } = req.body || {};
    if (channel !== 'sms') return res.status(400).json({ ok:false, error:'Only channel="sms" is supported' });
    if (!to || !message) return res.status(400).json({ ok:false, error:'Missing "to" or "message"' });

    const { smsClient, messagingServiceSid, fromNumber, configured } = smsConfig(client);
    if (!configured) return res.status(400).json({ ok:false, error:'SMS not configured (no fromNumber or messagingServiceSid)' });

    const payload = { to, body: message };
    if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid;
    else if (fromNumber) payload.from = fromNumber;

    const resp = await smsClient.messages.create(payload);
    return res.json({ ok:true, sid: resp.sid });
  } catch (e) {
    const msg = e?.message || 'sms_error';
    const code = e?.status || e?.code || 500;
    return res.status(500).json({ ok:false, error: msg });
  }
});
app.post('/webhooks/twilio-status', async (req, res) => {
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
const VAPI_PRIVATE_KEY     = process.env.VAPI_PRIVATE_KEY || '';
const VAPI_ASSISTANT_ID    = process.env.VAPI_ASSISTANT_ID || '';
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID || '';

app.post('/webhooks/twilio-inbound', smsRateLimit, safeAsync(async (req, res) => {
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
        // TODO: Implement call queue/scheduling system
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
          const assistantId = client?.vapiAssistantId || VAPI_ASSISTANT_ID;
          const phoneNumberId = client?.vapiPhoneNumberId || VAPI_PHONE_NUMBER_ID;
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
              variableValues: {
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
                LeadScore: existingLead?.score || 0,
                LeadStatus: existingLead?.status || 'new',
                BusinessHours: isBusinessHours() ? 'within' : 'outside'
              }
            }
          };
            // Use retry logic for VAPI calls
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
                throw new Error(`VAPI call failed: ${resp.status} ${errorText}`);
              }
              
              const result = await resp.json().catch(() => null);
              if (!result) {
                throw new Error('Failed to parse VAPI response');
              }
              
              return result;
            }, 3, 2000); // 3 retries, 2 second base delay

            console.log('[VAPI CALL SUCCESS]', { 
              from, 
              tenantKey, 
              callId: vapiResult?.id || 'unknown',
              status: vapiResult?.status || 'unknown',
              vapiStatus: 'ok' 
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
                  attendees: [
                    { email: from.replace('+', '') + '@example.com', displayName: 'Lead' }
                  ],
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
    if (!VAPI_PRIVATE_KEY) {
      return res.status(500).json({ error: 'Missing VAPI_PRIVATE_KEY' });
    }

    const assistantId = client?.vapiAssistantId || VAPI_ASSISTANT_ID;
    const phoneNumberId = client?.vapiPhoneNumberId || VAPI_PHONE_NUMBER_ID;

    const payload = {
      assistantId,
      phoneNumberId,
      customer: { number: e164, numberE164CheckEnabled: true },
      maxDurationSeconds: 5, // Cut off after 5 seconds for testing to save costs
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
          Currency: client?.currency || 'GBP'
        }
      }
    };

    const resp = await fetch(`${VAPI_URL}/call`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    let data;
    try { data = await resp.json(); }
    catch { data = { raw: await resp.text().catch(() => '') }; }

    return res.status(resp.ok ? 200 : 502).json(data);
  } catch (err) {
    console.error('new-lead vapi error', err);
    return res.status(500).json({ error: String(err) });
  }
});

// Booking (auto-book + branded SMS)
app.post('/api/calendar/check-book', async (req, res) => {
  const idemKey = deriveIdemKey(req);
  const cached = getCachedIdem(idemKey);
  if (cached) return res.status(cached.status).json(cached.body);

  try {
    const client = await getClientFromHeader(req); // DB-backed
    if (!client) return res.status(400).json({ error: 'Unknown tenant' });
    const tz = pickTimezone(client);
    const calendarId = pickCalendarId(client);

    const services = servicesFor(client);
    const requestedService = req.body?.service;
    const svc = services.find(s => s.id === requestedService);
    const dur = (typeof req.body?.durationMin === 'number' && req.body.durationMin > 0)
      ? req.body.durationMin
      : (svc?.durationMin || client?.bookingDefaultDurationMin || 30);

    const { lead } = req.body || {};
    if (!lead?.name || !lead?.phone) return res.status(400).json({ error: 'Missing lead{name, phone}' });
    lead.phone = normalizePhoneE164(lead.phone);
    if (!lead.phone) return res.status(400).json({ error: 'lead.phone must be E.164' });

    // Default: book tomorrow ~14:00 in tenant TZ
    const base = new Date(Date.now() + 24 * 60 * 60 * 1000);
    base.setHours(14, 0, 0, 0);
    const startISO = base.toISOString();
    const endISO = new Date(base.getTime() + dur * 60 * 1000).toISOString();

    let google = { skipped: true };
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
          event = await withRetry(() => insertEvent({
            auth, calendarId, summary, description,
            startIso: startISO, endIso: endISO, timezone: tz
          }), { retries: 2, delayMs: 300 });
        } catch (e) {
          const code = e?.response?.status || 500;
          const data = e?.response?.data || e?.message || String(e);
          return res.status(code).json({ ok:false, error:'gcal_insert_failed', details: data });
        }

        google = { id: event.id, htmlLink: event.htmlLink, status: event.status };
      }
    } catch (err) {
      console.error(JSON.stringify({ evt: 'gcal.error', rid: req.id, error: String(err) }));
      google = { error: String(err) };
    }

    let sms = null;
    const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
    if (configured) {
      const when = new Date(startISO).toLocaleString(client?.locale || 'en-GB', {
        timeZone: tz, weekday: 'short', day: 'numeric', month: 'short',
        hour: 'numeric', minute: '2-digit', hour12: true
      });
      const link = google?.htmlLink ? ` Calendar: ${google.htmlLink}` : '';
      const brand = client?.displayName || client?.clientKey || 'Our Clinic';
      const sig = client?.brandSignature ? ` ${client.brandSignature}` : '';
      const body = `Hi ${lead.name}, your ${requestedService || 'appointment'} is booked with ${brand} for ${when} ${tz}.${link}${sig} Reply STOP to opt out.`;

      try {
        const payload = { to: lead.phone, body };
        if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid;
        else payload.from = fromNumber;
        const resp = await withRetry(() => smsClient.messages.create(payload), { retries: 2, delayMs: 300 });
        sms = { id: resp.sid, to: lead.phone };
      } catch (err) {
        console.error(JSON.stringify({ evt: 'sms.error', rid: req.id, error: String(err) }));
        sms = { error: String(err) };
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
    setCachedIdem(idemKey, 200, responseBody);
    return res.json(responseBody);
  } catch (e) {
    const status = 500;
    const body = { error: String(e) };
    setCachedIdem(deriveIdemKey(req), status, body);
    return res.status(status).json(body);
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
    const calls = await readJson(CALLS_PATH, []); // Calls still use file storage

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
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0'
    };
    
    // Check database connectivity
    try {
      await listFullClients();
      health.database = 'connected';
    } catch (e) {
      health.database = 'disconnected';
      health.status = 'degraded';
    }
    
    res.json(health);
  } catch (e) {
    res.status(500).json({ status: 'unhealthy', error: e.message });
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

// Stats
app.get('/api/stats', async (_req, res) => {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const within = (ts, days) => (now - ts) <= (days * day);

  const calls = await readJson(CALLS_PATH, []);
  const smsEvents = await readJson(SMS_STATUS_PATH, []);
  const agg = {};

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

  res.json({ ok: true, tenants: agg });
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
    const c = await getFullClient(req.params.key);
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




// === Reminder job: 24h & 1h SMS ===
function startReminders() {
  try {
    cron.schedule('*/10 * * * *', async () => {
      try {
        const tenants = await listFullClients();
        const auth = makeJwtAuth({ clientEmail: GOOGLE_CLIENT_EMAIL, privateKey: GOOGLE_PRIVATE_KEY, privateKeyB64: GOOGLE_PRIVATE_KEY_B64 });
        await auth.authorize();
        const cal = google.calendar({ version:'v3', auth });

        const now = new Date();
        const in26h = new Date(now.getTime() + 26*60*60*1000);

        for (const t of tenants) {
          const calendarId = t.calendarId || t.gcalCalendarId || 'primary';
          const tz = t?.booking?.timezone || TIMEZONE;
          const resp = await cal.events.list({
            calendarId,
            timeMin: now.toISOString(),
            timeMax: in26h.toISOString(),
            singleEvents: true,
            orderBy: 'startTime'
          });
          const items = resp.data.items || [];
          for (const ev of items) {
            const startISO = ev.start?.dateTime || ev.start?.date;
            if (!startISO) continue;
            const start = new Date(startISO);
            const mins  = Math.floor((start - now)/60000);
            const leadPhone = ev.extendedProperties?.private?.leadPhone;
            if (!leadPhone) continue;

            const { messagingServiceSid, fromNumber, smsClient } = smsConfig(t);
            if (!smsClient || !(messagingServiceSid || fromNumber)) continue;

            if (mins <= 1440 && mins > 1380) {
              const body = `Reminder: ${ev.summary || 'appointment'} tomorrow at ${start.toLocaleTimeString('en-GB', { timeZone: tz })}.`;
              const payload = { to: leadPhone, body };
              if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid; else if (fromNumber) payload.from = fromNumber;
              await smsClient.messages.create(payload);
            } else if (mins <= 60 && mins > 50) {
              const body = `Reminder: ${ev.summary || 'appointment'} in ~1 hour. Details: ${ev.htmlLink || ''}`.trim();
              const payload = { to: leadPhone, body };
              if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid; else if (fromNumber) payload.from = fromNumber;
              await smsClient.messages.create(payload);
            }
          }
        }
      } catch (e) {
        const sc = e?.response?.status; if (sc === 404 || sc === 410) return; console.error('reminders loop error', e?.message || e);
      }
    });
  } catch (e) {
    console.error('reminders setup error', e?.message || e);
  }
}

startReminders();



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


await bootstrapClients(); // <--- run after routes loaded & DB ready

app.listen(process.env.PORT ? Number(process.env.PORT) : 10000, '0.0.0.0', () => {
  console.log(`AI Booking MVP listening on http://localhost:${PORT} (DB: ${DB_PATH})`);
});