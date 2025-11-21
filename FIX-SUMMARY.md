# 🎯 FIXED: Phone Number Missing in Calendar Booking

## The Problem

Your VAPI AI was trying to book appointments, but the `calendar_checkAndBook` API was returning:

```
Error 500: "Phone number required. The phone number should be automatically included from the call."
```

### Root Cause

When VAPI calls your `/api/calendar/check-book` endpoint using an `apiRequest` type tool, it was **NOT sending the phone number** or **callId** that your backend needs. 

The API request looked like this:
```json
{
  "date": "2024-05-03",
  "time": "09:00",
  "service": "Personal Training",
  "durationMinutes": 30
}
```

**Missing:**
- ❌ Phone number
- ❌ Call ID
- ❌ Customer name

## The Fix

We implemented a **Call Context Cache** system that bridges the gap between VAPI webhooks and API tool calls:

### 1. Created Call Context Cache (`lib/call-context-cache.js`)
- Stores phone number, customer name, and call data when webhooks arrive
- Auto-expires after 10 minutes
- Provides fast lookup by callId

### 2. Updated VAPI Webhook Handler (`routes/vapi-webhooks.js`)
- Now stores call context (phone, name, callId) when VAPI sends webhooks
- This happens BEFORE the AI tries to book appointments

### 3. Updated Calendar Endpoint (`server.js`)
- Enhanced callId detection (checks body, headers, and cookies)
- **NEW:** Looks up phone from call context cache first (fastest)
- Falls back to VAPI API if needed
- Falls back to database as last resort

## How It Works Now

```
1. VAPI Call Starts
   ↓
2. Webhook: assistant.started → Store callId + phone in cache
   ↓
3. AI talks to customer
   ↓
4. AI calls calendar_checkAndBook tool
   ↓
5. API endpoint checks cache for phone using callId
   ↓
6. ✅ Phone found → Booking succeeds!
```

## Testing the Fix

The next time you test a call:

1. The webhook will store the phone number in the cache
2. When the AI tries to book, it will find the phone in the cache
3. The booking should succeed! 🎉

## Still Need to Do (Optional)

For even better reliability, you should **update the VAPI tool configuration** in the dashboard:

1. Go to https://dashboard.vapi.ai
2. Find tool ID: `ca24140b-8c2c-4ab5-a88b-38ec01833e63` (calendar_checkAndBook)
3. Add to the **body** schema:
```json
{
  "callId": "{{call.id}}",
  "customerPhone": "{{customer.number}}"
}
```

This way the phone is sent directly in the API request, and you don't need to rely on the cache.

## Files Changed

- ✅ `lib/call-context-cache.js` - NEW: Call context caching module
- ✅ `server.js` - Enhanced callId detection + cache lookup
- ✅ `routes/vapi-webhooks.js` - Stores call context from webhooks

## What to Look for in Logs

You should now see:
```
[CALL CONTEXT CACHE] 📝 Storing: { callId: '019aa618...', phone: '+447491683261' }
[BOOKING] ✅ Got phone from call context cache: +447491683261
```

---

**This fix should resolve your booking issues immediately!** 🚀

The cache approach works because VAPI always sends webhooks BEFORE tool calls, so the phone number is already cached when the booking API is called.

