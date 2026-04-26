/**
 * GET /api/outbound-queue-day/:clientKey — hour-by-hour queue drilldown (extracted from server.js).
 */
export async function handleOutboundQueueDayRoute(req, res, deps) {
  const { getFullClient, isPostgres, query } = deps || {};
  const { clientKey } = req.params;
  const day = String(req.query.day || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return res.status(400).json({ ok: false, error: 'Expected ?day=YYYY-MM-DD' });
  }
  try {
    const client = await getFullClient(clientKey, { bypassCache: false });
    const tenantTz = client?.booking?.timezone || client?.timezone || 'Europe/London';
    if (!isPostgres) {
      res.set('Cache-Control', 'no-store, must-revalidate, max-age=0');
      return res.json({ ok: true, day, timezone: tenantTz, hours: [] });
    }
    const [rows, explainRows] = await Promise.all([
      query(
        `
      WITH base AS (
        SELECT
          cq.status,
          cq.priority,
          cq.scheduled_for,
          (cq.scheduled_for AT TIME ZONE $2::text) AS local_ts
        FROM call_queue cq
        WHERE cq.client_key = $1
          AND cq.status IN ('pending','processing')
      ),
      scoped AS (
        SELECT *
        FROM base
        WHERE to_char(local_ts, 'YYYY-MM-DD') = $3
      )
      SELECT
        to_char(date_trunc('hour', local_ts), 'HH24:00') AS hour_key,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_n,
        COUNT(*) FILTER (WHERE status = 'pending' AND scheduled_for <= NOW())::int AS due_now_n,
        COUNT(*) FILTER (WHERE status = 'processing')::int AS processing_n,
        MIN(scheduled_for) AS first_scheduled_for,
        MAX(scheduled_for) AS last_scheduled_for,
        MIN(priority)::int AS best_priority,
        MAX(priority)::int AS worst_priority
      FROM scoped
      GROUP BY 1
      ORDER BY 1 ASC
    `,
        [clientKey, tenantTz, day]
      ),
      query(
        `
        WITH base AS (
          SELECT
            cq.status,
            cq.priority,
            cq.scheduled_for,
            cq.call_data,
            (cq.scheduled_for AT TIME ZONE $2::text) AS local_ts
          FROM call_queue cq
          WHERE cq.client_key = $1
            AND cq.status IN ('pending','processing')
        ),
        scoped AS (
          SELECT *
          FROM base
          WHERE to_char(local_ts, 'YYYY-MM-DD') = $3
        )
        SELECT
          (SELECT COUNT(*)::int FROM scoped WHERE status = 'pending') AS total_pending,
          (SELECT COUNT(*)::int FROM scoped WHERE status = 'pending' AND scheduled_for <= NOW()) AS total_due_now,
          (SELECT COUNT(*)::int FROM scoped WHERE status = 'processing') AS total_processing,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object('tag', tag, 'n', n) ORDER BY n DESC, tag ASC)
            FROM (
              SELECT COALESCE(NULLIF(scoped.call_data->>'scheduling',''), 'unspecified') AS tag, COUNT(*)::int AS n
              FROM scoped
              GROUP BY 1
            ) x
          ), '[]'::jsonb) AS schedule_tags,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object('trigger', trig, 'n', n) ORDER BY n DESC, trig ASC)
            FROM (
              SELECT COALESCE(NULLIF(scoped.call_data->>'triggerType',''), 'unspecified') AS trig, COUNT(*)::int AS n
              FROM scoped
              GROUP BY 1
            ) y
          ), '[]'::jsonb) AS trigger_types,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object('priority', p, 'n', n) ORDER BY p ASC)
            FROM (
              SELECT priority::int AS p, COUNT(*)::int AS n
              FROM scoped
              GROUP BY 1
            ) z
          ), '[]'::jsonb) AS priority_counts
        `,
        [clientKey, tenantTz, day]
      )
    ]);
    const explain = explainRows.rows?.[0] || {};
    res.set('Cache-Control', 'no-store, must-revalidate, max-age=0');
    return res.json({
      ok: true,
      day,
      timezone: tenantTz,
      explain: {
        totals: {
          pending: parseInt(explain.total_pending, 10) || 0,
          dueNow: parseInt(explain.total_due_now, 10) || 0,
          processing: parseInt(explain.total_processing, 10) || 0
        },
        scheduleTags: explain.schedule_tags || [],
        triggerTypes: explain.trigger_types || [],
        priorityCounts: explain.priority_counts || [],
        notes: [
          'queued time is the row’s scheduled_for (in tenant timezone)',
          'distribution shows how queued calls are spread across business hours',
          'priority is used when multiple calls are due at once (smaller number runs sooner)'
        ]
      },
      hours: (rows.rows || []).map((r) => ({
        hourKey: r.hour_key,
        pendingN: parseInt(r.pending_n, 10) || 0,
        dueNowN: parseInt(r.due_now_n, 10) || 0,
        processingN: parseInt(r.processing_n, 10) || 0,
        firstScheduledFor: r.first_scheduled_for ? new Date(r.first_scheduled_for).toISOString() : null,
        lastScheduledFor: r.last_scheduled_for ? new Date(r.last_scheduled_for).toISOString() : null,
        bestPriority: r.best_priority != null ? parseInt(r.best_priority, 10) : null,
        worstPriority: r.worst_priority != null ? parseInt(r.worst_priority, 10) : null
      }))
    });
  } catch (error) {
    console.error('[OUTBOUND QUEUE DAY ERROR]', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
