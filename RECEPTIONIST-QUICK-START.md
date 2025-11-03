# 🚀 Receptionist Expansion - Quick Start Guide

This guide will help you quickly implement inbound call handling - the first critical step toward a full receptionist system.

---

## 📋 Prerequisites

Before starting, ensure you have:

1. ✅ **Twilio Account** with a phone number
2. ✅ **Vapi Account** with API keys
3. ✅ **Database access** (PostgreSQL)
4. ✅ **Environment variables** configured

---

## 🔧 Step 1: Run Database Migration

Run the migration to create necessary tables:

```bash
# If using migration runner
node run-migration.js

# Or manually run the SQL
psql $DATABASE_URL < migrations/add-inbound-call-support.sql
```

This creates:
- `inbound_calls` - Track all inbound calls
- `customer_profiles` - Store customer info for recognition
- `messages` - Voicemail and messages
- `business_info` - Business hours, services, FAQ
- Enhanced `appointments` - Support rescheduling/cancellation

---

## 🔧 Step 2: Add Routes to server.js

Add the new webhook route to your `server.js`:

```javascript
// Add near other route imports (around line 94)
import twilioVoiceWebhooks from './routes/twilio-voice-webhooks.js';

// Add near other route usage (around line 410)
app.use('/webhooks', twilioVoiceWebhooks);
```

---

## 🔧 Step 3: Configure Twilio Phone Number

