// server.js - AI Booking MVP (with Google Calendar + Twilio SMS)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import twilio from 'twilio';

import { makeJwtAuth, insertEvent, listUpcoming } from './gcal.js';

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// --- Cross-platform path handling
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const DATA_DIR   = path.join(__dirname, 'data');
const LEADS_PATH = path.join(DATA_DIR, 'leads.json');
const CALLS_PATH = path.join(DATA_DIR, 'calls.json');

async function ensureDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try { await fs.access(LEADS_PATH); } catch { await fs.writeFile(LEADS_PATH, '[]', 'utf8'); }
  try { await fs.access(CALLS_PATH); } catch { await fs.writeFile(CALLS_PATH, '[]', 'utf8'); }
}

async function readJson(p) {
  const raw = await fs.readFile(p, 'utf8').catch(() => '[]');
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

async function writeJson(p, data) {
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf8');
}

// === Google Calendar env ===
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL || '';
const GOOGLE_PRIVATE_KEY  = process.env.GOOGLE_PRIVATE_KEY  || '';
const GOOGLE_CALENDAR_ID  = process.env.GOOGLE_CALENDAR_ID  || 'primary';
const TIMEZONE            = process.env.TZ || process.env.TIMEZONE || 'Europe/London';

// === Twilio env ===
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN  || '';
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || '';
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID || '';
const twilioEnabled = !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && (TWILIO_FROM_NUMBER || TWILIO_MESSAGING_SERVICE_SID));
const smsClient = (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;

// --- Health
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ai-booking-mvp',
    time: new Date().toISOString(),
    gcalConfigured: !!(GOOGLE_CLIENT_EMAIL && GOOGLE_PRIVATE_KEY && GOOGLE_CALENDAR_ID),
    smsConfigured: twilioEnabled
  });
});

// --- Optional diagnostics for Google Calendar
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

// --- Vapi outbound helper (REAL call)
async function startOutboundCall(lead) {
  const apiKey = process.env.VAPI_PRIVATE_KEY;
  const assistantId = process.env.VAPI_ASSISTANT_ID;

  if (!apiKey || !assistantId) {
    console.warn('[VAPI] Missing VAPI_PRIVATE_KEY or VAPI_ASSISTANT_ID — skipping outbound call');
    return { skipped: true, reason: 'missing_env' };
  }

  const body = {
    assistantId,
    phoneNumber: lead.phone,
    customer: {
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      service: lead.service
    },
    assistantOverrides: {
      variableValues: {
        BusinessName: process.env.BUSINESS_NAME || 'Default Clinic',
        ConsentLine: process.env.CONSENT_LINE || 'This call may be recorded for quality.'
      }
    }
  };

  const resp = await fetch('https://api.vapi.ai/call', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`[VAPI] Outbound call failed: ${resp.status} ${resp.statusText} ${text}`);
  }
  return resp.json();
}

// 1) Webhook: new lead → persist + trigger outbound Vapi call
app.post('/webhooks/new-lead', async (req, res) => {
  const { name, phone, email, service } = req.body || {};
  if (!name || !phone || !service) {
    return res.status(400).json({ error: 'Missing required fields: name, phone, service' });
  }

  const lead = {
    id: 'lead_' + nanoid(8),
    name, phone, email: email || null, service,
    created_at: new Date().toISOString()
  };

  const leads = await readJson(LEADS_PATH);
  leads.push(lead);
  await writeJson(LEADS_PATH, leads);

  let callResp = null;
  try {
    callResp = await startOutboundCall(lead);
    console.log('[VAPI] Outbound call started:', callResp);
  } catch (err) {
    console.error(err.message);
    callResp = { error: err.message };
  }

  return res.status(202).json({ received: true, lead, call: callResp });
});

