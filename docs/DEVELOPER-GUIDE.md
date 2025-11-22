# AI Booking System - Developer Guide

## Architecture Overview

The AI Booking System is built on Node.js with Express.js, using PostgreSQL as the primary database with SQLite and JSON file fallbacks.

### Tech Stack

- **Runtime:** Node.js (ESM modules)
- **Framework:** Express.js
- **Database:** PostgreSQL (primary), SQLite (fallback), JSON (development)
- **Real-time:** Socket.IO (WebSockets)
- **Authentication:** API keys with bcrypt hashing
- **Caching:** In-memory (Redis optional)
- **Testing:** Jest + Supertest

---

## Project Structure

```
ai-booking-mvp-skeleton-v2/
├── server.js                 # Main application entry point
├── db.js                     # Database layer (Postgres/SQLite/JSON)
├── gcal.js                   # Google Calendar integration
├── lib/                      # Core libraries
│   ├── cache.js             # Caching system
│   ├── error-monitoring.js  # Error tracking & alerts
│   ├── query-performance-tracker.js  # Query performance
│   ├── rate-limiting.js     # Rate limiting
│   └── ...
├── middleware/              # Express middleware
│   ├── security.js          # Auth, rate limiting, validation
│   ├── api-versioning.js    # API versioning
│   ├── request-timeout.js   # Request timeouts
│   └── ...
├── routes/                   # Route handlers
│   ├── leads.js
│   ├── appointments.js
│   ├── vapi-webhooks.js
│   └── ...
├── public/                   # Static files & dashboards
│   ├── client-dashboard.html
│   ├── index.html
│   └── ...
├── tests/                    # Test suite
│   ├── unit/
│   └── integration/
└── docs/                     # Documentation
```

---

## Database Layer

### Connection Pooling

The system uses PostgreSQL connection pooling with configurable limits:

```javascript
// Default: 15 connections
// Configurable via DB_POOL_MAX environment variable
const maxConnections = parseInt(process.env.DB_POOL_MAX) || 15;
```

### Query Performance Tracking

All queries over 100ms are automatically tracked:

```javascript
// Queries are automatically tracked in query_performance table
// Slow queries (>1s) trigger warnings
// Critical queries (>5s) trigger alerts
```

### Caching

Query results are cached automatically:
- **SELECT queries:** Cached for 5 minutes
- **Cache key:** Based on query text and parameters
- **Storage:** In-memory (Redis optional via `REDIS_URL`)

---

## API Development

### Adding a New Endpoint

1. **Define the route in `server.js`:**
```javascript
app.get('/api/example', authenticateApiKey, async (req, res) => {
  try {
    const { clientKey } = req.query;
    // Your logic here
    res.json({ ok: true, data: result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});
```

2. **Add API documentation:**
Update `lib/api-documentation.js` to include your endpoint.

3. **Add tests:**
Create tests in `tests/integration/api/`

---

## Error Handling

### Standard Error Format

```javascript
res.status(400).json({
  ok: false,
  error: "Error message",
  code: "ERROR_CODE",
  details: {}
});
```

### Error Monitoring

Errors are automatically logged and monitored:
- **Critical errors:** Email alerts sent
- **Warnings:** Logged for review
- **Tracking:** All errors stored in database

---

## Performance Optimization

### Query Optimization

1. **Check slow queries:**
```bash
GET /api/performance/queries/slow
```

2. **Get recommendations:**
```bash
GET /api/performance/queries/recommendations
```

3. **Add indexes:**
```sql
CREATE INDEX IF NOT EXISTS idx_name ON table_name(column_name);
```

### Caching Strategy

- **Client data:** 5 minutes TTL
- **Query results:** 5 minutes TTL
- **Dashboard stats:** 1 minute TTL
- **Cache invalidation:** Automatic on updates

---

## Testing

### Run Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

### Writing Tests

```javascript
import { describe, test, expect } from '@jest/globals';

describe('My Feature', () => {
  test('should work correctly', () => {
    expect(true).toBe(true);
  });
});
```

---

## Environment Variables

### Required

- `DATABASE_URL`: PostgreSQL connection string
- `API_KEY`: Default API key for authentication
- `TWILIO_ACCOUNT_SID`: Twilio account SID
- `TWILIO_AUTH_TOKEN`: Twilio auth token
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: Google service account email
- `GOOGLE_PRIVATE_KEY`: Google service account private key

### Optional

- `DB_POOL_MAX`: Database connection pool size (default: 15)
- `REDIS_URL`: Redis connection string (for distributed caching)
- `CACHE_MAX_SIZE`: Maximum cache items (default: 1000)
- `SLOW_QUERY_THRESHOLD`: Slow query threshold in ms (default: 1000)
- `VAPI_WEBHOOK_SECRET`: VAPI webhook signature secret
- `YOUR_EMAIL`: Email for alerts
- `PUBLIC_BASE_URL`: Public base URL for webhooks

---

## Deployment

### Render.com

1. Connect GitHub repository
2. Set environment variables
3. Deploy automatically on push to `main`

### Health Checks

- **Load balancer:** `/health/lb`
- **Comprehensive:** `/api/health/detailed`

---

## Monitoring

### Available Endpoints

- `/api/performance/queries/slow` - Slow queries
- `/api/performance/queries/stats` - Query statistics
- `/api/rate-limit/status` - Rate limit status
- `/api/cache/stats` - Cache statistics
- `/api/health/detailed` - System health

### Alerts

Automatic email alerts for:
- Critical errors
- Slow queries (>5s)
- High database pool utilization
- Service failures

---

## Best Practices

1. **Always use parameterized queries** (prevents SQL injection)
2. **Handle errors gracefully** (use try/catch)
3. **Log important events** (use correlation IDs)
4. **Cache expensive operations** (use cache.getOrSet)
5. **Rate limit public endpoints** (use rateLimitMiddleware)
6. **Validate input** (use validateAndSanitizeInput)
7. **Use transactions** (for multi-step operations)

---

## Troubleshooting

### Database Connection Issues

1. Check `DATABASE_URL` is correct
2. Verify database is not paused (Render free tier)
3. Check connection pool size
4. Review `/api/database/connection-limit`

### Performance Issues

1. Check slow queries: `/api/performance/queries/slow`
2. Review cache hit rate: `/api/cache/stats`
3. Check database pool utilization
4. Review query recommendations

### Rate Limiting

1. Check rate limit status: `/api/rate-limit/status`
2. Review rate limit headers in responses
3. Adjust limits in `lib/rate-limiting.js`

---

## Contributing

1. Create feature branch
2. Write tests
3. Update documentation
4. Submit pull request

---

## Support

For development questions: dev@aibookingsystem.com

