import { DateTime } from 'luxon';
import { nanoid } from 'nanoid';
import {
  query,
  poolQuerySelect,
  getFullClient,
  listFullClients,
  addToCallQueue,
  smearCallQueueScheduledFor,
  invalidateClientCache,
} from '../db.js';
import {
  getNextBusinessOpenForTenant,
  allowOutboundWeekendCalls,
} from './business-hours.js';
import { pgQueueLeadPhoneKeyExpr, phoneMatchKey } from './lead-phone-key.js';
import { isTransientVapiQueueResult, isNoCreditsVapiResult } from './vapi-queue-result.js';
import { setLastDialBlock } from './ops-state.js';
import { callLeadInstantly } from './instant-calling.js';
import { createCallWithKey as vapiCreateCallWithKey } from './vapi.js';
import {
  TIMEZONE,
  isBusinessHours,
  getNextBusinessHour,
  pickTimezone
} from './server-queue-workers-shared.js';
import { selectOptimalAssistant } from './server-assistant-scheduling.js';
import { categorizeError } from './server-call-resilience.js';
import { resolveLogisticsSpreadsheetId } from './dashboard-ui-formatters.js';
import { patchLogisticsRowByNumber } from '../sheets.js';
import { startSpan } from './sentry.js';

export async function processRetryQueue() {
  try {
    const { getPendingRetries, updateRetryStatus } = await import('../db.js');

    // Self-heal: reset stale processing retries so they can be deferred/retried.
    try {
      const { rowCount } = await query(`
        WITH stale AS (
          SELECT id
          FROM retry_queue
          WHERE status = 'processing'
            AND updated_at < NOW() - INTERVAL '10 minutes'
          ORDER BY updated_at ASC
          LIMIT 500
        )
        UPDATE retry_queue rq
        SET status = 'pending', updated_at = NOW()
        FROM stale
        WHERE rq.id = stale.id
      `);
      if ((rowCount || 0) > 0) {
        console.warn('[RETRY PROCESSOR] Reset stale processing rows to pending:', rowCount);
      }
    } catch (e) {
      console.warn('[RETRY PROCESSOR] Failed to reset stale processing rows:', e?.message || e);
    }

    const maxRetriesPerRun = Math.max(1, Math.min(500, parseInt(process.env.RETRY_QUEUE_MAX_PER_RUN || '120', 10) || 120));
    const maxConcurrentRetries = Math.max(1, Math.min(25, parseInt(process.env.RETRY_QUEUE_MAX_CONCURRENT || '3', 10) || 3));

    const pendingRetries = await getPendingRetries(maxRetriesPerRun, ['vapi_call', 'sheet_patch']);
    
    if (pendingRetries.length === 0) {
      return;
    }
    
    console.log('[RETRY PROCESSOR]', {
      pendingCount: pendingRetries.length,
      maxRetriesPerRun,
      maxConcurrentRetries
    });

    let idx = 0;
    async function worker() {
      await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 350)));
      while (true) {
        const retry = pendingRetries[idx++];
        if (!retry) return;

        try {
          if (retry.retry_type === 'vapi_call' && retry.client_key) {
            const rClient = await getFullClient(retry.client_key);
            if (rClient && !isBusinessHours(rClient)) {
              const next = getNextBusinessHour(rClient);
              await query(
                `UPDATE retry_queue SET scheduled_for = $1, updated_at = NOW() WHERE id = $2`,
                [next, retry.id]
              );
              console.log('[RETRY PROCESSOR] Deferred — outside business hours', { id: retry.id, scheduledFor: next });
              continue;
            }
            const rTz = rClient?.booking?.timezone || rClient?.timezone || TIMEZONE;
            const { claimOutboundWeekdayJourneySlot } = await import('../db.js');
            const retryDialClaim = await claimOutboundWeekdayJourneySlot(
              retry.client_key,
              retry.lead_phone,
              rTz
            );
            if (!retryDialClaim.ok) {
              if (retryDialClaim.reason === 'journey_terminal') {
                await query(
                  `UPDATE retry_queue SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
                  [retry.id]
                );
                console.log('[RETRY PROCESSOR] Cancelled — outbound weekday journey complete', {
                  id: retry.id,
                  reason: retryDialClaim.reason
                });
                continue;
              }
              const nextLocalDayStart = DateTime.now().setZone(rTz).plus({ days: 1 }).startOf('day').toJSDate();
              const nextOpen = getNextBusinessOpenForTenant(
                rClient || { booking: { timezone: rTz }, timezone: rTz },
                nextLocalDayStart,
                rTz,
                { forOutboundDial: true }
              );
              await query(
                `UPDATE retry_queue SET scheduled_for = $1, updated_at = NOW() WHERE id = $2`,
                [nextOpen, retry.id]
              );
              console.log('[RETRY PROCESSOR] Deferred — weekday journey slot not available (try next dial day)', {
                id: retry.id,
                scheduledFor: nextOpen,
                reason: retryDialClaim.reason
              });
              continue;
            }
          }

          // Mark as processing
          await updateRetryStatus(retry.id, 'processing');

          // Process the retry based on type
          if (retry.retry_type === 'vapi_call') {
            await processVapiRetry(retry);
          } else if (retry.retry_type === 'sheet_patch') {
            await processSheetPatchRetry(retry);
          }

          // Mark as completed
          await updateRetryStatus(retry.id, 'completed');
        } catch (retryError) {
          console.error('[RETRY PROCESSING ERROR]', {
            retryId: retry.id,
            error: retryError.message
          });

          // Check if we should retry again or mark as failed
          if (retry.retry_attempt < retry.max_retries) {
            // Schedule another retry with backoff so due-now backlog stays bounded.
            const nextAttempt = (parseInt(retry.retry_attempt, 10) || 0) + 1;
            const baseMinutes = Math.max(1, Math.min(60, parseInt(process.env.RETRY_QUEUE_BACKOFF_BASE_MINUTES || '5', 10) || 5));
            const maxMinutes = Math.max(baseMinutes, Math.min(24 * 60, parseInt(process.env.RETRY_QUEUE_BACKOFF_MAX_MINUTES || '240', 10) || 240));
            const exp = Math.max(0, nextAttempt - 1);
            const backoffMinutes = Math.min(maxMinutes, baseMinutes * Math.pow(2, exp));
            const jitterSeconds = Math.floor(Math.random() * 30);
            const nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000 + jitterSeconds * 1000);

            await query(
              `
                UPDATE retry_queue
                SET status = 'pending',
                    retry_attempt = $1,
                    scheduled_for = $2,
                    updated_at = NOW()
                WHERE id = $3
              `,
              [nextAttempt, nextRetryAt.toISOString(), retry.id]
            );
          } else {
            // Max retries reached, mark as failed
            await updateRetryStatus(retry.id, 'failed');
          }
        }
      }
    }

    const workerCount = Math.min(maxConcurrentRetries, pendingRetries.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    
  } catch (error) {
    console.error('[RETRY PROCESSOR ERROR]', error);
  }
}

// Process VAPI retry
async function processVapiRetry(retry) {
  try {
    const retryData = retry.retry_data ? JSON.parse(retry.retry_data) : {};
    const { client_key: clientKey, lead_phone: leadPhone } = retry;
    
    // Get client configuration
    const client = await getFullClient(clientKey);
    if (!client) {
      throw new Error('Client not found');
    }

    // Do NOT dial Vapi directly from retry_queue processing.
    // Enqueue into call_queue so the queue worker handles concurrency, wallet/config gates, and deferrals.
    const { addToCallQueue } = await import('../db.js');
    const phoneKey = phoneMatchKey(leadPhone) ?? '__nodigits__';
    const existing = await query(
      `
        SELECT id
        FROM call_queue
        WHERE client_key = $1
          AND call_type = 'vapi_call'
          AND status IN ('pending', 'processing')
          AND ${pgQueueLeadPhoneKeyExpr('lead_phone')} = $2
        ORDER BY scheduled_for ASC
        LIMIT 1
      `,
      [clientKey, phoneKey]
    );
    const alreadyQueued = existing?.rows?.[0]?.id != null;
    if (!alreadyQueued) {
      await addToCallQueue({
        clientKey,
        leadPhone,
        priority: 6,
        scheduledFor: new Date(),
        callType: 'vapi_call',
        callData: {
          triggerType: 'retry_queue_vapi_call',
          outboundDialMode: 'classic',
          retryQueueId: retry.id,
          retryReason: retry.retry_reason || null,
          retryAttempt: retry.retry_attempt || null,
          maxRetries: retry.max_retries || null,
          clientConfig: retryData?.clientConfig || null,
        }
      });
      console.log('[RETRY QUEUE] Enqueued vapi_call retry into call_queue', { retryId: retry.id, clientKey, leadPhone });
    } else {
      console.log('[RETRY QUEUE] vapi_call retry already queued', { retryId: retry.id, clientKey, leadPhone });
    }
    
  } catch (error) {
    console.error('[VAPI RETRY ERROR]', {
      retryId: retry.id,
      error: error.message
    });
    throw error;
  }
}

async function processSheetPatchRetry(retry) {
  const retryData = (() => {
    const raw = retry.retry_data;
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { return {}; }
  })();
  const { client_key: clientKey } = retry;
  const client = await getFullClient(clientKey);
  const spreadsheetId = resolveLogisticsSpreadsheetId(client);
  if (!spreadsheetId) throw new Error('sheet_not_configured');
  const rowNumber = parseInt(retryData.rowNumber, 10);
  const patch = retryData.patch;
  if (!Number.isFinite(rowNumber) || rowNumber < 2 || !patch || typeof patch !== 'object') {
    throw new Error('invalid_retry_data');
  }
  const ok = await patchLogisticsRowByNumber(spreadsheetId, rowNumber, patch);
  if (!ok) throw new Error('sheet_patch_failed');
}

// Call queue processor - runs every 2 minutes to process pending calls
export async function processCallQueue() {
  return startSpan({ name: 'outbound.queue.process', op: 'outbound.queue' }, async () => processCallQueueInner());
}

async function processCallQueueInner() {
  try {
    globalThis.__opsLastProcessCallQueueAt = new Date().toISOString();
    const { getPendingCalls, updateCallQueueStatus, cancelDuplicatePendingCalls, addToCallQueue } = await import('../db.js');

    // Optional safety valve (OFF by default): when a tenant has a huge overdue `pending` backlog, cap how many
    // stay "due now" today and push overflow to a future anchor (tomorrow 9:00 tenant-local) with row spacing.
    // Most deployments already pace via Mon–Fri weekday journey + queue ordering; this reschedule can fight that
    // by moving many rows to arbitrary future instants. Enable only if you explicitly want this guardrail:
    //   CALL_QUEUE_OVERDUE_CAP_RESCHEDULE_ENABLED=1|true|yes
    const overdueCapRescheduleEnabled = /^(1|true|yes)$/i.test(
      String(process.env.CALL_QUEUE_OVERDUE_CAP_RESCHEDULE_ENABLED || '').trim()
    );

    try {
      if (!overdueCapRescheduleEnabled) {
        // Skip: rely on weekday journey, per-run limits, and normal deferrals for pacing.
      } else {
      const dailyCapDefault = 150;
      const dailyCap = Math.max(0, Math.min(5000, parseInt(process.env.CALL_QUEUE_DAILY_CAP || String(dailyCapDefault), 10) || dailyCapDefault));
      const overdueKeepDue = Math.max(0, Math.min(500, parseInt(process.env.CALL_QUEUE_OVERDUE_KEEP_DUE || '50', 10) || 50));
      const rescheduleBatchLimit = Math.max(100, Math.min(10000, parseInt(process.env.CALL_QUEUE_RESCHEDULE_BATCH_LIMIT || '3000', 10) || 3000));
      const spacingSeconds = Math.max(15, Math.min(600, parseInt(process.env.CALL_QUEUE_RESCHEDULE_SPACING_SECONDS || '120', 10) || 120)); // default 2m

      // Find clients with large overdue pending backlogs.
      const { rows: overdueClients } = await query(
        `
          SELECT client_key, COUNT(*)::int AS overdue_pending
          FROM call_queue
          WHERE status = 'pending'
            AND call_type = 'vapi_call'
            AND scheduled_for < NOW()
          GROUP BY client_key
          HAVING COUNT(*) > $1
          ORDER BY overdue_pending DESC
          LIMIT 20
        `,
        [overdueKeepDue]
      );

      for (const oc of overdueClients) {
        const clientKey = oc.client_key;
        const overduePending = parseInt(oc.overdue_pending || 0, 10) || 0;
        if (!clientKey || overduePending <= overdueKeepDue) continue;

        // Compute "today" bounds in tenant timezone, expressed as UTC instants.
        let tz = TIMEZONE;
        try {
          const c = await getFullClient(clientKey);
          tz = c?.booking?.timezone || c?.timezone || TIMEZONE;
        } catch {
          tz = TIMEZONE;
        }

        const { rows: bRows } = await query(
          `
            SELECT
              ((date_trunc('day', NOW() AT TIME ZONE $1)) AT TIME ZONE $1) AS day_start_utc,
              ((date_trunc('day', NOW() AT TIME ZONE $1) + INTERVAL '1 day') AT TIME ZONE $1) AS day_end_utc,
              ((date_trunc('day', NOW() AT TIME ZONE $1) + INTERVAL '1 day' + INTERVAL '9 hours') AT TIME ZONE $1) AS tomorrow_9am_utc
          `,
          [tz]
        );
        const dayStartUtc = bRows?.[0]?.day_start_utc;
        const dayEndUtc = bRows?.[0]?.day_end_utc;
        const tomorrow9Utc = bRows?.[0]?.tomorrow_9am_utc;
        if (!dayStartUtc || !dayEndUtc || !tomorrow9Utc) continue;

        // How many are already "today" (pending/processing) + how many calls already started today?
        const { rows: capRows } = await query(
          `
            SELECT
              (SELECT COUNT(*)::int
               FROM call_queue
               WHERE client_key = $1
                 AND call_type = 'vapi_call'
                 AND status IN ('pending','processing')
                 AND scheduled_for >= $2 AND scheduled_for < $3
              ) AS queued_today,
              (SELECT COUNT(*)::int
               FROM calls
               WHERE client_key = $1
                 AND created_at >= $2 AND created_at < $3
              ) AS calls_today
          `,
          [clientKey, dayStartUtc, dayEndUtc]
        );
        const queuedToday = parseInt(capRows?.[0]?.queued_today || 0, 10) || 0;
        const callsToday = parseInt(capRows?.[0]?.calls_today || 0, 10) || 0;
        const remainingToday = Math.max(0, dailyCap - (queuedToday + callsToday));

        // If we're at/over cap, push almost everything overdue to tomorrow.
        // If we still have remaining capacity today, keep a small due buffer and push overflow.
        const keepDue = remainingToday > 0 ? Math.min(overdueKeepDue, remainingToday) : 0;
        const toMove = Math.max(0, overduePending - keepDue);
        if (toMove <= 0) continue;

        const moveLimit = Math.min(rescheduleBatchLimit, toMove);
        const { rowCount } = await query(
          `
            WITH picked AS (
              SELECT id, ROW_NUMBER() OVER (ORDER BY scheduled_for ASC, id ASC) AS rn
              FROM call_queue
              WHERE client_key = $1
                AND call_type = 'vapi_call'
                AND status = 'pending'
                AND scheduled_for < NOW()
              LIMIT $2
            )
            UPDATE call_queue cq
            SET scheduled_for = $3::timestamptz
                + (((picked.rn - 1) * $4::bigint) + (abs(picked.id) % 3599) + 1) * INTERVAL '1 second'
                + ((abs(picked.id) % 997) + 1) * INTERVAL '1 millisecond',
                updated_at = NOW()
            FROM picked
            WHERE cq.id = picked.id
          `,
          [clientKey, moveLimit, tomorrow9Utc, spacingSeconds]
        );
        if ((rowCount || 0) > 0) {
          globalThis.__opsLastOverdueReschedule = {
            at: new Date().toISOString(),
            clientKey,
            moved: rowCount,
            overduePending,
            keepDue,
            remainingToday,
            dailyCap,
            tz
          };
          console.warn('[CALL QUEUE PROCESSOR] Pushed overdue backlog to tomorrow window:', {
            clientKey,
            moved: rowCount,
            overduePending,
            keepDue,
            remainingToday,
            dailyCap,
            tz
          });
        }
      }
      }
    } catch (e) {
      console.warn('[CALL QUEUE PROCESSOR] Overdue reschedule guard failed:', e?.message || e);
    }

    // Self-heal: if the server restarted mid-item, rows can get stuck in 'processing' forever.
    // Reset anything older than 10 minutes back to 'pending' so it can be retried/deferred.
    try {
      const { rowCount } = await query(`
        WITH stale AS (
          SELECT id
          FROM call_queue
          WHERE status = 'processing'
            AND updated_at < NOW() - INTERVAL '10 minutes'
          ORDER BY updated_at ASC
          LIMIT 500
        )
        UPDATE call_queue cq
        SET status = 'pending', updated_at = NOW()
        FROM stale
        WHERE cq.id = stale.id
      `);
      if ((rowCount || 0) > 0) {
        console.warn('[CALL QUEUE PROCESSOR] Reset stale processing rows to pending:', rowCount);
      }
    } catch (e) {
      console.warn('[CALL QUEUE PROCESSOR] Failed to reset stale processing rows:', e?.message || e);
    }

    // Self-heal: protect against "phantom completed" rows that have no initiated_call_id.
    // These can exist from earlier buggy builds; requeue them so the lead actually gets dialed.
    try {
      const { rowCount } = await query(`
        WITH picked AS (
          SELECT id
          FROM call_queue
          WHERE status = 'completed'
            AND initiated_call_id IS NULL
            AND call_type = 'vapi_call'
            AND updated_at >= NOW() - INTERVAL '48 hours'
          ORDER BY updated_at DESC, id
          LIMIT 500
        ),
        bad AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
          FROM picked
        )
        UPDATE call_queue cq
        SET status = 'pending',
            scheduled_for = NOW() + bad.rn * INTERVAL '1 millisecond',
            updated_at = NOW()
        FROM bad
        WHERE cq.id = bad.id
      `);
      if ((rowCount || 0) > 0) {
        console.warn('[CALL QUEUE PROCESSOR] Requeued phantom-completed rows:', rowCount);
      }
    } catch (e) {
      console.warn('[CALL QUEUE PROCESSOR] Failed to requeue phantom-completed rows:', e?.message || e);
    }

    // Catch-up: if we have pending calls scheduled later today, pull a small batch forward
    // so the system starts working immediately (e.g. after VAPI credits are restored).
    try {
      const { rowCount } = await query(`
        WITH picked AS (
          SELECT id
          FROM call_queue
          WHERE status = 'pending'
            AND call_type = 'vapi_call'
            AND scheduled_for > NOW()
            AND scheduled_for <= NOW() + INTERVAL '24 hours'
          ORDER BY scheduled_for ASC, id
          LIMIT 10
        ),
        to_pull AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
          FROM picked
        )
        UPDATE call_queue cq
        -- Make items unambiguously due for this same processor tick.
        -- (Using NOW() + a few ms can still be "in the future" when getPendingCalls runs immediately after.)
        SET scheduled_for = NOW() - INTERVAL '1 second' + to_pull.rn * INTERVAL '1 millisecond',
            updated_at = NOW()
        FROM to_pull
        WHERE cq.id = to_pull.id
      `);
      if ((rowCount || 0) > 0) {
        console.log('[CALL QUEUE PROCESSOR] Pulled forward scheduled calls:', rowCount);
      }
    } catch (e) {
      console.warn('[CALL QUEUE PROCESSOR] Failed to pull forward scheduled calls:', e?.message || e);
    }

    // Catch-up: if the queue is empty but we have a backlog of synthetic failed_q attempts
    // (e.g. during a VAPI outage/credit depletion), requeue a small batch so work resumes.
    // This intentionally does NOT depend on lead.status='new' because those leads may have been
    // transitioned during earlier (failed) attempts.
    try {
      const { rows: pendingCountRows } = await query(
        `SELECT COUNT(*)::int AS n FROM call_queue WHERE status = 'pending'`
      );
      const pendingTotal = pendingCountRows?.[0]?.n ?? 0;

      // Top-up threshold: keep some work queued so the processor doesn't go idle
      const catchupMinPending = Math.max(0, Math.min(2000, parseInt(process.env.FAILED_Q_CATCHUP_MIN_PENDING || '100', 10) || 100));

      if (pendingTotal <= catchupMinPending) {
        const catchupClientLimit = Math.max(1, Math.min(10, parseInt(process.env.FAILED_Q_CATCHUP_CLIENT_LIMIT || '3', 10) || 3));
        const catchupPerClient = Math.max(1, Math.min(200, parseInt(process.env.FAILED_Q_CATCHUP_BATCH_SIZE || '50', 10) || 50));
        // Long catch-up horizon so we can recover after extended credit outages.
        // Keep a cap to prevent pathologically slow scans if the table is huge.
        const lookbackDays = Math.max(1, Math.min(730, parseInt(process.env.FAILED_Q_CATCHUP_LOOKBACK_DAYS || '365', 10) || 365));

        const { rows: clientsWithBacklog } = await query(
          `
            SELECT client_key, COUNT(DISTINCT lead_phone)::int AS n
            FROM calls
            WHERE call_id LIKE 'failed_q%'
              AND created_at >= now() - ($1::int * INTERVAL '1 day')
            GROUP BY client_key
            ORDER BY n DESC
            LIMIT $2
          `,
          [lookbackDays, catchupClientLimit]
        );

        for (const row of clientsWithBacklog) {
          const clientKey = row.client_key;
          const client = await getFullClient(clientKey);
          if (client && !isBusinessHours(client)) continue;

          const { rows: phones } = await query(
            `
              WITH candidates AS (
                SELECT c.lead_phone, MAX(c.created_at) AS last_failed
                FROM calls c
                WHERE c.client_key = $1
                  AND c.call_id LIKE 'failed_q%'
                  AND c.created_at >= now() - ($2::int * INTERVAL '1 day')
                  AND NOT EXISTS (
                    SELECT 1
                    FROM calls ok
                    WHERE ok.client_key = c.client_key
                      AND ${pgQueueLeadPhoneKeyExpr('ok.lead_phone')} = ${pgQueueLeadPhoneKeyExpr('c.lead_phone')}
                      AND ok.call_id NOT LIKE 'failed_q%'
                      AND ok.created_at >= now() - ($2::int * INTERVAL '1 day')
                  )
                  AND NOT EXISTS (
                    SELECT 1
                    FROM call_queue cq
                    WHERE cq.client_key = c.client_key
                      AND cq.call_type = 'vapi_call'
                      AND cq.status IN ('pending', 'processing')
                      AND ${pgQueueLeadPhoneKeyExpr('cq.lead_phone')} = ${pgQueueLeadPhoneKeyExpr('c.lead_phone')}
                  )
                GROUP BY c.lead_phone
                ORDER BY last_failed DESC
                LIMIT $3
              )
              SELECT lead_phone FROM candidates
            `,
            [clientKey, lookbackDays, catchupPerClient]
          );

          if ((phones?.length || 0) === 0) continue;

          let queued = 0;
          for (const p of phones) {
            const jitterMs = Math.floor(Math.random() * 120_000); // 0-120s
            await addToCallQueue({
              clientKey,
              leadPhone: p.lead_phone,
              priority: 5,
              scheduledFor: new Date(Date.now() + jitterMs),
              callType: 'vapi_call',
              callData: { triggerType: 'catch_up_failed_q', outboundDialMode: 'classic' }
            });
            queued++;
          }
          console.log('[CALL QUEUE PROCESSOR] Requeued failed_q backlog:', { clientKey, queued, lookbackDays });
        }
      }
    } catch (e) {
      console.warn('[CALL QUEUE PROCESSOR] Failed_q catch-up failed:', e?.message || e);
    }

    // Self-heal: if a worker crashes, a deploy rolls traffic, or timers never complete, `processing` rows
    // (especially with NULL initiated_call_id) can wedge the dialer. Requeue them after a conservative age.
    try {
      const staleSec = Math.max(
        120,
        Math.min(7200, parseInt(String(process.env.CALL_QUEUE_STALE_PROCESSING_SEC || '210'), 10) || 210)
      );
      const staleBatch = Math.max(1, Math.min(2000, parseInt(String(process.env.CALL_QUEUE_STALE_PROCESSING_LIMIT || '250'), 10) || 250));
      const r = await query(
        `
        WITH picked AS (
          SELECT id
          FROM call_queue
          WHERE call_type = 'vapi_call'
            AND status = 'processing'
            AND initiated_call_id IS NULL
            AND updated_at < NOW() - ($1::int * INTERVAL '1 second')
          ORDER BY updated_at ASC, id ASC
          LIMIT $2
        )
        UPDATE call_queue cq
        SET status = 'pending',
            scheduled_for = LEAST(cq.scheduled_for, NOW() - INTERVAL '1 second'),
            initiated_call_id = NULL,
            call_data = jsonb_set(
              COALESCE(cq.call_data, '{}'::jsonb),
              '{lastDefer}',
              jsonb_build_object(
                'at', NOW(),
                'kind', 'internal',
                'error', 'stale_processing_requeue',
                'thresholdSec', $1
              ),
              true
            ),
            updated_at = NOW()
        FROM picked p
        WHERE cq.id = p.id
        `,
        [staleSec, staleBatch]
      );
      const n = r?.rowCount ?? r?.changes ?? 0;
      if (n > 0) {
        console.warn('[CALL QUEUE PROCESSOR] Requeued stale outbound processing rows', { n, staleSec, staleBatch });
      }
    } catch (e) {
      console.warn('[CALL QUEUE PROCESSOR] Stale processing reclaim failed:', e?.message || e);
    }

    const maxCallsPerRun = Math.max(1, Math.min(500, parseInt(process.env.CALL_QUEUE_MAX_PER_RUN || '40', 10) || 40));
    const maxConcurrentCalls = Math.max(1, Math.min(25, parseInt(process.env.CALL_QUEUE_MAX_CONCURRENT || '1', 10) || 1));

    const pendingCalls = await getPendingCalls(maxCallsPerRun);
    
    if (pendingCalls.length === 0) {
      console.log('[CALL QUEUE PROCESSOR] No pending calls found');
      return;
    }
    
    console.log('[CALL QUEUE PROCESSOR]', {
      pendingCount: pendingCalls.length,
      maxCallsPerRun,
      maxConcurrentCalls
    });

    async function processOneQueueCall(call) {
      if (call.call_type === 'vapi_call') {
        const qhClient = await getFullClient(call.client_key);
        if (qhClient && !isBusinessHours(qhClient)) {
          const next = smearCallQueueScheduledFor(
            getNextBusinessHour(qhClient),
            call.client_key,
            call.lead_phone,
            call.id
          );
          await query(
            `
              UPDATE call_queue
              SET scheduled_for = $1,
                  call_data = jsonb_set(
                    COALESCE(call_data, '{}'::jsonb),
                    '{lastDefer}',
                    jsonb_build_object(
                      'at', NOW(),
                      'kind', 'gate',
                      'error', 'outside_business_hours',
                      'details', 'deferred_in_process_one'
                    ),
                    true
                  ),
                  updated_at = NOW()
              WHERE id = $2
            `,
            [next, call.id]
          );
          console.log('[CALL QUEUE PROCESSOR] Deferred — outside business hours', { id: call.id, scheduledFor: next });
          return;
        }
      }

      // Mark as processing
      await updateCallQueueStatus(call.id, 'processing');

      // Process the call based on type
      if (call.call_type === 'vapi_call') {
        const timeoutMs = Math.max(
          10_000,
          Math.min(300_000, parseInt(String(process.env.CALL_QUEUE_ITEM_TIMEOUT_MS || '120000'), 10) || 120_000)
        );
        const v = await Promise.race([
          processVapiCallFromQueue(call),
          new Promise((_, reject) =>
            setTimeout(() => reject(Object.assign(new Error('queue_item_timeout'), { code: 'queue_item_timeout' })), timeoutMs)
          )
        ]).catch(async (e) => {
          if (String(e?.code || '') === 'queue_item_timeout') {
            const next = smearCallQueueScheduledFor(
              new Date(Date.now() + 2 * 60 * 1000),
              call.client_key,
              call.lead_phone,
              call.id
            );
            await query(
              `
                UPDATE call_queue
                SET status = 'pending',
                    scheduled_for = $1,
                    initiated_call_id = NULL,
                    call_data = jsonb_set(
                      COALESCE(call_data, '{}'::jsonb),
                      '{lastDefer}',
                      jsonb_build_object(
                        'at', NOW(),
                        'kind', 'internal',
                        'error', 'queue_item_timeout',
                        'timeoutMs', $3,
                        'lastStep', COALESCE(call_data->'lastStep', NULL)
                      ),
                      true
                    ),
                    updated_at = NOW()
                WHERE id = $2
              `,
              [next, call.id, timeoutMs]
            );
            console.warn('[CALL QUEUE PROCESSOR] Item timed out; rescheduled', { id: call.id, timeoutMs });
            return {};
          }
          throw e;
        });
        const { rows: stRows } = await query(`SELECT status FROM call_queue WHERE id = $1`, [call.id]);
        if (stRows?.[0]?.status === 'pending') {
          console.log('[CALL QUEUE PROCESSOR] Item rescheduled during handler; skipping complete.', { id: call.id });
          return;
        }
        // Safety: never mark completed unless we actually initiated a Vapi call id.
        // This prevents phantom "completed" queue rows when call initiation didn't happen.
        if (!v?.callId) {
          const next = smearCallQueueScheduledFor(
            new Date(Date.now() + 2 * 60 * 1000),
            call.client_key,
            call.lead_phone,
            call.id
          );
          await query(
            `
              UPDATE call_queue
              SET status = 'pending',
                  scheduled_for = $1,
                  initiated_call_id = NULL,
                  call_data = jsonb_set(
                    COALESCE(call_data, '{}'::jsonb),
                    '{lastDefer}',
                    jsonb_build_object(
                      'at', NOW(),
                      'kind', 'internal',
                      'error', 'missing_vapi_call_id',
                      'details', 'handler_returned_no_call_id'
                    ),
                    true
                  ),
                  updated_at = NOW()
              WHERE id = $2
            `,
            [next, call.id]
          );
          console.warn('[CALL QUEUE PROCESSOR] No Vapi call id from handler; rescheduled', { id: call.id, scheduledFor: next.toISOString() });
          return;
        }
      }

      // Mark as completed
      await updateCallQueueStatus(call.id, 'completed');
      // Cancel any other pending queue rows for same client+phone so we don't call again
      const cancelled = await cancelDuplicatePendingCalls(call.client_key, call.lead_phone, call.id);
      if (cancelled > 0) {
        console.log('[CALL QUEUE PROCESSOR] Cancelled duplicate pending rows:', { client_key: call.client_key, lead_phone: call.lead_phone, cancelled });
      }
    }

    // Concurrency-limited processing (avoid serial backlog drift)
    let idx = 0;
    async function worker() {
      await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 350)));
      while (idx < pendingCalls.length) {
        const call = pendingCalls[idx++];
        try {
          await processOneQueueCall(call);
        } catch (callError) {
          console.error('[CALL QUEUE PROCESSING ERROR]', {
            callId: call?.id,
            error: callError?.message || String(callError)
          });

          if (call?.id) {
            await updateCallQueueStatus(call.id, 'failed');
          }

          const errorType = categorizeError({ message: callError?.message || String(callError) });
          if (call && ['network', 'server_error', 'rate_limit'].includes(errorType)) {
            const { addToRetryQueue } = await import('../db.js');
            await addToRetryQueue({
              clientKey: call.client_key,
              leadPhone: call.lead_phone,
              retryType: 'vapi_call',
              retryReason: errorType,
              retryData: call.call_data,
              scheduledFor: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes later
              retryAttempt: 1,
              maxRetries: 3
            });
          }
        }
      }
    }

    const workers = Array.from({ length: Math.min(maxConcurrentCalls, pendingCalls.length) }, () => worker());
    await Promise.all(workers);
    
  } catch (error) {
    console.error('[CALL QUEUE PROCESSOR ERROR]', error);
  }
}

function isTransientInstantCallThrow(err) {
  const msg = String(err?.message || err || '');
  return /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket|network|502|503|504|429|Timeout|timed out|ENOTFOUND|certificate|SSL|Bad gateway|ECONNREFUSED/i.test(
    msg
  );
}

// moved: isTransientVapiQueueResult → lib/vapi-queue-result.js

// Process VAPI call from queue
export async function processVapiCallFromQueue(call) {
  const clientKey = call?.client_key;
  return startSpan(
    { name: 'outbound.queue.dial_row', op: 'outbound.queue', attributes: { clientKey, callId: call?.id } },
    async () => processVapiCallFromQueueInner(call)
  );
}

async function processVapiCallFromQueueInner(call) {
  try {
    // Handle call_data - it might be a JSON string or already an object
    let callData = {};
    if (call.call_data) {
      if (typeof call.call_data === 'string') {
        try {
          callData = JSON.parse(call.call_data);
        } catch (e) {
          console.error('[CALL QUEUE] Failed to parse call_data JSON:', e.message);
          callData = {};
        }
      } else if (typeof call.call_data === 'object') {
        callData = call.call_data;
      }
    }
    const { client_key: clientKey, lead_phone: leadPhone } = call;
    
    // Get client configuration
    await query(
      `
        UPDATE call_queue
        SET call_data = jsonb_set(
          COALESCE(call_data, '{}'::jsonb),
          '{lastStep}',
          jsonb_build_object('at', NOW(), 'step', 'load_client'),
          true
        ),
        updated_at = NOW()
        WHERE id = $1
      `,
      [call.id]
    );
    const client = await getFullClient(clientKey);
    if (!client) {
      throw new Error('Client not found');
    }
    
    // Get existing lead for context (DB-backed; avoids loading all tenants)
    await query(
      `
        UPDATE call_queue
        SET call_data = jsonb_set(
          COALESCE(call_data, '{}'::jsonb),
          '{lastStep}',
          jsonb_build_object('at', NOW(), 'step', 'lead_lookup'),
          true
        ),
        updated_at = NOW()
        WHERE id = $1
      `,
      [call.id]
    );
    const leadRes = await query(
      `
        SELECT id, name, phone, service, source, notes, status, created_at, lead_dial_context_json
        FROM leads
        WHERE client_key = $1 AND phone = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [clientKey, leadPhone]
    );
    const existingLead = leadRes?.rows?.[0] || null;
    const leadDialContext = existingLead?.lead_dial_context_json ?? null;
    
    // Select optimal assistant
    await query(
      `
        UPDATE call_queue
        SET call_data = jsonb_set(
          COALESCE(call_data, '{}'::jsonb),
          '{lastStep}',
          jsonb_build_object('at', NOW(), 'step', 'select_assistant'),
          true
        ),
        updated_at = NOW()
        WHERE id = $1
      `,
      [call.id]
    );
    const assistantConfig = await selectOptimalAssistant({ 
      client, 
      existingLead, 
      isYes: callData.triggerType === 'yes_response',
      isStart: callData.triggerType === 'start_opt_in'
    });
    
    // Generate assistant variables
    await query(
      `
        UPDATE call_queue
        SET call_data = jsonb_set(
          COALESCE(call_data, '{}'::jsonb),
          '{lastStep}',
          jsonb_build_object('at', NOW(), 'step', 'generate_variables'),
          true
        ),
        updated_at = NOW()
        WHERE id = $1
      `,
      [call.id]
    );
    // Validate phone number
    if (!leadPhone || !leadPhone.trim()) {
      throw new Error('Lead phone number is missing or empty');
    }
    
    // Make VAPI call using callLeadInstantly
    const { callLeadInstantly, isVapiWalletDepleted } = await import('./instant-calling.js');

    // If the wallet gate is active (e.g., Vapi credits depleted), do not even attempt the dial.
    // This avoids thrashing queue rows into "processing" only to bounce immediately, and keeps retry/queue logic clean.
    if (isVapiWalletDepleted && isVapiWalletDepleted()) {
      setLastDialBlock({
        at: new Date().toISOString(),
        kind: 'vapi_wallet_depleted',
        clientKey,
        queueId: call.id,
        details: 'preflight_gate'
      });
      const next = smearCallQueueScheduledFor(
        new Date(Date.now() + 15 * 60 * 1000),
        clientKey,
        leadPhone,
        call.id
      );
      await query(
        `
          UPDATE call_queue
          SET status = 'pending',
              scheduled_for = $1,
              initiated_call_id = NULL,
              call_data = jsonb_set(
                COALESCE(call_data, '{}'::jsonb),
                '{lastDefer}',
                jsonb_build_object(
                  'at', NOW(),
                  'kind', 'vapi',
                  'error', 'vapi_wallet_depleted',
                  'details', 'preflight_gate'
                ),
                true
              ),
              updated_at = NOW()
          WHERE id = $2
        `,
        [next, call.id]
      );
      console.warn('[QUEUE CALL] Deferred — preflight wallet gate active', { queueId: call.id, scheduledFor: next.toISOString() });
      return;
    }
    
    // Prepare lead object for callLeadInstantly
    const leadForCall = {
      phone: leadPhone.trim(),
      name: (existingLead?.name || callData.leadName || 'Prospect').substring(0, 40), // VAPI limit: 40 chars
      service: existingLead?.service || callData.leadService || '',
      source: existingLead?.source || callData.leadSource || 'queue',
      leadScore: callData.leadScore || 50,
      leadId: callData.leadId != null ? callData.leadId : undefined
    };
    
    console.log('[QUEUE CALL] Making call:', {
      queueId: call.id,
      clientKey,
      leadPhone: leadForCall.phone,
      leadName: leadForCall.name
    });
    
    let vapiResult;
    let dialPromise = null;
    let dialAbort = null;
    let handlerTimer = null;
    const timeoutMs = Math.max(
      10_000,
      Math.min(180_000, parseInt(String(process.env.CALL_QUEUE_VAPI_TIMEOUT_MS || '60000'), 10) || 60_000)
    );
    try {
      await query(
        `
          UPDATE call_queue
          SET call_data = jsonb_set(
            COALESCE(call_data, '{}'::jsonb),
            '{lastStep}',
            jsonb_build_object('at', NOW(), 'step', 'callLeadInstantly'),
            true
          ),
          updated_at = NOW()
          WHERE id = $1
        `,
        [call.id]
      );
      dialAbort = new AbortController();
      dialPromise = callLeadInstantly({
        clientKey,
        lead: leadForCall,
        leadDialContext,
        client,
        callQueueId: call.id,
        signal: dialAbort.signal,
        queueCallData: callData
      });
      vapiResult = await Promise.race([
        dialPromise,
        new Promise((_, reject) => {
          handlerTimer = setTimeout(() => {
            try {
              dialAbort.abort();
            } catch (_) {
              /* ignore */
            }
            reject(Object.assign(new Error('queue_handler_timeout'), { code: 'queue_handler_timeout' }));
          }, timeoutMs);
        })
      ]);
    } catch (e) {
      if (String(e?.code || '') === 'queue_handler_timeout') {
        if (handlerTimer) clearTimeout(handlerTimer);
        await (dialPromise || Promise.resolve()).catch(() => {});
        const next = smearCallQueueScheduledFor(
          new Date(Date.now() + 2 * 60 * 1000),
          clientKey,
          leadPhone,
          call.id
        );
        await query(
          `
            UPDATE call_queue
            SET status = 'pending',
                scheduled_for = $1,
                initiated_call_id = NULL,
                call_data = jsonb_set(
                  COALESCE(call_data, '{}'::jsonb),
                  '{lastDefer}',
                  jsonb_build_object(
                    'at', NOW(),
                    'kind', 'internal',
                    'error', 'queue_handler_timeout',
                    'step', 'callLeadInstantly',
                    'lastStep', COALESCE(call_data->'lastStep', NULL)
                  ),
                  true
                ),
                updated_at = NOW()
            WHERE id = $2
          `,
          [next, call.id]
        );
        console.warn('[QUEUE CALL] Deferred — handler timeout', { queueId: call.id, scheduledFor: next.toISOString(), timeoutMs });
        return {};
      }
      if (isTransientInstantCallThrow(e)) {
        const next = smearCallQueueScheduledFor(
          new Date(Date.now() + 2 * 60 * 1000),
          clientKey,
          leadPhone,
          call.id
        );
        await query(
          `
            UPDATE call_queue
            SET status = 'pending',
                scheduled_for = $1,
                call_data = jsonb_set(
                  COALESCE(call_data, '{}'::jsonb),
                  '{lastDefer}',
                  jsonb_build_object(
                    'at', NOW(),
                    'kind', 'throw',
                    'error', 'transient_before_vapi_response',
                    'message', $3::text
                  ),
                  true
                ),
                updated_at = NOW()
            WHERE id = $2
          `,
          [next, call.id, String(e?.message || e).slice(0, 220)]
        );
        console.warn('[QUEUE CALL] Deferred — transient error before Vapi response', {
          queueId: call.id,
          scheduledFor: next.toISOString(),
          message: String(e?.message || e).slice(0, 240)
        });
        return {};
      }
      throw e;
    } finally {
      if (handlerTimer) clearTimeout(handlerTimer);
    }

    if (vapiResult?.error === 'outside_business_hours') {
      const next = smearCallQueueScheduledFor(
        getNextBusinessHour(client),
        clientKey,
        leadPhone,
        call.id
      );
      await query(
        `
          UPDATE call_queue
          SET status = 'pending',
              scheduled_for = $1,
              initiated_call_id = NULL,
              call_data = jsonb_set(
                COALESCE(call_data, '{}'::jsonb),
                '{lastDefer}',
                jsonb_build_object(
                  'at', NOW(),
                  'kind', 'gate',
                  'error', 'outside_business_hours',
                  'details', 'vapi_helper_returned_outside_hours'
                ),
                true
              ),
              updated_at = NOW()
          WHERE id = $2
        `,
        [next, call.id]
      );
      console.log('[QUEUE CALL] Deferred to business hours', { queueId: call.id, scheduledFor: next });
      return;
    }

    if (vapiResult?.error === 'outbound_journey_complete') {
      await query(
        `UPDATE call_queue SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
        [call.id]
      );
      console.log('[QUEUE CALL] Cancelled — outbound weekday journey complete (no further auto dials)', {
        queueId: call.id
      });
      return;
    }

    if (vapiResult?.error === 'daily_dial_limit') {
      const tzQ = client?.booking?.timezone || client?.timezone || TIMEZONE;
      const nextLocalDayStart = DateTime.now().setZone(tzQ).plus({ days: 1 }).startOf('day').toJSDate();
      const nextOpen = getNextBusinessOpenForTenant(client, nextLocalDayStart, tzQ, {
        forOutboundDial: true
      });
      const nextSmear = smearCallQueueScheduledFor(nextOpen, clientKey, leadPhone, call.id);
      await query(
        `
          UPDATE call_queue
          SET status = 'pending',
              scheduled_for = $1,
              call_data = jsonb_set(
                COALESCE(call_data, '{}'::jsonb),
                '{lastDefer}',
                jsonb_build_object(
                  'at', NOW(),
                  'kind', 'journey',
                  'error', 'daily_dial_limit',
                  'details', 'weekday_slot_used'
                ),
                true
              ),
              updated_at = NOW()
          WHERE id = $2
        `,
        [nextSmear, call.id]
      );
      console.log('[QUEUE CALL] Deferred — weekday journey slot already used for today’s bucket (try next dial day)', {
        queueId: call.id,
        scheduledFor: nextSmear
      });
      return;
    }
    
    if (!vapiResult || !vapiResult.ok || vapiResult.error) {
      if (isTransientVapiQueueResult(vapiResult)) {
        const delayMin = vapiResult?.error === 'circuit_breaker_open' ? 5 : 2;
        const next = smearCallQueueScheduledFor(
          new Date(Date.now() + delayMin * 60 * 1000),
          clientKey,
          leadPhone,
          call.id
        );
        await query(
          `
            UPDATE call_queue
            SET status = 'pending',
                scheduled_for = $1,
                call_data = jsonb_set(
                  COALESCE(call_data, '{}'::jsonb),
                  '{lastDefer}',
                  jsonb_build_object(
                    'at', NOW(),
                    'kind', 'vapi',
                    'error', $3::text,
                    'statusCode', $4::integer,
                    'details', $5::text
                  ),
                  true
                ),
                updated_at = NOW()
            WHERE id = $2
          `,
          [
            next,
            call.id,
            String(vapiResult?.error || 'unknown').slice(0, 120),
            vapiResult?.statusCode != null ? Number(vapiResult.statusCode) : null,
            typeof vapiResult?.details === 'string' ? String(vapiResult.details).slice(0, 220) : null
          ]
        );
        console.warn('[QUEUE CALL] Deferred — transient Vapi failure (no failed_q marker)', {
          queueId: call.id,
          error: vapiResult?.error,
          scheduledFor: next.toISOString()
        });
        return {};
      }

      const detailsStr = typeof vapiResult?.details === 'string' ? vapiResult.details : '';
      const isNoCredits = isNoCreditsVapiResult(vapiResult);

      if (isNoCredits) {
        setLastDialBlock({
          at: new Date().toISOString(),
          kind: 'vapi_no_credits',
          clientKey,
          queueId: call.id,
          details: detailsStr.slice(0, 240)
        });
        // Pre-flight wallet gate (intent: billing.wallet-check-before-dial).
        // Flag the wallet as depleted so subsequent dials skip fetch entirely
        // until the flag self-clears. Without this, every queued row spends a
        // full Vapi POST round-trip just to learn the wallet is still empty.
        try {
          const { markVapiWalletDepleted } = await import('./instant-calling.js');
          markVapiWalletDepleted({ ttlMs: 15 * 60 * 1000 });
        } catch (_) { /* non-fatal */ }
        // Don't create a fake failed call record; just defer the queue item so it runs when credits are back.
        const next = smearCallQueueScheduledFor(
          new Date(Date.now() + 15 * 60 * 1000),
          clientKey,
          leadPhone,
          call.id
        );
        await query(
          `
            UPDATE call_queue
            SET status = 'pending',
                scheduled_for = $1,
                call_data = jsonb_set(
                  COALESCE(call_data, '{}'::jsonb),
                  '{lastDefer}',
                  jsonb_build_object(
                    'at', NOW(),
                    'kind', 'vapi',
                    'error', 'vapi_no_credits',
                    'details', $3::text
                  ),
                  true
                ),
                updated_at = NOW()
            WHERE id = $2
          `,
          [next, call.id, detailsStr.slice(0, 220)]
        );
        console.warn('[QUEUE CALL] Deferred due to VAPI credits', { queueId: call.id, scheduledFor: next.toISOString() });
        void sendOperatorAlert({
          subject: 'Vapi wallet or credits blocking outbound dials',
          text:
            `Queue item ${call.id} for tenant ${clientKey} was deferred after a Vapi wallet/credits style error. ` +
            `Top of details: ${detailsStr.slice(0, 240)}. Expect automatic retries after backoff; add credits or upgrade the Vapi plan if this persists.`,
          dedupeKey: 'vapi:no_credits',
          throttleMinutes: 120
        }).catch(() => {});
        return;
      }

      if (vapiResult?.error === 'vapi_wallet_depleted') {
        setLastDialBlock({
          at: new Date().toISOString(),
          kind: 'vapi_wallet_depleted',
          clientKey,
          queueId: call.id,
          details: String(vapiResult?.details || '').slice(0, 240)
        });
        // Pre-flight wallet gate already prevented the dial. Treat this as a defer, not a failure,
        // so we don't poison retry/queue logic with synthetic failed_q call rows.
        const next = smearCallQueueScheduledFor(
          new Date(Date.now() + 15 * 60 * 1000),
          clientKey,
          leadPhone,
          call.id
        );
        await query(
          `
            UPDATE call_queue
            SET status = 'pending',
                scheduled_for = $1,
                call_data = jsonb_set(
                  COALESCE(call_data, '{}'::jsonb),
                  '{lastDefer}',
                  jsonb_build_object(
                    'at', NOW(),
                    'kind', 'vapi',
                    'error', 'vapi_wallet_depleted',
                    'details', $3::text
                  ),
                  true
                ),
                updated_at = NOW()
            WHERE id = $2
          `,
          [next, call.id, String(vapiResult?.details || '').slice(0, 220)]
        );
        console.warn('[QUEUE CALL] Deferred — wallet gate active (credits likely empty)', {
          queueId: call.id,
          scheduledFor: next.toISOString()
        });
        return;
      }

      if (vapiResult?.error === 'vapi_not_configured') {
        setLastDialBlock({
          at: new Date().toISOString(),
          kind: 'vapi_not_configured',
          clientKey,
          queueId: call.id,
          details: String(vapiResult?.details || '').slice(0, 240)
        });
        // Missing Vapi env/config should not poison queue/retry state. Defer and alert.
        const next = smearCallQueueScheduledFor(
          new Date(Date.now() + 60 * 60 * 1000),
          clientKey,
          leadPhone,
          call.id
        );
        await query(
          `
            UPDATE call_queue
            SET status = 'pending',
                scheduled_for = $1,
                call_data = jsonb_set(
                  COALESCE(call_data, '{}'::jsonb),
                  '{lastDefer}',
                  jsonb_build_object(
                    'at', NOW(),
                    'kind', 'vapi',
                    'error', 'vapi_not_configured',
                    'details', $3::text
                  ),
                  true
                ),
                updated_at = NOW()
            WHERE id = $2
          `,
          [next, call.id, String(vapiResult?.details || '').slice(0, 220)]
        );
        console.warn('[QUEUE CALL] Deferred — Vapi not configured', { queueId: call.id, scheduledFor: next.toISOString() });
        void sendOperatorAlert({
          subject: 'Vapi not configured — outbound dials deferred',
          text:
            `Queue item ${call.id} for tenant ${clientKey} deferred because Vapi is not configured. ` +
            `Details: ${String(vapiResult?.details || '').slice(0, 240)}.`,
          dedupeKey: 'vapi:not_configured',
          throttleMinutes: 240
        }).catch(() => {});
        return;
      }

      // Record failed attempt so lead queuer doesn't re-queue this lead every 5 min (87 attempts from 10 leads)
      const { upsertCall } = await import('../db.js');
      const failedCallId = `failed_q${call.id}_${Date.now()}`;
      await upsertCall({
        callId: failedCallId,
        clientKey,
        leadPhone,
        status: 'failed',
        outcome: 'failed',
        duration: null,
        cost: null,
        metadata: { reason: vapiResult?.error || vapiResult?.details, queueId: call.id, fromQueue: true },
        retryAttempt: call.retry_attempt || 0
      }).catch((e) => console.error('[QUEUE VAPI CALL] Failed to record failed attempt:', e.message));
      throw new Error(vapiResult?.error || vapiResult?.details || 'VAPI call failed');
    }

    // Normalize call id return shape from different Vapi helpers.
    // `callLeadInstantly` returns `{ ok: true, callId: '...' }` (not `.id`).
    const vapiCallId = vapiResult?.id || vapiResult?.callId || null;

    // Record an initiated call immediately so the dashboard reflects real outbound attempts
    // even before Vapi webhooks arrive.
    if (!vapiCallId) {
      // Defensive: if we don't get a call id, we can't correlate webhooks; reschedule.
      const next = smearCallQueueScheduledFor(
        new Date(Date.now() + 2 * 60 * 1000),
        clientKey,
        leadPhone,
        call.id
      );
      await query(
        `
          UPDATE call_queue
          SET status = 'pending',
              scheduled_for = $1,
              call_data = jsonb_set(
                COALESCE(call_data, '{}'::jsonb),
                '{lastDefer}',
                jsonb_build_object(
                  'at', NOW(),
                  'kind', 'internal',
                  'error', 'missing_vapi_call_id',
                  'details', 'vapi_ok_but_missing_id'
                ),
                true
              ),
              updated_at = NOW()
          WHERE id = $2
        `,
        [next, call.id]
      );
      console.warn('[QUEUE CALL] Missing VAPI call id; rescheduled', { queueId: call.id, scheduledFor: next.toISOString() });
      return;
    }
    try {
      const { upsertCall } = await import('../db.js');
      await upsertCall({
        callId: vapiCallId,
        clientKey,
        leadPhone,
        status: 'initiated',
        outcome: null,
        duration: null,
        cost: null,
        metadata: { queueId: call.id, fromQueue: true, triggerType: callData?.triggerType || null },
        retryAttempt: call.retry_attempt || 0
      });
      // Verify the call row exists (and is correlated to this queue row) before we allow the queue item to complete.
      // If this fails, we reschedule rather than silently "completing" work that didn't persist.
      const { rows: verifyRows } = await query(
        `
          SELECT 1
          FROM calls
          WHERE client_key = $1
            AND call_id = $2
            AND (metadata->>'queueId') = $3
          LIMIT 1
        `,
        [clientKey, vapiCallId, String(call.id)]
      );
      if (!verifyRows?.[0]) {
        throw new Error('call_persist_verify_failed');
      }
      // Stamp the queue row with the initiated call id so DB-level constraints can enforce correctness.
      await query(
        `UPDATE call_queue SET initiated_call_id = $1, updated_at = NOW() WHERE id = $2 AND status = 'processing'`,
        [vapiCallId, call.id]
      );
    } catch (e) {
      console.warn('[QUEUE CALL] Failed to record initiated call:', e?.message || e);
      const next = smearCallQueueScheduledFor(
        new Date(Date.now() + 2 * 60 * 1000),
        clientKey,
        leadPhone,
        call.id
      );
      await query(
        `
          UPDATE call_queue
          SET status = 'pending',
              scheduled_for = $1,
              call_data = jsonb_set(
                COALESCE(call_data, '{}'::jsonb),
                '{lastDefer}',
                jsonb_build_object(
                  'at', NOW(),
                  'kind', 'internal',
                  'error', 'call_persist_failure',
                  'message', $3::text
                ),
                true
              ),
              updated_at = NOW()
          WHERE id = $2
        `,
        [next, call.id, String(e?.message || e).slice(0, 220)]
      );
      console.warn('[QUEUE CALL] Rescheduled due to call persist failure', { queueId: call.id, scheduledFor: next.toISOString() });
      return;
    }
    
    console.log('[QUEUE CALL SUCCESS]', {
      queueId: call.id,
      clientKey,
      leadPhone,
      callId: vapiCallId || 'pending',
      priority: call.priority
    });
    return { ok: true, callId: vapiCallId };
  } catch (error) {
    console.error('[QUEUE VAPI CALL ERROR]', {
      queueId: call.id,
      error: error.message
    });
    throw error;
  }
}

// Queue new leads for calling - runs every 5 minutes
export async function queueNewLeadsForCalling() {
  return startSpan({ name: 'outbound.queue.new_leads', op: 'outbound.queue' }, async () => queueNewLeadsForCallingInner());
}

async function queueNewLeadsForCallingInner() {
  try {
    globalThis.__opsLastQueueNewLeadsAt = new Date().toISOString();
    console.log('[LEAD QUEUER] Checking for new leads to queue...');
    const leadQueueBatchSize = Math.max(1, Math.min(300, parseInt(process.env.LEAD_QUEUE_BATCH_SIZE || '120', 10) || 120));
    
    // Get all clients
    const clients = await listFullClients();
    
    for (const client of clients) {
      if (!client.isEnabled || !client.vapi?.assistantId) {
        continue; // Skip disabled clients or clients without VAPI config
      }
      
      try {
        // Get new leads that haven't been called yet
        // Check call_queue (pending) and in-flight calls; Mon–Fri outbound journey (per number) blocks until terminal or next bucket day
        const newLeads = await poolQuerySelect(`
          SELECT l.id, l.name, l.phone, l.service, l.source, l.status, l.created_at, l.lead_dial_context_json
          FROM leads l
          WHERE l.client_key = $1
            AND l.status = 'new'
            AND l.created_at >= NOW() - INTERVAL '30 days'
            AND NOT EXISTS (
              SELECT 1 FROM call_queue cq
              WHERE cq.client_key = l.client_key
                AND cq.call_type = 'vapi_call'
                AND cq.status IN ('pending', 'processing')
                AND ${pgQueueLeadPhoneKeyExpr('cq.lead_phone')} = COALESCE(l.phone_match_key, '__nodigits__')
            )
            AND NOT EXISTS (
              SELECT 1 FROM calls c
              WHERE c.client_key = l.client_key
              AND c.lead_phone = l.phone
              -- Never call if there is an active call
              AND c.status IN ('initiated', 'in_progress')
            )
            AND NOT EXISTS (
              SELECT 1 FROM outbound_weekday_journey j
              WHERE j.client_key = l.client_key
                AND j.phone_match_key = COALESCE(l.phone_match_key, '__nodigits__')
                AND (
                  j.closed_at IS NOT NULL
                  OR (
                    EXTRACT(ISODOW FROM NOW() AT TIME ZONE $2) BETWEEN 1 AND 5
                    AND (
                      j.weekday_mask
                      & (1 << (EXTRACT(ISODOW FROM NOW() AT TIME ZONE $2)::int - 1))::int
                    ) <> 0
                  )
                )
            )
          ORDER BY l.created_at ASC
          LIMIT ${leadQueueBatchSize}
        `, [client.clientKey, pickTimezone(client)]);
        
        if (newLeads.rows.length === 0) {
          continue;
        }
        
        console.log(`[LEAD QUEUER] Found ${newLeads.rows.length} new leads for ${client.clientKey}`);
        
        const { addToCallQueue, getLatestCallInsights } = await import('../db.js');
        const { scheduleAtOptimalCallWindow } = await import('./optimal-call-window.js');
        const insightsRow = await getLatestCallInsights(client.clientKey).catch(() => null);
        const routing = insightsRow?.routing;

        // Spread new-lead dials using the same insights/routing system used elsewhere: we set a moving baseline
        // that starts at the current call_queue backlog and then advances as we schedule each new lead. This
        // avoids burst scheduling while keeping hour/day selection inside scheduleAtOptimalCallWindow().
        const maxScheduled = await poolQuerySelect(
          `
            SELECT MAX(scheduled_for) AS max_scheduled_for
            FROM call_queue
            WHERE client_key = $1
              AND call_type = 'vapi_call'
              AND status IN ('pending', 'processing')
          `,
          [client.clientKey]
        );
        const maxScheduledAt = maxScheduled?.rows?.[0]?.max_scheduled_for
          ? new Date(maxScheduled.rows[0].max_scheduled_for)
          : null;
        // Minimum spacing between newly queued leads for this run; keeps queue inserts from concentrating
        // on the same minute while still allowing the routing system to choose best hours/days.
        const QUEUE_SPREAD_MIN_SPACING_MS = Math.max(
          0,
          Math.min(10 * 60_000, parseInt(process.env.LEAD_QUEUE_MIN_SPACING_MS || '15000', 10) || 15000)
        );
        let movingBaseline = new Date(
          Math.max(
            Date.now(),
            maxScheduledAt ? maxScheduledAt.getTime() + QUEUE_SPREAD_MIN_SPACING_MS : 0
          )
        );

        for (const lead of newLeads.rows) {
          try {
            // Check if we should call now or schedule for later
            const shouldCallNow = isBusinessHours(client);
            const scheduledBaseline = shouldCallNow
              ? new Date()
              : getNextBusinessHour(client);
            // Inside business hours, we still schedule via insights/routing so dials are spread across the day.
            // Outside hours, schedule into the next allowed/optimal window.
            const baselineForThisLead = new Date(Math.max(scheduledBaseline.getTime(), movingBaseline.getTime()));
            const scheduledFor = await scheduleAtOptimalCallWindow(client, routing, baselineForThisLead, {
              fallbackTz: pickTimezone(client),
              clientKey: client.clientKey,
              jitterKey: lead.phone
            });

            const finalScheduledFor = scheduledFor;
            const scheduleTag = shouldCallNow ? 'optimal_today' : 'optimal';

            // Calculate priority based on lead age and source
            const leadAge = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60)); // hours
            let priority = 5; // Default priority
            if (leadAge < 1) priority = 8; // Very new leads get high priority
            else if (leadAge < 24) priority = 6; // Less than 24 hours
            else priority = 4; // Older leads

            const callData = {
              triggerType: 'new_lead',
              outboundDialMode: 'classic',
              leadId: lead.id,
              leadName: lead.name,
              leadService: lead.service,
              leadSource: lead.source,
              leadStatus: lead.status,
              businessHours: shouldCallNow ? 'within' : 'outside',
              scheduling: scheduleTag
            };

            try {
              const { insertLeadSequenceState } = await import('../db.js');
              const { getFirstStage, shouldLeadUseOutboundSequence } =
                await import('./outbound-sequence.js');
              if (shouldLeadUseOutboundSequence(client, lead.lead_dial_context_json)) {
                callData.outboundDialMode = 'sequence';
                const firstStage = getFirstStage(client);
                if (firstStage && /** @type {any} */ (firstStage).id) {
                  await insertLeadSequenceState({
                    clientKey: client.clientKey,
                    leadPhone: lead.phone,
                    currentStageId: String(/** @type {any} */ (firstStage).id)
                  });
                  callData.stageId = String(/** @type {any} */ (firstStage).id);
                }
              }
            } catch (seqInitErr) {
              console.warn('[LEAD QUEUER] sequence init skipped:', seqInitErr?.message || seqInitErr);
            }

            await addToCallQueue({
              clientKey: client.clientKey,
              leadPhone: lead.phone,
              priority: priority,
              scheduledFor: finalScheduledFor,
              callType: 'vapi_call',
              callData
            });

            // Advance baseline slightly so subsequent leads don't share an identical baseline.
            movingBaseline = new Date(Math.max(movingBaseline.getTime() + QUEUE_SPREAD_MIN_SPACING_MS, new Date(finalScheduledFor).getTime()));
            
            const now = new Date();
            const scheduledTime = new Date(finalScheduledFor);
            const timeUntilCall = scheduledTime - now;
            const minutesUntilCall = Math.floor(timeUntilCall / (1000 * 60));
            
            console.log(`[LEAD QUEUER] Queued lead ${lead.phone} for ${client.clientKey} (priority: ${priority}, scheduled: ${scheduledTime.toISOString()}, ${shouldCallNow ? 'immediate' : `${minutesUntilCall} minutes from now`})`);
          } catch (queueError) {
            console.error(`[LEAD QUEUER] Error queueing lead ${lead.phone}:`, queueError);
          }
        }
      } catch (clientError) {
        console.error(`[LEAD QUEUER] Error processing client ${client.clientKey}:`, clientError);
      }
    }
  } catch (error) {
    console.error('[LEAD QUEUER ERROR]', error);
  }
}
