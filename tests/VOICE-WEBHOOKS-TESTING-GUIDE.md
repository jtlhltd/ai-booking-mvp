# Voice Webhooks Testing Guide

## Overview
This guide explains how to test voicemail processing and callback scheduling webhooks.

## Test Scripts Available

1. **`test-voicemail-webhook.ps1`** - Tests voicemail processing only
2. **`test-callback-webhook.ps1`** - Tests callback scheduling only  
3. **`test-voice-webhooks-complete.ps1`** - Tests both in sequence

## Prerequisites

### 1. Client Setup
- You need at least one client configured in the database
- The client's phone number must match the `To` number in your test
- The client should have business hours configured (for callback scheduling)

### 2. Phone Numbers
- **From**: Caller's phone number (can be any test number)
- **To**: Your Twilio number that matches a client's configuration

### 3. CallSid
- For best results, use a real CallSid from an actual inbound call
- The system will try to find the client from the `To` phone number
- If a CallSid exists in `inbound_calls` table, it will use that client

## Testing Methods

### Method 1: Quick Test (Simulated Webhooks)
**Best for**: Quick verification that endpoints work

```powershell
# Run the complete test
.\tests\test-voice-webhooks-complete.ps1
```

**What it does:**
- Sends simulated webhook payloads
- Tests both voicemail and callback endpoints
- Uses test CallSids (may not find client if phone number doesn't match)

**Limitations:**
- May fail client identification if phone number doesn't match
- Won't have real transcription data
- Twilio signature validation may fail (but should still work if AUTH_TOKEN not set)

### Method 2: Real Test (Actual Twilio Call)
**Best for**: End-to-end testing with real data

**Steps:**
1. Make an actual call to your Twilio number
2. Let it go to voicemail (or press 1 for callback)
3. Use the real CallSid from that call in the test scripts
4. Update the test scripts with the real CallSid and RecordingSid

### Method 3: Manual Webhook Testing
**Best for**: Testing specific scenarios

Use curl or Postman to send webhook payloads:

```bash
# Voicemail webhook
curl -X POST https://ai-booking-mvp.onrender.com/webhooks/twilio-voice-recording \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA1234567890abcdef1234567890abcdef" \
  -d "RecordingUrl=https://api.twilio.com/2010-04-01/Accounts/ACxxx/Recordings/RE123" \
  -d "RecordingSid=RE1234567890abcdef1234567890abcdef" \
  -d "RecordingDuration=45" \
  -d "From=+447491683261" \
  -d "To=+447403934440" \
  -d "AccountSid=AC70407e0f0d15f286b3a9977c5312e1e5"

# Callback webhook
curl -X POST https://ai-booking-mvp.onrender.com/webhooks/twilio-voice-callback \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA1234567890abcdef1234567890abcdef" \
  -d "Digits=1" \
  -d "From=+447491683261" \
  -d "To=+447403934440" \
  -d "AccountSid=AC70407e0f0d15f286b3a9977c5312e1e5"
```

## What to Check After Testing

### 1. Render Logs
Check for:
- `[TWILIO VOICE RECORDING]` - Voicemail processing logs
- `[TWILIO VOICE CALLBACK]` - Callback processing logs
- Any error messages

### 2. Database Records
Check these tables:

**messages table:**
```sql
SELECT * FROM messages 
WHERE call_id = 'YOUR_CALLSID' 
ORDER BY created_at DESC;
```

**inbound_calls table:**
```sql
SELECT * FROM inbound_calls 
WHERE call_sid = 'YOUR_CALLSID';
```

**retry_queue table:**
```sql
SELECT * FROM retry_queue 
WHERE retry_type = 'callback' 
ORDER BY created_at DESC;
```

### 3. Client Notifications
- Check client's email for voicemail/callback notifications
- Check client's SMS for notifications
- Check caller's SMS for callback confirmation

## Troubleshooting

### Issue: "Client not found"
**Solution:**
- Ensure the `To` phone number matches a client's configured number
- Check `tenants` table for phone number mappings
- Or create an inbound call record first with the client_key

### Issue: "Invalid Twilio signature"
**Solution:**
- For testing, you can temporarily disable validation
- Or use Twilio's webhook testing tool with proper signatures
- The system will warn but continue if AUTH_TOKEN is not set

### Issue: "Transcription not available"
**Solution:**
- Real transcriptions take a few seconds to process
- For testing, the system will use "Transcription processing..." as placeholder
- Wait a few seconds and check again

## Expected Behavior

### Voicemail Processing:
1. ✅ Webhook received and acknowledged
2. ✅ Client identified from phone number
3. ✅ Transcription fetched (if available)
4. ✅ Message stored in `messages` table
5. ✅ `inbound_calls` record updated
6. ✅ Client notified via email/SMS

### Callback Scheduling:
1. ✅ Webhook received and TwiML response sent
2. ✅ Client identified from phone number
3. ✅ Preferred callback time calculated
4. ✅ Callback request stored in `messages` table
5. ✅ Added to `retry_queue` for processing
6. ✅ `inbound_calls` record updated
7. ✅ Client notified via email/SMS
8. ✅ Caller receives confirmation SMS

## Next Steps

After testing, verify:
- [ ] Voicemail messages appear in client dashboard
- [ ] Callback requests are scheduled correctly
- [ ] Notifications are sent to clients
- [ ] Callback confirmations are sent to callers
- [ ] Database records are created correctly

