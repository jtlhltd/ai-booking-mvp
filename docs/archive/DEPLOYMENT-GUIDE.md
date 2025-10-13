# 🚀 **Deployment Guide - All System Improvements**

**AI Booking MVP - Complete Implementation**

---

## ✅ **What's Been Built**

We've implemented **9 major system improvements** that transform your AI booking service into a production-ready, enterprise-grade platform.

---

## 📦 **New Files Created (18 Total)**

### Core Infrastructure
1. `lib/messaging-service.js` - Unified SMS/Email service (Twilio + Nodemailer)
2. `lib/database-health.js` - Health monitoring, retry logic, query helpers
3. `lib/follow-up-processor.js` - Automated follow-up message processing

### Lead Management
4. `lib/lead-deduplication.js` - Phone validation, duplicate detection, opt-out tracking

### Analytics & Monitoring
5. `lib/analytics-tracker.js` - Call outcomes, conversion metrics, ROI reporting
6. `lib/error-monitoring.js` - Error logging, alerting, threshold monitoring

### Client Management
7. `lib/client-onboarding.js` - Automated onboarding, API key generation, Vapi cloning

### Real-Time Features
8. `lib/realtime-events.js` - Server-Sent Events for live dashboard updates

### Security
9. `lib/security.js` - Twilio verification, audit logging, GDPR compliance, rate limiting

### Database Migrations
10. `migrations/add-opt-out-table.sql` - Opt-out list for GDPR
11. `migrations/add-security-tables.sql` - Audit logs, call analytics, error logs

### Documentation
12. `SYSTEM-IMPROVEMENTS-IMPLEMENTED.md` - Technical implementation guide
13. `DISASTER-RECOVERY-RUNBOOK.md` - Emergency procedures and backup strategy
14. `DEPLOYMENT-GUIDE.md` - This file

---

## 🔧 **Required Environment Variables**

Add these to your Render service:

```env
# === REQUIRED (Already have these) ===
DATABASE_URL=postgresql://...
API_KEY=your-api-key
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_FROM_NUMBER=+447xxx
VAPI_PRIVATE_KEY=xxx
VAPI_ASSISTANT_ID=xxx
GOOGLE_CLIENT_EMAIL=xxx
GOOGLE_PRIVATE_KEY=xxx
GOOGLE_CALENDAR_ID=xxx

# === NEW (Add these now) ===

# Email Service (for confirmations and alerts)
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-gmail-app-password

# Admin Alerts (for critical system errors)
ADMIN_EMAIL=your-admin-email@domain.com

# Optional: Template assistant for auto-cloning
VAPI_TEMPLATE_ASSISTANT_ID=your-template-assistant-id

# Optional: Base URL (auto-detected if not set)
BASE_URL=https://your-app.onrender.com

# Optional: Messaging Service SID (if using Twilio Messaging Service)
TWILIO_MESSAGING_SERVICE_SID=MGxxx
```

### How to Get Gmail App Password

1. Go to Google Account settings
2. Security → 2-Step Verification (must be enabled)
3. App passwords → Generate new
4. Select "Mail" and "Other (Custom name)"
5. Copy the 16-character password
6. Use this as `EMAIL_PASS`

---

## 📊 **Database Migrations**

Run these SQL migrations on your Postgres database:

### 1. Opt-Out List Table
```bash
# Connect to your Render Postgres
psql $DATABASE_URL

# Run migration
\i migrations/add-opt-out-table.sql
```

### 2. Security Tables (Audit Logs, Analytics, Error Logs)
```bash
# Connect to your Render Postgres
psql $DATABASE_URL

# Run migration
\i migrations/add-security-tables.sql
```

### Verify Tables Created
```sql
-- Check new tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('opt_out_list', 'audit_logs', 'call_analytics', 'error_logs');

-- Should return 4 rows
```

---

## 🚀 **Deployment Steps**

### 1. Push Code to GitHub
```bash
# Already done! But if you need to redeploy:
git add .
git commit -m "Deploy system improvements"
git push origin main
```

### 2. Update Environment Variables
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Select your web service
3. Go to **Environment** tab
4. Add new variables listed above
5. Click **Save Changes**
6. Render will automatically redeploy

### 3. Run Database Migrations
```bash
# From your local machine with Render Postgres connection
psql $DATABASE_URL -f migrations/add-opt-out-table.sql
psql $DATABASE_URL -f migrations/add-security-tables.sql
```

### 4. Verify Deployment
```bash
# Check health endpoint
curl https://your-app.onrender.com/health | jq

# Should show:
# - status: "healthy"
# - messaging.sms: "configured"
# - messaging.email: "configured"
# - database.status: "healthy"
```

---

## 🧪 **Testing the New Features**

### Test 1: SMS/Email Infrastructure
```bash
# Import a test lead (should trigger SMS confirmation if setup)
curl -X POST https://your-app.onrender.com/api/import-leads/your-client-key \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "leads": [
      {"name": "Test User", "phone": "+447XXXXXXXXX", "service": "consultation"}
    ]
  }'

# Check logs for SMS sending
```

