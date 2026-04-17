import express from 'express';

export function createPipelineRetryRouter(deps) {
  const { smsEmailPipeline } = deps || {};
  const router = express.Router();

  router.post('/trigger-retry/:leadId', async (req, res) => {
    try {
      const { leadId } = req.params;

      if (!smsEmailPipeline) {
        return res.status(500).json({ error: 'SMS pipeline not available' });
      }

      const lead = smsEmailPipeline.pendingLeads.get(leadId);
      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }

      if (lead.status !== 'waiting_for_email') {
        return res.status(400).json({ error: 'Lead is not in waiting_for_email status' });
      }

      lead.nextRetryAt = new Date();
      smsEmailPipeline.pendingLeads.set(leadId, lead);

      await smsEmailPipeline.processRetries();

      console.log(`[MANUAL RETRY TRIGGERED] Lead ${leadId} - ${lead.phoneNumber}`);

      res.json({
        success: true,
        message: `Retry triggered for lead ${leadId}`,
        leadId: leadId,
        phoneNumber: lead.phoneNumber
      });
    } catch (error) {
      console.error('[MANUAL RETRY ERROR]', error);
      res.status(500).json({ error: 'Failed to trigger retry' });
    }
  });

  return router;
}

