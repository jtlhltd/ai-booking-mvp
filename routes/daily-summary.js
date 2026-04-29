import express from 'express';
import { DateTime } from 'luxon';

export function createDailySummaryRouter(deps) {
  const {
    getFullClient,
    resolveLogisticsSpreadsheetId,
    sheets,
    isPostgres,
    poolQuerySelect,
    query,
    pickTimezone
  } = deps || {};

  const router = express.Router();

  function isFollowUpQueueDemoClient(clientKey) {
    const k = String(clientKey || '').toLowerCase().trim();
    return k === 'demo_client' || k === 'demo-client' || k === 'stay-focused-fitness-chris';
  }

  router.get('/daily-summary/:clientKey', async (req, res) => {
    try {
      const { clientKey } = req.params;
      res.set('Cache-Control', 'no-store');

      function parseUkTimestampToMs(s, tz) {
        const m = String(s || '')
          .trim()
          .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (!m) return NaN;
        const d = Number(m[1]);
        const mo = Number(m[2]);
        const y = Number(m[3]);
        const h = Number(m[4]);
        const mi = Number(m[5]);
        const se = m[6] != null ? Number(m[6]) : 0;
        const dt = DateTime.fromObject(
          { year: y, month: mo, day: d, hour: h, minute: mi, second: se },
          { zone: tz }
        );
        return dt.isValid ? dt.toMillis() : NaN;
      }

      function parseAnyTimestampToMs(s, tz) {
        const uk = parseUkTimestampToMs(s, tz);
        if (Number.isFinite(uk)) return uk;
        const trimmed = String(s || '').trim();
        const dt = DateTime.fromISO(trimmed, { zone: tz });
        if (dt.isValid) return dt.toMillis();
        const iso = Date.parse(trimmed);
        return Number.isFinite(iso) ? iso : NaN;
      }

      function classifyRowStatus(row) {
        const statusRaw = String(row?.Status || row?.['Status'] || '').trim();
        const dispRaw = String(row?.Disposition || row?.['Disposition'] || '').trim();
        const status = (statusRaw || dispRaw || 'To call').toLowerCase();
        if (status === 'called') return 'called';
        if (status.includes('do not call') || status === 'dnc') return 'dnc';
        if (status.includes('disqual')) return 'disqualified';
        return 'todo';
      }

      function computeFollowUpStats(rows, tz) {
        const now = DateTime.now().setZone(tz);
        const todayStart = now.startOf('day');
        const startMs = todayStart.toMillis();
        const nowMs = now.toMillis();
        const out = {
          total: 0,
          todo: 0,
          called: 0,
          dnc: 0,
          disqualified: 0,
          today: { total: 0, todo: 0, called: 0, dnc: 0, disqualified: 0 }
        };
        for (const row of rows || []) {
          const kind = classifyRowStatus(row);
          out.total += 1;
          out[kind] += 1;
          const createdMs = parseAnyTimestampToMs(row?.Timestamp, tz);
          if (Number.isFinite(createdMs) && createdMs >= startMs && createdMs <= nowMs) {
            out.today.total += 1;
          }
          const outcomeMs = parseAnyTimestampToMs(row?.['Last Outcome At'] || row?.['Last Outcome'] || '', tz);
          const effectiveMs = Number.isFinite(outcomeMs) ? outcomeMs : createdMs;
          if (Number.isFinite(effectiveMs) && effectiveMs >= startMs && effectiveMs <= nowMs) {
            out.today[kind] += 1;
          }
        }
        return out;
      }

      function dispositionKey(raw) {
        const v = String(raw || '').trim().toLowerCase();
        if (!v) return '';
        if (v.includes('voicemail') || v === 'vm') return 'voicemail';
        if (v.includes('spoke')) return 'spoke';
        if (v.includes('call back') || v.includes('callback')) return 'callback';
        if (v.includes('not interested') || v.includes('no interest')) return 'not_interested';
        return 'other';
      }

      function computeDispositionBreakdown(rows, tz) {
        const now = DateTime.now().setZone(tz);
        const todayStart = now.startOf('day');
        const startMs = todayStart.toMillis();
        const nowMs = now.toMillis();
        const base = { voicemail: 0, spoke: 0, callback: 0, not_interested: 0, other: 0, none: 0 };
        const out = { total: { ...base }, today: { ...base } };
        for (const row of rows || []) {
          const disp = String(row?.Disposition || row?.['Disposition'] || '').trim();
          const k = disp ? dispositionKey(disp) : 'none';
          out.total[k] += 1;
          const createdMs = parseAnyTimestampToMs(row?.Timestamp, tz);
          const outcomeMs = parseAnyTimestampToMs(row?.['Last Outcome At'] || row?.['Last Outcome'] || '', tz);
          const effectiveMs = Number.isFinite(outcomeMs) ? outcomeMs : createdMs;
          if (Number.isFinite(effectiveMs) && effectiveMs >= startMs && effectiveMs <= nowMs) {
            out.today[k] += 1;
          }
        }
        return out;
      }

      function topToCallFromRows(rows, limit = 10, tz) {
        const items = (rows || [])
          .map((r) => {
            const kind = classifyRowStatus(r);
            const tsMs = parseUkTimestampToMs(r?.Timestamp, tz);
            const cb = String(
              r?.['Callback Window'] ||
                r?.['Callback Window '] ||
                r?.['Callback'] ||
                r?.['Callback Window'] ||
                ''
            ).trim();
            const hasCb = cb ? 1 : 0;
            const hasDm = String(r?.['Decision Maker'] || '').trim() ? 1 : 0;
            const hasEmail = String(r?.Email || '').trim() ? 1 : 0;
            const score =
              hasCb * 100 +
              hasDm * 10 +
              hasEmail * 5 +
              (Number.isFinite(tsMs) ? Math.floor(tsMs / 1000) : 0);
            return {
              kind,
              score,
              tsMs,
              row: r
            };
          })
          .filter((x) => x.kind === 'todo');
        items.sort((a, b) => b.score - a.score);
        return items.slice(0, limit).map((x) => {
          const r = x.row || {};
          return {
            timestamp: String(r.Timestamp || '').trim(),
            businessName: String(r['Business Name'] || '').trim(),
            decisionMaker: String(r['Decision Maker'] || '').trim(),
            phone: String(r.Phone || '').trim(),
            email: String(r.Email || '').trim(),
            callbackWindow: String(r['Callback Window'] || '').trim(),
            transcriptSnippet: String(r['Transcript Snippet'] || '').trim(),
            recordingUri: String(r['Recording URI'] || '').trim(),
            callId: String(r['Call ID'] || '').trim()
          };
        });
      }

      let callQueuePending = 0;
      let callQueueDueNow = 0;
      let retryPending = 0;
      let retryDueNow = 0;
      try {
        if (isPostgres) {
          const [cqTotal, cqDue, rqTotal, rqDue] = await Promise.all([
            poolQuerySelect(
              `SELECT COUNT(*)::int AS n FROM call_queue WHERE client_key = $1 AND status = 'pending'`,
              [clientKey]
            ),
            poolQuerySelect(
              `SELECT COUNT(*)::int AS n FROM call_queue WHERE client_key = $1 AND status = 'pending' AND scheduled_for <= NOW()`,
              [clientKey]
            ),
            poolQuerySelect(
              `SELECT COUNT(*)::int AS n FROM retry_queue WHERE client_key = $1 AND status = 'pending'`,
              [clientKey]
            ),
            poolQuerySelect(
              `SELECT COUNT(*)::int AS n FROM retry_queue WHERE client_key = $1 AND status = 'pending' AND scheduled_for <= NOW()`,
              [clientKey]
            )
          ]);
          callQueuePending = Number(cqTotal.rows?.[0]?.n || 0) || 0;
          callQueueDueNow = Number(cqDue.rows?.[0]?.n || 0) || 0;
          retryPending = Number(rqTotal.rows?.[0]?.n || 0) || 0;
          retryDueNow = Number(rqDue.rows?.[0]?.n || 0) || 0;
        } else {
          const [cqTotal, cqDue, rqTotal, rqDue] = await Promise.all([
            poolQuerySelect(
              `SELECT COUNT(*) AS n FROM call_queue WHERE client_key = $1 AND status = 'pending'`,
              [clientKey]
            ),
            poolQuerySelect(
              `SELECT COUNT(*) AS n FROM call_queue WHERE client_key = $1 AND status = 'pending' AND datetime(scheduled_for) <= datetime('now')`,
              [clientKey]
            ),
            poolQuerySelect(
              `SELECT COUNT(*) AS n FROM retry_queue WHERE client_key = $1 AND status = 'pending'`,
              [clientKey]
            ),
            poolQuerySelect(
              `SELECT COUNT(*) AS n FROM retry_queue WHERE client_key = $1 AND status = 'pending' AND datetime(scheduled_for) <= datetime('now')`,
              [clientKey]
            )
          ]);
          callQueuePending = Number(cqTotal.rows?.[0]?.n || 0) || 0;
          callQueueDueNow = Number(cqDue.rows?.[0]?.n || 0) || 0;
          retryPending = Number(rqTotal.rows?.[0]?.n || 0) || 0;
          retryDueNow = Number(rqDue.rows?.[0]?.n || 0) || 0;
        }
      } catch {
        // Non-fatal: summary still useful with follow-up sheet only
      }

      if (isFollowUpQueueDemoClient(clientKey)) {
        const demoTz = 'Europe/London';
        const demoRows = [
          {
            Timestamp: new Date(Date.now() - 2 * 3600000).toLocaleString('en-GB', {
              timeZone: 'Europe/London'
            }),
            Status: 'To call',
            'Business Name': 'Northbridge Freight Ltd',
            Phone: '+447700900111',
            'Transcript Snippet': 'Asked for Thursday PM callback.'
          },
          {
            Timestamp: new Date(Date.now() - 26 * 3600000).toLocaleString('en-GB', {
              timeZone: 'Europe/London'
            }),
            Status: 'Called',
            'Business Name': 'Coastal Packaging Co',
            Phone: '+447700900222',
            'Transcript Snippet': 'Not ready until Q3.'
          }
        ];
        const fu = computeFollowUpStats(demoRows, demoTz);
        const dispositions = computeDispositionBreakdown(demoRows, demoTz);
        return res.json({
          ok: true,
          demo: true,
          followUp: fu,
          dispositions,
          queue: { callQueuePending, callQueueDueNow, retryPending, retryDueNow },
          topToCall: topToCallFromRows(demoRows, 8, demoTz)
        });
      }

      const client = await getFullClient(clientKey);
      const tz = pickTimezone(client);
      const spreadsheetId = resolveLogisticsSpreadsheetId(client);
      if (!spreadsheetId) {
        return res.json({
          ok: true,
          demo: false,
          configured: false,
          followUp: computeFollowUpStats([], tz),
          dispositions: computeDispositionBreakdown([], tz),
          queue: { callQueuePending, callQueueDueNow, retryPending, retryDueNow },
          topToCall: []
        });
      }

      await sheets.ensureLogisticsHeader(spreadsheetId);
      const { rows: rawRows } = await sheets.readSheet(spreadsheetId, 'Sheet1!A:Z');
      const records = sheets.logisticsSheetRowsToRecords(rawRows);

      let callQueueSchedule = null;
      try {
        if (isPostgres) {
          const { rows } = await query(
            `
          WITH bounds AS (
            SELECT
              NOW() AS now_utc,
              ((date_trunc('day', NOW() AT TIME ZONE $2)) AT TIME ZONE $2) AS today_start_utc,
              ((date_trunc('day', NOW() AT TIME ZONE $2) + INTERVAL '1 day') AT TIME ZONE $2) AS tomorrow_start_utc,
              ((date_trunc('day', NOW() AT TIME ZONE $2) + INTERVAL '2 day') AT TIME ZONE $2) AS day_after_start_utc
          )
          SELECT
            COUNT(*)::int AS pending_total,
            MIN(cq.scheduled_for) AS next_scheduled_for,
            MAX(cq.scheduled_for) AS last_scheduled_for,
            SUM(CASE WHEN cq.scheduled_for <= b.now_utc THEN 1 ELSE 0 END)::int AS due_now,
            SUM(CASE WHEN cq.scheduled_for > b.now_utc AND cq.scheduled_for <= b.now_utc + INTERVAL '60 minutes' THEN 1 ELSE 0 END)::int AS due_next_hour,
            SUM(CASE WHEN cq.scheduled_for >= b.today_start_utc AND cq.scheduled_for < b.tomorrow_start_utc THEN 1 ELSE 0 END)::int AS scheduled_today,
            SUM(CASE WHEN cq.scheduled_for >= b.tomorrow_start_utc AND cq.scheduled_for < b.day_after_start_utc THEN 1 ELSE 0 END)::int AS scheduled_tomorrow
          FROM call_queue cq
          CROSS JOIN bounds b
          WHERE cq.client_key = $1
            AND cq.call_type = 'vapi_call'
            AND cq.status = 'pending'
          `,
            [clientKey, tz]
          );
          const r = rows?.[0];
          if (r) {
            callQueueSchedule = {
              timezone: tz,
              pendingTotal: Number(r.pending_total) || 0,
              nextScheduledFor: r.next_scheduled_for,
              lastScheduledFor: r.last_scheduled_for,
              dueNow: Number(r.due_now) || 0,
              dueNextHour: Number(r.due_next_hour) || 0,
              scheduledToday: Number(r.scheduled_today) || 0,
              scheduledTomorrow: Number(r.scheduled_tomorrow) || 0
            };
          }
        } else {
          const { rows } = await query(
            `
          SELECT
            COUNT(*) AS pending_total,
            MIN(scheduled_for) AS next_scheduled_for,
            MAX(scheduled_for) AS last_scheduled_for
          FROM call_queue
          WHERE client_key = ?
            AND call_type = 'vapi_call'
            AND status = 'pending'
          `,
            [clientKey]
          );
          const pendingRows = await query(
            `
          SELECT scheduled_for
          FROM call_queue
          WHERE client_key = ?
            AND call_type = 'vapi_call'
            AND status = 'pending'
          `,
            [clientKey]
          );
          const nowUtc = DateTime.utc();
          const nowPlusHour = nowUtc.plus({ minutes: 60 });
          let dueNow = 0;
          let dueNextHour = 0;
          for (const row of pendingRows.rows || []) {
            const when = DateTime.fromJSDate(new Date(row.scheduled_for), { zone: 'utc' });
            if (!when.isValid) continue;
            if (when <= nowUtc) {
              dueNow += 1;
            } else if (when <= nowPlusHour) {
              dueNextHour += 1;
            }
          }
          const r = rows?.[0];
          if (r) {
            callQueueSchedule = {
              timezone: tz,
              pendingTotal: Number(r.pending_total) || 0,
              nextScheduledFor: r.next_scheduled_for,
              lastScheduledFor: r.last_scheduled_for,
              dueNow,
              dueNextHour
            };
          }
        }
      } catch {
        callQueueSchedule = null;
      }

      res.json({
        ok: true,
        demo: false,
        configured: true,
        followUp: computeFollowUpStats(records, tz),
        dispositions: computeDispositionBreakdown(records, tz),
        queue: { callQueuePending, callQueueDueNow, retryPending, retryDueNow },
        callQueueSchedule,
        topToCall: topToCallFromRows(records, 10, tz)
      });
    } catch (error) {
      console.error('[DAILY SUMMARY ERROR]', error);
      res.status(502).json({ ok: false, error: 'summary_failed', message: error?.message || String(error) });
    }
  });

  return router;
}

