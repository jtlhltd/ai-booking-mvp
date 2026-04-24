/**
 * POST /api/dashboard/reset/:clientKey (extracted from server.js).
 */
export async function handleDashboardReset(req, res, deps) {
  const { query } = deps || {};

  try {
    const { clientKey } = req.params;

    console.log(`[DASHBOARD RESET] Resetting data for client: ${clientKey}`);

    await query('DELETE FROM appointments WHERE client_key = $1', [clientKey]);
    await query('DELETE FROM calls WHERE client_key = $1', [clientKey]);
    await query('DELETE FROM messages WHERE client_key = $1', [clientKey]);

    const includeLeads = req.body?.includeLeads || req.query?.includeLeads;
    if (includeLeads) {
      await query('DELETE FROM leads WHERE client_key = $1', [clientKey]);
    }

    console.log(`[DASHBOARD RESET] ✅ Successfully reset dashboard data for ${clientKey}`);

    res.json({
      success: true,
      message: `Dashboard data reset successfully for ${clientKey}`,
      cleared: {
        appointments: true,
        calls: true,
        messages: true,
        leads: includeLeads || false,
      },
    });
  } catch (error) {
    console.error('[DASHBOARD RESET] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset dashboard data',
      details: error.message,
    });
  }
}
