# AI Booking System - Operational Runbooks

## Table of Contents
1. [Incident Response](#incident-response)
2. [Database Issues](#database-issues)
3. [Service Degradation](#service-degradation)
4. [High Error Rates](#high-error-rates)
5. [Performance Issues](#performance-issues)
6. [Backup & Restore](#backup--restore)
7. [Disaster Recovery](#disaster-recovery)

---

## Incident Response

### Severity Levels

**P0 - Critical (Immediate Response)**
- System completely down
- Data loss or corruption
- Security breach
- All clients affected

**P1 - High (Response within 1 hour)**
- Partial system outage
- Major feature broken
- Multiple clients affected
- High error rate (>10%)

**P2 - Medium (Response within 4 hours)**
- Minor feature issues
- Single client affected
- Performance degradation
- Moderate error rate (5-10%)

**P3 - Low (Response within 24 hours)**
- Cosmetic issues
- Minor performance impact
- Low error rate (<5%)

### Response Procedure

1. **Acknowledge** - Confirm incident in monitoring system
2. **Assess** - Determine severity and impact
3. **Contain** - Stop the bleeding (disable feature, rollback, etc.)
4. **Investigate** - Root cause analysis
5. **Resolve** - Fix the issue
6. **Verify** - Confirm fix works
7. **Document** - Update runbooks with learnings

---

## Database Issues

### High Connection Pool Utilization

**Symptoms:**
- Alerts: "Database connection pool utilization high"
- Slow queries
- Timeout errors

**Resolution:**
1. Check current pool status:
   ```bash
   GET /api/database/connection-limit
   ```

2. Review slow queries:
   ```bash
   GET /api/performance/queries/slow
   ```

3. Check active connections:
   ```sql
   SELECT count(*) FROM pg_stat_activity;
   ```

4. **Immediate Actions:**
   - Increase `DB_POOL_MAX` if under limit
   - Kill long-running queries if necessary
   - Restart service to clear stuck connections

5. **Long-term:**
   - Optimize slow queries
   - Add database indexes
   - Consider read replicas

### Database Connection Failures

**Symptoms:**
- "Connection refused" errors
- "Too many connections" errors
- Service unable to start

**Resolution:**
1. Check database status in Render dashboard
2. Verify `DATABASE_URL` environment variable
3. Check database is not paused (Render free tier)
4. Review connection pool configuration
5. Restart service if needed

### Query Performance Issues

**Symptoms:**
- Slow API responses
- Timeout errors
- High database CPU usage

**Resolution:**
1. Identify slow queries:
   ```bash
   GET /api/performance/queries/recommendations
   ```

2. Review query recommendations
3. Add missing indexes
4. Optimize query logic
5. Consider caching frequently accessed data

---

## Service Degradation

### High Error Rates

**Symptoms:**
- Error rate > 5%
- Multiple failed requests
- Client complaints

**Resolution:**
1. Check error logs:
   ```bash
   GET /api/health/detailed
   ```

2. Review error monitoring dashboard
3. Check external service status (Twilio, VAPI, Google Calendar)
4. Review recent deployments
5. Check rate limiting status:
   ```bash
   GET /api/rate-limit/status
   ```

6. **Actions:**
   - Rollback recent deployment if needed
   - Disable problematic features
   - Increase rate limits if legitimate traffic
   - Contact external service providers if needed

### Slow Response Times

**Symptoms:**
- API response time > 2 seconds
- Timeout errors
- Client complaints

**Resolution:**
1. Check query performance:
   ```bash
   GET /api/performance/queries/stats
   ```

2. Review cache hit rate:
   ```bash
   GET /api/cache/stats
   ```

3. Check database pool utilization
4. Review recent code changes
5. **Actions:**
   - Optimize slow queries
   - Increase cache TTL
   - Scale up service if needed
   - Add database indexes

---

## Performance Issues

### Memory Leaks

**Symptoms:**
- Gradually increasing memory usage
- Service crashes after extended uptime
- OOM (Out of Memory) errors

**Resolution:**
1. Review memory usage in monitoring
2. Check for unclosed connections
3. Review cache size limits
4. Check for memory leaks in code
5. Restart service if needed
6. Consider increasing service memory limit

### CPU Spikes

**Symptoms:**
- High CPU usage (>80%)
- Slow response times
- Service unresponsive

**Resolution:**
1. Identify CPU-intensive operations
2. Check for infinite loops
3. Review query performance
4. Check for excessive logging
5. Optimize hot paths
6. Scale up service if needed

---

## Backup & Restore

### Automated Backups

Render Postgres creates automatic daily backups. Verify backup status:

```bash
GET /api/backup-status
```

### Manual Backup

1. **Export database:**
   ```bash
   pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Verify backup:**
   ```bash
   pg_restore --list backup_file.sql
   ```

### Restore Procedure

1. **Stop service** (if needed)
2. **Restore database:**
   ```bash
   psql $DATABASE_URL < backup_file.sql
   ```

3. **Verify restore:**
   - Check critical tables have data
   - Test key endpoints
   - Verify client data integrity

4. **Start service**

### Point-in-Time Recovery

For Render Postgres:
1. Contact Render support
2. Provide timestamp for recovery
3. Render will restore to that point
4. Verify data integrity

---

## Disaster Recovery

### Complete System Failure

**Scenario:** Entire system is down, database corrupted, or data center failure.

**Recovery Steps:**

1. **Assess Damage:**
   - Check service status
   - Verify database availability
   - Review recent changes

2. **Restore from Backup:**
   - Use most recent backup
   - Restore database
   - Verify data integrity

3. **Restore Service:**
   - Redeploy from last known good commit
   - Verify environment variables
   - Test critical endpoints

4. **Verify Functionality:**
   - Test booking flow
   - Verify webhooks
   - Check external integrations

5. **Notify Clients:**
   - Communicate outage
   - Provide status updates
   - Set expectations

### Data Corruption

**Symptoms:**
- Inconsistent data
- Missing records
- Foreign key violations

**Resolution:**
1. **Stop writes** (if possible)
2. **Identify corruption scope**
3. **Restore from backup**
4. **Replay transactions** (if transaction log available)
5. **Verify data integrity**
6. **Resume operations**

### Security Breach

**Immediate Actions:**
1. **Isolate affected systems**
2. **Change all API keys**
3. **Review access logs**
4. **Notify affected clients**
5. **Engage security team**
6. **Document incident**

---

## Monitoring & Alerts

### Key Metrics to Monitor

- **Error Rate:** Should be < 1%
- **Response Time:** P95 should be < 500ms
- **Database Pool:** Should be < 80% utilization
- **Cache Hit Rate:** Should be > 70%
- **Uptime:** Should be > 99.9%

### Alert Thresholds

- **Critical:** Error rate > 10%, system down
- **Warning:** Error rate 5-10%, slow queries
- **Info:** Error rate 1-5%, performance degradation

### Health Check Endpoints

- `/health/lb` - Load balancer health check
- `/api/health/detailed` - Comprehensive health check
- `/api/performance/queries/stats` - Query performance
- `/api/cache/stats` - Cache statistics
- `/api/rate-limit/status` - Rate limiting status

---

## Escalation

### When to Escalate

- P0 incidents unresolved after 30 minutes
- P1 incidents unresolved after 2 hours
- Data loss or security breach
- Multiple clients affected
- External service provider issues

### Escalation Contacts

- **Primary:** Development team lead
- **Secondary:** Infrastructure team
- **Emergency:** On-call engineer

---

## Post-Incident

### Post-Mortem Process

1. **Schedule meeting** within 48 hours
2. **Document:**
   - Timeline of events
   - Root cause
   - Impact assessment
   - Actions taken
   - Lessons learned
3. **Action Items:**
   - Prevent recurrence
   - Update runbooks
   - Improve monitoring
   - Update documentation

---

## Quick Reference

### Common Commands

```bash
# Health check
curl https://ai-booking-mvp.onrender.com/health/lb

# Query performance
curl -H "X-API-Key: $API_KEY" \
  https://ai-booking-mvp.onrender.com/api/performance/queries/stats

# Rate limit status
curl -H "X-API-Key: $API_KEY" \
  https://ai-booking-mvp.onrender.com/api/rate-limit/status

# Cache stats
curl -H "X-API-Key: $API_KEY" \
  https://ai-booking-mvp.onrender.com/api/cache/stats
```

### Emergency Contacts

- **Render Support:** support@render.com
- **Twilio Support:** https://support.twilio.com
- **VAPI Support:** support@vapi.ai

---

**Last Updated:** 2025-11-22  
**Version:** 1.0

