import messagingService from './messaging-service.js';

function asInt(v) {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function truthyEnv(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s !== '' && !['0', 'false', 'no', 'off'].includes(s);
}

/** Default on: nudge pending vapi_call rows off exact local HH:00:00 before measuring spike. */
function autoSmearTopOfHourEnabled(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === '') return true;
  return !['0', 'false', 'no', 'off'].includes(s);
}

async function checkOneClient({ query, clientKey, timezone, lookbackMinutes, processingStuckMinutes, onHourSpikeThreshold }) {
  const ck = clientKey;
  const tz = timezone || process.env.TZ || process.env.TIMEZONE || 'Europe/London';
  const retryDueThreshold = Math.max(1, Math.min(1_000_000, asInt(process.env.OPS_INVARIANTS_RETRY_DUE_THRESHOLD || 50)));

  if (autoSmearTopOfHourEnabled(process.env.OPS_INVARIANTS_AUTO_SMEAR_TOP_OF_HOUR)) {
    try {
      // Use ROW_NUMBER so every row gets a distinct offset. (id % 997) collides for ids differing by 997,
      // leaving dozens of rows on the same instant and the spike check unchanged.
      await query(
        `
          WITH bounds AS (
            SELECT
              ((date_trunc('day', NOW() AT TIME ZONE $2) + INTERVAL '1 day') AT TIME ZONE $2) AS t0,
              ((date_trunc('day', NOW() AT TIME ZONE $2) + INTERVAL '2 day') AT TIME ZONE $2) AS t1
          ),
          targets AS (
            SELECT cq.id,
                   ROW_NUMBER() OVER (ORDER BY cq.id) AS rn
            FROM call_queue cq
            CROSS JOIN bounds b
            WHERE cq.client_key = $1
              AND cq.call_type = 'vapi_call'
              AND cq.status = 'pending'
              AND cq.scheduled_for >= b.t0
              AND cq.scheduled_for < b.t1
              AND EXTRACT(MINUTE FROM (cq.scheduled_for AT TIME ZONE $2)) = 0
              AND EXTRACT(SECOND FROM (cq.scheduled_for AT TIME ZONE $2)) = 0
          )
          UPDATE call_queue cq
          SET scheduled_for = cq.scheduled_for + targets.rn * INTERVAL '1 millisecond',
              updated_at = NOW()
          FROM targets
          WHERE cq.id = targets.id
        `,
        [ck, tz]
      );
    } catch (e) {
      console.warn('[OPS INVARIANTS] auto-smear top-of-hour failed:', e?.message || e);
    }
  }

  const rows = {};

  // 1) Phantom completes should be impossible on new writes. If >0, something is wrong.
  rows.phantom = await query(
    `
      SELECT COUNT(*)::int AS n
      FROM call_queue
      WHERE client_key = $1
        AND call_type = 'vapi_call'
        AND status = 'completed'
        AND initiated_call_id IS NULL
        AND updated_at >= NOW() - ($2::int * INTERVAL '1 minute')
    `,
    [ck, lookbackMinutes]
  );

  // 2) Stuck processing rows indicate a worker crash or logic bug.
  rows.stuck = await query(
    `
      SELECT COUNT(*)::int AS n
      FROM call_queue
      WHERE client_key = $1
        AND call_type = 'vapi_call'
        AND status = 'processing'
        AND updated_at < NOW() - ($2::int * INTERVAL '1 minute')
    `,
    [ck, processingStuckMinutes]
  );

  // 3) Top-of-hour spike check: if we schedule many calls exactly at HH:00:00 local time, they will clump.
  // Check tomorrow window in the tenant's local day.
  rows.onHour = await query(
    `
      WITH bounds AS (
        SELECT
          ((date_trunc('day', NOW() AT TIME ZONE $2) + INTERVAL '1 day') AT TIME ZONE $2) AS t0,
          ((date_trunc('day', NOW() AT TIME ZONE $2) + INTERVAL '2 day') AT TIME ZONE $2) AS t1
      )
      SELECT COALESCE(MAX(c), 0)::int AS max_per_exact_hour
      FROM (
        SELECT scheduled_for, COUNT(*)::int AS c
        FROM call_queue cq
        CROSS JOIN bounds b
        WHERE cq.client_key = $1
          AND cq.call_type = 'vapi_call'
          AND cq.status = 'pending'
          AND cq.scheduled_for >= b.t0
          AND cq.scheduled_for < b.t1
          AND EXTRACT(MINUTE FROM (cq.scheduled_for AT TIME ZONE $2)) = 0
          AND EXTRACT(SECOND FROM (cq.scheduled_for AT TIME ZONE $2)) = 0
        GROUP BY 1
      ) x
    `,
    [ck, tz]
  );

  // 4) Retry queue due-now should be small; if huge, workers aren’t keeping up.
  rows.retryDue = await query(
    `
      SELECT COUNT(*)::int AS n
      FROM retry_queue
      WHERE client_key = $1
        AND status = 'pending'
        AND scheduled_for <= NOW()
    `,
    [ck]
  );

  // 5) Dial burst (intent: billing.no-burst-dial / dial.imports-distribute-not-burst):
  // count Vapi calls initiated in the last 5 minutes, bucketed by minute. If any
  // minute exceeds the configured threshold we likely re-introduced a direct-dial
  // path or an unthrottled retry loop.
  const dialBurstThreshold = Math.max(
    1,
    Math.min(10_000, asInt(process.env.OPS_INVARIANTS_DIAL_BURST_PER_MINUTE_THRESHOLD || 15))
  );
  rows.dialBurst = await query(
    `
      SELECT COALESCE(MAX(c), 0)::int AS max_per_minute
      FROM (
        SELECT date_trunc('minute', created_at) AS m, COUNT(*)::int AS c
        FROM calls
        WHERE client_key = $1
          AND created_at >= NOW() - INTERVAL '5 minutes'
        GROUP BY 1
      ) x
    `,
    [ck]
  );

  // 6) Import burst unspaced (intent: dial.imports-distribute-not-burst):
  // for import-triggered call_queue rows scheduled in the next 24h, count the
  // largest cluster sharing an exact scheduled_for instant. >1 indicates the
  // routing/scheduling distribution did not space the leads.
  rows.importBurst = await query(
    `
      SELECT COALESCE(MAX(c), 0)::int AS max_per_instant
      FROM (
        SELECT scheduled_for, COUNT(*)::int AS c
        FROM call_queue
        WHERE client_key = $1
          AND call_type = 'vapi_call'
          AND status = 'pending'
          AND scheduled_for >= NOW()
          AND scheduled_for < NOW() + INTERVAL '24 hours'
          AND (call_data->>'triggerType') IN ('new_lead_import', 'follow_up_retry', 'manual_recall')
        GROUP BY scheduled_for
        HAVING COUNT(*) > 1
      ) x
    `,
    [ck]
  );

  // 7) Retry loop per lead (intent: billing.max-retries-bounded):
  // count the largest number of retry-triggered Vapi rows queued for any single
  // phone in the last 24h. If this exceeds MAX_RETRIES_PER_LEAD a runaway retry
  // loop is generating duplicate dials for the same lead and burning credits.
  const maxRetriesPerLead = Math.max(
    1,
    Math.min(1000, asInt(process.env.MAX_RETRIES_PER_LEAD || 3))
  );
  rows.retryLoopPerLead = await query(
    `
      SELECT COALESCE(MAX(c), 0)::int AS max_per_lead
      FROM (
        SELECT lead_phone, COUNT(*)::int AS c
        FROM call_queue
        WHERE client_key = $1
          AND call_type = 'vapi_call'
          AND (call_data->>'triggerType') IN ('follow_up_retry', 'follow_up_retry_queue')
          AND created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY lead_phone
        HAVING COUNT(*) > 0
      ) x
    `,
    [ck]
  );

  // 8a) Vapi concurrency-limiter underflow (intent: queue.concurrency-cap /
  // billing.no-burst-dial). The in-memory limiter in lib/instant-calling.js
  // exposes a counter that increments any time _releaseOneSlot is called with
  // currentVapiCalls === 0 (a release without matching acquire) or whenever
  // the VAPI_CONCURRENCY_RELEASE_UNKNOWN=1 escape hatch fires. Both indicate
  // we are accounting concurrency wrong on this instance — and the existing
  // Math.max(0, …) clamp hides it. NOTE: this is process-local. In a
  // multi-instance deployment, only the instance running this cron is checked.
  let underflowCount = 0;
  let unknownReleaseCount = 0;
  try {
    const mod = await import('./instant-calling.js');
    if (typeof mod.getVapiConcurrencyState === 'function') {
      const s = mod.getVapiConcurrencyState() || {};
      underflowCount = asInt(s.underflowCount);
      unknownReleaseCount = asInt(s.unknownReleaseCount);
    }
  } catch {
    // instant-calling not loadable in this context — skip silently
  }

  // 8) Past scheduled_for (intent: scheduling.no-past-scheduled-for):
  // any pending call_queue row inserted in the last 5 minutes whose
  // scheduled_for is strictly earlier than its created_at indicates the
  // scheduler returned a past timestamp, which makes the worker dial
  // immediately and defeats the routing/distribution layer.
  rows.pastScheduledFor = await query(
    `
      SELECT COUNT(*)::int AS n
      FROM call_queue
      WHERE client_key = $1
        AND call_type = 'vapi_call'
        AND status = 'pending'
        AND created_at >= NOW() - INTERVAL '5 minutes'
        AND scheduled_for < created_at
    `,
    [ck]
  );

  const phantomN = rows.phantom?.rows?.[0]?.n ?? 0;
  const stuckN = rows.stuck?.rows?.[0]?.n ?? 0;
  const maxPerExactHour = rows.onHour?.rows?.[0]?.max_per_exact_hour ?? 0;
  const retryDueN = rows.retryDue?.rows?.[0]?.n ?? 0;
  const maxDialPerMinute = rows.dialBurst?.rows?.[0]?.max_per_minute ?? 0;
  const maxImportPerInstant = rows.importBurst?.rows?.[0]?.max_per_instant ?? 0;
  const maxRetriesForAnyLead = rows.retryLoopPerLead?.rows?.[0]?.max_per_lead ?? 0;
  const pastScheduledForN = rows.pastScheduledFor?.rows?.[0]?.n ?? 0;

  const problems = [];
  if (phantomN > 0) problems.push({ key: 'phantom_completed', intentId: 'queue.no-phantom-completed', value: phantomN });
  if (stuckN > 0) problems.push({ key: 'stuck_processing', intentId: 'queue.no-stuck-processing', value: stuckN });
  if (maxPerExactHour >= onHourSpikeThreshold)
    problems.push({ key: 'top_of_hour_spike', intentId: 'queue.no-top-of-hour-clump', value: maxPerExactHour, threshold: onHourSpikeThreshold });
  if (retryDueN >= retryDueThreshold)
    problems.push({ key: 'retry_due_now', intentId: 'queue.retry-backlog-bounded', value: retryDueN, threshold: retryDueThreshold });
  if (maxDialPerMinute >= dialBurstThreshold)
    problems.push({ key: 'dial_burst_detected', intentId: 'billing.no-burst-dial', value: maxDialPerMinute, threshold: dialBurstThreshold });
  if (maxImportPerInstant > 1)
    problems.push({ key: 'import_burst_unspaced', intentId: 'dial.imports-distribute-not-burst', value: maxImportPerInstant });
  if (maxRetriesForAnyLead > maxRetriesPerLead)
    problems.push({
      key: 'retry_loop_per_lead',
      intentId: 'billing.max-retries-bounded',
      value: maxRetriesForAnyLead,
      threshold: maxRetriesPerLead
    });
  if (pastScheduledForN > 0)
    problems.push({
      key: 'past_scheduled_for',
      intentId: 'scheduling.no-past-scheduled-for',
      value: pastScheduledForN
    });
  if (underflowCount > 0)
    problems.push({
      key: 'vapi_concurrency_underflow',
      intentId: 'queue.concurrency-cap',
      value: underflowCount
    });
  if (unknownReleaseCount > 0)
    problems.push({
      key: 'vapi_concurrency_unknown_release',
      intentId: 'queue.concurrency-cap',
      value: unknownReleaseCount
    });

  return {
    ok: problems.length === 0,
    clientKey: ck,
    timezone: tz,
    lookbackMinutes,
    processingStuckMinutes,
    onHourSpikeThreshold,
    retryDueThreshold,
    dialBurstThreshold,
    maxRetriesPerLead,
    phantomN,
    stuckN,
    maxPerExactHour,
    retryDueN,
    maxDialPerMinute,
    maxImportPerInstant,
    maxRetriesForAnyLead,
    pastScheduledForN,
    underflowCount,
    unknownReleaseCount,
    problems
  };
}

