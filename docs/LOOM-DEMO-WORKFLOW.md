# Loom Demo Creation Workflow

Complete guide for creating personalized Loom demos that accurately represent your service delivery.

## Quick Start

1. Run the demo client creator:
   ```bash
   node scripts/create-demo-client.js
   ```

2. Enter prospect details when prompted

3. Get your personalized demo script and assistant ID

4. Record your Loom using the script

5. Send to prospect

---

## Prerequisites

### Environment Variables Required

Set these in your `.env` file or environment:

- `VAPI_PRIVATE_KEY` - Your Vapi API key
- `VAPI_TEMPLATE_ASSISTANT_ID` - Your template assistant ID
- `BASE_URL` - Your application URL (optional, defaults to placeholder)

### One-Time Setup

1. Ensure database is initialized (happens automatically)
2. Ensure you have a Vapi template assistant configured
3. Test the script once to create the demo client account

---

## Recording Methods

### Method 1: Live Screen Share (Recommended for Authenticity)

**Pros:**
- Most authentic - shows real system working
- Can adapt on the fly
- Shows actual call happening

**Cons:**
- Takes longer (3-5 minutes per demo)
- Requires you to be available
- Need to make actual call during recording

**When to Use:**
- High-value prospects
- When you want maximum impact
- When you have time

**Process:**
1. Run `create-demo-client.js` to personalize assistant
2. Open Loom, start screen recording
3. Open dashboard in browser
4. Follow the demo script
5. Make actual call to your number (you act as lead)
6. Show calendar integration
7. End recording
8. Send Loom link

---

### Method 2: Pre-Recorded Core + Personal Wrapper (Recommended for Speed)

**Pros:**
- Fast to create (1-2 minutes per demo)
- Can batch record multiple intros
- Consistent core demo quality

**Cons:**
- Less authentic (not fully live)
- Requires editing/stitching
- Core needs to be generic enough

**When to Use:**
- High volume outreach
- When speed is priority
- When you want consistency

**Process:**
1. Pre-record core demo once (dashboard → call → calendar → results)
2. For each prospect:
   - Run `create-demo-client.js` to personalize assistant
   - Record 30-second personal intro
   - Record 30-second personal close
   - Stitch together in Loom or video editor
3. Send Loom link

---

## Demo Script Structure

### Timing Breakdown (2 minutes total)

- **[0:00-0:10]** Personal Opening (10 seconds)
- **[0:10-0:20]** Problem Statement (10 seconds)
- **[0:20-0:30]** Dashboard View (10 seconds)
- **[0:30-1:00]** Live Call Demo (30 seconds)
- **[1:00-1:15]** Calendar Integration (15 seconds)
- **[1:15-1:30]** Results/Metrics (15 seconds)
- **[1:30-2:00]** Personal Close (30 seconds)

### What to Show in Each Section

#### Personal Opening (0:00-0:10)
- Your face (if using webcam)
- Friendly greeting
- Mention their business name specifically
- Set expectation: "2-minute demo"

#### Problem Statement (0:10-0:20)
- Industry-specific pain point
- Use their industry in the statement
- Create urgency/interest

#### Dashboard View (0:20-0:30)
- Screen share your dashboard
- Show: `http://yourdomain.com/client-dashboard.html?client=demo-client`
- Point out: leads, calls, appointments
- Keep it brief - don't explain every feature

#### Live Call Demo (0:30-1:00)
- **Critical:** Make actual call to your number
- You answer as the lead
- Have natural conversation
- Let AI book appointment
- Show it's real, not fake

#### Calendar Integration (1:00-1:15)
- Screen share Google Calendar
- Show appointment just appeared
- Mention SMS confirmation sent
- Emphasize: "All automatic"

#### Results/Metrics (1:15-1:30)
- Show dashboard metrics
- Quick numbers: "5 leads, 2 appointments, 40% conversion"
- Compare to industry average
- Keep it simple

#### Personal Close (1:30-2:00)
- Use their business name again
- Clear CTA: "Want to test with 10 of your leads?"
- Make it easy: "Just reply if interested"
- End on friendly note

---

## Best Practices

### Do's

✅ **Show real system** - Use actual dashboard, not mockups
✅ **Make real calls** - Actually call your number during demo
✅ **Use their business name** - Personalize throughout
✅ **Keep it under 2 minutes** - Respect their time
✅ **Focus on results** - Show outcomes, not features
✅ **Be conversational** - Don't sound scripted
✅ **End with clear CTA** - Tell them exactly what to do next

### Don'ts

❌ **Don't use fake data** - Show real system working
❌ **Don't go over 2 minutes** - Keep it short
❌ **Don't explain features** - Show outcomes instead
❌ **Don't sound robotic** - Be natural and friendly
❌ **Don't forget to personalize** - Use their business name
❌ **Don't skip the call** - The call is the magic moment
❌ **Don't make it complicated** - Simple is better

---

## Setup Checklist

### Before Recording

