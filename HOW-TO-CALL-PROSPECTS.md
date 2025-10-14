# 📞 How to Call Your Prospects Using Existing Infrastructure

You already have everything built! Here's how to use it:

## 🎯 Quick Start (3 Steps)

### **Step 1: Start Your Server**
```bash
npm start
```

### **Step 2: Open Dashboard**
Visit: **http://localhost:3000/cold-call-dashboard**

### **Step 3: Use the Dashboard**

1. **Click "Create Assistant"**
   - Enter your API_KEY when prompted (from `.env` file)
   - Wait for assistant to be created
   - **Copy the Assistant ID** displayed

2. **Click "Load from UK Business Search"**
   - This loads your 6 prospects from `test-leads.csv`
   - You'll see: Jonah Hughes, John Smith, Sarah Johnson, Mike Chen, Lisa Williams, David Brown

3. **Click "Start Campaign"**
   - Paste the Assistant ID from Step 1
   - Enter API_KEY again when prompted
   - Click "Start Campaign"
   - **Vapi will start calling all 6 prospects immediately!**

---

## 📋 What Gets Called

Your dashboard is already loaded with these prospects from `test-leads.csv`:

1. **Jonah Hughes** - JTLH Media (Marketing Services) - 555-0100
2. **John Smith** - Smith & Associates (Legal Services) - 555-0101
3. **Sarah Johnson** - Johnson Dental (Healthcare) - 555-0102
4. **Mike Chen** - Chen Construction (Construction) - 555-0103
5. **Lisa Williams** - Williams Accounting (Professional Services) - 555-0104
6. **David Brown** - Brown Real Estate (Real Estate) - 555-0105

---

## 🤖 The Sales Script (Already Built)

Your assistant uses the script in `server.js` lines 9544-9607:

**Opening:**
> "Hi, this is Sarah from AI Booking Solutions. I'm calling to help businesses like yours improve their appointment booking systems with our premium £500/month service. Do you have 2 minutes to hear how we can help you never miss another patient?"

**Key Points:**
- ✅ Increase bookings by 300%
- ✅ AI handles calls 24/7
- ✅ £500/month premium service
- ✅ Average practice sees 20-30 extra bookings worth £10,000-15,000
- ✅ Books 15-minute demo calls

**Handles Objections:**
- Too expensive → ROI pitch
- Too busy → Time-saving pitch
- Already have system → Feature comparison
- Budget concerns → Revenue generation numbers

---

## ⚙️ Configuration Needed

Make sure your `.env` has:

```bash
# Required
VAPI_PRIVATE_KEY=your_vapi_key_here
VAPI_PHONE_NUMBER_ID=your_vapi_phone_id_here
API_KEY=your_api_key_here

# Optional (will use defaults)
VAPI_ASSISTANT_ID=  # Leave blank, dashboard creates one
```

---

## 🚀 Advanced: Call via API (Skip Dashboard)

If you want to skip the dashboard and call directly:

### Create Assistant:
```bash
curl -X POST http://localhost:3000/admin/vapi/cold-call-assistant \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json"
```

This returns an assistant ID like: `asst_abc123...`

### Start Campaign:
```bash
curl -X POST http://localhost:3000/admin/vapi/cold-call-campaign \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "assistantId": "asst_abc123...",
    "campaignName": "Test Leads Campaign",
    "maxCallsPerDay": 100,
    "businesses": [
      {
        "id": "prospect-1",
        "name": "JTLH Media",
        "phone": "555-0100",
        "email": "jonah@jtlhmedia.com",
        "website": "https://jtlhmedia.com",
        "decisionMaker": {
          "name": "Jonah Hughes",
          "role": "Owner",
          "email": "jonah@jtlhmedia.com",
          "phone": "555-0100"
        },
        "industry": "Marketing Services"
      }
    ]
  }'
```

---

## 📊 How It Works Behind the Scenes

1. **Dashboard → Server Endpoint** (`/admin/vapi/cold-call-campaign`)
2. **Server → Vapi API** (creates outbound calls)
3. **Vapi AI calls** each prospect using your phone number
4. **AI follows script** from `server.js`
5. **Results logged** in server console

**The call flow:**
```
Server (startColdCallCampaign function)
  → Processes businesses in batches of 3
  → 1 second delay between each call in batch
  → 3-5 seconds delay between batches
  → Calls via Vapi API: https://api.vapi.ai/call
  → Returns results
```

---

## 🎨 Customize the Script

To change what the AI says, edit `server.js` lines 9544-9607:

```javascript
systemMessage: `You are Sarah, a sales professional...`
```

Change:
- Opening line
- Company name (currently "AI Booking Solutions")
- Pricing (currently "£500/month")
- Stats/numbers
- Objection handling

Then **restart server** and **create new assistant**.

---

## 🔍 Monitor Results

**In Vapi Dashboard:**
- Go to: https://dashboard.vapi.ai
- View → Calls
- See live transcripts, recordings, outcomes

**In Server Console:**
- Watch for: `[COLD CALL]` logs
- See success/failure per prospect

---

## 💡 Tips

1. **Test with 1-2 prospects first** (remove others from array)
2. **Use real phone numbers** in E.164 format (e.g., `+447123456789`)
3. **Monitor first few calls** to ensure script works
4. **Adjust script based on results**
5. **Calls cost ~£0.10-0.20 each** via Vapi

---

## ❌ Troubleshooting

**"Unauthorized" error:**
- Check API_KEY in `.env` matches what you entered

**"VAPI API key not configured":**
- Add `VAPI_PRIVATE_KEY` to `.env`

**"Failed to create assistant":**
- Check Vapi API key is valid
- Check Vapi account has credits

**No calls being made:**
- Check phone numbers are valid
- Check `VAPI_PHONE_NUMBER_ID` is set
- Check Vapi dashboard for error logs

---

## 🎯 Next Steps After Calls

1. **Check Vapi dashboard** for interested prospects
2. **Review call transcripts** for objections
3. **Follow up by email** with interested leads
4. **Schedule demos** with warm leads
5. **Refine script** based on what works

---

**You're all set!** Your infrastructure is ready. Just open the dashboard and start calling. 🚀

