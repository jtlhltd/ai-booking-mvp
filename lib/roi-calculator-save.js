/**
 * POST /api/roi-calculator/save (extracted from server.js).
 */
export async function handleRoiCalculatorSave(req, res, deps) {
  const { query } = deps || {};

  try {
    const { email, results } = req.body;

    if (!email || !results) {
      return res.status(400).json({ ok: false, error: 'email and results are required' });
    }

    try {
      await query(`
        CREATE TABLE IF NOT EXISTS roi_calculator_leads (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) NOT NULL,
          industry VARCHAR(50),
          leads_per_month INTEGER,
          current_conversion DECIMAL(5,2),
          improved_conversion DECIMAL(5,2),
          avg_value DECIMAL(10,2),
          hours_spent DECIMAL(5,2),
          current_bookings INTEGER,
          potential_bookings INTEGER,
          extra_bookings INTEGER,
          current_revenue DECIMAL(10,2),
          potential_revenue DECIMAL(10,2),
          revenue_lost DECIMAL(10,2),
          time_value DECIMAL(10,2),
          total_value DECIMAL(10,2),
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await query(
        `
        INSERT INTO roi_calculator_leads (
          email, industry, leads_per_month, current_conversion, improved_conversion,
          avg_value, hours_spent, current_bookings, potential_bookings, extra_bookings,
          current_revenue, potential_revenue, revenue_lost, time_value, total_value
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `,
        [
          email,
          results.industry,
          results.leadsPerMonth,
          results.currentConversion,
          results.improvedConversion,
          results.avgValue,
          results.hoursSpent,
          results.currentBookings,
          results.potentialBookings,
          results.extraBookings,
          results.currentRevenue,
          results.potentialRevenue,
          results.revenueLost,
          results.timeValue,
          results.totalValue,
        ]
      );

      console.log(`[ROI CALCULATOR] Lead captured: ${email} - Revenue lost: £${results.revenueLost}`);
    } catch (dbError) {
      console.error('[ROI CALCULATOR] Database error:', dbError);
    }

    res.json({
      ok: true,
      message: 'Results saved successfully',
      emailSent: false,
    });
  } catch (error) {
    console.error('[ROI CALCULATOR SAVE ERROR]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
}
