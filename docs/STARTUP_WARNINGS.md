# Startup Warnings & Errors - Troubleshooting Guide

This document explains common warnings and errors you might see when starting the server, and how to fix them.

## ⚠️ Google Calendar Initialization Failed

**Error:**
```
⚠️ Google Calendar initialization failed: Invalid private key format - missing BEGIN PRIVATE KEY
```

**What it means:**
- The system is trying to initialize Google Calendar integration but the private key format is incorrect
- **This is a warning only** - the system will still work, but calendar booking features won't be available

**How to fix:**
1. Check your `.env` file has `GOOGLE_PRIVATE_KEY_B64` set (base64 encoded private key)
2. Or set `GOOGLE_PRIVATE_KEY` with the full private key including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`
3. Make sure the private key is properly formatted with newlines (use `\n` in .env or decode from base64)

**If you don't need calendar booking:**
- You can ignore this warning - the system will work fine without it
- Calendar booking features will simply be unavailable

---

## 🔴 Foreign Key Constraint Violation (FIXED)

**Error:**
```
[AUDIT LOG ERROR] error: insert or update on table "security_events" violates foreign key constraint
Key (client_key)=(unknown) is not present in table "tenants".
```

**What it means:**
- The security logging system was trying to log events for clients that don't exist in the database
- This happened when accessing the dashboard without a valid client key

**Status:** ✅ **FIXED**
- The code now skips logging for 'unknown' or 'anonymous' client keys
- It also verifies the client exists before logging
- Errors are now handled gracefully without breaking the main request

**If you still see this error:**
- Restart your server to pick up the fix
- The error should no longer appear

---

## ⏱️ Slow API Call Warning

**Warning:**
```
[PERF] Slow API call detected (2139ms): GET /api/clients/stay-focused-fitness-chris
```

**What it means:**
- The first API call took longer than expected (over 2 seconds)
- This is usually just **first-time cache warming** - subsequent calls will be much faster

**Why it happens:**
- First database query needs to establish connection
- Cache is being populated
- Subsequent calls use cached results and are much faster

**Is this a problem?**
- **No** - this is normal for the first request
- Subsequent requests should be under 100ms
- If you see slow calls consistently, check your database connection

**To verify it's working:**
- Make another request to the same endpoint
- It should be much faster (under 100ms)
- Check the logs for `[DB CACHE] Serving cached query result`

---

## ✅ Normal Startup Messages

These messages are **normal** and indicate the system is working correctly:

- `✅ Postgres connection successful` - Database connected
- `✅ Database initialized` - Database ready
- `✅ Environment validation passed` - All required config is present
- `[MIGRATIONS] Complete: 0 applied, 14 skipped` - Database schema is up to date
- `[DB CACHE] Cached query result` - Performance optimization working
- `[CRON] ⏰ Processing appointment reminders...` - Background jobs running

---

## 🚀 Quick Health Check

After starting the server, verify everything is working:

1. **Database:** Should see `✅ DB: Postgres connected`
2. **No critical errors:** Only warnings about optional features (like Google Calendar)
3. **Server listening:** Should see `AI Booking System listening on http://localhost:3000`
4. **Test the dashboard:** Visit `http://localhost:3000/client-dashboard.html?client=your-client-key`

If you see errors that aren't covered here, check:
- Your `.env` file has all required variables
- Your database connection string is correct
- Your database is running and accessible