1. Go to [Twilio Console](https://console.twilio.com/)
2. Navigate to Phone Numbers → Manage → Active Numbers
3. Click your phone number
4. Under "Voice & Fax", set webhook URL:
   ```
   https://yourdomain.com/webhooks/twilio-voice-inbound
   ```
5. Set HTTP method: **POST**
6. Set "Call Status Callback URL":
   ```
   https://yourdomain.com/webhooks/twilio-voice-status
   ```
7. Save configuration

---

## 🔧 Step 4: Create Inbound Vapi Assistant

1. Go to [Vapi Dashboard](https://dashboard.vapi.ai/)
2. Create a **new Assistant** (separate from outbound assistant)
3. Configure:
   - **Name:** "Inbound Receptionist"
   - **Phone Number:** Use same number as Twilio (or Vapi number if forwarding)
   - **Voice:** Choose appropriate voice (British female recommended)
   - **Model:** GPT-4 or GPT-3.5-turbo

4. **System Prompt:** Use this template:

```
You are a professional AI receptionist for [Business Name]. 
Your role is to handle inbound calls professionally and efficiently.

GREETING:
- During business hours: "Thank you for calling [Business Name]. This is [Your Name], how can I help you today?"
- After hours: "Thank you for calling [Business Name]. We're currently closed, but I can help you with bookings, questions, or take a message. How can I assist you?"

CALL TYPES:
1. **New Booking:** Help caller book a new appointment
   - Check availability using function: get_available_slots()
   - Book using: book_appointment()
   
2. **Reschedule:** Customer wants to change existing appointment
   - Lookup using: lookup_appointment(phone="[caller phone]")
   - Reschedule using: reschedule_appointment()

3. **Cancel:** Customer wants to cancel
   - Lookup appointment
   - Cancel using: cancel_appointment()
   - Offer alternatives

4. **Questions:** Answer FAQ and business information
   - Use: get_business_info() function
   - Be helpful and concise

5. **Messages:** Take detailed message when staff unavailable
   - Capture: name, phone, reason, preferred callback time
   - Use: take_message() function

PERSONALIZATION:
- If caller is recognized (IsKnownCustomer=true), greet by name
- Reference previous appointments if relevant
- Be warm and professional

Always be:
- Polite and professional
- Concise (don't waste caller's time)
- Helpful and solution-oriented
- Clear about next steps
```

5. **Functions to Add:**
   - `lookup_customer(phone)` - Find customer info
   - `lookup_appointment(phone)` - Find appointments
   - `reschedule_appointment(id, newTime)` - Reschedule
   - `cancel_appointment(id, reason)` - Cancel
   - `get_business_info()` - Business hours/FAQ
   - `take_message(details)` - Take message

6. **Save Assistant** and copy the Assistant ID

---

## 🔧 Step 5: Update Environment Variables

Add to your `.env` file:

```env
# Twilio Voice (if not already set)
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx

# Vapi Inbound Assistant
VAPI_INBOUND_ASSISTANT_ID=your_inbound_assistant_id
VAPI_INBOUND_PHONE_NUMBER_ID=your_phone_number_id

# Optional: Vapi forwarding number (if using Twilio → Vapi forwarding)
VAPI_FORWARD_NUMBER=+1234567890
```

---

## 🔧 Step 6: Update Client Configuration

For each client, add inbound assistant configuration to their `vapi_json` in database:

```sql
UPDATE tenants
SET vapi_json = jsonb_set(
  COALESCE(vapi_json, '{}'::jsonb),
  '{inboundAssistantId}',
  '"your_inbound_assistant_id"'
)
WHERE client_key = 'your_client_key';

UPDATE tenants
SET vapi_json = jsonb_set(
  vapi_json,
  '{inboundPhoneNumberId}',
  '"your_phone_number_id"'
)
WHERE client_key = 'your_client_key';
```

Or via API (if you have client update endpoint):

```javascript
{
  vapi: {
    ...existingVapiConfig,
    inboundAssistantId: "your_inbound_assistant_id",
    inboundPhoneNumberId: "your_phone_number_id"
  }
}
```

---

## 🧪 Step 7: Test the Integration

1. **Test inbound call:**
   ```bash
   # Call your Twilio number from your phone
   # Should be routed to Vapi assistant
   ```

2. **Check logs:**
   ```bash
   # Watch server logs for:
   [TWILIO VOICE INBOUND] Routing call...
   [INBOUND ROUTER] ✅ Routing complete
   ```

3. **Verify database:**
   ```sql
   SELECT * FROM inbound_calls ORDER BY created_at DESC LIMIT 5;
   ```

4. **Test customer recognition:**
   - First call: Should be treated as new customer
   - Second call from same number: Should recognize and personalize

---

## 🔍 Troubleshooting

### Issue: Call not routing to Vapi
- **Check:** Twilio webhook URL is publicly accessible
- **Check:** Vapi assistant ID is correct
- **Check:** Server logs for routing errors

### Issue: "Client not found" error
- **Check:** Phone number mapping in database
- **Fix:** Ensure client has phone number in `twilio_json` or `numbers_json`
- **Fix:** Set `DEFAULT_CLIENT_KEY` env var as fallback

### Issue: Vapi call not connecting
- **Check:** Vapi phone number configuration
- **Check:** Twilio → Vapi forwarding (if using)
- **Alternative:** Use Vapi's direct phone number integration

### Issue: Customer not recognized
- **Check:** `customer_profiles` table exists
- **Check:** Customer phone number format matches (E.164)
- **Fix:** Ensure leads/appointments are linked correctly

---

## 📊 Monitoring

Monitor inbound calls:

```sql
-- Today's inbound calls
SELECT 
  COUNT(*) as total_calls,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
  COUNT(CASE WHEN purpose = 'booking' THEN 1 END) as bookings
FROM inbound_calls
WHERE created_at >= CURRENT_DATE;

-- Average call duration
SELECT AVG(duration) as avg_duration_seconds
FROM inbound_calls
WHERE duration IS NOT NULL;
```

---

## ✅ Success Checklist

- [ ] Database migration completed
- [ ] Routes added to server.js
- [ ] Twilio webhook configured
- [ ] Vapi inbound assistant created
- [ ] Environment variables set
- [ ] Client configuration updated
- [ ] Test call successful
- [ ] Customer recognition working
- [ ] Call tracking in database

---

## 🎯 Next Steps

Once inbound calls are working:

1. **Add Appointment Management** (Week 3-4)
   - Implement `lookup_appointment()` function
   - Add reschedule flow
   - Add cancel flow

2. **Add FAQ System** (Week 5-6)
   - Populate `business_info` table
   - Add FAQ entries
   - Test question answering

3. **Add Message Taking** (Week 7-8)
   - Implement `take_message()` function
   - Add voicemail transcription
   - Set up notifications

4. **Add Customer Recognition** (Week 9-10)
   - Populate customer profiles
   - Enhance personalization
   - Track customer preferences

---

## 📚 Documentation

- **Full Analysis:** `RECEPTIONIST-EXPANSION-ANALYSIS.md`
- **Architecture:** See analysis document for full architecture
- **API Reference:** See route files for endpoint details

---

**You're now ready to handle inbound calls! 🎉**

