import { query } from '../db.js';
import messagingService from './messaging-service.js';

const RETRY_TYPE = 'email_alert';

function operatorEmailAlertsDisabled() {
  const v = String(process.env.DISABLE_OPERATOR_EMAIL_ALERTS || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function nowIso() {
  return new Date().toISOString();
}

function hourBucketKey(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  // YYYY-MM-DDTHH (UTC)
  return dt.toISOString().slice(0, 13);
}

export async function enqueueEmailAlert({ clientKey, fingerprint, to, subject, body, html = null, meta = {} }) {
  if (operatorEmailAlertsDisabled()) {
    return { ok: true, skipped: true, reason: 'disabled' };
  }
  const ck = String(clientKey || '').trim();
  const fp = String(fingerprint || '').trim();
  const to0 = String(to || '').trim();
  const subj = String(subject || '').trim();
  const text = String(body || '').trim();
  if (!ck || !fp || !to0 || !subj || !text) {
    return { ok: false, error: 'invalid_args' };
  }

  try {
    // Dedupe: if there's already a pending/processing alert with this fingerprint in the current hour bucket, skip enqueue.
    const bucket = hourBucketKey();
    const existing = await query(
      `
      SELECT id
      FROM retry_queue
      WHERE client_key = $1
        AND retry_type = $2
        AND retry_reason = $3
        AND status IN ('pending','processing')
        AND created_at >= ($4::timestamptz - interval '1 hour')
      ORDER BY id DESC
      LIMIT 1
      `,
      [ck, RETRY_TYPE, `${fp}:${bucket}`, nowIso()]
    );
    if (existing?.rows?.[0]?.id) {
      return { ok: true, deduped: true, id: existing.rows[0].id };
    }

    const scheduledFor = nowIso();
    const res = await query(
      `
      INSERT INTO retry_queue (client_key, lead_phone, retry_type, retry_reason, retry_data, scheduled_for, retry_attempt, max_retries, status)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz, 1, 6, 'pending')
      RETURNING id
      `,
      [
        ck,
        'operator',
        RETRY_TYPE,
        `${fp}:${bucket}`,
        JSON.stringify({
          to: to0,
          subject: subj,
          body: text,
          html,
          meta
        }),
        scheduledFor
      ]
    );
    return { ok: true, queued: true, id: res.rows?.[0]?.id };
  } catch (e) {
    console.error('[EMAIL OUTBOX] enqueue failed:', e?.message || e);
    return { ok: false, error: e?.message || 'enqueue_failed' };
  }
}

export async function processEmailAlertOutbox({ limit = 10 } = {}) {
  if (operatorEmailAlertsDisabled()) {
    return { ok: true, processed: 0, sent: 0, failed: 0, dropped: 0, skipped: true, reason: 'disabled' };
  }
  const max = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const due = await query(
    `
    SELECT *
    FROM retry_queue
    WHERE retry_type = $1
      AND status = 'pending'
      AND scheduled_for <= now()
      AND retry_attempt <= max_retries
    ORDER BY scheduled_for ASC
    LIMIT $2
    `,
    [RETRY_TYPE, max]
  );

  let processed = 0;
  let sent = 0;
  let failed = 0;
  let deduped = 0;

  for (const row of due.rows || []) {
    processed++;
    try {
      // Move to processing
      await query(`UPDATE retry_queue SET status = 'processing', updated_at = now() WHERE id = $1`, [row.id]);

      const data =
        typeof row.retry_data === 'string'
          ? JSON.parse(row.retry_data)
          : row.retry_data && typeof row.retry_data === 'object'
            ? row.retry_data
            : {};

      const to = String(data?.to || '').trim();
      const subject = String(data?.subject || '').trim();
      const body = String(data?.body || '').trim();
      const html = data?.html != null ? String(data.html) : null;

      // Drop if malformed (don’t loop forever)
      if (!to || !subject || !body) {
        deduped++;
        await query(
          `UPDATE retry_queue SET status = 'cancelled', retry_reason = COALESCE(retry_reason,'') || ' malformed', updated_at = now() WHERE id = $1`,
          [row.id]
        );
        continue;
      }

      const result = await messagingService.sendEmail({ to, subject, body, html });
      if (result?.success) {
        sent++;
        await query(`UPDATE retry_queue SET status = 'completed', updated_at = now() WHERE id = $1`, [row.id]);
        continue;
      }

      const errMsg = String(result?.error || 'send_failed');
      const attempt = Number(row.retry_attempt || 1);
      const nextDelayMin = Math.min(5 * Math.pow(2, Math.max(0, attempt - 1)), 60);
      failed++;
      await query(
        `
        UPDATE retry_queue
        SET status = 'pending',
            retry_attempt = retry_attempt + 1,
            retry_data = jsonb_set(COALESCE(retry_data,'{}'::jsonb), '{error}', to_jsonb($2::text), true),
            scheduled_for = now() + ($3 || ' minutes')::interval,
            updated_at = now()
        WHERE id = $1
        `,
        [row.id, errMsg, String(nextDelayMin)]
      );
    } catch (e) {
      const msg = String(e?.message || e || 'error');
      const attempt = Number(row.retry_attempt || 1);
      const nextDelayMin = Math.min(5 * Math.pow(2, Math.max(0, attempt - 1)), 60);
      failed++;
      await query(
        `
        UPDATE retry_queue
        SET status = 'pending',
            retry_attempt = retry_attempt + 1,
            retry_data = jsonb_set(COALESCE(retry_data,'{}'::jsonb), '{error}', to_jsonb($2::text), true),
            scheduled_for = now() + ($3 || ' minutes')::interval,
            updated_at = now()
        WHERE id = $1
        `,
        [row.id, msg, String(nextDelayMin)]
      ).catch(() => {});
    }
  }

  if (processed > 0) {
    console.log('[EMAIL OUTBOX] sweep', { processed, sent, failed, dropped: deduped });
  }
  return { ok: true, processed, sent, failed, dropped: deduped };
}

