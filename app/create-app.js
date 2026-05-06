import express from 'express';
import compression from 'compression';

export function createApp({
  performanceMiddleware,
  performanceMonitor,
  enforceAdminApiKeyIfConfigured,
  securityHeaders,
  requestLogging,
  validateAndSanitizeInput,
  auditLog,
  staticPagesRouter,
  createPortalPagesRouter,
}) {
  const app = express();

  // Add performance monitoring middleware (tracks all API calls)
  app.use(performanceMiddleware(performanceMonitor));

  // CORS middleware for dashboard access (legacy behavior)
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key'
    );

    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // Middleware for parsing JSON bodies (must be before routes that need it)
  app.use(compression()); // Compress responses for better performance

  // Vapi webhooks: capture exact request bytes for HMAC (must run before global express.json).
  const vapiWebhookJsonCapture = express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      req.rawBody = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
    }
  });
  app.use('/webhooks/vapi', (req, res, next) => {
    if (req.method !== 'POST' && req.method !== 'PUT') return next();
    return vapiWebhookJsonCapture(req, res, next);
  });
  const globalJsonParser = express.json({ limit: '10mb' });
  app.use((req, res, next) => {
    if (
      (req.method === 'POST' || req.method === 'PUT') &&
      (req.path === '/webhooks/vapi' || req.path.startsWith('/webhooks/vapi/'))
    ) {
      return next();
    }
    return globalJsonParser(req, res, next);
  });

  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.use(enforceAdminApiKeyIfConfigured);

  // Trust proxy for rate limiting (required for Render)
  app.set('trust proxy', 1);

  // Enhanced security middleware
  app.use(securityHeaders);
  app.use(requestLogging);
  app.use(validateAndSanitizeInput());
  app.use(auditLog);

  // Serve static files from public directory
  app.use(express.static('public'));

  // Named HTML routes + portal pages
  app.use(staticPagesRouter);
  app.use(createPortalPagesRouter());

  return app;
}

