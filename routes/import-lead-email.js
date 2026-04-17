import express from 'express';
import { findOrCreateLead } from '../db.js';

export function createImportLeadEmailRouter() {
  const router = express.Router();

  router.post('/import-lead-email/:clientKey', async (req, res) => {
    try {
      const { clientKey } = req.params;
      const { emailBody, emailSubject, emailFrom } = req.body;

      if (!emailBody) {
        return res.status(400).json({ ok: false, error: 'No email body provided' });
      }

      const { parseEmailForLead } = await import('../lib/lead-import.js');

      const lead = parseEmailForLead(emailBody, emailSubject);

      if (!lead.email && emailFrom) {
        lead.email = emailFrom;
      }

      if (!lead.phone && !lead.email) {
        return res.status(400).json({
          ok: false,
          error: 'Could not extract phone or email from forwarded message'
        });
      }

      const { processBulkLeads } = await import('../lib/lead-deduplication.js');
      const dedupResult = await processBulkLeads(
        [
          {
            name: lead.name,
            phone: lead.phone,
            email: lead.email,
            service: lead.service,
            source: 'email_forward',
            status: 'new',
            created_at: new Date().toISOString()
          }
        ],
        clientKey
      );

      if (dedupResult.valid === 0) {
        return res.status(400).json({
          ok: false,
          error: 'Lead is duplicate or invalid',
          details: dedupResult.duplicates > 0 ? 'Duplicate phone number' : 'Invalid lead data'
        });
      }

      await findOrCreateLead({
        tenantKey: clientKey,
        phone: lead.phone,
        name: lead.name,
        service: lead.service,
        source: 'email_forward'
      });

      res.json({
        ok: true,
        message: 'Lead imported from email',
        lead
      });
    } catch (error) {
      console.error('[EMAIL IMPORT ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

