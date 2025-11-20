# 🚀 Getting Started with Real-World Testing

**Your system is fully tested with code! Now let's test with real leads.**

---

## ⚡ Quick Start (5 Minutes)

### Step 1: Check Your Setup
```bash
node scripts/monitor-system.js
```
This will check:
- ✅ Server health
- ✅ Recent leads and calls
- ✅ Database connection
- ✅ Environment variables

### Step 2: Test Google Sheets
```bash
node scripts/check-google-sheets.js
```
This will verify:
- ✅ Google Sheets connection
- ✅ Headers are set up correctly
- ✅ Credentials are working

### Step 3: Submit Your First Test Lead
```bash
node scripts/test-submit-lead.js "Test Name" "+447491683261" "test@example.com" "your_client_key" "Consultation"
```

**Or use the quick test script:**
```bash
node scripts/quick-test.js
```
This runs all checks and submits a test lead automatically!

---

## 📋 What I've Created For You

### 1. **Test Scripts** (in `scripts/` folder)

#### `test-submit-lead.js`
- Submits a lead to your system
- Triggers a VAPI call automatically
- Shows you the response

**Usage:**
```bash
node scripts/test-submit-lead.js [name] [phone] [email] [clientKey] [service] [source]
```

**Example:**
```bash
node scripts/test-submit-lead.js "John Doe" "+447491683261" "john@example.com" "your_client_key" "Consultation"
```

#### `monitor-system.js`
- Checks server health
- Shows recent leads and calls
- Verifies database connection
- Checks environment variables

**Usage:**
```bash
node scripts/monitor-system.js
```

#### `check-google-sheets.js`
- Tests Google Sheets connection
- Verifies headers are set up
- Checks credentials

**Usage:**
```bash
node scripts/check-google-sheets.js
```

#### `quick-test.js`
- Runs all checks at once
- Submits a test lead
- Perfect for quick validation

**Usage:**
```bash
node scripts/quick-test.js
```

---

## 📝 Complete Testing Checklist

I've created `REAL-WORLD-TESTING-CHECKLIST.md` with:
- ✅ Pre-flight checks
- ✅ Step-by-step testing process
- ✅ Troubleshooting guide
- ✅ Success criteria
- ✅ Daily monitoring checklist

**Open it and follow along!**

---

## 🎯 Your First Real Test (15 Minutes)

### 1. Start Your Server
```bash
npm start
# or however you normally start it
```

### 2. Run Quick Test
```bash
node scripts/quick-test.js
```

### 3. Monitor What Happens
- **Check VAPI Dashboard:** Your call should appear
- **Check Server Logs:** Watch for webhook received
- **Check Google Sheet:** New row should appear
- **Check Database:** Lead and call records should exist

### 4. Verify Everything
- ✅ Call was made
- ✅ Transcript captured
- ✅ Data in Google Sheet
- ✅ Call quality score calculated
- ✅ No errors in logs

---

## 🔍 What to Monitor

### During Testing:
1. **Server Logs** - Watch for errors
2. **VAPI Dashboard** - See call status
3. **Google Sheet** - Verify data appears
4. **Database** - Check records are created

### After Each Test:
1. **Data Quality** - Is everything extracted correctly?
2. **Call Quality** - Is the score reasonable?
3. **Errors** - Any issues to fix?
4. **Performance** - How long did it take?

---

## 🆘 If Something Goes Wrong

### Check These First:
1. **Environment Variables** - Run `node scripts/monitor-system.js`
2. **Server Status** - Is it running?
3. **VAPI Connection** - Check dashboard
4. **Google Sheets** - Run `node scripts/check-google-sheets.js`
5. **Server Logs** - Look for error messages

### Common Issues:

**"API_KEY not set"**
- Set `API_KEY` in your `.env` file

**"GOOGLE_SHEETS_SPREADSHEET_ID not set"**
- Set `GOOGLE_SHEETS_SPREADSHEET_ID` in your `.env` file

**"Server not reachable"**
- Make sure server is running
- Check `PUBLIC_BASE_URL` in `.env`

**"Webhook not received"**
- Check webhook URL in VAPI dashboard
- Verify server is accessible from internet

---

## 📊 Next Steps After First Test

1. **If Everything Works:**
   - Test with 5-10 real leads
   - Monitor closely
   - Scale gradually

2. **If Issues Found:**
   - Fix the issues
   - Test again
   - Don't scale until stable

3. **Optimize:**
   - Review call transcripts
   - Improve system prompt
   - Adjust extraction patterns

---

## 💡 Pro Tips

1. **Start Small** - Test with 1 lead, then 5, then 10
2. **Monitor Closely** - Watch everything on first tests
3. **Document Issues** - Keep notes on what works/doesn't
4. **Iterate Quickly** - Fix issues as you find them
5. **Scale Gradually** - Don't rush to 100 leads

---

## 🎉 You're Ready!

Everything is set up. Just run:

```bash
node scripts/quick-test.js
```

And watch the magic happen! 🚀

---

**Need Help?**
- Check `REAL-WORLD-TESTING-CHECKLIST.md` for detailed steps
- Review server logs for errors
- Check the troubleshooting section in the checklist



