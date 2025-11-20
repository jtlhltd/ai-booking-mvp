# 🎬 Demo System Quick Start

## How to Run Demos

### Step 1: Create a Demo Client

**Option A: Quick Demo (Recommended)**
```bash
node scripts/quick-demo.js "Stay Focused Fitness" "fitness" "Chris" "Birmingham"
```

**Option B: Full Interactive Demo**
```bash
node scripts/create-demo-client.js
```
Follow the prompts to enter business details.

### Step 2: What Gets Created

After running either script, you'll get:
- ✅ Demo client in database (marked with `isDemo: true`)
- ✅ VAPI assistant ID (personalized for the prospect)
- ✅ Demo script file in `demos/` folder
- ✅ Dashboard URL

### Step 3: Test the Assistant

**Make a test call to verify everything works:**
```bash
node scripts/test-demo-call.js [assistantId] [yourPhoneNumber]
```

Example:
```bash
node scripts/test-demo-call.js b19a474b-49f3-474d-adb2-4aacc6ad37e7 +447700900123
```

**What to verify:**
- ✅ Assistant says "Hi Jonah!" (not "Hi Name!")
- ✅ Voice sounds good (Sarah - professional female)
- ✅ Gets to booking quickly (under 90 seconds)
- ✅ Booking simulation works (no real calendar/SMS)

### Step 4: Populate Test Leads

**Auto-populate dashboard with test leads:**
```bash
node scripts/populate-demo-leads.js [clientKey]
```

Example:
```bash
node scripts/populate-demo-leads.js stay-focused-fitness-chris
```

This adds 5 test leads to your dashboard so you have data to show during the demo.

### Step 5: Test Demo Booking

**Submit a test lead manually:**
```bash
node scripts/test-submit-lead.js "Test Lead" "+447700900123" "test@example.com" "demo-client"
```

Or use the API directly:
```bash
curl -X POST https://ai-booking-mvp.onrender.com/api/leads \
  -H "Content-Type: application/json" \
  -H "X-Client-Key: demo-client" \
  -d '{
    "name": "Test Lead",
    "phone": "+447700900123",
    "email": "test@example.com"
  }'
```

### Step 4: What Happens During Demo

When a lead books during a demo:

1. **VAPI Assistant** calls the lead (real call)
2. **Lead agrees to book** → VAPI calls `calendar_checkAndBook`
3. **System detects demo client** → Simulates booking:
   - ✅ Returns fake Google Calendar event ID
   - ✅ Generates SMS confirmation message (but doesn't send)
   - ✅ Returns success to VAPI assistant
4. **VAPI Assistant** tells prospect: "Your appointment is booked!"
5. **No real integrations needed** - everything is simulated

### Step 6: View Results

**Dashboard:**
```
https://ai-booking-mvp.onrender.com/client-dashboard.html?client=demo-client
```

**Check logs for demo bookings:**
Look for `[DEMO BOOKING]` in server logs to see simulated bookings.

## Demo Client Detection

A client is treated as a demo client if:
- Client key starts with `"demo-"` or contains `"-demo"`
- Client has `isDemo: true` flag
- Client key is `"demo-client"` or `"demo_client"`

## Important Notes

✅ **Demo clients** = Simulated bookings (no real calendar/SMS)  
✅ **Real clients** = Real bookings (actual calendar + SMS)

✅ **VAPI calls are REAL** - the assistant actually calls prospects  
✅ **Bookings are SIMULATED** - no calendar events or SMS sent

This lets you do demos without setting up integrations for every prospect!

