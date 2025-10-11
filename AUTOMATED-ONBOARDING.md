# 🤖 Automated Client Onboarding System

## Overview

Your AI booking system now has **self-service client onboarding**! New clients can sign up and be live in **5 minutes** with minimal manual work from you.

---

## 🎯 **What's Automated:**

### ✅ **Fully Automated:**
1. Client signup form
2. Unique client key generation
3. API key generation
4. Database entry creation
5. Custom AI prompt generation
6. Welcome email with credentials
7. Client dashboard access
8. Settings page access
9. Lead import URL generation

### ⚠️ **Semi-Automated (Requires Manual Step):**
1. **Vapi Assistant Creation** - You create it with their generated prompt (5 mins)
2. **Google Calendar Setup** - They email you their calendar (2 mins)

---

## 📋 **User Flow:**

### **Client Perspective:**

```
1. Visit: https://ai-booking-mvp.onrender.com/signup.html
2. Fill out form (2 mins):
   - Business name
   - Industry
   - Primary service
   - Contact info
   - Choose plan
3. Click "Start 14-Day Free Trial"
4. Wait 30 seconds (automated setup)
5. Receive:
   - Client ID
   - API Key
   - Import URL
   - Welcome email
6. Click "Import Leads" and start!
```

### **Your Perspective:**

```
1. Receive notification: "New client signed up!"
2. Check welcome email sent to them
3. Create their Vapi assistant (5 mins):
   - Copy their custom prompt from email
   - Clone your master assistant in Vapi
   - Paste their prompt
   - Save assistant ID
4. Update their database entry with Vapi ID
5. Reply to their welcome email: "You're live!"
```

---

## 🔗 **URLs:**

### **Public Pages (No Auth):**
- **Signup:** `https://ai-booking-mvp.onrender.com/signup.html`

### **Client Pages (Client-Specific):**
- **Dashboard:** `https://ai-booking-mvp.onrender.com/dashboard/:clientKey`
- **Settings:** `https://ai-booking-mvp.onrender.com/settings/:clientKey`
- **Import:** `https://ai-booking-mvp.onrender.com/lead-import.html?client=:clientKey&key=:apiKey`

---

## 📊 **What's Created Automatically:**

### **1. Client Key**
Format: `{businessname}_{6chars}`
Example: `acme_plumbing_k7x9m2`

### **2. API Key**
Format: `sk_live_{64chars}`
Example: `sk_live_a1b2c3d4...`
- Stored as hash in database
- Only shown once to client

### **3. Database Entry**
Two tables:
- **`tenants`** - Main client config
- **`client_metadata`** - Additional info (owner, plan, trial date)

### **4. Custom AI Prompt**
Generated based on:
- Business name
- Industry
- Primary service
- Service area

Each client gets a unique script!

### **5. Welcome Email**
Includes:
- Credentials
- Import URL
- Dashboard link
- Setup checklist
- Full AI prompt preview

---

## ⚙️ **Manual Steps (For You):**

### **Step 1: Create Vapi Assistant (5 mins)**

When a new client signs up:

1. **Get their prompt:**
   - Check your email (copy of welcome email)
   - Or query database: `SELECT vapi_json->>'systemPrompt' FROM tenants WHERE client_key = 'xxx'`

2. **Create in Vapi:**
   - Go to Vapi dashboard
   - Clone your master assistant
   - Paste their custom prompt
   - Set voice (from their preference)
   - Save and copy assistant ID

3. **Update database:**
   ```sql
   UPDATE tenants 
   SET vapi_json = jsonb_set(vapi_json, '{assistantId}', '"their-assistant-id"')
   WHERE client_key = 'xxx';
   ```

### **Step 2: Connect Google Calendar (2 mins)**

When client replies with their calendar email:

1. **Share calendar with them:**
   - Or use their OAuth (if implemented)

2. **Update database:**
   ```sql
   UPDATE tenants 
   SET calendar_json = jsonb_set(calendar_json, '{calendarId}', '"their-calendar@gmail.com"')
   WHERE client_key = 'xxx';
   ```

3. **Email them:** "You're all set! Import leads and start converting!"

---

## 🚀 **How to Launch It:**

