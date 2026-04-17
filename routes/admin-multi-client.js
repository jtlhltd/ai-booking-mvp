/**
 * Admin API: multi-client management.
 * Mounted at /api/admin — paths here are /clients/*.
 */
import { Router } from 'express';

/**
 * @param {{ authenticateApiKey: any }} deps
 */
export function createAdminMultiClientRouter(deps) {
  const { authenticateApiKey } = deps || {};
  const router = Router();

  router.get('/clients/overview', authenticateApiKey, async (req, res) => {
    try {
      const { getAllClientsOverview } = await import('../lib/multi-client-manager.js');
      const overview = await getAllClientsOverview();

      res.json({
        ok: true,
        overview,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[CLIENTS OVERVIEW ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  console.log('🟢🟢🟢 [ADMIN] REGISTERED: GET /api/admin/clients/overview');

  router.get('/clients/needing-attention', authenticateApiKey, async (req, res) => {
    try {
      const { getClientsNeedingAttention } = await import('../lib/multi-client-manager.js');
      const attention = await getClientsNeedingAttention();

      res.json({
        ok: true,
        attention,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[CLIENTS ATTENTION ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  console.log('🟢🟢🟢 [ADMIN] REGISTERED: GET /api/admin/clients/needing-attention');

  router.post('/clients/bulk-update', authenticateApiKey, async (req, res) => {
    try {
      const { clientKeys, enabled } = req.body;

      if (!Array.isArray(clientKeys) || typeof enabled !== 'boolean') {
        return res.status(400).json({ ok: false, error: 'Invalid request body' });
      }

      const { bulkUpdateClientStatus } = await import('../lib/multi-client-manager.js');
      const result = await bulkUpdateClientStatus(clientKeys, enabled);

      res.json({
        ok: true,
        result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[BULK UPDATE ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  console.log('🟢🟢🟢 [ADMIN] REGISTERED: POST /api/admin/clients/bulk-update');

  return router;
}

