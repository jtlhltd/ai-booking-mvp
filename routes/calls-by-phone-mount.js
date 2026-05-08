import express from 'express';
import { createCallsDomain } from '../db/domains/calls.js';
import { extractLogisticsFields } from '../lib/logistics-extractor.js';

export function createCallsByPhoneRouter(deps) {
  const { query, getFullClient } = deps || {};
  const router = express.Router();
  const callsDomain = createCallsDomain({ query, getCallAnalyticsFloorIso: null });

  function safeParseJsonObject(v) {
    if (!v) return null;
    if (typeof v === 'object') return v;
    const s = String(v || '').trim();
    if (!s) return null;
    try {
      const parsed = JSON.parse(s);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function clampInt(n, lo, hi, fallback) {
    const v = parseInt(String(n), 10);
    if (!Number.isFinite(v)) return fallback;
    return Math.max(lo, Math.min(hi, v));
  }

  router.get('/calls/:clientKey/phone/:phone', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { clientKey, phone } = req.params;
      const client = await getFullClient?.(clientKey, { bypassCache: false }).catch(() => null);
      if (!client) return res.status(404).json({ ok: false, error: 'client_not_found' });

      const limit = clampInt(req.query.limit, 1, 100, 25);
      const leadPhone = String(phone || '').trim();
      const leadDigits = leadPhone.replace(/\D+/g, '');
      const includeExtract = String(req.query.includeExtract || '').trim() === '1';
      const rows = (includeExtract && typeof callsDomain.getCallsByPhoneLooseWithFullTranscript === 'function')
        ? await callsDomain.getCallsByPhoneLooseWithFullTranscript(clientKey, leadPhone, leadDigits, limit)
        : (typeof callsDomain.getCallsByPhoneLoose === 'function'
            ? await callsDomain.getCallsByPhoneLoose(clientKey, leadPhone, leadDigits, limit)
            : await callsDomain.getCallsByPhone(clientKey, leadPhone, limit));

      const calls = (rows || []).map((r) => ({
        callId: r.call_id || r.callId || null,
        leadPhone: r.lead_phone || r.leadPhone || leadPhone,
        status: r.status || null,
        outcome: r.outcome || null,
        duration: r.duration != null ? Number(r.duration) : null,
        cost: r.cost != null ? Number(r.cost) : null,
        retryAttempt: r.retry_attempt != null ? Number(r.retry_attempt) : null,
        transcriptSnippet: r.transcript || null,
        recordingUrl: r.recording_url || r.recordingUrl || null,
        metadata: safeParseJsonObject(r.metadata) || (r.metadata && typeof r.metadata === 'object' ? r.metadata : null),
        extracted: includeExtract ? extractLogisticsFields(r.transcript || '') : undefined,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : (r.createdAt ? new Date(r.createdAt).toISOString() : null),
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : (r.updatedAt ? new Date(r.updatedAt).toISOString() : null),
      }));

      return res.json({ ok: true, clientKey, phone: leadPhone, limit, calls });
    } catch (error) {
      console.error('[CALLS BY PHONE ERROR]', error);
      return res.status(500).json({ ok: false, error: 'calls_by_phone_failed', message: error?.message || String(error) });
    }
  });

  return router;
}

