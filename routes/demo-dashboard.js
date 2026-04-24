/**
 * Demo dashboard data endpoint (client dashboard polling).
 *
 * Extracted from server.js to make it contract-testable and to shrink server.js before including it in coverage.
 *
 * GET /api/demo-dashboard/:clientKey
 */
import { Router } from 'express';

/**
 * This router intentionally uses a wide deps surface because the original handler referenced many server.js locals.
 * The goal of this extraction is to move the high-denominator logic out of `server.js` without changing behavior.
 *
 * @param {Record<string, any>} deps
 */
export function createDemoDashboardRouter(deps) {
  const router = Router();

  router.get('/demo-dashboard/:clientKey', async (req, res) => {
    const handler = deps?.handleDemoDashboard;
    if (typeof handler !== 'function') {
      return res.status(500).json({ ok: false, error: 'demo_dashboard_handler_not_wired' });
    }
    return await handler(req, res, deps);
  });

  return router;
}

/**
 * Full extracted implementation from `server.js`.
 * This is injected into `createDemoDashboardRouter({ handleDemoDashboard })`.
 */
export async function handleDemoDashboard(req, res, deps) {
  const {
    getFullClient,
    activityFeedChannelLabel,
    DateTime,
    DASHBOARD_ACTIVITY_TZ,
    isPostgres,
    query,
    sqlDaysAgo,
    formatTimeAgoLabel,
    formatCallDuration,
    truncateActivityFeedText,
    formatVapiEndedReasonDisplay,
    outcomeToFriendlyLabel,
    parseCallsRowMetadata,
    isCallQueueStartFailureRow,
    mapCallStatus,
    mapStatusClass,
    trimEnvDashboard,
    buildDashboardExperience,
    sendOperatorAlert,
    fetchImpl
  } = deps || {};

  const fetch = fetchImpl || global.fetch;

  const { clientKey } = req.params;
  /** Max rows returned for Recent Leads card (full list for typical tenants; keep in sync with client-dashboard RECENT_LEADS_DASHBOARD_CAP). */
  const RECENT_LEADS_DASHBOARD_CAP = 5000;
  /** Lighter first paint when `?brief=1` (client outreach dash); keep in sync with client-dashboard DASHBOARD_BRIEF_LEADS_CAP. */
  const DASHBOARD_BRIEF_LEADS_CAP = 120;
  const DASHBOARD_BRIEF_CALLS_CAP = 12;
  /** Live Activity Feed rows (keep in sync with client-dashboard ACTIVITY_FEED_DISPLAY_CAP). */
  const RECENT_CALLS_FEED_CAP = 40;
  const briefRequested =
    req.query.brief === '1' ||
    req.query.brief === 'true' ||
    String(req.query.brief || '').toLowerCase() === 'yes';
  const leadsDashboardCap = briefRequested ? DASHBOARD_BRIEF_LEADS_CAP : RECENT_LEADS_DASHBOARD_CAP;
  const recentCallsFeedCap = briefRequested ? DASHBOARD_BRIEF_CALLS_CAP : RECENT_CALLS_FEED_CAP;

  const dashboardCallPhoneAggSql = `
    SELECT phone_key, calls_n, reached_max
    FROM (
      SELECT
        CASE
          WHEN LENGTH(regexp_replace(COALESCE(s.lead_phone, ''), '[^0-9]', '', 'g')) >= 10
          THEN RIGHT(regexp_replace(COALESCE(s.lead_phone, ''), '[^0-9]', '', 'g'), 10)
          ELSE NULLIF(regexp_replace(COALESCE(s.lead_phone, ''), '[^0-9]', '', 'g'), '')
        END AS phone_key,
        COUNT(*)::int AS calls_n,
        MAX(CASE WHEN (
          (s.outcome IS NOT NULL AND s.outcome NOT IN ('no-answer', 'busy', 'failed', 'voicemail', 'declined', 'rejected'))
          OR (
            s.outcome IS NULL
            AND (
              (COALESCE(s.duration, 0) >= 20 AND LOWER(TRIM(COALESCE(s.status, ''))) IN ('ended', 'completed', 'finished'))
              OR (COALESCE(s.duration, 0) >= 40 AND LOWER(TRIM(COALESCE(s.status, ''))) NOT IN (
                'failed', 'busy', 'no-answer', 'canceled', 'cancelled', 'declined', 'rejected', 'voicemail'
              ))
              OR (COALESCE(s.transcript_snip, '') <> '' AND LENGTH(TRIM(COALESCE(s.transcript_snip, ''))) > 40)
              OR (COALESCE(s.recording_url, '') <> '')
            )
          )
        ) THEN 1 ELSE 0 END)::int AS reached_max
      FROM (
        SELECT
          c.lead_phone,
          c.outcome,
          c.duration,
          c.status,
          COALESCE(ts.transcript_snip, '') AS transcript_snip,
          c.recording_url
        FROM calls c
        LEFT JOIN LATERAL (
          SELECT LEFT(COALESCE(c.transcript, ''), 512) AS transcript_snip
          WHERE c.outcome IS NULL
            AND COALESCE(c.recording_url, '') = ''
            AND NOT (
              (
                COALESCE(c.duration, 0) >= 20
                AND LOWER(TRIM(COALESCE(c.status, ''))) IN ('ended', 'completed', 'finished')
              )
              OR (
                COALESCE(c.duration, 0) >= 40
                AND LOWER(TRIM(COALESCE(c.status, ''))) NOT IN (
                  'failed', 'busy', 'no-answer', 'canceled', 'cancelled', 'declined', 'rejected', 'voicemail'
                )
              )
            )
        ) ts ON TRUE
        WHERE c.client_key = $1
          AND regexp_replace(COALESCE(c.lead_phone, ''), '[^0-9]', '', 'g') <> ''
      ) s
      GROUP BY 1
    ) x
    WHERE x.phone_key IS NOT NULL
  `;

  const demoDashboardCallsAndPhoneStatsSql = deps?.demoDashboardCallsAndPhoneStatsSql;
  const dashboardCallPhoneStatsFromArraysCte = deps?.dashboardCallPhoneStatsFromArraysCte;
  const dashboardLeadPhoneKeyRef = deps?.dashboardLeadPhoneKeyRef || 'l.phone_match_key';
  const dashboardCallRowPhoneKeySql = deps?.dashboardCallRowPhoneKeySql;

  try {
    let client = await getFullClient(clientKey, { bypassCache: false });
    const activityChannel = activityFeedChannelLabel(client);
    const tenantTz = client?.booking?.timezone || client?.timezone || 'Europe/London';

    const rollingSinceInstant = DateTime.now().setZone(DASHBOARD_ACTIVITY_TZ).minus({ hours: 24 });
    const activityRollingSinceIso = rollingSinceInstant.toUTC().toISO();
    const dashboardCallsStatsCutoffIso = DateTime.now()
      .setZone(DASHBOARD_ACTIVITY_TZ)
      .minus({ days: 180 })
      .toUTC()
      .toISO();
    const activityAsOfLondon = DateTime.now().setZone(DASHBOARD_ACTIVITY_TZ);

    const touchpointDayKeySql = isPostgres
      ? `to_char(created_at AT TIME ZONE '${DASHBOARD_ACTIVITY_TZ}', 'YYYY-MM-DD')`
      : `strftime('%Y-%m-%d', created_at)`;
    const touchpointDayKeyFromD = touchpointDayKeySql.replace(/\\bcreated_at\\b/g, 'd.created_at');

    const outreachPulseAnchor = DateTime.now().setZone(DASHBOARD_ACTIVITY_TZ);
    const outreachPulseCutoff40Iso = outreachPulseAnchor.minus({ days: 40 }).toUTC().toISO();
    const outreachPulseCutoff30Iso = outreachPulseAnchor.minus({ days: 30 }).toUTC().toISO();
    const outreachPulseCutoff7Iso = outreachPulseAnchor.minus({ days: 7 }).toUTC().toISO();
    const outreachPulseParams = [clientKey, outreachPulseCutoff40Iso, outreachPulseCutoff30Iso, outreachPulseCutoff7Iso];

    const demoOutreachQueuePulseSqlPostgres = `
      SELECT
        (SELECT COUNT(*)::int FROM call_queue cq
         WHERE cq.client_key = $1
           AND cq.updated_at >= $2::timestamptz) AS queue_touches_last24h,
        (SELECT COUNT(*)::int FROM call_queue cq
         WHERE cq.client_key = $1
           AND cq.status = 'pending'
           AND cq.scheduled_for <= NOW()) AS queue_pending_due_now,
        (SELECT MIN(cq.scheduled_for) FROM call_queue cq
         WHERE cq.client_key = $1
           AND cq.status = 'pending'
           AND cq.scheduled_for <= NOW()) AS queue_oldest_due_for,
        (SELECT COUNT(*)::int FROM call_queue cq
         WHERE cq.client_key = $1
           AND cq.status = 'processing') AS queue_processing_now,
        (SELECT MIN(cq.scheduled_for) FROM call_queue cq
         WHERE cq.client_key = $1 AND cq.status = 'pending') AS queue_next_scheduled_for,
        (SELECT COUNT(*)::int FROM outbound_weekday_journey j
         WHERE j.client_key = $1
           AND EXTRACT(ISODOW FROM NOW() AT TIME ZONE $3::text) BETWEEN 1 AND 5
           AND (j.weekday_mask & (1 << (EXTRACT(ISODOW FROM NOW() AT TIME ZONE $3::text)::int - 1))::int) <> 0
        ) AS dial_slots_used_local_today
    `;
    const demoOutreachQueuePulseSqlite = `
      SELECT
        (SELECT COUNT(*) FROM call_queue cq
         WHERE cq.client_key = $1
           AND cq.updated_at >= $2) AS queue_touches_last24h,
        (SELECT COUNT(*) FROM call_queue cq
         WHERE cq.client_key = $1
           AND cq.status = 'pending'
           AND datetime(cq.scheduled_for) <= datetime('now')) AS queue_pending_due_now,
        (SELECT MIN(cq.scheduled_for) FROM call_queue cq
         WHERE cq.client_key = $1
           AND cq.status = 'pending'
           AND datetime(cq.scheduled_for) <= datetime('now')) AS queue_oldest_due_for,
        (SELECT COUNT(*) FROM call_queue cq
         WHERE cq.client_key = $1
           AND cq.status = 'processing') AS queue_processing_now,
        (SELECT MIN(cq.scheduled_for) FROM call_queue cq
         WHERE cq.client_key = $1 AND cq.status = 'pending') AS queue_next_scheduled_for,
        NULL AS dial_slots_used_local_today
    `;

    /** Rolling 7d/30d dial + reach counts and last dial time (Postgres); SQLite uses `demoDashboardOutreachPulseSqlite` with the same “reached” rules. */
    const demoDashboardOutreachPulseSql = `
      WITH raw AS (
        SELECT
          c.lead_phone,
          c.lead_phone_match_key,
          c.outcome,
          c.duration,
          c.status,
          ''::text AS transcript_snip,
          c.recording_url,
          c.created_at
        FROM calls c
        WHERE c.client_key = $1
          AND c.created_at >= $2::timestamptz
      ),
      call_row AS (
        SELECT
          lead_phone,
          lead_phone_match_key,
          created_at,
          (
            (outcome IS NOT NULL AND outcome NOT IN ('no-answer', 'busy', 'failed', 'voicemail', 'declined', 'rejected'))
            OR (
              outcome IS NULL
              AND (
                (COALESCE(duration, 0) >= 20 AND LOWER(TRIM(COALESCE(status, ''))) IN ('ended', 'completed', 'finished'))
                OR (COALESCE(duration, 0) >= 40 AND LOWER(TRIM(COALESCE(status, ''))) NOT IN (
                  'failed', 'busy', 'no-answer', 'canceled', 'cancelled', 'declined', 'rejected', 'voicemail'
                ))
                OR (COALESCE(recording_url, '') <> '')
              )
            )
          ) AS is_answered
        FROM raw
      ),
      last_dial AS (
        SELECT MAX(created_at) AS last_dial_attempt_at FROM calls WHERE client_key = $1
      ),
      agg_windows AS (
        SELECT
          COUNT(*) FILTER (WHERE created_at >= $4::timestamptz)::int AS attempts_7d,
          COUNT(*) FILTER (WHERE created_at >= $3::timestamptz)::int AS attempts_30d,
          COUNT(DISTINCT CASE
            WHEN created_at >= $4::timestamptz
              AND lead_phone_match_key IS NOT NULL
            THEN lead_phone_match_key
          END)::int AS unique_called_7d,
          COUNT(DISTINCT CASE
            WHEN created_at >= $3::timestamptz
              AND lead_phone_match_key IS NOT NULL
            THEN lead_phone_match_key
          END)::int AS unique_called_30d
        FROM call_row
      ),
      reach_7d AS (
        SELECT COUNT(*)::int AS n FROM (
          SELECT lead_phone_match_key FROM call_row
          WHERE created_at >= $4::timestamptz
            AND lead_phone_match_key IS NOT NULL
          GROUP BY lead_phone_match_key
          HAVING MAX(CASE WHEN is_answered THEN 1 ELSE 0 END) > 0
        ) s
      ),
      reach_30d AS (
        SELECT COUNT(*)::int AS n FROM (
          SELECT lead_phone_match_key FROM call_row
          WHERE created_at >= $3::timestamptz
            AND lead_phone_match_key IS NOT NULL
          GROUP BY lead_phone_match_key
          HAVING MAX(CASE WHEN is_answered THEN 1 ELSE 0 END) > 0
        ) s
      )
      SELECT
        ld.last_dial_attempt_at,
        aw.attempts_7d,
        aw.attempts_30d,
        aw.unique_called_7d,
        aw.unique_called_30d,
        r7.n AS unique_reached_7d,
        r30.n AS unique_reached_30d
      FROM last_dial ld
      CROSS JOIN agg_windows aw
      CROSS JOIN reach_7d r7
      CROSS JOIN reach_30d r30
    `;

    /** Same outreach pulse as Postgres, for SQLite local/tests (digit filter uses GLOB vs regexp_replace). */
    const demoDashboardOutreachPulseSqlite = `
      WITH raw AS (
        SELECT
          lead_phone,
          outcome,
          duration,
          status,
          CASE
            WHEN outcome IS NOT NULL THEN ''
            WHEN COALESCE(recording_url, '') <> '' THEN ''
            WHEN COALESCE(duration, 0) >= 20 AND LOWER(TRIM(COALESCE(status, ''))) IN ('ended', 'completed', 'finished') THEN ''
            WHEN COALESCE(duration, 0) >= 40 AND LOWER(TRIM(COALESCE(status, ''))) NOT IN (
              'failed', 'busy', 'no-answer', 'canceled', 'cancelled', 'declined', 'rejected', 'voicemail'
            ) THEN ''
            ELSE SUBSTR(COALESCE(transcript, ''), 1, 512)
          END AS transcript_snip,
          recording_url,
          created_at
        FROM calls
        WHERE client_key = $1
          AND created_at >= $2
      ),
      call_row AS (
        SELECT
          lead_phone,
          created_at,
          CASE WHEN
            (outcome IS NOT NULL AND outcome NOT IN ('no-answer', 'busy', 'failed', 'voicemail', 'declined', 'rejected'))
            OR (
              outcome IS NULL
              AND (
                (COALESCE(duration, 0) >= 20 AND LOWER(TRIM(COALESCE(status, ''))) IN ('ended', 'completed', 'finished'))
                OR (COALESCE(duration, 0) >= 40 AND LOWER(TRIM(COALESCE(status, ''))) NOT IN (
                  'failed', 'busy', 'no-answer', 'canceled', 'cancelled', 'declined', 'rejected', 'voicemail'
                ))
                OR (COALESCE(transcript_snip, '') <> '' AND LENGTH(TRIM(COALESCE(transcript_snip, ''))) > 40)
                OR (COALESCE(recording_url, '') <> '')
              )
            )
          THEN 1 ELSE 0 END AS is_answered
        FROM raw
      ),
      last_dial AS (
        SELECT MAX(created_at) AS last_dial_attempt_at FROM calls WHERE client_key = $1
      ),
      agg_windows AS (
        SELECT
          CAST(COALESCE(SUM(CASE WHEN created_at >= $4 THEN 1 ELSE 0 END), 0) AS INTEGER) AS attempts_7d,
          CAST(COALESCE(SUM(CASE WHEN created_at >= $3 THEN 1 ELSE 0 END), 0) AS INTEGER) AS attempts_30d,
          CAST(COALESCE((
            SELECT COUNT(DISTINCT lead_phone) FROM call_row cr
            WHERE cr.created_at >= $4
              AND COALESCE(cr.lead_phone, '') GLOB '*[0-9]*'
          ), 0) AS INTEGER) AS unique_called_7d,
          CAST(COALESCE((
            SELECT COUNT(DISTINCT lead_phone) FROM call_row cr
            WHERE cr.created_at >= $3
              AND COALESCE(cr.lead_phone, '') GLOB '*[0-9]*'
          ), 0) AS INTEGER) AS unique_called_30d
        FROM call_row
      ),
      reach_7d AS (
        SELECT CAST(COUNT(*) AS INTEGER) AS n FROM (
          SELECT lead_phone FROM call_row
          WHERE created_at >= $4
          GROUP BY lead_phone
          HAVING MAX(is_answered) > 0
        ) s
      ),
      reach_30d AS (
        SELECT CAST(COUNT(*) AS INTEGER) AS n FROM (
          SELECT lead_phone FROM call_row
          WHERE created_at >= $3
          GROUP BY lead_phone
          HAVING MAX(is_answered) > 0
        ) s
      )
      SELECT
        ld.last_dial_attempt_at,
        aw.attempts_7d,
        aw.attempts_30d,
        aw.unique_called_7d,
        aw.unique_called_30d,
        r7.n AS unique_reached_7d,
        r30.n AS unique_reached_30d
      FROM last_dial ld
      CROSS JOIN agg_windows aw
      CROSS JOIN reach_7d r7
      CROSS JOIN reach_30d r30
    `;

    const loadDashboardCallMetricsBundle = async () => {
      // Merged single-query path is optional (injected via deps). Production historically omitted it,
      // which caused `query(undefined)` → crash in db/query.js. Fall back to the two-query path below.
      if (
        isPostgres &&
        typeof demoDashboardCallsAndPhoneStatsSql === 'string' &&
        demoDashboardCallsAndPhoneStatsSql.trim() !== ''
      ) {
        const merged = await query(demoDashboardCallsAndPhoneStatsSql, [
          clientKey,
          activityRollingSinceIso,
          dashboardCallsStatsCutoffIso
        ]);
        const row = merged.rows?.[0];
        if (!row) {
          return { callCounts: { rows: [{}] }, callPhoneStatsAgg: { rows: [] } };
        }
        const keys = row.dashboard_phone_keys || [];
        const ns = row.dashboard_phone_calls_ns || [];
        const mx = row.dashboard_phone_reached_maxs || [];
        const phoneRows = keys.map((phone_key, i) => ({
          phone_key,
          calls_n: parseInt(ns[i], 10) || 0,
          reached_max: parseInt(mx[i], 10) || 0
        }));
        const {
          dashboard_phone_keys: _dk,
          dashboard_phone_calls_ns: _dn,
          dashboard_phone_reached_maxs: _dm,
          ...stats
        } = row;
        return {
          callCounts: { rows: [stats] },
          callPhoneStatsAgg: { rows: phoneRows }
        };
      }
      const [cc, pa] = await Promise.all([
        query(
          `
        WITH call_row AS (
          SELECT
            raw.lead_phone,
            raw.outcome,
            raw.duration,
            raw.status,
            raw.transcript_snip,
            raw.recording_url,
            raw.created_at,
            (
              (raw.outcome IS NOT NULL AND raw.outcome NOT IN ('no-answer', 'busy', 'failed', 'voicemail', 'declined', 'rejected'))
              OR (
                raw.outcome IS NULL
                AND (
                  (COALESCE(raw.duration, 0) >= 20 AND LOWER(TRIM(COALESCE(raw.status, ''))) IN ('ended', 'completed', 'finished'))
                  OR (COALESCE(raw.duration, 0) >= 40 AND LOWER(TRIM(COALESCE(raw.status, ''))) NOT IN (
                    'failed', 'busy', 'no-answer', 'canceled', 'cancelled', 'declined', 'rejected', 'voicemail'
                  ))
                  OR (COALESCE(raw.transcript_snip, '') <> '' AND LENGTH(TRIM(COALESCE(raw.transcript_snip, ''))) > 40)
                  OR (COALESCE(raw.recording_url, '') <> '')
                )
              )
            ) AS is_answered,
            (
              raw.outcome IN ('no-answer', 'busy', 'failed', 'voicemail', 'declined', 'rejected')
              OR (
                raw.outcome IS NULL
                AND (
                  LOWER(TRIM(COALESCE(raw.status, ''))) IN (
                    'failed', 'busy', 'no-answer', 'canceled', 'cancelled', 'declined', 'rejected', 'voicemail'
                  )
                  OR (
                    LOWER(TRIM(COALESCE(raw.status, ''))) IN ('ended', 'completed', 'finished')
                    AND COALESCE(raw.duration, 0) > 0
                    AND COALESCE(raw.duration, 0) < 12
                  )
                )
              )
            ) AS is_not_answered
          FROM (
            SELECT
              c.lead_phone,
              c.outcome,
              c.duration,
              c.status,
              CASE
                WHEN c.outcome IS NOT NULL THEN ''
                WHEN COALESCE(c.recording_url, '') <> '' THEN ''
                WHEN COALESCE(c.duration, 0) >= 20 AND LOWER(TRIM(COALESCE(c.status, ''))) IN ('ended', 'completed', 'finished') THEN ''
                WHEN COALESCE(c.duration, 0) >= 40 AND LOWER(TRIM(COALESCE(c.status, ''))) NOT IN (
                  'failed', 'busy', 'no-answer', 'canceled', 'cancelled', 'declined', 'rejected', 'voicemail'
                ) THEN ''
                ELSE SUBSTR(COALESCE(c.transcript, ''), 1, 512)
              END AS transcript_snip,
              c.recording_url,
              c.created_at
            FROM calls c
            WHERE c.client_key = $1
          ) raw
        ),
        lead_class AS (
          SELECT
            lead_phone,
            MAX(CASE WHEN is_answered THEN 1 ELSE 0 END) AS has_ans,
            MAX(CASE WHEN is_not_answered THEN 1 ELSE 0 END) AS has_no
          FROM call_row
          GROUP BY lead_phone
        ),
        agg AS (
          SELECT
            COUNT(*) AS total,
            COUNT(DISTINCT lead_phone) AS unique_leads_called,
            COUNT(*) FILTER (WHERE created_at >= $2) AS last24,
            COUNT(*) FILTER (WHERE outcome = 'booked') AS booked,
            COUNT(*) FILTER (WHERE is_answered) AS answered,
            COUNT(*) FILTER (WHERE is_not_answered) AS not_answered,
            COUNT(*) FILTER (WHERE outcome IS NULL AND NOT is_answered AND NOT is_not_answered) AS outcome_pending
          FROM call_row
        )
        SELECT
               agg.total,
               agg.unique_leads_called,
               agg.last24,
               (SELECT COUNT(DISTINCT cr.lead_phone)::int FROM call_row cr WHERE cr.created_at >= $2) AS unique_leads_called_last24,
               agg.booked,
               agg.answered,
               agg.not_answered,
               agg.outcome_pending,
               (SELECT COUNT(*)::int FROM lead_class WHERE has_ans >= 1) AS reached_leads,
               (SELECT COUNT(*)::int FROM lead_class WHERE has_ans = 0) AS no_pickup_only_leads,
               0::int AS pending_only_leads,
               (SELECT COUNT(DISTINCT cr.lead_phone)::int FROM call_row cr
                 WHERE cr.created_at >= $2 AND cr.is_answered) AS unique_reached_last24,
               (SELECT COUNT(*)::int FROM (
                   SELECT cr.lead_phone
                   FROM call_row cr
                   WHERE cr.created_at >= $2
                   GROUP BY cr.lead_phone
                   HAVING MAX(CASE WHEN cr.is_answered THEN 1 ELSE 0 END) = 0
                 ) u) AS unique_no_pickup_last24
        FROM agg
      `,
          [clientKey, activityRollingSinceIso]
        ),
        query(dashboardCallPhoneAggSql, [clientKey])
      ]);
      return { callCounts: cc, callPhoneStatsAgg: pa };
    };

    const [
      leadCounts,
      callMetricsBundle,
      bookingStats,
      serviceRows,
      apptByServiceRows,
      recentCallRows,
      responseRows,
      touchpointRows,
      upcomingAppointmentRows,
      callQueuePendingRow,
      callableTodayRow,
      outreachPulseRows,
      outreachQueuePulseRow,
      usageMetersRow
    ] = await Promise.all([
      query(
        `
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE created_at >= $2) AS last24
        FROM leads
        WHERE client_key = $1
      `,
        [clientKey, activityRollingSinceIso]
      ),
      loadDashboardCallMetricsBundle(),
      query(
        `
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status IN ('no_show','no-show')) AS no_shows,
               COUNT(*) FILTER (WHERE status IN ('cancelled','canceled')) AS cancellations
        FROM appointments
        WHERE client_key = $1
          AND created_at >= ${sqlDaysAgo(7)}
      `,
        [clientKey]
      ),
      query(
        `
        SELECT COALESCE(service, 'General') AS service,
               COUNT(*) AS count
        FROM leads
        WHERE client_key = $1
        GROUP BY service
        ORDER BY count DESC
        LIMIT 5
      `,
        [clientKey]
      ),
      query(
        `
        SELECT COALESCE(l.service, 'General') AS service,
               COUNT(*)::int AS appointment_count
        FROM appointments a
        LEFT JOIN leads l ON l.id = a.lead_id AND l.client_key = a.client_key
        WHERE a.client_key = $1
          AND a.created_at >= ${sqlDaysAgo(7)}
        GROUP BY COALESCE(l.service, 'General')
        ORDER BY appointment_count DESC
      `,
        [clientKey]
      ),
      query(
        `
        WITH lead_lookup AS (
          SELECT DISTINCT ON (phone_match_key)
            phone_match_key AS phone_key,
            name,
            service
          FROM leads
          WHERE client_key = $1
            AND phone_match_key IS NOT NULL
          ORDER BY phone_match_key, created_at DESC NULLS LAST
        )
        SELECT c.call_id, c.id, c.lead_phone, c.status, c.outcome, c.created_at, c.duration, c.recording_url,
               c.transcript, c.retry_attempt, c.metadata,
               lm.name, lm.service
        FROM (
          SELECT id, call_id, client_key, lead_phone, status, outcome, created_at, duration, recording_url,
                 LEFT(COALESCE(transcript, ''), 512) AS transcript,
                 retry_attempt,
                 CASE WHEN metadata IS NULL THEN NULL
                   ELSE COALESCE(
                     jsonb_strip_nulls(jsonb_build_object(
                       'fromQueue', metadata->'fromQueue',
                       'reason',
                         CASE
                           WHEN jsonb_typeof(metadata->'reason') = 'string'
                           THEN to_jsonb(LEFT(metadata->>'reason', 400))
                           ELSE metadata->'reason'
                         END,
                       'abExperiment', metadata->'abExperiment',
                       'abVariant', metadata->'abVariant',
                       'abOutbound', metadata->'abOutbound'
                     )),
                     '{}'::jsonb
                   )
                 END AS metadata
          FROM calls
          WHERE client_key = $1
          ORDER BY created_at DESC
          LIMIT ${recentCallsFeedCap}
        ) c
        LEFT JOIN lead_lookup lm ON lm.phone_key = ${dashboardCallRowPhoneKeySql}
        ORDER BY c.created_at DESC
      `,
        [clientKey]
      ),
      query(
        `
        SELECT DISTINCT ON (l.phone_match_key)
               l.created_at AS lead_created,
               fc.call_created AS call_created
        FROM leads l
        INNER JOIN LATERAL (
          SELECT c.created_at AS call_created
          FROM calls c
          WHERE c.client_key = l.client_key
            AND c.created_at >= l.created_at
            AND c.created_at <= l.created_at + INTERVAL '48 hours'
            AND (
              c.lead_phone = l.phone
              OR (
                l.phone_match_key IS NOT NULL
                AND (
                  c.lead_phone_match_key = l.phone_match_key
                  OR (
                    c.lead_phone_match_key IS NULL
                    AND RIGHT(regexp_replace(COALESCE(c.lead_phone, ''), '[^0-9]', '', 'g'), 10) = l.phone_match_key
                  )
                )
              )
            )
          ORDER BY c.created_at ASC
          LIMIT 1
        ) fc ON true
        WHERE l.client_key = $1
          AND l.created_at >= NOW() - INTERVAL '30 days'
        ORDER BY l.phone_match_key, fc.call_created ASC, l.created_at ASC
        LIMIT 500
      `,
        [clientKey]
      ),
      query(
        `
        WITH daily AS (
          SELECT
            ${touchpointDayKeyFromD} AS bucket_day,
            d.lead_phone,
            d.outcome,
            d.duration,
            d.status,
            d.transcript_snip,
            d.recording_url,
            (
              (d.outcome IS NOT NULL AND d.outcome NOT IN ('no-answer', 'busy', 'failed', 'voicemail', 'declined', 'rejected'))
              OR (
                d.outcome IS NULL
                AND (
                  (COALESCE(d.duration, 0) >= 20 AND LOWER(TRIM(COALESCE(d.status, ''))) IN ('ended', 'completed', 'finished'))
                  OR (COALESCE(d.duration, 0) >= 40 AND LOWER(TRIM(COALESCE(d.status, ''))) NOT IN (
                    'failed', 'busy', 'no-answer', 'canceled', 'cancelled', 'declined', 'rejected', 'voicemail'
                  ))
                  OR (COALESCE(d.transcript_snip, '') <> '' AND LENGTH(TRIM(COALESCE(d.transcript_snip, ''))) > 40)
                  OR (COALESCE(d.recording_url, '') <> '')
                )
              )
            ) AS is_answered
          FROM (
            SELECT
              c.lead_phone,
              c.outcome,
              c.duration,
              c.status,
              COALESCE(ts.transcript_snip, '') AS transcript_snip,
              c.recording_url,
              c.created_at
            FROM calls c
            LEFT JOIN LATERAL (
              SELECT LEFT(COALESCE(c.transcript, ''), 512) AS transcript_snip
              WHERE c.outcome IS NULL
                AND COALESCE(c.recording_url, '') = ''
                AND NOT (
                  (
                    COALESCE(c.duration, 0) >= 20
                    AND LOWER(TRIM(COALESCE(c.status, ''))) IN ('ended', 'completed', 'finished')
                  )
                  OR (
                    COALESCE(c.duration, 0) >= 40
                    AND LOWER(TRIM(COALESCE(c.status, ''))) NOT IN (
                      'failed', 'busy', 'no-answer', 'canceled', 'cancelled', 'declined', 'rejected', 'voicemail'
                    )
                  )
                )
            ) ts ON TRUE
            WHERE c.client_key = $1
              AND c.created_at >= ${sqlDaysAgo(6)}
          ) d
        )
        SELECT
          bucket_day,
          COUNT(*)::int AS touchpoints,
          COUNT(DISTINCT lead_phone)::int AS unique_phones,
          COUNT(*) FILTER (WHERE outcome = 'booked')::int AS booked_rows,
          COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE(outcome::text, ''))) = 'voicemail')::int AS voicemail_rows,
          ROUND(COALESCE(AVG(CASE WHEN COALESCE(duration, 0) > 0 THEN duration::numeric END), 0::numeric), 0)::int AS avg_duration_sec,
          COALESCE(MAX(CASE WHEN COALESCE(duration, 0) > 0 THEN duration END), 0)::int AS max_duration_sec,
          COUNT(DISTINCT CASE WHEN is_answered THEN lead_phone END)::int AS unique_reached
        FROM daily
        GROUP BY bucket_day
      `,
        [clientKey]
      ),
      query(
        `
        SELECT a.id,
               a.start_iso,
               a.end_iso,
               a.status,
               l.name,
               l.service
        FROM appointments a
        LEFT JOIN leads l ON l.id = a.lead_id
        WHERE a.client_key = $1
          AND a.start_iso >= NOW()
        ORDER BY a.start_iso ASC
        LIMIT 5
      `,
        [clientKey]
      ),
      query(
        `
        SELECT COUNT(*)::int AS n
        FROM call_queue
        WHERE client_key = $1
          AND status IN ('pending', 'processing')
      `,
        [clientKey]
      ),
      isPostgres
        ? query(
            `
          WITH tz AS (
            SELECT $2::text AS tz
          ),
          bounds AS (
            SELECT
              (date_trunc('day', NOW() AT TIME ZONE (SELECT tz FROM tz)) AT TIME ZONE (SELECT tz FROM tz)) AS day_start_utc,
              ((date_trunc('day', NOW() AT TIME ZONE (SELECT tz FROM tz)) + INTERVAL '1 day') AT TIME ZONE (SELECT tz FROM tz)) AS day_end_utc,
              (NOW() AT TIME ZONE (SELECT tz FROM tz))::date AS local_day
          )
          SELECT
            (
              SELECT COUNT(*)::int
              FROM leads l
              CROSS JOIN bounds b
              WHERE l.client_key = $1
                AND l.status = 'new'
                AND l.created_at >= NOW() - INTERVAL '30 days'
                AND NOT EXISTS (
                  SELECT 1 FROM outbound_weekday_journey j
                  WHERE j.client_key = l.client_key
                    AND j.phone_match_key = COALESCE(l.phone_match_key, '__nodigits__')
                    AND (
                      j.closed_at IS NOT NULL
                      OR (
                        EXTRACT(ISODOW FROM NOW() AT TIME ZONE (SELECT tz FROM tz)) BETWEEN 1 AND 5
                        AND (
                          j.weekday_mask
                          & (1 << (EXTRACT(ISODOW FROM NOW() AT TIME ZONE (SELECT tz FROM tz))::int - 1))::int
                        ) <> 0
                      )
                    )
                )
                AND NOT EXISTS (
                  SELECT 1 FROM call_queue cq
                  CROSS JOIN bounds bb
                  WHERE cq.client_key = l.client_key
                    AND cq.call_type = 'vapi_call'
                    AND cq.status IN ('pending','processing')
                    AND cq.lead_phone = l.phone
                    AND cq.scheduled_for >= bb.day_start_utc
                    AND cq.scheduled_for < bb.day_end_utc
                )
            ) AS callable_leads_today,
            (
              SELECT COUNT(*)::int
              FROM leads l
              CROSS JOIN bounds b
              WHERE l.client_key = $1
                AND l.status = 'new'
                AND l.created_at >= NOW() - INTERVAL '30 days'
                AND EXISTS (
                  SELECT 1 FROM outbound_weekday_journey j
                  WHERE j.client_key = l.client_key
                    AND j.closed_at IS NULL
                    AND j.phone_match_key = COALESCE(l.phone_match_key, '__nodigits__')
                    AND EXTRACT(ISODOW FROM NOW() AT TIME ZONE (SELECT tz FROM tz)) BETWEEN 1 AND 5
                    AND (
                      j.weekday_mask
                      & (1 << (EXTRACT(ISODOW FROM NOW() AT TIME ZONE (SELECT tz FROM tz))::int - 1))::int
                    ) <> 0
                )
            ) AS blocked_daily_limit_today
          `,
            [clientKey, tenantTz]
          )
        : Promise.resolve({ rows: [{ callable_leads_today: null, blocked_daily_limit_today: null }] }),
      isPostgres
        ? query(demoDashboardOutreachPulseSql, outreachPulseParams)
        : query(demoDashboardOutreachPulseSqlite, outreachPulseParams),
      isPostgres
        ? query(demoOutreachQueuePulseSqlPostgres, [clientKey, activityRollingSinceIso, tenantTz])
        : query(demoOutreachQueuePulseSqlite, [clientKey, activityRollingSinceIso]),
      query(
        `
        SELECT
          (SELECT COUNT(*) FROM calls WHERE client_key = $1 AND created_at >= ${sqlDaysAgo(7)}) AS calls_7d,
          (SELECT COALESCE(SUM(COALESCE(duration, 0)), 0) FROM calls WHERE client_key = $1 AND created_at >= ${sqlDaysAgo(
            7
          )}) AS talk_seconds_7d,
          (SELECT COUNT(*) FROM calls WHERE client_key = $1 AND created_at >= ${sqlDaysAgo(30)}) AS calls_30d,
          (SELECT COALESCE(SUM(COALESCE(duration, 0)), 0) FROM calls WHERE client_key = $1 AND created_at >= ${sqlDaysAgo(
            30
          )}) AS talk_seconds_30d,
          (SELECT COUNT(*) FROM leads WHERE client_key = $1 AND created_at >= ${sqlDaysAgo(30)}) AS leads_new_30d,
          (SELECT COUNT(*) FROM appointments WHERE client_key = $1 AND created_at >= ${sqlDaysAgo(
            30
          )}) AS appointments_30d
        `,
        [clientKey]
      )
    ]);

    const callCounts = callMetricsBundle.callCounts;
    const callPhoneStatsAgg = callMetricsBundle.callPhoneStatsAgg;

    const phoneKeys = [];
    const phoneCallsNs = [];
    const phoneReachedMaxs = [];
    for (const row of callPhoneStatsAgg.rows || []) {
      if (row.phone_key == null || String(row.phone_key).trim() === '') continue;
      phoneKeys.push(String(row.phone_key));
      phoneCallsNs.push(parseInt(row.calls_n, 10) || 0);
      phoneReachedMaxs.push(parseInt(row.reached_max, 10) || 0);
    }

    const leadRows = await query(
      `
        WITH ${dashboardCallPhoneStatsFromArraysCte}
        SELECT l.id,
               l.name,
               l.phone,
               l.status,
               l.service,
               l.source,
               l.notes,
               l.created_at,
               le.lead_score,
               (COALESCE(cs.calls_n, 0) > 0) AS outreach_called,
               (COALESCE(cs.reached_max, 0) > 0) AS outreach_reached
        FROM leads l
        LEFT JOIN lead_engagement le
          ON le.client_key = l.client_key AND le.lead_phone = l.phone
        LEFT JOIN call_phone_stats cs ON cs.phone_key = ${dashboardLeadPhoneKeyRef}
        WHERE l.client_key = $1
        ORDER BY l.created_at DESC
        LIMIT ${leadsDashboardCap}
      `,
      [clientKey, phoneKeys, phoneCallsNs, phoneReachedMaxs]
    );

    const totalLeads = parseInt(leadCounts.rows?.[0]?.total || 0, 10);
    const last24hLeads = parseInt(leadCounts.rows?.[0]?.last24 || 0, 10);
    const totalCalls = parseInt(callCounts.rows?.[0]?.total || 0, 10); // Total call attempts (for internal tracking)
    const uniqueLeadsCalled = parseInt(callCounts.rows?.[0]?.unique_leads_called || 0, 10); // Unique leads actually called
    const callsAnsweredAttempts = parseInt(callCounts.rows?.[0]?.answered || 0, 10);
    const callsNotAnsweredAttempts = parseInt(callCounts.rows?.[0]?.not_answered || 0, 10);
    const uniqueLeadsAnswered = parseInt(callCounts.rows?.[0]?.reached_leads || 0, 10);
    const uniqueLeadsNoPickup = parseInt(callCounts.rows?.[0]?.no_pickup_only_leads || 0, 10);
    const uniqueLeadsPendingOnly = parseInt(callCounts.rows?.[0]?.pending_only_leads || 0, 10);
    const callsOutcomePending = parseInt(callCounts.rows?.[0]?.outcome_pending || 0, 10);
    const bookingsFromCalls = parseInt(callCounts.rows?.[0]?.booked || 0, 10);
    const callsLast24h = parseInt(callCounts.rows?.[0]?.last24 || 0, 10);
    const uniqueLeadsCalledLast24 = parseInt(callCounts.rows?.[0]?.unique_leads_called_last24 || 0, 10);
    const uniqueLeadsReachedLast24 = parseInt(callCounts.rows?.[0]?.unique_reached_last24 || 0, 10);
    const uniqueLeadsNoPickupLast24 = parseInt(callCounts.rows?.[0]?.unique_no_pickup_last24 || 0, 10);
    const answerRateLast24 = uniqueLeadsCalledLast24 > 0
      ? Math.round((uniqueLeadsReachedLast24 / uniqueLeadsCalledLast24) * 100)
      : 0;

    // Use unique leads called for display (not total call attempts)
    const displayCalls = uniqueLeadsCalled || 0;

    const wl = client?.whiteLabel || {};
    const monthlyFeeRaw = Number(wl.monthlyFee ?? wl.pricing?.monthlyFee ?? client?.monthlyFee ?? client?.pricing?.monthlyFee);
    const avgDealRaw = Number(wl.avgDealValue ?? wl.pricing?.avgDealValue ?? client?.avgDealValue ?? client?.pricing?.avgDealValue);
    const monthlyServiceFeeConfigured = Number.isFinite(monthlyFeeRaw) && monthlyFeeRaw >= 0;
    const avgDealConfigured = Number.isFinite(avgDealRaw) && avgDealRaw > 0;
    const monthlyServiceFee = monthlyServiceFeeConfigured ? monthlyFeeRaw : null;
    const avgDealValue = avgDealConfigured ? avgDealRaw : null;

    const conversionRate = totalCalls > 0 ? Math.round((bookingsFromCalls / totalCalls) * 100) : 0;

    const weeklyBookings = parseInt(bookingStats.rows?.[0]?.total || 0, 10);
    const bookingNumerator = Math.max(bookingsFromCalls, weeklyBookings);
    const successRate = uniqueLeadsCalled > 0
      ? ((bookingNumerator / uniqueLeadsCalled) * 100).toFixed(0)
      : (totalCalls > 0 ? ((bookingNumerator / totalCalls) * 100).toFixed(0) : '0');

    const apptByService = new Map(
      (apptByServiceRows.rows || []).map(r => [r.service || 'General', parseInt(r.appointment_count, 10) || 0])
    );
    const mixMap = new Map();
    for (const row of serviceRows.rows || []) {
      const name = row.service || 'General';
      mixMap.set(name, {
        name,
        leadCount: parseInt(row.count, 10) || 0,
        appointmentCount: apptByService.get(name) || 0
      });
    }
    for (const row of apptByServiceRows.rows || []) {
      const name = row.service || 'General';
      if (!mixMap.has(name)) {
        mixMap.set(name, {
          name,
          leadCount: 0,
          appointmentCount: parseInt(row.appointment_count, 10) || 0
        });
      }
    }
    const serviceMix = [...mixMap.values()]
      .sort((a, b) => (b.leadCount + b.appointmentCount * 2) - (a.leadCount + a.appointmentCount * 2))
      .slice(0, 8)
      .map(({ name, leadCount, appointmentCount }) => {
        const percent = totalLeads > 0 ? Math.round((leadCount / totalLeads) * 100) : 0;
        const notes = appointmentCount > 0
          ? `${appointmentCount} appointment(s) in last 7 days`
          : leadCount === 0
            ? 'Appointments only (no leads tagged with this service)'
            : '';
        return {
          name,
          percent,
          leadCount,
          bookings: appointmentCount,
          notes
        };
      });

    const leads = (leadRows.rows || []).map(row => {
      const rawScore = row.lead_score;
      const numScore = rawScore == null ? NaN : Number(rawScore);
      const derivedScore = Number.isFinite(numScore) ? numScore : null;
      return {
        id: row.id,
        name: row.name || row.phone,
        phone: row.phone,
        status: row.status || 'Awaiting follow-up',
        lastMessage:
          row.notes ||
          `Added ${new Date(row.created_at).toLocaleDateString('en-GB', { timeZone: DASHBOARD_ACTIVITY_TZ })}`,
        service: row.service || 'Lead Follow-Up',
        source: row.source || 'Web form',
        timeAgo: formatTimeAgoLabel(row.created_at),
        score: derivedScore,
        outreachCalled: !!row.outreach_called,
        outreachReached: !!row.outreach_reached
      };
    });

    const callQueuePending = parseInt(callQueuePendingRow.rows?.[0]?.n || 0, 10);
    const callableToday = callableTodayRow?.rows?.[0] || {};
    const callableLeadsTodayRaw = callableToday.callable_leads_today;
    const blockedDailyLimitTodayRaw = callableToday.blocked_daily_limit_today;
    const callableLeadsToday =
      callableLeadsTodayRaw != null ? parseInt(callableLeadsTodayRaw, 10) || 0 : null;
    const blockedDailyLimitToday =
      blockedDailyLimitTodayRaw != null ? parseInt(blockedDailyLimitTodayRaw, 10) || 0 : null;
    const oqPulse = outreachQueuePulseRow.rows?.[0] || {};
    const queueTouchesLast24h = parseInt(oqPulse.queue_touches_last24h, 10) || 0;
    const queuePendingDueNow = parseInt(oqPulse.queue_pending_due_now, 10) || 0;
    const queueProcessingNow = parseInt(oqPulse.queue_processing_now, 10) || 0;
    const queueNextScheduledRaw = oqPulse.queue_next_scheduled_for;
    const queueNextScheduledFor =
      queueNextScheduledRaw != null ? new Date(queueNextScheduledRaw).toISOString() : null;
    const queueOldestDueRaw = oqPulse.queue_oldest_due_for;
    const queueOldestDueFor =
      queueOldestDueRaw != null ? new Date(queueOldestDueRaw).toISOString() : null;
    const dialSlotsUsedLocalToday =
      oqPulse.dial_slots_used_local_today != null ? parseInt(oqPulse.dial_slots_used_local_today, 10) || 0 : null;

    let outboundQueueSchedule = null;
    if (isPostgres) {
      try {
        const scheduleRows = await query(
          `
          SELECT
            to_char((cq.scheduled_for AT TIME ZONE $2::text), 'YYYY-MM-DD') AS day_key,
            COUNT(*) FILTER (WHERE cq.status = 'pending')::int AS pending_n,
            COUNT(*) FILTER (WHERE cq.status = 'pending' AND cq.scheduled_for <= NOW())::int AS due_now_n,
            MIN(cq.scheduled_for) AS first_scheduled_for,
            MAX(cq.scheduled_for) AS last_scheduled_for
          FROM call_queue cq
          WHERE cq.client_key = $1
            AND cq.status IN ('pending', 'processing')
            AND cq.scheduled_for >= (NOW() - INTERVAL '7 days')
            AND cq.scheduled_for <= (NOW() + INTERVAL '30 days')
          GROUP BY 1
          ORDER BY 1 ASC
          LIMIT 60
        `,
          [clientKey, tenantTz]
        );
        outboundQueueSchedule = (scheduleRows.rows || []).map(r => ({
          dayKey: r.day_key,
          pendingN: parseInt(r.pending_n, 10) || 0,
          dueNowN: parseInt(r.due_now_n, 10) || 0,
          firstScheduledFor: r.first_scheduled_for ? new Date(r.first_scheduled_for).toISOString() : null,
          lastScheduledFor: r.last_scheduled_for ? new Date(r.last_scheduled_for).toISOString() : null
        }));
      } catch {
        outboundQueueSchedule = null;
      }
    }

    const leadsNeverDialed = Math.max(0, totalLeads - (displayCalls || 0));
    const dialsPerHour = callsLast24h / 24;
    const backlogWorkUnits = leadsNeverDialed + callQueuePending;
    let estimatedHoursToClearBacklog = null;
    if (backlogWorkUnits > 0 && dialsPerHour > 0.05 && Number.isFinite(dialsPerHour)) {
      const hrs = backlogWorkUnits / dialsPerHour;
      if (Number.isFinite(hrs) && hrs <= 24 * 120) {
        estimatedHoursToClearBacklog = Number(hrs.toFixed(1));
      }
    }

    const pulseRow = outreachPulseRows.rows?.[0] || {};
    const lastDialAttemptAt =
      pulseRow.last_dial_attempt_at != null
        ? new Date(pulseRow.last_dial_attempt_at).toISOString()
        : null;
    const attempts7d = parseInt(pulseRow.attempts_7d, 10) || 0;
    const attempts30d = parseInt(pulseRow.attempts_30d, 10) || 0;
    const uniqueCalled7d = parseInt(pulseRow.unique_called_7d, 10) || 0;
    const uniqueCalled30d = parseInt(pulseRow.unique_called_30d, 10) || 0;
    const uniqueReached7dRaw = pulseRow.unique_reached_7d;
    const uniqueReached30dRaw = pulseRow.unique_reached_30d;
    const uniqueReached7d =
      uniqueReached7dRaw != null ? parseInt(uniqueReached7dRaw, 10) || 0 : null;
    const uniqueReached30d =
      uniqueReached30dRaw != null ? parseInt(uniqueReached30dRaw, 10) || 0 : null;

    const {
      isBusinessHoursForTenant,
      getBusinessHoursConfig,
      getNextBusinessOpenForTenant,
      allowOutboundWeekendCalls
    } = await import('../lib/business-hours.js');
    const withinScheduledDialWindow = isBusinessHoursForTenant(client, new Date(), tenantTz, {
      forOutboundDial: true
    });

    const callableLeadsNextSlot =
      callableLeadsToday != null ? callableLeadsToday : null;
    const callableLeadsTodayWindowed =
      callableLeadsToday != null
        ? (withinScheduledDialWindow ? callableLeadsToday : 0)
        : null;

    const blockedDailyLimitNextSlot =
      blockedDailyLimitToday != null ? blockedDailyLimitToday : null;
    const blockedDailyLimitTodayWindowed =
      blockedDailyLimitToday != null
        ? (withinScheduledDialWindow ? blockedDailyLimitToday : 0)
        : null;

    const outboundDialSchedule = (() => {
      const cfg = getBusinessHoursConfig(client);
      const startHour = cfg.start ?? 9;
      const endHour = cfg.end ?? 17;
      let days = Array.isArray(cfg.days) ? cfg.days : [1, 2, 3, 4, 5];
      if (!allowOutboundWeekendCalls()) {
        days = days.filter((d) => [1, 2, 3, 4, 5].includes(d));
        if (days.length === 0) days = [1, 2, 3, 4, 5];
      }
      const now = new Date();
      const nextOpenAt = getNextBusinessOpenForTenant(client, now, tenantTz, { forOutboundDial: true });
      const windowsNext7 = [];
      for (let i = 0; i < 30 && windowsNext7.length < 7; i++) {
        const d = DateTime.fromJSDate(now).setZone(tenantTz).startOf('day').plus({ days: i });
        if (!d.isValid) continue;
        const jsDay = d.weekday === 7 ? 0 : d.weekday;
        if (!days.includes(jsDay)) continue;
        const start = d.set({ hour: startHour, minute: 0, second: 0, millisecond: 0 });
        if (!start.isValid) continue;
        if (!isBusinessHoursForTenant(client, start.toJSDate(), tenantTz, { forOutboundDial: true })) continue;
        const end = d.set({ hour: endHour, minute: 0, second: 0, millisecond: 0 });
        windowsNext7.push({
          dayKey: start.toFormat('yyyy-LL-dd'),
          weekdayShort: start.toFormat('ccc'),
          startLocal: start.toFormat('HH:mm'),
          endLocal: end.toFormat('HH:mm'),
          startIso: start.toUTC().toISO(),
          endIso: end.toUTC().toISO()
        });
      }
      return {
        timezone: tenantTz,
        startHour,
        endHour,
        days,
        nextOpenAt: nextOpenAt ? nextOpenAt.toISOString() : null,
        windowsNext7
      };
    })();

    let nextQueuePreview = null;
    let nextDialExpectedAt = null;
    let nextDialExpectedReason = null;
    let nextQueuePreviewError = null;
    try {
      if (isPostgres) {
        const { hasOutboundWeekdayJourneyDialBlocked } = await import('../db.js');
        const qRows = await query(
          `
          SELECT id, lead_phone, scheduled_for, priority, call_data
          FROM call_queue
          WHERE client_key = $1
            AND status = 'pending'
            AND call_type = 'vapi_call'
          ORDER BY scheduled_for ASC, priority ASC, id ASC
          LIMIT 5
          `,
          [clientKey]
        );
        const rows = qRows.rows || [];
        nextQueuePreview = [];
        for (const r of rows) {
          const sched = r.scheduled_for ? new Date(r.scheduled_for) : null;
          const schedIso = sched && !Number.isNaN(sched.getTime()) ? sched.toISOString() : null;
          const withinAt = sched ? isBusinessHoursForTenant(client, sched, tenantTz, { forOutboundDial: true }) : false;
          const lastDefer =
            r.call_data && typeof r.call_data === 'object' && r.call_data.lastDefer && typeof r.call_data.lastDefer === 'object'
              ? r.call_data.lastDefer
              : null;
          const lastStep =
            r.call_data && typeof r.call_data === 'object' && r.call_data.lastStep && typeof r.call_data.lastStep === 'object'
              ? r.call_data.lastStep
              : null;
          let journey = null;
          if (sched && r.lead_phone) {
            journey = await hasOutboundWeekdayJourneyDialBlocked(clientKey, r.lead_phone, tenantTz, { asOf: sched });
          }
          let action = 'unknown';
          let reason = null;
          if (!schedIso) {
            action = 'skip';
            reason = 'missing_scheduled_for';
          } else if (!withinAt) {
            action = 'defer';
            reason = 'outside_business_hours';
          } else if (journey?.blocked) {
            action = 'defer';
            reason = journey.reason || 'weekday_blocked';
          } else {
            action = 'dial';
            reason = 'eligible';
          }
          nextQueuePreview.push({
            id: r.id,
            leadPhone: r.lead_phone,
            scheduledFor: schedIso,
            priority: r.priority,
            withinWindowAtScheduledFor: withinAt,
            action,
            reason,
            lastDefer,
            lastStep
          });
        }
        const firstDial = nextQueuePreview.find((x) => x.action === 'dial' && x.scheduledFor);
        if (firstDial) {
          const openMs = outboundDialSchedule?.nextOpenAt ? Date.parse(outboundDialSchedule.nextOpenAt) : NaN;
          const schedMs = Date.parse(firstDial.scheduledFor);
          const ms = [openMs, schedMs].filter(Number.isFinite);
          if (ms.length > 0) {
            nextDialExpectedAt = new Date(Math.max(...ms)).toISOString();
            nextDialExpectedReason = 'first_eligible_queue_row';
          }
        }
      }
    } catch (e) {
      nextQueuePreview = null;
      nextDialExpectedAt = null;
      nextDialExpectedReason = null;
      nextQueuePreviewError = String(e?.message || e).slice(0, 240);
    }

    if (!nextDialExpectedAt && queueNextScheduledFor) {
      nextDialExpectedAt = queueNextScheduledFor;
      nextDialExpectedReason = nextDialExpectedReason || 'fallback_queue_next_scheduled_for';
    }

    const nextSchedMs = queueNextScheduledFor ? Date.parse(queueNextScheduledFor) : NaN;
    const queueNextIsFuture = Number.isFinite(nextSchedMs) && nextSchedMs > Date.now();

    let nextCallWillRunAt = null;
    let nextCallWillRunReason = null;
    if (withinScheduledDialWindow && queuePendingDueNow > 0) {
      nextCallWillRunAt = new Date().toISOString();
      nextCallWillRunReason = 'due_now_within_window';
    } else {
      const nextOpenMs = outboundDialSchedule?.nextOpenAt ? Date.parse(outboundDialSchedule.nextOpenAt) : NaN;
      const nextQueueMs = queueNextScheduledFor ? Date.parse(queueNextScheduledFor) : NaN;
      const msCandidates = [nextOpenMs, nextQueueMs].filter((x) => Number.isFinite(x));
      if (msCandidates.length > 0) {
        const ms = Math.max(...msCandidates);
        nextCallWillRunAt = new Date(ms).toISOString();
        nextCallWillRunReason = !withinScheduledDialWindow ? 'outside_window' : 'next_queue_item';
      }
    }

    let outreachActivityState = 'unknown';
    if (callsLast24h > 0) outreachActivityState = 'dialing';
    else if (totalLeads <= 0) outreachActivityState = 'no_contacts';
    else if (backlogWorkUnits > 0) {
      if (!withinScheduledDialWindow) {
        outreachActivityState = 'paused_hours_backlog';
      } else if (
        callQueuePending > 0 &&
        queuePendingDueNow === 0 &&
        queueNextIsFuture
      ) {
        outreachActivityState = 'queued_future_window';
      } else if (queueTouchesLast24h >= 5) {
        outreachActivityState = 'runner_backlog_no_logs';
      } else {
        outreachActivityState = 'stale_backlog';
      }
    } else if (displayCalls <= 0) outreachActivityState = 'not_started';
    else outreachActivityState = 'caught_up_idle';

    const trends7d = {
      dialAttempts: attempts7d,
      uniqueLeadsCalled: uniqueCalled7d,
      uniqueLeadsReached: uniqueReached7d != null ? uniqueReached7d : 0,
      answerRatePct:
        uniqueReached7d != null && uniqueCalled7d > 0
          ? Math.round((uniqueReached7d / uniqueCalled7d) * 100)
          : null
    };
    const trends30d = {
      dialAttempts: attempts30d,
      uniqueLeadsCalled: uniqueCalled30d,
      uniqueLeadsReached: uniqueReached30d != null ? uniqueReached30d : 0,
      answerRatePct:
        uniqueReached30d != null && uniqueCalled30d > 0
          ? Math.round((uniqueReached30d / uniqueCalled30d) * 100)
          : null
    };

    let highPriorityLeads = 0;
    let mediumPriorityLeads = 0;
    let lowPriorityLeads = 0;
    let scoreAccumulator = 0;
    let scoredLeadCount = 0;
    leads.forEach(lead => {
      const score = lead.score;
      if (typeof score !== 'number' || !Number.isFinite(score)) return;
      scoredLeadCount += 1;
      scoreAccumulator += score;
      if (score >= 85) {
        highPriorityLeads += 1;
      } else if (score >= 70) {
        mediumPriorityLeads += 1;
      } else {
        lowPriorityLeads += 1;
      }
    });
    const avgLeadScore = scoredLeadCount > 0 ? Math.round(scoreAccumulator / scoredLeadCount) : null;

    // Same semantics as routes/vapi-webhooks.js mapEndedReasonToOutcome
    function mapEndedReasonToOutcome(endedReason) {
      if (!endedReason || typeof endedReason !== 'string') return null;
      const r = endedReason.toLowerCase();
      if (r.includes('customer-did-not-answer') || r.includes('did-not-answer')) return 'no-answer';
      if (r.includes('customer-busy') || r.includes('busy')) return 'busy';
      if (r === 'voicemail' || r.includes('voicemail')) return 'voicemail';
      if (
        r.includes('rejected') ||
        r.includes('declined') ||
        r.includes('failed-to-connect') ||
        r.includes('misdialed')
      ) return 'declined';
      if (r.includes('vonage-rejected') || r.includes('twilio-reported')) return 'declined';
      if (
        r.includes('assistant-ended-call') ||
        r.includes('customer-ended-call') ||
        r.includes('vonage-completed')
      ) return 'completed';
      if (r.includes('silence-timed-out') || r.includes('exceeded-max-duration')) return 'completed';
      if (r.includes('error') || r.includes('fault')) return 'failed';
      return 'completed';
    }
    function isCallEnded(data) {
      if (!data) return false;
      const status = (data.status || '').toLowerCase();
      if (['ended', 'completed', 'failed', 'canceled', 'cancelled'].includes(status)) return true;
      if (data.endedReason || data.endedAt) return true;
      return false;
    }
    function getDurationFromVapi(data) {
      if (data == null) return null;
      if (typeof data.duration === 'number' && data.duration >= 0) return Math.round(data.duration);
      if (data.endedAt && data.startedAt) {
        const ms = new Date(data.endedAt) - new Date(data.startedAt);
        return ms > 0 ? Math.round(ms / 1000) : null;
      }
      return null;
    }
    const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || '';
    const GENERIC_OUTCOMES = new Set(['', 'failed', 'error', 'unknown']);
    const rowsNeedingOutcome = (recentCallRows.rows || [])
      .filter((r) => {
        if (!r.call_id || String(r.call_id).startsWith('failed_q')) return false;
        const o = String(r.outcome ?? '').trim().toLowerCase();
        return GENERIC_OUTCOMES.has(o);
      })
      .slice(0, 8);
    const vapiByCallId = new Map();
    if (vapiKey && rowsNeedingOutcome.length > 0) {
      const fetched = await Promise.all(
        rowsNeedingOutcome.map(async (r) => {
          const ac = new AbortController();
          const t = setTimeout(() => ac.abort(), 3500);
          try {
            const res = await fetch(`https://api.vapi.ai/call/${r.call_id}`, {
              headers: { Authorization: `Bearer ${vapiKey}` },
              signal: ac.signal
            });
            if (!res.ok) return { call_id: r.call_id, data: null };
            const data = await res.json();
            return { call_id: r.call_id, data };
          } catch {
            return { call_id: r.call_id, data: null };
          } finally {
            clearTimeout(t);
          }
        })
      );
      fetched.forEach(({ call_id, data }) => {
        if (data && isCallEnded(data)) {
          vapiByCallId.set(call_id, data);
          const row = rowsNeedingOutcome.find(r => r.call_id === call_id);
          if (row) {
            const fromEnded = data.endedReason ? mapEndedReasonToOutcome(data.endedReason) : null;
            const vo = String(data.outcome ?? '').trim().toLowerCase();
            const genericVo = !vo || GENERIC_OUTCOMES.has(vo);
            let outcome = data.outcome;
            if (fromEnded && genericVo) outcome = fromEnded;
            else if (!outcome && fromEnded) outcome = fromEnded;
            outcome = outcome || 'completed';
            const duration = getDurationFromVapi(data);
            import('../db.js')
              .then(({ upsertCall }) =>
                upsertCall({
                  callId: call_id,
                  clientKey,
                  leadPhone: row.lead_phone,
                  status: 'ended',
                  outcome,
                  duration,
                  cost: data.cost,
                  metadata: data.metadata || {}
                })
              )
              .catch((err) =>
                console.error('[DEMO DASHBOARD] VAPI fallback upsertCall failed:', err.message)
              );
          }
        }
      });
    }

    const STALE_INITIATED_MINUTES = 15; // treat "initiated" older than this as stale (no end-of-call webhook received)
    const recentCalls = (recentCallRows.rows || []).map(row => {
      const vapiData = row.call_id ? vapiByCallId.get(row.call_id) : null;
      let effectiveOutcome = row.outcome;
      if (vapiData && isCallEnded(vapiData)) {
        const fromEnded = vapiData.endedReason ? mapEndedReasonToOutcome(vapiData.endedReason) : null;
        const vo = String(vapiData.outcome ?? '').trim().toLowerCase();
        const genericVo = !vo || GENERIC_OUTCOMES.has(vo);
        const dbO = String(row.outcome ?? '').trim().toLowerCase();
        const genericDb = !dbO || GENERIC_OUTCOMES.has(dbO);
        if (fromEnded && (genericDb || genericVo)) effectiveOutcome = fromEnded;
        else if (!effectiveOutcome) effectiveOutcome = vapiData.outcome || fromEnded;
      }
      const effectiveDuration = row.duration != null ? row.duration : (vapiData ? getDurationFromVapi(vapiData) : null);
      const effectiveStatus = (vapiData && isCallEnded(vapiData)) ? 'ended' : row.status;

      const durationLabel = formatCallDuration(effectiveDuration);
      const transcriptPreview = truncateActivityFeedText(row.transcript);
      const endedReasonDisplay = formatVapiEndedReasonDisplay(vapiData?.endedReason);
      const retryAttempt = row.retry_attempt != null ? Math.max(0, parseInt(row.retry_attempt, 10) || 0) : 0;
      let outcomeLabel = outcomeToFriendlyLabel(effectiveOutcome);
      const metaObj = parseCallsRowMetadata(row?.metadata) || {};
      const vapiMeta =
        vapiData?.metadata && typeof vapiData.metadata === 'object' && !Array.isArray(vapiData.metadata)
          ? vapiData.metadata
          : {};
      const abExperimentRaw = metaObj.abExperiment ?? vapiMeta.abExperiment ?? null;
      const abVariantRaw = metaObj.abVariant ?? vapiMeta.abVariant ?? null;
      const abExperiment =
        abExperimentRaw != null && String(abExperimentRaw).trim() !== '' ? String(abExperimentRaw).trim() : null;
      const abVariant =
        abVariantRaw != null && String(abVariantRaw).trim() !== '' ? String(abVariantRaw).trim() : null;
      const abOutboundRaw = metaObj.abOutbound ?? vapiMeta.abOutbound ?? null;
      let abOutbound = null;
      if (abOutboundRaw && typeof abOutboundRaw === 'object' && !Array.isArray(abOutboundRaw)) {
        const ob = {};
        for (const dim of ['voice', 'opening', 'script']) {
          const slice = abOutboundRaw[dim];
          if (
            slice &&
            typeof slice === 'object' &&
            slice.variant != null &&
            String(slice.variant).trim() !== ''
          ) {
            ob[dim] = {
              experiment:
                slice.experiment != null && String(slice.experiment).trim() !== ''
                  ? String(slice.experiment).trim()
                  : null,
              variant: String(slice.variant).trim()
            };
          }
        }
        if (Object.keys(ob).length > 0) abOutbound = ob;
      }
      const queueFailReasonRaw =
        typeof metaObj.reason === 'string'
          ? metaObj.reason
          : (metaObj.reason != null ? String(metaObj.reason) : '');
      const queueFailReason = queueFailReasonRaw && queueFailReasonRaw.length > 180
        ? `${queueFailReasonRaw.slice(0, 180).trim()}…`
        : queueFailReasonRaw;
      if (isCallQueueStartFailureRow(row)) {
        outcomeLabel = 'Could not start call';
      }
      const isInitiated = (effectiveStatus || '').toLowerCase() === 'initiated';
      const createdAt = row.created_at ? new Date(row.created_at) : null;
      const ageMinutes = createdAt ? (Date.now() - createdAt.getTime()) / 60000 : 0;
      const isStaleInitiated = isInitiated && ageMinutes > STALE_INITIATED_MINUTES;

      let summary = '';
      let displayStatus = effectiveStatus;
      let displayOutcomeLabel = outcomeLabel;
      if (effectiveOutcome && outcomeLabel) {
        if (isCallQueueStartFailureRow(row) && queueFailReason) {
          summary = `Could not start call — ${queueFailReason}`;
        } else {
          summary = durationLabel ? `${outcomeLabel} • ${durationLabel}` : outcomeLabel;
        }
      } else if (isStaleInitiated) {
        summary = 'Call ended — result not received (VAPI end-of-call webhook may not have been sent)';
        displayStatus = 'ended';
        displayOutcomeLabel = 'Result not received';
      } else if (isInitiated) {
        summary = 'Ringing — result will appear when the call ends';
      } else {
        summary = durationLabel ? `Call ended • ${durationLabel}` : 'Call ended';
      }
      return {
        id: row.call_id || row.id,
        callId: row.call_id,
        dbId: row.id,
        name: row.name || row.lead_phone,
        leadPhone: row.lead_phone && String(row.lead_phone).trim() ? String(row.lead_phone).trim() : null,
        service: row.service || 'Lead Follow-Up',
        channel: activityChannel,
        summary,
        status: mapCallStatus(displayStatus),
        statusClass: mapStatusClass(displayStatus),
        timeAgo: formatTimeAgoLabel(row.created_at),
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        recordingUrl: row.recording_url && String(row.recording_url).trim()
          ? String(row.recording_url).trim()
          : null,
        outcome: isStaleInitiated ? 'unknown' : (effectiveOutcome || null),
        outcomeLabel: displayOutcomeLabel || null,
        duration: effectiveDuration != null ? effectiveDuration : null,
        durationLabel: durationLabel || null,
        rawStatus: displayStatus,
        transcriptPreview: transcriptPreview || null,
        endedReason: endedReasonDisplay || null,
        queueStartFailureReason: isCallQueueStartFailureRow(row) ? (queueFailReason || null) : null,
        retryAttempt,
        hasRecording: !!(row.recording_url && String(row.recording_url).trim()),
        abExperiment,
        abVariant,
        abOutbound
      };
    });

    const responseDiffs = (responseRows.rows || [])
      .map(row => {
        const leadTime = new Date(row.lead_created).getTime();
        const callTime = new Date(row.call_created).getTime();
        if (!leadTime || !callTime || callTime <= leadTime) return null;
        const diffMinutes = (callTime - leadTime) / 60000;
        // First call within 48h of lead creation; exclude extreme delays
        return diffMinutes <= 2880 ? diffMinutes : null;
      })
      .filter(Boolean);
    const avgResponseMinutes = responseDiffs.length
      ? Math.round(responseDiffs.reduce((sum, val) => sum + val, 0) / responseDiffs.length)
      : null; // Use null instead of 0 to distinguish "no data" from "0 minutes"
    const firstResponse =
      avgResponseMinutes === null || avgResponseMinutes === undefined
        ? '—' // Show dash if no data
        : avgResponseMinutes >= 60
          ? `${Math.floor(avgResponseMinutes / 60)}h ${avgResponseMinutes % 60}m`
          : `${avgResponseMinutes}m`;

    const touchpointMap = new Map(
      (touchpointRows.rows || []).map(row => {
        const raw = row.bucket_day;
        const dayKey = typeof raw === 'string'
          ? raw.slice(0, 10)
          : new Date(raw).toISOString().slice(0, 10);
        return [
          dayKey,
          {
            attempts: parseInt(row.touchpoints || 0, 10),
            uniquePhones: parseInt(row.unique_phones || 0, 10),
            bookedRows: parseInt(row.booked_rows || 0, 10),
            voicemailRows: parseInt(row.voicemail_rows || 0, 10),
            avgDurationSec: Math.max(0, parseInt(row.avg_duration_sec || 0, 10)),
            maxDurationSec: Math.max(0, parseInt(row.max_duration_sec || 0, 10)),
            uniqueReached: parseInt(row.unique_reached || 0, 10)
          }
        ];
      })
    );
    const emptyDayBucket = () => ({
      attempts: 0,
      uniquePhones: 0,
      bookedRows: 0,
      voicemailRows: 0,
      avgDurationSec: 0,
      maxDurationSec: 0,
      uniqueReached: 0
    });
    const touchpointLabels = [];
    const touchpointData = [];
    const touchpointDates = [];
    const touchpointUniqueByDay = [];
    const touchpointByDay = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const day = activityAsOfLondon.startOf('day').minus({ days: offset });
      const key = day.toFormat('yyyy-MM-dd');
      touchpointLabels.push(day.setLocale('en-GB').toFormat('ccc'));
      const bucket = touchpointMap.get(key);
      const merged = bucket ? { ...emptyDayBucket(), ...bucket } : emptyDayBucket();
      touchpointData.push(merged.attempts);
      touchpointUniqueByDay.push(merged.uniquePhones);
      touchpointDates.push(key);
      touchpointByDay.push(merged);
    }

    const upcomingAppointments = (upcomingAppointmentRows.rows || []).map(row => ({
      id: row.id,
      start: row.start_iso,
      end: row.end_iso,
      status: row.status || 'booked',
      name: row.name || 'Prospect',
      service: row.service || 'Consultation'
    }));

    const daysInPeriod = 30;
    const estimatedCost =
      monthlyServiceFee != null ? Number((monthlyServiceFee * (daysInPeriod / 30)).toFixed(2)) : null;
    const estimatedRevenue =
      avgDealValue != null ? Number((weeklyBookings * avgDealValue).toFixed(2)) : null;
    const estimatedProfit =
      estimatedCost != null && estimatedRevenue != null
        ? Number((estimatedRevenue - estimatedCost).toFixed(2))
        : null;
    const roiMultiplier =
      estimatedCost > 0 && estimatedRevenue != null ? estimatedRevenue / estimatedCost : null;
    const roiPercentage =
      roiMultiplier != null && roiMultiplier > 0 ? (roiMultiplier - 1) * 100 : null;

    const trimAbExp = (x) => (x != null && String(x).trim() !== '' ? String(x).trim() : '');
    let voiceExpName = trimAbExp(client?.vapi?.outboundAbVoiceExperiment);
    let openingExpName = trimAbExp(client?.vapi?.outboundAbOpeningExperiment);
    let scriptExpName = trimAbExp(client?.vapi?.outboundAbScriptExperiment);
    let voiceExpSource = voiceExpName ? 'vapi' : null;
    let openingExpSource = openingExpName ? 'vapi' : null;
    let scriptExpSource = scriptExpName ? 'vapi' : null;
    if (!voiceExpName && !openingExpName && !scriptExpName) {
      try {
        const { inferOutboundAbExperimentNamesForDimensions } = await import('../db.js');
        const infDim = await inferOutboundAbExperimentNamesForDimensions(clientKey);
        if (infDim.voice) {
          voiceExpName = infDim.voice;
          voiceExpSource = 'inferred';
        }
        if (infDim.opening) {
          openingExpName = infDim.opening;
          openingExpSource = 'inferred';
        }
        if (infDim.script) {
          scriptExpName = infDim.script;
          scriptExpSource = 'inferred';
        }
      } catch (infErr) {
        console.error('[DEMO DASHBOARD] outbound A/B dimension infer error:', infErr?.message || infErr);
      }
    }
    if (!voiceExpName && !openingExpName && !scriptExpName) {
      try {
        const { inferOutboundAbBundleTriple } = await import('../db.js');
        const triple = await inferOutboundAbBundleTriple(clientKey);
        if (triple) {
          voiceExpName = triple.voice;
          openingExpName = triple.opening;
          scriptExpName = triple.script;
          voiceExpSource = 'inferred_bundle';
          openingExpSource = 'inferred_bundle';
          scriptExpSource = 'inferred_bundle';
          const hadOutboundAbSlot =
            trimAbExp(client?.vapi?.outboundAbVoiceExperiment) ||
            trimAbExp(client?.vapi?.outboundAbOpeningExperiment) ||
            trimAbExp(client?.vapi?.outboundAbScriptExperiment);
          if (!hadOutboundAbSlot) {
            const { updateClientConfig } = await import('../lib/client-onboarding.js');
            await updateClientConfig(clientKey, {
              vapi: {
                outboundAbVoiceExperiment: triple.voice,
                outboundAbOpeningExperiment: triple.opening,
                outboundAbScriptExperiment: triple.script
              }
            });
          }
        }
      } catch (bundleErr) {
        console.error('[DEMO DASHBOARD] outbound A/B bundle infer error:', bundleErr?.message || bundleErr);
      }
    }

    const dimensionalMode = !!(voiceExpName || openingExpName || scriptExpName);

    let legacyOutboundAbExperimentName = trimAbExp(client?.vapi?.outboundAbExperiment);
    let legacyOutboundAbExperimentSource = legacyOutboundAbExperimentName ? 'vapi' : null;
    let legacyOutboundAbSummary = null;
    if (!dimensionalMode) {
      if (!legacyOutboundAbExperimentName) {
        try {
          const { inferOutboundAbExperimentName } = await import('../db.js');
          const inferred = await inferOutboundAbExperimentName(clientKey);
          if (inferred) {
            legacyOutboundAbExperimentName = inferred;
            legacyOutboundAbExperimentSource = 'inferred';
          }
        } catch (infErr) {
          console.error('[DEMO DASHBOARD] outbound A/B infer error:', infErr?.message || infErr);
        }
      }
      if (legacyOutboundAbExperimentName) {
        try {
          const { getOutboundAbExperimentSummary } = await import('../db.js');
          legacyOutboundAbSummary = await getOutboundAbExperimentSummary(
            clientKey,
            legacyOutboundAbExperimentName
          );
        } catch (abSumErr) {
          console.error('[DEMO DASHBOARD] outbound A/B summary error:', abSumErr?.message || abSumErr);
        }
      }
    }

    let voiceSummary = null;
    let openingSummary = null;
    let scriptSummary = null;
    if (dimensionalMode) {
      try {
        const { getOutboundAbExperimentSummary } = await import('../db.js');
        [voiceSummary, openingSummary, scriptSummary] = await Promise.all([
          voiceExpName ? getOutboundAbExperimentSummary(clientKey, voiceExpName) : Promise.resolve(null),
          openingExpName ? getOutboundAbExperimentSummary(clientKey, openingExpName) : Promise.resolve(null),
          scriptExpName ? getOutboundAbExperimentSummary(clientKey, scriptExpName) : Promise.resolve(null)
        ]);
      } catch (abSumErr) {
        console.error('[DEMO DASHBOARD] outbound A/B dimensional summary error:', abSumErr?.message || abSumErr);
      }
    }

    let assistantSnap = null;
    try {
      const { getVapiAssistantCreativeSnapshot } = await import('../lib/outbound-ab-baseline.js');
      assistantSnap = await getVapiAssistantCreativeSnapshot(client);
    } catch (asErr) {
      console.error('[DEMO DASHBOARD] assistant snapshot error:', asErr?.message || asErr);
      assistantSnap = { voiceId: '', firstMessage: '', script: '', fetchFailedReason: 'snapshot_error' };
    }
    const scriptPreviewForAbPayload = (s) => {
      if (!s || !String(s).trim()) return null;
      const t = String(s).trim();
      return t.length > 280 ? `${t.slice(0, 280).trim()}…` : t;
    };
    const vapiAssistantLive = {
      voiceId: assistantSnap.voiceId ? String(assistantSnap.voiceId).trim() : null,
      firstMessage: assistantSnap.firstMessage ? String(assistantSnap.firstMessage).trim() : null,
      scriptPreview: scriptPreviewForAbPayload(assistantSnap.script),
      fetchFailedReason: assistantSnap.fetchFailedReason || null
    };

    try {
      const { enrichOutboundAbDashboardSummariesFromAssistant } = await import(
        '../lib/outbound-ab-dashboard-enrich.js'
      );
      await enrichOutboundAbDashboardSummariesFromAssistant(
        client,
        {
          voiceSummary,
          openingSummary,
          scriptSummary,
          legacyOutboundAbSummary
        },
        { preloadedSnap: assistantSnap }
      );
    } catch (enrichErr) {
      console.error('[DEMO DASHBOARD] outbound A/B assistant enrich error:', enrichErr?.message || enrichErr);
    }

    const { resolveOutboundAbDimensionsForDial, outboundAbDialWarning } = await import(
      '../lib/outbound-ab-focus.js'
    );
    const focusStored = trimAbExp(client?.vapi?.outboundAbFocusDimension);
    const focusNorm = focusStored.toLowerCase();
    const focusValid = ['voice', 'opening', 'script'].includes(focusNorm) ? focusNorm : '';
    const dialPairs = resolveOutboundAbDimensionsForDial({
      voiceExp: voiceExpName,
      openingExp: openingExpName,
      scriptExp: scriptExpName,
      focusDimension: focusValid
    });
    const dialActiveDimensions = dialPairs.map((p) => p[0]);
    const dialWarning = dimensionalMode
      ? outboundAbDialWarning({
          voiceExp: voiceExpName,
          openingExp: openingExpName,
          scriptExp: scriptExpName,
          focusDimension: focusValid
        })
      : null;

    const recentFeedVariantCounts = {};
    const recentFeedAbByDimension = { voice: {}, opening: {}, script: {} };
    for (const c of recentCalls) {
      if (c.abOutbound && typeof c.abOutbound === 'object') {
        for (const dim of ['voice', 'opening', 'script']) {
          const slice = c.abOutbound[dim];
          if (slice && slice.variant) {
            const k = String(slice.variant);
            recentFeedAbByDimension[dim][k] = (recentFeedAbByDimension[dim][k] || 0) + 1;
          }
        }
      } else if (c.abVariant) {
        const k = String(c.abVariant);
        recentFeedVariantCounts[k] = (recentFeedVariantCounts[k] || 0) + 1;
      }
    }

    let liveResults = null;
    try {
      const { buildOutboundAbLiveResultsPayload } = await import('../lib/outbound-ab-live-results.js');
      liveResults = buildOutboundAbLiveResultsPayload({
        client,
        dimensionalMode,
        focusValid,
        voiceExpName,
        voiceSummary,
        openingExpName,
        openingSummary,
        scriptExpName,
        scriptSummary,
        legacyOutboundAbExperimentName,
        legacyOutboundAbSummary,
        dialActiveDimensions
      });
    } catch (liveResErr) {
      console.error('[DEMO DASHBOARD] outbound A/B liveResults error:', liveResErr?.message || liveResErr);
      liveResults = {
        serverTime: new Date().toISOString(),
        minSamplesPerVariant: 50,
        notifyEmailConfigured: false,
        focusExperiment: null,
        reason: 'build_error'
      };
    }

    const { isOutboundAbReviewPending } = await import('../lib/outbound-ab-review-lock.js');
    const reviewPending = isOutboundAbReviewPending(client?.vapi);
    const reviewPendingSinceRaw =
      client?.vapi?.outboundAbReviewPending != null ? String(client.vapi.outboundAbReviewPending).trim() : '';
    const reviewPendingSince =
      reviewPending && reviewPendingSinceRaw !== '' ? reviewPendingSinceRaw : null;

    const uRow = usageMetersRow.rows?.[0] || {};
    const sec7 = Number(uRow.talk_seconds_7d) || 0;
    const sec30 = Number(uRow.talk_seconds_30d) || 0;
    const capCalls = parseInt(String(process.env.USAGE_CAP_MONTHLY_CALLS || '').trim(), 10);
    const capMins = parseInt(String(process.env.USAGE_CAP_MONTHLY_MINUTES || '').trim(), 10);
    const usageMeters = {
      asOf: new Date().toISOString(),
      windows: {
        last7Days: {
          dialAttempts: Number(uRow.calls_7d) || 0,
          talkMinutes: Math.round((sec7 / 60) * 10) / 10
        },
        last30Days: {
          dialAttempts: Number(uRow.calls_30d) || 0,
          talkMinutes: Math.round((sec30 / 60) * 10) / 10,
          newLeads: Number(uRow.leads_new_30d) || 0,
          appointments: Number(uRow.appointments_30d) || 0
        }
      },
      caps: {
        monthlyDialAttempts: Number.isFinite(capCalls) && capCalls > 0 ? capCalls : null,
        monthlyTalkMinutes: Number.isFinite(capMins) && capMins > 0 ? capMins : null,
        note:
          'Optional USAGE_CAP_MONTHLY_CALLS / USAGE_CAP_MONTHLY_MINUTES on Render — display hints until billing enforces limits.'
      },
      plan: {
        name: trimEnvDashboard('USAGE_PLAN_NAME'),
        periodNote: trimEnvDashboard('USAGE_PLAN_PERIOD_NOTE'),
        upgradeUrl: trimEnvDashboard('USAGE_UPGRADE_URL'),
        supportEmail: trimEnvDashboard('SUPPORT_CONTACT_EMAIL')
      }
    };

    const dashboardExperience = buildDashboardExperience(client, activityAsOfLondon.toISO());

    const payload = {
      ok: true,
      source: 'live',
      briefInitialLoad: briefRequested,
      recentLeadsListCap: leadsDashboardCap,
      outboundAbTest: {
        mode: dimensionalMode ? 'dimensional' : 'legacy',
        voice: {
          experimentName: voiceExpName || null,
          experimentNameSource: voiceExpSource,
          summary: voiceSummary
        },
        opening: {
          experimentName: openingExpName || null,
          experimentNameSource: openingExpSource,
          summary: openingSummary
        },
        script: {
          experimentName: scriptExpName || null,
          experimentNameSource: scriptExpSource,
          summary: scriptSummary
        },
        legacy: {
          experimentName: dimensionalMode ? null : legacyOutboundAbExperimentName || null,
          experimentNameSource: dimensionalMode ? null : legacyOutboundAbExperimentSource,
          summary: dimensionalMode ? null : legacyOutboundAbSummary
        },
        experimentName: dimensionalMode ? null : legacyOutboundAbExperimentName || null,
        experimentNameSource: dimensionalMode ? null : legacyOutboundAbExperimentSource,
        summary: dimensionalMode ? null : legacyOutboundAbSummary,
        recentFeedVariantCounts,
        recentFeedAbByDimension,
        focusDimension: focusStored || null,
        dialActiveDimensions,
        dialWarning,
        vapiAssistantLive,
        bundlePhase:
          client?.vapi?.outboundAbBundlePhase != null &&
          String(client.vapi.outboundAbBundlePhase).trim() !== ''
            ? String(client.vapi.outboundAbBundlePhase).trim()
            : null,
        bundleStartedAt:
          client?.vapi?.outboundAbBundleAt != null &&
          String(client.vapi.outboundAbBundleAt).trim() !== ''
            ? String(client.vapi.outboundAbBundleAt).trim()
            : null,
        liveResults,
        reviewPending,
        reviewPendingSince
      },
      metrics: {
        totalLeads,
        totalCalls: displayCalls,
        dialAttemptsAllTime: totalCalls,
        callsLast24h,
        uniqueLeadsCalledLast24,
        totalCallAttempts: totalCalls,
        uniqueLeadsCalled: displayCalls,
        callsAnswered: uniqueLeadsAnswered,
        callsNotAnswered: uniqueLeadsNoPickup,
        callsAnsweredAttempts,
        callsNotAnsweredAttempts,
        uniqueLeadsAnswered,
        uniqueLeadsNoPickup,
        uniqueLeadsPendingOnly,
        callsOutcomePending,
        uniqueLeadsReachedLast24,
        uniqueLeadsNoPickupLast24,
        answerRateLast24,
        answerRate: uniqueLeadsCalled > 0 ? Math.round((uniqueLeadsAnswered / uniqueLeadsCalled) * 100) : 0,
        last24hLeads,
        conversionRate,
        successRate,
        avgLeadScore,
        firstResponse,
        firstResponseSampleSize: responseDiffs.length,
        bookingsThisWeek: weeklyBookings,
        highPriorityLeads,
        mediumPriorityLeads,
        lowPriorityLeads,
        activityTimezone: DASHBOARD_ACTIVITY_TZ,
        activityWindowHours: 24
      },
      serviceMix,
      leads,
      recentCalls,
      roi: {
        costs: {
          total: estimatedCost,
          monthlyFee: monthlyServiceFee,
          perCall:
            estimatedCost != null && totalCalls > 0 ? Number((estimatedCost / totalCalls).toFixed(2)) : null
        },
        revenue: {
          total: estimatedRevenue,
          bookings: weeklyBookings,
          avgDealValue
        },
        roi: {
          profit: estimatedProfit,
          multiplier: roiMultiplier != null ? Number(roiMultiplier.toFixed(1)) : null,
          percentage: roiPercentage != null ? Number(roiPercentage.toFixed(0)) : null
        }
      },
      appointments: upcomingAppointments,
      touchpoints: {
        labels: touchpointLabels,
        data: touchpointData,
        dates: touchpointDates,
        uniqueByDay: touchpointUniqueByDay,
        byDay: touchpointByDay
      },
      config: {
        phone: client?.phone || client?.whiteLabel?.phone || client?.numbers?.primary || null,
        businessHours: client?.businessHours || client?.whiteLabel?.businessHours || client?.booking?.businessHours || null,
        timezone: client?.timezone || client?.booking?.timezone || null,
        industry: client?.industry || client?.whiteLabel?.industry || null
      },
      activityAsOfIso: activityAsOfLondon.toISO(),
      activityTimezone: DASHBOARD_ACTIVITY_TZ,
      outreachCapacity: {
        crmTotalLeads: totalLeads,
        uniqueLeadsDialed: displayCalls,
        leadsNeverDialed,
        callQueuePending,
        callableLeadsToday: callableLeadsTodayWindowed,
        callableLeadsNextSlot,
        blockedDailyLimitToday: blockedDailyLimitTodayWindowed,
        blockedDailyLimitNextSlot,
        dialAttemptsLast24h: callsLast24h,
        queueTouchesLast24h,
        queuePendingDueNow,
        queueProcessingNow,
        queueOldestDueFor,
        queueNextScheduledFor,
        nextCallWillRunAt,
        nextCallWillRunReason,
        nextDialExpectedAt,
        nextDialExpectedReason,
        nextQueuePreview,
        nextQueuePreviewError,
        outboundQueueSchedule,
        dialSlotsUsedLocalToday,
        dialsPerHour: Number(dialsPerHour.toFixed(2)),
        estimatedHoursToClearBacklog,
        lastDialAttemptAt,
        activityState: outreachActivityState,
        withinScheduledDialWindow,
        outboundDialSchedule,
        semantics: {
          callableLeadsToday: 'Count of leads eligible to dial right now (0 when outside calling window).',
          callableLeadsNextSlot: 'Count of leads eligible to dial when the next calling window opens.',
          blockedDailyLimitToday: 'Count of leads blocked right now by weekday slot usage (0 when outside calling window).',
          blockedDailyLimitNextSlot: 'Count of leads that will be blocked at the next calling window by weekday slot usage.'
        },
        trends7d,
        trends30d
      },
      usageMeters,
      dashboardExperience
    };
    res.set('Cache-Control', 'no-store, must-revalidate, max-age=0');
    return res.json(payload);
  } catch (error) {
    console.error('[DEMO DASHBOARD ERROR]', error);
    await sendOperatorAlert?.({
      subject: `Dashboard sync failed for ${String(clientKey)}`,
      html: `<p><code>GET /api/demo-dashboard/${String(clientKey)}</code> failed.</p><pre>${JSON.stringify(
        { message: error?.message, stack: error?.stack?.split('\n').slice(0, 10).join('\n') },
        null,
        2
      )}</pre>`,
      dedupeKey: `demo-dash-fail:${String(clientKey)}`,
      throttleMinutes: 90
    }).catch(() => {});
    return res.status(500).json({ ok: false, error: error?.message });
  }
}

