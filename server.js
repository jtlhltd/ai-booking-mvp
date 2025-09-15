// server.js — AI Booking MVP (SQLite tenants + env bootstrap for free Render)
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
import { upsertClient, getClientByKey, listClients, deleteClient, DB_PATH } from './db.js'; // SQLite-backed tenants

const app = express();

// --- healthz: report which integrations are configured (without leaking secrets)
app.get('/healthz', (req, res) => {
  const flags = {
    apiKey: !!process.env.API_KEY,
    sms: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER)),
    gcal: !!(process.env.GOOGLE_CLIENT_EMAIL && (process.env.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY_B64)),
    vapi: !!(process.env.VAPI_PRIVATE_KEY && process.env.VAPI_ASSISTANT_ID && process.env.VAPI_PHONE_NUMBER_ID),
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
  return await getClientByKey(key);
}
function pickTimezone(client) { return client?.bookingTimezone || TIMEZONE; }
function pickCalendarId(client) { return client?.calendarId || GOOGLE_CALENDAR_ID; }
function smsConfig(client) {
  const messagingServiceSid = client?.smsMessagingServiceSid || TWILIO_MESSAGING_SERVICE_SID || null;
  const fromNumber = client?.smsFrom || TWILIO_FROM_NUMBER || null;
  const smsClient = defaultSmsClient;
  const configured = !!(smsClient && (messagingServiceSid || fromNumber));
  return { messagingServiceSid, fromNumber, smsClient, configured };
}

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
  if (req.method === 'GET' && (req.path === '/health' || req.path === '/gcal/ping')) return next();
  if (req.path.startsWith('/webhooks/twilio-status')) return next();
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
    const existing = await listClients();
    if (existing.length > 0) return;
    const raw = process.env.BOOTSTRAP_CLIENTS_JSON;
    if (!raw) return;
    let seed = JSON.parse(raw);
    if (!Array.isArray(seed)) seed = [seed];
    for (const c of seed) {
      if (!c.clientKey || !c.booking?.timezone) continue;
      await upsertClient(c);
    }
    console.log(`Bootstrapped ${seed.length} client(s) into SQLite from BOOTSTRAP_CLIENTS_JSON`);
  } catch (e) {
    console.error('bootstrapClients error', e?.message || e);
  }
}

