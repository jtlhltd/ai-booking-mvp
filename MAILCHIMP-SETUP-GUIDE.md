image.png# 📧 Mailchimp Setup Guide - JTLH Media Email Outreach

## 🎯 OVERVIEW
Mailchimp offers FREE automation sequences - perfect for testing your email outreach before upgrading to paid tools.

---

## 📋 STEP 1: CREATE YOUR MAILCHIMP ACCOUNT

### Sign Up:
1. Go to **https://mailchimp.com**
2. Click **"Sign Up Free"**
3. Enter your email: **jonah@jtlhmedia.com**
4. Create password
5. Verify email

### Account Setup:
- **First Name:** Jonah
- **Last Name:** Hughes
- **Business Name:** JTLH Media
- **Website:** Leave blank (optional)
- **Business Type:** Marketing Services
- **Monthly Sends:** 0-500 (choose free plan)

---

## ⚙️ STEP 2: CONFIGURE SENDER SETTINGS

### Set Up Sender:
1. Go to **Profile** → **Account** → **Settings**
2. **From Name:** Jonah Hughes or JTLH Media
3. **From Email:** jonah@jtlhmedia.com
4. **Reply-to Email:** jonah@jtlhmedia.com
5. **Physical Address:** Use your real address or Mailchimp's default

### Verify Your Email:
- Check inbox for verification link
- Click to verify your sender email

---

## 🏷️ STEP 3: CREATE YOUR TAG STRUCTURE

### Navigate to Tags:
**Audience** → **Manage Contacts** → **Tags**

### Create These Tags:
1. ✅ `Lead Follow-Up Service`
2. ✅ `Dental`
3. ✅ `Legal`
4. ✅ `Home Services`
5. ✅ `Real Estate`
6. ✅ `Other`
7. ✅ `Email 1 Sent`
8. ✅ `Email 2 Sent`
9. ✅ `Email 3 Sent`
10. ✅ `Opened Email`
11. ✅ `Clicked Link`
12. ✅ `Hot Lead`
13. ✅ `Replied`
14. ✅ `Meeting Booked`
15. ✅ `Not Interested`

---

## 📝 STEP 4: CREATE CUSTOM FIELDS

### Navigate to Custom Fields:
**Audience** → **Audience Dashboard** → **Settings** → **Audience fields and |MERGE| tags**

### Create These Custom Fields:
1. **Business Name** (Text field)
2. **Industry** (Text field)

---

## 📧 STEP 5: CREATE YOUR EMAIL TEMPLATES

### EMAIL 1: Introduction
**Subject:** Quick question about *|BUSINESS_NAME|*'s lead follow-up

**Body:**
```
Hi *|FNAME|*,

I noticed *|BUSINESS_NAME|* has a strong online presence. Quick question - are you currently following up with all your leads within 5 minutes?

Most businesses lose 50-70% of their leads because staff are too busy to call back quickly.

I help businesses like yours convert more leads into booked appointments using AI-powered follow-up - so you never miss an opportunity.

Worth a quick 15-minute call to see if this could work for *|BUSINESS_NAME|*?

Book a time here: https://ai-booking-mvp.onrender.com/booking-dashboard.html

Best,
Jonah Hughes
JTLH Media
jonah@jtlhmedia.com
```

### EMAIL 2: Social Proof
**Subject:** How most businesses are losing 60% of their leads

**Body:**
```
Hi *|FNAME|*,

Following up on my message about lead conversion.

I've been researching this problem extensively, and the numbers are shocking:

Most businesses lose 50-70% of their leads because they don't follow up quickly enough.

Here's what typically happens:
• Lead comes in at 6pm - no response until next day
• Lead fills form on weekend - waits until Monday
• Staff are busy with existing customers - leads get forgotten
• By the time you call, they've already booked with a competitor

Studies show:
• 78% of customers buy from the first responder
• 50% of leads go to whoever responds first

I'm building a service that helps businesses like *|BUSINESS_NAME|* respond to every lead within 5 minutes using AI-powered follow-up.

Would you be interested in a quick 15-minute call to see how this could work for your business?

Book a 15-minute call: https://ai-booking-mvp.onrender.com/booking-dashboard.html

Best,
Jonah Hughes
JTLH Media
jonah@jtlhmedia.com
```

### EMAIL 3: Free Trial
**Subject:** Free trial week - no risk

**Body:**
```
Hi *|FNAME|*,

I understand you're busy running *|BUSINESS_NAME|*.

That's exactly why most businesses lose 50-70% of their leads - no time to follow up quickly.

Here's my offer:

FREE TRIAL WEEK
• I handle all your lead follow-up for 7 days
• You just show up to the appointments
• No risk, no commitment
• See real results before you pay anything

If we don't book at least 2-3 extra appointments, you owe me nothing.

Worth a quick 15-minute call to discuss?

Book here: https://ai-booking-mvp.onrender.com/booking-dashboard.html

Best,
Jonah Hughes
JTLH Media
jonah@jtlhmedia.com
```

### EMAIL 4: Value Focused
**Subject:** *|FNAME|*, here's how it works

