// db.js — ESM SQLite helpers for tenants (clients) with auto-migrations
import fs from 'fs';
import path from 'path';
import sqlite3pkg from 'sqlite3';

const sqlite3 = sqlite3pkg.verbose();

const DATA_DIR = path.join(process.cwd(), 'data');
export const DB_PATH = path.join(DATA_DIR, 'app.db');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function openDb() {
  ensureDataDir();
  const db = new sqlite3.Database(DB_PATH);
  db.serialize(() => {
    // Base table (original columns)
    db.run(`
      CREATE TABLE IF NOT EXISTS clients (
        clientKey TEXT PRIMARY KEY,
        displayName TEXT,
        bookingTimezone TEXT NOT NULL,
        bookingDefaultDurationMin INTEGER NOT NULL DEFAULT 30,
        smsFrom TEXT,
        smsMessagingServiceSid TEXT,
        -- new richer/optional columns (added via auto-migrations below)
        calendarId TEXT,
        attendeeEmailsJson TEXT,
        vapiAssistantId TEXT,
        vapiPhoneNumberId TEXT,
        servicesJson TEXT,
        pricesJson TEXT,
        hoursJson TEXT,
        closedDatesJson TEXT,
        faqJson TEXT,
        minNoticeMin INTEGER,
        maxAdvanceDays INTEGER,
        locale TEXT,
        brandSignature TEXT,
        scriptHints TEXT,
        currency TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(displayName)`);
    db.run(`CREATE TRIGGER IF NOT EXISTS trg_clients_updated
      AFTER UPDATE ON clients
      BEGIN
        UPDATE clients SET updatedAt = datetime('now') WHERE clientKey = NEW.clientKey;
      END;`);

    // Auto-migrate: add columns if missing
    db.all(`PRAGMA table_info(clients)`, [], (err, rows) => {
      if (err) return;
      const have = new Set(rows.map(r => r.name));
      const add = (name, type = 'TEXT') => {
        if (!have.has(name)) db.run(`ALTER TABLE clients ADD COLUMN ${name} ${type}`);
      };
      add('calendarId', 'TEXT');
      add('attendeeEmailsJson', 'TEXT');
      add('vapiAssistantId', 'TEXT');
      add('vapiPhoneNumberId', 'TEXT');
      add('servicesJson', 'TEXT');
      add('pricesJson', 'TEXT');
      add('hoursJson', 'TEXT');
      add('closedDatesJson', 'TEXT');
      add('faqJson', 'TEXT');
      add('minNoticeMin', ' INTEGER');
      add('maxAdvanceDays', ' INTEGER');
      add('locale', 'TEXT');
      add('brandSignature', 'TEXT');
      add('scriptHints', 'TEXT');
      add('currency', 'TEXT');
    });
  });
  return db;
}

export const db = openDb();

function toJson(val) {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  try { return JSON.stringify(val); } catch { return null; }
}

// --- CRUD helpers ---
export function upsertClient(c) {
  return new Promise((resolve, reject) => {
    const q = `
      INSERT INTO clients (
        clientKey, displayName, bookingTimezone, bookingDefaultDurationMin,
        smsFrom, smsMessagingServiceSid,
        calendarId, attendeeEmailsJson,
        vapiAssistantId, vapiPhoneNumberId,
        servicesJson, pricesJson, hoursJson, closedDatesJson, faqJson,
        minNoticeMin, maxAdvanceDays, locale, brandSignature, scriptHints, currency
      )
      VALUES (
        $clientKey, $displayName, $tz, $dur,
        $smsFrom, $mss,
        $calendarId, $attendees,
        $vapiAssistantId, $vapiPhoneNumberId,
        $servicesJson, $pricesJson, $hoursJson, $closedDatesJson, $faqJson,
        $minNoticeMin, $maxAdvanceDays, $locale, $brandSignature, $scriptHints, $currency
      )
      ON CONFLICT(clientKey) DO UPDATE SET
        displayName=excluded.displayName,
        bookingTimezone=excluded.bookingTimezone,
        bookingDefaultDurationMin=excluded.bookingDefaultDurationMin,
        smsFrom=excluded.smsFrom,
        smsMessagingServiceSid=excluded.smsMessagingServiceSid,
        calendarId=excluded.calendarId,
        attendeeEmailsJson=excluded.attendeeEmailsJson,
        vapiAssistantId=excluded.vapiAssistantId,
        vapiPhoneNumberId=excluded.vapiPhoneNumberId,
        servicesJson=excluded.servicesJson,
        pricesJson=excluded.pricesJson,
        hoursJson=excluded.hoursJson,
        closedDatesJson=excluded.closedDatesJson,
        faqJson=excluded.faqJson,
        minNoticeMin=excluded.minNoticeMin,
        maxAdvanceDays=excluded.maxAdvanceDays,
        locale=excluded.locale,
        brandSignature=excluded.brandSignature,
        scriptHints=excluded.scriptHints,
        currency=excluded.currency
    `;

    const params = {
      $clientKey: c.clientKey,
      $displayName: c.displayName || c.businessName || c.clientKey,
      $tz: c.booking?.timezone || c.timezone || 'Europe/London',
      $dur: c.booking?.defaultDurationMin ?? 30,
      $smsFrom: c.sms?.fromNumber || null,
      $mss: c.sms?.messagingServiceSid || null,
      $calendarId: c.calendarId || null,
      $attendees: toJson(c.attendeeEmails),
      $vapiAssistantId: c.voice?.vapiAssistantId || c.vapiAssistantId || null,
      $vapiPhoneNumberId: c.voice?.vapiPhoneNumberId || c.vapiPhoneNumberId || null,
      $servicesJson: toJson(c.services),
      $pricesJson: toJson(c.prices),
      $hoursJson: toJson(c.booking?.hours ?? c.hours),
      $closedDatesJson: toJson(c.closedDates),
      $faqJson: toJson(c.faq),
      $minNoticeMin: Number.isFinite(+c.booking?.minNoticeMin) ? +c.booking.minNoticeMin : null,
      $maxAdvanceDays: Number.isFinite(+c.booking?.maxAdvanceDays) ? +c.booking.maxAdvanceDays : null,
      $locale: c.locale || null,
      $brandSignature: c.brandSignature || null,
      $scriptHints: c.scriptHints || null,
      $currency: c.currency || null
    };

    db.run(q, params, function(err) {
      if (err) return reject(err);
      resolve({ changes: this.changes });
    });
  });
}

export function getClientByKey(clientKey) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM clients WHERE clientKey = ?`, [clientKey], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

export function listClients() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT clientKey, displayName FROM clients ORDER BY clientKey`, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

export function deleteClient(clientKey) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM clients WHERE clientKey = ?`, [clientKey], function(err) {
      if (err) return reject(err);
      resolve({ changes: this.changes });
    });
  });
}
