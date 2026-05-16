import { Router } from 'express';
import { phoneMatchKey as phoneMatchKeyLib } from '../lib/lead-phone-key.js';
import crypto from 'crypto';
import { getClassicFollowUpCutoverDate } from '../lib/outbound-sequence.js';
import {
  getDashboardCohortMeta,
  matchesDashboardCohort,
  normalizeDashboardCohortFilter,
  OPERATOR_SEQUENCE_STOP_SOURCE,
  SEQUENCE_ABANDONED_HANDOFF_SOURCE,
  SEQUENCE_COMPLETED_HANDOFF_SOURCE,
} from '../lib/dashboard-follow-up-filters.js';
import { isLeadExplicitlyOptedIntoOutboundSequence } from '../lib/lead-dial-context.js';
import { shouldIncludeLeadInSequenceStateList } from '../lib/outbound-sequence-state-list-include.js';

export function createOutboundSequenceVisibilityRouter(deps) {
  const { query, getFullClient, isPostgres, phoneMatchKey } = deps || {};
  const phoneKeyFn = typeof phoneMatchKey === 'function' ? phoneMatchKey : phoneMatchKeyLib;
  const router = Router();

  /** pg 8+ may return BIGINT as bigint anywhere in row trees; JSON.stringify throws on bigint. */
  function jsonStripBigIntDeep(value) {
    return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? String(v) : v)));
  }

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

  function buildInClause(startIndex, values) {
    return values.map((_, idx) => `$${startIndex + idx}`).join(', ');
  }

  function uniqueTrimmed(values) {
    const out = [];
    const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) {
      const trimmed = String(value || '').trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.push(trimmed);
    }
    return out;
  }

  function lookupKeysForPhone(phone, phoneMatch = null) {
    return uniqueTrimmed([phone, phoneMatch]);
  }

  function mergeSequenceContext(map, keys, patch) {
    for (const key of uniqueTrimmed(keys)) {
      const prior = map.get(key) || {};
      map.set(key, { ...prior, ...patch });
    }
  }

  function getSequenceContextForPhone(map, phone, phoneMatch = null) {
    for (const key of lookupKeysForPhone(phone, phoneMatch)) {
      const hit = map.get(key);
      if (hit) return hit;
    }
    return {};
  }

  function parseJsonObject(raw) {
    if (!raw) return null;
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    try {
      const parsed = JSON.parse(String(raw || ''));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async function computeLeadEnrollmentStats(clientKey) {
    const cap = 5000;
    if (typeof query !== 'function' || !clientKey) {
      return { totalSampled: 0, optedIn: 0, notOptedIn: 0, capped: false };
    }
    const res = await query(
      `
      SELECT lead_dial_context_json AS "leadDialContextJson"
      FROM leads
      WHERE client_key = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
      [clientKey, cap]
    ).catch(() => ({ rows: [] }));
    const rows = res?.rows || [];
    let optedIn = 0;
    for (const row of rows) {
      if (isLeadExplicitlyOptedIntoOutboundSequence(row.leadDialContextJson)) optedIn += 1;
    }
    return {
      totalSampled: rows.length,
      optedIn,
      notOptedIn: Math.max(0, rows.length - optedIn),
      capped: rows.length >= cap,
    };
  }

  async function loadPendingSequenceQueueMap(clientKey, phones = []) {
    const map = new Map();
    if (!isPostgres || typeof query !== 'function' || !clientKey) return map;
    const unique = uniqueTrimmed(phones);
    if (!unique.length) return map;
    const res = await query(
      `
      SELECT
        lead_phone AS "leadPhone",
        MIN(scheduled_for) AS "scheduledFor",
        COUNT(*)::int AS "pendingCount"
      FROM call_queue
      WHERE client_key = $1
        AND call_type = 'vapi_call'
        AND status IN ('pending', 'processing')
        AND (call_data->>'triggerType') = 'sequence_next'
        AND lead_phone IN (${buildInClause(2, unique)})
      GROUP BY lead_phone
    `,
      [clientKey, ...unique]
    ).catch(() => ({ rows: [] }));
    for (const row of res?.rows || []) {
      const phone = String(row.leadPhone || '').trim();
      if (!phone) continue;
      map.set(phone, {
        scheduledFor: row.scheduledFor ? new Date(row.scheduledFor).toISOString() : null,
        pendingCount: parseInt(row.pendingCount, 10) || 0,
      });
    }
    return map;
  }

  function sequenceRowStuckHint(row, pendingQueue) {
    const status = String(row?.status || '').trim().toLowerCase();
    if (status !== 'active') return null;
    const updatedAt = row?.updatedAt ? new Date(row.updatedAt).getTime() : NaN;
    const ageH = Number.isFinite(updatedAt) ? (Date.now() - updatedAt) / (1000 * 60 * 60) : null;
    if (ageH != null && ageH > 48) return 'stale_active';
    if (!row?.nextStageScheduledFor && !(pendingQueue?.pendingCount > 0)) return 'no_next_scheduled';
    return null;
  }

  async function loadLeadAndHandoffMap(clientKey, phones = []) {
    const map = new Map();
    if (typeof query !== 'function' || !clientKey) return map;
    const uniquePhones = uniqueTrimmed(phones);
    const matchKeys = uniqueTrimmed(uniquePhones.map((phone) => phoneKeyFn(phone)));
    if (!uniquePhones.length && !matchKeys.length) return map;

    const leadPhoneClause = uniquePhones.length ? `phone IN (${buildInClause(2, uniquePhones)})` : '';
    const leadMatchClause = matchKeys.length ? `phone_match_key IN (${buildInClause(2 + uniquePhones.length, matchKeys)})` : '';
    const leadWhere = [leadPhoneClause, leadMatchClause].filter(Boolean).join(' OR ');
    if (leadWhere) {
      const leadRes = await query(
        `
        SELECT
          id,
          phone,
          phone_match_key AS "phoneMatchKey",
          name,
          service,
          source,
          notes,
          status AS "leadStatus",
          created_at AS "createdAt",
          lead_dial_context_json AS "leadDialContextJson"
        FROM leads
        WHERE client_key = $1
          AND (${leadWhere})
        ORDER BY created_at DESC
      `,
        [clientKey, ...uniquePhones, ...matchKeys]
      ).catch(() => ({ rows: [] }));
      for (const row of leadRes?.rows || []) {
        mergeSequenceContext(
          map,
          lookupKeysForPhone(row.phone, row.phoneMatchKey),
          {
            lead: {
              // pg 8+ may return BIGINT as BigInt; Express JSON cannot serialize BigInt.
              id: row.id != null ? String(row.id) : null,
              phone: row.phone || null,
              phoneMatchKey: row.phoneMatchKey || null,
              name: row.name || null,
              service: row.service || null,
              source: row.source || null,
              notes: row.notes || null,
              status: row.leadStatus || null,
              createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
            },
            sequenceOptedIn: isLeadExplicitlyOptedIntoOutboundSequence(row.leadDialContextJson),
          }
        );
      }
    }

    const handoffPhoneClause = uniquePhones.length ? `lead_phone IN (${buildInClause(2, uniquePhones)})` : '';
    const handoffMatchClause = matchKeys.length ? `phone_match_key IN (${buildInClause(2 + uniquePhones.length, matchKeys)})` : '';
    const handoffWhere = [handoffPhoneClause, handoffMatchClause].filter(Boolean).join(' OR ');
    if (handoffWhere) {
      const handoffRes = await query(
        `
        SELECT
          lead_phone AS "leadPhone",
          phone_match_key AS "phoneMatchKey",
          source,
          summary_text AS "summaryText",
          operator_notes AS "operatorNotes",
          updated_at AS "updatedAt",
          data_json AS "dataJson"
        FROM lead_handoff
        WHERE client_key = $1
          AND (${handoffWhere})
        ORDER BY updated_at DESC
      `,
        [clientKey, ...uniquePhones, ...matchKeys]
      ).catch(() => ({ rows: [] }));
      const seen = new Set();
      for (const row of handoffRes?.rows || []) {
        const keys = lookupKeysForPhone(row.leadPhone, row.phoneMatchKey);
        const primaryKey = keys[0];
        if (!primaryKey || seen.has(primaryKey)) continue;
        seen.add(primaryKey);
        const handoffData = parseJsonObject(row.dataJson);
        mergeSequenceContext(map, keys, {
          handoff: {
            source: row.source || null,
            summaryText: row.summaryText || null,
            operatorNotes: row.operatorNotes || null,
            updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
            salvageDismissedAt: handoffData?.qual?._salvageDismissedAt || null,
            dataJson: row.dataJson != null && typeof row.dataJson === 'object' ? row.dataJson : handoffData,
          },
        });
      }
    }

    return map;
  }

  function escapeIlikePattern(value) {
    return String(value || '').replace(/[%_\\]/g, '\\$&');
  }

  function buildResolveMatchLabel({ leadPhone, name, service, matchType }) {
    const phone = String(leadPhone || '').trim();
    const bits = [String(name || '').trim(), String(service || '').trim(), phone].filter(Boolean);
    return {
      leadPhone: phone,
      matchType: String(matchType || 'text'),
      name: name || null,
      service: service || null,
      label: bits.length ? bits.join(' · ') : phone,
    };
  }

  function dedupeResolveMatches(matches, limit = 12) {
    const seen = new Set();
    const out = [];
    for (const m of Array.isArray(matches) ? matches : []) {
      const phone = String(m?.leadPhone || '').trim();
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      out.push(m);
      if (out.length >= limit) break;
    }
    return out;
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
      const enrollment = await computeLeadEnrollmentStats(clientKey);
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
          enrollment,
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
      const contextMap = await loadLeadAndHandoffMap(clientKey, out.map((row) => row?.leadPhone || ''));
      const tenantTimezone = client?.booking?.timezone || client?.timezone || 'Europe/London';
      const classicFollowUpCutoverDate = getClassicFollowUpCutoverDate(client);
      const filteredRows = out
        .map((row) => {
          const phone = String(row?.leadPhone || '').trim();
          const phoneKey = phoneKeyFn(phone);
          const context = getSequenceContextForPhone(contextMap, phone, phoneKey);
          const fallbackSource =
            row?.status === 'abandoned'
              ? SEQUENCE_ABANDONED_HANDOFF_SOURCE
              : row?.status === 'completed'
                ? SEQUENCE_COMPLETED_HANDOFF_SOURCE
                : '';
          const cohortMeta = getDashboardCohortMeta({
            handoffSource: context?.handoff?.source || fallbackSource,
            hasSequenceState: true,
            leadCreatedAt: context?.lead?.createdAt || null,
            classicFollowUpCutoverDate,
            tenantTimezone,
            salvageDismissedAt: context?.handoff?.salvageDismissedAt || null,
          });
          return {
            ...row,
            dashboardCohort: cohortMeta.cohort,
            lead: context?.lead || null,
            handoff: context?.handoff || null,
            sequenceOptedIn: context?.sequenceOptedIn === true,
          };
        })
        .filter((row) => shouldIncludeLeadInSequenceStateList(row))
        .filter((row) => matchesDashboardCohort({ cohort: row?.dashboardCohort }, filter));
      const queueMap = await loadPendingSequenceQueueMap(
        clientKey,
        filteredRows.map((row) => row?.leadPhone || '')
      );
      const pageRows = filteredRows.slice(offset, offset + limit).map((row) => {
        const phone = String(row?.leadPhone || '').trim();
        const pendingSequenceQueue = queueMap.get(phone) || null;
        return {
          ...row,
          pendingSequenceQueue,
          stuckHint: sequenceRowStuckHint(row, pendingSequenceQueue),
        };
      });

      return res.json({
        ok: true,
        clientKey,
        limit,
        offset,
        filter,
        listMode: 'sequence_state',
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

  router.get('/outbound-sequence/:clientKey/enrollable-leads', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { clientKey } = req.params;
      const limit = clamp(req.query.limit, 1, 500, 120);
      const offset = clamp(req.query.offset, 0, 50_000, 0);
      const client = await getFullClient?.(clientKey, { bypassCache: false }).catch(() => null);
      if (!client) return res.status(404).json({ ok: false, error: 'client_not_found' });

      const { getValidatedOutboundSequence, validateOutboundSequenceConfig, isOutboundSequenceGloballyDisabled } =
        await import('../lib/outbound-sequence.js');
      const killSwitchActive = isOutboundSequenceGloballyDisabled();
      const validated = getValidatedOutboundSequence(client);
      const raw = client?.outboundSequence;
      const v = raw && typeof raw === 'object' ? validateOutboundSequenceConfig(raw) : { ok: false, errors: ['outboundSequence missing'] };

      const leadRes = await query(
        `
        SELECT
          id,
          phone,
          phone_match_key AS "phoneMatchKey",
          name,
          service,
          source,
          notes,
          status AS "leadStatus",
          created_at AS "createdAt",
          lead_dial_context_json AS "leadDialContextJson"
        FROM leads
        WHERE client_key = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
        [clientKey, 2000]
      ).catch(() => ({ rows: [] }));

      const candidates = (leadRes?.rows || []).filter(
        (row) => !isLeadExplicitlyOptedIntoOutboundSequence(row.leadDialContextJson)
      );
      const pageSlice = candidates.slice(offset, offset + limit).map((row) => ({
        leadPhone: row.phone,
        sequenceOptedIn: false,
        listMode: 'enrollable',
        lead: {
          id: row.id != null ? String(row.id) : null,
          phone: row.phone || null,
          name: row.name || null,
          service: row.service || null,
          source: row.source || null,
          notes: row.notes || null,
          status: row.leadStatus || null,
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
        },
        status: null,
        dashboardCohort: 'classic',
      }));

      return res.json({
        ok: true,
        clientKey,
        limit,
        offset,
        listMode: 'enrollable',
        total: candidates.length,
        sequence: {
          killSwitchActive,
          enabled: validated?.enabled === true,
          configValid: !!validated,
          configErrors: v.ok ? [] : (v.errors || []),
        },
        rows: pageSlice,
      });
    } catch (error) {
      console.error('[OUTBOUND SEQUENCE ENROLLABLE LEADS ERROR]', error);
      return res.status(500).json({ ok: false, error: 'outbound_sequence_enrollable_failed', message: error?.message || String(error) });
    }
  });

  router.get('/outbound-sequence/:clientKey/resolve', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { clientKey } = req.params;
      const qRaw = String(req.query.q || '')
        .trim()
        .replace(/[\u200b-\u200d\ufeff\u200e\u200f\u202a-\u202e]/g, '');
      if (qRaw.length < 2) {
        return res.status(400).json({ ok: false, error: 'query_too_short', message: 'Enter at least 2 characters.' });
      }
      const client = await getFullClient?.(clientKey, { bypassCache: false }).catch(() => null);
      if (!client) return res.status(404).json({ ok: false, error: 'client_not_found' });

      if (!isPostgres) {
        return res.json({ ok: true, clientKey, query: qRaw, matches: [], notes: ['resolve is only available on Postgres'] });
      }

      const matches = [];
      const digits = qRaw.replace(/\D/g, '');
      const phoneMatch = phoneKeyFn(qRaw);
      const ilike = `%${escapeIlikePattern(qRaw)}%`;

      const pushRows = (rows, matchType) => {
        for (const row of rows || []) {
          const label = buildResolveMatchLabel({
            leadPhone: row.leadPhone || row.phone,
            name: row.name,
            service: row.service,
            matchType,
          });
          if (label.leadPhone) matches.push(label);
        }
      };

      if (digits.length >= 7 || qRaw.startsWith('+')) {
        const phoneRes = await query(
          `
          SELECT DISTINCT lead_phone AS "leadPhone"
          FROM lead_sequence_state
          WHERE client_key = $1
            AND (
              lead_phone = $2
              OR (
                NULLIF(regexp_replace(COALESCE($2, ''), '[^0-9]', '', 'g'), '') IS NOT NULL
                AND regexp_replace(COALESCE(lead_phone, ''), '[^0-9]', '', 'g')
                  = regexp_replace(COALESCE($2, ''), '[^0-9]', '', 'g')
              )
              OR (
                NULLIF(btrim(COALESCE($3::text, '')), '') IS NOT NULL
                AND RIGHT(regexp_replace(COALESCE(lead_phone, ''), '[^0-9]', '', 'g'), 10) = $3::text
              )
            )
          LIMIT 8
        `,
          [clientKey, qRaw, phoneMatch]
        );
        pushRows(phoneRes?.rows || [], 'phone');
      }

      if (/^\d+$/.test(qRaw)) {
        const idRes = await query(
          `
          SELECT l.phone AS "leadPhone", l.name, l.service
          FROM leads l
          INNER JOIN lead_sequence_state s
            ON s.client_key = l.client_key AND s.lead_phone = l.phone
          WHERE l.client_key = $1 AND l.id = $2::bigint
          LIMIT 5
        `,
          [clientKey, qRaw]
        );
        pushRows(idRes?.rows || [], 'lead_id');
      }

      const textRes = await query(
        `
        SELECT DISTINCT l.phone AS "leadPhone", l.name, l.service
        FROM leads l
        INNER JOIN lead_sequence_state s
          ON s.client_key = l.client_key AND s.lead_phone = l.phone
        WHERE l.client_key = $1
          AND (
            l.name ILIKE $2 ESCAPE '\\'
            OR l.service ILIKE $2 ESCAPE '\\'
            OR l.source ILIKE $2 ESCAPE '\\'
            OR l.notes ILIKE $2 ESCAPE '\\'
            OR l.phone ILIKE $2 ESCAPE '\\'
          )
        ORDER BY l.created_at DESC
        LIMIT 10
      `,
        [clientKey, ilike]
      );
      pushRows(textRes?.rows || [], 'text');

      const handoffRes = await query(
        `
        SELECT DISTINCT h.lead_phone AS "leadPhone", l.name, l.service
        FROM lead_handoff h
        INNER JOIN lead_sequence_state s
          ON s.client_key = h.client_key AND s.lead_phone = h.lead_phone
        LEFT JOIN leads l
          ON l.client_key = h.client_key AND l.phone = h.lead_phone
        WHERE h.client_key = $1
          AND (
            h.summary_text ILIKE $2 ESCAPE '\\'
            OR h.operator_notes ILIKE $2 ESCAPE '\\'
          )
        ORDER BY h.updated_at DESC
        LIMIT 8
      `,
        [clientKey, ilike]
      );
      pushRows(handoffRes?.rows || [], 'handoff');

      return res.json({
        ok: true,
        clientKey,
        query: qRaw,
        matches: dedupeResolveMatches(matches),
      });
    } catch (error) {
      console.error('[OUTBOUND SEQUENCE RESOLVE ERROR]', error);
      return res.status(500).json({
        ok: false,
        error: 'outbound_sequence_resolve_failed',
        message: error?.message || String(error),
      });
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
      const phoneRaw = String(phone || '')
        .trim()
        .replace(/[\u200b-\u200d\ufeff\u200e\u200f\u202a-\u202e]/g, '');
      const phoneMatch = phoneKeyFn(phoneRaw);

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
        WHERE client_key = $1
          AND (
            lead_phone = $2
            OR (
              NULLIF(regexp_replace(COALESCE($2, ''), '[^0-9]', '', 'g'), '') IS NOT NULL
              AND regexp_replace(COALESCE(lead_phone, ''), '[^0-9]', '', 'g')
                = regexp_replace(COALESCE($2, ''), '[^0-9]', '', 'g')
            )
            OR (
              NULLIF(btrim(COALESCE($3::text, '')), '') IS NOT NULL
              AND RIGHT(regexp_replace(COALESCE(lead_phone, ''), '[^0-9]', '', 'g'), 10) = $3::text
            )
          )
        LIMIT 1
      `,
        [clientKey, phoneRaw, phoneMatch]
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

      const contextMap = await loadLeadAndHandoffMap(clientKey, [row.leadPhone || phoneRaw]);
      const context = getSequenceContextForPhone(contextMap, row.leadPhone || phoneRaw, phoneKeyFn(row.leadPhone || phoneRaw));

      let stages = row.stagesCompleted;
      if (typeof stages === 'string') {
        try { stages = JSON.parse(stages); } catch { stages = []; }
      }
      if (!Array.isArray(stages)) stages = [];

      let nextQueue = null;
      if (isPostgres) {
        const queuePhone = String(row.leadPhone || phoneRaw).trim();
        const mk = phoneKeyFn(queuePhone);
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
              OR (
                NULLIF(regexp_replace(COALESCE($2, ''), '[^0-9]', '', 'g'), '') IS NOT NULL
                AND regexp_replace(COALESCE(lead_phone, ''), '[^0-9]', '', 'g')
                  = regexp_replace(COALESCE($2, ''), '[^0-9]', '', 'g')
              )
              OR (
                NULLIF(btrim(COALESCE($3::text, '')), '') IS NOT NULL
                AND RIGHT(regexp_replace(COALESCE(lead_phone, ''), '[^0-9]', '', 'g'), 10) = $3::text
              )
            )
          ORDER BY scheduled_for ASC
          LIMIT 1
        `,
          [clientKey, queuePhone, mk]
        );
        const qr = qRes?.rows?.[0] || null;
        if (qr) {
          const cd = qr.callData && typeof qr.callData === 'object' ? qr.callData : {};
          nextQueue = {
            id: qr.id != null ? String(qr.id) : null,
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
      const queuePhoneForOutcome = String(row.leadPhone || phoneRaw).trim();
      const outcomeDigits = queuePhoneForOutcome.replace(/\D+/g, '');
      const outcomeLast10 = outcomeDigits.length >= 10 ? outcomeDigits.slice(-10) : '';
      try {
        if (isPostgres && row.lastCallId) {
          const oRes = await query(
            `
            SELECT outcome, status, duration, created_at AS "createdAt", call_id AS "callId"
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
              callId: or.callId || row.lastCallId || null,
            };
          }
        }
        if (isPostgres && !lastOutcome && queuePhoneForOutcome) {
          const oRes = await query(
            `
            SELECT outcome, status, duration, created_at AS "createdAt", call_id AS "callId"
            FROM calls
            WHERE client_key = $1
              AND (
                lead_phone = $2
                OR ($3 <> '' AND regexp_replace(lead_phone, '\\D', '', 'g') = $3)
                OR ($4 <> '' AND RIGHT(regexp_replace(lead_phone, '\\D', '', 'g'), 10) = $4)
              )
            ORDER BY created_at DESC
            LIMIT 1
          `,
            [clientKey, queuePhoneForOutcome, outcomeDigits, outcomeLast10]
          );
          const or = oRes?.rows?.[0] || null;
          if (or) {
            lastOutcome = {
              outcome: or.outcome || null,
              status: or.status || null,
              duration: or.duration != null ? Number(or.duration) : null,
              createdAt: or.createdAt ? new Date(or.createdAt).toISOString() : null,
              callId: or.callId || null,
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
      const tenantTimezone = client?.booking?.timezone || client?.timezone || 'Europe/London';
      const classicFollowUpCutoverDate = getClassicFollowUpCutoverDate(client);
      const fallbackSource =
        row?.status === 'abandoned'
          ? SEQUENCE_ABANDONED_HANDOFF_SOURCE
          : row?.status === 'completed'
            ? SEQUENCE_COMPLETED_HANDOFF_SOURCE
            : '';
      const cohortMeta = getDashboardCohortMeta({
        handoffSource: context?.handoff?.source || fallbackSource,
        hasSequenceState: true,
        leadCreatedAt: context?.lead?.createdAt || null,
        classicFollowUpCutoverDate,
        tenantTimezone,
        salvageDismissedAt: context?.handoff?.salvageDismissedAt || null,
      });

      return res.json(
        jsonStripBigIntDeep({
          ok: true,
          clientKey,
          phone,
          row: { ...row, stagesCompleted: stages, dashboardCohort: cohortMeta.cohort },
          sequenceOptedIn: context?.sequenceOptedIn === true,
          lead: context?.lead || null,
          handoff: context?.handoff || null,
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
        })
      );
    } catch (error) {
      console.error('[OUTBOUND SEQUENCE PHONE ERROR]', error);
      return res.status(500).json({ ok: false, error: 'outbound_sequence_phone_failed', message: error?.message || String(error) });
    }
  });

  return router;
}

