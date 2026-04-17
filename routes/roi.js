import express from 'express';

export function createRoiRouter() {
  const router = express.Router();

  router.get('/roi/:clientKey', async (req, res) => {
    try {
      const { clientKey } = req.params;
      const days = parseInt(req.query.days) || 30;
      const avgDealValue = parseFloat(req.query.avgDealValue) || 150;

      const { calculateROI, projectROI } = await import('../lib/roi-calculator.js');

      const roi = await calculateROI(clientKey, days, { avgDealValue });
      const projection = projectROI(roi, 30);

      res.json({
        ok: true,
        ...roi,
        projection
      });
    } catch (error) {
      console.error('[ROI ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

