import express from 'express';

export function createLeadHandoffRouter(deps) {
  const {
    listLeadHandoff,
    getLeadHandoffByPhone,
    setLeadHandoffOperatorNotes,
    phoneMatchKey,
  } = deps || {};

  const router = express.Router();

  router.get('/handoff/:clientKey', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { clientKey } = req.params;
      const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 120));
      const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
      const rows = (await listLeadHandoff?.({ clientKey, limit, offset })) || [];
      res.json({ ok: true, clientKey, total: rows.length, offset, limit, rows });
    } catch (error) {
      console.error('[HANDOFF LIST ERROR]', error);
      res.status(500).json({ ok: false, error: 'handoff_list_failed', message: error?.message || String(error) });
    }
  });

  router.get('/handoff/:clientKey/phone/:phone', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { clientKey, phone } = req.params;
      const row = await getLeadHandoffByPhone?.({ clientKey, leadPhone: phone });
      res.json({ ok: true, clientKey, phone, row });
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
          out[p] = row;
          if (typeof phoneMatchKey === 'function') {
            const mk = phoneMatchKey(p);
            if (mk) out[mk] = row;
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

