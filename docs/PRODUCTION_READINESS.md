# Production Readiness Guide

This document outlines the production-ready features implemented for the AI Booking MVP system.

## 🏥 Health Checks

### Endpoints

- **`GET /health`** - Comprehensive health check with detailed system status
  - Includes database, cache, performance, and service configuration status
  - Returns 200 (healthy/degraded) or 503 (critical)
  - Optional `?details=true` query parameter for extended information

- **`GET /health/quick`** - Lightweight health check for load balancers
  - Minimal response for fast checks
  - Always returns 200 if server is running

- **`GET /health/readiness`** - Kubernetes readiness probe
  - Checks if application is ready to receive traffic
  - Returns 200 (ready) or 503 (not ready)

- **`GET /health/liveness`** - Kubernetes liveness probe
  - Checks if application is alive
  - Returns 200 (alive) or 503 (unhealthy)

- **`GET /healthz`** - Alias for quick health check (common convention)

### Health Check Response Format

```json
{
  "status": "healthy" | "degraded" | "critical",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "version": "1.0.0",
  "environment": "production",
  "uptime": 3600,
  "uptimeFormatted": "1h 0m",
  "memory": {
    "rss": "150MB",
    "heapUsed": "80MB",
    "heapTotal": "100MB",
    "usagePercent": 80
  },
  "database": {
    "status": "healthy",
    "responseTime": "15ms",
    "connected": true
  },
  "cache": {
    "status": "healthy",
    "hitRate": "85%",
    "size": 500,
    "maxSize": 1000
  },
  "performance": {
    "status": "healthy",
    "slowQueries": 2,
    "slowAPIs": 1,
    "errorRate": "0.5%"
  },
  "services": {
    "vapi": { "configured": true, "status": "not_checked" },
    "googleCalendar": { "configured": true, "status": "not_checked" },
    "twilio": { "configured": true, "status": "not_checked" }
  }
}
```

## 📊 Monitoring Endpoints

### Metrics

- **`GET /api/monitoring/metrics`** - Get comprehensive system metrics
  - Query parameter: `?window=60` (time window in minutes, default 60)
  - Returns performance stats, cache stats, and system metrics

- **`GET /api/monitoring/slow-queries`** - Get slow database queries
  - Query parameter: `?limit=10` (default 10)
  - Returns list of queries exceeding performance thresholds

- **`GET /api/monitoring/slow-apis`** - Get slow API endpoints
  - Query parameter: `?limit=10` (default 10)
  - Returns list of API calls exceeding performance thresholds

- **`GET /api/monitoring/errors`** - Get recent errors
  - Query parameter: `?limit=10` (default 10)
  - Returns list of recent errors tracked by performance monitor

- **`GET /api/monitoring/report`** - Get comprehensive performance report
  - Includes summary, top issues, and recommendations

- **`GET /api/monitoring/database-stats`** - Get database statistics
  - Returns counts of tenants, leads, calls, appointments, etc.

- **`GET /api/monitoring/cache-stats`** - Get cache statistics
  - Returns cache hit rate, size, and memory usage

- **`POST /api/monitoring/cache/clear`** - Clear cache (admin only)
  - Requires authentication
  - Clears all cached data

## 🛡️ Security Features

### Security Headers

