/**
 * Clients API (DB-backed).
 * Mounted at /api/clients.
 */
import { Router } from 'express';

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

  router.get('/', async (_req, res) => {
    try {
      const rows = await listFullClients();
      res.json({ ok: true, count: rows.length, clients: rows });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  router.get('/:key', async (req, res) => {
    try {
      const clientKey = req.params.key;
      console.log(`[API] GET /api/clients/${clientKey} - Fetching client...`);

      let c = await getFullClient(clientKey);
      console.log(`[API] getFullClient returned:`, c ? 'client found' : 'null');

      // Fallback: check local client files if not in database
      if (!c) {
        try {
          const fs = await import('fs');
          const path = await import('path');
          const clientFile = path.join(process.cwd(), 'demos', `.client-${clientKey}.json`);
          if (fs.existsSync(clientFile)) {
            const fileContent = fs.readFileSync(clientFile, 'utf8');
            c = JSON.parse(fileContent);
            console.log(`[API] Loaded client from file:`, clientFile);
          }
        } catch (fileError) {
          console.warn(`[API] File fallback error:`, fileError.message);
        }
      }

      if (!c) {
        console.log(`[API] Client not found: ${clientKey}`);
        return res.status(404).json({ ok: false, error: 'not found' });
      }

      console.log(`[API] Returning client data for ${clientKey}:`, {
        hasDisplayName: !!c.displayName,
        hasWhiteLabel: !!c.whiteLabel,
        hasBranding: !!c.whiteLabel?.branding,
        clientKeys: Object.keys(c || {}).slice(0, 10)
      });

      const dashboardOutreachMode = isDashboardSelfServiceClient(clientKey);
      const response = { ok: true, client: { ...c, dashboardOutreachMode } };
      console.log(`[API] Sending response for ${clientKey}, response keys:`, Object.keys(response));

      if (res.headersSent) {
        console.error(`[API] Response already sent for ${clientKey}!`);
        return;
      }

      res.json(response);
    } catch (e) {
      console.error(`[API] Error in /api/clients/:key:`, e);
      console.error(`[API] Error stack:`, e.stack);

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
      const tz = pickTimezone(c);
      if (typeof tz !== 'string' || !tz.length) {
        return res.status(400).json({ ok: false, error: 'booking.timezone is required' });
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
      const out = await deleteClient(req.params.key);
      res.json({ ok: true, deleted: out.changes });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  return router;
}