### Test 2: Lead Deduplication
```bash
# Import same lead twice - should detect duplicate
curl -X POST https://your-app.onrender.com/api/import-leads/your-client-key \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "leads": [
      {"name": "Test User", "phone": "+447XXXXXXXXX", "service": "consultation"},
      {"name": "Test User", "phone": "+447XXXXXXXXX", "service": "consultation"}
    ]
  }'

# Should show: imported: 1, duplicates: 1
```

### Test 3: Real-Time Events (SSE)
```bash
# Connect to SSE stream
curl -N https://your-app.onrender.com/api/realtime/your-client-key/events

# Should receive:
# data: {"type":"connected","timestamp":"..."}
# :heartbeat (every 30 seconds)
```

### Test 4: Client Onboarding
```bash
# Create new client
curl -X POST https://your-app.onrender.com/api/onboard-client \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Test Plumbing Ltd",
    "email": "test@example.com",
    "phone": "+447XXXXXXXXX",
    "industry": "plumbing",
    "services": ["Emergency Repairs", "Installations"]
  }'

# Should return:
# - clientKey
# - apiKey
# - dashboardUrl
# - nextSteps
```

### Test 5: Error Monitoring
```bash
# Trigger intentional error (will be logged)
curl https://your-app.onrender.com/api/error-test

# Check error stats
curl https://your-app.onrender.com/api/error-stats?days=1 \
  -H "X-API-Key: your-api-key"
```

---

## 📈 **New API Endpoints**

### Client Onboarding
```
POST /api/onboard-client
Headers: X-API-Key
Body: { businessName, email, phone, industry, services }
Response: { clientKey, apiKey, dashboardUrl, nextSteps }
```

### Client Configuration
```
PATCH /api/clients/:clientKey/config
Headers: X-API-Key
Body: { ... updates ... }
Response: { success, client }
```

### Real-Time Events
```
GET /api/realtime/:clientKey/events
Response: Server-Sent Events stream
Events: call_started, call_ended, appointment_booked, lead_status_changed
```

### Analytics
```
GET /api/analytics/:clientKey/metrics?days=30
Headers: X-API-Key
Response: { conversion_rate, cost_per_appointment, roi_percent, ... }

GET /api/analytics/:clientKey/report/weekly
Headers: X-API-Key
Response: { summary, trend, weekOverWeekChange }
```

### Security & GDPR
```
GET /api/clients/:clientKey/export
Headers: X-API-Key
Response: { leads, appointments, calls, analytics, messages }

DELETE /api/clients/:clientKey/data?hardDelete=true
Headers: X-API-Key
Response: { success, method, deletedAt }
```

---

## 🔍 **Monitoring & Health Checks**

### Health Endpoint (Enhanced)
```bash
curl https://your-app.onrender.com/health | jq

# Returns:
{
  "status": "healthy",
  "uptime": "12h 34m",
  "memory": { "rss": "150MB", "heapUsed": "80MB" },
  "database": {
    "status": "healthy",
    "responseTime": "12ms",
    "consecutiveFailures": 0
  },
  "messaging": {
    "sms": "configured",
    "email": "configured"
  },
  "services": {
    "vapi": "configured",
    "googleCalendar": "configured",
    "twilio": "configured"
  }
}
```

### Real-Time Connection Stats
```bash
curl https://your-app.onrender.com/api/realtime/stats \
  -H "X-API-Key: your-api-key" | jq

# Returns:
{
  "totalClients": 5,
  "totalConnections": 12,
  "clientDetails": [...]
}
```

---

## 📊 **Cron Jobs Running**

After deployment, these cron jobs will run automatically:

| Job | Frequency | Purpose |
|-----|-----------|---------|
| Appointment reminders | Every 5 min | Send 24h and 1h reminders |
| Follow-up messages | Every 5 min | Send scheduled follow-ups |
| Database health check | Every 5 min | Monitor DB status |
| Quality monitoring | Every hour | Check call quality |

### Verify Cron Jobs
Check server logs for these messages:
```
✅ Appointment reminder cron job scheduled (runs every 5 minutes)
✅ Follow-up message cron job scheduled (runs every 5 minutes)
✅ Database health monitoring scheduled (runs every 5 minutes)
✅ Quality monitoring cron job scheduled (runs every hour)
```

---

## 🛡️ **Security Features**

### 1. Twilio Webhook Verification
Automatically verifies all incoming Twilio webhooks using signature validation.

### 2. Per-Client Rate Limiting
Different rate limits based on client tier:
- Free: 60 requests/minute
- Starter: 120 requests/minute
- Pro: 300 requests/minute
- Enterprise: 1000 requests/minute

### 3. Audit Logging
All client actions are logged to `audit_logs` table:
- Lead imports
- Configuration changes
- API calls
- System events

### 4. GDPR Compliance
- Opt-out tracking (`opt_out_list` table)
- Data export API
- Data deletion/anonymization API

---

## 🔔 **Alert Configuration**

