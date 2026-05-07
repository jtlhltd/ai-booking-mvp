import express from 'express';

export function createLeadHandoffRouter(deps) {
  const {
    listLeadHandoff,
    getLeadHandoffByPhone,
    setLeadHandoffOperatorNotes,
    phoneMatchKey,
  } = deps || {};

  const router = express.Router();

  function parseDataJson(v) {
    if (!v) return null;
    if (typeof v === 'object') return v;
    const s = String(v || '').trim();
    if (!s) return null;
    try { return JSON.parse(s); } catch { return null; }
  }

  /** Surfaces `data.sequence.stages` on `qual._sequenceStages` for dashboard/API consumers. */
  function enrichHandoffRow(row) {
    if (!row || typeof row !== 'object') return row;
    const raw = row.dataJson ?? row.data_json;
    if (raw == null) return row;
    const data = typeof raw === 'object' ? raw : parseDataJson(raw);
    if (!data || typeof data !== 'object') return row;
    const stages = Array.isArray(data.sequence?.stages) ? data.sequence.stages : [];
    if (!stages.length) return row;
    const baseQual = data.qual && typeof data.qual === 'object' ? { ...data.qual } : {};
    if (Array.isArray(baseQual._sequenceStages) && baseQual._sequenceStages.length) return row;
    const nextData = {
      ...data,
      qual: { ...baseQual, _sequenceStages: stages }
    };
    const out = { ...row };
    if (typeof raw === 'object') {
      out.dataJson = nextData;
      if ('data_json' in row) out.data_json = nextData;
    } else {
      const ser = JSON.stringify(nextData);
      out.dataJson = ser;
      if ('data_json' in row) out.data_json = ser;
    }
    return out;
  }

  function csvEscapeCell(v) {
    const s = v == null ? '' : String(v);
    const needs = /[",\r\n]/.test(s);
    const escaped = s.replace(/"/g, '""');
    return needs ? `"${escaped}"` : escaped;
  }

  function toCsv(headers, rows) {
    const head = headers.map(csvEscapeCell).join(',');
    const body = rows.map((r) => headers.map((h) => csvEscapeCell(r[h] ?? '')).join(','));
    return [head, ...body].join('\r\n');
  }

  router.get('/handoff/:clientKey', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { clientKey } = req.params;
      const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 120));
      const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
      const rows = (await listLeadHandoff?.({ clientKey, limit, offset })) || [];
      const enriched = rows.map((r) => enrichHandoffRow(r));
      res.json({ ok: true, clientKey, total: enriched.length, offset, limit, rows: enriched });
    } catch (error) {
      console.error('[HANDOFF LIST ERROR]', error);
      res.status(500).json({ ok: false, error: 'handoff_list_failed', message: error?.message || String(error) });
    }
  });

  router.get('/handoff/:clientKey/export.csv', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { clientKey } = req.params;
      const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 500));
      const rows = (await listLeadHandoff?.({ clientKey, limit, offset: 0 })) || [];

      const out = rows.map((r) => {
        const data = parseDataJson(r.dataJson || r.data_json) || {};
        const qual = data?.qual || data?.qualification || data || {};
        const seqStages = data?.sequence?.stages || qual._sequenceStages || [];
        const stagesCompletedJoined = Array.isArray(seqStages)
          ? seqStages.map((s) => (s && s.stageId) || '').filter(Boolean).join(' | ')
          : '';
        return {
          'updatedAt': r.updatedAt || r.updated_at || '',
          'leadPhone': r.leadPhone || r.lead_phone || '',
          'decisionMaker': r.decisionMaker || r.decision_maker || '',
          'callbackWindow': r.callbackWindow || r.callback_window || '',
          'summaryText': r.summaryText || r.summary_text || '',
          'Stages Completed': stagesCompletedJoined,
          'lane': qual.lane || '',
          'origin': qual.origin || qual.originCity || '',
          'destination': qual.destination || qual.destinationCity || '',
          'volume': qual.volume || qual.volumePerWeek || qual.shipmentsPerWeek || '',
          'equipment': qual.equipment || qual.vehicle || '',
          'timeline': qual.timeline || qual.timing || '',
          'painPoints': Array.isArray(qual.painPoints) ? qual.painPoints.join('; ') : (qual.painPoints || ''),
          'authority': qual.authority || qual.decisionAuthority || '',
          'callbackPreference': qual.callbackPreference || qual.followUpPreference || '',
        };
      });

      const headers = [
        'updatedAt',
        'leadPhone',
        'decisionMaker',
        'callbackWindow',
        'summaryText',
        'Stages Completed',
        'lane',
        'origin',
        'destination',
        'volume',
        'equipment',
        'timeline',
        'painPoints',
        'authority',
        'callbackPreference',
      ];

      const csv = toCsv(headers, out);
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="lead-handoff-${clientKey}.csv"`);
      res.send(csv);
    } catch (error) {
      console.error('[HANDOFF EXPORT ERROR]', error);
      res.status(500).json({ ok: false, error: 'handoff_export_failed', message: error?.message || String(error) });
    }
  });

  router.get('/handoff/:clientKey/phone/:phone', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { clientKey, phone } = req.params;
      const row = await getLeadHandoffByPhone?.({ clientKey, leadPhone: phone });
      res.json({ ok: true, clientKey, phone, row: row ? enrichHandoffRow(row) : null });
    } catch (error) {
      console.error('[HANDOFF GET ERROR]', error);
      res.status(500).json({ ok: false, error: 'handoff_get_failed', message: error?.message || String(error) });
    }
  });

  router.post('/handoff/:clientKey/batch', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { clientKey } = req.params;
      const phones = Array.isArray(req.body?.phones) ? req.body.phones : [];
      const unique = Array.from(new Set(phones.map((p) => String(p || '').trim()).filter(Boolean))).slice(0, 250);
      const out = {};
      for (const p of unique) {
        const row = await getLeadHandoffByPhone?.({ clientKey, leadPhone: p });
        if (row) {
          const er = enrichHandoffRow(row);
          out[p] = er;
          if (typeof phoneMatchKey === 'function') {
            const mk = phoneMatchKey(p);
            if (mk) out[mk] = er;
          }
        }
      }
      res.json({ ok: true, clientKey, count: unique.length, items: out });
    } catch (error) {
      console.error('[HANDOFF BATCH ERROR]', error);
      res.status(500).json({ ok: false, error: 'handoff_batch_failed', message: error?.message || String(error) });
    }
  });

  router.post('/handoff/:clientKey/phone/:phone/notes', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { clientKey, phone } = req.params;
      const notes = String(req.body?.operatorNotes || '').trim();
      await setLeadHandoffOperatorNotes?.({ clientKey, leadPhone: phone, operatorNotes: notes });
      res.json({ ok: true });
    } catch (error) {
      console.error('[HANDOFF NOTES ERROR]', error);
      res.status(500).json({ ok: false, error: 'handoff_notes_failed', message: error?.message || String(error) });
    }
  });

  return router;
}

