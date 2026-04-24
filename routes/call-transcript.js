/**
 * Core API: call transcript retrieval.
 *
 * GET /api/calls/:callId/transcript?clientKey=...
 */
import { Router } from 'express';

function endedReasonFromCallRow(row) {
  const meta = row?.metadata;
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    const er = meta.endedReason ?? meta.ended_reason ?? meta.endedreason;
    if (typeof er === 'string' && er.trim()) return er.trim();
  }
  return null;
}

function inferCallEndedByFromVapiReason(reason) {
  const r = String(reason || '').toLowerCase();
  if (!r) return { callEndedBy: 'unknown', callEndedByLabel: 'Unknown', endedReasonDetail: null };
  if (r.includes('customer')) return { callEndedBy: 'user', callEndedByLabel: 'User', endedReasonDetail: reason };
  if (r.includes('assistant') || r.includes('agent')) return { callEndedBy: 'ai', callEndedByLabel: 'AI', endedReasonDetail: reason };
  if (r.includes('timeout')) return { callEndedBy: 'timeout', callEndedByLabel: 'Timeout', endedReasonDetail: reason };
  return { callEndedBy: 'other', callEndedByLabel: 'Other', endedReasonDetail: reason };
}

/**
 * @param {{ query: (sql: string, params?: any[]) => Promise<{ rows?: any[] }> }} deps
 */
export function createCallTranscriptRouter(deps) {
  const { query } = deps || {};
  const router = Router();

  router.get('/calls/:callId/transcript', async (req, res) => {
    try {
      const { callId } = req.params;
      const { clientKey } = req.query;

      if (!clientKey) {
        return res.status(400).json({ ok: false, error: 'clientKey required' });
      }
      if (!callId) {
        return res.status(400).json({ ok: false, error: 'callId required' });
      }

      let result = { rows: [] };

      try {
        if (callId && typeof callId === 'string' && callId.length > 10) {
          try {
            result = await query(
              `
              SELECT transcript, summary, duration, created_at, call_id, id, lead_phone, metadata
              FROM calls
              WHERE client_key = $2
                AND call_id = $1
              ORDER BY created_at DESC
              LIMIT 1
            `,
              [callId.trim(), clientKey]
            );

            if (!result.rows || result.rows.length === 0) {
              result = await query(
                `
                SELECT transcript, summary, duration, created_at, call_id, id, lead_phone, metadata
                FROM calls
                WHERE client_key = $2
                  AND LOWER(call_id) = LOWER($1)
                ORDER BY created_at DESC
                LIMIT 1
              `,
                [callId.trim(), clientKey]
              );
            }
          } catch (err) {
            console.error('[TRANSCRIPT QUERY 1 ERROR]', err.message);
          }
        }

        if ((!result.rows || result.rows.length === 0) && callId) {
          const numericId = parseInt(callId, 10);
          if (!isNaN(numericId) && numericId > 0) {
            try {
              result = await query(
                `
                SELECT transcript, summary, duration, created_at, call_id, id, lead_phone, metadata
                FROM calls
                WHERE client_key = $2
                  AND id = $1
                ORDER BY created_at DESC
                LIMIT 1
              `,
                [numericId, clientKey]
              );
            } catch (err) {
              console.error('[TRANSCRIPT QUERY 2 ERROR]', err.message);
            }
          }
        }

        if (!result.rows || result.rows.length === 0) {
          try {
            result = await query(
              `
              SELECT transcript, summary, duration, created_at, call_id, id, lead_phone, metadata
              FROM calls
              WHERE client_key = $2
                AND lead_phone = $1
              ORDER BY created_at DESC
              LIMIT 1
            `,
              [callId, clientKey]
            );
          } catch (err) {
            console.error('[TRANSCRIPT QUERY 3 ERROR]', err.message);
          }
        }
      } catch (queryError) {
        return res.status(500).json({ ok: false, error: `Database query failed: ${queryError.message}` });
      }

      if (!result || !result.rows || result.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Call not found in database or VAPI API' });
      }

      const row = result.rows[0];
      const transcript = row.transcript || row.summary || null;
      const endedReasonRow = endedReasonFromCallRow(row);
      const endedPayload = inferCallEndedByFromVapiReason(endedReasonRow);

      if (!transcript) {
        return res.json({
          ok: true,
          transcript: 'Transcript not available for this call.',
          duration: row.duration,
          timestamp: row.created_at,
          callId: row.call_id,
          dbId: row.id,
          callEndedBy: endedPayload.callEndedBy,
          callEndedByLabel: endedPayload.callEndedByLabel,
          endedReasonDetail: endedPayload.endedReasonDetail || null
        });
      }

      return res.json({
        ok: true,
        transcript: typeof transcript === 'string' ? transcript : JSON.stringify(transcript),
        duration: row.duration,
        timestamp: row.created_at,
        callEndedBy: endedPayload.callEndedBy,
        callEndedByLabel: endedPayload.callEndedByLabel,
        endedReasonDetail: endedPayload.endedReasonDetail || null
      });
    } catch (error) {
      console.error('[TRANSCRIPT ERROR]', error);
      return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
    }
  });

  return router;
}

