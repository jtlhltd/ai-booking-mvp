/**
 * When ENFORCE_ADMIN_API_KEY=1 and API_KEY is set, require X-API-Key for all /api/admin/* (opt-in).
 * Admin Hub stores the key in localStorage as adminHubApiKey.
 */
export function enforceAdminApiKeyIfConfigured(req, res, next) {
  if (!req.path.startsWith('/api/admin/')) return next();
  const enforce = /^(1|true|yes)$/i.test(String(process.env.ENFORCE_ADMIN_API_KEY || '').trim());
  if (!enforce) return next();
  const expected = String(process.env.API_KEY || '').trim();
  if (!expected) return next();
  const key = req.get('X-API-Key');
  if (key && key === expected) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}
