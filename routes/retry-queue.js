import express from 'express';
import { updateRetryStatus } from '../db.js';

export function createRetryQueueRouter(deps) {
  const {
    poolQuerySelect,
    query,
    getFullClient,
    fetchLeadNamesForRetryQueuePhones,
    effectiveDialScheduledForApiDisplay,
    resolveLogisticsSpreadsheetId,
    sheets
  } = deps || {};

  const router = express.Router();

  router.get('/retry-queue/:clientKey', async (req, res) => {
    try {
      const { clientKey } = req.params;
      res.set('Cache-Control', 'no-store');

      const RETRY_QUEUE_LIST_CAP = 500;

      const includeAllStatuses = String(req.query?.includeAllStatuses || '').trim() === '1';
      const retryStatusWhere = includeAllStatuses
        ? `rq.status IN ('pending','failed','cancelled')`
        : `rq.status = 'pending'`;

      const listUnionSql = `
      SELECT * FROM (
        SELECT
          rq.id,
          rq.lead_phone,
          rq.retry_type,
          rq.retry_reason,
          rq.scheduled_for,
          rq.retry_attempt,
          rq.max_retries,
          rq.status,
          'retry_queue' AS source
        FROM retry_queue rq
        WHERE rq.client_key = $1 AND ${retryStatusWhere}
        UNION ALL
        SELECT
          cq.id,
          cq.lead_phone,
          cq.call_type AS retry_type,
          'call_queue' AS retry_reason,
          cq.scheduled_for,
          0 AS retry_attempt,
          1 AS max_retries,
          cq.status,
          'call_queue' AS source
        FROM call_queue cq
        WHERE cq.client_key = $1
          AND cq.status = 'pending'
          AND cq.call_type = 'vapi_call'
      ) combined
      ORDER BY combined.scheduled_for ASC NULLS LAST
      LIMIT $2
    `;

      const listRetryOnlySql = `
      SELECT
        rq.id,
        rq.lead_phone,
        rq.retry_type,
        rq.retry_reason,
        rq.scheduled_for,
        rq.retry_attempt,
        rq.max_retries,
        rq.status,
        'retry_queue' AS source
      FROM retry_queue rq
      WHERE rq.client_key = $1 AND ${retryStatusWhere}
      ORDER BY rq.scheduled_for ASC NULLS LAST
      LIMIT $2
    `;

      const [countRes, listRes] = await Promise.all([
        poolQuerySelect(
          `
        SELECT
          (SELECT COUNT(*) FROM retry_queue rq
            WHERE rq.client_key = $1 AND rq.status = 'pending') AS rq_pending,
          (SELECT COUNT(*) FROM retry_queue rq
            WHERE rq.client_key = $1 AND rq.status = 'failed') AS rq_failed,
          (SELECT COUNT(*) FROM retry_queue rq
            WHERE rq.client_key = $1 AND rq.status = 'cancelled') AS rq_cancelled,
          (SELECT COUNT(*) FROM call_queue cq
            WHERE cq.client_key = $1
              AND cq.status = 'pending'
              AND cq.call_type = 'vapi_call') AS cq_pending
      `,
          [clientKey]
        ),
        poolQuerySelect(listUnionSql, [clientKey, RETRY_QUEUE_LIST_CAP]).catch((unionErr) => {
          console.warn(
            '[RETRY QUEUE API] combined list failed, falling back to retry_queue only:',
            unionErr?.message || unionErr
          );
          return poolQuerySelect(listRetryOnlySql, [clientKey, RETRY_QUEUE_LIST_CAP]);
        })
      ]);

      const rqTotal = parseInt(countRes.rows?.[0]?.rq_pending || 0, 10);
      const rqFailed = parseInt(countRes.rows?.[0]?.rq_failed || 0, 10);
      const rqCancelled = parseInt(countRes.rows?.[0]?.rq_cancelled || 0, 10);
      const cqTotal = parseInt(countRes.rows?.[0]?.cq_pending || 0, 10);
      const totalPending = rqTotal + cqTotal;
      const rawRows = listRes.rows || [];
      let nameByPhone = new Map();
      try {
        nameByPhone = await fetchLeadNamesForRetryQueuePhones(
          clientKey,
          rawRows.map((r) => r.lead_phone)
        );
      } catch (nameErr) {
        console.warn(
          '[RETRY QUEUE API] lead name lookup failed (continuing without names):',
          nameErr?.message || nameErr
        );
      }
      const tenant = await getFullClient(clientKey).catch(() => null);

      const retryKindLabel = (source, retryType) => {
        const isCallQueue = source === 'call_queue';
        if (isCallQueue) return 'Outbound call';
        const t = String(retryType || '').toLowerCase().trim();
        if (t === 'vapi_call' || t === 'call') return 'Voice retry';
        if (t === 'sheet_patch') return 'Sheet write';
        if (t === 'sms') return 'SMS follow-up';
        if (t === 'email') return 'Email follow-up';
        if (!t) return 'Follow-up';
        return t.replace(/_/g, ' ');
      };

      const mapRow = (row) => {
        const sched = effectiveDialScheduledForApiDisplay(row, tenant);
        const schedOk = sched && !Number.isNaN(sched.getTime());
        const isCallQueue = row.source === 'call_queue';
        const retryTypeLower = String(row.retry_type || '').toLowerCase().trim();
        const status = String(row.status || '').toLowerCase().trim();
        const retryDataObj = (() => {
          const raw = row.retry_data;
          if (!raw) return null;
          if (typeof raw === 'object') return raw;
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        })();
        const errorMsg =
          retryDataObj && typeof retryDataObj.error === 'string' && retryDataObj.error.trim()
            ? retryDataObj.error.trim()
            : '';
        const nextRetryShort = schedOk
          ? sched.toLocaleString('en-GB', {
              weekday: 'short',
              hour: 'numeric',
              minute: '2-digit'
            })
          : 'Scheduled';
        const nextRetryLong = schedOk
          ? sched.toLocaleString('en-GB', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            })
          : '';
        return {
          id: isCallQueue ? `cq-${row.id}` : `rq-${row.id}`,
          dbId: row.id,
          source: row.source,
          status,
          sourceLabel: isCallQueue ? 'Call queue' : 'Retry queue',
          retryType: row.retry_type || null,
          kindLabel: retryKindLabel(row.source, row.retry_type),
          name:
            (row.lead_phone != null && nameByPhone.has(row.lead_phone)
              ? nameByPhone.get(row.lead_phone)
              : null) || 'Prospect',
          phone: row.lead_phone,
          attempts: isCallQueue ? 0 : row.retry_attempt,
          maxAttempts: isCallQueue ? 1 : row.max_retries,
          reason: isCallQueue
            ? 'Outbound call queued'
            : retryTypeLower === 'sheet_patch'
              ? `Sheet write ${status || 'pending'}${row.retry_reason ? ` · ${row.retry_reason}` : ''}${errorMsg ? ` · ${errorMsg}` : ''}`
              : typeof row.retry_reason === 'string' && row.retry_reason.startsWith('follow_up_')
                ? 'Follow-up call scheduled'
                : row.retry_reason || 'Scheduled follow-up',
          scheduledFor: schedOk ? sched.toISOString() : null,
          nextRetry: nextRetryShort,
          nextRetryLong
        };
      };

      const merged = rawRows.map(mapRow);
      merged.sort((a, b) => {
        const ta = a.scheduledFor ? new Date(a.scheduledFor).getTime() : Number.POSITIVE_INFINITY;
        const tb = b.scheduledFor ? new Date(b.scheduledFor).getTime() : Number.POSITIVE_INFINITY;
        return ta - tb;
      });
      const truncated = totalPending > merged.length;

      res.json({
        ok: true,
        retries: merged,
        listCap: RETRY_QUEUE_LIST_CAP,
        previewLimit: RETRY_QUEUE_LIST_CAP,
        shown: merged.length,
        totalPending,
        totalInWindow: totalPending,
        truncated,
        retryQueuePending: rqTotal,
        retryQueueFailed: rqFailed,
        retryQueueCancelled: rqCancelled,
        callQueuePending: cqTotal,
        retryQueuePending7d: rqTotal,
        callQueuePending7d: cqTotal
      });
    } catch (error) {
      console.error('[RETRY QUEUE ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/retry-queue/:clientKey/run', async (req, res) => {
    try {
      const { clientKey } = req.params;
      const { id } = req.body || {};
      const dbId = parseInt(id, 10);
      if (!Number.isFinite(dbId)) return res.status(400).json({ ok: false, error: 'invalid_id' });

      const rowRes = await query(`SELECT * FROM retry_queue WHERE client_key = $1 AND id = $2`, [
        clientKey,
        dbId
      ]);
      const retry = rowRes.rows?.[0];
      if (!retry) return res.status(404).json({ ok: false, error: 'not_found' });

      await updateRetryStatus(dbId, 'processing');
      if (String(retry.retry_type || '').toLowerCase() === 'sheet_patch') {
        const retryData = (() => {
          const raw = retry.retry_data;
          if (!raw) return {};
          if (typeof raw === 'object') return raw;
          try {
            return JSON.parse(raw);
          } catch {
            return {};
          }
        })();
        const client = await getFullClient(clientKey);
        const spreadsheetId = resolveLogisticsSpreadsheetId(client);
        if (!spreadsheetId) throw new Error('sheet_not_configured');
        const rowNumber = parseInt(retryData.rowNumber, 10);
        const patch = retryData.patch;
        if (!Number.isFinite(rowNumber) || !patch || typeof patch !== 'object') {
          throw new Error('invalid_retry_data');
        }
        const ok = await sheets.patchLogisticsRowByNumber(spreadsheetId, rowNumber, patch);
        if (!ok) throw new Error('sheet_patch_failed');
      } else {
        throw new Error('unsupported_retry_type');
      }

      await updateRetryStatus(dbId, 'completed');
      res.json({ ok: true });
    } catch (error) {
      try {
        const dbId = parseInt(req.body?.id, 10);
        if (Number.isFinite(dbId)) await updateRetryStatus(dbId, 'failed');
      } catch {
        /* status update best-effort */
      }
      res
        .status(500)
        .json({ ok: false, error: 'retry_run_failed', message: error?.message || String(error) });
    }
  });

  router.post('/retry-queue/:clientKey/cancel', async (req, res) => {
    try {
      const { clientKey } = req.params;
      const { id } = req.body || {};
      const dbId = parseInt(id, 10);
      if (!Number.isFinite(dbId)) return res.status(400).json({ ok: false, error: 'invalid_id' });
      await query(`UPDATE retry_queue SET status = 'cancelled', updated_at = NOW() WHERE client_key = $1 AND id = $2`, [
        clientKey,
        dbId
      ]);
      res.json({ ok: true });
    } catch (error) {
      res
        .status(500)
        .json({ ok: false, error: 'retry_cancel_failed', message: error?.message || String(error) });
    }
  });

  router.post('/retry-queue/:clientKey/requeue', async (req, res) => {
    try {
      const { clientKey } = req.params;
      const { id } = req.body || {};
      const dbId = parseInt(id, 10);
      if (!Number.isFinite(dbId)) return res.status(400).json({ ok: false, error: 'invalid_id' });
      await query(
        `UPDATE retry_queue SET status = 'pending', scheduled_for = NOW(), updated_at = NOW() WHERE client_key = $1 AND id = $2`,
        [clientKey, dbId]
      );
      res.json({ ok: true });
    } catch (error) {
      res
        .status(500)
        .json({ ok: false, error: 'retry_requeue_failed', message: error?.message || String(error) });
    }
  });

  router.post('/retry-queue/:clientKey/delete', async (req, res) => {
    try {
      const { clientKey } = req.params;
      const { id } = req.body || {};
      const dbId = parseInt(id, 10);
      if (!Number.isFinite(dbId)) return res.status(400).json({ ok: false, error: 'invalid_id' });
      await query(`DELETE FROM retry_queue WHERE client_key = $1 AND id = $2`, [clientKey, dbId]);
      res.json({ ok: true });
    } catch (error) {
      res
        .status(500)
        .json({ ok: false, error: 'retry_delete_failed', message: error?.message || String(error) });
    }
  });

  return router;
}

