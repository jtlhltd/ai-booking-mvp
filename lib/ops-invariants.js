import messagingService from './messaging-service.js';

function asInt(v) {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function truthyEnv(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s !== '' && !['0', 'false', 'no', 'off'].includes(s);
}

export async function checkOpsInvariants({ clientKey = null } = {}) {
  const { query } = await import('../db.js');

  const ck = clientKey || process.env.OPS_INVARIANTS_CLIENT_KEY || null;
  const lookbackMinutes = Math.max(5, Math.min(7 * 24 * 60, asInt(process.env.OPS_INVARIANTS_LOOKBACK_MINUTES || 60)));
  const processingStuckMinutes = Math.max(5, Math.min(24 * 60, asInt(process.env.OPS_INVARIANTS_STUCK_PROCESSING_MINUTES || 15)));
  const onHourSpikeThreshold = Math.max(5, Math.min(5000, asInt(process.env.OPS_INVARIANTS_ON_HOUR_SPIKE_THRESHOLD || 25)));

  if (!ck) {
    return { ok: true, skipped: true, reason: 'no_client_key_configured' };
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

  // 3) Top-of-hour spike check: if we schedule many calls exactly at HH:00:00, they will clump.
  // We check tomorrow window because that’s where optimal-window routing usually schedules.
  rows.onHour = await query(
    `
      WITH bounds AS (
        SELECT
          ((date_trunc('day', NOW() AT TIME ZONE 'Europe/London') + INTERVAL '1 day') AT TIME ZONE 'Europe/London') AS t0,
          ((date_trunc('day', NOW() AT TIME ZONE 'Europe/London') + INTERVAL '2 day') AT TIME ZONE 'Europe/London') AS t1
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
    [ck]
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

  const ok = problems.length === 0;
  const payload = {
    ok,
    clientKey: ck,
    lookbackMinutes,
    processingStuckMinutes,
    onHourSpikeThreshold,
    phantomN,
    stuckN,
    maxPerExactHour,
    retryDueN,
    problems
  };

  if (!ok) {
    console.error('[OPS INVARIANTS] ⚠️ violated', payload);

    const shouldEmail = truthyEnv(process.env.OPS_INVARIANTS_EMAIL_ALERTS) && !!process.env.YOUR_EMAIL;
    if (shouldEmail) {
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

