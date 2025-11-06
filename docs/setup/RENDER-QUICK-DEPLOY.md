# ⚡ Render Quick Deploy - Receptionist Features

**TL;DR: Push to GitHub → Render auto-deploys → Migration runs automatically**

---

## 🚀 Deploy Steps (2 minutes)

### 1. Push Code
```bash
git add .
git commit -m "Add receptionist features"
git push origin main
```

### 2. Wait for Render to Deploy
- Render will auto-detect the push
- Starts deployment automatically
- Migration runs during startup (via `render-start` script)

### 3. Check Logs
Go to Render Dashboard → Your Service → Logs

Look for:
```
[MIGRATIONS] Running add-inbound-call-support.sql...
[MIGRATIONS] ✅ add-inbound-call-support.sql applied successfully
```

---

## ✅ Verification (30 seconds)

### Test Health
```bash
curl https://your-app.onrender.com/health
```

### Test New Endpoint
```bash
curl "https://your-app.onrender.com/api/receptionist/YOUR_CLIENT_KEY/business-info" \
  -H "X-API-Key: YOUR_KEY"
```

Should return: `{"success": true, "info": {...}}`

---

## 🔧 If Migration Fails

**Manual run in Render Shell:**
```bash
node run-migration.js
```

**Or via API:**
```bash
curl -X POST https://your-app.onrender.com/api/migrations/run \
  -H "X-API-Key: YOUR_KEY"
```

---

## 📋 New Tables Created

After migration, these tables exist:
- ✅ `inbound_calls`
- ✅ `customer_profiles`
- ✅ `messages`
- ✅ `business_info`
- ✅ `business_faqs`

**Check in Render Shell:**
```bash
psql $DATABASE_URL -c "\dt"
```

---

## 🎯 That's It!

**Migration runs automatically on every deploy** (via `render-start` script).

All new features are live once migration completes! 🎉

---

**Need help?** See `RENDER-DEPLOYMENT-GUIDE.md` for detailed steps.




