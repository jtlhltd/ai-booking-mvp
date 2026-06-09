/**
 * Operational incidents — group repeated alerts under one fingerprinted record.
 */
import { query, dbType } from '../db.js';

const SEVERITY_RANK = { info: 0, warning: 1, error: 2, critical: 3 };

const DEFAULT_COOLDOWN_MS = {
  critical: 15 * 60 * 1000,
  error: 30 * 60 * 1000,
  warning: 60 * 60 * 1000,
  info: Number.POSITIVE_INFINITY,
};

/** In-memory fallback when Postgres incidents table is unavailable (tests / sqlite). */
const memoryIncidents = new Map();

export function normalizeIncidentSeverity(raw) {
  const s = String(raw || 'warning').trim().toLowerCase();
  if (s === 'fatal') return 'critical';
  if (SEVERITY_RANK[s] != null) return s;
  return 'warning';
}

export function buildIncidentFingerprint({ fingerprint, dedupeKey, source, title }) {
  const explicit = fingerprint || dedupeKey;
  if (explicit) return String(explicit).trim().slice(0, 240);
  const src = String(source || 'system').trim();
  const ttl = String(title || 'incident').trim().slice(0, 120);
  return `${src}:${ttl}`;
}

function memoryRecord(fingerprint, { title, severity, source, metadata }) {
  const now = Date.now();
  const existing = memoryIncidents.get(fingerprint);
  if (!existing) {
    const row = {
      id: memoryIncidents.size + 1,
      fingerprint,
      title,
      severity,
      status: 'open',
      source,
      event_count: 1,
      first_seen_at: new Date(now).toISOString(),
      last_seen_at: new Date(now).toISOString(),
      last_notified_at: null,
      metadata: metadata || {},
    };
    memoryIncidents.set(fingerprint, row);
    return { row, isNew: true, severityEscalated: true };
  }

  const prevRank = SEVERITY_RANK[existing.severity] ?? 1;
  const nextRank = SEVERITY_RANK[severity] ?? 1;
  const severityEscalated = nextRank > prevRank;
  existing.event_count += 1;
  existing.last_seen_at = new Date(now).toISOString();
  if (severityEscalated) existing.severity = severity;
  existing.title = title || existing.title;
  existing.metadata = { ...(existing.metadata || {}), ...(metadata || {}) };
  return { row: existing, isNew: false, severityEscalated };
}

async function postgresRecord(fingerprint, { title, severity, source, metadata }) {
  const metaJson = JSON.stringify(metadata || {});
  const existing = await query(`SELECT * FROM incidents WHERE fingerprint = $1`, [fingerprint]);

  if (!existing.rows[0]) {
    const ins = await query(
      `
        INSERT INTO incidents (fingerprint, title, severity, source, event_count, metadata)
        VALUES ($1, $2, $3, $4, 1, $5::jsonb)
        RETURNING *
      `,
      [fingerprint, title, severity, source, metaJson],
    );
    return { row: ins.rows[0], isNew: true, severityEscalated: true };
  }

  const prev = existing.rows[0];
  const severityEscalated =
    (SEVERITY_RANK[severity] ?? 1) > (SEVERITY_RANK[normalizeIncidentSeverity(prev.severity)] ?? 0);
  const nextSeverity = severityEscalated ? severity : prev.severity;
  const upd = await query(
    `
      UPDATE incidents
      SET event_count = event_count + 1,
          last_seen_at = NOW(),
          title = $2,
          severity = $3,
          metadata = metadata || $4::jsonb,
          status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END
      WHERE fingerprint = $1
      RETURNING *
    `,
    [fingerprint, title, nextSeverity, metaJson],
  );
  return { row: upd.rows[0], isNew: false, severityEscalated };
}

/**
 * Record an incident event and decide whether to notify operators now.
 */
export async function recordIncidentEvent({
  fingerprint,
  dedupeKey,
  title,
  severity = 'warning',
  source = 'system',
  metadata = {},
  throttleMinutes = null,
}) {
  const fp = buildIncidentFingerprint({ fingerprint, dedupeKey, source, title });
  const sev = normalizeIncidentSeverity(severity);
  const ttl = String(title || fp).slice(0, 500);

  let row;
  let isNew;
  let severityEscalated;

  if (dbType === 'postgres') {
    try {
      ({ row, isNew, severityEscalated } = await postgresRecord(fp, {
        title: ttl,
        severity: sev,
        source,
        metadata,
      }));
    } catch (e) {
      console.warn('[INCIDENTS] Postgres unavailable, using memory store:', e?.message || e);
      ({ row, isNew, severityEscalated } = memoryRecord(fp, {
        title: ttl,
        severity: sev,
        source,
        metadata,
      }));
    }
  } else {
    ({ row, isNew, severityEscalated } = memoryRecord(fp, {
      title: ttl,
      severity: sev,
      source,
      metadata,
    }));
  }

  const cooldownMs =
    throttleMinutes != null
      ? Math.max(1, Number(throttleMinutes) || 45) * 60 * 1000
      : DEFAULT_COOLDOWN_MS[sev] ?? DEFAULT_COOLDOWN_MS.warning;

  const lastNotified = row.last_notified_at ? new Date(row.last_notified_at).getTime() : 0;
  const cooledDown = lastNotified > 0 && Date.now() - lastNotified >= cooldownMs;
  const shouldNotify = isNew || severityEscalated || cooledDown;

  return {
    incidentId: row.id,
    fingerprint: fp,
    isNew,
    severityEscalated,
    shouldNotify,
    eventCount: row.event_count,
    severity: sev,
    status: row.status,
  };
}

export async function markIncidentNotified(fingerprint) {
  if (dbType === 'postgres') {
    try {
      await query(
        `UPDATE incidents SET last_notified_at = NOW() WHERE fingerprint = $1`,
        [fingerprint],
      );
      return;
    } catch {
      /* fall through */
    }
  }
  const row = memoryIncidents.get(fingerprint);
  if (row) row.last_notified_at = new Date().toISOString();
}

export async function resolveIncident(fingerprint) {
  if (dbType === 'postgres') {
    try {
      await query(
        `UPDATE incidents SET status = 'resolved', last_seen_at = NOW() WHERE fingerprint = $1`,
        [fingerprint],
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  const row = memoryIncidents.get(fingerprint);
  if (row) row.status = 'resolved';
  return { ok: true };
}

export async function listOpenIncidents(limit = 50) {
  const n = Math.max(1, Math.min(200, Number(limit) || 50));
  if (dbType === 'postgres') {
    try {
      const r = await query(
        `
          SELECT id, fingerprint, title, severity, status, source, event_count,
                 first_seen_at, last_seen_at, last_notified_at
          FROM incidents
          WHERE status = 'open'
          ORDER BY last_seen_at DESC
          LIMIT $1
        `,
        [n],
      );
      return r.rows || [];
    } catch {
      /* fall through */
    }
  }
  return [...memoryIncidents.values()]
    .filter((r) => r.status === 'open')
    .sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at))
    .slice(0, n);
}

/** Test helper */
export function _clearMemoryIncidentsForTests() {
  memoryIncidents.clear();
}
