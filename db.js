// db.js — ESM SQLite helpers for tenants (clients) with full JSON config persistence
// Safe drop-in replacement. Creates missing tables automatically.

import fs from 'fs';
import path from 'path';
import sqlite3pkg from 'sqlite3';

const sqlite3 = sqlite3pkg.verbose();

/**
 * Storage location
 * - Render: set DATA_DIR=/data (persistent disk) or DB_PATH=/data/app.db
 * - Local fallback: ./data/app.db
 */
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
export const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'app.db');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function openDb() {
  ensureDataDir();
  const db = new sqlite3.Database(DB_PATH);
  db.serialize(() => {
    db.run('PRAGMA foreign_keys = ON');

    // Summary table (legacy)
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

    // Full config JSON for each client
    db.run(`
      CREATE TABLE IF NOT EXISTS client_configs (
        clientKey TEXT PRIMARY KEY
          REFERENCES clients(clientKey) ON DELETE CASCADE,
        configJson TEXT NOT NULL
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(displayName)`);

    db.run(`
      CREATE TRIGGER IF NOT EXISTS trg_clients_updated
      AFTER UPDATE ON clients
      BEGIN
        UPDATE clients SET updatedAt = datetime('now') WHERE clientKey = NEW.clientKey;
      END;
    `);
  });
  return db;
}

export const db = openDb();

/** ---------- Helpers ---------- **/

// Legacy summary-only helper
export function upsertClient(c) {
  return new Promise((resolve, reject) => {
    const q = `
      INSERT INTO clients
        (clientKey, displayName, bookingTimezone, bookingDefaultDurationMin, smsFrom, smsMessagingServiceSid)
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
      $tz: c.booking?.timezone ?? 'Europe/London',
      $dur: c.booking?.defaultDurationMin ?? 30,
      $smsFrom: c.sms?.fromNumber || null,
      $mss: c.sms?.messagingServiceSid || null,
    }, function(err) {
      if (err) return reject(err);
      resolve({ changes: this.changes });
    });
  });
}

// Upsert full tenant JSON
export function upsertFullClient(c) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      const q1 = `
        INSERT INTO clients
          (clientKey, displayName, bookingTimezone, bookingDefaultDurationMin, smsFrom, smsMessagingServiceSid)
        VALUES ($clientKey, $displayName, $tz, $dur, $smsFrom, $mss)
        ON CONFLICT(clientKey) DO UPDATE SET
          displayName=excluded.displayName,
          bookingTimezone=excluded.bookingTimezone,
          bookingDefaultDurationMin=excluded.bookingDefaultDurationMin,
          smsFrom=excluded.smsFrom,
          smsMessagingServiceSid=excluded.smsMessagingServiceSid
      `;
      db.run(q1, {
        $clientKey: c.clientKey,
        $displayName: c.displayName || c.businessName || c.clientKey,
        $tz: c.booking?.timezone ?? 'Europe/London',
        $dur: c.booking?.defaultDurationMin ?? 30,
        $smsFrom: c.sms?.fromNumber || null,
        $mss: c.sms?.messagingServiceSid || null,
      }, function(err) {
        if (err) return reject(err);

        const q2 = `
          INSERT INTO client_configs (clientKey, configJson)
          VALUES ($clientKey, $json)
          ON CONFLICT(clientKey) DO UPDATE SET configJson = excluded.configJson
        `;
        db.run(q2, {
          $clientKey: c.clientKey,
          $json: JSON.stringify(c),
        }, function(err2) {
          if (err2) return reject(err2);
          resolve({ changes: this.changes });
        });
      });
    });
  });
}

// Get merged full client object
export function getFullClient(clientKey) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT c.*, cfg.configJson
      FROM clients c
      LEFT JOIN client_configs cfg ON cfg.clientKey = c.clientKey
      WHERE c.clientKey = ?
    `;
    db.get(sql, [clientKey], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(null);
      const cfg = row.configJson ? JSON.parse(row.configJson) : {};
      const base = {
        clientKey: row.clientKey,
        displayName: row.displayName,
        booking: {
          timezone: row.bookingTimezone,
          defaultDurationMin: row.bookingDefaultDurationMin,
        },
        sms: {
          fromNumber: row.smsFrom,
          messagingServiceSid: row.smsMessagingServiceSid,
        },
      };
      resolve({
        ...cfg,
        ...base,
        booking: { ...(cfg.booking || {}), ...base.booking },
        sms:     { ...(cfg.sms || {}),     ...base.sms },
      });
    });
  });
}

// List full clients
export function listFullClients() {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT c.clientKey, c.displayName, cfg.configJson
      FROM clients c
      LEFT JOIN client_configs cfg ON cfg.clientKey = c.clientKey
      ORDER BY c.clientKey
    `;
    db.all(sql, [], (err, rows) => {
      if (err) return reject(err);
      const out = (rows || []).map(r => {
        const cfg = r.configJson ? JSON.parse(r.configJson) : {};
        return { clientKey: r.clientKey, displayName: r.displayName, ...cfg };
      });
      resolve(out);
    });
  });
}

// Legacy getters
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
    db.all(`SELECT * FROM clients ORDER BY clientKey`, [], (err, rows) => {
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