**Body:**
```
Hi *|FNAME|*,

I noticed you're interested in improving your lead conversion.

Here's how the service works:

What You Get:
• AI follows up with every lead within 5 minutes
• 24/7 coverage (evenings, weekends, holidays)
• Direct booking into your calendar
• Typically 8-12 extra appointments per month

The Process:
• Every lead gets called within 5 minutes
• Persistent follow-up (most leads need 3-5 touches)
• Appointments booked directly into your calendar
• You just show up to close the deals

Most businesses see 3-5x improvement in lead conversion rates.

Want to see how this would work for *|BUSINESS_NAME|*?

Book a 15-minute demo: https://ai-booking-mvp.onrender.com/booking-dashboard.html

Best,
Jonah Hughes
JTLH Media
jonah@jtlhmedia.com
```

### EMAIL 5: Urgency
**Subject:** Last chance - free trial ending soon

**Body:**
```
Hi *|FNAME|*,

This is my final email about the lead conversion service.

I'm limiting free trials to 5 businesses this month, and I have 2 spots left.

If you're interested in booking 8-12 extra appointments per month without any extra work, reply with "INTERESTED" and I'll send you a case study.

Otherwise, I'll stop following up and assume it's not a priority right now.

Best,
Jonah Hughes
JTLH Media
jonah@jtlhmedia.com
```

### EMAIL 6: Break-up
**Subject:** Thanks for your time

**Body:**
```
Hi *|FNAME|*,

Thanks for your time. I'll stop following up about the lead conversion service.

If you ever want to stop losing leads, just reply to this email.

Best of luck with *|BUSINESS_NAME|*!

Jonah Hughes
JTLH Media
jonah@jtlhmedia.com

P.S. If you know any other business owners who might benefit from this, I'd appreciate an intro.
```

---

## ⚙️ STEP 6: BUILD YOUR AUTOMATION SEQUENCE

### Create Automation:
1. **Automations** → **Create** → **Email Series**
2. **Name:** "Lead Follow-Up Outreach"
3. **Trigger:** When someone is added to audience

### Set Up Sequence:
1. **Email 1:** Send immediately (Introduction)
2. **Wait:** 3 days
3. **Email 2:** Send (Social Proof)
4. **Wait:** 4 days (Day 7)
5. **Email 3:** Send (Free Trial)
6. **Wait:** 7 days (Day 14)
7. **Email 4:** Send (Value Focused)
8. **Wait:** 7 days (Day 21)
9. **Email 5:** Send (Urgency)
10. **Wait:** 7 days (Day 28)
11. **Email 6:** Send (Break-up)

### Advanced Features (Free Plan):
- **Conditional logic** (if opened, if clicked)
- **Tag subscribers** automatically
- **Stop automation** if they reply

---

## 👥 STEP 7: ADD YOUR FIRST PROSPECTS

### Manual Entry:
1. **Audience** → **All contacts** → **Add contacts**
2. Enter:
   - **Email:** prospect@business.com
   - **First Name:** John
   - **Business Name:** ABC Company
   - **Industry:** Dental
3. **Add to automation:** "Lead Follow-Up Outreach"

### Bulk Import:
1. Create CSV with columns:
   - Email Address
   - First Name
   - Business Name
   - Industry
2. **Audience** → **Import contacts**
3. Upload CSV
4. Map fields
5. Add to automation

---

## 📊 STEP 8: TRACK YOUR METRICS

### Key Metrics:
**Automations** → **Lead Follow-Up Outreach** → **View Report**

**Track:**
- ✅ **Open Rate:** Target 25-35%
- ✅ **Click Rate:** Target 3-5%
- ✅ **Reply Rate:** Target 2-4%
- ✅ **Meeting Booked:** Target 1-2%

---

## 🎯 MAILCHIMP FREE PLAN LIMITS

**Free Tier Includes:**
- ✅ 500 contacts
- ✅ 500 emails per month
- ✅ Email automation sequences
- ✅ Basic analytics
- ✅ Email templates
- ✅ Tag system

**When to Upgrade:**
- Hit 500 contact limit
- Need more than 500 emails/month
- Want advanced analytics

**Paid Plans:**
- **Essentials:** $11/month - 2,500 contacts
- **Standard:** $17/month - 5,000 contacts

---

## 🚀 DAILY ROUTINE

### Monday-Friday (30 mins/day):
**Morning (15 mins):**
1. Find 5 new business emails
2. Add to Mailchimp with tags
3. Automation starts automatically

**Evening (15 mins):**
1. Check for replies
2. Respond to interested prospects
3. Book meetings with hot leads
4. Update tags

---

## ✅ SETUP CHECKLIST

1. ✅ Create Mailchimp account
2. ✅ Verify sender email
3. ✅ Create tags (15 tags)
4. ✅ Create custom fields (Business Name, Industry)
5. ✅ Create email templates (6 templates)
6. ✅ Build automation sequence
7. ✅ Add first 10 prospects
8. ✅ Monitor results daily

---

## 🎯 SUCCESS METRICS (First 30 Days)

**Target:**
- 100-150 prospects contacted
- 25-30% average open rate
- 3-5% average click rate
- 2-4 booked meetings
- 1-2 paying clients

---

**Ready to start? Let's get you set up on Mailchimp!** 🚀
