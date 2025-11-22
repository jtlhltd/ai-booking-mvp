# AI Booking System - Disaster Recovery Plan

## Overview

This document outlines the disaster recovery procedures for the AI Booking System, including recovery time objectives (RTO) and recovery point objectives (RPO).

**RTO (Recovery Time Objective):** 4 hours  
**RPO (Recovery Point Objective):** 24 hours (daily backups)

---

## Disaster Scenarios

### Scenario 1: Complete Service Failure

**Description:** Entire service is down, unable to start, or unreachable.

**Impact:**
- All clients unable to use service
- No new bookings can be made
- Existing appointments may be affected

**Recovery Steps:**

1. **Immediate (0-15 minutes):**
   - Verify service status in Render dashboard
   - Check error logs
   - Attempt service restart

2. **Short-term (15-60 minutes):**
   - If restart fails, review recent deployments
   - Rollback to last known good version
   - Verify environment variables
   - Check external dependencies

3. **Medium-term (1-4 hours):**
   - If rollback fails, restore from backup
   - Redeploy from stable commit
   - Verify all integrations
   - Test critical endpoints

4. **Communication:**
   - Notify clients of outage
   - Provide status updates every 30 minutes
   - Set recovery expectations

**Recovery Time:** 1-4 hours

---

### Scenario 2: Database Corruption or Loss

**Description:** Database is corrupted, data is lost, or database is unreachable.

**Impact:**
- All data inaccessible
- Service cannot function
- Historical data may be lost

**Recovery Steps:**

1. **Immediate (0-15 minutes):**
   - Stop all writes to database
   - Verify database status
   - Check backup availability

2. **Short-term (15-60 minutes):**
   - Restore from most recent backup
   - Verify data integrity
   - Check for data loss

3. **Medium-term (1-4 hours):**
   - If backup restore fails, contact Render support
   - Request point-in-time recovery
   - Verify restored data
   - Resume service operations

4. **Data Recovery:**
   - Identify missing data
   - Attempt to recover from logs
   - Replay critical transactions if possible
   - Document data loss

**Recovery Time:** 2-4 hours  
**Data Loss:** Up to 24 hours (last backup)

---

### Scenario 3: External Service Failure

**Description:** Critical external service (Twilio, VAPI, Google Calendar) is down.

**Impact:**
- Partial functionality loss
- SMS/calls may not work
- Calendar integration may fail

**Recovery Steps:**

1. **Immediate (0-15 minutes):**
   - Verify external service status
   - Check service provider status pages
   - Enable fallback mechanisms if available

2. **Short-term (15-60 minutes):**
   - Queue operations for retry
   - Notify clients of service degradation
   - Monitor service provider updates

3. **Medium-term (1-4 hours):**
   - Implement temporary workarounds
   - Use alternative services if available
   - Document workarounds

4. **Long-term:**
   - Review service provider reliability
   - Consider multi-provider strategy
   - Update architecture for resilience

**Recovery Time:** Depends on external service (typically 1-4 hours)

---

### Scenario 4: Security Breach

**Description:** Unauthorized access, data breach, or security incident.

**Impact:**
- Potential data exposure
- Service may need to be taken offline
- Client trust may be affected

**Recovery Steps:**

1. **Immediate (0-15 minutes):**
   - Isolate affected systems
   - Change all API keys and credentials
   - Preserve logs for investigation
   - Notify security team

2. **Short-term (15-60 minutes):**
   - Assess scope of breach
   - Review access logs
   - Identify compromised data
   - Notify affected clients

3. **Medium-term (1-4 hours):**
   - Patch security vulnerabilities
   - Restore from clean backup if needed
   - Implement additional security measures
   - Resume service with enhanced security

4. **Long-term:**
   - Conduct security audit
   - Update security procedures
   - Review access controls
   - Document lessons learned

**Recovery Time:** 2-8 hours (depending on severity)

---

### Scenario 5: Data Center Failure

**Description:** Render data center failure or regional outage.

**Impact:**
- Complete service unavailability
- May require migration to new region

**Recovery Steps:**

1. **Immediate (0-15 minutes):**
   - Verify Render status
   - Check Render status page
   - Contact Render support

2. **Short-term (15-60 minutes):**
   - Wait for Render recovery
   - If extended outage, prepare for migration
   - Notify clients of extended outage

3. **Medium-term (1-4 hours):**
   - If migration needed:
     - Export database backup
     - Deploy to new region
     - Update DNS/URLs
     - Verify functionality

4. **Long-term:**
   - Consider multi-region deployment
   - Review disaster recovery procedures
   - Update documentation

**Recovery Time:** 2-8 hours (depending on Render recovery time)

---

## Backup Strategy

### Automated Backups

- **Frequency:** Daily (automated by Render Postgres)
- **Retention:** 7 days
- **Location:** Render-managed backups
- **Verification:** Automated via `/api/backup-status`

### Manual Backups

**When to create:**
- Before major deployments
- Before schema changes
- Before data migrations
- Weekly for critical data

