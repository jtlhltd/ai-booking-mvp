# AI Booking System - Client Onboarding Guide

## Overview

This guide helps new clients get started with the AI Booking System. Follow these steps to set up your account and start booking appointments automatically.

---

## Step 1: Account Setup

### Initial Configuration

1. **Receive Client Key**
   - You'll receive a unique client key (e.g., `your-business-name`)
   - This key identifies your account

2. **Set Up Calendar Integration**
   - Connect your Google Calendar
   - Grant necessary permissions
   - Verify calendar sync

3. **Configure Phone Number**
   - Set up Twilio phone number (if not already done)
   - Verify phone number works
   - Test SMS sending

---

## Step 2: Business Configuration

### Basic Information

**Required:**
- Business name
- Industry/Service type
- Timezone
- Business hours

**Optional:**
- Logo
- Brand colors
- Custom messaging

### Service Configuration

1. **Define Services:**
   - Service name (e.g., "Personal Training Session")
   - Duration (e.g., 60 minutes)
   - Description

2. **Set Availability:**
   - Business hours
   - Days of week
   - Time slots

3. **Configure Messaging:**
   - SMS templates
   - Call scripts
   - Follow-up sequences

---

## Step 3: Lead Import

### Import Methods

**Option 1: CSV Import**
1. Prepare CSV file with columns:
   - Name
   - Phone
   - Email (optional)
   - Notes (optional)

2. Upload via dashboard:
   - Navigate to "Import Leads"
   - Upload CSV file
   - Map columns
   - Review and import

**Option 2: API Integration**
```bash
POST /api/leads
{
  "clientKey": "your-key",
  "name": "John Doe",
  "phone": "+447123456789",
  "service": "Personal Training"
}
```

**Option 3: Webhook**
- Set up webhook endpoint
- Receive leads automatically
- Process and import

---

## Step 4: Testing

### Test Booking Flow

1. **Create Test Lead:**
   - Add a test lead with your phone number
   - Verify lead appears in dashboard

2. **Test Call:**
   - System will call test lead
   - Answer and complete booking flow
   - Verify appointment created

3. **Test SMS:**
   - Check SMS confirmation received
   - Verify appointment details correct
   - Test reminder SMS

4. **Test Calendar:**
   - Check Google Calendar for appointment
   - Verify time and details correct
   - Test calendar sync

---

## Step 5: Go Live

### Pre-Launch Checklist

- [ ] Calendar integration working
- [ ] Phone number verified
- [ ] Test booking successful
- [ ] SMS confirmations working
- [ ] Calendar sync verified
- [ ] Lead import tested
- [ ] Dashboard accessible
- [ ] Support contact information available

### Launch Steps

1. **Import Initial Leads:**
   - Upload your lead list
   - Verify all leads imported
   - Check for duplicates

2. **Start Campaign:**
   - Enable automatic calling
   - Set calling schedule
   - Monitor initial calls

3. **Monitor Performance:**
   - Check dashboard daily
   - Review call outcomes
   - Track booking rates
   - Optimize based on results

---

## Step 6: Optimization

### Review Performance

**Weekly Reviews:**
- Total leads
- Calls made
- Bookings created
- Conversion rate
- Common objections

**Monthly Reviews:**
- Overall performance trends
- Best performing times
- Service preferences
- Client feedback

### Optimize Settings

1. **Call Script:**
   - Review call transcripts
   - Identify improvement areas
   - Update script based on results

2. **Calling Times:**
   - Analyze best response times
   - Adjust calling schedule
   - Optimize for conversions

3. **Follow-up Sequences:**
   - Review follow-up effectiveness
   - Adjust timing
   - Update messaging

---

## Dashboard Overview

### Key Metrics

**Leads:**
- Total leads
- New leads
- Contacted leads
- Booked leads

**Calls:**
- Total calls
- Successful calls
- Failed calls
- Average duration

**Bookings:**
- Total bookings
- Upcoming appointments
- Cancelled appointments
- Conversion rate

### Features

**Real-time Updates:**
- Live call status
- New bookings
- SMS delivery status
- Calendar sync status

**Analytics:**
- Performance trends
- Conversion funnel
- Peak hours
- Service preferences

---

## Best Practices

### Lead Management

1. **Import Quality Leads:**
   - Verify phone numbers
   - Include relevant information
   - Remove duplicates

2. **Regular Updates:**
   - Import new leads regularly
   - Update lead information
   - Remove opted-out leads

3. **Follow-up:**
   - Review missed calls
   - Retry failed calls
   - Follow up on no-shows

### Call Optimization

1. **Timing:**
   - Call during business hours
   - Avoid early morning/late night
   - Consider timezone differences

2. **Script:**
   - Keep it natural
   - Focus on booking
   - Handle objections gracefully

3. **Follow-up:**
   - Send SMS for missed calls
   - Retry at different times
   - Personalize messaging

---

## Troubleshooting

### Common Issues

**Calls Not Being Made:**
- Check phone number configuration
- Verify VAPI integration
- Check call queue status

**SMS Not Sending:**
- Verify Twilio configuration
- Check phone number format
- Review SMS templates

**Calendar Not Syncing:**
- Verify Google Calendar integration
- Check calendar permissions
- Review calendar configuration

**Dashboard Not Loading:**
- Check internet connection
- Clear browser cache
- Try different browser

### Getting Help

**Support Channels:**
- Email: support@aibookingsystem.com
- Dashboard: Help section
- Documentation: docs/ directory

**Response Times:**
- Critical: Within 1 hour
- High: Within 4 hours
- Medium: Within 24 hours

---

## API Integration

### Getting Started

1. **Get API Key:**
   - Request API key from support
   - Store securely
   - Never share publicly

2. **Test Connection:**
   ```bash
   curl -H "X-API-Key: your-key" \
     https://ai-booking-mvp.onrender.com/api/health/detailed
   ```

3. **Import Leads:**
   ```bash
   curl -X POST \
     -H "X-API-Key: your-key" \
     -H "Content-Type: application/json" \
     -d '{
       "clientKey": "your-key",
       "name": "John Doe",
       "phone": "+447123456789"
     }' \
     https://ai-booking-mvp.onrender.com/api/leads
   ```

### Available Endpoints

See `docs/API-DOCUMENTATION.md` for complete API reference.

---

## Security

### Best Practices

1. **API Keys:**
   - Keep API keys secure
   - Rotate regularly
   - Never commit to version control

2. **Data Privacy:**
   - Follow GDPR guidelines
   - Respect opt-out requests
   - Secure data storage

3. **Access Control:**
   - Limit dashboard access
   - Use strong passwords
   - Enable 2FA if available

---

## Next Steps

1. **Complete Setup:** Follow steps 1-5
2. **Go Live:** Launch with initial leads
3. **Monitor:** Review dashboard daily
4. **Optimize:** Adjust based on performance
5. **Scale:** Increase lead volume as you grow

---

## Resources

- **API Documentation:** `docs/API-DOCUMENTATION.md`
- **Developer Guide:** `docs/DEVELOPER-GUIDE.md`
- **Support:** support@aibookingsystem.com
- **Status Page:** [Link to status page]

---

**Last Updated:** 2025-11-22  
**Version:** 1.0

