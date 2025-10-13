# Google Calendar Domain-Wide Delegation Setup

## Overview
To enable calendar invitations in your AI Booking MVP, you need to set up Domain-Wide Delegation for your Google service account.

## Step-by-Step Setup

### 1. Access Google Cloud Console
- Go to: https://console.cloud.google.com/
- Select your project (the one containing your service account)

### 2. Navigate to Service Accounts
- Go to: **IAM & Admin** → **Service Accounts**
- Find your service account (the one with `GOOGLE_CLIENT_EMAIL`)

### 3. Enable Domain-Wide Delegation
- Click on your service account
- Go to the **Details** tab
- Click **"Show domain-wide delegation"**
- Click **"Enable Google Workspace Domain-wide Delegation"**

### 4. Configure OAuth Scopes
When prompted for OAuth scopes, add these:
```
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/calendar.events
```

### 5. Get Client ID
- After enabling delegation, you'll get a **Client ID**
- Save this Client ID - you'll need it for the next step

### 6. Configure Google Workspace Admin Console
- Go to: https://admin.google.com/
- Navigate to: **Security** → **API Controls** → **Domain-wide Delegation**
- Click **"Add new"**
- Enter the **Client ID** from step 5
- Add the OAuth scopes:
  ```
  https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/calendar.events
  ```
- Click **"Authorize"**

### 7. Test the Configuration
After completing the setup, test your booking system:
```bash
# Test booking with calendar invitation
curl -X POST https://ai-booking-mvp.onrender.com/api/book-demo \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "company": "Test Company",
    "phone": "+447123456789",
    "slotId": "2025-09-29T08:00:00.000Z"
  }'
```

## Expected Result
After successful setup, you should see:
- ✅ Calendar events created successfully
- ✅ Email invitations sent to attendees
- ✅ No "Domain-Wide Delegation" errors

## Troubleshooting

### Common Issues:
1. **"Service accounts cannot invite attendees"**
   - Solution: Complete Domain-Wide Delegation setup

2. **"Invalid scopes"**
   - Solution: Ensure both calendar scopes are added

3. **"Client ID not authorized"**
   - Solution: Complete Google Workspace Admin Console authorization

### Verification Steps:
1. Check service account has delegation enabled
2. Verify OAuth scopes are correct
3. Confirm Google Workspace authorization is complete
4. Test with a real booking request

## Environment Variables Required:
- `GOOGLE_CLIENT_EMAIL` - Your service account email
- `GOOGLE_PRIVATE_KEY` - Your service account private key
- `GOOGLE_CALENDAR_ID` - Your calendar ID (optional, defaults to primary)

## Support:
If you encounter issues, check:
1. Google Cloud Console service account settings
2. Google Workspace Admin Console delegation settings
3. Server logs for specific error messages
