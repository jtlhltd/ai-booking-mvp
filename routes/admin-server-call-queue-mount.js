import { Router } from 'express';

/**
 * Legacy admin call-queue endpoints mounted at `/admin/*` (moved from server.js).
 *
 * NOTE: These are NOT the same URLs as `routes/admin-call-queue.js` (which mounts under `/api/admin/...`).
 */
export function createAdminServerCallQueueRouter(deps) {
  const {
    listFullClients,
    query,
    dbType,
    loadDb,
    getApiKey,
  } = deps || {};

  const router = Router();

  function requireAdminKey(req, res) {
    const apiKey = req.get('X-API-Key');
    const expected = typeof getApiKey === 'function' ? getApiKey() : process.env.API_KEY;
    if (!apiKey || apiKey !== expected) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
    return true;
  }

  // Admin endpoint to get call queue status
  router.get('/admin/call-queue', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;

      const db = typeof loadDb === 'function' ? await loadDb() : await import('../db.js');
      const { getPendingCalls, getCallQueueByTenant } = db;

      // Get pending calls
      const pendingCalls = await getPendingCalls(100);

      // Get queue by tenant
      const tenants = await listFullClients();
      const queueByTenant = {};

      for (const tenant of tenants) {
         
        const tenantQueue = await getCallQueueByTenant(tenant.clientKey, 50);
        queueByTenant[tenant.clientKey] = {
          displayName: tenant.displayName,
          queue: tenantQueue,
        };
      }

      console.log('[CALL QUEUE STATUS]', {
        pendingCount: pendingCalls.length,
        tenantCount: Object.keys(queueByTenant).length,
        requestedBy: req.ip,
      });

      res.json({
        ok: true,
        pendingCalls,
        queueByTenant,
        summary: {
          totalPending: pendingCalls.length,
          tenantsWithQueue: Object.keys(queueByTenant).filter((key) => queueByTenant[key].queue.length > 0).length,
          lastUpdated: new Date().toISOString(),
        },
      });
    } catch (e) {
      console.error('[CALL QUEUE STATUS ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // Admin endpoint to clear pending call queue (optional: by clientKey and/or leadPhone)
  router.post('/admin/clear-call-queue', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;

      const db = typeof loadDb === 'function' ? await loadDb() : await import('../db.js');
      const { clearCallQueue } = db;

      const { clientKey, leadPhone } = req.body || {};
      const deleted = await clearCallQueue({ clientKey, leadPhone });
      console.log('[CALL QUEUE CLEAR]', {
        clientKey: clientKey || 'all',
        leadPhone: leadPhone || 'all',
        deleted,
      });
      res.json({ ok: true, deleted, message: `Cleared ${deleted} pending call(s).` });
    } catch (e) {
      console.error('[CALL QUEUE CLEAR ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // Admin endpoint to pull pending call_queue items forward to "due now" (optional: by clientKey).
  // Useful when backlog was scheduled into future windows due to earlier config bugs or downtime.
  router.post('/admin/pull-forward-call-queue', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;

      if (dbType !== 'postgres') {
        return res.status(400).json({ ok: false, error: 'unsupported_db', message: 'pull-forward requires Postgres' });
      }

      const clientKey = String(req.body?.clientKey || '').trim();
      const limitRaw = parseInt(req.body?.limit, 10);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(5000, limitRaw)) : 500;

      const params = [];
      let idx = 1;
      let where = `cq.call_type = 'vapi_call' AND cq.status = 'pending'`;
      if (clientKey) {
        where += ` AND cq.client_key = $${idx++}`;
        params.push(clientKey);
      }
      where += ` AND cq.scheduled_for > NOW() AND cq.scheduled_for <= NOW() + INTERVAL '48 hours'`;
      params.push(limit);

      const { rowCount } = await query(
        `
        WITH picked AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY scheduled_for ASC, id ASC) AS rn
          FROM call_queue cq
          WHERE ${where}
          LIMIT $${idx}
        )
        UPDATE call_queue cq
        SET scheduled_for = NOW() - INTERVAL '1 second' + picked.rn * INTERVAL '1 millisecond',
            updated_at = NOW()
        FROM picked
        WHERE cq.id = picked.id
        `,
        params,
      );

      console.log('[CALL QUEUE PULL FORWARD]', { clientKey: clientKey || 'all', limit, pulled: rowCount || 0 });
      res.json({ ok: true, pulled: rowCount || 0 });
    } catch (e) {
      console.error('[CALL QUEUE PULL FORWARD ERROR]', e?.message || String(e));
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // Admin endpoint to delete leads by filter (safety valve for bad imports).
  // NOTE: This is intentionally admin-only (X-API-Key) and requires a createdAfter timestamp.
  router.post('/admin/purge-leads', async (req, res) => {
    try {
      if (!requireAdminKey(req, res)) return;

      const { clientKey, createdAfter, createdBefore, source, service } = req.body || {};
      if (!clientKey || typeof clientKey !== 'string' || !clientKey.trim()) {
        return res.status(400).json({ ok: false, error: 'clientKey is required' });
      }
      if (!createdAfter || typeof createdAfter !== 'string') {
        return res.status(400).json({ ok: false, error: 'createdAfter (ISO string) is required' });
      }

      const after = new Date(createdAfter);
      if (!Number.isFinite(after.getTime())) {
        return res.status(400).json({ ok: false, error: 'createdAfter must be a valid ISO timestamp' });
      }
      const before = createdBefore ? new Date(createdBefore) : null;
      if (before && !Number.isFinite(before.getTime())) {
        return res.status(400).json({ ok: false, error: 'createdBefore must be a valid ISO timestamp' });
      }

      const params = [clientKey.trim(), after.toISOString()];
      let idx = 3;
      const where = [
        'client_key = $1',
        'created_at >= $2',
      ];
      if (before) {
        where.push(`created_at <= $${idx}`);
        params.push(before.toISOString());
        idx += 1;
      }
      if (source && typeof source === 'string' && source.trim()) {
        where.push(`source = $${idx}`);
        params.push(source.trim());
        idx += 1;
      }
      if (service && typeof service === 'string' && service.trim()) {
        where.push(`service = $${idx}`);
        params.push(service.trim());
        idx += 1;
      }

      const countRes = await query(
        `SELECT COUNT(*)::int AS n FROM leads WHERE ${where.join(' AND ')}`,
        params,
      );
      const toDelete = Number(countRes.rows?.[0]?.n ?? 0) || 0;

      await query(
        `DELETE FROM leads WHERE ${where.join(' AND ')}`,
        params,
      );

      console.log('[ADMIN PURGE LEADS]', {
        clientKey,
        createdAfter: after.toISOString(),
        createdBefore: before ? before.toISOString() : null,
        source: source || null,
        service: service || null,
        deleted: toDelete,
      });

      return res.json({
        ok: true,
        deleted: toDelete,
        message: `Deleted ${toDelete} lead(s).`,
      });
    } catch (e) {
      console.error('[ADMIN PURGE LEADS ERROR]', e?.message || String(e));
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  return router;
}

