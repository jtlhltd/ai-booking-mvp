# 🎬 Demo Preparation Checklist

## Before Creating the Demo

### ✅ Information You Need
- [ ] Business name
- [ ] Industry (fitness, beauty, dental, etc.)
- [ ] Services (at least one)
- [ ] Prospect's name (optional - for personalization)
- [ ] Location (optional - for context)

### ✅ Environment Setup
- [ ] `VAPI_PRIVATE_KEY` set in .env
- [ ] `VAPI_TEMPLATE_ASSISTANT_ID` set in .env
- [ ] `VAPI_PHONE_NUMBER_ID` set (optional - for outbound calls)
- [ ] Database connected (or using file-based fallback)

## Creating the Demo

### Step 1: Create Demo Client
```bash
node scripts/quick-demo.js "Business Name" "Industry" "Prospect Name" "Location"
```

Or interactive:
```bash
node scripts/create-demo-client.js
```

### Step 2: Test the Assistant
```bash
node scripts/test-demo-call.js [assistantId] [yourPhoneNumber]
```

**What to verify:**
- [ ] Assistant says "Hi Jonah!" (not "Hi Name!")
- [ ] Voice sounds good (Sarah - female, professional)
- [ ] Gets to booking quickly (under 90 seconds)
- [ ] Booking simulation works (no real calendar/SMS)

### Step 3: Prepare Dashboard
- [ ] Open dashboard URL
- [ ] Import 3-5 test leads (or use script below)
- [ ] Verify dashboard shows data correctly

### Step 4: Prepare Demo Script
- [ ] Review generated demo script (in `demos/` folder)
- [ ] Note key talking points
- [ ] Prepare objection responses
- [ ] Have dashboard URL ready to share

## During the Demo

### ✅ What to Show
- [ ] Dashboard with test leads
- [ ] Make a live call (to your number)
- [ ] Show booking simulation
- [ ] Show metrics/conversion rate
- [ ] Explain the 24/7 capability

### ✅ Key Points to Hit
- [ ] Speed: Calls within 5 minutes
- [ ] Conversion: 30-40% (vs 10-15% typical)
- [ ] No work for them: Fully automated
- [ ] Works 24/7: Never miss a lead
- [ ] Free test: 10 leads, no commitment

## After the Demo

### ✅ Follow-Up
- [ ] Send demo script (from `demos/` folder)
- [ ] Send dashboard URL
- [ ] Offer free test with 10 real leads
- [ ] Schedule follow-up if interested

## Quick Commands Reference

**Create demo:**
```bash
node scripts/quick-demo.js "Stay Focused Fitness" "fitness" "Chris" "Birmingham"
```

**Test call:**
```bash
node scripts/test-demo-call.js [assistantId] +447700900123
```

**Submit test lead:**
```bash
node scripts/test-submit-lead.js "Test Lead" "+447700900123" "test@example.com" "demo-client"
```

**View dashboard:**
```
https://ai-booking-mvp.onrender.com/client-dashboard.html?client=[clientKey]
```

## Troubleshooting

**Assistant says "Hi Name!" instead of "Jonah":**
- Check that `leadName: 'Jonah'` is hardcoded in the script
- Recreate the demo if needed

**Call doesn't work:**
- Check `VAPI_PRIVATE_KEY` is set
- Check `VAPI_PHONE_NUMBER_ID` is set (for outbound)
- Verify phone number is E.164 format (+44...)

**Dashboard is empty:**
- Import test leads manually via dashboard
- Or use test lead submission script

**Booking doesn't simulate:**
- Check client has `isDemo: true` flag
- Check logs for `[DEMO BOOKING]` entries




