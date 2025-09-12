// server.js — AI Booking MVP (multi-tenant + stats + clients API, branded SMS)
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
import fetch from 'node-fetch';
import { createHash } from 'crypto';

import { makeJwtAuth, insertEvent, listUpcoming } from './gcal.js';

const app = express();
const PORT = process.env.PORT || 3000;
const ORIGIN = process.env.VAPI_ORIGIN || '*';
const API_KEY = process.env.API_KEY || '';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const DATA_DIR   = path.join(__dirname, 'data');
const LEADS_PATH = path.join(DATA_DIR, 'leads.json');
const CALLS_PATH = path.join(DATA_DIR, 'calls.json');
const SMS_STATUS_PATH = path.join(DATA_DIR, 'sms-status.json');
const CLIENTS_PATH = path.join(__dirname, 'clients.json');

// === Env: Google (defaults if client not specified)
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL || '';
const GOOGLE_PRIVATE_KEY  = process.env.GOOGLE_PRIVATE_KEY  || '';
const GOOGLE_CALENDAR_ID  = process.env.GOOGLE_CALENDAR_ID  || 'primary';
const TIMEZONE            = process.env.TZ || process.env.TIMEZONE || 'Europe/London';

// === Env: Twilio (account creds are global; sender is per-tenant when provided)
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
  for (const p of [LEADS_PATH, CALLS_PATH, SMS_STATUS_PATH]) {
    try { await fs.access(p); } catch { await fs.writeFile(p, '[]', 'utf8'); }
  }
  // clients.json optional; if missing, we operate in single-tenant env mode
}