### **Option A: Soft Launch (Recommended)**
1. Test the signup flow yourself
2. Create a test client account
3. Verify all emails work
4. Then share with first real client

### **Option B: Add to Landing Page**
Update `sales-landing.html`:
```html
<a href="/signup.html" class="cta-btn">Start Free Trial →</a>
```

### **Option C: Direct Link**
Send link to prospects:
```
https://ai-booking-mvp.onrender.com/signup.html
```

---

## 📧 **Email Templates:**

### **Welcome Email (Automatic)**
✅ Already sent automatically
- Contains all credentials
- Setup instructions
- Next steps

### **Setup Complete Email (Manual)**
You send this after creating their Vapi assistant:

```
Subject: 🎉 Your AI System is Ready!

Hi [Name],

Great news - your AI assistant is now live and ready to convert leads!

Your system is configured with:
✅ Custom AI voice assistant
✅ Automated appointment booking
✅ SMS & email follow-ups
✅ Real-time analytics

Next steps:
1. Import your first batch of leads: [Import URL]
2. Watch your dashboard: [Dashboard URL]
3. We'll monitor your first few calls to ensure everything's perfect

Any questions? Just reply to this email!

Let's convert some leads! 🚀
```

---

## 💰 **Pricing Plans:**

Currently configured:
- **Starter:** £500/month (200 leads)
- **Growth:** £1,200/month (500 leads)
- **Pro:** £2,500/month (unlimited)

All include 14-day free trial.

### **To Add Stripe Billing:**
1. Set up Stripe account
2. Create product/pricing in Stripe dashboard
3. Add Stripe.js to signup.html
4. Update API to create Stripe customer/subscription
5. Add webhook for payment success/failure

---

## 🔧 **Customization:**

### **Change Pricing:**
Edit `public/signup.html` lines 230-280

### **Change Trial Period:**
Edit `lib/auto-onboarding.js` line 115:
```javascript
trialEndsAt.setDate(trialEndsAt.getDate() + 14); // Change 14 to desired days
```

### **Customize Welcome Email:**
Edit `lib/auto-onboarding.js` lines 180-300

### **Add More Industries:**
Edit `public/signup.html` lines 110-125

---

## 📈 **What's Next:**

### **Phase 2: Full Automation**
- Auto-create Vapi assistants via API
- Auto-provision Twilio numbers
- Auto-setup Google Calendar (OAuth)
- Payment processing (Stripe)
- Instant go-live (zero manual work)

### **Phase 3: Advanced Features**
- White-label dashboards
- Custom domains per client
- Real-time call monitoring
- A/B testing different scripts
- Automated weekly reports

---

## 🐛 **Troubleshooting:**

### **Client can't access dashboard:**
Check URL format: `/dashboard/their_client_key`

### **Welcome email not sent:**
Check logs for `[AUTO-ONBOARD]` errors
Verify EMAIL_USER and EMAIL_PASS env vars

### **Duplicate client key:**
Very rare, but system will return error 409
Client should contact support

### **API key lost:**
You'll need to generate new one manually:
```javascript
const crypto = require('crypto');
const newKey = 'sk_live_' + crypto.randomBytes(32).toString('hex');
// Hash it and update api_keys table
```

---

## ✅ **Testing Checklist:**

Before sharing with real clients:

- [ ] Test full signup flow
- [ ] Verify welcome email sent
- [ ] Check database entries created
- [ ] Test dashboard access
- [ ] Test settings page
- [ ] Test lead import with test account
- [ ] Manually create Vapi assistant for test account
- [ ] Test full flow (signup → setup → import → call)

---

## 🎯 **Success Metrics:**

Track these for onboarding optimization:
- Signup → First lead import (goal: < 24 hours)
- Signup → First call (goal: < 48 hours)
- Trial → Paid conversion (goal: > 50%)
- Time to setup per client (goal: < 10 mins)

---

## 📞 **Support:**

If clients need help:
- Email: support@yourcompany.com
- Phone: +44 123 456 7890
- They can reply to welcome email
- Dashboard has support link

---

**Your automated onboarding is ready! 🚀**

Test it at: https://ai-booking-mvp.onrender.com/signup.html