// 2) Tool: calendar.checkAndBook (writes to Google Calendar)
app.post('/api/calendar/check-book', async (req, res) => {
  try {
    const { service, startPref, durationMin, lead, attendeeEmails } = req.body || {};
    if (!service || !durationMin || !lead?.name || !lead?.phone) {
      return res.status(400).json({ error: 'Missing required fields: service, durationMin, lead{name,phone}' });
    }

    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    tomorrow.setHours(14, 0, 0, 0);

    const startISO = tomorrow.toISOString();
    const endISO = new Date(tomorrow.getTime() + (durationMin || 30) * 60 * 1000).toISOString();

    let google = { skipped: true };
    if (GOOGLE_CLIENT_EMAIL && GOOGLE_PRIVATE_KEY && GOOGLE_CALENDAR_ID) {
      try {
        const auth = makeJwtAuth({ clientEmail: GOOGLE_CLIENT_EMAIL, privateKey: GOOGLE_PRIVATE_KEY });
        await auth.authorize();

        const summary = `${service} — ${lead.name || lead.phone}`;
        const description = [
          `Auto-booked by AI agent`,
          `Name: ${lead.name}`,
          `Phone: ${lead.phone}`,
          lead.email ? `Email: ${lead.email}` : null,
          startPref ? `Start preference: ${startPref}` : null
        ].filter(Boolean).join('\\n');

        const event = await insertEvent({
          auth,
          calendarId: GOOGLE_CALENDAR_ID,
          summary,
          description,
          startIso: startISO,
          endIso: endISO,
          timezone: TIMEZONE,
          attendees: Array.isArray(attendeeEmails) ? attendeeEmails : []
        });

        google = { id: event.id, htmlLink: event.htmlLink, status: event.status };
      } catch (err) {
        console.error('[GCAL] insert failed:', err);
        google = { error: String(err) };
      }
    }

    const calls = await readJson(CALLS_PATH);
    calls.push({
      id: 'call_' + nanoid(10),
      lead_id: lead.id || null,
      status: 'booked',
      disposition: 'booked',
      booking: { start: startISO, end: endISO, service, startPref: startPref || null, google },
      created_at: new Date().toISOString()
    });
    await writeJson(CALLS_PATH, calls);

    return res.json({ slot: { start: startISO, end: endISO }, google });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// 3) Tool: notify.send (Twilio SMS real send)
app.post('/api/notify/send', async (req, res) => {
  const { channel, to, message } = req.body || {};
  if (!channel || !to || !message) {
    return res.status(400).json({ error: 'Missing required fields: channel, to, message' });
  }

  if (channel !== 'sms') {
    const id = 'msg_' + nanoid(10);
    console.log(`[NOTIFY:STUB:${channel}] → ${to}:`, message);
    return res.json({ sent: true, id, channel });
  }

  if (!twilioEnabled) {
    return res.status(400).json({ error: 'SMS not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID' });
  }

  try {
    const payload = { to, body: message };
    if (TWILIO_MESSAGING_SERVICE_SID) {
      payload.messagingServiceSid = TWILIO_MESSAGING_SERVICE_SID;
    } else {
      payload.from = TWILIO_FROM_NUMBER;
    }

    const resp = await smsClient.messages.create(payload);
    console.log('[SMS] sent', resp.sid, 'to', to);
    return res.json({ sent: true, id: resp.sid, to, channel: 'sms' });
  } catch (err) {
    console.error('[SMS] error:', err);
    return res.status(502).json({ sent: false, error: String(err) });
  }
});

// 4) Tool: crm.upsertLead (stub logger)
app.post('/api/crm/upsert', async (req, res) => {
  const { name, phone, email, disposition } = req.body || {};
  if (!name || !phone || !disposition) {
    return res.status(400).json({ error: 'Missing required fields: name, phone, disposition' });
  }
  const calls = await readJson(CALLS_PATH);
  calls.push({
    id: 'call_' + nanoid(10),
    lead_id: null,
    status: disposition,
    disposition,
    contact: { name, phone, email: email || null },
    created_at: new Date().toISOString()
  });
  await writeJson(CALLS_PATH, calls);
  return res.json({ status: 'logged' });
});

// 5) GDPR delete by phone
app.get('/gdpr/delete', async (req, res) => {
  const phone = req.query.phone;
  if (!phone) return res.status(400).json({ error: 'phone is required' });

  const leads = await readJson(LEADS_PATH);
  const calls = await readJson(CALLS_PATH);

  const leadsAfter = leads.filter(l => l.phone !== phone);
  const callsAfter = calls.filter(c => (c.contact?.phone || '') !== phone);

  await writeJson(LEADS_PATH, leadsAfter);
  await writeJson(CALLS_PATH, callsAfter);

  return res.json({
    deleted: {
      leads: leads.length - leadsAfter.length,
      calls: calls.length - callsAfter.length
    }
  });
});

// --- Boot
await ensureDataFiles();
app.listen(PORT, () => {
  console.log(`AI Booking MVP listening on http://localhost:${PORT}`);
});