export async function checkOpsInvariants({ clientKey = null } = {}) {
  const { query } = await import('../db.js');

  const lookbackMinutes = Math.max(5, Math.min(7 * 24 * 60, asInt(process.env.OPS_INVARIANTS_LOOKBACK_MINUTES || 60)));
  const processingStuckMinutes = Math.max(5, Math.min(24 * 60, asInt(process.env.OPS_INVARIANTS_STUCK_PROCESSING_MINUTES || 15)));
  const onHourSpikeThreshold = Math.max(5, Math.min(5000, asInt(process.env.OPS_INVARIANTS_ON_HOUR_SPIKE_THRESHOLD || 25)));
  const emailEnabled = truthyEnv(process.env.OPS_INVARIANTS_EMAIL_ALERTS) && !!process.env.YOUR_EMAIL;
  const logOk = truthyEnv(process.env.OPS_INVARIANTS_LOG_OK);

  const ck = clientKey || process.env.OPS_INVARIANTS_CLIENT_KEY || null;
  const allClients = truthyEnv(process.env.OPS_INVARIANTS_ALL_CLIENTS);

  const checks = [];
  if (allClients) {
    try {
      const { listClientSummaries } = await import('../db.js');
      const clients = await listClientSummaries();
      for (const c of clients || []) {
        const clientKey2 = c?.clientKey || c?.client_key;
        if (!clientKey2) continue;
        const isEnabled = c?.isEnabled ?? c?.is_enabled ?? true;
        if (!isEnabled) continue;
        checks.push({ clientKey: clientKey2, timezone: c?.timezone || c?.timeZone || c?.tz || null });
      }
    } catch (e) {
      // Fall back to single-client mode if summaries aren’t available.
    }
  }
  if (!checks.length && ck) {
    checks.push({ clientKey: ck, timezone: process.env.TIMEZONE || process.env.TZ || 'Europe/London' });
  }
  if (!checks.length) {
    return { ok: true, skipped: true, reason: 'no_client_key_configured' };
  }

  const results = [];
  for (const c of checks) {
    const payload = await checkOneClient({
      query,
      clientKey: c.clientKey,
      timezone: c.timezone,
      lookbackMinutes,
      processingStuckMinutes,
      onHourSpikeThreshold
    });
    results.push(payload);

    if (!payload.ok) {
      console.error('[OPS INVARIANTS] ⚠️ violated', payload);
      if (emailEnabled) {
        const subjectCk = payload.clientKey || 'unknown';
        const compact = { ...payload };
        // keep the email short but actionable
        compact.problems = payload.problems;
        compact.sample = {
          phantomN: payload.phantomN,
          stuckN: payload.stuckN,
          maxPerExactHour: payload.maxPerExactHour,
          retryDueN: payload.retryDueN
        };
        delete compact.processingStuckMinutes;
        delete compact.onHourSpikeThreshold;
        delete compact.lookbackMinutes;

        await messagingService.sendEmail({
          to: process.env.YOUR_EMAIL,
          subject: `⚠️ Ops invariant violated (${subjectCk})`,
          body: JSON.stringify(compact, null, 2)
        }).catch(() => {});
      }
    } else if (logOk) {
      console.log('[OPS INVARIANTS] ok', { clientKey: payload.clientKey });
    }
  }

  const ok = results.every(r => r.ok);
  return { ok, checked: results.length, results };
}

