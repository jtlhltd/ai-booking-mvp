/**
 * White-label branding API.
 * Mounted at /api/branding.
 */
import { Router } from 'express';

/**
 * @param {{ getFullClient: (clientKey: string) => Promise<any>, upsertFullClient: (client: any) => Promise<any> }} deps
 */
export function createBrandingRouter(deps) {
  const { getFullClient, upsertFullClient } = deps || {};
  const router = Router();

  router.get('/:clientKey', async (req, res) => {
    try {
      const { clientKey } = req.params;
      const client = await getFullClient(clientKey);

      if (!client) {
        return res.status(404).json({ ok: false, error: 'Client not found' });
      }

      const { getClientBranding } = await import('../lib/whitelabel.js');
      const branding = getClientBranding(client);

      res.json({ ok: true, branding });
    } catch (error) {
      console.error('[BRANDING GET ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.put('/:clientKey', async (req, res) => {
    try {
      const { clientKey } = req.params;
      const brandingData = req.body;

      const { validateBranding } = await import('../lib/whitelabel.js');
      const validation = validateBranding(brandingData);

      if (!validation.valid) {
        return res.status(400).json({
          ok: false,
          error: 'Invalid branding configuration',
          details: validation.errors
        });
      }

      const client = await getFullClient(clientKey);
      if (!client) {
        return res.status(404).json({ ok: false, error: 'Client not found' });
      }

      const updatedClient = {
        ...client,
        branding: {
          ...(client.branding || {}),
          ...brandingData
        },
        updatedAt: new Date().toISOString()
      };

      await upsertFullClient(updatedClient);

      console.log(`[BRANDING] Updated branding for ${clientKey}`);

      res.json({
        ok: true,
        branding: updatedClient.branding,
        warnings: validation.warnings
      });
    } catch (error) {
      console.error('[BRANDING UPDATE ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

