/**
 * Core API: lead import preview helpers.
 *
 * POST /api/leads/existing-match-keys
 */
import { Router } from 'express';

/**
 * @param {{ query: (sql: string, params?: any[]) => Promise<{ rows?: any[] }> }} deps
 */
export function createLeadsExistingMatchKeysRouter(deps) {
  const { query } = deps || {};
  const router = Router();

  router.post('/leads/existing-match-keys', async (req, res) => {
    try {
      const clientKey = req.body?.clientKey;
      const matchKeys = req.body?.matchKeys;
      if (!clientKey || typeof clientKey !== 'string' || !Array.isArray(matchKeys)) {
        return res.status(400).json({ error: 'clientKey and matchKeys array required' });
      }
      const keys = [...new Set(matchKeys.map((k) => String(k ?? '').trim()).filter(Boolean))].slice(0, 2500);
      if (!keys.length) {
        return res.json({ existingKeys: [] });
      }
      const result = await query(
        `SELECT DISTINCT phone_match_key AS phone_key
         FROM leads
         WHERE client_key = $1
           AND phone_match_key IS NOT NULL
           AND phone_match_key = ANY($2::text[])`,
        [clientKey, keys]
      );
      const existingKeys = (result.rows || []).map((r) => r.phone_key).filter(Boolean);
      return res.json({ existingKeys });
    } catch (err) {
      console.error('[EXISTING MATCH KEYS]', err);
      return res.status(500).json({ error: err.message || 'Server error' });
    }
  });

  return router;
}

