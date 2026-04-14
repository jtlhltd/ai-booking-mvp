/**
 * When ENFORCE_ADMIN_API_KEY=1 and API_KEY is set, require X-API-Key (opt-in).
 * Covers /api/admin/* and legacy /admin/* JSON/HTML operator routes.
 * Excludes: Admin Hub static entry, and /admin routes that use JWT (authenticateApiKey) instead.
 */
export function adminSurfaceRequiresApiKey(reqPath) {
  if (reqPath.startsWith('/api/admin/')) return true;
  if (reqPath === '/admin-hub' || reqPath === '/admin-hub.html') return false;
  if (/^\/admin\/(users|api-keys|security-events)(\/|$)/.test(reqPath)) return false;
  if (reqPath.startsWith('/admin/')) return true;
  return false;
}

export function enforceAdminApiKeyIfConfigured(req, res, next) {
  if (req.method === 'OPTIONS') return next();
  if (!adminSurfaceRequiresApiKey(req.path)) return next();
  const enforce = /^(1|true|yes)$/i.test(String(process.env.ENFORCE_ADMIN_API_KEY || '').trim());
  if (!enforce) return next();
  const expected = String(process.env.API_KEY || '').trim();
  if (!expected) return next();
  const key = req.get('X-API-Key');
  if (key && key === expected) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}