- [ ] Run `create-demo-client.js` with prospect details
- [ ] Verify assistant ID is correct
- [ ] Test dashboard loads: `http://yourdomain.com/client-dashboard.html?client=demo-client`
- [ ] Have your phone ready (to receive demo call)
- [ ] Have Google Calendar open (to show appointment)
- [ ] Review demo script (from script output)
- [ ] Replace [Prospect Name] and [location] in script

### Refresh the Demo Dashboard (keep Loom accurate)

1. Open the dashboard and click **Reset Demo Data** (in Quick Actions)  
   – This copies the exact CLI command you need.
2. Paste the command into your terminal (e.g.):
   ```bash
   node scripts/create-demo-client.js "Demo Booking Partner" \
     "service businesses" \
     "Lead Follow-Up,Appointment Booking,Calendar Integration" \
     "Business Owner" \
     "United Kingdom"
   ```
3. Wait ~10 seconds for the assistant + dashboard stats to update.
4. Refresh the dashboard tab; you should see new leads, calls, and highlights.
5. When you record the Loom, hit **Start AI Call** so the call button copies the `scripts/test-demo-client.js` command and run it live.
6. Use the **“Show this demo for”** dropdown to match the prospect’s industry (MedSpa, Solar, Legal, etc.). That updates the copy, testimonial, and service mix instantly.
7. If you want to send the dashboard link, click **Copy shareable link** so they land on the same persona preset.

### During Recording

- [ ] Start Loom recording
- [ ] Follow script timing
- [ ] Make actual call (don't fake it)
- [ ] Show real dashboard (not screenshots)
- [ ] Show real calendar (not mockup)
- [ ] Keep energy up
- [ ] Stay under 2 minutes
- [ ] Point out the CTA card (“Load 10 leads this week…”) so prospects know the next step

### After Recording

- [ ] Review recording for quality
- [ ] Get Loom share link
- [ ] Send to prospect with personalized message
- [ ] Track who watches (Loom analytics)

---

## Troubleshooting

### Assistant Not Updating

**Problem:** Vapi assistant doesn't reflect prospect's business name

**Solution:**
- Check `VAPI_PRIVATE_KEY` is set correctly
- Verify assistant ID is correct
- Try updating assistant again
- Check Vapi dashboard to confirm changes

### Dashboard Not Loading

**Problem:** Dashboard shows error or doesn't load

**Solution:**
- Verify demo client exists: check database
- Check `BASE_URL` environment variable
- Try accessing: `http://localhost:3000/client-dashboard.html?client=demo-client`
- Check server is running if testing locally

### Call Not Working

**Problem:** Can't make call during demo

**Solution:**
- Verify `VAPI_PHONE_NUMBER_ID` is set
- Check you have phone credits in Vapi
- Test call before recording
- Have backup: show call logs instead

### Script Too Long

**Problem:** Demo goes over 2 minutes

**Solution:**
- Cut problem statement shorter
- Skip detailed dashboard explanation
- Make call demo faster (30 seconds max)
- Practice timing before recording

---

## Example Workflow

### Step-by-Step for One Prospect

1. **Research Prospect** (2 minutes)
   - Get business name, industry, services from LinkedIn/website

2. **Create Demo Setup** (2 minutes)
   ```bash
   node scripts/create-demo-client.js
   # Enter: Business name, industry, services
   ```

3. **Prepare for Recording** (1 minute)
   - Open dashboard URL
   - Open Google Calendar
   - Have phone ready
   - Review script

4. **Record Demo** (3 minutes)
   - Start Loom
   - Follow script
   - Make call
   - End recording

5. **Send to Prospect** (1 minute)
   - Get Loom link
   - Send personalized email/message

**Total Time: ~9 minutes per prospect**

---

## Advanced Tips

### Batch Recording

Record multiple personal intros at once:
1. Run script for 5 prospects
2. Record all 5 intros in one session
3. Use same core demo for all
4. Stitch together later

### A/B Testing

Test different approaches:
- Try different problem statements
- Test different CTAs
- Compare live vs pre-recorded conversion rates

### Follow-Up

After sending demo:
- Day 1: Send demo
- Day 3: Follow up if no response
- Day 7: Final follow-up with case study

---

## Success Metrics

Track these to improve:

- **Watch Rate:** % of prospects who watch demo
- **Completion Rate:** % who watch full 2 minutes
- **Response Rate:** % who reply after watching
- **Conversion Rate:** % who become clients

Aim for:
- Watch Rate: >50%
- Completion Rate: >70%
- Response Rate: >10%
- Conversion Rate: >5%

---

## Next Steps

After prospect watches demo:

1. **If Interested:**
   - Set up free trial with 10 leads
   - Use same demo client account
   - Show them real results

2. **If Not Interested:**
   - Ask for feedback
   - Keep demo client for future
   - Follow up in 30 days

3. **If Converted:**
   - Create real client account
   - Transfer settings from demo
   - Start service delivery

---

## Support

If you run into issues:

1. Check environment variables are set
2. Verify database is initialized
3. Test Vapi assistant in dashboard
4. Check server logs for errors
5. Review this guide for common issues

---

**Remember:** The goal is to show your service working, not to explain it. Let the demo speak for itself.



