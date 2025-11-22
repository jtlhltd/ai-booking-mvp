# AI Booking System - Complete API Documentation

## Overview

The AI Booking System provides a comprehensive REST API for managing leads, appointments, calls, and client configurations. All API endpoints require authentication via API key.

**Base URL:** `https://ai-booking-mvp.onrender.com`  
**API Version:** `v1` (default)  
**Authentication:** API Key via `X-API-Key` header

---

## Authentication

All API requests require an API key in the header:

```http
X-API-Key: your-api-key-here
```

Or via Authorization header:

```http
Authorization: Bearer your-api-key-here
```

---

## Rate Limiting

Rate limits are applied per endpoint:
- **Public endpoints:** 10 requests/minute
- **Admin endpoints:** 30 requests/minute
- **Webhook endpoints:** 100 requests/minute
- **Health endpoints:** 200 requests/minute
- **Default:** 60 requests/minute

Rate limit headers are included in all responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests in window
- `X-RateLimit-Reset`: When the limit resets (ISO timestamp)

---

## Core Endpoints

### Leads

#### Create Lead
```http
POST /api/leads
Content-Type: application/json
X-API-Key: your-api-key

{
  "clientKey": "stay-focused-fitness-chris",
  "name": "John Doe",
  "phone": "+447123456789",
  "service": "Personal Training",
  "source": "website",
  "notes": "Interested in morning sessions"
}
```

**Response:**
```json
{
  "ok": true,
  "lead": {
    "id": 123,
    "client_key": "stay-focused-fitness-chris",
    "name": "John Doe",
    "phone": "+447123456789",
    "status": "new",
    "created_at": "2025-11-22T16:00:00Z"
  }
}
```

#### Get Leads
```http
GET /api/leads?clientKey=stay-focused-fitness-chris&status=new
X-API-Key: your-api-key
```

**Query Parameters:**
- `clientKey` (required): Client identifier
- `status` (optional): Filter by status (`new`, `contacted`, `booked`, `cancelled`)
- `limit` (optional): Number of results (default: 100)

---

### Appointments

#### Check Availability & Book
```http
POST /api/calendar/check-book
Content-Type: application/json
X-API-Key: your-api-key

{
  "clientKey": "stay-focused-fitness-chris",
  "leadPhone": "+447123456789",
  "preferredTime": "2025-11-25T14:00:00Z",
  "duration": 60,
  "service": "Personal Training"
}
```

**Response:**
```json
{
  "ok": true,
  "booked": true,
  "appointment": {
    "id": 456,
    "gcal_event_id": "event_abc123",
    "start_iso": "2025-11-25T14:00:00Z",
    "end_iso": "2025-11-25T15:00:00Z",
    "status": "booked"
  },
  "smsSent": true
}
```

---

### Statistics

#### Get Client Statistics
```http
GET /api/stats?clientKey=stay-focused-fitness-chris&range=30d
X-API-Key: your-api-key
```

**Query Parameters:**
- `clientKey` (required): Client identifier
- `range` (optional): Time range (`today`, `7d`, `30d`, `90d`)

**Response:**
```json
{
  "ok": true,
  "clientKey": "stay-focused-fitness-chris",
  "stats": {
    "totalLeads": 150,
    "totalCalls": 120,
    "totalBookings": 45,
    "conversionRate": 37.5,
    "trends": {
      "leads": [10, 12, 15, 18, 20],
      "calls": [8, 10, 12, 15, 18],
      "bookings": [3, 4, 5, 6, 7]
    }
  }
}
```

---

## Monitoring Endpoints

### Health Checks

#### Load Balancer Health
```http
GET /health/lb
```

**Response:**
```json
{
  "status": "healthy",
  "uptime": 12345.67,
  "timestamp": "2025-11-22T16:00:00Z"
}
```

#### Comprehensive Health Check
```http
GET /api/health/detailed
X-API-Key: your-api-key
```

**Response:**
```json
{
  "healthy": true,
  "database": {
    "status": "connected",
    "pool": {
      "active": 2,
      "max": 15,
      "utilization": 13.3
    }
  },
  "services": {
    "twilio": "operational",
    "vapi": "operational",
    "googleCalendar": "operational"
  }
}
```

---

### Query Performance

#### Get Slow Queries
```http
GET /api/performance/queries/slow?limit=20&minDuration=1000
X-API-Key: your-api-key
```

**Query Parameters:**
- `limit` (optional): Number of results (default: 20)
- `minDuration` (optional): Minimum duration in ms (default: 1000)

