# 🎯 VAPI TOOLS SETUP GUIDE

## ❌ **CURRENT ISSUE:**
Your `notify_send` tool is failing with `{"error":"Unauthorized"}` because it can't authenticate with your server.

## 🔧 **THE FIX:**

### **Step 1: Create `.env` File**

Create a file called `.env` in your project root with:

```env
# API Configuration
API_KEY=your-secret-api-key-here

# VAPI Configuration  
VAPI_PRIVATE_KEY=your-vapi-private-key-here
VAPI_ASSISTANT_ID=dd67a51c-7485-4b62-930a-38ec01833e63
VAPI_PHONE_NUMBER_ID=your-phone-number-id-here

# Twilio Configuration (for SMS)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_FROM_NUMBER=your-twilio-phone-number

# Google Calendar Configuration
GOOGLE_CLIENT_EMAIL=your-google-client-email
GOOGLE_PRIVATE_KEY=your-google-private-key
GOOGLE_CALENDAR_ID=primary

# Email Configuration
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Timezone
TZ=Europe/London
```

### **Step 2: Add Environment Variables to Vapi**

In your Vapi dashboard:

1. **Go to "Advanced" tab**
2. **Find "Environment Variables"**
3. **Add:**
   - `API_KEY` = same value as in your `.env`
   - `ClientKey` = test-client-key (for testing)

### **Step 3: Get Your API Key**

Your server expects an API key. You can either:

**Option A: Generate a new one**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Option B: Use this test key:**
```
test-api-key-12345
```

### **Step 4: Test Again**

After setting up the environment variables:

1. **Update your `.env` file** with the API key
2. **Restart your server**
3. **Test your Vapi assistant again**

## 🎯 **EXPECTED RESULT:**

After fixing the authentication:

**You say:** "Yes, I'm interested. Book me an appointment."

**Assistant should:**
1. Ask for date/time
2. Use `calendar_checkAndBook` tool ✅
3. Use `notify_send` tool ✅ (no more "Unauthorized")
4. Actually book the appointment ✅

## 🚀 **QUICK TEST:**

1. **Create `.env` file** with API key
2. **Restart server:** `npm start`
3. **Test Vapi assistant** again
4. **Watch it actually book appointments!**

---

## 💡 **THE KEY INSIGHT:**

**Your tools are perfect - you just need authentication set up!**

Once you fix the API key issue, your assistant will be able to:
- ✅ Book appointments
- ✅ Send SMS confirmations  
- ✅ Save lead data
- ✅ Work end-to-end

**Then you're ready for real clients!** 🎉

