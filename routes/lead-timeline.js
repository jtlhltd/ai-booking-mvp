/**
 * Lead timeline retrieval (calls + appointments + optional SMS events).
 *
 * GET /api/leads/:leadId/timeline?clientKey=...
 */
import { Router } from 'express';
import { normalizePhoneE164 } from '../lib/utils.js';

function phoneVariantsForMatch(phone) {
  const raw = (phone || '').trim();
  if (!raw) return [''];
  const e164 = normalizePhoneE164(raw, 'GB') || raw;
  const digitsRaw = raw.replace(/\D/g, '');
  const digitsE164 = e164.replace(/\D/g, '');
  return [...new Set([raw, e164, digitsRaw, digitsE164].filter((v) => v && String(v).length > 0))];
}

/**
 * @param {{
 *   query: (sql: string, params?: any[]) => Promise<{ rows?: any[], rowCount?: number }>,
 *   timelineVapiAuthKey?: () => string,
 *   fetchVapiCallSnapshotForTimeline?: (callId: string) => Promise<any>,
 *   vapiCallSnapshotToTimelineHints?: (snap: any) => any,
 *   inferTimelinePickupStatus?: (call: any) => { status: string, reason: string },
 *   formatCallDuration?: (duration: any) => string,
 * }} deps
 */
