import express from 'express';

export function createNextActionsRouter(deps) {
  const { query, cacheMiddleware } = deps || {};
  const router = express.Router();

  router.get(
    '/next-actions/:clientKey',
    cacheMiddleware({ ttl: 60000, keyPrefix: 'next-actions:' }),
    async (req, res) => {
      try {
        const { clientKey } = req.params;

        const highPriorityLeads = await query(
          `
      SELECT COUNT(*) AS count
      FROM leads l
      JOIN lead_engagement le ON le.client_key = l.client_key AND le.lead_phone = l.phone
      WHERE l.client_key = $1
        AND l.status = 'new'
        AND le.lead_score >= 85
    `,
          [clientKey]
        );

        const mediumPriorityLeads = await query(
          `
      SELECT COUNT(*) AS count
      FROM leads l
      JOIN lead_engagement le ON le.client_key = l.client_key AND le.lead_phone = l.phone
      WHERE l.client_key = $1
        AND l.status = 'new'
        AND le.lead_score >= 70 AND le.lead_score < 85
    `,
          [clientKey]
        );

        const scheduledCalls = await query(
          `
      SELECT COUNT(*) AS count
      FROM call_queue
      WHERE client_key = $1
        AND status = 'pending'
        AND scheduled_for >= NOW()
        AND scheduled_for <= NOW() + INTERVAL '24 hours'
    `,
          [clientKey]
        );

        const retries = await query(
          `
      SELECT COUNT(*) AS count
      FROM retry_queue
      WHERE client_key = $1
        AND status = 'pending'
        AND scheduled_for >= NOW()
        AND scheduled_for <= NOW() + INTERVAL '24 hours'
    `,
          [clientKey]
        );

        const actions = [];
        const highCount = parseInt(highPriorityLeads.rows?.[0]?.count || 0, 10);
        const mediumCount = parseInt(mediumPriorityLeads.rows?.[0]?.count || 0, 10);
        const scheduledCount = parseInt(scheduledCalls.rows?.[0]?.count || 0, 10);
        const retryCount = parseInt(retries.rows?.[0]?.count || 0, 10);

        if (highCount > 0) {
          actions.push({
            icon: '📞',
            title: `Call ${highCount} high-priority lead${highCount !== 1 ? 's' : ''}`,
            time: 'Today, 2-4pm',
            priority: 'high'
          });
        }

        if (mediumCount > 0) {
          actions.push({
            icon: '💬',
            title: `Follow up with ${mediumCount} medium-priority lead${mediumCount !== 1 ? 's' : ''}`,
            time: 'Today, 4-6pm',
            priority: 'medium'
          });
        }

        if (scheduledCount > 0) {
          actions.push({
            icon: '📧',
            title: 'Send appointment reminders',
            time: 'Tomorrow, 9am',
            priority: 'medium'
          });
        }

        if (retryCount > 0) {
          actions.push({
            icon: '🔄',
            title: `Retry ${retryCount} failed call${retryCount !== 1 ? 's' : ''}`,
            time: 'Tomorrow, 2pm',
            priority: 'low'
          });
        }

        res.json({
          ok: true,
          actions
        });
      } catch (error) {
        console.error('[NEXT ACTIONS ERROR]', error);
        res.status(500).json({ ok: false, error: error.message });
      }
    }
  );

  return router;
}

