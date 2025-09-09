// server.js - AI Lead Follow-Up & Booking Agent (MVP skeleton) — Windows-safe paths
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// --- Cross-platform path handling (fix for Windows double drive issue)
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
  const raw = await fs.readFile(p, 'utf8');
  return JSON.parse(raw || '[]');
}

async function writeJson(p, data) {
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf8');
}

// --- Health
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'ai-booking-mvp', time: new Date().toISOString() });
});

// 1) Webhook: new lead → trigger outbound agent call (stub)
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

  console.log('[VAPI:OUTBOUND_STUB] Would initiate call to', phone, 'for service:', service);

  return res.status(202).json({ received: true, lead });
});

// 2) Tool: calendar.checkAndBook (stub booking into Google Calendar)
app.post('/api/calendar/check-book', async (req, res) => {
  const { service, startPref, durationMin, lead } = req.body || {};
  if (!service || !durationMin || !lead?.name || !lead?.phone) {
    return res.status(400).json({ error: 'Missing required fields: service, durationMin, lead{name,phone}' });
  }

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24*60*60*1000);
  tomorrow.setHours(14, 0, 0, 0);

  const startISO = tomorrow.toISOString();
  const endISO = new Date(tomorrow.getTime() + (durationMin || 30) * 60 * 1000).toISOString();

  const eventId = 'evt_' + nanoid(10);

  const calls = await readJson(CALLS_PATH);
  calls.push({
    id: 'call_' + nanoid(10),
    lead_id: lead.id || null,
    status: 'booked',
    disposition: 'booked',
    booking: { start: startISO, end: endISO, service, eventId },
    created_at: new Date().toISOString()
  });
  await writeJson(CALLS_PATH, calls);

  return res.json({ slot: { start: startISO, end: endISO }, eventId });
});

// 3) Tool: notify.send (Twilio SMS / SendGrid email stub)
app.post('/api/notify/send', async (req, res) => {
  const { channel, to, message } = req.body || {};
  if (!channel || !to || !message) {
    return res.status(400).json({ error: 'Missing required fields: channel, to, message' });
  }
  if (!['sms','email'].includes(channel)) {
    return res.status(400).json({ error: 'channel must be \"sms\" or \"email\"' });
  }

  const id = 'msg_' + nanoid(10);
  console.log(`[NOTIFY:STUB] ${channel} → ${to}:`, message);

  return res.json({ sent: true, id });
});

// 4) Tool: crm.upsert (local JSON log for MVP)
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
  console.log(`AI Booking MVP skeleton listening on http://localhost:${PORT}`);
});