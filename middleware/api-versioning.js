// middleware/api-versioning.js
// API versioning middleware and utilities

/**
 * API versioning middleware
 * Handles version routing and deprecation headers
 */
export function apiVersioning() {
  return (req, res, next) => {
    // Extract version from path or header
    const pathVersion = req.path.match(/^\/api\/v(\d+)/);
    const headerVersion = req.get('X-API-Version') || req.get('Accept')?.match(/version=(\d+)/)?.[1];
    
    const version = pathVersion ? parseInt(pathVersion[1]) : (headerVersion ? parseInt(headerVersion) : 1);
    
    // Attach version to request
    req.apiVersion = version;
    
    // Add version header to response
    res.set('X-API-Version', version.toString());
    
    // Check for deprecated versions
    if (version < 1) {
      res.set('X-API-Deprecated', 'true');
      res.set('X-API-Deprecation-Date', '2025-12-31');
      res.set('X-API-Sunset-Date', '2026-06-30');
    }
    
    next();
  };
}

/**
 * Create versioned route handler
 * @param {Function} handler - Route handler function
 * @param {Object} options - Options
 * @returns {Function} Versioned route handler
 */
export function versionedRoute(handler, options = {}) {
  const {
    minVersion = 1,
    maxVersion = null,
    deprecatedFrom = null,
    sunsetDate = null
  } = options;
  
  return (req, res, next) => {
    const version = req.apiVersion || 1;
    
    // Check version compatibility
    if (version < minVersion) {
      return res.status(400).json({
        ok: false,
        error: 'Unsupported API version',
        message: `This endpoint requires API version ${minVersion} or higher`,
        requestedVersion: version,
        minimumVersion: minVersion
      });
    }
    
    if (maxVersion && version > maxVersion) {
      return res.status(400).json({
        ok: false,
        error: 'Unsupported API version',
        message: `This endpoint supports up to API version ${maxVersion}`,
        requestedVersion: version,
        maximumVersion: maxVersion
      });
    }
    
    // Add deprecation headers if applicable
    if (deprecatedFrom && version >= deprecatedFrom) {
      res.set('X-API-Deprecated', 'true');
      if (deprecatedFrom) {
        res.set('X-API-Deprecation-Date', deprecatedFrom);
      }
      if (sunsetDate) {
        res.set('X-API-Sunset-Date', sunsetDate);
      }
    }
    
    // Call the handler
    return handler(req, res, next);
  };
}

/**
 * Redirect legacy routes to v1
 */
export function legacyRouteRedirect(req, res, next) {
  // If accessing /api/* without version, redirect to /api/v1/*
  if (req.path.startsWith('/api/') && !req.path.startsWith('/api/v')) {
    const newPath = req.path.replace('/api/', '/api/v1/');
    return res.redirect(301, newPath + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''));
  }
  next();
}

