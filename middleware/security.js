import crypto from 'crypto';
import bcrypt from 'bcrypt';

// Enhanced security middleware for multi-tenant authentication and rate limiting

// Generate secure API key
export function generateApiKey() {
  return 'ak_' + crypto.randomBytes(32).toString('hex');
}

// Hash API key for storage
export function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

// Hash password
export async function hashPassword(password) {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

// Verify password
export async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

// Enhanced API key authentication middleware
export async function authenticateApiKey(req, res, next) {
  try {
    const apiKey = req.get('X-API-Key') || req.get('Authorization')?.replace('Bearer ', '');
    
    if (!apiKey) {
      return res.status(401).json({ 
        error: 'API key required',
        code: 'MISSING_API_KEY'
      });
    }

    // Import database functions
    const { getApiKeyByHash, updateApiKeyLastUsed, logSecurityEvent } = await import('../db.js');
    
    // Hash the provided key to compare with stored hash
    const keyHash = hashApiKey(apiKey);
    const apiKeyData = await getApiKeyByHash(keyHash);
    
    if (!apiKeyData) {
      // Log failed authentication attempt (with error handling)
      try {
        await logSecurityEvent({
          clientKey: 'victory_dental',
          eventType: 'api_auth_failed',
          eventSeverity: 'warning',
          eventData: { reason: 'invalid_api_key', providedKey: apiKey.substring(0, 8) + '...' },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });
      } catch (logError) {
        console.error('[SECURITY LOG ERROR]', logError);
        // Continue without logging if it fails
      }
      
      return res.status(401).json({ 
        error: 'Invalid API key',
        code: 'INVALID_API_KEY'
      });
    }

    // Update last used timestamp
    await updateApiKeyLastUsed(apiKeyData.id);
    
    // Attach API key data to request
    req.apiKey = apiKeyData;
    req.clientKey = apiKeyData.client_key;
    
    next();
  } catch (error) {
    console.error('[API KEY AUTH ERROR]', error);
    res.status(500).json({ 
      error: 'Authentication error',
      code: 'AUTH_ERROR'
    });
  }
}

// Enhanced rate limiting middleware
export async function rateLimitMiddleware(req, res, next) {
  try {
    const { checkRateLimit, recordRateLimitRequest, logSecurityEvent } = await import('../db.js');
    
    const clientKey = req.clientKey || 'victory_dental';
    const apiKeyId = req.apiKey?.id || null;
    const endpoint = req.path;
    const ipAddress = req.ip;
    
    // Get rate limits from API key or use defaults
    const limitPerMinute = req.apiKey?.rate_limit_per_minute || 100;
    const limitPerHour = req.apiKey?.rate_limit_per_hour || 1000;
    
    // Check current rate limit status
    const rateLimitStatus = await checkRateLimit({
      clientKey,
      apiKeyId,
      endpoint,
      ipAddress,
      limitPerMinute,
      limitPerHour
    });
    
    // Record this request
    await recordRateLimitRequest({
      clientKey,
      apiKeyId,
      endpoint,
      ipAddress
    });
    
    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit-Minute': limitPerMinute.toString(),
      'X-RateLimit-Limit-Hour': limitPerHour.toString(),
      'X-RateLimit-Remaining-Minute': rateLimitStatus.remainingMinute.toString(),
      'X-RateLimit-Remaining-Hour': rateLimitStatus.remainingHour.toString(),
      'X-RateLimit-Reset-Minute': new Date(Date.now() + 60 * 1000).toISOString(),
      'X-RateLimit-Reset-Hour': new Date(Date.now() + 60 * 60 * 1000).toISOString()
    });
    
    if (rateLimitStatus.exceeded) {
      // Log rate limit exceeded
      await logSecurityEvent({
        clientKey,
        eventType: 'rate_limit_exceeded',
        eventSeverity: 'warning',
        eventData: {
          endpoint,
          minuteCount: rateLimitStatus.minuteCount,
          hourCount: rateLimitStatus.hourCount,
          limitPerMinute,
          limitPerHour
        },
        ipAddress,
        userAgent: req.get('User-Agent')
      });
      
      return res.status(429).json({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        details: {
          minuteCount: rateLimitStatus.minuteCount,
          hourCount: rateLimitStatus.hourCount,
          limitPerMinute,
          limitPerHour,
          retryAfter: 60 // seconds
        }
      });
    }
    
    next();
  } catch (error) {
    console.error('[RATE LIMIT ERROR]', error);
    // Allow request to proceed if rate limiting fails
    next();
  }
}

// Permission checking middleware
export function requirePermission(permission) {
  return (req, res, next) => {
    try {
      if (!req.apiKey) {
        return res.status(401).json({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }
      
      const permissions = req.apiKey.permissions || [];
      
      if (!permissions.includes(permission) && !permissions.includes('*')) {
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS',
          required: permission
        });
      }
      
      next();
    } catch (error) {
      console.error('[PERMISSION CHECK ERROR]', error);
      res.status(500).json({ 
        error: 'Permission check error',
        code: 'PERMISSION_ERROR'
      });
    }
  };
}