export function createLeadTimelineRouter(deps) {
  const {
    query,
    timelineVapiAuthKey = () => '',
    fetchVapiCallSnapshotForTimeline = async () => null,
    vapiCallSnapshotToTimelineHints = () => ({}),
    inferTimelinePickupStatus = () => ({ status: 'unknown', reason: 'unknown' }),
    formatCallDuration = () => null
  } = deps || {};

  const router = Router();

  router.get('/leads/:leadId/timeline', async (req, res) => {
    try {
      const leadIdRaw = decodeURIComponent(req.params.leadId || '').trim();
      const { clientKey } = req.query;

      if (!clientKey) return res.status(400).json({ ok: false, error: 'clientKey required' });
      if (!leadIdRaw) return res.status(400).json({ ok: false, error: 'leadId required' });

      const leadResult = await query(
        `
        SELECT id, name, phone, created_at, source, client_key
        FROM leads
        WHERE (CAST(id AS TEXT) = $1 OR phone = $1) AND client_key = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
        [leadIdRaw, clientKey]
      );

      if (!leadResult.rows || !leadResult.rows.length) {
        return res.status(404).json({ ok: false, error: 'Lead not found or access denied' });
      }

      const lead = leadResult.rows[0];
      const phoneVars = phoneVariantsForMatch(lead.phone);
      const leadPhoneParamIndex = phoneVars.length > 0 ? phoneVars.length + 2 : 2;
      const callPlaceholders = phoneVars.map((_, i) => `$${i + 2}`).join(', ');
      const inClause = phoneVars.length > 0 ? `c.lead_phone IN (${callPlaceholders})` : 'FALSE';

      const callsResult = await query(
        `
        SELECT c.status,
               c.outcome,
               c.created_at,
               c.duration,
               c.call_id,
               c.recording_url,
               c.sentiment,
               c.quality_score,
               c.retry_attempt,
               LEFT(COALESCE(c.transcript, ''), 320) AS transcript_snippet
        FROM calls c
        WHERE c.client_key = $1
          AND (
            ${inClause}
            OR (
              LENGTH(regexp_replace(COALESCE($${leadPhoneParamIndex}::text, ''), '[^0-9]', '', 'g')) >= 10
              AND RIGHT(regexp_replace(COALESCE(c.lead_phone, ''), '[^0-9]', '', 'g'), 10)
                = RIGHT(regexp_replace(COALESCE($${leadPhoneParamIndex}::text, ''), '[^0-9]', '', 'g'), 10)
            )
          )
        ORDER BY c.created_at ASC
      `,
        phoneVars.length > 0 ? [clientKey, ...phoneVars, lead.phone] : [clientKey, lead.phone]
      );

      const appointmentsResult = await query(
        `
        SELECT start_iso, end_iso, status, created_at
        FROM appointments
        WHERE lead_id = $1 AND client_key = $2
        ORDER BY created_at ASC
      `,
        [lead.id, clientKey]
      );

      let smsRows = { rows: [] };
      try {
        const smsIn1 = phoneVars.map((_, i) => `$${i + 2}`).join(', ');
        const smsIn2 = phoneVars.map((_, i) => `$${i + 2 + phoneVars.length}`).join(', ');
        const smsResult = await query(
          `
          SELECT channel, direction, body, status, created_at
          FROM messages
          WHERE client_key = $1
            AND channel = 'sms'
            AND (
              to_phone IN (${smsIn1})
              OR from_phone IN (${smsIn2})
            )
          ORDER BY created_at ASC
        `,
          [clientKey, ...phoneVars, ...phoneVars]
        );
        smsRows = smsResult;
      } catch (msgErr) {
        console.warn('[TIMELINE] SMS events skipped:', msgErr.message);
      }

      const vapiHintsByCallId = {};
      if (timelineVapiAuthKey() && (callsResult.rows || []).length) {
        const needHydration = (callsResult.rows || []).filter((c) => {
          const st = (c.status || '').toLowerCase();
          if (st !== 'initiated' || !c.call_id) return false;
          return inferTimelinePickupStatus(c).status === 'unknown';
        });
        const maxVapi = 15;
        await Promise.all(
          needHydration.slice(0, maxVapi).map(async (c) => {
            const snap = await fetchVapiCallSnapshotForTimeline(c.call_id);
            const h = vapiCallSnapshotToTimelineHints(snap);
            if (Object.keys(h).length) vapiHintsByCallId[String(c.call_id)] = h;
          })
        );
      }

      const fmtWhen = (d) => {
        const dt = d ? new Date(d) : null;
        if (!dt || Number.isNaN(dt.getTime())) return null;
        return dt.toLocaleString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
      };

      const phoneTail = (() => {
        const d = String(lead.phone || '').replace(/\D/g, '');
        if (d.length >= 4) return d.slice(-4);
        return null;
      })();

      const timeline = [];
      timeline.push({
        event: 'Lead received',
        icon: '📥',
        detail: `Source: ${lead.source || 'import'}${phoneTail ? ` · phone …${phoneTail}` : ''}`,
        subdetail: fmtWhen(lead.created_at),
        time: lead.created_at
      });

      (callsResult.rows || []).forEach((call) => {
        const hints = vapiHintsByCallId[String(call.call_id || '')] || {};
        const merged = { ...call, ...hints };
        const pickup = inferTimelinePickupStatus(merged);
        const durationLabel = formatCallDuration(merged.duration);
        const bits = [pickup.reason];
        if (durationLabel && !pickup.reason.includes(durationLabel)) bits.push(`length ${durationLabel}`);

        timeline.push({
          event: 'Call attempted',
          icon: '📞',
          detail: bits.filter(Boolean).join(' · '),
          subdetail: fmtWhen(call.created_at),
          time: call.created_at
        });
      });

      (appointmentsResult.rows || []).forEach((a) => {
        timeline.push({
          event: 'Appointment',
          icon: '📅',
          detail: `${a.status || 'scheduled'} · ${a.start_iso || ''}`,
          subdetail: fmtWhen(a.created_at),
          time: a.created_at
        });
      });

      (smsRows.rows || []).forEach((m) => {
        timeline.push({
          event: 'SMS',
          icon: '💬',
          detail: `${m.direction || ''} · ${(m.body || '').slice(0, 120)}`,
          subdetail: fmtWhen(m.created_at),
          time: m.created_at
        });
      });

      timeline.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
      return res.json({ ok: true, lead, timeline });
    } catch (err) {
      console.error('[TIMELINE]', err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