**Procedure:**
```bash
# Export database
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Verify backup
pg_restore --list backup_file.sql

# Store in secure location
# - Encrypted storage
# - Off-site backup
# - Version control for schema
```

### Backup Verification

**Daily Checks:**
- Automated backup status check
- Verify backup age < 24 hours
- Test restore procedure monthly

**Monthly Tests:**
- Full restore test
- Verify data integrity
- Test recovery procedures
- Update documentation

---

## Recovery Procedures

### Database Restore

1. **Stop service:**
   ```bash
   # In Render dashboard, pause service
   ```

2. **Restore database:**
   ```bash
   psql $DATABASE_URL < backup_file.sql
   ```

3. **Verify restore:**
   ```sql
   -- Check critical tables
   SELECT COUNT(*) FROM tenants;
   SELECT COUNT(*) FROM leads;
   SELECT COUNT(*) FROM appointments;
   SELECT COUNT(*) FROM calls;
   ```

4. **Resume service:**
   ```bash
   # In Render dashboard, resume service
   ```

5. **Test functionality:**
   - Test booking flow
   - Verify webhooks
   - Check integrations

### Service Redeployment

1. **Identify last known good commit:**
   ```bash
   git log --oneline -10
   ```

2. **Rollback to stable version:**
   ```bash
   git checkout <stable-commit>
   git push --force
   ```

3. **Verify deployment:**
   - Check health endpoints
   - Test critical features
   - Monitor error rates

### Point-in-Time Recovery

**For Render Postgres:**

1. Contact Render support
2. Provide:
   - Timestamp for recovery
   - Database name
   - Reason for recovery
3. Render will restore database
4. Verify restored data
5. Resume service operations

---

## Communication Plan

### Internal Communication

- **Slack Channel:** #incidents
- **Email:** alerts@aibookingsystem.com
- **Status Page:** Update every 30 minutes during incident

### Client Communication

**Template:**
```
Subject: Service Update - [Incident Type]

We are currently experiencing [brief description] affecting [scope].

Current Status: [Status]
Expected Resolution: [Time]
Impact: [What's affected]

We will provide updates every 30 minutes until resolved.

Thank you for your patience.
```

### Communication Timeline

- **0-15 min:** Internal notification
- **15-30 min:** Client notification (if P0/P1)
- **Every 30 min:** Status updates
- **Resolution:** Final update with summary

---

## Testing & Drills

### Quarterly DR Drills

**Test Scenarios:**
1. Database restore test
2. Service redeployment test
3. External service failure simulation
4. Security incident response

**Procedure:**
1. Schedule drill (off-peak hours)
2. Simulate disaster scenario
3. Execute recovery procedures
4. Document results
5. Update procedures based on learnings

### Monthly Backup Verification

1. Test restore from backup
2. Verify data integrity
3. Check backup age
4. Review backup retention
5. Update backup procedures

---

## Prevention Measures

### Redundancy

- **Database:** Daily automated backups
- **Code:** Git version control
- **Configuration:** Environment variables in Render
- **Monitoring:** Multiple alert channels

### Monitoring

- **Uptime Monitoring:** External service (UptimeRobot/Pingdom)
- **Error Monitoring:** Automated alerts
- **Performance Monitoring:** Query performance tracking
- **Health Checks:** Automated health endpoints

### Documentation

- **Runbooks:** Operational procedures
- **Architecture:** System documentation
- **API Docs:** Complete API documentation
- **DR Plan:** This document

---

## Recovery Metrics

### RTO (Recovery Time Objective)

- **Target:** 4 hours
- **Current:** 2-4 hours (depending on scenario)
- **Improvement:** Multi-region deployment

### RPO (Recovery Point Objective)

- **Target:** 24 hours
- **Current:** 24 hours (daily backups)
- **Improvement:** More frequent backups for critical data

### Availability Target

- **Target:** 99.9% uptime
- **Current:** ~99.5% (with planned maintenance)
- **Improvement:** Better monitoring and faster recovery

---

## Post-Recovery

### Verification Checklist

- [ ] All services operational
- [ ] Database integrity verified
- [ ] Critical endpoints tested
- [ ] External integrations working
- [ ] No data loss (or documented)
- [ ] Clients notified
- [ ] Monitoring restored

### Post-Mortem

1. **Schedule meeting** within 48 hours
2. **Document:**
   - Timeline of events
   - Root cause analysis
   - Impact assessment
   - Recovery actions taken
   - Lessons learned
3. **Action Items:**
   - Prevent recurrence
   - Update procedures
   - Improve monitoring
   - Update documentation

---

## Contacts

### Emergency Contacts

- **Render Support:** support@render.com
- **Twilio Support:** https://support.twilio.com
- **VAPI Support:** support@vapi.ai
- **On-Call Engineer:** [Contact Info]

### Escalation

1. **Level 1:** Development team
2. **Level 2:** Infrastructure team
3. **Level 3:** Management

---

**Last Updated:** 2025-11-22  
**Version:** 1.0  
**Next Review:** 2026-02-22

