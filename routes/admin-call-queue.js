/**
 * Admin API: outbound call queue operations and diagnostics.
 * Mounted at /api/admin — paths here are /call-queue/*.
 *
 * Uses dependency injection to avoid tight coupling to server.js globals.
 */
import { Router } from 'express';

/**
 * @param {{
 *   query: (sql: string, params?: any[]) => Promise<{ rows?: any[] }>,
 *   getFullClient: (clientKey: string, opts?: any) => Promise<any>,
 *   pickTimezone: (client: any) => string,
 *   DateTime: any,
 *   TIMEZONE: string,
 *   isPostgres: boolean,
 *   pgQueueLeadPhoneKeyExpr: (colExpr: string) => string,
 *   isBusinessHours: (client: any) => boolean,
 * }} deps
 */
export function createAdminCallQueueRouter(deps) {
  const {
    query,
    getFullClient,
    pickTimezone,
    DateTime,
    TIMEZONE,
    isPostgres,
    pgQueueLeadPhoneKeyExpr,
    isBusinessHours
  } = deps || {};

  const router = Router();

  /**
   * Admin ops: pull a batch of pending outbound calls forward into "today" (current business window),
   * spacing them out so they become due gradually rather than all at once.
   *
   * POST /api/admin/call-queue/pull-forward/:clientKey?limit=80
   */
  router.post('/call-queue/pull-forward/:clientKey', async (req, res) => {
    const { clientKey } = req.params;
    const limitRaw = req.query.limit ?? req.body?.limit;
    const limit = Math.max(1, Math.min(500, parseInt(String(limitRaw ?? '80'), 10) || 80));

    try {
      if (!isPostgres) {
        return res.status(400).json({ ok: false, error: 'postgres_required' });
      }
      const client = await getFullClient(clientKey, { bypassCache: false });
      if (!client || !client.clientKey) {
        return res.status(404).json({ ok: false, error: 'client_not_found' });
      }

      const { isBusinessHoursForTenant, getBusinessHoursConfig, getNextBusinessOpenForTenant } = await import(
        '../lib/business-hours.js'
      );
      const tz = pickTimezone(client);
      const now = new Date();
      const within = isBusinessHoursForTenant(client, now, tz, { forOutboundDial: true });
      if (!within) {
        const nextOpen = getNextBusinessOpenForTenant(client, now, tz, { forOutboundDial: true });
        return res.status(400).json({
          ok: false,
          error: 'outside_business_hours',
          timezone: tz,
          nextOpenAt: nextOpen ? nextOpen.toISOString() : null
        });
      }

      const cfg = getBusinessHoursConfig(client);
      const endHour = Math.max(0, Math.min(24, Number(cfg.end ?? 17)));
      const endLocal = DateTime.fromJSDate(now)
        .setZone(tz)
        .set({ hour: endHour, minute: 0, second: 0, millisecond: 0 });
      const endUtcMs = endLocal.toUTC().toMillis();
      const remainingSec = Math.floor((endUtcMs - Date.now()) / 1000);
      if (!Number.isFinite(remainingSec) || remainingSec <= 60) {
        return res.status(400).json({
          ok: false,
          error: 'window_ending_soon',
          timezone: tz,
          windowEndsAt: endLocal.isValid ? endLocal.toISO() : null
        });
      }

      const spacingSeconds = Math.max(15, Math.min(600, Math.floor(remainingSec / Math.max(1, limit))));
      const { rows } = await query(
        `
        WITH picked AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY scheduled_for ASC, id ASC) AS rn
          FROM call_queue
          WHERE client_key = $1
            AND call_type = 'vapi_call'
            AND status = 'pending'
            AND scheduled_for > NOW()
            AND scheduled_for <= NOW() + INTERVAL '48 hours'
          LIMIT $2
        )
        UPDATE call_queue cq
        SET scheduled_for =
              NOW() - INTERVAL '1 second'
              + ((picked.rn - 1) * $3::bigint) * INTERVAL '1 second'
              + ((abs(picked.id) % 997) + 1) * INTERVAL '1 millisecond',
            call_data =
              jsonb_set(
                COALESCE(cq.call_data, '{}'::jsonb),
                '{scheduling}',
                to_jsonb('manual_pull_forward'::text),
                true
              ),
            updated_at = NOW()
        FROM picked
        WHERE cq.id = picked.id
        RETURNING cq.id, cq.scheduled_for
      `,
        [clientKey, limit, spacingSeconds]
      );

      const moved = rows?.length || 0;
      const times = (rows || [])
        .map((r) => (r.scheduled_for ? new Date(r.scheduled_for).getTime() : NaN))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);

      res.set('Cache-Control', 'no-store, must-revalidate, max-age=0');
      return res.json({
        ok: true,
        clientKey,
        timezone: tz,
        withinBusinessHours: true,
        moved,
        limit,
        spacingSeconds,
        windowEndsAt: endLocal.isValid ? endLocal.toISO() : null,
        firstScheduledFor: times.length ? new Date(times[0]).toISOString() : null,
        lastScheduledFor: times.length ? new Date(times[times.length - 1]).toISOString() : null
      });
    } catch (e) {
      console.error('[ADMIN PULL QUEUE FORWARD] Error:', e);
      return res.status(500).json({ ok: false, error: String(e?.message || e).slice(0, 240) });
    }
  });

  /**
   * Admin ops: peek at the next outbound queue rows for a client, including defer diagnostics.
   *
   * GET /api/admin/call-queue/peek/:clientKey?limit=20&dueOnly=1
   */
  router.get('/call-queue/peek/:clientKey', async (req, res) => {
    const { clientKey } = req.params;
    const limit = Math.max(1, Math.min(200, parseInt(String(req.query.limit ?? '20'), 10) || 20));
    const dueOnly = /^(1|true|yes)$/i.test(String(req.query.dueOnly ?? '').trim());

    try {
      if (!isPostgres) return res.status(400).json({ ok: false, error: 'postgres_required' });
      const client = await getFullClient(clientKey, { bypassCache: false });
      if (!client || !client.clientKey) {
        return res.status(404).json({ ok: false, error: 'client_not_found' });
      }

      const { rows } = await query(
        `
        SELECT
          id,
          client_key,
          lead_phone,
          status,
          call_type,
          priority,
          scheduled_for,
          updated_at,
          initiated_call_id,
          call_data->'lastDefer' AS last_defer,
          call_data->'lastStep' AS last_step
        FROM call_queue
        WHERE client_key = $1
          AND call_type = 'vapi_call'
          AND status IN ('pending','processing')
          AND ($2::boolean = false OR scheduled_for <= NOW())
        ORDER BY scheduled_for ASC, priority ASC, id ASC
        LIMIT $3
      `,
        [clientKey, dueOnly, limit]
      );

      res.set('Cache-Control', 'no-store, must-revalidate, max-age=0');
      return res.json({
        ok: true,
        clientKey,
        dueOnly,
        limit,
        now: new Date().toISOString(),
        rows: (rows || []).map((r) => ({
          id: String(r.id),
          leadPhone: r.lead_phone,
          status: r.status,
          priority: r.priority,
          scheduledFor: r.scheduled_for ? new Date(r.scheduled_for).toISOString() : null,
          updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
          initiatedCallId: r.initiated_call_id || null,
          lastDefer: r.last_defer || null,
          lastStep: r.last_step || null
        }))
      });
    } catch (e) {
      console.error('[ADMIN PEEK QUEUE] Error:', e);
      return res.status(500).json({ ok: false, error: String(e?.message || e).slice(0, 240) });
    }
  });

  /**
   * Admin ops: aggregate outbound dial “blockers” / defer reasons for a tenant (counts, not phone lists).
   *
   * GET /api/admin/call-queue/blockers/:clientKey
   */
  router.get('/call-queue/blockers/:clientKey', async (req, res) => {
    const { clientKey } = req.params;

    try {
      if (!isPostgres) return res.status(400).json({ ok: false, error: 'postgres_required' });
      const client = await getFullClient(clientKey, { bypassCache: false });
      if (!client || !client.clientKey) {
        return res.status(404).json({ ok: false, error: 'client_not_found' });
      }

      const tenantTz = client?.booking?.timezone || client?.timezone || TIMEZONE;
      const withinOutboundHours = isBusinessHours(client);
      let vapiConcurrency = null;
      try {
        const { getVapiConcurrencyState } = await import('../lib/instant-calling.js');
        vapiConcurrency = getVapiConcurrencyState();
      } catch {
        vapiConcurrency = null;
      }

      const bypassWeekdaySlots = /^(1|true|yes)$/i.test(
        String(process.env.ALLOW_MULTIPLE_OUTBOUND_CALLS_PER_DAY || '').trim()
      );

      const [
        { rows: bucketRows },
        { rows: deferPendingRows },
        { rows: deferDueRows },
        { rows: deferFutureRows },
        { rows: procStepRows },
        { rows: journeyRows },
        { rows: leadRows },
        { rows: callRows }
      ] = await Promise.all([
        query(
          `
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending' AND scheduled_for <= NOW())::int AS pending_due_now,
          COUNT(*) FILTER (WHERE status = 'pending' AND scheduled_for > NOW())::int AS pending_scheduled_future,
          COUNT(*) FILTER (WHERE status = 'processing')::int AS processing,
          COUNT(*) FILTER (WHERE status = 'processing' AND initiated_call_id IS NULL)::int AS processing_without_call_id,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_total,
          COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_total,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_total,
          COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_total
        FROM call_queue
        WHERE client_key = $1 AND call_type = 'vapi_call'
        `,
          [clientKey]
        ),
        query(
          `
        SELECT
          COALESCE(call_data->'lastDefer'->>'kind', '(none)') AS defer_kind,
          COALESCE(call_data->'lastDefer'->>'error', '(none)') AS defer_error,
          COUNT(*)::int AS n
        FROM call_queue
        WHERE client_key = $1 AND call_type = 'vapi_call' AND status = 'pending'
        GROUP BY 1, 2
        ORDER BY n DESC, defer_kind, defer_error
        `,
          [clientKey]
        ),
        query(
          `
        SELECT
          COALESCE(call_data->'lastDefer'->>'kind', '(none)') AS defer_kind,
          COALESCE(call_data->'lastDefer'->>'error', '(none)') AS defer_error,
          COUNT(*)::int AS n
        FROM call_queue
        WHERE client_key = $1
          AND call_type = 'vapi_call'
          AND status = 'pending'
          AND scheduled_for <= NOW()
        GROUP BY 1, 2
        ORDER BY n DESC, defer_kind, defer_error
        `,
          [clientKey]
        ),
        query(
          `
        SELECT
          COALESCE(call_data->'lastDefer'->>'kind', '(none)') AS defer_kind,
          COALESCE(call_data->'lastDefer'->>'error', '(none)') AS defer_error,
          COUNT(*)::int AS n
        FROM call_queue
        WHERE client_key = $1
          AND call_type = 'vapi_call'
          AND status = 'pending'
          AND scheduled_for > NOW()
        GROUP BY 1, 2
        ORDER BY n DESC, defer_kind, defer_error
        `,
          [clientKey]
        ),
        query(
          `
        SELECT
          COALESCE(call_data->'lastStep'->>'step', '(none)') AS last_step,
          COUNT(*)::int AS n
        FROM call_queue
        WHERE client_key = $1 AND call_type = 'vapi_call' AND status = 'processing'
        GROUP BY 1
        ORDER BY n DESC
        `,
          [clientKey]
        ),
        query(
          `
        SELECT
          COUNT(*)::int AS journey_rows,
          COUNT(*) FILTER (WHERE closed_at IS NULL)::int AS open_journeys,
          COUNT(*) FILTER (WHERE closed_at IS NOT NULL)::int AS closed_journeys
        FROM outbound_weekday_journey
        WHERE client_key = $1
        `,
          [clientKey]
        ),
        query(
          `
        SELECT COUNT(*)::int AS new_leads_not_on_queue
        FROM leads l
        WHERE l.client_key = $1
          AND l.status = 'new'
          AND l.created_at >= NOW() - INTERVAL '30 days'
          AND NOT EXISTS (
            SELECT 1
            FROM call_queue cq
            WHERE cq.client_key = l.client_key
              AND cq.call_type = 'vapi_call'
              AND cq.status IN ('pending', 'processing')
              AND ${pgQueueLeadPhoneKeyExpr('cq.lead_phone')} = COALESCE(l.phone_match_key, '__nodigits__')
          )
        `,
          [clientKey]
        ),
        query(
          `
        SELECT COUNT(*)::int AS in_flight_calls
        FROM calls
        WHERE client_key = $1
          AND status IN ('initiated', 'in_progress')
        `,
          [clientKey]
        )
      ]);

      const b = bucketRows?.[0] || {};
      const j = journeyRows?.[0] || {};
      const l = leadRows?.[0] || {};
      const c = callRows?.[0] || {};

      res.set('Cache-Control', 'no-store, must-revalidate, max-age=0');
      return res.json({
        ok: true,
        clientKey,
        now: new Date().toISOString(),
        tenantTimezone: tenantTz,
        semantics: [
          '`pendingByLastDefer` / `duePendingByLastDefer` group rows by the *last recorded deferral* on the queue row (JSON `lastDefer`).',
          'A row can be `pending` with `lastDefer` from an earlier attempt; `(none)/(none)` means no defer metadata was stored yet.',
          '`duePendingByLastDefer` is the subset that is due right now (`scheduled_for <= now()`), i.e. what the processor can pick next.',
          '`futurePendingByLastDefer` is the same grouping but only rows with `scheduled_for > now()` (usually backlog / smeared scheduling — not “blocked by rule” in the same sense as journey limits).',
          '`newLeadsNotOnQueue` counts `leads.status=new` (30d) with no `pending`/`processing` `vapi_call` queue row for the same phone key — it does not, by itself, prove the lead is dial-eligible (journey / active calls / business hours are enforced when queuing/dialing).'
        ],
        runtime: {
          clientEnabled: client.isEnabled !== false,
          hasVapiAssistant: !!(client.vapi && client.vapi.assistantId),
          withinOutboundBusinessHours: withinOutboundHours,
          allowMultipleOutboundCallsPerDay: bypassWeekdaySlots,
          callQueueMaxConcurrent: Math.max(
            1,
            Math.min(25, parseInt(process.env.CALL_QUEUE_MAX_CONCURRENT || '1', 10) || 1)
          ),
          callQueueMaxPerRun: Math.max(
            1,
            Math.min(500, parseInt(process.env.CALL_QUEUE_MAX_PER_RUN || '40', 10) || 40)
          ),
          vapiEnvConfigured: {
            hasPrivateKey: !!process.env.VAPI_PRIVATE_KEY,
            hasAssistantId: !!process.env.VAPI_ASSISTANT_ID,
            hasPhoneNumberId: !!process.env.VAPI_PHONE_NUMBER_ID
          },
          vapiConcurrency
        },
        callQueue: {
          pendingTotal: parseInt(b.pending_total, 10) || 0,
          pendingDueNow: parseInt(b.pending_due_now, 10) || 0,
          pendingScheduledFuture: parseInt(b.pending_scheduled_future, 10) || 0,
          processing: parseInt(b.processing, 10) || 0,
          processingWithoutCallId: parseInt(b.processing_without_call_id, 10) || 0,
          cancelledTotal: parseInt(b.cancelled_total, 10) || 0,
          failedTotal: parseInt(b.failed_total, 10) || 0,
          completedTotal: parseInt(b.completed_total, 10) || 0
        },
        pendingByLastDefer: deferPendingRows || [],
        duePendingByLastDefer: deferDueRows || [],
        futurePendingByLastDefer: deferFutureRows || [],
        processingByLastStep: procStepRows || [],
        outboundWeekdayJourney: {
          journeyRows: parseInt(j.journey_rows, 10) || 0,
          openJourneys: parseInt(j.open_journeys, 10) || 0,
          closedJourneys: parseInt(j.closed_journeys, 10) || 0
        },
        leads: {
          newLeadsNotOnQueue30d: parseInt(l.new_leads_not_on_queue, 10) || 0
        },
        calls: {
          inFlightInitiatedOrInProgress: parseInt(c.in_flight_calls, 10) || 0
        }
      });
    } catch (e) {
      console.error('[ADMIN QUEUE BLOCKERS] Error:', e);
      return res.status(500).json({ ok: false, error: String(e?.message || e).slice(0, 240) });
    }
  });

  /**
   * Admin ops: force-reset stuck `processing` outbound queue rows back to `pending`.
   *
   * POST /api/admin/call-queue/reset-processing/:clientKey?minAgeSec=90&limit=500
   */
  router.post('/call-queue/reset-processing/:clientKey', async (req, res) => {
    const { clientKey } = req.params;
    const minAgeSec = Math.max(
      5,
      Math.min(3600, parseInt(String(req.query.minAgeSec ?? req.body?.minAgeSec ?? '90'), 10) || 90)
    );
    const limit = Math.max(
      1,
      Math.min(5000, parseInt(String(req.query.limit ?? req.body?.limit ?? '500'), 10) || 500)
    );

    try {
      if (!isPostgres) return res.status(400).json({ ok: false, error: 'postgres_required' });
      const client = await getFullClient(clientKey, { bypassCache: false });
      if (!client || !client.clientKey) {
        return res.status(404).json({ ok: false, error: 'client_not_found' });
      }

      const { rows } = await query(
        `
        WITH picked AS (
          SELECT id
          FROM call_queue
          WHERE client_key = $1
            AND call_type = 'vapi_call'
            AND status = 'processing'
            AND initiated_call_id IS NULL
            AND updated_at < NOW() - ($2::int * INTERVAL '1 second')
          ORDER BY updated_at ASC, id ASC
          LIMIT $3
        )
        UPDATE call_queue cq
        SET status = 'pending',
            scheduled_for = NOW() - INTERVAL '1 second' + ((abs(cq.id) % 997) + 1) * INTERVAL '1 millisecond',
            call_data = jsonb_set(
              COALESCE(cq.call_data, '{}'::jsonb),
              '{lastDefer}',
              jsonb_build_object(
                'at', NOW(),
                'kind', 'internal',
                'error', 'force_reset_processing',
                'minAgeSec', $2
              ),
              true
            ),
            updated_at = NOW()
        FROM picked p
        WHERE cq.id = p.id
        RETURNING cq.id
      `,
        [clientKey, minAgeSec, limit]
      );

      res.set('Cache-Control', 'no-store, must-revalidate, max-age=0');
      return res.json({ ok: true, clientKey, minAgeSec, limit, reset: rows?.length || 0 });
    } catch (e) {
      console.error('[ADMIN RESET PROCESSING] Error:', e);
      return res.status(500).json({ ok: false, error: String(e?.message || e).slice(0, 240) });
    }
  });

  return router;
}

