/**
 * Admin API: ROI calculator leads.
 * Mounted at /api/admin — paths here are /roi-calculator/*.
 */
import { Router } from 'express';

export function createAdminRoiCalculatorRouter() {
  const router = Router();

  // Get ROI calculator leads (admin endpoint)
  router.get('/roi-calculator/leads', async (req, res) => {
    try {
      const { query } = await import('../db.js');
      const { limit = 100 } = req.query;

      const result = await query(
        `
      SELECT * FROM roi_calculator_leads
      ORDER BY created_at DESC
      LIMIT $1
    `,
        [limit]
      );

      res.json({
        ok: true,
        leads: result.rows
      });
    } catch (error) {
      console.error('[ROI CALCULATOR LEADS ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

