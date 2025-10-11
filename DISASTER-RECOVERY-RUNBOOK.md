## 🚨 Disaster Recovery Runbook

**AI Booking MVP - Emergency Response Guide**

---

## 📋 **Table of Contents**

1. [Emergency Contacts](#emergency-contacts)
2. [System Architecture](#system-architecture)
3. [Backup Strategy](#backup-strategy)
4. [Recovery Procedures](#recovery-procedures)
5. [Common Disaster Scenarios](#common-disaster-scenarios)
6. [Post-Recovery Checklist](#post-recovery-checklist)

---

## 👥 **Emergency Contacts**

| Role | Contact | Availability |
|------|---------|--------------|
| System Admin | your-email@domain.com | 24/7 |
| Render Support | support@render.com | 24/7 |
| Twilio Support | help@twilio.com | 24/7 |
| Vapi Support | support@vapi.ai | Business hours |

---

## 🏗️ **System Architecture**

### Critical Components
1. **Render Web Service** - Node.js application
2. **Render Postgres** - Database (with auto-backups)
3. **Twilio** - SMS/Voice infrastructure
4. **Vapi** - AI calling engine
5. **Google Calendar** - Appointment scheduling

### Dependencies
- All services must be operational for full functionality
- Graceful degradation: System continues with limited features if one service fails

---

## 💾 **Backup Strategy**

### Automated Backups (Render Postgres)

**Default Configuration:**
- **Frequency:** Daily automatic backups
- **Retention:** 7 days (Starter plan) / 30 days (Pro plan)
- **Location:** Render's secure cloud storage
- **Point-in-time recovery:** Available on Pro plans

### How to Enable Automated Backups

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Navigate to your Postgres instance
3. Click **Backups** tab
4. Ensure **Automatic Backups** is enabled
5. Verify backup schedule

### Manual Backup (Do This Monthly)

```bash
# Dump entire database
pg_dump -h <your-render-host> \
        -U <your-user> \
        -d <your-database> \
        -F c \
        -b \
        -v \
        -f backup_$(date +%Y%m%d_%H%M%S).dump

# Upload to secure storage
# Option 1: AWS S3
aws s3 cp backup_*.dump s3://your-bucket/backups/

# Option 2: Google Drive
# Use rclone or similar tool
```

### Backup Verification (Weekly Cron Job)

Add this to your server:

```javascript
// Check last backup age
cron.schedule('0 6 * * *', async () => {
  const backupAge = await checkLastBackupAge();
  if (backupAge > 48) { // hours
    await sendCriticalAlert({
      message: '⚠️ No backup in 48 hours!',
      details: `Last backup: ${backupAge} hours ago`
    });
  }
});
```

---

## 🔧 **Recovery Procedures**

### 1. Database Corruption / Data Loss

**Symptoms:**
- Unable to connect to database
- Queries returning errors
- Missing data

**Recovery Steps:**

1. **Identify the issue:**
```bash
# Check database health
curl https://your-app.onrender.com/health

# Check Render dashboard for alerts
```

2. **Restore from backup:**

**Option A: Render Dashboard (Recommended)**
- Go to Postgres instance → Backups tab
- Click "Restore" on desired backup
- Choose "Restore to new database" (safest)
- Update `DATABASE_URL` in web service

**Option B: Command Line**
```bash
# Restore from dump file
pg_restore -h <your-render-host> \
           -U <your-user> \
           -d <your-database> \
           -v backup_20251011_120000.dump

# Verify restoration
psql -h <your-render-host> -U <your-user> -d <your-database> -c "SELECT COUNT(*) FROM leads;"
```

3. **Verify data integrity:**
```bash
# Check critical tables
SELECT COUNT(*) FROM tenants;
SELECT COUNT(*) FROM leads;
SELECT COUNT(*) FROM appointments;
SELECT COUNT(*) FROM calls;
```

4. **Test system functionality:**
- Access `/health` endpoint
- Import test lead
- Make test Vapi call
- Check SMS/Email sending

---

### 2. Complete System Outage

**Symptoms:**
- Website not responding
- All API endpoints returning errors
- Health check failing

**Recovery Steps:**

1. **Check Render service status:**
- Visit [Render Dashboard](https://dashboard.render.com)
- Check service logs
- Look for deployment errors

2. **Restart service:**
```bash
# Via Dashboard: Click "Manual Deploy" → "Deploy latest commit"

# Via CLI
render services restart <service-id>
```

3. **If restart fails, rollback to previous deploy:**
- Go to Deployments tab
- Find last successful deployment
- Click "Redeploy"

4. **If rollback fails, redeploy from scratch:**
```bash
# From your local machine
git clone https://github.com/your-org/ai-booking-mvp.git
cd ai-booking-mvp
git checkout main  # or last known good commit
git push render main
```

---

### 3. Environment Variables Lost

**Symptoms:**
- Services not connecting (Twilio, Vapi, Google Calendar)
- "Configuration error" messages
- Features disabled

**Recovery Steps:**

1. **Restore from documentation:**

Create `.env.backup` file with all critical variables:

```env
# Database
DATABASE_URL=postgresql://...

# Twilio
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_FROM_NUMBER=+44xxx
TWILIO_MESSAGING_SERVICE_SID=MGxxx

# Email
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Vapi
VAPI_PRIVATE_KEY=xxx
VAPI_ASSISTANT_ID=xxx
VAPI_PHONE_NUMBER_ID=xxx

# Google Calendar
GOOGLE_CLIENT_EMAIL=xxx
GOOGLE_PRIVATE_KEY=xxx
GOOGLE_CALENDAR_ID=xxx

# System
API_KEY=your-api-key
BASE_URL=https://your-app.onrender.com
ADMIN_EMAIL=admin@yourdomain.com
```

2. **Restore via Render Dashboard:**
- Go to web service → Environment tab
- Add each variable one by one
- Save changes
- Trigger new deployment

3. **Verify restoration:**
```bash
curl https://your-app.onrender.com/health
```

---

### 4. Twilio Service Disruption

**Symptoms:**
- SMS not sending
- Calls not connecting
- "Twilio error" in logs

**Recovery Steps:**

1. **Check Twilio status:**
- Visit [Twilio Status Page](https://status.twilio.com)

2. **Verify credentials:**
```bash
curl https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID.json \
  -u $TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN
```

3. **Check account balance:**
- Log into Twilio Console
- Verify sufficient balance
- Add funds if needed

4. **Fallback plan:**
- Switch to backup Twilio account (if configured)
- Update `TWILIO_*` environment variables
- Redeploy

---

### 5. Vapi Service Disruption

**Symptoms:**
- AI calls failing
- "Vapi error" in logs
- Calls not initiating

**Recovery Steps:**

1. **Check Vapi status:**
- Check [Vapi Dashboard](https://dashboard.vapi.ai)
- Review API logs

2. **Verify API key:**
```bash
curl https://api.vapi.ai/assistant \
  -H "Authorization: Bearer $VAPI_PRIVATE_KEY"
```

3. **Check usage limits:**
- Log into Vapi Dashboard
- Check quota/limits
- Upgrade plan if needed

4. **Fallback plan:**
- Pause automated calling
- Queue leads for manual follow-up
- Notify clients of delay

---

## 🔥 **Common Disaster Scenarios**

### Scenario 1: Database Connection Lost

**Immediate Actions:**
1. Check `/health` endpoint
2. Review database health monitoring logs
3. Verify `DATABASE_URL` environment variable
4. Restart Postgres instance if needed

**Expected Recovery Time:** 5-10 minutes

---

### Scenario 2: All SMS Failing

**Immediate Actions:**
1. Check Twilio status page
2. Verify Twilio credentials
3. Check account balance
4. Test SMS with curl command

**Expected Recovery Time:** 2-5 minutes

**Mitigation:**
- System logs all failed SMS attempts
- Retry queue will automatically resend when service restored

---

### Scenario 3: Data Corruption After Bad Deployment

**Immediate Actions:**
1. Roll back to previous deployment immediately
2. Restore database from last backup
3. Review deployment logs for root cause
4. Test restored system thoroughly

**Expected Recovery Time:** 15-30 minutes

---

### Scenario 4: Complete Regional Outage (Render)

**Immediate Actions:**
1. Check [Render Status Page](https://status.render.com)
2. Prepare to migrate to backup region
3. Communicate downtime to clients
4. Monitor for restoration

**Expected Recovery Time:** 30 minutes - 2 hours (depends on Render)

**Prevention:**
- Consider multi-region deployment for critical clients
- Have cold standby in different region

---

## ✅ **Post-Recovery Checklist**

After any disaster recovery, complete this checklist:

### 1. System Verification
- [ ] `/health` endpoint returns "healthy"
- [ ] Database queries working
- [ ] All environment variables set
- [ ] Twilio SMS sending
- [ ] Vapi calls connecting
- [ ] Google Calendar sync working

### 2. Data Integrity
- [ ] Lead count matches expected
- [ ] Appointments still scheduled
- [ ] Call history intact
- [ ] Client configurations correct
- [ ] No duplicate records

### 3. Client Communication
- [ ] Notify affected clients of downtime
- [ ] Confirm all services restored
- [ ] Offer goodwill gesture if needed

### 4. Root Cause Analysis
- [ ] Document what went wrong
- [ ] Identify contributing factors
- [ ] Implement preventive measures
- [ ] Update runbook with lessons learned

### 5. System Hardening
- [ ] Review and update backup strategy
- [ ] Test failover procedures
- [ ] Update monitoring/alerting
- [ ] Schedule next disaster recovery drill

---

## 📞 **Emergency Command Reference**

### Quick Health Check
```bash
# Full system health
curl https://your-app.onrender.com/health | jq

# Database health
psql -h <host> -U <user> -d <db> -c "SELECT 1;"

# Twilio test
curl -X POST https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json \
  --data-urlencode "Body=Test" \
  --data-urlencode "From=$TWILIO_FROM_NUMBER" \
  --data-urlencode "To=+447XXXXXXXXX" \
  -u $TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN

# Vapi test
curl https://api.vapi.ai/assistant \
  -H "Authorization: Bearer $VAPI_PRIVATE_KEY"
```

### Emergency Shutdown (If Needed)
```bash
# Stop service (prevent further damage)
render services stop <service-id>

# Pause all cron jobs
# SSH into server and:
pkill -f "node-cron"
```

### Force Database Backup
```bash
# Manual backup before risky operation
pg_dump -h <host> -U <user> -d <db> \
  -F c -f emergency_backup_$(date +%Y%m%d_%H%M%S).dump
```

---

## 🎯 **Prevention Best Practices**

1. **Daily:**
   - Monitor `/health` endpoint
   - Check error logs
   - Review Twilio/Vapi usage

2. **Weekly:**
   - Verify automated backups
   - Test one recovery procedure
   - Review audit logs

3. **Monthly:**
   - Run full disaster recovery drill
   - Update this runbook
   - Review and rotate API keys

4. **Quarterly:**
   - Load test system
   - Security audit
   - Backup strategy review

---

## 📚 **Additional Resources**

- [Render Documentation](https://render.com/docs)
- [Postgres Backup Best Practices](https://www.postgresql.org/docs/current/backup.html)
- [Twilio Status Page](https://status.twilio.com)
- [Vapi Documentation](https://docs.vapi.ai)

---

**Last Updated:** October 11, 2025  
**Next Review:** January 11, 2026  
**Version:** 1.0

---

## 🚨 **REMEMBER:**

> **When in doubt, restore from backup!**  
> A few hours of old data is better than corrupted data.

> **Document everything!**  
> Future you will thank present you for detailed notes.

> **Test your backups regularly!**  
> A backup you haven't tested is not a backup.


