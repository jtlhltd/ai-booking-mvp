export function createOutboundWeekdayJourneyDomain({
  dbType,
  pool,
  sqlite,
  pgQueryLimiter,
  query,
  createHash,
  outboundDialClaimKeyFromRaw,
}) {
  if (typeof query !== 'function') throw new Error('createOutboundWeekdayJourneyDomain requires query');
  if (typeof createHash !== 'function') throw new Error('createOutboundWeekdayJourneyDomain requires createHash');
  if (typeof outboundDialClaimKeyFromRaw !== 'function') {
    throw new Error('createOutboundWeekdayJourneyDomain requires outboundDialClaimKeyFromRaw');
  }

  /** Mon=1 … Fri=16; all five weekday buckets used in one journey. */
  const OUTBOUND_WEEKDAY_FULL_MASK = 31;

  function tenantLocalWeekdayBitLuxon(weekday) {
    if (weekday < 1 || weekday > 5) return 0;
    return 1 << (weekday - 1);
  }

  function outboundBypassMultiplePerDay() {
    return /^(1|true|yes)$/i.test(String(process.env.ALLOW_MULTIPLE_OUTBOUND_CALLS_PER_DAY || '').trim());
  }

  /**
   * Remove outbound weekday journey row so automated dials can start a fresh Mon–Fri journey for this number.
   * @returns {Promise<{ ok: boolean, deleted?: number, reason?: string }>}
   */
  async function clearOutboundWeekdayJourneyForReopen(clientKey, leadPhone) {
    const raw = leadPhone != null ? String(leadPhone).trim() : '';
    if (!clientKey || !raw) return { ok: false, reason: 'invalid' };
    const claimKey = outboundDialClaimKeyFromRaw(raw);
    const r = await query(
      `DELETE FROM outbound_weekday_journey WHERE client_key = $1 AND phone_match_key = $2`,
      [clientKey, claimKey]
    );
    const deleted = r?.rowCount ?? r?.changes ?? 0;
    return { ok: true, deleted };
  }

  /**
   * Whether an automated outbound dial should be skipped for this number right now:
   * journey already terminal (live pickup or five weekday buckets used), or today's weekday bucket already claimed.
   * Opt out: ALLOW_MULTIPLE_OUTBOUND_CALLS_PER_DAY=1|true|yes
   * @param {{ asOf?: Date }} [opts] Optional clock for tests (`asOf` must fall on a Mon–Fri local day to exercise weekday_mask).
   * @returns {{ blocked: boolean, reason?: string, terminal?: boolean }}
   */
  async function hasOutboundWeekdayJourneyDialBlocked(clientKey, leadPhone, timezone = 'Europe/London', opts = {}) {
    if (outboundBypassMultiplePerDay()) {
      return { blocked: false };
    }
    const raw = leadPhone != null ? String(leadPhone).trim() : '';
    if (!clientKey || !raw) return { blocked: false };
    const claimKey = outboundDialClaimKeyFromRaw(raw);
    const { DateTime } = await import('luxon');
    const tz = timezone || 'Europe/London';
    const local =
      opts?.asOf instanceof Date && Number.isFinite(opts.asOf.getTime())
        ? DateTime.fromJSDate(opts.asOf, { zone: tz })
        : DateTime.now().setZone(tz);
    const dayBit = tenantLocalWeekdayBitLuxon(local.weekday);

    if (dbType === 'postgres' && pool) {
      const exec = () =>
        pool.query(
          `
        SELECT weekday_mask, closed_at, closed_reason
        FROM outbound_weekday_journey
        WHERE client_key = $1 AND phone_match_key = $2
        LIMIT 1
        `,
          [clientKey, claimKey]
        );
      const { rows } = pgQueryLimiter ? await pgQueryLimiter.run(exec) : await exec();
      const row = rows[0];
      if (!row) return { blocked: false };
      if (row.closed_at) {
        return { blocked: true, reason: 'journey_terminal', terminal: true };
      }
      const mask = Number(row.weekday_mask || 0);
      if (dayBit && (mask & dayBit) !== 0) {
        return { blocked: true, reason: 'weekday_slot_used', terminal: false };
      }
      return { blocked: false };
    }

    if (sqlite) {
      const row = sqlite
        .prepare(
          `SELECT weekday_mask, closed_at FROM outbound_weekday_journey WHERE client_key = ? AND phone_match_key = ?`
        )
        .get(clientKey, claimKey);
      if (!row) return { blocked: false };
      if (row.closed_at) return { blocked: true, reason: 'journey_terminal', terminal: true };
      const mask = Number(row.weekday_mask || 0);
      if (dayBit && (mask & dayBit) !== 0) {
        return { blocked: true, reason: 'weekday_slot_used', terminal: false };
      }
      return { blocked: false };
    }

    const { rows } = await query(
      `SELECT weekday_mask, closed_at FROM outbound_weekday_journey WHERE client_key = $1 AND phone_match_key = $2 LIMIT 1`,
      [clientKey, claimKey]
    );
    const row = rows[0];
    if (!row) return { blocked: false };
    if (row.closed_at) return { blocked: true, reason: 'journey_terminal', terminal: true };
    const mask = Number(row.weekday_mask || 0);
    if (dayBit && (mask & dayBit) !== 0) return { blocked: true, reason: 'weekday_slot_used', terminal: false };
    return { blocked: false };
  }

  /**
   * Reserve one outbound attempt for this tenant's local weekday bucket (Mon–Fri, tenant timezone).
   * Terminal journeys (live pickup or all five buckets used without pickup) reject further claims.
   * @param {{ asOf?: Date }} [opts] Optional clock for tests (Mon–Fri in `timezone`).
   * @returns {Promise<{ ok: boolean, reason?: string, closedReason?: string }>}
   */
  async function claimOutboundWeekdayJourneySlot(clientKey, leadPhone, timezone = 'Europe/London', opts = {}) {
    if (outboundBypassMultiplePerDay()) {
      return { ok: true, reason: 'bypass_env' };
    }
    const raw = leadPhone != null ? String(leadPhone).trim() : '';
    if (!clientKey || !raw) return { ok: false, reason: 'invalid' };

    const claimKey = outboundDialClaimKeyFromRaw(raw);
    const { DateTime } = await import('luxon');
    const tz = timezone || 'Europe/London';
    const local =
      opts?.asOf instanceof Date && Number.isFinite(opts.asOf.getTime())
        ? DateTime.fromJSDate(opts.asOf, { zone: tz })
        : DateTime.now().setZone(tz);
    const dayBit = tenantLocalWeekdayBitLuxon(local.weekday);
    if (!dayBit) {
      return { ok: false, reason: 'not_weekday' };
    }

    if (dbType !== 'postgres' || !pool) {
      const blocked = await hasOutboundWeekdayJourneyDialBlocked(clientKey, raw, timezone, opts);
      if (blocked.blocked) {
        return {
          ok: false,
          reason: blocked.reason || 'blocked',
          closedReason: blocked.terminal ? blocked.reason : undefined,
        };
      }
      if (sqlite) {
        const transBody = () => {
          const row = sqlite
            .prepare(
              `SELECT weekday_mask, closed_at, closed_reason FROM outbound_weekday_journey WHERE client_key = ? AND phone_match_key = ?`
            )
            .get(clientKey, claimKey);
          if (row?.closed_at) {
            throw Object.assign(new Error('journey_terminal'), { code: 'journey_terminal', closedReason: row.closed_reason });
          }
          const mask = Number(row?.weekday_mask || 0);
          if (mask & dayBit) {
            throw Object.assign(new Error('weekday_slot_used'), { code: 'weekday_slot_used' });
          }
          const newMask = mask | dayBit;
          const nowIso = new Date().toISOString();
          if (row) {
            const closed = newMask === OUTBOUND_WEEKDAY_FULL_MASK;
            sqlite
              .prepare(
                `UPDATE outbound_weekday_journey SET weekday_mask = ?, closed_at = ?, closed_reason = ?, updated_at = ?
                 WHERE client_key = ? AND phone_match_key = ?`
              )
              .run(
                newMask,
                closed ? nowIso : row.closed_at,
                closed ? 'weekdays_exhausted' : row.closed_reason,
                nowIso,
                clientKey,
                claimKey
              );
          } else {
            const closed = newMask === OUTBOUND_WEEKDAY_FULL_MASK;
            sqlite
              .prepare(
                `INSERT INTO outbound_weekday_journey (client_key, phone_match_key, weekday_mask, closed_at, closed_reason, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
              )
              .run(
                clientKey,
                claimKey,
                newMask,
                closed ? nowIso : null,
                closed ? 'weekdays_exhausted' : null,
                nowIso,
                nowIso
              );
          }
        };
        const trans = typeof sqlite.transaction === 'function' ? sqlite.transaction(transBody) : transBody;
        try {
          trans();
        } catch (e) {
          if (e?.code === 'journey_terminal') {
            return { ok: false, reason: 'journey_terminal', closedReason: e.closedReason };
          }
          if (e?.code === 'weekday_slot_used') {
            return { ok: false, reason: 'weekday_slot_used' };
          }
          throw e;
        }
        return { ok: true, reason: 'claimed_sqlite' };
      }
      return { ok: false, reason: 'nonpg_no_sqlite' };
    }

    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const h = createHash('sha256').update(`${clientKey}\0${claimKey}\0outbound_weekday_journey\0`).digest();
      const k1 = (h.readUInt32BE(0) & 0x7fffffff) || 1;
      const k2 = (h.readUInt32BE(4) & 0x7fffffff) || 1;
      await c.query('SELECT pg_advisory_xact_lock($1, $2)', [k1, k2]);

      const sel = await c.query(
        `SELECT weekday_mask, closed_at, closed_reason
         FROM outbound_weekday_journey
         WHERE client_key = $1 AND phone_match_key = $2
         FOR UPDATE`,
        [clientKey, claimKey]
      );
      const row0 = sel.rows[0];
      if (row0?.closed_at) {
        await c.query('ROLLBACK');
        return { ok: false, reason: 'journey_terminal', closedReason: row0.closed_reason };
      }
      const mask = Number(row0?.weekday_mask || 0);
      if (mask & dayBit) {
        await c.query('ROLLBACK');
        return { ok: false, reason: 'weekday_slot_used' };
      }
      const newMask = mask | dayBit;
      if (row0) {
        await c.query(
          `
          UPDATE outbound_weekday_journey SET
            weekday_mask = $3::smallint,
            closed_at = CASE WHEN $3::smallint = $4::smallint THEN COALESCE(closed_at, now()) ELSE closed_at END,
            closed_reason = CASE
              WHEN $3::smallint = $4::smallint THEN COALESCE(closed_reason, 'weekdays_exhausted')
              ELSE closed_reason
            END,
            updated_at = now()
          WHERE client_key = $1 AND phone_match_key = $2
          `,
          [clientKey, claimKey, newMask, OUTBOUND_WEEKDAY_FULL_MASK]
        );
      } else {
        await c.query(
          `
          INSERT INTO outbound_weekday_journey (client_key, phone_match_key, weekday_mask, closed_at, closed_reason, updated_at)
          VALUES (
            $1, $2, $3::smallint,
            CASE WHEN $3::smallint = $4::smallint THEN now() ELSE NULL END,
            CASE WHEN $3::smallint = $4::smallint THEN 'weekdays_exhausted' ELSE NULL END,
            now()
          )
          `,
          [clientKey, claimKey, newMask, OUTBOUND_WEEKDAY_FULL_MASK]
        );
      }

      await c.query('COMMIT');
      return { ok: true, reason: 'claimed' };
    } catch (e) {
      try {
        await c.query('ROLLBACK');
      } catch (_) {
        /* ignore */
      }
      throw e;
    } finally {
      c.release();
    }
  }

  /**
   * Roll back a same-day weekday slot claim when the outbound call failed to start.
   *
   * IMPORTANT: This is a best-effort safety valve to prevent "no calls for days" when Vapi start fails
   * after we claimed the weekday bucket. It only unsets *today's* weekday bit and re-opens
   * `weekdays_exhausted` closures if applicable.
   *
   * This is intentionally not called for `weekday_slot_used` / `journey_terminal` outcomes (those are real blocks).
   *
   * @param {{ asOf?: Date }} [opts] Optional clock for tests (Mon–Fri in `timezone`).
   */
  async function rollbackOutboundWeekdayJourneySlot(clientKey, leadPhone, timezone = 'Europe/London', opts = {}) {
    if (outboundBypassMultiplePerDay()) return;
    const raw = leadPhone != null ? String(leadPhone).trim() : '';
    if (!clientKey || !raw) return;

    const claimKey = outboundDialClaimKeyFromRaw(raw);
    const { DateTime } = await import('luxon');
    const tz = timezone || 'Europe/London';
    const local =
      opts?.asOf instanceof Date && Number.isFinite(opts.asOf.getTime())
        ? DateTime.fromJSDate(opts.asOf, { zone: tz })
        : DateTime.now().setZone(tz);
    const dayBit = tenantLocalWeekdayBitLuxon(local.weekday);
    if (!dayBit) return; // weekend: no bit to roll back

    // SQLite path
    if (dbType !== 'postgres' || !pool) {
      if (!sqlite) return;
      const nowIso = new Date().toISOString();
      try {
        const trans = sqlite.transaction(() => {
          const row = sqlite
            .prepare(
              `SELECT weekday_mask, closed_at, closed_reason FROM outbound_weekday_journey WHERE client_key = ? AND phone_match_key = ?`
            )
            .get(clientKey, claimKey);
          if (!row) return;
          const mask = Number(row.weekday_mask || 0);
          if ((mask & dayBit) === 0) return;
          const newMask = mask & ~dayBit;
          const willReopen =
            row.closed_at != null &&
            String(row.closed_reason || '') === 'weekdays_exhausted' &&
            newMask !== OUTBOUND_WEEKDAY_FULL_MASK;
          sqlite
            .prepare(
              `UPDATE outbound_weekday_journey
               SET weekday_mask = ?,
                   closed_at = ?,
                   closed_reason = ?,
                   updated_at = ?
               WHERE client_key = ? AND phone_match_key = ?`
            )
            .run(
              newMask,
              willReopen ? null : row.closed_at,
              willReopen ? null : row.closed_reason,
              nowIso,
              clientKey,
              claimKey
            );
        });
        trans();
      } catch (e) {
        console.warn('[OUTBOUND WEEKDAY JOURNEY] rollback failed (sqlite):', e?.message || e);
      }
      return;
    }

    // Postgres path
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const h = createHash('sha256').update(`${clientKey}\0${claimKey}\0outbound_weekday_journey\0`).digest();
      const k1 = (h.readUInt32BE(0) & 0x7fffffff) || 1;
      const k2 = (h.readUInt32BE(4) & 0x7fffffff) || 1;
      await c.query('SELECT pg_advisory_xact_lock($1, $2)', [k1, k2]);

      const sel = await c.query(
        `SELECT weekday_mask, closed_at, closed_reason
         FROM outbound_weekday_journey
         WHERE client_key = $1 AND phone_match_key = $2
         FOR UPDATE`,
        [clientKey, claimKey]
      );
      const row0 = sel.rows[0];
      if (!row0) {
        await c.query('ROLLBACK');
        return;
      }
      const mask = Number(row0.weekday_mask || 0);
      if ((mask & dayBit) === 0) {
        await c.query('ROLLBACK');
        return;
      }
      const newMask = mask & ~dayBit;
      const willReopen =
        row0.closed_at != null &&
        String(row0.closed_reason || '') === 'weekdays_exhausted' &&
        newMask !== OUTBOUND_WEEKDAY_FULL_MASK;
      await c.query(
        `
        UPDATE outbound_weekday_journey SET
          weekday_mask = $3::smallint,
          closed_at = CASE WHEN $4::boolean THEN NULL ELSE closed_at END,
          closed_reason = CASE WHEN $4::boolean THEN NULL ELSE closed_reason END,
          updated_at = now()
        WHERE client_key = $1 AND phone_match_key = $2
        `,
        [clientKey, claimKey, newMask, willReopen]
      );
      await c.query('COMMIT');
    } catch (e) {
      try {
        await c.query('ROLLBACK');
      } catch (_) {
        /* ignore */
      }
      console.warn('[OUTBOUND WEEKDAY JOURNEY] rollback failed (pg):', e?.message || e);
    } finally {
      c.release();
    }
  }

  /** After a live human answers an outbound call, stop further automated dials for this journey until manually cleared. */
  async function closeOutboundWeekdayJourneyOnLivePickup(clientKey, leadPhone) {
    const raw = leadPhone != null ? String(leadPhone).trim() : '';
    if (!clientKey || !raw) return;
    const claimKey = outboundDialClaimKeyFromRaw(raw);

    if (dbType === 'postgres' && pool) {
      await pool.query(
        `
        INSERT INTO outbound_weekday_journey (client_key, phone_match_key, weekday_mask, closed_at, closed_reason, updated_at)
        VALUES ($1, $2, 0, now(), 'live_pickup', now())
        ON CONFLICT (client_key, phone_match_key) DO UPDATE SET
          closed_at = COALESCE(outbound_weekday_journey.closed_at, now()),
          closed_reason = CASE
            WHEN outbound_weekday_journey.closed_reason IS NOT NULL THEN outbound_weekday_journey.closed_reason
            ELSE 'live_pickup'
          END,
          updated_at = now()
        `,
        [clientKey, claimKey]
      );
      return;
    }

    if (sqlite) {
      const nowIso = new Date().toISOString();
      const row = sqlite
        .prepare(`SELECT closed_at, closed_reason FROM outbound_weekday_journey WHERE client_key = ? AND phone_match_key = ?`)
        .get(clientKey, claimKey);
      if (row) {
        sqlite
          .prepare(
            `UPDATE outbound_weekday_journey SET
              closed_at = COALESCE(closed_at, ?),
              closed_reason = COALESCE(closed_reason, 'live_pickup'),
              updated_at = ?
            WHERE client_key = ? AND phone_match_key = ?`
          )
          .run(nowIso, nowIso, clientKey, claimKey);
      } else {
        sqlite
          .prepare(
            `INSERT INTO outbound_weekday_journey (client_key, phone_match_key, weekday_mask, closed_at, closed_reason, created_at, updated_at)
             VALUES (?, ?, 0, ?, 'live_pickup', ?, ?)`
          )
          .run(clientKey, claimKey, nowIso, nowIso, nowIso);
      }
    }
  }

  /** Legacy name: true when weekday journey blocks another dial right now (terminal or today's bucket used). */
  async function hasOutboundCallAttemptToday(clientKey, leadPhone, timezone = 'Europe/London', opts = {}) {
    const r = await hasOutboundWeekdayJourneyDialBlocked(clientKey, leadPhone, timezone, opts);
    return r.blocked;
  }

  /** Legacy name: reserve Mon–Fri weekday bucket (see claimOutboundWeekdayJourneySlot). */
  async function claimOutboundDialSlotForToday(clientKey, leadPhone, timezone = 'Europe/London', opts = {}) {
    return claimOutboundWeekdayJourneySlot(clientKey, leadPhone, timezone, opts);
  }

  return {
    clearOutboundWeekdayJourneyForReopen,
    hasOutboundWeekdayJourneyDialBlocked,
    claimOutboundWeekdayJourneySlot,
    rollbackOutboundWeekdayJourneySlot,
    closeOutboundWeekdayJourneyOnLivePickup,
    hasOutboundCallAttemptToday,
    claimOutboundDialSlotForToday,
  };
}

