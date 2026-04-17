import express from 'express';

export function createCallRecordingsRouter(deps) {
  const { query, formatTimeAgoLabel } = deps || {};
  const router = express.Router();

  router.get('/call-recordings/:clientKey', async (req, res) => {
    try {
      const { clientKey } = req.params;
      res.set('Cache-Control', 'no-store, must-revalidate');
      const limitRaw = parseInt(String(req.query.limit || ''), 10);
      const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 100);

      const [countRes, result] = await Promise.all([
        query(
          `
        SELECT COUNT(*)::int AS n
        FROM calls c
        WHERE c.client_key = $1
          AND c.recording_url IS NOT NULL
          AND TRIM(c.recording_url) <> ''
      `,
          [clientKey]
        ),
        query(
          `
        SELECT
          c.id,
          c.call_id,
          c.lead_phone,
          c.recording_url,
          c.duration,
          c.outcome,
          c.created_at,
          lm.lead_id,
          lm.name
        FROM (
          SELECT id, call_id, client_key, lead_phone, lead_phone_match_key, recording_url, duration, outcome, created_at
          FROM calls
          WHERE client_key = $1
            AND recording_url IS NOT NULL
            AND TRIM(recording_url) <> ''
          ORDER BY created_at DESC
          LIMIT $2
        ) c
        LEFT JOIN LATERAL (
          SELECT l.id AS lead_id, l.name
          FROM leads l
          WHERE l.client_key = c.client_key
            AND (
              (c.lead_phone_match_key IS NOT NULL AND l.phone_match_key = c.lead_phone_match_key)
              OR (l.phone = c.lead_phone)
            )
          ORDER BY
            CASE
              WHEN c.lead_phone_match_key IS NOT NULL AND l.phone_match_key = c.lead_phone_match_key THEN 0
              WHEN l.phone = c.lead_phone THEN 1
              ELSE 2
            END,
            l.created_at DESC NULLS LAST
          LIMIT 1
        ) lm ON true
        ORDER BY c.created_at DESC
      `,
          [clientKey, limit]
        )
      ]);

      const totalWithRecordings = parseInt(countRes.rows?.[0]?.n || 0, 10) || 0;
      const rows = [...(result.rows || [])];

      function vapiDurationSeconds(data) {
        if (data == null) return null;
        if (typeof data.duration === 'number' && data.duration >= 0) return Math.round(data.duration);
        if (data.endedAt && data.startedAt) {
          const ms = new Date(data.endedAt) - new Date(data.startedAt);
          return ms > 0 ? Math.round(ms / 1000) : null;
        }
        return null;
      }
      function vapiCallEnded(data) {
        if (!data) return false;
        const status = (data.status || '').toLowerCase();
        if (['ended', 'completed', 'failed', 'canceled', 'canceled', 'cancelled'].includes(status)) return true;
        if (data.endedReason || data.endedAt) return true;
        return false;
      }

      const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || '';
      const needDuration = rows
        .filter((r) => r.call_id && (!Number(r.duration) || Number(r.duration) <= 0))
        .slice(0, 15);
      if (vapiKey && needDuration.length > 0) {
        await Promise.all(
          needDuration.map(async (r) => {
            try {
              const vRes = await fetch(`https://api.vapi.ai/call/${r.call_id}`, {
                headers: { Authorization: `Bearer ${vapiKey}` }
              });
              if (!vRes.ok) return;
              const data = await vRes.json();
              if (!vapiCallEnded(data)) return;
              const dur = vapiDurationSeconds(data);
              if (dur == null || dur <= 0) return;
              await query(`UPDATE calls SET duration = $1, updated_at = now() WHERE client_key = $2 AND call_id = $3`, [
                dur,
                clientKey,
                r.call_id
              ]);
              const hit = rows.find((x) => x.call_id === r.call_id);
              if (hit) hit.duration = dur;
            } catch (e) {
              console.warn('[CALL RECORDINGS] VAPI duration backfill skipped:', r.call_id, e?.message || e);
            }
          })
        );
      }

      const recordings = rows.map((row) => {
        let dur = Number(row.duration);
        if (Number.isFinite(dur) && dur > 100000 && dur % 1000 === 0) {
          dur = Math.round(dur / 1000);
        }
        if (!Number.isFinite(dur) || dur < 0) dur = 0;
        return {
          id: row.id,
          callId: row.call_id,
          leadId: row.lead_id != null ? row.lead_id : null,
          name: row.name || 'Prospect',
          phone: row.lead_phone,
          recordingUrl: row.recording_url,
          duration: dur,
          outcome: row.outcome || 'completed',
          createdAt: row.created_at,
          timeAgo: formatTimeAgoLabel(row.created_at)
        };
      });

      res.json({
        ok: true,
        recordings,
        totalWithRecordings,
        limit
      });
    } catch (error) {
      console.error('[CALL RECORDINGS ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

