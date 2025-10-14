# 🎯 Find 10 Leads & Call Them - Complete Workflow

## **Quick 3-Step Process**

### **Step 1: Find 10 Leads**
1. Start your server: `npm start`
2. Open: **http://localhost:3000/uk-business-search**
3. Search for businesses:
   - Example: **"dental practices in London"**
   - Example: **"law firms in Birmingham"**
   - Example: **"accounting firms in Manchester"**
4. Click **"Search"** → Get 10 real businesses with:
   - ✅ Business name
   - ✅ Phone number
   - ✅ Address
   - ✅ Website
   - ✅ Decision maker info (if available)

### **Step 2: Export to Call List**
1. Click **"Export Selected"** button
2. Save as JSON file
3. Open the JSON file and copy the businesses array

### **Step 3: Call Them**
1. Open: **http://localhost:3000/cold-call-dashboard**
2. Click **"Create Assistant"** (one time setup)
3. Click **"Load from UK Business Search"**
4. Replace the sample data with your 10 businesses
5. Click **"Start Campaign"**
6. ✅ Vapi AI calls all 10 prospects!

---

## 📋 **Example Search Queries**

**Dental Practices:**
- "dental practices in London"
- "dentists in Birmingham"
- "dental surgery Manchester"

**Law Firms:**
- "solicitors in London"
- "law firms in Leeds"
- "legal services Birmingham"

**Accounting:**
- "accountants in London"
- "accounting firms Manchester"
- "chartered accountants Leeds"

**Real Estate:**
- "estate agents London"
- "property agents Birmingham"
- "real estate Manchester"

**Home Services:**
- "plumbers London"
- "electricians Birmingham"
- "contractors Manchester"

---

## 🔧 **Quick Setup Check**

Make sure your `.env` has these:

```bash
# Required for searching businesses
GOOGLE_PLACES_API_KEY=your_google_key_here

# Required for calling them
VAPI_PRIVATE_KEY=your_vapi_key_here
VAPI_PHONE_NUMBER_ID=your_vapi_phone_id_here
API_KEY=your_api_key_here
```

---

## ⚡ **Automated Script Version**

If you want to skip the UI and do it all in one command:

### Run this:
```bash
node find-and-call-leads.js "dental practices in London"
```

This will:
1. Search for 10 dental practices in London
2. Format them for cold calling
3. Create Vapi assistant (if needed)
4. Start calling them immediately

---

## 📊 **What Happens During Calls**

Your AI assistant (already configured in `server.js`):

**Opening:**
> "Hi, this is Sarah from AI Booking Solutions. I'm calling to help businesses like yours improve their appointment booking systems..."

**Pitch:**
- Increase bookings by 300%
- £500/month service
- AI handles all calls 24/7
- Average practice sees £10,000-15,000 extra revenue

**Goal:**
- Book 15-minute demo call
- Or offer free trial week

**Handles Objections:**
- Too expensive → ROI calculation
- Too busy → Time-saving pitch
- Already have system → Feature comparison

---

## 🎯 **Best Practices**

1. **Search 10 businesses at a time** (manageable batch)
2. **Filter by rating** (4+ stars = better leads)
3. **Check phone numbers** (make sure they're valid)
4. **Monitor first 2-3 calls** (ensure script works)
5. **Adjust script** based on results

---

## 💰 **Cost Per Campaign**

- **Finding leads:** FREE (Google Places API has free tier)
- **Calling 10 leads:** ~£1-2 (£0.10-0.20 per call via Vapi)
- **Result:** Typically 1-2 interested prospects from 10 calls

---

## 📈 **Expected Results**

From 10 cold calls:
- ✅ **3-4 answered calls** (others voicemail/no answer)
- ✅ **1-2 interested prospects** (want to hear more)
- ✅ **0-1 demo calls booked** (immediate booking)

**To get 5 clients:** Call 100-150 businesses (10 campaigns)

---

## 🔍 **Where to Monitor**

**During Campaign:**
- Watch server console for `[COLD CALL]` logs

**After Campaign:**
- Vapi dashboard: https://dashboard.vapi.ai
- View call transcripts, recordings, outcomes
- See which prospects showed interest

---

## 🚀 **Ready to Start?**

1. **Choose your target:**
   - Industry: Dental, Legal, Accounting, etc.
   - Location: London, Birmingham, Manchester, etc.

2. **Search:**
   - http://localhost:3000/uk-business-search
   - Enter query
   - Get 10 businesses

3. **Call:**
   - http://localhost:3000/cold-call-dashboard
   - Load businesses
   - Start campaign

That's it! 🎯