// Health (DB)
app.get('/health', async (_req, res) => {
  try {
    const rows = await listClients();
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

// === Availability ===
app.post('/api/calendar/find-slots', async (req, res) => {
  try {
    const client = await getClientFromHeader(req);
    if (!client) return res.status(400).json({ ok:false, error: 'Unknown tenant (missing X-Client-Key)' });
    if (!(GOOGLE_CLIENT_EMAIL && (GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY_B64)))
      return res.status(400).json({ ok:false, error:'Google env missing' });

    const tz = pickTimezone(client);
    const calendarId = pickCalendarId(client);
    const { durationMin = client?.bookingDefaultDurationMin || 30, daysAhead = 14, stepMinutes = 15 } = req.body || {};

    const business = client?.booking?.hours || {
      mon: ['09:00-17:00'], tue: ['09:00-17:00'], wed: ['09:00-17:00'],
      thu: ['09:00-17:00'], fri: ['09:00-17:00']
    };

    const windowStart = new Date();
    const windowEnd   = new Date(Date.now() + daysAhead * 86400000);

    const auth = makeJwtAuth({ clientEmail: GOOGLE_CLIENT_EMAIL, privateKey: GOOGLE_PRIVATE_KEY, privateKeyB64: GOOGLE_PRIVATE_KEY_B64 });
    await auth.authorize();
    const busy = await freeBusy({ auth, calendarId, timeMinISO: windowStart.toISOString(), timeMaxISO: windowEnd.toISOString() });

    const slotMs = durationMin * 60000;
    const results = [];
    const cursor = new Date(windowStart);
    cursor.setSeconds(0,0);

    const dowName = ['sun','mon','tue','wed','thu','fri','sat'];

    function localHM(dt) {
      const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
      const parts = f.formatToParts(dt);
      const hh = parts.find(p => p.type==='hour').value;
      const mm = parts.find(p => p.type==='minute').value;
      return `${hh}:${mm}`;
    }

    function isOpen(dt) {
      const spans = business[dowName[dt.getUTCDay()]];
      if (!Array.isArray(spans) || spans.length === 0) return false;
      const hm = localHM(dt);
      return spans.some(s => {
        const [a,b] = s.split('-'); return hm >= a && hm < b;
      });
    }

    function overlapsBusy(sISO, eISO) {
      return busy.some(b => !(eISO <= b.start || sISO >= b.end));
    }

    while (cursor < windowEnd && results.length < 20) {
      const start = new Date(cursor);
      const end   = new Date(cursor.getTime() + slotMs);
      const sISO = start.toISOString();
      const eISO = end.toISOString();

      if (isOpen(start) && !overlapsBusy(sISO, eISO)) {
        results.push({ start: sISO, end: eISO, timezone: tz });
      }

      cursor.setMinutes(cursor.getMinutes() + stepMinutes);
      cursor.setSeconds(0,0);
    }

    res.json({ ok:true, slots: results });
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
    const dur = Number.isFinite(+durationMin) ? +durationMin : (client?.bookingDefaultDurationMin || 30);
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

    // Create event
    const summary = `${service} — ${lead.name}`;
    const description = [
      `Service: ${service}`,
      `Lead: ${lead.name}`,
      lead.phone ? `Phone: ${lead.phone}` : null,
      lead.id ? `Lead ID: ${lead.id}` : null,
      `Booked via AI Booking MVP`
    ].filter(Boolean).join('\n');

    const attendees = [];
    if (lead.email && typeof lead.email === 'string' && lead.email.includes('@')) {
      attendees.push(lead.email);
    }

    const event = await insertEvent({
      auth,
      calendarId,
      summary,
      description,
      startIso: startISO,
      endIso: endISO,
      timezone: tz,
      attendees
    });

    return res.status(201).json({
      ok: true,
      event: {
        id: event.id,
        htmlLink: event.htmlLink,
        status: event.status,
        start: event.start,
        end: event.end,
        summary: event.summary,
        creator: event.creator,
        organizer: event.organizer
      },
      tenant: {
        clientKey: client?.clientKey || null,
        calendarId,
        timezone: tz
      }
    });
  } catch (err) {
    return res.status(500).json({ ok:false, error: String(err) });
  }
});

// Twilio delivery receipts
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

// Outbound lead webhook → Vapi
const VAPI_URL = 'https://api.vapi.ai';
const VAPI_PRIVATE_KEY     = process.env.VAPI_PRIVATE_KEY || '';
const VAPI_ASSISTANT_ID    = process.env.VAPI_ASSISTANT_ID || '';
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID || '';

app.post('/webhooks/new-lead/:clientKey', async (req, res) => {
  try {
    const { clientKey } = req.params;
    const client = await getClientByKey(clientKey);
    if (!client) return res.status(404).json({ error: `Unknown clientKey ${clientKey}` });

    const { phone, service, durationMin } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'Missing phone' });
    const e164 = normalizePhone(phone);
    if (!isE164(e164)) return res.status(400).json({ error: 'phone must be E.164 (+447...)' });
    if (!(VAPI_PRIVATE_KEY && VAPI_ASSISTANT_ID && VAPI_PHONE_NUMBER_ID)) {
      return res.status(500).json({ error: 'Missing Vapi env: VAPI_PRIVATE_KEY, VAPI_ASSISTANT_ID, VAPI_PHONE_NUMBER_ID' });
    }

    const resp = await fetch(`${VAPI_URL}/call`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assistantId: VAPI_ASSISTANT_ID,
        phoneNumberId: VAPI_PHONE_NUMBER_ID,
        customer: { number: e164, numberE164CheckEnabled: true },
        assistantOverrides: {
          variableValues: {
            ClientKey: clientKey,
            BusinessName: client.displayName || client.clientKey,
            ConsentLine: 'This call may be recorded for quality.',
            DefaultService: service || '',
            DefaultDurationMin: durationMin || client?.bookingDefaultDurationMin || 30
          }
        }
      })
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
    const tz = pickTimezone(client);
    const calendarId = pickCalendarId(client);

    const { service, startPref, durationMin, lead, attendeeEmails } = req.body || {};
    if (!service || typeof service !== 'string') return res.status(400).json({ error: 'Missing service' });
    const dur = (typeof durationMin === 'number' && durationMin > 0)
      ? durationMin
      : (client?.bookingDefaultDurationMin || 30);
    if (!lead?.name || !lead?.phone) return res.status(400).json({ error: 'Missing lead{name, phone}' });
    lead.phone = normalizePhone(lead.phone);
    if (!isE164(lead.phone)) return res.status(400).json({ error: 'lead.phone must be E.164' });

    const base = new Date(Date.now() + 24 * 60 * 60 * 1000);
    base.setHours(14, 0, 0, 0);
    const startISO = base.toISOString();
    const endISO = new Date(base.getTime() + dur * 60 * 1000).toISOString();

    let google = { skipped: true };
    try {
      if (GOOGLE_CLIENT_EMAIL && (GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY_B64) && calendarId) {
        const auth = makeJwtAuth({ clientEmail: GOOGLE_CLIENT_EMAIL, privateKey: GOOGLE_PRIVATE_KEY, privateKeyB64: GOOGLE_PRIVATE_KEY_B64 });
        await auth.authorize();
        const summary = `${service} — ${lead.name || lead.phone}`;
        const description = [
          `Auto-booked by AI agent`,
          `Tenant: ${client?.clientKey || 'default'}`,
          `Name: ${lead.name}`,
          `Phone: ${lead.phone}`,
          lead.email ? `Email: ${lead.email}` : null,
          startPref ? `Start preference: ${startPref}` : null
        ].filter(Boolean).join('\n');

        const event = await withRetry(() => insertEvent({
          auth, calendarId, summary, description,
          startIso: startISO, endIso: endISO, timezone: tz,
          attendees: Array.isArray(attendeeEmails) ? attendeeEmails : []
        }), { retries: 2, delayMs: 300 });

        google = { id: event.id, htmlLink: event.htmlLink, status: event.status };
      }
    } catch (err) {
      console.error(JSON.stringify({ evt: 'gcal.error', rid: req.id, error: String(err) }));
      google = { error: String(err) };
    }

    let sms = null;
    const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
    if (configured) {
      const when = new Date(startISO).toLocaleString('en-GB', {
        timeZone: tz, weekday: 'short', day: 'numeric', month: 'short',
        hour: 'numeric', minute: '2-digit', hour12: true
      });
      const link = google?.htmlLink ? ` Calendar: ${google.htmlLink}` : '';
      const tenantName = client?.displayName || client?.clientKey || 'Our Clinic';
      const body = `Hi ${lead.name}, your ${service} is booked with ${tenantName} for ${when} ${tz}.${link} Reply STOP to opt out.`;

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
      lead_id: lead.id || null,
      tenant: client?.clientKey || null,
      status: 'booked',
      disposition: 'booked',
      booking: { start: startISO, end: endISO, service, startPref: startPref || null, google, sms },
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

// === Consent ===
app.post('/api/leads/consent', async (req, res) => {
  const { leadId, phone } = req.body || {};
  if (!leadId && !phone) return res.status(400).json({ ok:false, error: 'leadId or phone required' });
  const leads = await readJson(LEADS_PATH, []);
  const e164 = phone ? normalizePhone(phone) : null;
  const idx = leads.findIndex(l => (leadId && l.id === leadId) || (e164 && l.phone === e164));
  if (idx < 0) return res.status(404).json({ ok:false, error: 'lead not found' });
  leads[idx].consentSms = true;
  await writeJson(LEADS_PATH, leads);
  res.json({ ok:true, leadId: leads[idx].id, consentSms: true });
});

// === Notify (manual SMS) with consent gating ===
app.post('/api/notify/send', async (req, res) => {
  const idemKey = deriveIdemKey(req);
  const cached = getCachedIdem(idemKey);
  if (cached) return res.status(cached.status).json(cached.body);

  const client = await getClientFromHeader(req);
  const { smsClient, messagingServiceSid, fromNumber, configured } = smsConfig(client);
  const { channel, to, message, type = 'transactional' } = req.body || {};

  if (!channel || !to || !message) {
    const status = 400, body = { error: 'Missing channel, to, message' };
    setCachedIdem(idemKey, status, body);
    return res.status(status).json(body);
  }
  if (channel !== 'sms') {
    const status = 200, body = { sent: true, id: 'stub', channel };
    setCachedIdem(idemKey, status, body);
    return res.status(status).json(body);
  }

  const cleanTo = normalizePhone(to);
  if (!isE164(cleanTo)) {
    const status = 400, body = { error: 'to must be E.164 (+447...)' };
    setCachedIdem(idemKey, status, body);
    return res.status(status).json(body);
  }
  if (!configured) {
    const status = 400, body = { error: 'SMS not configured for tenant' };
    setCachedIdem(idemKey, status, body);
    return res.status(status).json(body);
  }

  // Marketing SMS requires prior consent
  if (String(type) !== 'transactional') {
    const leads = await readJson(LEADS_PATH, []);
    const lead = leads.find(l => l.phone === cleanTo);
    if (!lead?.consentSms) {
      const status = 403, body = { sent: false, error: 'consent_required' };
      setCachedIdem(idemKey, status, body);
      return res.status(status).json(body);
    }
  }

  try {
    const brand =
      (client?.displayName && String(client.displayName).trim()) ||
      (req.get('X-Client-Key') || '') ||
      (client?.clientKey && String(client.clientKey)) ||
      'Our Clinic';
    const branded = `${brand}: ${message}`;

    const payload = { to: cleanTo, body: branded };
    if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid;
    else payload.from = fromNumber;

    const resp = await withRetry(() => smsClient.messages.create(payload), { retries: 2, delayMs: 300 });

    const out = { sent: true, id: resp.sid, to: cleanTo, channel: 'sms', tenant: client?.clientKey || 'default', status: resp.status };
    setCachedIdem(idemKey, 200, out);
    return res.json(out);
  } catch (err) {
    const status = 503, body = { sent: false, error: String(err) };
    setCachedIdem(idemKey, status, body);
    return res.status(status).json(body);
  }
});

// === Sequences (kept as-is; writes to JSON log)
app.post('/api/notify/sequence', async (req, res) => {
  const tenant = (req.get('X-Client-Key') || '').trim();
  const { to, name, steps, type = 'marketing' } = req.body || {};
  if (!tenant || !to || !Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ ok:false, error: 'tenant header, to, steps required' });
  }
  const e164 = normalizePhone(to);
  if (!isE164(e164)) return res.status(400).json({ ok:false, error:'to must be E.164' });

  const rendered = steps.map(s => ({
    at: new Date(s.at || Date.now()).toISOString(),
    message: String(s.message || '').replaceAll('{{name}}', name || 'there')
  }));

  const jobs = await readJson(JOBS_PATH, []);
  const job = { id: 'job_'+nanoid(10), tenant, to: e164, type, steps: rendered, status: 'queued' };
  jobs.push(job); await writeJson(JOBS_PATH, jobs);
  res.json({ ok:true, job });
});

setInterval(async () => {
  try {
    const now = Date.now();
    const jobs = await readJson(JOBS_PATH, []);
    let changed = false;

    for (const job of jobs) {
      if (job.status === 'completed' || 'cancelled') {/* continue when either */}
      if (job.status === 'completed' || job.status === 'cancelled') continue;
      for (const step of job.steps) {
        if (step.sent) continue;
        if (new Date(step.at).getTime() > now) continue;

        const body = { channel: 'sms', to: job.to, message: step.message, type: job.type };
        try {
          await fetch(`http://localhost:${PORT}/api/notify/send`, {
            method: 'POST',
            headers: {
              'Content-Type':'application/json',
              'X-API-Key': API_KEY,
              'X-Client-Key': job.tenant,
              'Idempotency-Key': `job:${job.id}:${step.at}`
            },
            body: JSON.stringify(body)
          });
          step.sent = true;
          step.sentAt = new Date().toISOString();
          changed = true;
        } catch (e) {
          step.error = String(e);
          changed = true;
        }
      }
      if (job.steps.every(s => s.sent)) job.status = 'completed';
    }

    if (changed) await writeJson(JOBS_PATH, jobs);
  } catch {}
}, 60_000);

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

  const rows = await listClients();
  for (const r of rows) agg[r.clientKey] ||= { bookings7: 0, bookings30: 0, smsSent7: 0, smsSent30: 0 };

  res.json({ ok: true, tenants: agg });
});

// Clients API (DB-backed)
app.get('/api/clients', async (_req, res) => {
  try {
    const rows = await listClients();
    res.json({ ok: true, count: rows.length, clients: rows });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e) });
  }
});

app.get('/api/clients/:key', async (req, res) => {
  try {
    const c = await getClientByKey(req.params.key);
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
    await upsertClient(c);
    return res.json({ ok: true, client: { clientKey: key, displayName: c.displayName || key, booking: { timezone: tz, defaultDurationMin: c.booking?.defaultDurationMin ?? 30 } } });
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

await bootstrapClients(); // <--- run after routes loaded & DB ready

app.listen(PORT, () => {
  console.log(`AI Booking MVP listening on http://localhost:${PORT} (DB: ${DB_PATH})`);
});
