/**
 * GET /healthz — extracted from server.js (load balancers / uptime monitors).
 *
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {{
 *   listFullClients: () => Promise<Array<{ clientKey?: string }>>,
 *   getIntegrationFlags: () => { gcalConfigured: boolean, smsConfigured: boolean, corsOrigin: string, dbPath: string }
 * }} deps
 */
export async function handleHealthz(_req, res, deps) {
  try {
    const { listFullClients, getIntegrationFlags } = deps || {};
    const rows = await listFullClients();
    const flags = getIntegrationFlags();
    return res.json({
      ok: true,
      service: 'ai-booking-system',
      time: new Date().toISOString(),
      gcalConfigured: flags.gcalConfigured,
      smsConfigured: flags.smsConfigured,
      corsOrigin: flags.corsOrigin,
      tenants: rows.map((r) => r.clientKey),
      db: { path: flags.dbPath }
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}

