import { Router } from 'express';

export function createCallInsightsRouter(deps) {
  const { cacheMiddleware, poolQuerySelect, query } = deps || {};
  const router = Router();

  // API endpoint for dashboard call quality metrics (7-day window; aligns with main dashboard “answered” heuristics)
  router.get(
    '/call-quality/:clientKey',
    cacheMiddleware({ ttl: 60000, keyPrefix: 'call-quality:v10:' }),
    async (req, res) => {
      try {
        const { clientKey } = req.params;

        const loadCallQualityPrimaryStats = async () => {
          try {
            const allCalls = await poolQuerySelect(
              `
      WITH windowed AS (
        SELECT
          c.lead_phone,
          c.outcome,
          c.status,
          c.duration,
          COALESCE(ts.transcript_snip, '') AS transcript_snip,
          COALESCE(c.recording_url::text, '') AS recording_url_txt
        FROM calls c
        LEFT JOIN LATERAL (
          SELECT LEFT(COALESCE(c.transcript::text, ''), 512) AS transcript_snip
          WHERE c.outcome IS NULL
            AND COALESCE(c.recording_url::text, '') = ''
            AND NOT (
              (
                COALESCE(c.duration, 0) >= 20
                AND LOWER(TRIM(COALESCE(c.status::text, ''))) IN ('ended', 'completed', 'finished')
              )
              OR (
                COALESCE(c.duration, 0) >= 40
                AND LOWER(TRIM(COALESCE(c.status::text, ''))) NOT IN (
                  'failed', 'busy', 'no-answer', 'canceled', 'cancelled',
                  'declined', 'rejected', 'voicemail'
                )
              )
            )
        ) ts ON TRUE
        WHERE c.client_key = $1
          AND c.created_at >= NOW() - INTERVAL '7 days'
      ),
      flags AS (
        SELECT
          lead_phone,
          outcome,
          status,
          duration,
          transcript_snip,
          recording_url_txt,
          (
            (outcome IS NOT NULL AND outcome::text NOT IN (
              'no-answer', 'busy', 'failed', 'voicemail', 'declined', 'rejected'
            ))
            OR (
              outcome IS NULL AND (
                (COALESCE(duration, 0) >= 20 AND LOWER(TRIM(COALESCE(status::text, ''))) IN ('ended', 'completed', 'finished'))
                OR (
                  COALESCE(duration, 0) >= 40
                  AND LOWER(TRIM(COALESCE(status::text, ''))) NOT IN (
                    'failed', 'busy', 'no-answer', 'canceled', 'cancelled',
                    'declined', 'rejected', 'voicemail'
                  )
                )
                OR (transcript_snip <> '' AND LENGTH(TRIM(transcript_snip)) > 40)
                OR (recording_url_txt <> '')
              )
            )
          ) AS is_answered,
          (
            outcome::text IN ('no-answer', 'busy', 'failed', 'voicemail', 'declined', 'rejected')
            OR (
              outcome IS NULL AND (
                LOWER(TRIM(COALESCE(status::text, ''))) IN (
                  'failed', 'busy', 'no-answer', 'canceled', 'cancelled',
                  'declined', 'rejected', 'voicemail'
                )
                OR (
                  LOWER(TRIM(COALESCE(status::text, ''))) IN ('ended', 'completed', 'finished')
                  AND COALESCE(duration, 0) > 0
                  AND COALESCE(duration, 0) < 12
                )
              )
            )
          ) AS is_no_pickup
        FROM windowed
      )
      SELECT
        COUNT(*)::int AS total_calls,
        COUNT(DISTINCT lead_phone)::int AS unique_leads,
        COALESCE(AVG(CASE WHEN COALESCE(duration, 0) > 0 THEN duration::numeric END), 0) AS avg_duration_sec,
        COUNT(*) FILTER (WHERE outcome::text = 'booked')::int AS bookings_from_calls,
        COUNT(*) FILTER (WHERE is_answered)::int AS answered_attempts,
        COUNT(*) FILTER (WHERE is_no_pickup)::int AS no_pickup_attempts,
        COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE(outcome::text, ''))) = 'voicemail')::int AS voicemail_attempts
      FROM flags
    `,
              [clientKey],
            );
            return allCalls.rows?.[0] || {};
          } catch (primaryErr) {
            console.error(
              '[CALL QUALITY] primary aggregate failed, using fallback:',
              primaryErr?.message || primaryErr,
            );
            const simple = await poolQuerySelect(
              `
        SELECT
          COUNT(*)::int AS total_calls,
          COUNT(DISTINCT lead_phone)::int AS unique_leads,
          COALESCE(AVG(CASE WHEN COALESCE(duration, 0) > 0 THEN duration::numeric END), 0) AS avg_duration_sec,
          COUNT(*) FILTER (WHERE COALESCE(outcome::text, '') = 'booked')::int AS bookings_from_calls,
          COUNT(*) FILTER (WHERE
            COALESCE(duration, 0) >= 20
            OR (
              outcome IS NOT NULL
              AND outcome::text NOT IN ('no-answer', 'busy', 'failed', 'voicemail', 'declined', 'rejected')
            )
          )::int AS answered_attempts,
          COUNT(*) FILTER (WHERE outcome::text IN ('no-answer', 'busy', 'failed', 'voicemail', 'declined', 'rejected'))::int AS no_pickup_attempts,
          COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE(outcome::text, ''))) = 'voicemail')::int AS voicemail_attempts
        FROM calls
        WHERE client_key = $1
          AND created_at >= NOW() - INTERVAL '7 days'
      `,
              [clientKey],
            );
            return simple.rows?.[0] || {};
          }
        };

        const loadCallQualityAtp = async () => {
          let avgCallsToFirstPickup = null;
          let leadsWithFirstPickup7d = 0;
          try {
            const atpRows = await poolQuerySelect(
              `
        WITH windowed AS (
          SELECT
            lead_phone, created_at, outcome, status, duration,
            LEFT(COALESCE(transcript::text, ''), 512) AS transcript,
            recording_url
          FROM calls
          WHERE client_key = $1
            AND created_at >= NOW() - INTERVAL '7 days'
        ),
        flags AS (
          SELECT
            lead_phone,
            ROW_NUMBER() OVER (PARTITION BY lead_phone ORDER BY created_at ASC) AS rn,
            (
              (outcome IS NOT NULL AND outcome::text NOT IN (
                'no-answer', 'busy', 'failed', 'voicemail', 'declined', 'rejected'
              ))
              OR (
                outcome IS NULL AND (
                  (COALESCE(duration, 0) >= 20 AND LOWER(TRIM(COALESCE(status::text, ''))) IN ('ended', 'completed', 'finished'))
                  OR (
                    COALESCE(duration, 0) >= 40
                    AND LOWER(TRIM(COALESCE(status::text, ''))) NOT IN (
                      'failed', 'busy', 'no-answer', 'canceled', 'cancelled',
                      'declined', 'rejected', 'voicemail'
                    )
                  )
                  OR (COALESCE(transcript::text, '') <> '' AND LENGTH(TRIM(COALESCE(transcript::text, ''))) > 40)
                  OR (COALESCE(recording_url::text, '') <> '')
                )
              )
            ) AS is_pickup
          FROM windowed
        ),
        first_pick AS (
          SELECT lead_phone, MIN(rn) AS attempts_to_first_pickup
          FROM flags
          WHERE is_pickup
          GROUP BY lead_phone
        )
        SELECT
          COUNT(*)::int AS lead_count,
          AVG(attempts_to_first_pickup::numeric) AS avg_attempts
        FROM first_pick
      `,
              [clientKey],
            );
            const ar = atpRows.rows?.[0];
            leadsWithFirstPickup7d = parseInt(ar?.lead_count || 0, 10);
            const rawAvg = ar?.avg_attempts;
            if (leadsWithFirstPickup7d > 0 && rawAvg != null && Number.isFinite(Number(rawAvg))) {
              avgCallsToFirstPickup = Math.round(Number(rawAvg) * 10) / 10;
            }
          } catch (atpErr) {
            console.warn('[CALL QUALITY] avg calls to pickup skipped:', atpErr?.message || atpErr);
            try {
              const simpleAtp = await poolQuerySelect(
                `
          WITH windowed AS (
            SELECT lead_phone, created_at, outcome, duration
            FROM calls
            WHERE client_key = $1
              AND created_at >= NOW() - INTERVAL '7 days'
          ),
          flags AS (
            SELECT
              lead_phone,
              ROW_NUMBER() OVER (PARTITION BY lead_phone ORDER BY created_at ASC) AS rn,
              (
                COALESCE(duration, 0) >= 20
                OR (
                  outcome IS NOT NULL
                  AND outcome::text NOT IN ('no-answer', 'busy', 'failed', 'voicemail', 'declined', 'rejected')
                )
              ) AS is_pickup
            FROM windowed
          ),
          first_pick AS (
            SELECT lead_phone, MIN(rn) AS attempts_to_first_pickup
            FROM flags
            WHERE is_pickup
            GROUP BY lead_phone
          )
          SELECT
            COUNT(*)::int AS lead_count,
            AVG(attempts_to_first_pickup::numeric) AS avg_attempts
          FROM first_pick
        `,
                [clientKey],
              );
              const ar2 = simpleAtp.rows?.[0];
              leadsWithFirstPickup7d = parseInt(ar2?.lead_count || 0, 10);
              const rawAvg2 = ar2?.avg_attempts;
              if (leadsWithFirstPickup7d > 0 && rawAvg2 != null && Number.isFinite(Number(rawAvg2))) {
                avgCallsToFirstPickup = Math.round(Number(rawAvg2) * 10) / 10;
              }
            } catch (e2) {
              console.warn('[CALL QUALITY] avg calls to pickup fallback failed:', e2?.message || e2);
            }
          }
          return { avgCallsToFirstPickup, leadsWithFirstPickup7d };
        };

        const [stats, apptCount, peakHour, dowRows, medRows, atpParsed] = await Promise.all([
          loadCallQualityPrimaryStats(),
          poolQuerySelect(
            `
      SELECT COUNT(*)::int AS n
      FROM appointments
      WHERE client_key = $1
        AND created_at >= NOW() - INTERVAL '7 days'
    `,
            [clientKey],
          ).catch((apptErr) => {
            console.warn('[CALL QUALITY] appointments count skipped:', apptErr?.message || apptErr);
            return { rows: [{ n: 0 }] };
          }),
          poolQuerySelect(
            `
      SELECT EXTRACT(HOUR FROM created_at)::int AS hour_of_day,
             COUNT(*)::int AS cnt
      FROM calls
      WHERE client_key = $1
        AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY 1
      ORDER BY cnt DESC
      LIMIT 1
    `,
            [clientKey],
          ).catch((peakErr) => {
            console.warn('[CALL QUALITY] peak hour skipped:', peakErr?.message || peakErr);
            return { rows: [] };
          }),
          poolQuerySelect(
            `
        SELECT EXTRACT(ISODOW FROM created_at)::int AS isodow,
               COUNT(*)::int AS cnt
        FROM calls
        WHERE client_key = $1
          AND created_at >= NOW() - INTERVAL '7 days'
        GROUP BY 1
        ORDER BY cnt DESC, isodow ASC
        LIMIT 1
      `,
            [clientKey],
          ).catch((dowErr) => {
            console.warn('[CALL QUALITY] peak weekday skipped:', dowErr?.message || dowErr);
            return { rows: [] };
          }),
          poolQuerySelect(
            `
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration::double precision) AS m
        FROM calls
        WHERE client_key = $1
          AND created_at >= NOW() - INTERVAL '7 days'
          AND COALESCE(duration, 0) > 0
      `,
            [clientKey],
          ).catch((medErr) => {
            console.warn('[CALL QUALITY] median duration skipped:', medErr?.message || medErr);
            return { rows: [] };
          }),
          loadCallQualityAtp(),
        ]);

        const appts7d = parseInt(apptCount.rows?.[0]?.n || 0, 10);
        let peakWeekdayLabel = '—';
        let peakWeekdayDialCount = 0;
        const dr = dowRows.rows?.[0];
        const isoLabels = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const d = parseInt(dr?.isodow, 10);
        if (dr && Number(dr.cnt) > 0 && d >= 1 && d <= 7) {
          peakWeekdayLabel = isoLabels[d] || '—';
          peakWeekdayDialCount = parseInt(dr.cnt, 10) || 0;
        }
        let medianDurationSeconds = 0;
        const rawMed = medRows.rows?.[0]?.m;
        if (rawMed != null && Number.isFinite(Number(rawMed))) {
          medianDurationSeconds = Math.round(Number(rawMed));
        }
        const avgCallsToFirstPickup = atpParsed.avgCallsToFirstPickup;
        const leadsWithFirstPickup7d = atpParsed.leadsWithFirstPickup7d;

        const bookingsFromCalls = parseInt(stats.bookings_from_calls || 0, 10);
        const totalCalls = parseInt(stats.total_calls || 0, 10);
        const uniqueLeads = parseInt(stats.unique_leads || 0, 10);
        const answeredAttempts = parseInt(stats.answered_attempts || 0, 10);
        const noPickupAttempts = parseInt(stats.no_pickup_attempts || 0, 10);
        const voicemailAttempts = parseInt(stats.voicemail_attempts || 0, 10);
        const avgSec = parseFloat(stats.avg_duration_sec) || 0;
        const bookingNumerator = Math.max(bookingsFromCalls, appts7d);

        const peak = peakHour.rows?.[0];
        let bestTime = '—';
        let bestTimeDialCount = 0;
        if (peak && peak.hour_of_day != null && Number(peak.cnt) > 0) {
          const h = Number(peak.hour_of_day);
          const end = (h + 2) % 24;
          bestTime = `${String(h).padStart(2, '0')}:00–${String(end).padStart(2, '0')}:00`;
          bestTimeDialCount = parseInt(peak.cnt, 10) || 0;
        }

        const reachRate = totalCalls > 0 ? Math.min(100, Math.round((answeredAttempts / totalCalls) * 100)) : 0;
        const pickupRate = reachRate;
        const bookingRate =
          totalCalls > 0 ? Math.min(100, Math.round((bookingNumerator / totalCalls) * 100)) : 0;
        const attemptsPerLead = uniqueLeads > 0 ? Math.round((totalCalls / uniqueLeads) * 10) / 10 : null;
        const voicemailRate =
          totalCalls > 0 ? Math.min(100, Math.round((voicemailAttempts / totalCalls) * 100)) : 0;

        res.json({
          ok: true,
          avgDurationSeconds: Math.round(avgSec),
          medianDurationSeconds,
          totalCalls,
          uniqueLeadsDialed7d: uniqueLeads,
          answeredAttempts7d: answeredAttempts,
          noPickupAttempts7d: noPickupAttempts,
          voicemailAttempts,
          voicemailRate,
          peakWeekdayLabel,
          peakWeekdayDialCount,
          pickupRate,
          reachRate,
          avgCallsToFirstPickup,
          leadsWithFirstPickup7d,
          bookingsFromCalls,
          appointments7d: appts7d,
          bookingRate,
          successRate: bookingRate,
          attemptsPerLead,
          bestTime,
          bestTimeDialCount,
        });
      } catch (error) {
        console.error('[CALL QUALITY ERROR]', error);
        res.status(500).json({ ok: false, error: error.message });
      }
    },
  );

  function parseCallInsightsRoutingBlob(routing) {
    if (routing == null) return null;
    if (typeof routing === 'string') {
      try {
        return JSON.parse(routing);
      } catch {
        return null;
      }
    }
    return typeof routing === 'object' ? routing : null;
  }

  // Aggregated “learning loop” insights from transcripts + routing recommendations
  router.get(
    '/call-insights/:clientKey',
    cacheMiddleware({ ttl: 60000, keyPrefix: 'call-insights:v1:' }),
    async (req, res) => {
      try {
        const { clientKey } = req.params;
        const days = Math.max(1, Math.min(120, parseInt(req.query.days || 30, 10) || 30));
        const { getLatestCallInsights, upsertCallInsights, getFullClient, getCallAnalyticsFloorIso } =
          await import('../db.js');
        const existing = await getLatestCallInsights(clientKey);
        if (existing && existing.insights) {
          const floorIso = await getCallAnalyticsFloorIso();
          const r = parseCallInsightsRoutingBlob(existing.routing);
          const storedSince = r?.howCalculated?.analyticsSince ?? null;
          if (storedSince === floorIso) {
            return res.json({ ok: true, source: 'cache', ...existing });
          }
        }

        const client = await getFullClient(clientKey).catch(() => null);
        const timeZone = client?.timezone || client?.booking?.timezone || process.env.TZ || 'UTC';
        const { computeAndStoreCallInsights } = await import('../lib/call-insights-engine.js');
        const computed = await computeAndStoreCallInsights({
          query,
          clientKey,
          days,
          timeZone,
          upsertCallInsights,
        });
        return res.json({
          ok: true,
          source: 'computed',
          client_key: clientKey,
          period_days: days,
          insights: computed.insights,
          routing: computed.routing,
          computed_at: new Date().toISOString(),
        });
      } catch (error) {
        console.error('[CALL INSIGHTS ERROR]', error);
        res.status(500).json({ ok: false, error: error.message });
      }
    },
  );

  router.post('/call-insights/:clientKey/recompute', async (req, res) => {
    try {
      const { clientKey } = req.params;
      const days = Math.max(
        1,
        Math.min(120, parseInt((req.body && req.body.days) || req.query.days || 30, 10) || 30),
      );
      const { upsertCallInsights, getFullClient } = await import('../db.js');
      const client = await getFullClient(clientKey).catch(() => null);
      const timeZone = client?.timezone || client?.booking?.timezone || process.env.TZ || 'UTC';
      const { computeAndStoreCallInsights } = await import('../lib/call-insights-engine.js');
      const computed = await computeAndStoreCallInsights({
        query,
        clientKey,
        days,
        timeZone,
        upsertCallInsights,
      });
      res.set('Cache-Control', 'no-store');
      return res.json({
        ok: true,
        source: 'recomputed',
        client_key: clientKey,
        period_days: days,
        insights: computed.insights,
        routing: computed.routing,
        computed_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[CALL INSIGHTS RECOMPUTE ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

