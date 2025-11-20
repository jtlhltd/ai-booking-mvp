# 🧪 Real-World Testing Checklist

**Status:** Ready to test with actual leads  
**Last Updated:** After completing all code-based tests

---

## ✅ Pre-Flight Checks (Do These First)

### Environment Setup
- [ ] All environment variables are set (run `node scripts/monitor-system.js`)
- [ ] Server is running (`npm start` or your start command)
- [ ] Database is accessible
- [ ] Google Sheets credentials are configured
- [ ] VAPI API key is set
- [ ] Twilio credentials are set (if using SMS)

### Google Sheets Setup
- [ ] Run `node scripts/check-google-sheets.js` - should pass
- [ ] Verify spreadsheet ID is correct
- [ ] Check that service account has access to the sheet
- [ ] Verify headers are created correctly
- [ ] Test manual write to sheet (optional)

### VAPI Setup
- [ ] Assistant is configured in VAPI dashboard
- [ ] Webhook URL is set correctly in VAPI
- [ ] Test "Talk to Assistant" in VAPI dashboard works
- [ ] Verify phone number is configured
- [ ] Check system prompt is correct

---

## 🧪 Phase 1: Single Test Lead (Start Here)

### Submit Test Lead
- [ ] Run: `node scripts/test-submit-lead.js "Test Name" "+447491683261" "test@example.com" "your_client_key"`
- [ ] Verify lead appears in database
- [ ] Check server logs for processing

### Monitor Call
- [ ] Check VAPI dashboard - call should appear
- [ ] Wait for call to complete (or timeout)
- [ ] Verify webhook was received (check server logs)
- [ ] Check call transcript is captured
- [ ] Verify structured output is extracted

### Verify Data
- [ ] Check Google Sheet - new row should appear
- [ ] Verify all logistics fields are populated correctly
- [ ] Check database - call record should exist
- [ ] Verify call quality score is calculated
- [ ] Check follow-up sequence is triggered (if applicable)

### If Issues Found
- [ ] Check server error logs
- [ ] Verify webhook URL in VAPI dashboard
- [ ] Check Google Sheets permissions
- [ ] Verify environment variables
- [ ] Check database connection

---

## 🚀 Phase 2: Small Batch (5-10 Leads)

### Preparation
- [ ] Have list of 5-10 test leads ready
- [ ] Ensure all leads have valid phone numbers
- [ ] Verify client key is correct for all leads
- [ ] Set up monitoring (run `node scripts/monitor-system.js` in separate terminal)

### Submit Leads
- [ ] Submit leads one at a time or in small batches
- [ ] Monitor each submission
- [ ] Wait for calls to complete before submitting next batch

### Monitor Results
- [ ] Track call success rate
- [ ] Monitor data quality in Google Sheet
- [ ] Check for any errors in logs
- [ ] Verify all calls are processed
- [ ] Review call transcripts for quality

### Review Metrics
- [ ] Calculate call success rate
- [ ] Check booking/appointment rate
- [ ] Review call quality scores
- [ ] Identify common issues
- [ ] Note any patterns in failures

---

## 📈 Phase 3: Scale Testing (25-50 Leads)

### Before Scaling
- [ ] All issues from Phase 2 are resolved
- [ ] System is stable with 10 leads
- [ ] Data quality is acceptable
- [ ] No critical errors in logs

### Scale Gradually
- [ ] Start with 25 leads
- [ ] Monitor system performance
- [ ] Check for rate limiting issues
- [ ] Verify database can handle load
- [ ] Then scale to 50 leads

### Monitor Closely
- [ ] Watch server resources (CPU, memory)
- [ ] Monitor database performance
- [ ] Check Google Sheets API limits
- [ ] Watch for webhook delivery issues
- [ ] Track error rates

---

## 📊 Daily Monitoring Checklist

### Morning Check
- [ ] Run `node scripts/monitor-system.js`
- [ ] Check server logs for overnight errors
- [ ] Review Google Sheet for new data
- [ ] Check VAPI dashboard for failed calls
- [ ] Review call quality scores

### During Day
- [ ] Monitor real-time logs
- [ ] Watch for webhook failures
- [ ] Check data quality in Google Sheet
- [ ] Review call transcripts periodically
- [ ] Monitor system performance

### End of Day
- [ ] Review all calls from the day
- [ ] Calculate daily metrics
- [ ] Check for any issues
- [ ] Verify all data is in Google Sheet
- [ ] Review call quality trends

---

## 🔧 Troubleshooting Guide

### Issue: Lead not appearing in database
- [ ] Check API endpoint is correct
- [ ] Verify API key is valid
- [ ] Check server logs for errors
- [ ] Verify database connection

### Issue: Call not being made
- [ ] Check VAPI dashboard for call status
- [ ] Verify phone number format is correct
- [ ] Check VAPI API key is valid
- [ ] Verify assistant is active

### Issue: Webhook not received
- [ ] Check webhook URL in VAPI dashboard
- [ ] Verify server is accessible from internet
- [ ] Check server logs for incoming requests
- [ ] Test webhook endpoint manually

### Issue: Google Sheet not updating
- [ ] Run `node scripts/check-google-sheets.js`
- [ ] Verify spreadsheet ID is correct
- [ ] Check service account permissions
- [ ] Review Google Sheets API logs

### Issue: Data quality problems
- [ ] Review call transcripts
- [ ] Check logistics extraction logic
- [ ] Verify structured output format
- [ ] Review extraction patterns

---

## 📝 Success Criteria

### System is Ready When:
- ✅ All test leads are processed successfully
- ✅ Data appears correctly in Google Sheet
- ✅ Call quality scores are reasonable (>6/10)
- ✅ No critical errors in logs
- ✅ Webhooks are received reliably
- ✅ System handles 10+ leads without issues

### System Needs Work When:
- ❌ More than 10% of calls fail
- ❌ Data quality score < 6/10
- ❌ Frequent webhook failures
- ❌ Google Sheet updates are inconsistent
- ❌ System errors occur regularly

---

## 🎯 Next Steps After Testing

1. **Optimize Based on Results**
   - Review call transcripts
   - Improve system prompt
   - Adjust extraction patterns
   - Fix any identified issues

2. **Scale Gradually**
   - Start with small batches
   - Monitor closely
   - Scale up as confidence grows

3. **Automate Monitoring**
   - Set up alerts for errors
   - Create dashboards
   - Schedule daily reports

---

## 💡 Quick Commands Reference

```bash
# Submit a test lead
node scripts/test-submit-lead.js "Name" "+447491683261" "email@example.com" "client_key"

# Monitor system
node scripts/monitor-system.js

# Check Google Sheets
node scripts/check-google-sheets.js

# Check server logs (if using PM2)
pm2 logs

# Check database
sqlite3 data/app.db "SELECT COUNT(*) FROM leads;"
```

---

**Remember:** Start small, monitor closely, scale gradually! 🚀