async function readJson(p, fallback = null) {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return fallback; }
}
async function writeJson(p, data) { await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf8'); }

// Helpers
const isE164 = (s) => typeof s === 'string' && /^\+\d{7,15}$/.test(s);
const normalizePhone = s => (s || '').trim().replace(/[^\d+]/g, '');

// === Clients loader (cached with simple 5s ttl)
let clientsCache = { at: 0, map: new Map() };
async function loadClientsMap() {
  const now = Date.now();
  if (now - clientsCache.at < 5000 && clientsCache.map.size) return clientsCache.map;
  const arr = await readJson(CLIENTS_PATH, []);
  const map = new Map();
  for (const c of Array.isArray(arr) ? arr : []) {
    if (c?.clientKey) map.set(String(c.clientKey), c);
  }
  clientsCache = { at: now, map };
  return map;
}
async function readClientsArray() {
  const arr = await readJson(CLIENTS_PATH, []);
  return Array.isArray(arr) ? arr : [];
}
async function writeClientsArray(arr) {
  await writeJson(CLIENTS_PATH, arr);
  clientsCache = { at: 0, map: new Map() }; // bust cache
}

async function getClient(req) {
  const key = req.get('X-Client-Key') || null;
  if (!key) return null;
  const map = await loadClientsMap();
  return map.get(key) || null;
}

function pickTimezone(client) {
  return client?.booking?.timezone || TIMEZONE;
}
function pickCalendarId(client) {
  return client?.calendarId || GOOGLE_CALENDAR_ID;
}
function smsConfig(client) {
  // Returns { messagingServiceSid, fromNumber, smsClient, configured }
  const messagingServiceSid = client?.sms?.messagingServiceSid || TWILIO_MESSAGING_SERVICE_SID || null;
  const fromNumber = client?.sms?.fromNumber || TWILIO_FROM_NUMBER || null;
  const smsClient = defaultSmsClient; // single account auth
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
function setCachedIdem(key, status, body) { idemCache.set(key, { at: Date.now(), status, body }); }
function deriveIdemKey(req) {
  const headerKey = req.get('Idempotency-Key');
  if (headerKey) return headerKey;
  const h = createHash('sha256').update(JSON.stringify(req.body || {})).digest('hex');
  return 'auto:' + h;
}

// API key guard (skip for health, gcal ping, Twilio webhook)
function requireApiKey(req, res, next) {
  if (req.method === 'GET' && (req.path === '/health' || req.path === '/gcal/ping')) return next();
  if (req.path.startsWith('/webhooks/twilio-status')) return next();
  if (!API_KEY) return res.status(500).json({ error: 'Server missing API_KEY' });
  const key = req.get('X-API-Key');
  if (key && key === API_KEY) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}
app.use(requireApiKey);

// Retry
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

// Health
app.get('/health', async (_req, res) => {
  const map = await loadClientsMap();
  res.json({
    ok: true,
    service: 'ai-booking-mvp',
    time: new Date().toISOString(),
    gcalConfigured: !!(GOOGLE_CLIENT_EMAIL && GOOGLE_PRIVATE_KEY && GOOGLE_CALENDAR_ID),
    smsConfigured: defaultSmsConfigured,
    corsOrigin: ORIGIN === '*' ? 'any' : ORIGIN,
    tenants: Array.from(map.keys())
  });
});

// GCal diagnostics
app.get('/gcal/ping', async (_req, res) => {
  try {
    if (!(GOOGLE_CLIENT_EMAIL && GOOGLE_PRIVATE_KEY && GOOGLE_CALENDAR_ID)) {
      return res.status(400).json({ ok: false, error: 'Missing GOOGLE_* env vars' });
    }
    const auth = makeJwtAuth({ clientEmail: GOOGLE_CLIENT_EMAIL, privateKey: GOOGLE_PRIVATE_KEY });
    await auth.authorize();
    const items = await listUpcoming({ auth, calendarId: GOOGLE_CALENDAR_ID, maxResults: 5 });
    res.json({ ok: true, upcomingCount: items.length, sample: items.map(e => ({ id: e.id, summary: e.summary })) });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
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

// Outbound lead webhook
app.post('/webhooks/new-lead', async (req, res) => {
  const { name, phone, email, service } = req.body || {};
  if (!name || !phone || !service || !isE164(normalizePhone(phone))) {
    return res.status(400).json({ error: 'Missing/invalid: name, phone (E.164), service' });
  }
  const lead = { id: 'lead_' + nanoid(8), name, phone: normalizePhone(phone), email: email || null, service, created_at: new Date().toISOString() };
  const leads = await readJson(LEADS_PATH, []); leads.push(lead); await writeJson(LEADS_PATH, leads);
  return res.status(202).json({ received: true, lead });
});

// Booking route (tenant-aware) with auto-SMS (BRANDED)
app.post('/api/calendar/check-book', async (req, res) => {
  const idemKey = deriveIdemKey(req);
  const cached = getCachedIdem(idemKey);
  if (cached) return res.status(cached.status).json(cached.body);

  try {
    const client = await getClient(req);
    const tz = pickTimezone(client);
    const calendarId = pickCalendarId(client);

    const { service, startPref, durationMin, lead, attendeeEmails } = req.body || {};
    if (!service || typeof service !== 'string') return res.status(400).json({ error: 'Missing service' });
    const dur = (typeof durationMin === 'number' && durationMin > 0)
      ? durationMin
      : (client?.booking?.defaultDurationMin || 30);
    if (!lead?.name || !lead?.phone) return res.status(400).json({ error: 'Missing lead{name, phone}' });
    lead.phone = normalizePhone(lead.phone);
    if (!isE164(lead.phone)) return res.status(400).json({ error: 'lead.phone must be E.164' });

    // Choose a slot: tomorrow at 14:00 in server time (reported in tenant tz)
    const base = new Date(Date.now() + 24 * 60 * 60 * 1000);
    base.setHours(14, 0, 0, 0);
    const startISO = base.toISOString();
    const endISO = new Date(base.getTime() + dur * 60 * 1000).toISOString();

    // Insert event with retries
    let google = { skipped: true };
    try {
      if (GOOGLE_CLIENT_EMAIL && GOOGLE_PRIVATE_KEY && calendarId) {
        const auth = makeJwtAuth({ clientEmail: GOOGLE_CLIENT_EMAIL, privateKey: GOOGLE_PRIVATE_KEY });
        await auth.authorize();
        const summary = `${service} — ${lead.name || lead.phone}`;
        const description = [
          `Auto-booked by AI agent`,
          `Tenant: ${client?.clientKey || 'default'}`,
          `Name: ${lead.name}`,
          `Phone: ${lead.phone}`,
          lead.email ? `Email: ${lead.email}` : null,
          startPref ? `Start preference: ${startPref}` : null
        ].filter(Boolean).join('\\n');

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

    // Auto-SMS confirmation (tenant-aware sender, BRANDED)
    let sms = null;
    const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
    if (configured) {
      const when = new Date(startISO).toLocaleString('en-GB', {
        timeZone: tz,
        weekday: 'short', day: 'numeric', month: 'short',
        hour: 'numeric', minute: '2-digit', hour12: true
      });
      const link = google?.htmlLink ? ` Calendar: ${google.htmlLink}` : '';
      const tenantName = client?.displayName || 'Our Clinic';
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

// Manual SMS (tenant-aware)
app.post('/api/notify/send', async (req, res) => {
  const idemKey = deriveIdemKey(req);
  const cached = getCachedIdem(idemKey);
  if (cached) return res.status(cached.status).json(cached.body);

  const client = await getClient(req);
  const { smsClient, messagingServiceSid, fromNumber, configured } = smsConfig(client);
  const { channel, to, message } = req.body || {};

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

  try {
    const brand = client?.displayName || client?.clientKey || 'Our Clinic';
    const branded = `${brand}: ${message}`;

    const payload = { to: cleanTo, body: branded };
    if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid;
    else payload.from = fromNumber;

    const resp = await withRetry(() => smsClient.messages.create(payload), { retries: 2, delayMs: 300 });
    setCachedIdem(idemKey, 200, out);
  } catch (err) {
    const status = 503, body = { sent: false, error: String(err) };
    setCachedIdem(idemKey, status, body);
    return res.status(status).json(body);
  }
});
// --- /api/stats: bookings + sms counts per tenant (last 7 & 30 days)
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
    const t = e.tenant || 'default'; // (we can improve tagging later)
    const ts = new Date(e.at || Date.now()).getTime();
    const ok = ['accepted','queued','sent','delivered'].includes(e.status);
    if (!ok) continue;
    agg[t] ||= { bookings7: 0, bookings30: 0, smsSent7: 0, smsSent30: 0 };
    if (within(ts, 7))  agg[t].smsSent7++;
    if (within(ts, 30)) agg[t].smsSent30++;
  }

  const map = await loadClientsMap();
  for (const k of map.keys()) agg[k] ||= { bookings7: 0, bookings30: 0, smsSent7: 0, smsSent30: 0 };

  res.json({ ok: true, tenants: agg });
});

// --- Basic Clients CRUD (file-based)
app.get('/api/clients', async (_req, res) => {
  const arr = await readClientsArray();
  res.json({ ok: true, count: arr.length, clients: arr });
});

app.post('/api/clients', async (req, res) => {
  const c = req.body || {};
  const key = (c.clientKey || '').toString().trim();
  if (!key) return res.status(400).json({ error: 'clientKey is required' });

  // minimal validation
  const tz = c.booking?.timezone || TIMEZONE;
  if (typeof tz !== 'string' || !tz.length) return res.status(400).json({ error: 'booking.timezone is required' });

  // sms block optional, but if provided must have one sender
  if (c.sms && !(c.sms.messagingServiceSid || c.sms.fromNumber)) {
    return res.status(400).json({ error: 'sms.messagingServiceSid or sms.fromNumber required when sms block present' });
  }

  const arr = await readClientsArray();
  const idx = arr.findIndex(x => x.clientKey === key);
  if (idx >= 0) arr[idx] = { ...arr[idx], ...c };
  else arr.push(c);

  await writeClientsArray(arr);
  res.json({ ok: true, client: c });
});

app.delete('/api/clients/:key', async (req, res) => {
  const key = req.params.key;
  const arr = await readClientsArray();
  const next = arr.filter(c => c.clientKey !== key);
  await writeClientsArray(next);
  res.json({ ok: true, deleted: arr.length - next.length });
});

// GDPR delete by phone
app.get('/gdpr/delete', async (req, res) => {
  const phone = normalizePhone(req.query.phone);
  if (!phone || !isE164(phone)) return res.status(400).json({ error: 'phone (E.164) is required' });
  const leads = await readJson(LEADS_PATH, []);
  const calls = await readJson(CALLS_PATH, []);
  const leadsAfter = leads.filter(l => l.phone !== phone);
  const callsAfter = calls.filter(c => (c.contact?.phone || '') !== phone);
  await writeJson(LEADS_PATH, leadsAfter);
  await writeJson(CALLS_PATH, callsAfter);
  return res.json({ deleted: { leads: leads.length - leadsAfter.length, calls: calls.length - callsAfter.length } });
});

await ensureDataFiles();
app.listen(PORT, () => {
  console.log(`AI Booking MVP listening on http://localhost:${PORT}`);
});

// === Vapi outbound call (tenant-aware) ===
const VAPI_URL = 'https://api.vapi.ai';
const VAPI_PRIVATE_KEY   = process.env.VAPI_PRIVATE_KEY || '';
const VAPI_ASSISTANT_ID  = process.env.VAPI_ASSISTANT_ID || '';
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID || '';

app.post('/webhooks/new-lead/:clientKey', async (req, res) => {
  try {
    const { clientKey } = req.params;
    const map = await loadClientsMap();
    const client = map.get(clientKey);
    if (!client) return res.status(404).json({ error: `Unknown clientKey ${clientKey}` });

    const { name, phone, email, service, durationMin } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'Missing phone' });
    const e164 = normalizePhone(phone);
    if (!isE164(e164)) return res.status(400).json({ error: 'phone must be E.164 (+447...)' });
    if (!(VAPI_PRIVATE_KEY && VAPI_ASSISTANT_ID && VAPI_PHONE_NUMBER_ID)) {
      return res.status(500).json({ error: 'Missing Vapi env: VAPI_PRIVATE_KEY, VAPI_ASSISTANT_ID, VAPI_PHONE_NUMBER_ID' });
    }

    const resp = await fetch(`${VAPI_URL}/call`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        assistantId: VAPI_ASSISTANT_ID,
        phoneNumberId: VAPI_PHONE_NUMBER_ID,
        customer: { number: e164, numberE164CheckEnabled: true },
        assistantOverrides: {
          variableValues: {
            ClientKey: clientKey,
            BusinessName: client.displayName || client.businessName || clientKey,
            ConsentLine: 'This call may be recorded for quality.',
            DefaultService: service || '',
            DefaultDurationMin: durationMin || client?.booking?.defaultDurationMin || 30
          }
        }
      })
    });

    const data = await resp.json();
    return res.status(resp.ok ? 200 : 502).json(data);
  } catch (err) {
    console.error('new-lead vapi error', err);
    return res.status(500).json({ error: String(err) });
  }
});

