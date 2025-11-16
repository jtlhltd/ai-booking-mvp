# Demo Client Creator - Environment Variables

## ✅ Required for Demo Script

These are **required** for the demo client creator script to work:

```env
# Vapi Configuration (REQUIRED)
VAPI_PRIVATE_KEY=your-vapi-private-key-here
VAPI_TEMPLATE_ASSISTANT_ID=your-template-assistant-id-here

# Base URL (OPTIONAL but recommended)
BASE_URL=https://your-app.onrender.com
```

---

## 📋 What Each Variable Does

### `VAPI_PRIVATE_KEY` (Required)
- **What:** Your Vapi API private key
- **Where to get:** https://dashboard.vapi.ai → Settings → API Keys
- **Used for:** Updating assistant settings, creating assistants

### `VAPI_TEMPLATE_ASSISTANT_ID` (Required)
- **What:** ID of your template assistant
- **Where to get:** Vapi dashboard → Assistants → Click template → Copy ID from URL
- **Used for:** Cloning base assistant for demos

### `BASE_URL` (Optional but Recommended)
- **What:** Your application's public URL
- **Example:** `https://ai-booking-mvp.onrender.com`
- **Used for:** Generating dashboard URLs in demo scripts
- **Default:** `https://yourdomain.com` (placeholder)

---

## 🎯 Current Status

You already have:
- ✅ `VAPI_PRIVATE_KEY` - Set
- ✅ `VAPI_TEMPLATE_ASSISTANT_ID` - Set
- ⚠️ `BASE_URL` - Currently placeholder

---

## 🔧 What to Update

**Update `BASE_URL`** with your actual Render app URL:

```env
BASE_URL=https://your-actual-app-name.onrender.com
```

This ensures the dashboard URLs in your demo scripts are correct.

---

## 📝 Optional Variables (Not Required for Demos)

These are optional - only needed if you want full functionality:

```env
# Database (optional - uses SQLite by default)
DATABASE_URL=your-postgres-url

# Twilio (optional - for SMS in demos)
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_FROM_NUMBER=your-number

# Google Calendar (optional - for calendar integration in demos)
GOOGLE_CLIENT_EMAIL=your-email
GOOGLE_PRIVATE_KEY=your-key
GOOGLE_CALENDAR_ID=your-calendar-id

# Email (optional - for notifications)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

---

## ✅ Quick Check

Run this to verify your setup:
```bash
node scripts/create-demo-client.js "Test Business" "dentist" "Checkup"
```

If it works, you're all set! 🎉





