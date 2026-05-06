export async function installGlobalMiddleware(app, deps) {
  const { express, morgan, cors, rateLimit, nanoid, ORIGIN } = deps || {};
  if (!app) throw new Error('installGlobalMiddleware requires app');
  if (!express) throw new Error('installGlobalMiddleware requires express');
  if (!morgan) throw new Error('installGlobalMiddleware requires morgan');
  if (!cors) throw new Error('installGlobalMiddleware requires cors');
  if (!rateLimit) throw new Error('installGlobalMiddleware requires rateLimit');
  if (!nanoid) throw new Error('installGlobalMiddleware requires nanoid');
 
  // === Middleware
  // Security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
  });
 
  app.use(morgan('dev'));
 
  // Request timeout middleware (before other middleware to catch all requests)
  const { smartRequestTimeout } = await import('../middleware/request-timeout.js');
  app.use(smartRequestTimeout());
 
  // API versioning middleware
  const { apiVersioning } = await import('../middleware/api-versioning.js');
  app.use(apiVersioning());
 
  app.use(
    cors({
      origin: ORIGIN === '*' ? true : ORIGIN,
      methods: ['GET', 'POST', 'OPTIONS', 'DELETE'],
      allowedHeaders: ['Content-Type', 'X-API-Key', 'Idempotency-Key', 'X-Client-Key'],
    })
  );
 
  // Enhanced correlation ID middleware
  app.use((req, res, next) => {
    // Generate or use existing correlation ID
    const correlationId =
      req.get('X-Correlation-ID') || req.get('X-Request-ID') || `req_${nanoid(12)}`;
 
    // Attach to request object (backward compatible)
    req.correlationId = correlationId;
    req.id = correlationId;
 
    // Add to response headers
    res.set('X-Correlation-ID', correlationId);
    res.set('X-Request-ID', correlationId);
 
    // Add to log context for structured logging
    req.logContext = {
      correlationId,
      method: req.method,
      path: req.path,
      clientKey: req.clientKey || 'anonymous',
      ip: req.ip,
      userAgent: req.get('User-Agent') || 'unknown',
    };
 
    next();
  });
 
  app.use(rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }));
}

