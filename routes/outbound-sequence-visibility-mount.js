import { Router } from 'express';
import { phoneMatchKey as phoneMatchKeyLib } from '../lib/lead-phone-key.js';

export function createOutboundSequenceVisibilityRouter(deps) {
  const { query, getFullClient, isPostgres, phoneMatchKey } = deps || {};
  const phoneKeyFn = typeof phoneMatchKey === 'function' ? phoneMatchKey : phoneMatchKeyLib;
  const router = Router();

  function clamp(n, lo, hi, fallback) {
    const v = parseInt(String(n), 10);
    if (!Number.isFinite(v)) return fallback;
    return Math.max(lo, Math.min(hi, v));
  }

  router.get('/outbound-sequence/:clientKey/summary', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { clientKey } = req.params;
      const client = await getFullClient?.(clientKey, { bypassCache: false }).catch(() => null);
      if (!client) return res.status(404).json({ ok: false, error: 'client_not_found' });

      if (!isPostgres) {
        return res.json({
          ok: true,
          clientKey,
          summary: {
            activeSequences: 0,
            completedToday: 0,
            abandonedToday: 0,
            nextStageQueued: 0,
            oldestActiveUpdatedAt: null,
          },
          notes: ['sequence visibility summary is only available on Postgres'],
        });
      }

      const rows = await query(
        `
        WITH seq AS (
          SELECT
            status,
            updated_at
          FROM lead_sequence_state
          WHERE client_key = $1
        ),
        nextq AS (
          SELECT COUNT(*)::int AS n
          FROM call_queue
          WHERE client_key = $1
            AND call_type = 'vapi_call'
            AND status IN ('pending','processing')
            AND (call_data->>'triggerType') = 'sequence_next'
        )
        SELECT
          (SELECT COUNT(*)::int FROM seq WHERE status = 'active') AS active_sequences,
          (SELECT COUNT(*)::int FROM seq WHERE status = 'completed' AND updated_at::date = NOW()::date) AS completed_today,
          (SELECT COUNT(*)::int FROM seq WHERE status = 'abandoned' AND updated_at::date = NOW()::date) AS abandoned_today,
          (SELECT n FROM nextq) AS next_stage_queued,
          (SELECT MIN(updated_at) FROM seq WHERE status = 'active') AS oldest_active_updated_at
      `,
        [clientKey]
      );
      const r = rows?.rows?.[0] || {};
      return res.json({
        ok: true,
        clientKey,
        summary: {
          activeSequences: parseInt(r.active_sequences, 10) || 0,
          completedToday: parseInt(r.completed_today, 10) || 0,
          abandonedToday: parseInt(r.abandoned_today, 10) || 0,
          nextStageQueued: parseInt(r.next_stage_queued, 10) || 0,
          oldestActiveUpdatedAt: r.oldest_active_updated_at ? new Date(r.oldest_active_updated_at).toISOString() : null,
        },
      });
    } catch (error) {
      console.error('[OUTBOUND SEQUENCE SUMMARY ERROR]', error);
      return res.status(500).json({ ok: false, error: 'outbound_sequence_summary_failed', message: error?.message || String(error) });
    }
  });

  router.get('/outbound-sequence/:clientKey/leads', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { clientKey } = req.params;
      const limit = clamp(req.query.limit, 1, 500, 120);
      const offset = clamp(req.query.offset, 0, 50_000, 0);
      const client = await getFullClient?.(clientKey, { bypassCache: false }).catch(() => null);
      if (!client) return res.status(404).json({ ok: false, error: 'client_not_found' });

      const rows = await query(
        `
        SELECT
          client_key AS "clientKey",
          lead_phone AS "leadPhone",
          current_stage_id AS "currentStageId",
          stages_completed AS "stagesCompleted",
          attempts_in_stage AS "attemptsInStage",
          attempts_total AS "attemptsTotal",
          started_at AS "startedAt",
          last_call_id AS "lastCallId",
          next_stage_scheduled_for AS "nextStageScheduledFor",
          status,
          updated_at AS "updatedAt"
        FROM lead_sequence_state
        WHERE client_key = $1
        ORDER BY updated_at DESC
        LIMIT $2 OFFSET $3
      `,
        [clientKey, limit, offset]
      );

      const out = (rows?.rows || []).map((r) => {
        let stages = r.stagesCompleted;
        if (typeof stages === 'string') {
          try { stages = JSON.parse(stages); } catch { stages = []; }
        }
        if (!Array.isArray(stages)) stages = [];
        return { ...r, stagesCompleted: stages };
      });

      return res.json({ ok: true, clientKey, limit, offset, rows: out });
    } catch (error) {
      console.error('[OUTBOUND SEQUENCE LEADS ERROR]', error);
      return res.status(500).json({ ok: false, error: 'outbound_sequence_leads_failed', message: error?.message || String(error) });
    }
  });

  router.get('/outbound-sequence/:clientKey/phone/:phone', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { clientKey, phone } = req.params;
      const client = await getFullClient?.(clientKey, { bypassCache: false }).catch(() => null);
      if (!client) return res.status(404).json({ ok: false, error: 'client_not_found' });

      const rowRes = await query(
        `
        SELECT
          client_key AS "clientKey",
          lead_phone AS "leadPhone",
          current_stage_id AS "currentStageId",
          stages_completed AS "stagesCompleted",
          attempts_in_stage AS "attemptsInStage",
          attempts_total AS "attemptsTotal",
          started_at AS "startedAt",
          last_call_id AS "lastCallId",
          next_stage_scheduled_for AS "nextStageScheduledFor",
          status,
          updated_at AS "updatedAt"
        FROM lead_sequence_state
        WHERE client_key = $1 AND lead_phone = $2
        LIMIT 1
      `,
        [clientKey, String(phone || '').trim()]
      );
      const row = rowRes?.rows?.[0] || null;
      if (!row) return res.json({ ok: true, clientKey, phone, row: null, nextQueue: null });

      let stages = row.stagesCompleted;
      if (typeof stages === 'string') {
        try { stages = JSON.parse(stages); } catch { stages = []; }
      }
      if (!Array.isArray(stages)) stages = [];

      let nextQueue = null;
      if (isPostgres) {
        const mk = phoneKeyFn(phone);
        const qRes = await query(
          `
          SELECT
            id,
            status,
            scheduled_for AS "scheduledFor",
            call_data AS "callData"
          FROM call_queue
          WHERE client_key = $1
            AND call_type = 'vapi_call'
            AND status IN ('pending','processing')
            AND (call_data->>'triggerType') = 'sequence_next'
            AND (
              lead_phone = $2
              OR (lead_phone IS NOT NULL AND $3 IS NOT NULL AND RIGHT(regexp_replace(COALESCE(lead_phone, ''), '[^0-9]', '', 'g'), 10) = $3)
            )
          ORDER BY scheduled_for ASC
          LIMIT 1
        `,
          [clientKey, String(phone || '').trim(), mk]
        );
        const qr = qRes?.rows?.[0] || null;
        if (qr) {
          nextQueue = {
            id: qr.id,
            status: qr.status,
            scheduledFor: qr.scheduledFor ? new Date(qr.scheduledFor).toISOString() : null,
            callData: qr.callData,
          };
        }
      }

      return res.json({
        ok: true,
        clientKey,
        phone,
        row: { ...row, stagesCompleted: stages },
        nextQueue,
      });
    } catch (error) {
      console.error('[OUTBOUND SEQUENCE PHONE ERROR]', error);
      return res.status(500).json({ ok: false, error: 'outbound_sequence_phone_failed', message: error?.message || String(error) });
    }
  });

  return router;
}

