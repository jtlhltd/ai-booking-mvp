# ✅ Post-Deployment Verification Checklist

**Your receptionist system is deployed! Let's verify everything works.**

---

## 🔍 Step 1: Check Migration Ran

Look in Render logs for:
```
[MIGRATIONS] ✅ add-inbound-call-support.sql applied successfully
```

**Or test directly:**
```bash
# In Render Shell or via API
curl https://your-app.onrender.com/api/migrations/status \
  -H "X-API-Key: YOUR_KEY"
```

**Expected:** Should show `add-inbound-call-support.sql` as applied.

---

## 🔍 Step 2: Verify Tables Created

**Test query in Render Shell:**
```bash
psql $DATABASE_URL -c "\dt" | grep -E "(inbound_calls|customer_profiles|messages|business_info|business_faqs)"
```

**Or test via API:**
```bash
# Try to create business info (will create table if needed)
curl -X PUT https://your-app.onrender.com/api/receptionist/YOUR_CLIENT_KEY/business-info \
  -H "X-API-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"hours": {"start": 9, "end": 17, "days": [1,2,3,4,5]}}'
```

**Expected:** `{"success": true}`

---

## 🔍 Step 3: Test New Endpoints

### Test Business Info
```bash
curl "https://your-app.onrender.com/api/receptionist/YOUR_CLIENT_KEY/business-info" \
  -H "X-API-Key: YOUR_KEY"
```

**Expected:** `{"success": true, "info": {...}}`

### Test Appointment Lookup
```bash
curl "https://your-app.onrender.com/api/appointments/YOUR_CLIENT_KEY/lookup?phone=+447700900123" \
  -H "X-API-Key: YOUR_KEY"
```

**Expected:** `{"success": true, "count": X, "appointments": [...]}`

### Test Customer Profile
```bash
curl "https://your-app.onrender.com/api/receptionist/YOUR_CLIENT_KEY/customer/+447700900123" \
  -H "X-API-Key: YOUR_KEY"
```

**Expected:** `{"success": true, "profile": {...}}` or `{"success": false, "error": "Customer not found"}`

---

## 🔍 Step 4: Verify Vapi Function Handlers

**Check logs for function handling:**
Look for:
```
[VAPI WEBHOOK] Processing tool calls: X
[VAPI FUNCTIONS] Handling function: lookup_customer
```

**Or trigger a test call:**
If you have a Vapi assistant configured, make a test call and check webhook logs.

---

## 🎯 Step 5: Configure for Production

### 1. Add Business Info

```bash
curl -X PUT https://your-app.onrender.com/api/receptionist/YOUR_CLIENT_KEY/business-info \
  -H "X-API-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "hours": {
      "start": 9,
      "end": 17,
      "days": [1, 2, 3, 4, 5]
    },
    "services": ["Consultation", "Treatment", "Follow-up"],
    "policies": {
      "cancellation": "24 hours notice required",
      "refund": "No refunds for cancellations within 24 hours"
    },
    "location": {
      "address": "123 Main St, London",
      "postcode": "SW1A 1AA"
    }
  }'
```

### 2. Add FAQs

```bash
curl -X POST https://your-app.onrender.com/api/receptionist/YOUR_CLIENT_KEY/faq \
  -H "X-API-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What are your opening hours?",
    "answer": "We are open Monday to Friday, 9 AM to 5 PM.",
    "category": "hours",
    "priority": 10
  }'
```

### 3. Configure Twilio Voice (if using inbound calls)

1. Go to [Twilio Console](https://console.twilio.com/)
2. Phone Numbers → Your Number
3. Under "Voice & Fax":
   - **A Call Comes In:** `https://your-app.onrender.com/webhooks/twilio-voice-inbound`
   - **HTTP Method:** POST
   - **Call Status:** `https://your-app.onrender.com/webhooks/twilio-voice-status`

### 4. Create Inbound Vapi Assistant

1. Go to [Vapi Dashboard](https://dashboard.vapi.ai/)
2. Create new assistant for inbound calls
3. Add functions (see `RECEPTIONIST-IMPLEMENTATION-COMPLETE.md`)
4. Update assistant ID in client config

---

## ✅ Success Indicators

You'll know everything is working when:

- [x] Migration logs show success
- [x] API endpoints return 200 (not 500)
- [x] Business info can be created/retrieved
- [x] Appointments can be looked up
- [x] Customer profiles work
- [x] Vapi function calls are handled (check webhook logs)

---

## 🐛 Common Issues & Fixes

### Issue: "Table doesn't exist" error

**Fix:** Migration didn't run
```bash
# In Render Shell:
node run-migration.js
```

### Issue: "Route not found" for new endpoints

**Fix:** Server restart needed
- Check Render logs for route registration
- May need to manually redeploy

### Issue: Vapi function calls not working

**Fix:** Check webhook URL
- Ensure webhook is: `https://your-app.onrender.com/webhooks/vapi`
- Test with a simple POST request
- Check function name matches exactly

---

## 🎉 You're Ready!

Once all checks pass, your receptionist system is fully operational!

**Next:** Start configuring clients and testing with real calls.