// Tenant isolation middleware
export function requireTenantAccess(req, res, next) {
  try {
    const requestedTenant = req.params.tenantKey || req.body.clientKey;
    const userTenant = req.clientKey;
    
    if (!requestedTenant) {
      return res.status(400).json({ 
        error: 'Tenant key required',
        code: 'MISSING_TENANT_KEY'
      });
    }
    
    if (requestedTenant !== userTenant) {
      return res.status(403).json({ 
        error: 'Access denied to tenant',
        code: 'TENANT_ACCESS_DENIED',
        requested: requestedTenant,
        authorized: userTenant
      });
    }
    
    next();
  } catch (error) {
    console.error('[TENANT ACCESS ERROR]', error);
    res.status(500).json({ 
      error: 'Tenant access check error',
      code: 'TENANT_ERROR'
    });
  }
}

// Input validation and sanitization middleware
export function validateAndSanitizeInput(schema) {
  return (req, res, next) => {
    try {
      const { body, query, params } = req;
      
      // Basic XSS protection
      const sanitizeObject = (obj) => {
        if (typeof obj === 'string') {
          return obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        }
        if (typeof obj === 'object' && obj !== null) {
          const sanitized = {};
          for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = sanitizeObject(value);
          }
          return sanitized;
        }
        return obj;
      };
      
      req.body = sanitizeObject(body);
      req.query = sanitizeObject(query);
      req.params = sanitizeObject(params);
      
      next();
    } catch (error) {
      console.error('[INPUT SANITIZATION ERROR]', error);
      res.status(400).json({ 
        error: 'Invalid input',
        code: 'INVALID_INPUT'
      });
    }
  };
}

// Security headers middleware
export function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.socket.io https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https:; connect-src 'self' wss: https:"
  });
  
  next();
}

// Request logging middleware
export async function requestLogging(req, res, next) {
  try {
    const startTime = Date.now();
    
    // Log request
    console.log('[REQUEST]', {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      clientKey: req.clientKey || 'anonymous',
      apiKeyId: req.apiKey?.id || 'none',
      timestamp: new Date().toISOString()
    });
    
    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function(chunk, encoding) {
      const duration = Date.now() - startTime;
      
      console.log('[RESPONSE]', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        clientKey: req.clientKey || 'anonymous',
        apiKeyId: req.apiKey?.id || 'none',
        timestamp: new Date().toISOString()
      });
      
      originalEnd.call(this, chunk, encoding);
    };
    
    next();
  } catch (error) {
    console.error('[REQUEST LOGGING ERROR]', error);
    next();
  }
}

