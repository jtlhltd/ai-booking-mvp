# 🚀 Render Deployment Guide - Receptionist Expansion

**Quick guide for deploying the new receptionist features on Render**

---

## ✅ Step 1: Push Code to GitHub

All the new code is ready! Just commit and push:

```bash
git add .
git commit -m "Add receptionist features: inbound calls, appointment management, FAQ, customer recognition"
git push origin main
```

Render will automatically detect the push and start deploying.

---

## ✅ Step 2: Verify Migration Runs

The migration will run automatically when Render starts your app (via `render-start` script).

**Check Render Logs:**
1. Go to your Render dashboard
2. Click on your service
3. Go to "Logs" tab
4. Look for:
   ```
   🔄 Starting database migrations...
   [MIGRATIONS] Running add-inbound-call-support.sql...
   ✅ Migration successful!
   ```

If you see migration errors, the migration runner will skip already-applied migrations automatically.

---

## ✅ Step 3: Configure Environment Variables (if needed)

Add these to Render if you're using inbound calls:

**In Render Dashboard → Your Service → Environment:**

```env
# Twilio Voice (if not already set)
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx

# Vapi Inbound Assistant (create in Vapi dashboard first)
VAPI_INBOUND_ASSISTANT_ID=your_inbound_assistant_id
VAPI_INBOUND_PHONE_NUMBER_ID=your_phone_number_id

# Optional: Callback notification email
CALLBACK_INBOX_EMAIL=your-email@example.com
```

---

## ✅ Step 4: Verify Deployment

After deployment completes, test the new endpoints:

### Health Check
```bash
curl https://your-app.onrender.com/health
```

### Test Appointment Lookup (replace with your values)
```bash
curl "https://your-app.onrender.com/api/appointments/YOUR_CLIENT_KEY/lookup?phone=+447700900123" \
  -H "X-API-Key: YOUR_API_KEY"
```

### Test Business Info
```bash
curl "https://your-app.onrender.com/api/receptionist/YOUR_CLIENT_KEY/business-info" \
  -H "X-API-Key: YOUR_API_KEY"
```

---

## 🔍 Troubleshooting

### Migration Not Running?

**Manual Migration:**
1. Go to Render dashboard → Your service → Shell
2. Run:
   ```bash
   node run-migration.js
   ```

**Or use the migration API endpoint:**
```bash
curl -X POST https://your-app.onrender.com/api/migrations/run \
  -H "X-API-Key: YOUR_API_KEY"
```

### Tables Not Created?

Check if migration file exists:
```bash
# In Render shell:
ls -la migrations/add-inbound-call-support.sql
```

If missing, the file should be in your GitHub repo. Re-deploy or manually add it.

### Routes Not Working?

**Check server.js loaded routes:**
Look in Render logs for:
```
✅ Routes loaded: leads, twilio, vapi, appointments, receptionist
```

If you see route errors, check that:
- All route files are in the `routes/` directory
- Server.js has the imports (should be automatic)

### Function Calls Not Working?

**Check Vapi webhook:**
1. Make sure `routes/vapi-webhooks.js` is updated (it is!)
2. Test webhook endpoint:
   ```bash
   curl -X POST https://your-app.onrender.com/webhooks/vapi \
     -H "Content-Type: application/json" \
     -d '{"test": "data"}'
   ```

---

## 📋 Post-Deployment Checklist

- [ ] Migration ran successfully (check logs)
- [ ] All tables created (`inbound_calls`, `customer_profiles`, `messages`, `business_info`, `business_faqs`)
- [ ] API endpoints respond (test a few)
- [ ] Vapi webhook receives function calls
- [ ] No errors in Render logs

---

## 🎯 Next Steps After Deployment

### 1. Configure Twilio Voice Webhook
1. Go to Twilio Console → Phone Numbers
2. Click your number
3. Under "Voice & Fax", set:
   - **A Call Comes In:** `https://your-app.onrender.com/webhooks/twilio-voice-inbound`
   - **HTTP Method:** POST
   - **Call Status Callback:** `https://your-app.onrender.com/webhooks/twilio-voice-status`

### 2. Create Inbound Vapi Assistant
- See `RECEPTIONIST-QUICK-START.md` for full instructions
- Copy function definitions from `RECEPTIONIST-IMPLEMENTATION-COMPLETE.md`

### 3. Add Business Info
Use the API or add manually to database:
```sql
INSERT INTO business_info (client_key, hours_json, services_json)
VALUES (
  'your_client_key',
  '{"start": 9, "end": 17, "days": [1,2,3,4,5]}',
  '["Consultation", "Treatment"]'
);
```

---

## 🔗 Useful Render Links

- **Logs:** Render Dashboard → Your Service → Logs
- **Shell:** Render Dashboard → Your Service → Shell (for debugging)
- **Environment:** Render Dashboard → Your Service → Environment
- **Metrics:** Render Dashboard → Your Service → Metrics

---

## ✅ That's It!

Your receptionist system is now live on Render! 🎉

**All features are deployed:**
- ✅ Inbound call handling
- ✅ Appointment management
- ✅ Customer recognition  
- ✅ FAQ answering
- ✅ Message taking

Need help? Check the logs or test endpoints individually.

