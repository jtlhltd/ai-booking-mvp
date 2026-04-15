import { query, dbType } from '../db.js';

function asInt(v, def) {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : def;
}

function truthyEnv(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s !== '' && !['0', 'false', 'no', 'off'].includes(s);
}

function isPostgres() {
  return dbType === 'postgres';
}

/**
 * Reset "processing" rows that were likely orphaned by a crash.
 * This is a lease/timeout mechanism: we re-queue work after it has been stuck long enough.
 */
export async function reapStuckCallQueueProcessing({ stuckMinutes = asInt(process.env.CALL_QUEUE_STUCK_MINUTES, 20) } = {}) {
  if (!isPostgres()) return { ok: true, skipped: true, reason: 'not_postgres' };
  if (!truthyEnv(process.env.STUCK_REAPER_ENABLED ?? '1')) return { ok: true, skipped: true, reason: 'disabled' };

  const m = Math.max(1, Math.min(24 * 60, stuckMinutes));
  const r = await query(
    `
    UPDATE call_queue
    SET status = 'pending',
        scheduled_for = NOW(),
        updated_at = NOW()
    WHERE status = 'processing'
      AND updated_at < NOW() - ($1::int * INTERVAL '1 minute')
    RETURNING id
  `,
    [m]
  );
  return { ok: true, reset: (r.rows || []).length, stuckMinutes: m };
}

/**
 * Allow retry of webhook events that were ingested but never finished processing.
 * We do NOT delete rows; we just clear the "in-flight" marker so a future delivery can re-claim work.
 */
export async function reapStuckWebhookEventProcessing({
  stuckMinutes = asInt(process.env.WEBHOOK_EVENT_STUCK_MINUTES, 15)
} = {}) {
  if (!isPostgres()) return { ok: true, skipped: true, reason: 'not_postgres' };
  if (!truthyEnv(process.env.STUCK_REAPER_ENABLED ?? '1')) return { ok: true, skipped: true, reason: 'disabled' };

  const m = Math.max(1, Math.min(24 * 60, stuckMinutes));
  const r = await query(
    `
    UPDATE webhook_events
    SET processing_started_at = NULL,
        processing_error = COALESCE(processing_error, 'stuck_processing_reaped')
    WHERE processed_at IS NULL
      AND processing_started_at IS NOT NULL
      AND processing_started_at < NOW() - ($1::int * INTERVAL '1 minute')
    RETURNING id
  `,
    [m]
  );
  return { ok: true, reset: (r.rows || []).length, stuckMinutes: m };
}