// Enhanced error handling middleware
export async function errorHandler(error, req, res, next) {
  try {
    // Import error handling utilities
    const { formatErrorResponse, logError, AppError } = await import('../lib/errors.js');
    
    // Log the error with full context
    const logData = logError(error, req, {
      endpoint: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
      referer: req.get('Referer')
    });
    
    // Log security event for errors (with error handling)
    if (req.clientKey) {
      try {
        const { logSecurityEvent } = await import('../db.js');
        await logSecurityEvent({
          clientKey: req.clientKey,
          eventType: 'server_error',
          eventSeverity: error.statusCode >= 500 ? 'error' : 'warning',
          eventData: {
            error: error.message,
            code: error.code,
            url: req.url,
            method: req.method,
            statusCode: error.statusCode || 500
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });
      } catch (logError) {
        console.error('[SECURITY LOG ERROR]', logError.message);
        // Continue without failing the error handler
      }
    }
    
    // Determine if this is an operational error
    const isOperational = error.isOperational !== undefined ? error.isOperational : error.statusCode < 500;
    
    // Don't expose internal errors to client in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    const shouldExposeError = isDevelopment || isOperational;
    
    // Format error response
    const errorResponse = formatErrorResponse(error, shouldExposeError ? req : null);
    
    // Set appropriate status code
    const statusCode = error.statusCode || error.status || 500;
    res.status(statusCode).json(errorResponse);
    
  } catch (handlerError) {
    console.error('[ERROR HANDLER FAILED]', {
      originalError: error.message,
      handlerError: handlerError.message,
      stack: handlerError.stack,
      url: req.url,
      method: req.method,
      timestamp: new Date().toISOString()
    });
    
    // Fallback error response
    res.status(500).json({
      error: {
        message: 'Internal server error',
        code: 'HANDLER_ERROR',
        timestamp: new Date().toISOString(),
        statusCode: 500
      }
    });
  }
}

// Cleanup old rate limit records (run periodically)
export async function cleanupRateLimitRecords() {
  try {
    const { cleanupOldRateLimitRecords } = await import('../db.js');
    await cleanupOldRateLimitRecords(24); // Clean records older than 24 hours
    console.log('[RATE LIMIT CLEANUP]', { completed: true, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[RATE LIMIT CLEANUP ERROR]', error);
  }
}

// Run cleanup every hour
setInterval(cleanupRateLimitRecords, 60 * 60 * 1000);

// Twilio webhook verification middleware
export function twilioWebhookVerification(req, res, next) {
  try {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    if (!authToken) {
      console.warn('[TWILIO AUTH] TWILIO_AUTH_TOKEN not set, skipping verification');
      return next();
    }

    const signature = req.get('X-Twilio-Signature');
    const url = req.protocol + '://' + req.get('host') + req.originalUrl;
    const params = req.body || {};

    // Import Twilio's validator
    import('twilio').then(({ default: twilio }) => {
      const validator = twilio.webhook(authToken);
      
      if (signature && validator(url, params, signature)) {
        next();
      } else {
        console.error('[TWILIO AUTH] Invalid signature:', {
          url,
          hasSignature: !!signature,
          timestamp: new Date().toISOString()
        });
        res.status(403).json({ 
          error: 'Invalid webhook signature',
          code: 'INVALID_SIGNATURE'
        });
      }
    }).catch((error) => {
      console.error('[TWILIO AUTH ERROR]', error);
      // Allow request if verification fails (graceful degradation)
      next();
    });
  } catch (error) {
    console.error('[TWILIO WEBHOOK VERIFICATION ERROR]', error);
    // Graceful degradation - allow request if verification fails
    next();
  }
}

// Audit logging middleware
export async function auditLog(req, res, next) {
  try {
    const { logSecurityEvent } = await import('../db.js');
    const clientKey = req.clientKey || req.params.clientKey || req.query.clientKey || 'unknown';
    
    // Log sensitive operations
    const sensitiveEndpoints = [
      '/api/leads/import',
      '/api/clients',
      '/webhooks/vapi',
      '/api/leads',
      '/api/appointments'
    ];
    
    const isSensitive = sensitiveEndpoints.some(endpoint => req.path.includes(endpoint));
    
    if (isSensitive) {
      await logSecurityEvent({
        clientKey,
        eventType: 'api_access',
        eventSeverity: 'info',
        eventData: {
          method: req.method,
          path: req.path,
          hasApiKey: !!req.apiKey,
          ipAddress: req.ip
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }).catch(err => {
        console.error('[AUDIT LOG ERROR]', err);
        // Don't fail request if audit logging fails
      });
    }
    
    next();
  } catch (error) {
    console.error('[AUDIT LOG MIDDLEWARE ERROR]', error);
    // Don't block request if audit logging fails
    next();
  }
}

// Enhanced input validation schemas
export const validationSchemas = {
  lead: {
    name: { type: 'string', maxLength: 200, required: false },
    phone: { type: 'string', pattern: /^\+?\d{7,15}$/, required: true },
    service: { type: 'string', maxLength: 100, required: false },
    source: { type: 'string', maxLength: 100, required: false },
    email: { type: 'string', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, required: false }
  },
  appointment: {
    lead_phone: { type: 'string', pattern: /^\+?\d{7,15}$/, required: true },
    start_iso: { type: 'string', required: true },
    service: { type: 'string', maxLength: 100, required: false }
  },
  client: {
    display_name: { type: 'string', maxLength: 200, required: true },
    timezone: { type: 'string', maxLength: 50, required: false },
    email: { type: 'string', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, required: false }
  }
};

// Enhanced validation middleware with schemas
export function validateInput(schemaName) {
  return (req, res, next) => {
    try {
      const schema = validationSchemas[schemaName];
      if (!schema) {
        return res.status(400).json({ 
          error: 'Invalid validation schema',
          code: 'INVALID_SCHEMA'
        });
      }

      const data = req.body || {};
      const errors = [];

      for (const [field, rules] of Object.entries(schema)) {
        const value = data[field];
        
        if (rules.required && (value === undefined || value === null || value === '')) {
          errors.push({ field, message: `${field} is required` });
          continue;
        }

        if (value !== undefined && value !== null && value !== '') {
          if (rules.type && typeof value !== rules.type) {
            errors.push({ field, message: `${field} must be ${rules.type}` });
          }
          
          if (rules.maxLength && value.length > rules.maxLength) {
            errors.push({ field, message: `${field} must be less than ${rules.maxLength} characters` });
          }
          
          if (rules.pattern && !rules.pattern.test(value)) {
            errors.push({ field, message: `${field} format is invalid` });
          }
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          errors
        });
      }

      next();
    } catch (error) {
      console.error('[VALIDATION ERROR]', error);
      res.status(400).json({ 
        error: 'Validation error',
        code: 'VALIDATION_ERROR'
      });
    }
  };
}
