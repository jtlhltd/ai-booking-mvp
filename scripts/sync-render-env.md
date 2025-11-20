# 🔄 How to Sync Render Environment Variables Locally

Since your environment variables are on Render, here's how to use them locally for testing:

## Option 1: Copy from Render Dashboard (Recommended)

1. Go to your Render dashboard: https://dashboard.render.com
2. Navigate to your service
3. Go to "Environment" tab
4. Copy the values you need
5. Create/update `.env` file locally with those values

## Option 2: Use Render CLI

```bash
# Install Render CLI (if not installed)
npm install -g render-cli

# Login
render login

# Get environment variables
render env pull
```

## Option 3: Test on Render Directly

Since all env vars are on Render, you can:
1. Deploy your code to Render
2. Test the API endpoints directly on Render
3. Use the production URL for testing

## Quick Setup

Create a `.env` file in the root directory with:

```env
# Copy these from Render dashboard
API_KEY=your_render_api_key
VAPI_PRIVATE_KEY=your_render_vapi_key
VAPI_ASSISTANT_ID=your_render_assistant_id
VAPI_PHONE_NUMBER_ID=your_render_phone_id
GOOGLE_SHEETS_SPREADSHEET_ID=your_render_sheet_id
GOOGLE_APPLICATION_CREDENTIALS=ai-agency-471712-7d24cc6ffd93.json
DATABASE_URL=your_render_db_url
TWILIO_ACCOUNT_SID=your_render_twilio_sid
TWILIO_AUTH_TOKEN=your_render_twilio_token
PUBLIC_BASE_URL=https://your-app.onrender.com
```

## Test Without Local Setup

You can also test directly against your Render deployment:

```bash
# Set PUBLIC_BASE_URL to your Render URL
export PUBLIC_BASE_URL=https://your-app.onrender.com

# Then run tests
node scripts/test-submit-lead.js
```