All responses include security headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Content-Security-Policy: [configured policy]`

### Input Validation & Sanitization

- Automatic XSS protection on all request bodies, queries, and params
- Script tag removal from user input
- Deep object sanitization

### Rate Limiting

- Per-client rate limiting via API keys
- Configurable limits per minute and per hour
- Rate limit headers included in responses:
  - `X-RateLimit-Limit-Minute`
  - `X-RateLimit-Remaining-Minute`
  - `X-RateLimit-Reset-Minute`
  - `X-RateLimit-Limit-Hour`
  - `X-RateLimit-Remaining-Hour`
  - `X-RateLimit-Reset-Hour`

### Authentication

- API key authentication via `X-API-Key` header or `Authorization: Bearer` header
- Multi-tenant access control
- Security event logging for failed authentication attempts

## 📝 Logging

### Structured Logging

The system uses structured logging with the following features:
- JSON-formatted log entries
- Log levels: DEBUG, INFO, WARN, ERROR, FATAL
- Contextual information (client key, API key ID, request details)
- Automatic error tracking in performance monitor

### Request Logging

All requests are logged with:
- Method, URL, IP address
- User agent
- Client key and API key ID
- Response status code and duration
- Timestamp

### Error Logging

Errors are logged with:
- Error message, stack trace, and code
- Request context (method, URL, IP, user agent)
- Client key and API key ID
- Automatic severity classification

## ⚡ Performance Monitoring

### Automatic Tracking

- Database query performance (tracks slow queries > 1s)
- API endpoint performance (tracks slow APIs > 2s)
- Error tracking and categorization
- Cache hit rate monitoring

### Performance Thresholds

- **Slow Query**: > 1000ms
- **Slow API**: > 2000ms
- **Max Metrics Size**: 1000 items per metric type

### Performance Recommendations

The system automatically generates performance recommendations based on:
- Slow query percentage
- Average API response time
- Error rate
- API error rate

## 🔧 Error Handling

### Error Classes

- `AppError` - Base application error
- `ValidationError` - Input validation failures (400)
- `AuthenticationError` - Authentication failures (401)
- `AuthorizationError` - Permission failures (403)
- `NotFoundError` - Resource not found (404)
- `ConflictError` - Duplicate resources (409)
- `RateLimitError` - Rate limit exceeded (429)
- `ExternalServiceError` - Third-party API failures (502)
- `DatabaseError` - Database operation failures (500)
- `BusinessLogicError` - Domain-specific failures (422)
- `ConfigurationError` - Configuration issues (500)

### Error Response Format

```json
{
  "error": {
    "message": "Error message",
    "code": "ERROR_CODE",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "statusCode": 400
  }
}
```

In development mode, additional details are included:
- Stack trace
- Error name
- Field information (for validation errors)
- Service information (for external service errors)
- Request context

### Async Error Handling

Use the `asyncHandler` wrapper for route handlers:

```javascript
import { asyncHandler } from './lib/errors.js';

app.get('/api/example', asyncHandler(async (req, res) => {
  // Your async code here
  // Errors are automatically caught and passed to error handler
}));
```

## 🚀 Deployment Recommendations

### Environment Variables

- `NODE_ENV` - Set to `production` for production
- `LOG_LEVEL` - Set to `info` or `warn` for production (default: `info`)
- `API_KEY` - Required for API authentication
- Database connection variables (PostgreSQL or SQLite)

### Health Check Configuration

For Kubernetes:
```yaml
livenessProbe:
  httpGet:
    path: /health/liveness
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/readiness
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
```

For Load Balancers:
- Use `/health/quick` or `/healthz` for health checks
- Use `/health` for detailed monitoring

### Monitoring Setup

1. Set up monitoring for `/api/monitoring/metrics` endpoint
2. Alert on `/health` returning `critical` status
3. Monitor slow query and API metrics
4. Track error rates via `/api/monitoring/errors`

### Security Checklist

- [ ] API keys configured and secured
- [ ] Rate limiting enabled and configured
- [ ] Security headers verified
- [ ] Input validation enabled
- [ ] HTTPS/TLS configured
- [ ] CORS configured appropriately
- [ ] Environment variables secured
- [ ] Database credentials secured

## 📈 Performance Optimization

### Caching

- In-memory cache with configurable TTL
- Automatic cache cleanup for expired items
- LRU eviction when cache size limit reached
- Cache statistics available via monitoring endpoint

### Database Optimization

- Query performance monitoring
- Automatic slow query detection
- Recommendations for query optimization
- Connection pooling (PostgreSQL)

### API Optimization

- Response compression enabled
- Caching middleware for frequently accessed endpoints
- Performance monitoring for all API calls
- Automatic slow API detection

## 🔍 Troubleshooting

### Health Check Returns Critical

1. Check database connectivity
2. Review memory usage (should be < 95%)
3. Check error logs via `/api/monitoring/errors`
4. Review slow queries via `/api/monitoring/slow-queries`

### High Error Rate

1. Check `/api/monitoring/errors` for error patterns
2. Review error logs for common issues
3. Check external service status
4. Review input validation errors

### Performance Issues

1. Check `/api/monitoring/report` for recommendations
2. Review slow queries and APIs
3. Check cache hit rate
4. Review database statistics

## 📚 Additional Resources

- Error Handling: See `lib/errors.js`
- Structured Logging: See `lib/structured-logger.js`
- Performance Monitoring: See `lib/performance-monitor.js`
- Caching: See `lib/cache.js`
- Security Middleware: See `middleware/security.js`







