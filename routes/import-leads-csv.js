import express from 'express';

export function createImportLeadsCsvRouter(deps) {
  const { requireApiKey } = deps || {};
  const router = express.Router();

  router.post('/import-leads-csv', requireApiKey, async (req, res) => {
    try {
      const { leads } = req.body;

      if (!Array.isArray(leads) || leads.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Leads array is required and must not be empty'
        });
      }

      const results = [];
      const errors = [];

      for (const lead of leads) {
        try {
          if (!lead.phoneNumber || !lead.decisionMaker) {
            errors.push({
              lead: lead,
              error: 'Missing required fields: phoneNumber and decisionMaker'
            });
            continue;
          }

          const response = await fetch(
            `${req.protocol}://${req.get('host')}/api/initiate-lead-capture`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-API-Key': req.get('X-API-Key')
              },
              body: JSON.stringify({
                leadData: {
                  phoneNumber: lead.phoneNumber,
                  businessName: lead.businessName || 'Unknown Company',
                  decisionMaker: lead.decisionMaker,
                  industry: lead.industry || 'Business',
                  location: lead.location || 'UK'
                }
              })
            }
          );

          const result = await response.json();

          if (result.success) {
            results.push({
              lead: lead,
              leadId: result.leadId,
              status: 'success'
            });
          } else {
            errors.push({
              lead: lead,
              error: result.message
            });
          }

          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          errors.push({
            lead: lead,
            error: error.message
          });
        }
      }

      console.log(
        `[BULK IMPORT] Processed ${leads.length} leads: ${results.length} success, ${errors.length} errors`
      );

      res.json({
        success: true,
        message: `Processed ${leads.length} leads`,
        results: {
          successful: results.length,
          failed: errors.length,
          details: results,
          errors: errors
        }
      });
    } catch (error) {
      console.error('[BULK IMPORT ERROR]', error);
      res.status(500).json({
        success: false,
        message: 'Bulk import failed',
        error: error.message
      });
    }
  });

  return router;
}

