export function createCallTimeBanditDomain({ query, poolQuerySelect, getCallAnalyticsFloorIso, getFullClient }) {
  /**
   * Recompute stored Beta arms from observations tied to calls on/after the analytics floor.
   */
  async function rebuildCallTimeBanditArmsForCutoff(clientKey) {
    const minIso = await getCallAnalyticsFloorIso();
    if (!clientKey) return;
    const { rows } = await query(
      `
      SELECT o.hour AS hour, o.success AS success
      FROM call_time_bandit_observations o
      INNER JOIN calls c ON c.call_id = o.call_id AND c.client_key = o.client_key
      WHERE o.client_key = $1 AND c.created_at >= $2::timestamptz
    `,
      [clientKey, minIso]
    );
    const arms = {};
    for (let h = 0; h < 24; h++) {
      arms[String(h)] = { a: 1, b: 1 };
    }
    for (const r of rows || []) {
      const hourNum = Number(r.hour);
      if (!Number.isFinite(hourNum)) continue;
      const hk = String(hourNum);
      const prev = arms[hk] || { a: 1, b: 1 };
      const a = Number(prev.a) || 1;
      const b = Number(prev.b) || 1;
      const success = r.success === true || r.success === 1 || r.success === 'true';
      arms[hk] = success ? { a: a + 1, b } : { a, b: b + 1 };
    }
    await query(
      `
      INSERT INTO call_time_bandit (client_key, arms, updated_at)
      VALUES ($1, $2::jsonb, now())
      ON CONFLICT (client_key)
      DO UPDATE SET arms = EXCLUDED.arms, updated_at = now()
    `,
      [clientKey, JSON.stringify(arms)]
    );
  }

  /** Limit full recomputes on hot dashboard polling (floor is always on). */
  const _banditCutoffRebuildLastMs = new Map();
  const BANDIT_CUTOFF_DASHBOARD_REBUILD_MS = 60_000;

  async function maybeRebuildBanditArmsForCutoffThrottled(clientKey) {
    if (!clientKey) return;
    await getCallAnalyticsFloorIso();
    const now = Date.now();
    const last = _banditCutoffRebuildLastMs.get(clientKey) || 0;
    if (now - last < BANDIT_CUTOFF_DASHBOARD_REBUILD_MS) return;
    _banditCutoffRebuildLastMs.set(clientKey, now);
    await rebuildCallTimeBanditArmsForCutoff(clientKey);
  }

  async function getCallTimeBanditState(clientKey) {
    try {
      const { rows } = await poolQuerySelect(`SELECT arms FROM call_time_bandit WHERE client_key = $1`, [clientKey]);
      const arms = rows?.[0]?.arms;
      if (arms == null) return {};
      if (typeof arms === 'object') return { ...arms };
      return {};
    } catch (e) {
      console.warn('[CALL TIME BANDIT] getCallTimeBanditState:', e.message);
      return {};
    }
  }

  /**
   * Dashboard payload: Beta posteriors per clock hour (tenant-local) for Thompson dial-time learning.
   */
  async function getCallTimeBanditForDashboard(clientKey) {
    const empty = {
      ok: true,
      updatedAt: null,
      observationCount: 0,
      observationsLast7Days: 0,
      hours: [],
      ranked: [],
      recentActivity: [],
      scheduleAdjustments: [],
    };
    if (!clientKey) return { ...empty, ok: false, error: 'missing client' };

    try {
      await maybeRebuildBanditArmsForCutoffThrottled(clientKey);
      const minIso = await getCallAnalyticsFloorIso();

      const [{ rows: br }, { rows: cr }] = await Promise.all([
        poolQuerySelect(`SELECT arms, updated_at FROM call_time_bandit WHERE client_key = $1`, [clientKey]),
        poolQuerySelect(
          `
          SELECT COUNT(*) AS c
          FROM call_time_bandit_observations o
          INNER JOIN calls c ON c.call_id = o.call_id AND c.client_key = o.client_key
          WHERE o.client_key = $1 AND c.created_at >= $2::timestamptz
        `,
          [clientKey, minIso]
        ),
      ]);

      const observationCount = parseInt(String(cr?.[0]?.c ?? 0), 10) || 0;
      const updatedAt = br?.[0]?.updated_at ? new Date(br[0].updated_at).toISOString() : null;
      const raw = br?.[0]?.arms;
      const arms = raw != null && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};

      const hours = [];
      for (let h = 0; h < 24; h++) {
        const hk = String(h);
        const prev = arms[hk] || { a: 1, b: 1 };
        const a = Number(prev.a) || 1;
        const b = Number(prev.b) || 1;
        const ab = a + b;
        const mean = ab > 0 ? a / ab : 0.5;
        const successes = Math.max(0, Math.round(a - 1));
        const failures = Math.max(0, Math.round(b - 1));
        const observations = successes + failures;
        const varBeta = ab > 0 ? (a * b) / (ab * ab * (ab + 1)) : 0.25;
        const uncertainty = Math.min(50, Math.round(100 * Math.sqrt(varBeta)));
        let strength = 'prior';
        if (observations >= 40) strength = 'strong';
        else if (observations >= 8) strength = 'building';
        else if (observations >= 1) strength = 'early';

        hours.push({
          hour: h,
          label: `${String(h).padStart(2, '0')}:00`,
          alpha: a,
          beta: b,
          meanAnsweredPct: Math.round(mean * 100),
          successes,
          failures,
          observations,
          uncertainty,
          strength,
        });
      }

      const ranked = [...hours]
        .filter((x) => x.observations > 0)
        .sort((x, y) => y.meanAnsweredPct - x.meanAnsweredPct || y.observations - x.observations)
        .slice(0, 12);

      const [{ rows: recentObs }, { rows: recentSched }, { rows: c7 }] = await Promise.all([
        poolQuerySelect(
          `
          SELECT o.call_id, o.hour, o.success, o.created_at
          FROM call_time_bandit_observations o
          INNER JOIN calls c ON c.call_id = o.call_id AND c.client_key = o.client_key
          WHERE o.client_key = $1 AND c.created_at >= $2::timestamptz
          ORDER BY o.created_at DESC
          LIMIT 40
        `,
          [clientKey, minIso]
        ),
        poolQuerySelect(
          `
          SELECT baseline_at, chosen_at, source, hour_chosen, delay_minutes, created_at
          FROM call_schedule_decisions
          WHERE client_key = $1 AND created_at >= $2::timestamptz
          ORDER BY created_at DESC
          LIMIT 30
        `,
          [clientKey, minIso]
        ),
        poolQuerySelect(
          `
          SELECT COUNT(*) AS c
          FROM call_time_bandit_observations o
          INNER JOIN calls c ON c.call_id = o.call_id AND c.client_key = o.client_key
          WHERE o.client_key = $1
            AND c.created_at >= $2::timestamptz
            AND c.created_at >= NOW() - INTERVAL '7 days'
        `,
          [clientKey, minIso]
        ),
      ]);

      const observationsLast7Days = parseInt(String(c7?.[0]?.c ?? 0), 10) || 0;
      const recentActivity = (recentObs || []).map((r) => ({
        callId: r.call_id,
        hour: r.hour,
        success: Boolean(r.success),
        at: r.created_at ? new Date(r.created_at).toISOString() : null,
      }));
      const scheduleAdjustments = (recentSched || []).map((r) => ({
        baselineAt: r.baseline_at ? new Date(r.baseline_at).toISOString() : null,
        chosenAt: r.chosen_at ? new Date(r.chosen_at).toISOString() : null,
        source: r.source,
        hourChosen: r.hour_chosen,
        delayMinutes: r.delay_minutes,
        at: r.created_at ? new Date(r.created_at).toISOString() : null,
      }));

      return {
        ok: true,
        updatedAt,
        observationCount,
        observationsLast7Days,
        hours,
        ranked,
        recentActivity,
        scheduleAdjustments,
      };
    } catch (e) {
      console.warn('[CALL TIME BANDIT] getCallTimeBanditForDashboard:', e.message);
      return {
        ...empty,
        ok: false,
        error: e.message,
        recentActivity: [],
        scheduleAdjustments: [],
        observationsLast7Days: 0,
      };
    }
  }

  function isBanditEligibleCallRow(row) {
    const st = (row.status || '').toString().trim().toLowerCase();
    if (['initiated', 'in_progress', 'queued', 'pending', 'ringing'].includes(st)) return false;
    const dur = row.duration != null ? Number(row.duration) : null;
    const hasOutcome = row.outcome != null && String(row.outcome).trim() !== '';
    if (!hasOutcome && (dur == null || dur === 0) && !['ended', 'completed', 'finished', 'failed'].includes(st)) {
      return false;
    }
    return true;
  }

  /**
   * Populate bandit observations from historical calls missing from call_time_bandit_observations.
   * Merges posteriors in one write. Safe to run repeatedly.
   */
  async function backfillCallTimeBanditObservations(clientKey, { days = 30, limit = 4000 } = {}) {
    if (!clientKey) return { inserted: 0, skipped: true };
    try {
      const minIso = await getCallAnalyticsFloorIso();
      await rebuildCallTimeBanditArmsForCutoff(clientKey);

      const tenant = await getFullClient(clientKey);
      if (!tenant) return { inserted: 0 };

      const { getTenantTimezone } = await import('../../lib/business-hours.js');
      const { DateTime } = await import('luxon');
      const { isAnsweredHeuristic } = await import('../../lib/call-outcome-heuristics.js');

      const tz = getTenantTimezone(tenant, process.env.TZ || process.env.TIMEZONE || 'Europe/London');
      const d = Math.max(1, Math.min(120, Number(days) || 30));
      const lim = Math.max(1, Math.min(8000, Number(limit) || 4000));

      const { rows } = await query(
        `
        SELECT c.call_id, c.created_at, c.outcome, c.status, c.duration,
               LEFT(COALESCE(c.transcript, ''), 512) AS transcript, c.recording_url
        FROM calls c
        WHERE c.client_key = $1
          AND c.created_at >= NOW() - ($2::integer * INTERVAL '1 day')
          AND c.created_at >= $4::timestamptz
          AND NOT EXISTS (
            SELECT 1 FROM call_time_bandit_observations o WHERE o.call_id = c.call_id
          )
        ORDER BY c.created_at ASC
        LIMIT $3
      `,
        [clientKey, d, lim, minIso]
      );

      const arms = { ...(await getCallTimeBanditState(clientKey)) };
      const toInsert = [];

      for (const row of rows || []) {
        if (!row?.call_id || !row.created_at) continue;
        if (!isBanditEligibleCallRow(row)) continue;
        const dt = DateTime.fromJSDate(new Date(row.created_at), { zone: tz });
        if (!dt.isValid) continue;
        const hour = dt.hour;
        const success = isAnsweredHeuristic(row);
        toInsert.push({
          call_id: String(row.call_id),
          client_key: clientKey,
          hour,
          success,
        });
        const hk = String(hour);
        const prev = arms[hk] || { a: 1, b: 1 };
        const a = Number(prev.a) || 1;
        const b = Number(prev.b) || 1;
        arms[hk] = success ? { a: a + 1, b } : { a, b: b + 1 };
      }

      if (toInsert.length === 0) return { inserted: 0 };

      const chunkSize = 80;
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        const placeholders = chunk
          .map((_, j) => {
            const o = j * 4;
            return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4})`;
          })
          .join(', ');
        const flat = chunk.flatMap((x) => [x.call_id, x.client_key, x.hour, x.success]);
        await query(
          `
          INSERT INTO call_time_bandit_observations (call_id, client_key, hour, success)
          VALUES ${placeholders}
          ON CONFLICT (call_id) DO NOTHING
        `,
          flat
        );
      }

      await query(
        `
        INSERT INTO call_time_bandit (client_key, arms, updated_at)
        VALUES ($1, $2::jsonb, now())
        ON CONFLICT (client_key)
        DO UPDATE SET arms = EXCLUDED.arms, updated_at = now()
      `,
        [clientKey, JSON.stringify(arms)]
      );

      return { inserted: toInsert.length };
    } catch (e) {
      console.warn('[CALL TIME BANDIT] backfill:', e.message);
      return { inserted: 0, error: e.message };
    }
  }

  async function recordCallScheduleDecision({ clientKey, baselineAt, chosenAt, source, hourChosen, delayMinutes }) {
    if (!clientKey || !baselineAt || !chosenAt || !source) return;
    try {
      await query(
        `
        INSERT INTO call_schedule_decisions
          (client_key, baseline_at, chosen_at, source, hour_chosen, delay_minutes)
        VALUES ($1, $2::timestamptz, $3::timestamptz, $4, $5, $6)
      `,
        [
          clientKey,
          baselineAt instanceof Date ? baselineAt.toISOString() : baselineAt,
          chosenAt instanceof Date ? chosenAt.toISOString() : chosenAt,
          String(source),
          hourChosen != null ? Number(hourChosen) : null,
          delayMinutes != null ? Number(delayMinutes) : null,
        ]
      );
    } catch (e) {
      console.warn('[CALL SCHEDULE] log skipped:', e.message);
    }
  }

  async function mergeCallTimeBanditPosterior(clientKey, hour, success) {
    const hk = String(hour);
    const curState = await getCallTimeBanditState(clientKey);
    const arms = { ...curState };
    const prev = arms[hk] || { a: 1, b: 1 };
    const a = Number(prev.a) || 1;
    const b = Number(prev.b) || 1;
    arms[hk] = success ? { a: a + 1, b } : { a, b: b + 1 };
    await query(
      `
      INSERT INTO call_time_bandit (client_key, arms, updated_at)
      VALUES ($1, $2::jsonb, now())
      ON CONFLICT (client_key)
      DO UPDATE SET arms = EXCLUDED.arms, updated_at = now()
    `,
      [clientKey, JSON.stringify(arms)]
    );
  }

  /**
   * Idempotent: one bandit update per call_id. Uses call created_at hour in tenant TZ; label = answered heuristic.
   */
  async function recordCallTimeBanditAfterCallComplete({ clientKey, callId }) {
    if (!clientKey || !callId) return;
    try {
      const { rows } = await query(
        `
        SELECT call_id, created_at, outcome, status, duration, transcript, recording_url
        FROM calls
        WHERE call_id = $1 AND client_key = $2
      `,
        [callId, clientKey]
      );
      const row = rows?.[0];
      if (!row?.created_at) return;

      const minIso = await getCallAnalyticsFloorIso();
      if (new Date(row.created_at).getTime() < new Date(minIso).getTime()) {
        return;
      }

      const st = (row.status || '').toString().trim().toLowerCase();
      if (['initiated', 'in_progress', 'queued', 'pending', 'ringing'].includes(st)) return;
      const dur = row.duration != null ? Number(row.duration) : null;
      const hasOutcome = row.outcome != null && String(row.outcome).trim() !== '';
      if (!hasOutcome && (dur == null || dur === 0) && !['ended', 'completed', 'finished', 'failed'].includes(st)) {
        return;
      }

      const tenant = await getFullClient(clientKey);
      if (!tenant) return;

      const { getTenantTimezone } = await import('../../lib/business-hours.js');
      const { DateTime } = await import('luxon');
      const { isAnsweredHeuristic } = await import('../../lib/call-outcome-heuristics.js');

      const tz = getTenantTimezone(tenant, process.env.TZ || process.env.TIMEZONE || 'Europe/London');
      const dt = DateTime.fromJSDate(new Date(row.created_at), { zone: tz });
      if (!dt.isValid) return;
      const hour = dt.hour;
      const success = isAnsweredHeuristic(row);

      await rebuildCallTimeBanditArmsForCutoff(clientKey);

      const ins = await query(
        `
        INSERT INTO call_time_bandit_observations (call_id, client_key, hour, success)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (call_id) DO NOTHING
        RETURNING call_id
      `,
        [callId, clientKey, hour, success]
      );

      if (ins.rows?.length) {
        await mergeCallTimeBanditPosterior(clientKey, hour, success);
      }
    } catch (e) {
      console.warn('[CALL TIME BANDIT] record skipped:', e.message);
    }
  }

  return {
    getCallTimeBanditState,
    getCallTimeBanditForDashboard,
    backfillCallTimeBanditObservations,
    recordCallScheduleDecision,
    recordCallTimeBanditAfterCallComplete,
  };
}

