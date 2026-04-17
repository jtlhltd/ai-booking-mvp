import express from 'express';

export function createVoicemailsRouter(deps) {
  const { isPostgres, poolQuerySelect, formatTimeAgoLabel, truncateActivityFeedText } = deps || {};
  const router = express.Router();

  router.get('/voicemails/:clientKey', async (req, res) => {
    try {
      const { clientKey } = req.params;
      res.set('Cache-Control', 'no-store, must-revalidate');
      const limitRaw = parseInt(String(req.query.limit || ''), 10);
      const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200);

      let countRes;
      let result;
      if (isPostgres) {
        [countRes, result] = await Promise.all([
          poolQuerySelect(
            `
        SELECT COUNT(*)::int AS n
        FROM calls c
        WHERE c.client_key = $1
          AND c.recording_url IS NOT NULL
          AND TRIM(c.recording_url) <> ''
          AND LOWER(COALESCE(c.outcome, '')) IN ('voicemail')
      `,
            [clientKey]
          ),
          poolQuerySelect(
            `
        SELECT
          c.id,
          c.call_id,
          c.lead_phone,
          c.recording_url,
          c.duration,
          c.outcome,
          c.created_at,
          c.transcript,
          lm.lead_id,
          lm.name
        FROM (
          SELECT
            id, call_id, client_key, lead_phone, lead_phone_match_key, recording_url, duration, outcome, created_at,
            LEFT(COALESCE(transcript, ''), 512) AS transcript
          FROM calls
          WHERE client_key = $1
            AND recording_url IS NOT NULL
            AND TRIM(recording_url) <> ''
            AND LOWER(COALESCE(outcome, '')) IN ('voicemail')
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
      } else {
        // SQLite: no :: casts, no LATERAL, no regexp_replace — keep phone / phone_match_key matching only.
        [countRes, result] = await Promise.all([
          poolQuerySelect(
            `
        SELECT COUNT(*) AS n
        FROM calls c
        WHERE c.client_key = $1
          AND c.recording_url IS NOT NULL
          AND TRIM(c.recording_url) <> ''
          AND LOWER(COALESCE(c.outcome, '')) = 'voicemail'
      `,
            [clientKey]
          ),
          poolQuerySelect(
            `
        SELECT
          c.id,
          c.call_id,
          c.lead_phone,
          c.recording_url,
          c.duration,
          c.outcome,
          c.created_at,
          SUBSTR(COALESCE(c.transcript, ''), 1, 512) AS transcript,
          (
            SELECT l.id
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
              l.created_at DESC
            LIMIT 1
          ) AS lead_id,
          (
            SELECT l.name
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
              l.created_at DESC
            LIMIT 1
          ) AS name
        FROM calls c
        WHERE c.client_key = $1
          AND c.recording_url IS NOT NULL
          AND TRIM(c.recording_url) <> ''
          AND LOWER(COALESCE(c.outcome, '')) = 'voicemail'
        ORDER BY c.created_at DESC
        LIMIT $2
      `,
            [clientKey, limit]
          )
        ]);
      }

      const totalVoicemails = parseInt(countRes.rows?.[0]?.n || 0, 10) || 0;
      const rows = [...(result.rows || [])];
      const voicemails = rows.map((row) => {
        let dur = Number(row.duration);
        if (Number.isFinite(dur) && dur > 100000 && dur % 1000 === 0) dur = Math.round(dur / 1000);
        if (!Number.isFinite(dur) || dur < 0) dur = 0;
        return {
          id: row.id,
          callId: row.call_id,
          leadId: row.lead_id != null ? row.lead_id : null,
          name: row.name || 'Prospect',
          phone: row.lead_phone,
          recordingUrl: row.recording_url,
          duration: dur,
          outcome: row.outcome || 'voicemail',
          createdAt: row.created_at,
          timeAgo: formatTimeAgoLabel(row.created_at),
          transcriptPreview: truncateActivityFeedText(row.transcript, 240) || null
        };
      });

      res.json({
        ok: true,
        voicemails,
        totalVoicemails,
        limit
      });
    } catch (error) {
      console.error('[VOICEMAIL LISTENER ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

