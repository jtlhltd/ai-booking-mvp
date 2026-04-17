import express from 'express';

export function createZapierWebhookRouter(deps) {
  const { requireApiKey, getClientFromHeader } = deps || {};
  const router = express.Router();

  router.post('/zapier', requireApiKey, async (req, res) => {
    try {
      console.log('[ZAPIER WEBHOOK] Received lead:', req.body);

      const client = await getClientFromHeader(req);
      if (!client) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or missing X-Client-Key header'
        });
      }

      const { name, phone, email, tags, notes, source, customFields } = req.body;

      if (!phone) {
        return res.status(400).json({
          success: false,
          error: 'Phone number is required'
        });
      }

      const { processBulkLeads } = await import('../lib/lead-deduplication.js');

      const leadData = {
        name: name || 'Unknown',
        phone,
        email: email || null,
        tags: Array.isArray(tags) ? tags.join(',') : tags || '',
        notes: notes || '',
        source: source || 'Zapier',
        customFields: customFields || {},
        status: 'new',
        created_at: new Date().toISOString()
      };

      const result = await processBulkLeads([leadData], client.clientKey);

      if (result.valid === 0) {
        return res.status(400).json({
          success: false,
          error: 'Lead validation failed',
          details: result.invalid > 0 ? 'Duplicate lead or invalid phone' : 'Unknown error'
        });
      }

      console.log('[ZAPIER WEBHOOK] Lead imported successfully');

      res.json({
        success: true,
        message: 'Lead imported successfully',
        leadId: `lead_${Date.now()}`,
        callScheduled: true,
        scheduledFor: new Date(Date.now() + 30000).toISOString()
      });
    } catch (error) {
      console.error('[ZAPIER WEBHOOK ERROR]', error);
      res.status(500).json({
        success: false,
        error: 'Failed to import lead',
        details: error.message
      });
    }
  });

  return router;
}

