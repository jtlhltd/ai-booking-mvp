// store.js (ESM)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const LEADS_PATH = path.join(DATA_DIR, 'leads.json');
const OPTOUTS_PATH = path.join(DATA_DIR, 'optouts.json');
const CLIENTS_PATH = path.join(__dirname, 'clients.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LEADS_PATH)) fs.writeFileSync(LEADS_PATH, '[]');
if (!fs.existsSync(OPTOUTS_PATH)) fs.writeFileSync(OPTOUTS_PATH, '[]');

function loadJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8') || '[]'); }
function saveJSON(p, v) { fs.writeFileSync(p, JSON.stringify(v, null, 2)); }
function uid() { return 'lead_' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
function nowISO() { return new Date().toISOString(); }

function getTenants() {
  const raw = JSON.parse(fs.readFileSync(CLIENTS_PATH, 'utf8'));
  if (Array.isArray(raw)) return raw;
  if (raw && raw.clients && Array.isArray(raw.clients)) return raw.clients;
  return Object.entries(raw || {}).map(([key, v]) => ({ key, ...v }));
}

export const tenants = {
  findByKey: async (clientKey) => {
    const list = getTenants();
    const t = list.find(x => x.key === clientKey || x.clientKey === clientKey || x.slug === clientKey);
    if (!t) return null;
    return {
      id: t.id || t.key || t.clientKey || t.slug,
      key: t.key || t.clientKey || t.slug,
      name: t.name || t.businessName || t.key || t.clientKey,
      gsheet_id: t.gsheet_id || t.googleSheetId || t.sheetId || null,
      messagingServiceSid: t.messagingServiceSid || t.twilioMessagingServiceSid || null,
      inboundNumber: t.inboundNumber || t.twilioNumber || null,
    };
  }
};

function readLeads() { return loadJSON(LEADS_PATH); }
function writeLeads(arr) { saveJSON(LEADS_PATH, arr); }

export const leads = {
  findByComposite: async (tenantId, phone, service) => {
    return readLeads().find(l => l.tenant_id === tenantId && l.phone === phone && l.service === service) || null;
  },
  create: async (row) => {
    const arr = readLeads();
    const id = uid();
    const rec = { id, created_at: nowISO(), attempts: 0, booked: false, status: 'pending', notes: '', ...row };
    arr.push(rec);
    writeLeads(arr);
    return rec;
  },
  updateSheetRowId: async (leadId, rowId) => {
    const arr = readLeads();
    const i = arr.findIndex(l => l.id === leadId);
    if (i >= 0) { arr[i].sheet_row_id = rowId; writeLeads(arr); }
  },
  findOpenByPhone: async (tenantId, phone) => {
    return readLeads().filter(l => l.tenant_id === tenantId && l.phone === phone && !['booked','declined','failed','opted_out'].includes(l.status));
  },
  markOptedOut: async (leadId) => {
    const arr = readLeads();
    const i = arr.findIndex(l => l.id === leadId);
    if (i >= 0) { arr[i].status = 'opted_out'; writeLeads(arr); }
  },
  updateOnBooked: async (leadId, patch) => {
    const arr = readLeads();
    const i = arr.findIndex(l => l.id === leadId);
    if (i >= 0) { arr[i] = { ...arr[i], ...patch }; writeLeads(arr); }
  },
  getById: async (leadId) => {
    return readLeads().find(l => l.id === leadId) || null;
  }
};

function readOptouts() { return loadJSON(OPTOUTS_PATH); }
function writeOptouts(arr) { saveJSON(OPTOUTS_PATH, arr); }

export const optouts = {
  upsert: async (tenantId, phone) => {
    const arr = readOptouts();
    if (!arr.find(x => x.tenant_id === tenantId && x.phone === phone)) {
      arr.push({ tenant_id: tenantId, phone, created_at: nowISO() });
      writeOptouts(arr);
    }
  },
  exists: async (tenantId, phone) => {
    return !!readOptouts().find(x => x.tenant_id === tenantId && x.phone === phone);
  }
};

export const twilio = {
  mapToTenant: async (messagingServiceSid, toNumber) => {
    const list = getTenants();
    let t = null;
    if (messagingServiceSid) t = list.find(x => x.messagingServiceSid === messagingServiceSid);
    if (!t && toNumber) t = list.find(x => x.inboundNumber === toNumber);
    if (!t) return null;
    return {
      id: t.id || t.key || t.clientKey || t.slug,
      key: t.key || t.clientKey || t.slug,
      name: t.name || t.businessName || t.key || t.clientKey,
      gsheet_id: t.gsheet_id || t.googleSheetId || t.sheetId || null
    };
  }
};

export const contactAttempts = {
  log: async (entry) => {
    const p = path.join(DATA_DIR, 'contact_attempts.log');
    fs.appendFileSync(p, JSON.stringify({ ...entry, ts: nowISO() }) + '\n');
  }
};
