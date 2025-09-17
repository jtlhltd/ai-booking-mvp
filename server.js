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
import { upsertFullClient, getFullClient, listFullClients, deleteClient, DB_PATH } from './db.js'; // SQLite-backed tenants
import { google } from 'googleapis';
import cron from 'node-cron';

const app = express();

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

// === Env: Twilio
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN  || '';
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || '';
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID || '';

const defaultSmsClient = (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;
const defaultSmsConfigured = !!(defaultSmsClient && (TWILIO_FROM_NUMBER || TWILIO_MESSAGING_SERVICE_SID));

// === Middleware
app.use(express.json({ limit: '1mb' }));
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
const isE164 = (s) => typeof s === 'string' && /^\+\d{7,15}$/.test(s);
const normalizePhone = (s) => (s || '').trim().replace(/[^\d+]/g, '');

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
  if (req.path.startsWith('/webhooks/twilio-status') || req.path.startsWith('/webhooks/twilio-inbound')) return next();
  if (!API_KEY) return res.status(500).json({ error: 'Server missing API_KEY' });
  const key = req.get('X-API-Key');
  if (key && key === API_KEY) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}
app.use(requireApiKey);

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
    ].filter(Boolean).join('\n');

    let event;
    try {
      event = await insertEvent({
        auth,
        calendarId,
        summary,
        description,
        startIso: startISO,
        endIso: endISO,
        timezone: tz,
        extendedProperties: { private: { leadPhone: lead.phone, leadId: lead.id || '' } }
      });
    } catch (e) {
      const code = e?.response?.status || 500;
      const data = e?.response?.data || e?.message || String(e);
      return res.status(code).json({ ok:false, error:'gcal_insert_failed', details: data });
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
    const body  = `Hi ${lead.name}, your ${service} is booked with ${brand} for ${when} ${tz}.${link} Reply STOP to opt out.`;
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

// Twilio inbound STOP/START to toggle consent
app.post('/webhooks/twilio-inbound', async (req, res) => {
  try {
    const from = normalizePhone(req.body.From || '');
    const text = String(req.body.Body || '').trim().toUpperCase();
    if (!isE164(from)) return res.type('text/plain').send('IGNORED');
    const leads = await readJson(LEADS_PATH, []);
    let lead = leads.find(l => l.phone === from);
    if (!lead) { lead = { id: 'lead_' + nanoid(8), phone: from }; leads.push(lead); }
    if (['STOP','STOP ALL','UNSUBSCRIBE','CANCEL','END','QUIT'].includes(text)) lead.consentSms = false;
    if (['START','UNSTOP','YES'].includes(text)) lead.consentSms = true;
    await writeJson(LEADS_PATH, leads);
    res.type('text/plain').send('OK');
  } catch {
    res.type('text/plain').send('OK');
  }
});

// Outbound lead webhook → Vapi (tenant-aware variables + optional per-tenant caller ID)
const VAPI_URL = 'https://api.vapi.ai';
const VAPI_PRIVATE_KEY     = process.env.VAPI_PRIVATE_KEY || '';
const VAPI_ASSISTANT_ID    = process.env.VAPI_ASSISTANT_ID || '';
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID || '';

app.post('/webhooks/new-lead/:clientKey', async (req, res) => {
  try {
    const { clientKey } = req.params;
    const client = await getFullClient(clientKey);
    if (!client) return res.status(404).json({ error: `Unknown clientKey ${clientKey}` });

    const { phone, service, durationMin } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'Missing phone' });
    const e164 = normalizePhone(phone);
    if (!isE164(e164)) return res.status(400).json({ error: 'phone must be E.164 (+447...)' });
    if (!VAPI_PRIVATE_KEY) {
      return res.status(500).json({ error: 'Missing VAPI_PRIVATE_KEY' });
    }

    const assistantId = client?.vapiAssistantId || VAPI_ASSISTANT_ID;
    const phoneNumberId = client?.vapiPhoneNumberId || VAPI_PHONE_NUMBER_ID;

    const payload = {
      assistantId,
      phoneNumberId,
      customer: { number: e164, numberE164CheckEnabled: true },
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
    lead.phone = normalizePhone(lead.phone);
    if (!isE164(lead.phone)) return res.status(400).json({ error: 'lead.phone must be E.164' });

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
        ].join('\n');

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
    await cal.events.delete({ calendarId: pickCalendarId(client), eventId });
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
        console.error('reminders loop error', e?.message || e);
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

    const { id, name, phone, source } = req.body || {};
    const leadId = (id && String(id)) || ('lead_' + nanoid(8));
    const phoneNorm = normalizePhone(phone);
    if (!isE164(phoneNorm)) return res.status(400).json({ ok:false, error:'invalid phone (E.164 required)' });

    const now = new Date().toISOString();
    const rows = await readJson(LEADS_PATH, []);
    const idx = rows.findIndex(r => r.id === leadId);
    const lead = { id: leadId, tenantId: client.clientKey || client.id, name: name || '', phone: phoneNorm, source: source || 'unknown', status: 'new', createdAt: now, updatedAt: now };
    if (idx >= 0) rows[idx] = { ...rows[idx], ...lead, updatedAt: now }; else rows.push(lead);
    await writeJson(LEADS_PATH, rows);
    res.status(201).json({ ok:true, lead });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});

app.post('/api/leads/nudge', async (req, res) => {
  try {
    const client = await getClientFromHeader(req);
    if (!client) return res.status(401).json({ ok:false, error:'missing or unknown X-Client-Key' });

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

    await ensureLeadsFile();
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ ok:false, error:'lead id required' });

    const rows = await readLeads();
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
    await writeLeads(rows);

    res.json({ ok:true, result: { sid: result?.sid } });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});


await bootstrapClients(); // <--- run after routes loaded & DB ready

app.listen(PORT, () => {
  console.log(`AI Booking MVP listening on http://localhost:${PORT} (DB: ${DB_PATH})`);
});