/**
 * Convert a checkOpsInvariants() result (or single client payload) into a
 * non-coder-readable checklist. Each item maps to an Intent Contract ID in
 * docs/INTENT.md so an operator can verify the system is doing what we want
 * without reading source.
 *
 * @param {object} payload either { ok, results: [perClient] } or a single
 *   per-client result from checkOneClient
 * @returns {{ ok: boolean, items: Array<{ intentId, label, status, detail }> }}
 */
export function summarizeOpsInvariants(payload) {
  if (!payload) return { ok: true, items: [] };
  // Aggregate across clients for the dashboard view: a check is "violated" if
  // any client shows a problem with that intentId.
  const perClient = Array.isArray(payload.results) ? payload.results : [payload];

  const labels = [
    {
      intentId: 'queue.no-phantom-completed',
      label: 'Calls cannot complete without a Vapi call id',
      problemKey: 'phantom_completed'
    },
    {
      intentId: 'queue.no-stuck-processing',
      label: 'No call_queue rows stuck in processing',
      problemKey: 'stuck_processing'
    },
    {
      intentId: 'queue.no-top-of-hour-clump',
      label: 'No top-of-hour scheduling spike',
      problemKey: 'top_of_hour_spike'
    },
    {
      intentId: 'queue.retry-backlog-bounded',
      label: 'Retry queue is being drained',
      problemKey: 'retry_due_now'
    },
    {
      intentId: 'billing.no-burst-dial',
      label: 'No burst of Vapi calls in the last 5 minutes',
      problemKey: 'dial_burst_detected'
    },
    {
      intentId: 'dial.imports-distribute-not-burst',
      label: 'Imports / retries / recalls are spaced out',
      problemKey: 'import_burst_unspaced'
    },
    {
      intentId: 'billing.max-retries-bounded',
      label: 'No single lead is in a runaway retry loop',
      problemKey: 'retry_loop_per_lead'
    },
    {
      intentId: 'scheduling.no-past-scheduled-for',
      label: 'Scheduler never produces a past scheduled_for',
      problemKey: 'past_scheduled_for'
    },
    {
      intentId: 'queue.concurrency-cap',
      label: 'Vapi concurrency limiter has not underflowed',
      problemKey: 'vapi_concurrency_underflow'
    },
    {
      intentId: 'queue.concurrency-cap',
      label: 'No unknown-call-id slot releases (VAPI_CONCURRENCY_RELEASE_UNKNOWN footgun)',
      problemKey: 'vapi_concurrency_unknown_release'
    }
  ];

  const items = labels.map(({ intentId, label, problemKey }) => {
    const offenders = [];
    for (const r of perClient) {
      const hit = (r.problems || []).find((p) => p.key === problemKey);
      if (hit) {
        offenders.push({
          clientKey: r.clientKey,
          value: hit.value,
          threshold: hit.threshold
        });
      }
    }
    if (offenders.length === 0) {
      return { intentId, label, status: 'ok', detail: 'no violations in lookback window' };
    }
    const summary = offenders
      .map((o) => `${o.clientKey || '?'}=${o.value}${o.threshold ? `/${o.threshold}` : ''}`)
      .join(', ');
    return { intentId, label, status: 'violated', detail: summary };
  });

  return { ok: items.every((i) => i.status === 'ok'), items };
}

