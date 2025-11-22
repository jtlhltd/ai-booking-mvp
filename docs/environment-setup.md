# Environment Setup Guide

## Required Environment Variables

Copy these to your `.env` file:

```bash
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/ai_booking_mvp

# Google Calendar (for appointment booking)
GOOGLE_SA_JSON_BASE64=your_base64_encoded_service_account_json
GOOGLE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com

# Twilio (for SMS/calls)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Email (SendGrid or similar)
SENDGRID_API_KEY=your_sendgrid_api_key
FROM_EMAIL=noreply@yourdomain.com

# VAPI (AI calling service)
VAPI_API_KEY=your_vapi_api_key
VAPI_PHONE_NUMBER=your_vapi_phone_number

# Server
PORT=3000
NODE_ENV=development

# Security
JWT_SECRET=your_jwt_secret_key
API_KEY=your_api_key
```

## Extension Usage Tips

### REST Client
- Open `api-tests/booking-endpoints.http`
- Click "Send Request" above any HTTP request
- Use Ctrl+Shift+P -> "Rest Client: Send Request"

### PostgreSQL Extension
- Use Ctrl+Shift+P -> "SQLTools: Connect"
- Run queries from `database-queries/common-queries.sql`

### Rainbow CSV
- Automatically highlights CSV files like your call logs
- Use Ctrl+Shift+P -> "Rainbow CSV: Query" for SQL-like queries on CSV files

### GitLens
- Hover over any line to see Git blame info
- Use Git Graph to visualize your repository history


