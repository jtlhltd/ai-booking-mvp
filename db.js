// db.js — ESM SQLite helpers for tenants (clients)
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
    db.run(`
      CREATE TABLE IF NOT EXISTS clients (
        clientKey TEXT PRIMARY KEY,
        displayName TEXT,
        bookingTimezone TEXT NOT NULL,
        bookingDefaultDurationMin INTEGER NOT NULL DEFAULT 30,
        smsFrom TEXT,
        smsMessagingServiceSid TEXT,
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
  });
  return db;
}

export const db = openDb();

// --- CRUD helpers ---
export function upsertClient(c) {
  return new Promise((resolve, reject) => {
    const q = `
      INSERT INTO clients (clientKey, displayName, bookingTimezone, bookingDefaultDurationMin, smsFrom, smsMessagingServiceSid)
      VALUES ($clientKey, $displayName, $tz, $dur, $smsFrom, $mss)
      ON CONFLICT(clientKey) DO UPDATE SET
        displayName=excluded.displayName,
        bookingTimezone=excluded.bookingTimezone,
        bookingDefaultDurationMin=excluded.bookingDefaultDurationMin,
        smsFrom=excluded.smsFrom,
        smsMessagingServiceSid=excluded.smsMessagingServiceSid
    `;
    db.run(q, {
      $clientKey: c.clientKey,
      $displayName: c.displayName || c.businessName || c.clientKey,
      $tz: c.booking?.timezone,
      $dur: c.booking?.defaultDurationMin ?? 30,
      $smsFrom: c.sms?.fromNumber || null,
      $mss: c.sms?.messagingServiceSid || null
    }, function(err) {
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
