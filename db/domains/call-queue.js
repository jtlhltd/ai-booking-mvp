export function createCallQueueDomain({
  getDbType,
  getPool,
  getSqlite,
  query,
  phoneMatchKey,
  outboundDialClaimKeyFromRaw,
  smearCallQueueScheduledFor,
  pgQueueLeadPhoneKeyExpr,
  callQueueReads,
  callQueueWrites,
}) {
  function parseCallData(raw) {
    if (!raw) return {};
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    return {};
  }

  function normalizeOutboundDialMode(raw) {
    const v = String(raw || '').trim().toLowerCase();
    return v === 'sequence' || v === 'classic' ? v : null;
  }

  function mergeOutboundDialMode(existingMode, incomingMode) {
    const ex = normalizeOutboundDialMode(existingMode);
    const inc = normalizeOutboundDialMode(incomingMode);
    if (ex === 'sequence') return 'sequence';
    if (ex === 'classic') return inc === 'sequence' ? 'sequence' : 'classic';
    if (ex == null) return inc;
    return null;
  }

  function mergeCallDataForDedupe(existingRaw, incomingRaw) {
    const existing = parseCallData(existingRaw);
    const incoming = parseCallData(incomingRaw);
    const existingMode = normalizeOutboundDialMode(existing.outboundDialMode);
    const mergedMode = mergeOutboundDialMode(existingMode, incoming.outboundDialMode);
    const next = { ...existing };
    if (mergedMode == null) {
      delete next.outboundDialMode;
    } else {
      next.outboundDialMode = mergedMode;
    }
    return {
      modeChanged: existingMode !== mergedMode,
      next
    };
  }

  // --- V1: hard block outbound calls to opted-out numbers (DNC)
  const optedOutDialCacheByClient = new Map(); // clientKey -> { loadedAt, set }
  const OPTED_OUT_DIAL_CACHE_TTL_MS = 5 * 60 * 1000;

  function optedOutCacheKey(clientKey) {
    const k = String(clientKey || '').trim();
    return k || '__unknown__';
  }

  async function loadOptedOutDialCache(clientKey) {
    const dbType = getDbType();
    const now = Date.now();
    const ck = optedOutCacheKey(clientKey);
    const existing = optedOutDialCacheByClient.get(ck);
    if (existing && now - existing.loadedAt < OPTED_OUT_DIAL_CACHE_TTL_MS) return existing.set;
    try {
      const activePhones = await query(
        dbType === 'sqlite'
          ? `SELECT phone FROM opt_out_list WHERE active = 1 AND (client_key = $1 OR client_key = '__global__')`
          : `SELECT phone FROM opt_out_list WHERE active = TRUE AND (client_key = $1 OR client_key = '__global__')`,
        [ck]
      );
      const set = new Set();
      for (const r of activePhones.rows || []) {
        const raw = String(r.phone || '').trim();
        const mk = phoneMatchKey(raw);
        if (mk) set.add(mk);
      }
      optedOutDialCacheByClient.set(ck, { loadedAt: now, set });
      return set;
    } catch (e) {
      // If opt_out_list doesn't exist (new env), fail open (don't block calls).
      // Lead import path still checks opted_out elsewhere.
      return existing?.set || new Set();
    }
  }

  async function isOptedOutForDial(clientKey, leadPhone) {
    const mk = phoneMatchKey(leadPhone);
    if (!mk) return false;
    const set = await loadOptedOutDialCache(clientKey);
    return set.has(mk);
  }

  function invalidateOptOutDialCache() {
    optedOutDialCacheByClient.clear();
  }

  async function addToCallQueue({ clientKey, leadPhone, priority = 5, scheduledFor, callType, callData }) {
    const dbType = getDbType();
    const pool = getPool();
    const sqlite = getSqlite();
    const callDataJson = callData ? JSON.stringify(callData) : null;
    const when =
      callType === 'vapi_call'
        ? smearCallQueueScheduledFor(scheduledFor, clientKey, leadPhone ?? '', null)
        : scheduledFor instanceof Date
          ? scheduledFor
          : scheduledFor;

    if (callType === 'vapi_call') {
      // V1 compliance: never enqueue outbound dials for opted-out numbers.
      if (await isOptedOutForDial(clientKey, leadPhone)) {
        const err = new Error('opted_out');
        err.code = 'opted_out';
        err.clientKey = clientKey;
        err.leadPhone = leadPhone;
        throw err;
      }
      const raw = String(leadPhone ?? '').trim();
      const matchKey = outboundDialClaimKeyFromRaw(raw);
      const weakDigits = matchKey === '__nodigits__';

      if (dbType === 'postgres' && pool) {
        const keySql = pgQueueLeadPhoneKeyExpr('lead_phone');
        const sel = await query(
          weakDigits
            ? `
          SELECT id, scheduled_for, priority, call_data
          FROM call_queue
          WHERE client_key = $1
            AND status IN ('pending', 'processing')
            AND call_type = 'vapi_call'
            AND lead_phone = $2
          ORDER BY scheduled_for ASC, priority ASC, id ASC
          LIMIT 1
          `
            : `
          SELECT id, scheduled_for, priority, call_data
          FROM call_queue
          WHERE client_key = $1
            AND status IN ('pending', 'processing')
            AND call_type = 'vapi_call'
            AND (${keySql}) = $2
          ORDER BY scheduled_for ASC, priority ASC, id ASC
          LIMIT 1
          `,
          weakDigits ? [clientKey, raw] : [clientKey, matchKey]
        );
        const ex = sel.rows?.[0];
        if (ex) {
          const exTime = new Date(ex.scheduled_for).getTime();
          const newTime = when instanceof Date ? when.getTime() : new Date(when).getTime();
          const earlier = newTime < exTime;
          const betterPriority = priority < Number(ex.priority);
          const merged = mergeCallDataForDedupe(ex.call_data, callData);
          if (earlier || betterPriority || merged.modeChanged) {
            const nextWhen = earlier
              ? smearCallQueueScheduledFor(when instanceof Date ? when : new Date(when), clientKey, raw, ex.id)
              : ex.scheduled_for;
            const nextPri = betterPriority ? priority : ex.priority;
            await query(`UPDATE call_queue SET scheduled_for = $1, priority = $2, call_data = $3::jsonb, updated_at = now() WHERE id = $4`, [
              nextWhen,
              nextPri,
              Object.keys(merged.next).length > 0 ? JSON.stringify(merged.next) : null,
              ex.id,
            ]);
          }
          const { rows: out } = await query(`SELECT * FROM call_queue WHERE id = $1`, [ex.id]);
          return out[0];
        }
      } else if (sqlite) {
        const rowsSqlite = sqlite
          .prepare(
            `SELECT id, scheduled_for, priority, lead_phone, call_data FROM call_queue
             WHERE client_key = ? AND call_type = 'vapi_call' AND status IN ('pending','processing')`
          )
          .all(clientKey);
        const ex = (rowsSqlite || []).find((r) =>
          weakDigits ? String(r.lead_phone || '').trim() === raw : outboundDialClaimKeyFromRaw(r.lead_phone) === matchKey
        );
        if (ex) {
          const exTime = new Date(ex.scheduled_for).getTime();
          const newTime = when instanceof Date ? when.getTime() : new Date(when).getTime();
          const earlier = newTime < exTime;
          const betterPriority = priority < Number(ex.priority);
          const merged = mergeCallDataForDedupe(ex.call_data, callData);
          if (earlier || betterPriority || merged.modeChanged) {
            const nextWhen = earlier
              ? smearCallQueueScheduledFor(when instanceof Date ? when : new Date(when), clientKey, raw, ex.id)
              : ex.scheduled_for;
            const nextPri = betterPriority ? priority : ex.priority;
            sqlite
              .prepare(`UPDATE call_queue SET scheduled_for = ?, priority = ?, call_data = ?, updated_at = datetime('now') WHERE id = ?`)
              .run(
                nextWhen instanceof Date ? nextWhen.toISOString() : nextWhen,
                nextPri,
                Object.keys(merged.next).length > 0 ? JSON.stringify(merged.next) : null,
                ex.id
              );
          }
          return sqlite.prepare(`SELECT * FROM call_queue WHERE id = ?`).get(ex.id);
        }
      }
    }

    const { rows } = await query(
      `
      INSERT INTO call_queue (client_key, lead_phone, priority, scheduled_for, call_type, call_data, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending')
      RETURNING *
      `,
      [clientKey, leadPhone, priority, when, callType, callDataJson]
    );

    return rows[0];
  }

  async function getPendingCalls(limit = 100) {
    return callQueueReads.getPendingCalls(query, limit);
  }

  async function updateCallQueueStatus(id, status) {
    return callQueueWrites.updateCallQueueStatus(query, id, status);
  }

  /** Cancel all other pending queue rows for the same client + dialable phone identity (tail-10 / digit key). */
  async function cancelDuplicatePendingCalls(clientKey, leadPhone, excludeId) {
    const sqlite = getSqlite();
    const raw = leadPhone != null ? String(leadPhone).trim() : '';
    const matchKey = outboundDialClaimKeyFromRaw(raw);
    const weakDigits = matchKey === '__nodigits__';
    if (sqlite) {
      const rows = sqlite
        .prepare(
          `SELECT id, lead_phone FROM call_queue
           WHERE client_key = ? AND status = 'pending' AND id != ? AND call_type = 'vapi_call'`
        )
        .all(clientKey, excludeId);
      let n = 0;
      for (const r of rows || []) {
        const same = weakDigits
          ? String(r.lead_phone || '').trim() === raw
          : outboundDialClaimKeyFromRaw(r.lead_phone) === matchKey;
        if (same) {
          sqlite
            .prepare(`UPDATE call_queue SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`)
            .run(r.id);
          n++;
        }
      }
      return n;
    }
    const keySql = pgQueueLeadPhoneKeyExpr('lead_phone');
    const result = await query(
      weakDigits
        ? `
      UPDATE call_queue
      SET status = 'cancelled', updated_at = now()
      WHERE client_key = $1
        AND status = 'pending'
        AND id != $2
        AND call_type = 'vapi_call'
        AND lead_phone = $3
      `
        : `
      UPDATE call_queue
      SET status = 'cancelled', updated_at = now()
      WHERE client_key = $1
        AND status = 'pending'
        AND id != $2
        AND call_type = 'vapi_call'
        AND (${keySql}) = $3
      `,
      weakDigits ? [clientKey, excludeId, raw] : [clientKey, excludeId, matchKey]
    );
    return result?.rowCount ?? result?.changes ?? 0;
  }

  async function getCallQueueByTenant(clientKey, limit = 100) {
    return callQueueReads.getCallQueueByTenant(query, clientKey, limit);
  }

  async function getCallQueueByPhone(clientKey, leadPhone, limit = 50) {
    return callQueueReads.getCallQueueByPhone(query, clientKey, leadPhone, limit);
  }

  /** Clear pending call queue rows. Optionally filter by clientKey and/or leadPhone. */
  async function clearCallQueue(args) {
    return callQueueWrites.clearCallQueue(query, args);
  }

  async function cleanupOldCallQueue(daysOld = 7) {
    await query(`
      DELETE FROM call_queue 
      WHERE created_at < now() - interval '${daysOld} days'
      AND status IN ('completed', 'failed', 'cancelled')
    `);
  }

  /**
   * Cancel extra pending `vapi_call` rows that share the same tenant + digit phone key (keeps earliest schedule).
   * Postgres only (queue dedupe for ops backfills).
   */
  async function dedupePendingVapiCallQueueRows() {
    const dbType = getDbType();
    const pool = getPool();
    if (dbType !== 'postgres' || !pool) {
      return { cancelled: 0, skipped: true };
    }
    const keyExpr = pgQueueLeadPhoneKeyExpr('cq.lead_phone');
    const result = await query(
      `
      WITH keyed AS (
        SELECT cq.id,
          cq.client_key,
          CASE
            WHEN (${keyExpr}) = '__nodigits__' THEN '__raw__:' || COALESCE(cq.lead_phone, '')
            ELSE (${keyExpr})
          END AS phone_key,
          cq.scheduled_for,
          cq.priority
        FROM call_queue cq
        WHERE cq.status = 'pending' AND cq.call_type = 'vapi_call'
      ),
      ranked AS (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY client_key, phone_key
            ORDER BY scheduled_for ASC, priority ASC, id ASC
          ) AS rn
        FROM keyed
      )
      UPDATE call_queue q
      SET status = 'cancelled', updated_at = now()
      FROM ranked r
      WHERE q.id = r.id AND r.rn > 1
      `
    );
    return { cancelled: result?.rowCount ?? 0, skipped: false };
  }

  return {
    invalidateOptOutDialCache,
    addToCallQueue,
    getPendingCalls,
    updateCallQueueStatus,
    cancelDuplicatePendingCalls,
    getCallQueueByTenant,
    getCallQueueByPhone,
    clearCallQueue,
    cleanupOldCallQueue,
    dedupePendingVapiCallQueueRows,
  };
}

