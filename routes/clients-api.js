/**
 * Clients API (DB-backed).
 * Mounted at /api/clients.
 */
import { Router } from 'express';
import { cacheMiddleware } from '../lib/cache.js';
import { authenticateApiKey, requireTenantAccess } from '../middleware/security.js';

const ADMIN_CLIENT_LIST_DEFAULT = 500;
const ADMIN_CLIENT_LIST_MAX = 500;
const ADMIN_CLIENT_LIST_OFFSET_MAX = 500000;

function clampAdminClientListInt(raw, min, max, fallback) {
  const n = parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * @param {{
 *  listFullClients: () => Promise<any[]>,
 *  getFullClient: (clientKey: string) => Promise<any>,
 *  upsertFullClient: (client: any) => Promise<any>,
 *  deleteClient: (clientKey: string) => Promise<{ changes?: number }>,
 *  pickTimezone: (client: any) => string,
 *  isDashboardSelfServiceClient: (clientKey: string) => boolean,
 * }} deps
 */
export function createClientsApiRouter(deps) {
  const {
    listFullClients,
    getFullClient,
    upsertFullClient,
    deleteClient,
    pickTimezone,
    isDashboardSelfServiceClient
  } = deps || {};

  const router = Router();

  router.use(authenticateApiKey);

  function isAdminKey(req) {
    const perms = Array.isArray(req.apiKey?.permissions) ? req.apiKey.permissions : [];
    return perms.includes('*') || perms.includes('admin') || perms.includes('admin:clients');
  }

  router.get('/', async (req, res) => {
    try {
      if (isAdminKey(req)) {
        const rows = await listFullClients();
        const limit = clampAdminClientListInt(
          req.query.limit,
          1,
          ADMIN_CLIENT_LIST_MAX,
          ADMIN_CLIENT_LIST_DEFAULT
        );
        const offset = clampAdminClientListInt(req.query.offset, 0, ADMIN_CLIENT_LIST_OFFSET_MAX, 0);
        const slice = rows.slice(offset, offset + limit);
        return res.json({
          ok: true,
          total: rows.length,
          count: slice.length,
          limit,
          offset,
          clients: slice,
          truncated: offset + limit < rows.length
        });
      }

      const ck = req.clientKey;
      if (!ck) return res.status(401).json({ ok: false, error: 'unauthorized' });
      const c = await getFullClient(ck);
      if (!c) return res.status(404).json({ ok: false, error: 'not found' });
      const dashboardOutreachMode = isDashboardSelfServiceClient(ck);
      return res.json({ ok: true, count: 1, clients: [{ ...c, dashboardOutreachMode }] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  router.get('/:key', cacheMiddleware({ ttl: 180000 }), requireTenantAccess, async (req, res) => {
    try {
      const clientKey = req.params.key;
      let c = await getFullClient(clientKey);

      // Fallback: check local client files if not in database
      if (!c) {
        try {
          const fs = await import('fs');
          const path = await import('path');
          const clientFile = path.join(process.cwd(), 'demos', `.client-${clientKey}.json`);
          if (fs.existsSync(clientFile)) {
            const fileContent = fs.readFileSync(clientFile, 'utf8');
            c = JSON.parse(fileContent);
          }
        } catch (fileError) {
          // ignore fallback errors
        }
      }

      if (!c) {
        return res.status(404).json({ ok: false, error: 'not found' });
      }

      const dashboardOutreachMode = isDashboardSelfServiceClient(clientKey);
      const response = { ok: true, client: { ...c, dashboardOutreachMode } };

      if (res.headersSent) {
        return;
      }

      res.json(response);
    } catch (e) {
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: String(e) });
      }
    }
  });

  router.post('/', async (req, res) => {
    try {
      const c = req.body || {};
      const key = (c.clientKey || '').toString().trim();
      if (!key) return res.status(400).json({ ok: false, error: 'clientKey is required' });
      if (!isAdminKey(req) && key !== req.clientKey) {
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }
      const tz = pickTimezone(c);
      if (typeof tz !== 'string' || !tz.length) {
        return res.status(400).json({ ok: false, error: 'timezone is required (booking.timezone or timezone)' });
      }
      if (c.sms && !(c.sms.messagingServiceSid || c.sms.fromNumber)) {
        return res.status(400).json({
          ok: false,
          error: 'sms.messagingServiceSid or sms.fromNumber required when sms block present'
        });
      }
      await upsertFullClient(c);
      const saved = await getFullClient(key);
      return res.json({ ok: true, client: saved });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e) });
    }
  });

  router.delete('/:key', async (req, res) => {
    try {
      const key = req.params.key;
      if (!isAdminKey(req) && key !== req.clientKey) {
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }
      const out = await deleteClient(req.params.key);
      res.json({ ok: true, deleted: out.changes });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  return router;
}

