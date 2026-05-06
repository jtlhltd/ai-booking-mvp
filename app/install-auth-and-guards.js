export function createRequireApiKey({ getApiKey, isWebhookBypassPath }) {
  return function requireApiKey(req, res, next) {
    try {
      // Skip API key check for public routes
      if (
        req.method === 'GET' &&
        (req.path === '/health' ||
          req.path === '/gcal/ping' ||
          req.path === '/healthz' ||
          req.path === '/setup-my-client' ||
          req.path === '/clear-my-leads' ||
          req.path === '/check-db' ||
          req.path === '/lead-import.html' ||
          req.path === '/complete-setup' ||
          req.path === '/test-booking-calendar')
      )
        return next();

      // Allow webhook endpoints through without API key
      if (typeof isWebhookBypassPath === 'function' && isWebhookBypassPath(req.path)) return next();

      // Public API/test-ish endpoints
      if (
        req.path === '/api/test' ||
        req.path.startsWith('/api/test/') ||
        req.path === '/api/test-linkedin' ||
        req.path === '/api/uk-business-search' ||
        req.path === '/api/decision-maker-contacts' ||
        req.path === '/api/industry-categories' ||
        req.path === '/test-sms-pipeline' ||
        req.path === '/sms-test' ||
        req.path === '/api/initiate-lead-capture' ||
        req.path === '/api/signup'
      )
        return next();

      // Portal-ish pages
      if (req.path === '/uk-business-search' || req.path === '/booking-simple.html') return next();
      if (
        req.path.startsWith('/dashboard/') ||
        req.path.startsWith('/settings/') ||
        req.path.startsWith('/leads') ||
        req.path === '/privacy.html' ||
        req.path === '/privacy' ||
        req.path === '/zapier-docs.html' ||
        req.path === '/zapier'
      )
        return next();

      // Skip API key check for ALL admin routes (hub and API endpoints)
      if (req.path === '/admin-hub.html' || req.path === '/admin-hub' || req.path.startsWith('/api/admin/'))
        return next();

      const API_KEY = typeof getApiKey === 'function' ? getApiKey() : process.env.API_KEY;

      // For all other routes, check API key
      if (!API_KEY) return next(); // If no API key is set, allow access (for development)
      const key = req.get('X-API-Key');
      if (key && key === API_KEY) return next();
      return res.status(401).json({ error: 'Unauthorized' });
    } catch (e) {
      return next(e);
    }
  };
}

