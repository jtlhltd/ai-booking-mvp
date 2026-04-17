import express from 'express';

export function createPipelineTrackingRouter(deps) {
  const { smsEmailPipeline } = deps || {};
  const router = express.Router();

  router.get('/pipeline-stats', async (req, res) => {
    try {
      console.log('[PIPELINE STATS REQUEST]', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });

      if (!smsEmailPipeline) {
        console.log('[PIPELINE STATS] SMS pipeline not available');
        return res.json({
          totalLeads: 0,
          waitingForEmail: 0,
          emailReceived: 0,
          booked: 0,
          conversionRate: 0
        });
      }

      const stats = smsEmailPipeline.getStats();
      stats.lastUpdated = new Date().toISOString();

      console.log('[PIPELINE STATS RESPONSE]', stats);
      res.json(stats);
    } catch (error) {
      console.error('[PIPELINE STATS ERROR]', error);
      res.status(500).json({ error: 'Failed to get pipeline stats' });
    }
  });

  router.get('/recent-leads', async (req, res) => {
    try {
      console.log('[RECENT LEADS REQUEST]', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });

      if (!smsEmailPipeline) {
        console.log('[RECENT LEADS] SMS pipeline not available');
        return res.json([]);
      }

      const allLeads = Array.from(smsEmailPipeline.pendingLeads.values());
      allLeads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const recentLeads = allLeads.slice(0, 50);

      console.log('[RECENT LEADS RESPONSE]', {
        totalLeads: allLeads.length,
        returnedLeads: recentLeads.length,
        leadStatuses: recentLeads.reduce((acc, lead) => {
          acc[lead.status] = (acc[lead.status] || 0) + 1;
          return acc;
        }, {})
      });

      res.json(recentLeads);
    } catch (error) {
      console.error('[RECENT LEADS ERROR]', error);
      res.status(500).json({ error: 'Failed to get recent leads' });
    }
  });

  router.get('/leads-needing-attention', async (_req, res) => {
    try {
      if (!smsEmailPipeline) {
        return res.json({
          stuckLeads: [],
          expiredLeads: [],
          retryScheduled: []
        });
      }

      const attentionData = smsEmailPipeline.getLeadsNeedingAttention();

      console.log('[LEADS NEEDING ATTENTION]', {
        stuckLeads: attentionData.stuckLeads.length,
        expiredLeads: attentionData.expiredLeads.length,
        retryScheduled: attentionData.retryScheduled.length
      });

      res.json(attentionData);
    } catch (error) {
      console.error('[LEADS NEEDING ATTENTION ERROR]', error);
      res.status(500).json({ error: 'Failed to get leads needing attention' });
    }
  });

  return router;
}

