# 🛠️ Testing Scripts

These scripts help you test your system with real leads.

## Quick Start

```bash
# Run all checks and submit a test lead
node scripts/quick-test.js
```

## Available Scripts

### 1. `quick-test.js` ⭐ **START HERE**
Runs all checks and submits a test lead automatically.

```bash
node scripts/quick-test.js
```

### 2. `test-submit-lead.js`
Submits a single lead to your system.

**Usage:**
```bash
node scripts/test-submit-lead.js [name] [phone] [email] [clientKey] [service] [source]
```

**Examples:**
```bash
# Minimal (uses defaults)
node scripts/test-submit-lead.js

# Full example
node scripts/test-submit-lead.js "John Doe" "+447491683261" "john@example.com" "your_client_key" "Consultation" "test"
```

### 3. `monitor-system.js`
Checks system health and recent activity.

```bash
node scripts/monitor-system.js
```

**Checks:**
- ✅ Server health
- ✅ Recent leads
- ✅ Recent calls
- ✅ Database connection
- ✅ Environment variables

### 4. `check-google-sheets.js`
Tests Google Sheets connection.

```bash
node scripts/check-google-sheets.js
```

**Checks:**
- ✅ Spreadsheet connection
- ✅ Headers are set up
- ✅ Credentials are working
- ✅ Can read/write data

## Prerequisites

Make sure these are set in your `.env` file:
- `API_KEY` - Your API key
- `PUBLIC_BASE_URL` - Your server URL (default: http://localhost:10000)
- `GOOGLE_SHEETS_SPREADSHEET_ID` - Your Google Sheet ID
- `VAPI_API_KEY` - Your VAPI API key
- `DEFAULT_CLIENT_KEY` - Default client key (optional)

## Troubleshooting

**"fetch is not defined"**
- You need Node.js 18+ (which has built-in fetch)
- Or install node-fetch: `npm install node-fetch`

**"API_KEY not set"**
- Add `API_KEY=your_key` to your `.env` file

**"Server not reachable"**
- Make sure your server is running
- Check `PUBLIC_BASE_URL` in `.env`

## Next Steps

After running these scripts:
1. Check VAPI dashboard for call status
2. Check Google Sheet for new data
3. Monitor server logs
4. Review call transcripts

See `GETTING-STARTED-REAL-TESTING.md` for complete guide!



