# Debugging Instructions

## Current Status
- ✅ Code deployed (commit 251ccb6)
- ✅ Webhook receiving requests (HTTP 200)
- ✅ GOOGLE_SA_JSON_BASE64 configured
- ❓ Data not writing to Google Sheet

## Next Steps to Debug

### 1. Check Render Logs Manually
Go to: https://dashboard.render.com/web/srv-d2vvdqbuibrs73dq57ug/logs

Look for these log entries (most recent):
- `[VAPI WEBHOOK] ==================== NEW WEBHOOK RECEIVED ====================`
- `[LOGISTICS DEBUG] Status received:` 
- `[LOGISTICS] STARTING EXTRACTION...`
- `[LOGISTICS SHEET APPEND] ✅ SUCCESS` or `❌ FAILED`

### 2. Check if Extraction is Running
If you see `[LOGISTICS SHEET APPEND ERROR] ❌ FAILED`, copy the error message.

### 3. If No LOGISTICS Logs Appear
The extraction isn't triggering. Possible causes:
- Status is not 'completed' 
- Transcript is empty
- Condition check failing

### 4. Test Again with Current Code
Run this test webhook script to get fresh logs:
```bash
node test-direct-webhook.js
```

Then immediately check the Render logs at the URL above.

### 5. Share the Results
Send me:
1. Whether you see LOGISTICS logs or not
2. Any error messages
3. Whether data appears in the Google Sheet

## What to Look For in Logs

✅ **Good signs:**
- `[LOGISTICS] STARTING EXTRACTION...`
- `[LOGISTICS SHEET] Attempting to append to sheet:`
- `[LOGISTICS SHEET APPEND] ✅ SUCCESS`

❌ **Bad signs:**
- `[LOGISTICS SKIP]` messages
- `[LOGISTICS SHEET APPEND ERROR]`
- No LOGISTICS logs at all

## Expected Log Sequence

1. `[VAPI WEBHOOK] ==================== NEW WEBHOOK RECEIVED ====================`
2. `[LOGISTICS SHEET ID DEBUG]` - Shows sheet ID and conditions
3. `[LOGISTICS DEBUG] Status received: completed`
4. `[LOGISTICS] STARTING EXTRACTION...` (if conditions met)
5. `[LOGISTICS SHEET] Attempting to append to sheet:`
6. `[LOGISTICS SHEET APPEND] ✅ SUCCESS` or error

