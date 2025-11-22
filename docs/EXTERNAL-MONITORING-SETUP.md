# External Uptime Monitoring Setup Guide

## Why External Monitoring?

Your system has internal health checks, but if Render has a regional outage or your server crashes, you won't know until clients complain. External monitoring services ping your server from multiple locations worldwide and alert you immediately if it's down.

## Recommended Services

### 1. UptimeRobot (Free - Recommended)
- **Free tier:** 50 monitors, 5-minute intervals
- **Paid tier:** $7/month for 1-minute intervals
- **Setup time:** 5 minutes

**Steps:**
1. Go to [UptimeRobot.com](https://uptimerobot.com) and sign up
2. Click "Add New Monitor"
3. Configure:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** AI Booking MVP
   - **URL:** `https://ai-booking-mvp.onrender.com/health`
   - **Monitoring Interval:** 5 minutes (free) or 1 minute (paid)
   - **Alert Contacts:** Add your email
4. Click "Create Monitor"
5. Done! You'll get email alerts if your server goes down

### 2. Pingdom (Free Trial)
- **Free trial:** 30 days
- **Paid:** $10/month
- **Features:** More detailed analytics

### 3. StatusCake (Free)
- **Free tier:** 10 monitors, 5-minute intervals
- **Setup:** Similar to UptimeRobot

## What to Monitor

### Essential Endpoints:
1. **Health Check:** `https://ai-booking-mvp.onrender.com/health`
   - Should return 200 status
   - Confirms server is running

2. **Detailed Health:** `https://ai-booking-mvp.onrender.com/api/health/detailed`
   - More comprehensive check
   - Includes database, Twilio, VAPI status

### Optional Endpoints:
- `/api/test` - Quick connectivity test
- `/dashboard/:clientKey` - Frontend accessibility

## Alert Configuration

### Recommended Alert Settings:
- **Down Alert:** Immediate (as soon as monitor fails)
- **Up Alert:** After 1 successful check
- **Alert Channels:** Email + SMS (if available)

### Alert Message Example:
```
🚨 AI Booking MVP is DOWN!

URL: https://ai-booking-mvp.onrender.com/health
Status: Failed
Time: 2025-11-22 14:30:00 UTC

Check Render dashboard for service status.
```

## Testing Your Monitor

1. **Test Down Alert:**
   - Temporarily stop your Render service
   - Wait for monitor to detect (5 minutes)
   - Verify you receive alert
   - Restart service

2. **Test Up Alert:**
   - After service comes back up
   - Verify you receive "service is back up" alert

## Integration with Existing Alerts

Your system already has:
- ✅ Internal health checks (every 5 minutes)
- ✅ Error email alerts (via YOUR_EMAIL)
- ✅ Database health monitoring

External monitoring adds:
- ✅ Detection even if server is completely down
- ✅ Multiple geographic locations
- ✅ Independent of your server (can't fail if server fails)

## Cost

- **UptimeRobot Free:** $0/month (perfect for MVP)
- **UptimeRobot Pro:** $7/month (1-minute checks)
- **Pingdom:** $10/month
- **StatusCake Free:** $0/month

**Recommendation:** Start with UptimeRobot free tier. Upgrade if you need faster detection.

## Next Steps

1. Set up UptimeRobot (5 minutes)
2. Test alerts (stop/start service)
3. Add to your monitoring dashboard
4. Consider upgrading if you need 1-minute checks

---

**Last Updated:** November 22, 2025

