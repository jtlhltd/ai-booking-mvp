# 🚀 RENDER QUICK START: Find & Call 10 Leads

## 📍 **Your Render Setup**

Your app is deployed at: **https://ai-booking-mvp.onrender.com** (or your custom domain)

---

## ✅ **METHOD 1: Browser Dashboards (Easiest on Render)**

### **Step 1: Find 10 Leads**
Visit: **https://ai-booking-mvp.onrender.com/uk-business-search**

1. Enter search: `"dental practices in London"`
2. **📱 Mobile Numbers Only is CHECKED by default** (only UK mobiles 07xxx)
3. Click **"Search"** → Get 5-10 businesses with mobile numbers
4. Click **"Select All"** (or select your favorites)
5. See businesses listed with mobile phone numbers

**Why mobiles only?** Higher answer rates (40-50% vs 20-30% for landlines) and direct access to decision makers!

### **Step 2: Call Them**
Visit: **https://ai-booking-mvp.onrender.com/cold-call-dashboard**

1. Click **"Create Assistant"** 
   - Enter your `API_KEY` (from Render env vars)
   - Copy the assistant ID shown

2. Click **"Load from UK Business Search"**
   - Your 10 leads are now loaded
   - You'll see all their details

3. Enter Assistant ID (from step 1)

4. Click **"Start Campaign"**
   - ✅ Vapi starts calling all 10 immediately!

---

## ✅ **METHOD 2: API Calls (For Automation)**

Use these curl commands from your local machine:

### **1. Search for Businesses:**
```bash
curl -X POST https://ai-booking-mvp.onrender.com/api/uk-business-search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "dental practices in London",
    "filters": { "limit": 10 }
  }'
```

This returns 10 businesses with phone numbers, addresses, etc.

### **2. Create Cold Call Assistant:**
```bash
curl -X POST https://ai-booking-mvp.onrender.com/admin/vapi/cold-call-assistant \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY"
```

Copy the `assistant.id` from response.

### **3. Start Calling Campaign:**
```bash
curl -X POST https://ai-booking-mvp.onrender.com/admin/vapi/cold-call-campaign \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "assistantId": "asst_xxx...",
    "campaignName": "Dental London Campaign",
    "maxCallsPerDay": 100,
    "businesses": [
      {
        "id": "lead-1",
        "name": "ABC Dental Practice",
        "phone": "+447123456789",
        "email": "info@abc.com",
        "address": "123 High St, London",
        "website": "https://abc.com",
        "decisionMaker": {
          "name": "Dr. Smith",
          "role": "Owner",
          "phone": "+447123456789"
        },
        "industry": "Healthcare"
      }
    ]
  }'
```

---

## 📋 **Check Your Render Environment Variables**

Go to: **Render Dashboard → Your Service → Environment**

Make sure you have:
```bash
# Required for finding businesses
GOOGLE_PLACES_API_KEY=...

# Required for calling them
VAPI_PRIVATE_KEY=...
VAPI_PHONE_NUMBER_ID=...

# Security
API_KEY=...

# Your URL
BASE_URL=https://ai-booking-mvp.onrender.com
```

---

## 🎯 **Quick Test Right Now**

### **Option A: Use Browser** (No setup needed)
1. Visit: https://ai-booking-mvp.onrender.com/uk-business-search
2. Search: "dental practices in London"
3. See results immediately

Then:
1. Visit: https://ai-booking-mvp.onrender.com/cold-call-dashboard
2. Follow the steps above

### **Option B: Use API**
```bash
# Test search endpoint
curl -X POST https://ai-booking-mvp.onrender.com/api/uk-business-search \
  -H "Content-Type: application/json" \
  -d '{"query": "dental practices in London", "filters": {"limit": 5}}'
```

---

## 📞 **What Your AI Says**

Your cold call script is already configured in your Render deployment:

**Opening:**
> "Hi, this is Sarah from AI Booking Solutions. I'm calling to help businesses like yours improve their appointment booking systems with our premium £500/month service..."

**Pitch:**
- Increase bookings by 300%
- £500/month premium service
- AI handles all calls 24/7
- Most see 20-30 extra appointments/month = £10,000-15,000 revenue

**Goal:** Book 15-minute demo calls

---

## 💰 **Costs on Render**

- **Render hosting:** FREE (on Starter plan)
- **Finding leads:** FREE (Google Places free tier)
- **Calling 10 leads:** ~£1-2 (via Vapi)

---

## 📊 **Expected Results**

Per 10 calls:
- ✅ 3-4 will answer
- ✅ 1-2 will be interested
- ✅ 0-1 will book demo

**To get 5 clients:** Run 10-15 campaigns (100-150 total calls)

---

## 🔍 **Monitor Results**

**Render Logs:**
- Render Dashboard → Logs tab
- Search for: `[COLD CALL]`

**Vapi Dashboard:**
- https://dashboard.vapi.ai
- View all call transcripts and recordings

---

## 🎨 **Best Search Queries**

Try these in the UK Business Search:

1. **"dental practices in London"** ⭐⭐⭐⭐⭐
2. **"solicitors in Birmingham"** ⭐⭐⭐⭐
3. **"accountants in Manchester"** ⭐⭐⭐⭐
4. **"estate agents in Leeds"** ⭐⭐⭐
5. **"plumbers in Liverpool"** ⭐⭐⭐

---

## ❓ **Troubleshooting**

**"Search not working"**
- Check `GOOGLE_PLACES_API_KEY` is set in Render env vars
- Make sure Google Places API is enabled

**"Can't create assistant"**
- Check `VAPI_PRIVATE_KEY` in Render env vars
- Check `API_KEY` matches what you entered

**"Campaign won't start"**
- Phone numbers must be in E.164 format: `+447123456789`
- Check Vapi has credits

**"Dashboard not loading"**
- Your Render service might be sleeping (free tier)
- Visit any page to wake it up (takes 30 seconds)

---

## 🚀 **Ready to Start?**

### **Right Now:**
1. Open: https://ai-booking-mvp.onrender.com/uk-business-search
2. Search for businesses
3. Open: https://ai-booking-mvp.onrender.com/cold-call-dashboard
4. Start campaign

### **Takes 5 minutes total!**

---

## 💡 **Pro Tips for Render**

1. **Render free tier sleeps after 15 min** - First request takes 30s to wake up
2. **Keep dashboards in separate tabs** - Switch between search and call dashboard
3. **Check Render logs live** - Dashboard → Logs → Auto-scroll
4. **Vapi calls continue even if Render sleeps** - Campaign runs on Vapi's servers
5. **Save your assistant ID** - Reuse it for multiple campaigns

---

## 📱 **Mobile Friendly**

Both dashboards work on mobile! Use your phone to:
- Search for businesses while commuting
- Start campaigns from anywhere
- Monitor results on the go

---

**You're all set!** Open the dashboards and start your first campaign. 🎯

