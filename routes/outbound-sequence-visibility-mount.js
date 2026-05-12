import { Router } from 'express';
import { phoneMatchKey as phoneMatchKeyLib } from '../lib/lead-phone-key.js';
import crypto from 'crypto';
import { getClassicFollowUpCutoverDate } from '../lib/outbound-sequence.js';
import {
  getDashboardCohortMeta,
  loadDashboardArtifactMap,
  matchesDashboardCohort,
  normalizeDashboardCohortFilter,
  OPERATOR_SEQUENCE_STOP_SOURCE,
  SEQUENCE_ABANDONED_HANDOFF_SOURCE,
  SEQUENCE_COMPLETED_HANDOFF_SOURCE,
} from '../lib/dashboard-follow-up-filters.js';

export function createOutboundSequenceVisibilityRouter(deps) {
  const { query, getFullClient, isPostgres, phoneMatchKey } = deps || {};
  const phoneKeyFn = typeof phoneMatchKey === 'function' ? phoneMatchKey : phoneMatchKeyLib;
  const router = Router();

  function clamp(n, lo, hi, fallback) {
    const v = parseInt(String(n), 10);
    if (!Number.isFinite(v)) return fallback;
    return Math.max(lo, Math.min(hi, v));
  }

  function previewRedacted(text, { maxLen = 120 } = {}) {
    const raw = text == null ? '' : String(text);
    const s = raw.trim();
    const length = s.length;
    const preview = length > 0 ? `${s.slice(0, maxLen)}${length > maxLen ? '…' : ''}` : '';
    const sha = length > 0 ? crypto.createHash('sha256').update(s).digest('hex').slice(0, 10) : '';
    return { length, preview, sha };
  }

  function buildSequenceConfigExplain(client) {
    const explain = {
      killSwitchActive: false,
      enabled: false,
      maxTotalDialsPerLead: null,
      maxSequenceDurationDays: null,
      stages: [],
      errors: [],
    };
    try {
      // Lazy import to keep module side effects minimal.
      // eslint-disable-next-line no-unused-vars
    } catch {
      /* ignore */
    }
    return explain;
  }

  router.get('/outbound-sequence/:clientKey/summary', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { clientKey } = req.params;
      const client = await getFullClient?.(clientKey, { bypassCache: false }).catch(() => null);
      if (!client) return res.status(404).json({ ok: false, error: 'client_not_found' });

      const {
        getValidatedOutboundSequence,
        validateOutboundSequenceConfig,
        isOutboundSequenceGloballyDisabled,
      } = await import('../lib/outbound-sequence.js');
      const killSwitchActive = isOutboundSequenceGloballyDisabled();
      const validated = getValidatedOutboundSequence(client);
      const raw = client?.outboundSequence;
      const v = raw && typeof raw === 'object' ? validateOutboundSequenceConfig(raw) : { ok: false, errors: ['outboundSequence missing'] };
      const cfgStages = Array.isArray(validated?.stages) ? validated.stages : [];
      const stagesExplain = cfgStages.map((st) => {
        const first = previewRedacted(st?.firstMessage, { maxLen: 120 });
        const sys = previewRedacted(st?.systemMessage, { maxLen: 120 });
        return {
          id: st?.id || '',
          isFinal: st?.isFinal === true,
          nextStage: st?.nextStage || null,
          requiredFields: Array.isArray(st?.requiredFields) ? st.requiredFields : [],
          maxAttemptsInStage: st?.maxAttemptsInStage != null ? Number(st.maxAttemptsInStage) : null,
          scheduling: st?.scheduling && typeof st.scheduling === 'object' ? st.scheduling : null,
          promptRedacted: {
            firstMessage: { preview: first.preview, length: first.length, sha: first.sha },
            systemMessage: { preview: sys.preview, length: sys.length, sha: sys.sha },
          },
        };
      });

      if (!isPostgres) {
        return res.json({
          ok: true,
          clientKey,
          sequence: {
            killSwitchActive,
            enabled: validated?.enabled === true,
            maxTotalDialsPerLead: validated?.maxTotalDialsPerLead ?? null,
            maxSequenceDurationDays: validated?.maxSequenceDurationDays ?? null,
            stages: stagesExplain,
            configValid: !!validated,
            configErrors: v.ok ? [] : (v.errors || []),
          },
          summary: {
            activeSequences: 0,
            completedToday: 0,
            stoppedToday: 0,
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
            lead_phone,
            status,
            updated_at
          FROM lead_sequence_state
          WHERE client_key = $1
        ),
        handoff_latest AS (
          SELECT DISTINCT ON (lead_phone)
            lead_phone,
            source
          FROM lead_handoff
          WHERE client_key = $1
          ORDER BY lead_phone, updated_at DESC
        ),
        abandoned_today_rows AS (
          SELECT
            s.lead_phone,
            hl.source
          FROM seq s
          LEFT JOIN handoff_latest hl
            ON hl.lead_phone = s.lead_phone
          WHERE s.status = 'abandoned'
            AND s.updated_at::date = NOW()::date
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
          (SELECT COUNT(*)::int FROM abandoned_today_rows WHERE source = $2) AS stopped_today,
          (SELECT COUNT(*)::int FROM abandoned_today_rows WHERE source IS DISTINCT FROM $2) AS abandoned_today,
          (SELECT n FROM nextq) AS next_stage_queued,
          (SELECT MIN(updated_at) FROM seq WHERE status = 'active') AS oldest_active_updated_at
      `,
        [clientKey, OPERATOR_SEQUENCE_STOP_SOURCE]
      );
      const r = rows?.rows?.[0] || {};
      return res.json({
        ok: true,
        clientKey,
        sequence: {
          killSwitchActive,
          enabled: validated?.enabled === true,
          maxTotalDialsPerLead: validated?.maxTotalDialsPerLead ?? null,
          maxSequenceDurationDays: validated?.maxSequenceDurationDays ?? null,
          stages: stagesExplain,
          configValid: !!validated,
          configErrors: v.ok ? [] : (v.errors || []),
        },
        summary: {
          activeSequences: parseInt(r.active_sequences, 10) || 0,
          completedToday: parseInt(r.completed_today, 10) || 0,
          stoppedToday: parseInt(r.stopped_today, 10) || 0,
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
      const filter = normalizeDashboardCohortFilter(req.query.filter);
      const fetchLimit = 500;
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
        [clientKey, fetchLimit, 0]
      );

      const out = (rows?.rows || []).map((r) => {
        let stages = r.stagesCompleted;
        if (typeof stages === 'string') {
          try { stages = JSON.parse(stages); } catch { stages = []; }
        }
        if (!Array.isArray(stages)) stages = [];
        return { ...r, stagesCompleted: stages };
      });

      const { getValidatedOutboundSequence, validateOutboundSequenceConfig, isOutboundSequenceGloballyDisabled } =
        await import('../lib/outbound-sequence.js');
      const killSwitchActive = isOutboundSequenceGloballyDisabled();
      const validated = getValidatedOutboundSequence(client);
      const raw = client?.outboundSequence;
      const v = raw && typeof raw === 'object' ? validateOutboundSequenceConfig(raw) : { ok: false, errors: ['outboundSequence missing'] };
      const artifactMap = await loadDashboardArtifactMap({
        query,
        clientKey,
        phones: out.map((row) => row?.leadPhone || ''),
        phoneMatchKey: phoneKeyFn,
      });
      const tenantTimezone = client?.booking?.timezone || client?.timezone || 'Europe/London';
      const classicFollowUpCutoverDate = getClassicFollowUpCutoverDate(client);
      const filteredRows = out
        .map((row) => {
          const phone = String(row?.leadPhone || '').trim();
          const phoneKey = phoneKeyFn(phone);
          const artifact = artifactMap.get(phone) || (phoneKey ? artifactMap.get(phoneKey) : null) || {};
          const fallbackSource =
            row?.status === 'abandoned'
              ? SEQUENCE_ABANDONED_HANDOFF_SOURCE
              : row?.status === 'completed'
                ? SEQUENCE_COMPLETED_HANDOFF_SOURCE
                : '';
          const cohortMeta = getDashboardCohortMeta({
            handoffSource: artifact?.handoffSource || fallbackSource,
            hasSequenceState: true,
            leadCreatedAt: artifact?.leadCreatedAt || null,
            classicFollowUpCutoverDate,
            tenantTimezone,
            salvageDismissedAt: artifact?.salvageDismissedAt || null,
          });
          return {
            ...row,
            dashboardCohort: cohortMeta.cohort,
          };
        })
        .filter((row) => matchesDashboardCohort({ cohort: row?.dashboardCohort }, filter));
      const pageRows = filteredRows.slice(offset, offset + limit);

      return res.json({
        ok: true,
        clientKey,
        limit,
        offset,
        filter,
        total: filteredRows.length,
        sequence: {
          killSwitchActive,
          enabled: validated?.enabled === true,
          maxTotalDialsPerLead: validated?.maxTotalDialsPerLead ?? null,
          maxSequenceDurationDays: validated?.maxSequenceDurationDays ?? null,
          stageCount: Array.isArray(validated?.stages) ? validated.stages.length : 0,
          configValid: !!validated,
          configErrors: v.ok ? [] : (v.errors || []),
        },
        rows: pageRows,
      });
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

      const {
        getValidatedOutboundSequence,
        getStageById,
        validateOutboundSequenceConfig,
        isOutboundSequenceGloballyDisabled,
        isStageComplete,
      } = await import('../lib/outbound-sequence.js');
      const killSwitchActive = isOutboundSequenceGloballyDisabled();
      const validated = getValidatedOutboundSequence(client);
      const raw = client?.outboundSequence;
      const v = raw && typeof raw === 'object' ? validateOutboundSequenceConfig(raw) : { ok: false, errors: ['outboundSequence missing'] };

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
      if (!row) {
        return res.json({
          ok: true,
          clientKey,
          phone,
          sequence: {
            killSwitchActive,
            enabled: validated?.enabled === true,
            configValid: !!validated,
            configErrors: v.ok ? [] : (v.errors || []),
          },
          row: null,
          nextQueue: null,
          explain: null,
        });
      }

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
          const cd = qr.callData && typeof qr.callData === 'object' ? qr.callData : {};
          nextQueue = {
            id: qr.id,
            status: qr.status,
            scheduledFor: qr.scheduledFor ? new Date(qr.scheduledFor).toISOString() : null,
            callData: qr.callData,
            triggerType: cd?.triggerType || null,
            stageId: cd?.stageId || null,
            prevCallId: cd?.prevCallId || null,
          };
        }
      }

      const currentStageId = String(row.currentStageId || '').trim();
      const stage = validated && currentStageId ? getStageById(client, currentStageId) : null;
      const reqFields = Array.isArray(stage?.requiredFields) ? stage.requiredFields : [];
      const lastCompletedStageSnapshot = stages.length ? stages[stages.length - 1] : null;
      const lastStructured = lastCompletedStageSnapshot?.structuredData && typeof lastCompletedStageSnapshot.structuredData === 'object'
        ? lastCompletedStageSnapshot.structuredData
        : {};

      const requiredFieldsStatus = reqFields.map((f) => {
        const key = String(f || '').trim();
        const val = key ? lastStructured[key] : undefined;
        const present = val != null && !(typeof val === 'string' && !String(val).trim());
        return { field: key, present, value: val ?? null };
      });

      let lastOutcome = null;
      try {
        if (isPostgres && row.lastCallId) {
          const oRes = await query(
            `
            SELECT outcome, status, duration, created_at AS "createdAt"
            FROM calls
            WHERE client_key = $1 AND call_id = $2
            LIMIT 1
          `,
            [clientKey, row.lastCallId]
          );
          const or = oRes?.rows?.[0] || null;
          if (or) {
            lastOutcome = {
              outcome: or.outcome || null,
              status: or.status || null,
              duration: or.duration != null ? Number(or.duration) : null,
              createdAt: or.createdAt ? new Date(or.createdAt).toISOString() : null,
            };
          }
        }
      } catch {
        /* best-effort */
      }

      const outcomeLower = String(lastOutcome?.outcome || '').toLowerCase();
      const outcomeExcluded = !!outcomeLower && ['voicemail', 'no-answer', 'busy', 'declined', 'failed'].includes(outcomeLower);
      const stageComplete = stage ? isStageComplete(stage, lastStructured) : false;
      const maxDials = Number(validated?.maxTotalDialsPerLead ?? 999) || 999;
      const maxDays = Number(validated?.maxSequenceDurationDays ?? 999) || 999;
      const nextTotal = (Number(row.attemptsTotal) || 0) + 1;
      const capExceeded = nextTotal > maxDials;
      const startedAt = row.startedAt ? new Date(row.startedAt) : null;
      const durationExceeded =
        startedAt && Number.isFinite(startedAt.getTime())
          ? Date.now() - startedAt.getTime() > maxDays * 24 * 60 * 60 * 1000
          : false;

      const stageExplain = stage
        ? (() => {
            const first = previewRedacted(stage?.firstMessage, { maxLen: 120 });
            const sys = previewRedacted(stage?.systemMessage, { maxLen: 120 });
            return {
              id: stage?.id || '',
              isFinal: stage?.isFinal === true,
              nextStage: stage?.nextStage || null,
              requiredFields: reqFields,
              maxAttemptsInStage: stage?.maxAttemptsInStage != null ? Number(stage.maxAttemptsInStage) : null,
              scheduling: stage?.scheduling && typeof stage.scheduling === 'object' ? stage.scheduling : null,
              promptRedacted: {
                firstMessage: { preview: first.preview, length: first.length, sha: first.sha },
                systemMessage: { preview: sys.preview, length: sys.length, sha: sys.sha },
              },
            };
          })()
        : null;

      return res.json({
        ok: true,
        clientKey,
        phone,
        row: { ...row, stagesCompleted: stages },
        nextQueue,
        sequence: {
          killSwitchActive,
          enabled: validated?.enabled === true,
          maxTotalDialsPerLead: validated?.maxTotalDialsPerLead ?? null,
          maxSequenceDurationDays: validated?.maxSequenceDurationDays ?? null,
          stageCount: Array.isArray(validated?.stages) ? validated.stages.length : 0,
          configValid: !!validated,
          configErrors: v.ok ? [] : (v.errors || []),
        },
        explain: {
          stage: stageExplain,
          lastOutcome,
          lastCompletedStageSnapshot,
          currentStage: {
            requiredFieldsStatus,
          },
          completionGate: {
            outcomeExcluded,
            stageComplete,
            capExceeded,
            durationExceeded,
            // stored nowhere today; we can only mirror it if future work persists it
            noUsefulOutcome: false,
          },
          caveats: [
            'requiredFieldsStatus is evaluated against the most recent completed stage snapshot (structuredData) stored in lead_sequence_state.',
            'the webhook uses fresh structured fields from Vapi end-of-call; incomplete stages may not have stored structuredData yet.',
          ],
        },
      });
    } catch (error) {
      console.error('[OUTBOUND SEQUENCE PHONE ERROR]', error);
      return res.status(500).json({ ok: false, error: 'outbound_sequence_phone_failed', message: error?.message || String(error) });
    }
  });

  return router;
}

