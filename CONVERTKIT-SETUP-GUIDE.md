# 📧 ConvertKit Setup Guide - JTLH Media Email Outreach

## 🎯 OVERVIEW
ConvertKit will automate your entire email outreach sequence for dental practices, tracking engagement and optimizing follow-ups based on prospect behavior.

---

## 📋 STEP 1: CREATE YOUR ACCOUNT

### Sign Up:
1. Go to **https://convertkit.com**
2. Click **"Start Free Trial"**
3. Enter your email: Use your professional email (e.g., jonah@jtlhmedia.com or your Gmail)
4. Create password
5. Verify email

### Profile Setup:
- **Name:** Jonah Hughes
- **Business Name:** JTLH Media
- **Industry:** Marketing Services
- **Email Count:** 0-1,000 subscribers

---

## 📊 STEP 2: CONFIGURE YOUR SENDER SETTINGS

### Set Up Sender Email:
1. Go to **Settings** → **Sending**
2. Add your email address (the one you'll send from)
3. Verify email (check inbox for verification link)
4. Set **From Name:** Jonah Hughes or JTLH Media

### Important:
- Use a professional email if possible
- If using Gmail, this will work fine for free tier
- Later, consider custom domain (e.g., jonah@jtlhmedia.com)

---

## 🏷️ STEP 3: CREATE YOUR TAG STRUCTURE

### Navigate to Tags:
**Settings** → **Tags** → **Create Tag**

### Create These Tags:
1. ✅ `Dental Practice` - Main category
2. ✅ `Email 1 Sent` - Intro email sent
3. ✅ `Email 2 Sent` - Follow-up 1 sent
4. ✅ `Email 3 Sent` - Follow-up 2 sent
5. ✅ `Opened Email` - Engaged prospect
6. ✅ `Clicked Link` - High-intent prospect
7. ✅ `Hot Lead` - Clicked booking link
8. ✅ `Replied` - Responded to email
9. ✅ `Meeting Booked` - Converted to call
10. ✅ `Not Interested` - Opted out or said no

---

## 📝 STEP 4: CREATE YOUR EMAIL TEMPLATES

### Email 1: Introduction
**Subject:** Quick question about [Practice Name]'s lead follow-up

**Body:**
```
Hi [First Name],

I noticed [Practice Name] has a strong online presence. Quick question - are you currently following up with all your Google Ads leads within 5 minutes?

Most dental practices lose 50-70% of their leads because staff are too busy treating patients to call back quickly.

I help practices like yours convert 40% more leads into booked appointments using AI-powered follow-up.

Worth a quick 15-minute call to see if this could work for [Practice Name]?

Book a time here: [Your Booking Link]

Best,
Jonah Hughes
JTLH Media
```

### Email 2: Social Proof (Day 3 - IF OPENED Email 1)
**Subject:** How a local practice booked 12 extra appointments last month

**Body:**
```
Hi [First Name],

Following up on my message about lead conversion.

I just helped a dental practice similar to [Practice Name] book 12 extra appointments last month by following up with their existing leads within 5 minutes.

They were losing 60% of their Google Ads leads before we started working together.

Here's what we did:
• AI calls every lead within 5 minutes of inquiry
• Persistent follow-up (most leads need 3-5 touches)
• Appointments booked directly into their calendar
• They just show up to treat patients

The practice owner told me: "I didn't realize how many leads were slipping through the cracks until we started tracking it."

Would you be interested in a quick case study showing the exact results?

Book a 15-minute call: [Your Booking Link]

Best,
Jonah
```

### Email 2B: Different Angle (Day 3 - IF NOT OPENED Email 1)
**Subject:** Are you losing leads to competitors?

**Body:**
```
Hi [First Name],

Quick question: When someone fills out a contact form on your website at 7pm, do they get a response within 5 minutes?

If not, they're probably booking with a competitor.

Studies show:
• 78% of customers buy from the first responder
• 50% of leads go to whoever responds first
• Most practices lose 60-70% of leads due to slow follow-up

I help dental practices like [Practice Name] convert more leads by responding immediately (even outside business hours).

Worth a quick 15-minute call?

Book here: [Your Booking Link]

Best,
Jonah Hughes
JTLH Media
```

### Email 3: Free Trial Offer (Day 7)
**Subject:** Free trial week - no risk

**Body:**
```
Hi [First Name],

I understand you're busy running [Practice Name].

That's exactly why most practices lose 50-70% of their leads - no time to follow up quickly.

Here's my offer:

**FREE TRIAL WEEK**
• I handle all your lead follow-up for 7 days
• You just show up to the appointments
• No risk, no commitment
• See real results before you pay anything

If we don't book at least 2-3 extra appointments, you owe me nothing.

Worth a 15-minute call to discuss?

Book here: [Your Booking Link]

Best,
Jonah
```

### Email 4: Pricing-Focused (Day 7 - IF CLICKED LINK in previous emails)
**Subject:** [First Name], here's the investment breakdown

**Body:**
```
Hi [First Name],

I noticed you're interested in improving your lead conversion.

Here's the simple breakdown:

**Monthly Investment:** £497/month
**What You Get:**
• AI follows up with every lead within 5 minutes
• 24/7 coverage (evenings, weekends, holidays)
• Direct booking into your calendar
• Typically 8-12 extra appointments per month

**ROI Calculation:**
• If you close just 3 extra patients per month
• Average treatment value: £500
• Monthly revenue increase: £1,500
• Your profit: £1,000+ per month

Most practices break even with just 1 extra patient per month.

Want to see how this would work for [Practice Name]?

Book a 15-minute demo: [Your Booking Link]

Best,
Jonah
```

### Email 5: Urgency (Day 14)
**Subject:** Last chance - free trial ending soon

**Body:**
```
Hi [First Name],

This is my final email about the lead conversion service.

I'm limiting free trials to 5 practices this month, and I have 2 spots left.

If you're interested in booking 8-12 extra appointments per month without any extra work, reply with "INTERESTED" and I'll send you a case study.

Otherwise, I'll stop following up and assume it's not a priority right now.

Best,
Jonah
```

### Email 6: Break-up (Day 21)
**Subject:** Thanks for your time

**Body:**
```
Hi [First Name],

Thanks for your time. I'll stop following up about the lead conversion service.

If you ever want to stop losing 50% of your leads, just reply to this email.

Best of luck with [Practice Name]!

Jonah Hughes
JTLH Media

P.S. If you know any other practice owners who might benefit from this, I'd appreciate an intro.
```

---

## ⚙️ STEP 5: BUILD YOUR AUTOMATION SEQUENCE

### Create Your First Automation:

1. **Go to:** Automations → Create Automation → Start From Scratch
2. **Name:** "Dental Practice Outreach Sequence"

### Automation Flow:

```
START
  ↓
Add Tag: "Dental Practice"
  ↓
Send Email 1 (Introduction)
  ↓
Wait 3 days
  ↓
IF Opened Email 1 → Send Email 2 (Social Proof)
IF NOT Opened Email 1 → Send Email 2B (Different Angle)
  ↓
Wait 4 days (Day 7)
  ↓
IF Clicked Link → Send Email 4 (Pricing)
IF NOT Clicked → Send Email 3 (Free Trial)
  ↓
Wait 7 days (Day 14)
  ↓
Send Email 5 (Urgency)
  ↓
Wait 7 days (Day 21)
  ↓
Send Email 6 (Break-up)
  ↓
END
```

### Advanced Conditions to Add:

**Stop Automation If:**
- Tag "Replied" is added → Move to manual outreach
- Tag "Meeting Booked" is added → Remove from sequence
- Tag "Not Interested" is added → Stop all emails

**Add Tags Automatically:**
- If opens any email → Add tag "Opened Email"
- If clicks any link → Add tag "Clicked Link"
- If clicks booking link → Add tag "Hot Lead"

---

## 👥 STEP 6: ADD YOUR FIRST PROSPECTS

### Manual Entry:
1. Go to **Subscribers** → **Add Subscriber**
2. Enter:
   - **Email:** prospect@dentalpractice.com
   - **First Name:** John
   - **Custom Field - Practice Name:** ABC Dental
   - **Tag:** Dental Practice
3. Click **Add to Automation:** "Dental Practice Outreach Sequence"

### Bulk Import (CSV):
1. Create CSV with columns:
   - Email Address
   - First Name
   - Practice Name (custom field)
2. Go to **Subscribers** → **Import**
3. Upload CSV
4. Map columns
5. Add tag "Dental Practice"
6. Add to automation

---

## 📊 STEP 7: TRACK YOUR METRICS

### Key Metrics Dashboard:
**Automations** → **Dental Practice Outreach Sequence** → **Analytics**

**Track:**
- ✅ **Open Rate:** Target 25-35%
- ✅ **Click Rate:** Target 3-5%
- ✅ **Reply Rate:** Target 2-4%
- ✅ **Meeting Booked:** Target 1-2%

### Weekly Review:
- Which subject lines get best open rates?
- Which emails get most clicks?
- Where do prospects drop off?
- Adjust sequence based on data

---

## 🎯 STEP 8: DAILY ROUTINE

### Monday-Friday Routine (30 mins/day):

**Morning (15 mins):**
1. Find 5 new dental practice emails
2. Add to ConvertKit with "Dental Practice" tag
3. Automation starts automatically

**Evening (15 mins):**
1. Check for replies
2. Respond to interested prospects
3. Book meetings with hot leads
4. Update tags (Meeting Booked, Not Interested)

---

## 📈 SCALING STRATEGY

### Week 1-2: Test Phase
- Add 5 prospects per day (50 total)
- Monitor open/click rates
- Adjust subject lines if needed

### Week 3-4: Optimize Phase
- Identify best-performing emails
- A/B test different subject lines
- Refine your sequence

### Week 5+: Scale Phase
- Add 10-15 prospects per day
- Expand to new locations
- Consider upgrading to paid plan if hitting limits

---

## 💰 CONVERTKIT FREE PLAN LIMITS

**Free Tier Includes:**
- ✅ 1,000 subscribers
- ✅ Unlimited emails
- ✅ Visual automation builder
- ✅ Landing pages & forms
- ✅ Advanced tagging
- ✅ Email support

**When to Upgrade:**
- Hit 1,000 subscriber limit
- Need priority support
- Want advanced integrations

**Paid Plans:**
- **Creator:** $15/month (up to 300 subscribers)
- **Creator Pro:** $29/month (up to 300 subscribers + advanced features)

---

## ⚠️ BEST PRACTICES

### Email Deliverability:
- ✅ Always include unsubscribe link (ConvertKit adds automatically)
- ✅ Don't use spammy words (FREE, URGENT, ACT NOW)
- ✅ Keep images minimal
- ✅ Personalize with first name and practice name
- ✅ Send from verified email address

### Legal Compliance:
- ✅ Only email businesses (B2B is legal)
- ✅ Include physical address in footer
- ✅ Honor unsubscribe requests immediately
- ✅ Don't buy email lists

### Response Handling:
- ✅ Respond to all replies within 24 hours
- ✅ Tag interested prospects as "Hot Lead"
- ✅ Remove from automation if they reply
- ✅ Book meetings immediately

---

## 🔗 NEXT STEPS

1. ✅ Create ConvertKit account
2. ✅ Set up sender email
3. ✅ Create tags
4. ✅ Build automation sequence
5. ✅ Create email templates
6. ✅ Add first 10 prospects
7. ✅ Monitor results daily
8. ✅ Scale after 2 weeks

---

## 📞 YOUR BOOKING LINK

**Insert this into all email templates:**
```
https://ai-booking-mvp.onrender.com/booking-dashboard.html
```

Or create a custom short link:
- **Bitly:** https://bitly.com (free custom short links)
- Example: **bit.ly/jtlh-demo**

---

## 🎯 SUCCESS METRICS

**After 30 Days, You Should Have:**
- 100-150 prospects in ConvertKit
- 25-30% average open rate
- 3-5% average click rate
- 2-4 booked meetings
- 1-2 paying clients

**Ready to start? Let me know if you need help with any specific step!** 🚀