### Critical Alerts
The system will email `ADMIN_EMAIL` when:
- 10+ errors in 5 minutes
- Individual critical errors
- Database health degraded
- Backup older than 48 hours (if verification enabled)

### Configure Slack Alerts (Optional)
Add to environment variables:
```env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

Then uncomment Slack integration in `lib/error-monitoring.js`:
```javascript
// Around line 75
if (process.env.SLACK_WEBHOOK_URL) {
  await sendSlackAlert(message);
}
```

---

## 📚 **Client Dashboard Integration**

### Add Real-Time Updates to Dashboard

1. Open `public/client-dashboard.html`
2. Add this JavaScript before closing `</body>`:

```html
<script>
// Connect to real-time events
const clientKey = new URLSearchParams(window.location.search).get('client');
const eventSource = new EventSource(`/api/realtime/${clientKey}/events`);

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  
  switch(data.type) {
    case 'connected':
      console.log('✅ Connected to real-time updates');
      break;
      
    case 'call_started':
      showNotification(`📞 Call started: ${data.data.leadName}`);
      updateCallStatus(data.data);
      break;
      
    case 'call_ended':
      showNotification(`✅ Call ended: ${data.data.outcome}`);
      updateMetrics();
      break;
      
    case 'appointment_booked':
      showNotification(`🎉 Appointment booked: ${data.data.leadName}`);
      addAppointmentToCalendar(data.data);
      updateMetrics();
      break;
      
    case 'lead_status_changed':
      updateLeadStatus(data.data);
      break;
      
    case 'conversion_metrics_updated':
      updateConversionMetrics(data.data);
      break;
      
    case 'system_alert':
      showAlert(data.data);
      break;
  }
});

eventSource.onerror = () => {
  console.error('❌ Real-time connection lost, reconnecting...');
};

function showNotification(message) {
  // Add your notification UI here
  console.log(message);
}

function updateCallStatus(callData) {
  // Update UI with call status
}

function updateMetrics() {
  // Refresh metrics from API
  fetch(`/api/analytics/${clientKey}/metrics?days=7`)
    .then(r => r.json())
    .then(data => {
      // Update dashboard metrics
    });
}
</script>
```

---

## ✅ **Post-Deployment Checklist**

### Immediate (Within 1 hour)
- [ ] Verify `/health` endpoint shows "healthy"
- [ ] Check all environment variables set correctly
- [ ] Run database migrations
- [ ] Test SMS sending (send test message)
- [ ] Test email sending (send test email)
- [ ] Import test lead and verify processing
- [ ] Check cron job logs

### Within 24 Hours
- [ ] Monitor error logs for issues
- [ ] Verify first appointment reminder sent
- [ ] Check database health monitoring logs
- [ ] Test real-time dashboard updates
- [ ] Verify lead deduplication working

### Within 1 Week
- [ ] Review analytics data
- [ ] Check weekly report generation
- [ ] Verify audit logs populating
- [ ] Test disaster recovery procedure
- [ ] Enable automated backups on Render

---

## 🚨 **Troubleshooting Common Issues**

### Issue: SMS Not Sending
**Solution:**
1. Check `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`
2. Verify Twilio account has balance
3. Check logs for Twilio errors
4. Test with: `curl https://your-app.onrender.com/health` - should show `sms: "configured"`

### Issue: Emails Not Sending
**Solution:**
1. Check `EMAIL_USER` and `EMAIL_PASS`
2. Verify Gmail app password (not regular password)
3. Check "Less secure app access" is ON in Google Account
4. Test with manual email API call

### Issue: Real-Time Updates Not Working
**Solution:**
1. Check browser console for SSE errors
2. Verify `/api/realtime/:clientKey/events` endpoint accessible
3. Check CORS headers
4. Try different browser

### Issue: Database Health "Degraded"
**Solution:**
1. Check Render Postgres status
2. Review connection count (might be hitting limits)
3. Restart Postgres instance if needed
4. Check `DATABASE_URL` is correct

---

## 📞 **Support & Maintenance**

### Daily Monitoring
- Check `/health` endpoint
- Review error logs
- Monitor Twilio/Vapi usage

### Weekly Tasks
- Review analytics reports
- Check backup status
- Test one disaster recovery procedure

### Monthly Tasks
- Full system audit
- Update documentation
- Security review
- Backup verification

---

## 🎉 **You're Live!**

Your system now has:
✅ Production-grade messaging  
✅ Comprehensive analytics  
✅ Real-time updates  
✅ Automated onboarding  
✅ Enterprise security  
✅ Disaster recovery  

**Next Steps:**
1. Deploy to production ✅ (just push to main)
2. Add environment variables ⏳
3. Run migrations ⏳
4. Test all features ⏳
5. Monitor for 24 hours ⏳
6. Onboard first real client 🚀

---

**Questions?** Review the comprehensive documentation:
- `SYSTEM-IMPROVEMENTS-IMPLEMENTED.md` - Technical details
- `DISASTER-RECOVERY-RUNBOOK.md` - Emergency procedures
- `DEPLOYMENT-GUIDE.md` - This file

**Good luck! 🚀**