**Response:**
```json
{
  "ok": true,
  "slowQueries": [
    {
      "hash": "abc123",
      "preview": "SELECT * FROM calls WHERE...",
      "avgDuration": 1250.5,
      "maxDuration": 2100.0,
      "callCount": 45,
      "lastExecuted": "2025-11-22T15:30:00Z"
    }
  ],
  "count": 5,
  "threshold": 1000
}
```

#### Get Query Performance Stats
```http
GET /api/performance/queries/stats
X-API-Key: your-api-key
```

**Response:**
```json
{
  "ok": true,
  "stats": {
    "totalQueries": 150,
    "slowQueries": 12,
    "criticalQueries": 2,
    "avgDuration": 245.5,
    "maxDuration": 5200.0,
    "totalCalls": 1250
  },
  "thresholds": {
    "slow": 1000,
    "critical": 5000
  }
}
```

#### Get Optimization Recommendations
```http
GET /api/performance/queries/recommendations
X-API-Key: your-api-key
```

**Response:**
```json
{
  "ok": true,
  "recommendations": [
    {
      "queryHash": "abc123",
      "queryPreview": "SELECT * FROM calls...",
      "avgDuration": 1250.5,
      "callCount": 45,
      "suggestions": [
        "Select only needed columns instead of *",
        "Add WHERE clause to filter results",
        "High call count - consider adding result caching"
      ]
    }
  ],
  "count": 3
}
```

---

### Rate Limiting Status

#### Get Rate Limit Status
```http
GET /api/rate-limit/status?identifier=192.168.1.1
X-API-Key: your-api-key
```

**Query Parameters:**
- `identifier` (optional): IP address, API key ID, or client key (default: request IP)

**Response:**
```json
{
  "ok": true,
  "identifier": "192.168.1.1",
  "limits": {
    "/api/leads": {
      "limit": 10,
      "remaining": 7,
      "reset": "2025-11-22T16:01:00Z"
    },
    "/api/stats": {
      "limit": 60,
      "remaining": 58,
      "reset": "2025-11-22T16:01:00Z"
    }
  },
  "systemStats": {
    "totalEntries": 150,
    "activeWindows": 12
  }
}
```

---

## Webhooks

### VAPI Webhooks

#### Call Status Updates
```http
POST /webhooks/vapi
Content-Type: application/json
X-Vapi-Signature: signature-here

{
  "message": {
    "type": "function-call",
    "functionCall": {
      "name": "calendar_checkAndBook",
      "parameters": {
        "preferredTime": "2025-11-25T14:00:00Z"
      }
    }
  },
  "call": {
    "id": "call_abc123",
    "status": "ended",
    "duration": 120
  }
}
```

**Note:** VAPI webhooks require signature verification if `VAPI_WEBHOOK_SECRET` is set.

---

### Twilio Webhooks

#### SMS Status Updates
```http
POST /webhooks/twilio-status
Content-Type: application/x-www-form-urlencoded

MessageSid=SM123&MessageStatus=delivered&...
```

#### Inbound SMS
```http
POST /webhooks/twilio-inbound
Content-Type: application/x-www-form-urlencoded

From=+447123456789&Body=Hello&...
```

---

## Error Responses

All errors follow this format:

```json
{
  "ok": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

### Common Error Codes

- `MISSING_API_KEY`: API key not provided
- `INVALID_API_KEY`: API key is invalid
- `RATE_LIMIT_EXCEEDED`: Too many requests (429)
- `NOT_FOUND`: Resource not found (404)
- `VALIDATION_ERROR`: Invalid request data (400)
- `SERVER_ERROR`: Internal server error (500)

---

## Response Headers

All responses include:
- `X-API-Version`: API version (e.g., "1")
- `X-Correlation-ID`: Request correlation ID for tracking
- `X-RateLimit-Limit`: Rate limit maximum
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Reset timestamp

---

## Examples

### Complete Booking Flow

1. **Create Lead:**
```bash
curl -X POST https://ai-booking-mvp.onrender.com/api/leads \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "clientKey": "stay-focused-fitness-chris",
    "name": "Jane Smith",
    "phone": "+447123456789",
    "service": "Personal Training"
  }'
```

2. **Check Availability & Book:**
```bash
curl -X POST https://ai-booking-mvp.onrender.com/api/calendar/check-book \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "clientKey": "stay-focused-fitness-chris",
    "leadPhone": "+447123456789",
    "preferredTime": "2025-11-25T14:00:00Z",
    "duration": 60
  }'
```

3. **Get Statistics:**
```bash
curl https://ai-booking-mvp.onrender.com/api/stats?clientKey=stay-focused-fitness-chris \
  -H "X-API-Key: your-key"
```

---

## Interactive API Documentation

Visit `/api-docs` in your browser for interactive Swagger UI documentation with live examples.

---

## Support

For API support, contact: support@aibookingsystem.com

