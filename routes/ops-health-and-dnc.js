import express from 'express';

export function createOpsHealthAndDncRouter(deps) {
  const {
    getFullClient,
    resolveLogisticsSpreadsheetId,
    listOptOutList,
    upsertOptOut,
    deactivateOptOut,
    query,
    dbType,
    DB_PATH,
    authenticateApiKey,
    requireTenantAccessOrAdmin
  } = deps || {};

  const router = express.Router();
  const auth = authenticateApiKey;
  const tenant = requireTenantAccessOrAdmin;
  if (typeof auth !== 'function' || typeof tenant !== 'function') {
    throw new Error(
      'createOpsHealthAndDncRouter: authenticateApiKey and requireTenantAccessOrAdmin are required'
    );
  }

  router.get('/ops/health/:clientKey', auth, tenant, async (req, res) => {
    try {
      const { clientKey } = req.params;
      res.set('Cache-Control', 'no-store');
      const client = await getFullClient(clientKey);
      const spreadsheetId = resolveLogisticsSpreadsheetId(client);
      const dncRows = await listOptOutList({ clientKey, activeOnly: true, limit: 1 }).catch(() => []);
      const dncCountResult = await (async () => {
        try {
          const r = await query(
            dbType === 'sqlite'
              ? `SELECT COUNT(*) AS n FROM opt_out_list WHERE active = 1 AND client_key = $1`
              : `SELECT COUNT(*) AS n FROM opt_out_list WHERE active = TRUE AND client_key = $1`,
            [clientKey]
          );
          const n = parseInt(r.rows?.[0]?.n ?? r.rows?.[0]?.count ?? '0', 10);
          return Number.isFinite(n) ? n : 0;
        } catch {
          return dncRows.length ? 1 : 0;
        }
      })();

      res.json({
        ok: true,
        db: { type: dbType || 'sqlite', path: DB_PATH },
        sheet: { configured: !!spreadsheetId },
        dnc: { activeCount: dncCountResult },
        lastErrors: {
          followUpPatch: globalThis.__opsLastFollowUpPatchError || null
        }
      });
    } catch (error) {
      res
        .status(500)
        .json({ ok: false, error: 'ops_health_failed', message: error?.message || String(error) });
    }
  });

  router.get('/dnc/list', auth, tenant, async (req, res) => {
    try {
      const { clientKey = '', q = '', active = '1', limit = '100', offset = '0' } = req.query || {};
      const ck = String(clientKey || '').trim();
      if (!ck) {
        return res
          .status(400)
          .json({ ok: false, error: 'client_key_required', message: 'clientKey is required' });
      }
      const rows = await listOptOutList({
        clientKey: ck,
        q: String(q || ''),
        activeOnly: String(active) !== '0',
        limit: parseInt(limit, 10) || 100,
        offset: parseInt(offset, 10) || 0
      });
      res.json({ ok: true, rows });
    } catch (error) {
      res.status(500).json({ ok: false, error: 'dnc_list_failed', message: error?.message || String(error) });
    }
  });

  router.post('/dnc/add', auth, tenant, async (req, res) => {
    try {
      const { clientKey = '', phone, reason, notes } = req.body || {};
      const ck = String(clientKey || '').trim();
      if (!ck) {
        return res
          .status(400)
          .json({ ok: false, error: 'client_key_required', message: 'clientKey is required' });
      }
      const out = await upsertOptOut({ clientKey: ck, phone, reason, notes });
      res.json({ ok: true, phone: out.phone });
    } catch (error) {
      const code = error?.code || 'dnc_add_failed';
      res
        .status(code === 'invalid_phone' ? 400 : 500)
        .json({ ok: false, error: code, message: error?.message || String(error) });
    }
  });

  router.post('/dnc/remove', auth, tenant, async (req, res) => {
    try {
      const { clientKey = '', phone } = req.body || {};
      const ck = String(clientKey || '').trim();
      if (!ck) {
        return res
          .status(400)
          .json({ ok: false, error: 'client_key_required', message: 'clientKey is required' });
      }
      const out = await deactivateOptOut({ clientKey: ck, phone });
      res.json({ ok: true, phone: out.phone });
    } catch (error) {
      const code = error?.code || 'dnc_remove_failed';
      res
        .status(code === 'invalid_phone' ? 400 : 500)
        .json({ ok: false, error: code, message: error?.message || String(error) });
    }
  });

  return router;
}

