/**
 * Gates dev-only HTTP surfaces (mock-call, SSE drilldowns, etc.).
 * Default off; in production, when enabled, also requires X-API-Key if API_KEY is set.
 */
export function isPublicDevRoutesEnabled() {
  return /^(1|true|yes)$/i.test(String(process.env.ENABLE_PUBLIC_DEV_ROUTES || '').trim());
}

export function publicDevRoutesMiddleware() {
  return (req, res, next) => {
    if (!isPublicDevRoutesEnabled()) {
      return res.status(404).send('Not found');
    }
    const isProd = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
    const expected = String(process.env.API_KEY || '').trim();
    if (isProd && expected) {
      const key = req.get('X-API-Key');
      if (!key || key !== expected) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }
    next();
  };
}
