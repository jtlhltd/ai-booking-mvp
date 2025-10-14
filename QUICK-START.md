# 🚀 QUICK START: Find 10 Leads & Call Them

## **Two Ways to Do It**

---

## ✅ **METHOD 1: One Command (Easiest)**

### Run this:
```bash
node find-and-call-leads.js "dental practices in London"
```

**What happens:**
1. 🔍 Finds 10 dental practices in London
2. 🤖 Creates Vapi AI assistant
3. 📞 Calls all 10 businesses automatically
4. ✅ Done!

**Change the search:**
```bash
node find-and-call-leads.js "law firms in Birmingham"
node find-and-call-leads.js "accountants in Manchester"
node find-and-call-leads.js "plumbers in Leeds"
```

---

## ✅ **METHOD 2: Using Dashboards (Visual)**

### Step 1: Find Leads
1. Start server: `npm start`
2. Open: http://localhost:3000/uk-business-search
3. Search: "dental practices in London"
4. Click **"Export Selected"** → Save JSON

### Step 2: Call Them
1. Open: http://localhost:3000/cold-call-dashboard  
2. Click **"Create Assistant"**
3. Click **"Load from UK Business Search"**
4. Paste your 10 businesses
5. Click **"Start Campaign"**

---

## 📋 **What You Need in .env**

```bash
# Google Places API (for finding businesses)
GOOGLE_PLACES_API_KEY=your_key_here

# Vapi (for calling businesses)
VAPI_PRIVATE_KEY=your_key_here
VAPI_PHONE_NUMBER_ID=your_phone_id_here

# Security
API_KEY=your_api_key_here
```

**Don't have keys?**
- Google Places: https://console.cloud.google.com/apis/credentials
- Vapi: https://dashboard.vapi.ai

---

## 📞 **What Your AI Says on Calls**

**Opening:**
> "Hi, this is Sarah from AI Booking Solutions. I'm calling to help businesses like yours improve their appointment booking systems with our premium £500/month service..."

**Pitch:**
- Increase bookings by 300%
- AI handles calls 24/7
- Most see 20-30 extra appointments/month
- Worth £10,000-15,000 in extra revenue

**Goal:** Book 15-minute demo call

---

## 💰 **Costs**

- Finding 10 leads: **FREE** (Google Places free tier)
- Calling 10 leads: **~£1-2** (£0.10-0.20 per call)
- **Total per campaign: £1-2**

---

## 📊 **Expected Results (Per 10 Calls)**

- ✅ 3-4 answered calls
- ✅ 1-2 interested prospects
- ✅ 0-1 demo calls booked

**To get 5 clients:** Run 10-15 campaigns (100-150 calls total)

---

## 🔍 **Monitor Results**

**Live monitoring:**
- Watch server console for `[COLD CALL]` logs

**After campaign:**
- Vapi dashboard: https://dashboard.vapi.ai
- View transcripts, recordings, outcomes

---

## 🎯 **Best Industries for Cold Calls**

1. **Dental Practices** ⭐⭐⭐⭐⭐ (Best ROI)
   - Search: "dental practices in [city]"
   - High value, constant lead flow

2. **Law Firms** ⭐⭐⭐⭐
   - Search: "solicitors in [city]"
   - High value, longer sales cycle

3. **Accounting Firms** ⭐⭐⭐⭐
   - Search: "accountants in [city]"
   - Good value, moderate budget

4. **Real Estate** ⭐⭐⭐
   - Search: "estate agents in [city]"
   - High volume, competitive

5. **Home Services** ⭐⭐⭐
   - Search: "plumbers in [city]"
   - Lower budget, high volume

---

## 🚀 **Try It Now!**

```bash
# 1. Make sure server is running
npm start

# 2. In another terminal, run:
node find-and-call-leads.js "dental practices in London"

# 3. Watch the magic happen! ✨
```

---

## ❓ **Troubleshooting**

**"GOOGLE_PLACES_API_KEY not configured"**
- Add `GOOGLE_PLACES_API_KEY` to `.env`

**"VAPI_PRIVATE_KEY not set"**
- Add `VAPI_PRIVATE_KEY` to `.env`

**"Failed to search businesses"**
- Check Google Places API is enabled
- Check you have credits in your Google Cloud account

**"Failed to start campaign"**
- Check `API_KEY` matches in `.env`
- Check Vapi has credits

---

## 💡 **Pro Tips**

1. **Start with 1-2 test calls** - Make sure script works
2. **Use high-rated businesses** - 4+ stars = better leads
3. **Call Tuesday-Thursday 10am-4pm** - Best connection rates
4. **Monitor first few calls** - Adjust script if needed
5. **Follow up by email** - Send info to interested prospects

---

**That's it!** You're ready to find and call leads. 🎉

Run the command or open the dashboards and start your first campaign!

