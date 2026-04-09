import messagingService from './messaging-service.js';

function asInt(v) {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function truthyEnv(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s !== '' && !['0', 'false', 'no', 'off'].includes(s);
}

async function checkOneClient({ query, clientKey, timezone, lookbackMinutes, processingStuckMinutes, onHourSpikeThreshold }) {
  const ck = clientKey;
  const tz = timezone || process.env.TZ || process.env.TIMEZONE || 'Europe/London';

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
          AND EXTRACT(MINUTE FROM cq.scheduled_for) = 0
          AND EXTRACT(SECOND FROM cq.scheduled_for) = 0
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

  const phantomN = rows.phantom?.rows?.[0]?.n ?? 0;
  const stuckN = rows.stuck?.rows?.[0]?.n ?? 0;
  const maxPerExactHour = rows.onHour?.rows?.[0]?.max_per_exact_hour ?? 0;
  const retryDueN = rows.retryDue?.rows?.[0]?.n ?? 0;

  const problems = [];
  if (phantomN > 0) problems.push({ key: 'phantom_completed', value: phantomN });
  if (stuckN > 0) problems.push({ key: 'stuck_processing', value: stuckN });
  if (maxPerExactHour >= onHourSpikeThreshold) problems.push({ key: 'top_of_hour_spike', value: maxPerExactHour, threshold: onHourSpikeThreshold });
  if (retryDueN > 0) problems.push({ key: 'retry_due_now', value: retryDueN });

  return {
    ok: problems.length === 0,
    clientKey: ck,
    timezone: tz,
    lookbackMinutes,
    processingStuckMinutes,
    onHourSpikeThreshold,
    phantomN,
    stuckN,
    maxPerExactHour,
    retryDueN,
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

      await messagingService.sendEmail({
        to: process.env.YOUR_EMAIL,
        subject: `⚠️ Ops invariant violated (${ck})`,
        body: JSON.stringify(payload, null, 2)
      }).catch(() => {});
    }
  } else {
    console.log('[OPS INVARIANTS] ok', { clientKey: ck });
  }

  return payload;
}

