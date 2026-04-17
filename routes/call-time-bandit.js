import express from 'express';
import { backfillCallTimeBanditObservations, getCallTimeBanditForDashboard } from '../db.js';

export function createCallTimeBanditRouter() {
  const router = express.Router();

  router.get('/call-time-bandit/:clientKey', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const { clientKey } = req.params;
      let data = await getCallTimeBanditForDashboard(clientKey);
      if (data.ok && data.observationCount === 0) {
        await backfillCallTimeBanditObservations(clientKey, { days: 90, limit: 6000 }).catch(
          () => {}
        );
        data = await getCallTimeBanditForDashboard(clientKey);
      }
      const thompsonOff = ['0', 'false'].includes(
        String(process.env.CALL_TIME_THOMPSON || '').trim().toLowerCase()
      );
      const schedulingOff = ['0', 'false'].includes(
        String(process.env.OPTIMAL_CALL_SCHEDULING || '').trim().toLowerCase()
      );
      return res.json({
        ...data,
        thompsonActive: !thompsonOff,
        optimalSchedulingActive: !schedulingOff
      });
    } catch (error) {
      console.error('[CALL TIME BANDIT API]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

