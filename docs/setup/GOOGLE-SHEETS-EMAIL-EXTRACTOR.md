# 🚀 Google Sheets Email Extractor (Free Automation)

Automatically extract emails from salon websites using Google Sheets Apps Script. No coding required - just copy/paste!

---

## 🎯 STEP 0: GET THE WEBSITE URLs FIRST (FREE METHODS)

**You need salon website URLs before running the email extractor. Here's how to get them:**

---

### **METHOD 1: Google Maps (Fastest - 20-30 URLs in 10 mins)**

**Step-by-step:**
1. Go to **Google Maps** (maps.google.com)
2. Search: **"beauty salon [city]"** or **"hair salon [city]"**
   - Example: "beauty salon London"
   - Example: "hair salon Manchester"
3. You'll see 50-100+ salons on the map
4. Click each salon listing → Scroll to "Website" section
5. Copy the website URL

**Pro tip:**
- Open 10-15 salon tabs at once
- Copy all URLs in bulk
- Paste into your Google Sheet (Column B)

**Time:** ~30 seconds per salon × 20 = 10 minutes for 20 URLs

---

### **METHOD 2: LinkedIn (Get Owner + Website)**

**Step-by-step:**
1. Go to **LinkedIn.com**
2. Search: **"beauty salon owner United Kingdom"**
3. Or: **"hair salon owner [city]"**
4. Click each profile → Look for company name
5. Click company name → See company LinkedIn page
6. Scroll to "Website" → Copy URL

**What you get:**
- Owner name (for Column A: Salon Name)
- Website URL (for Column B)
- Sometimes email already visible

**Time:** ~1 minute per profile × 20 = 20 minutes for 20 URLs

---

### **METHOD 3: Instantly.ai SuperSearch (Easiest - If You Have It)**

**If your Instantly plan includes Lead Finder:**

1. Log into Instantly.ai
2. Go to **"Finder"** or **"Lead Finder"** (in sidebar)
3. Search: **"beauty salon owner United Kingdom"**
4. Filter: Location, Industry
5. **Export results** → You'll get names + websites
6. Copy website column to your Google Sheet

**Time:** 5 minutes for 50-100 results!

---

### **METHOD 4: Google Search (Bulk Method)**

**For specific cities:**

1. Go to **Google.com**
2. Search: **"beauty salon [city] website"**
3. Click through top 20 results
4. Each salon website usually shows:
   - Business name in header
   - Contact page with email
   - About page with owner name
5. Copy website URLs as you find them

**Advanced Google Search:**
```
site:facebook.com "beauty salon" "[city]" website
site:instagram.com "hair salon" "[city]" link
```

**Time:** 15 minutes for 20-30 URLs

---

### **METHOD 5: Booking Platforms (Find Salons → Get Websites)**

**These platforms list salons with links:**

1. **Treatwell** (treatwell.co.uk)
   - Search "beauty salon [city]"
   - Click each salon → Often links to their website

2. **Fresha** (fresha.com)
   - Search salons → Many have website links

3. **Booksy** (booksy.com)
   - Browse salons → Extract websites

4. **Yell** (yell.com)
   - Search "beauty salon [city]"
   - Each listing usually has website URL

**Time:** 20 minutes for 30-40 URLs

---

### **METHOD 6: Built-in Business Search APIs**

The repo ships two reusable libraries (in `lib/`) that power the same lookups via the running server:
- `lib/enhanced-business-search.js` — sample/fallback UK business generator (used by `POST /api/uk-business-search`)
- `lib/real-uk-business-search.js` — real Google Places + Companies House lookup
- `lib/real-decision-maker-contact-finder.js` — decision-maker discovery (used by `POST /api/decision-maker-contacts`)

**How to use:**
1. Hit `POST /api/uk-business-search` with `{ "query": "beauty salon london" }` to get matching businesses
2. Hit `POST /api/decision-maker-contacts` with the business payload to get owner/director contacts
3. Export to your Google Sheet

---

## 📋 QUICK WORKFLOW: GET 20 URLs IN 15 MINUTES

**Best combo method:**

1. **Google Maps (10 mins):**
   - Search "beauty salon London"
   - Open 15 salon listings
   - Copy 15 website URLs

2. **LinkedIn (5 mins):**
   - Search "beauty salon owner London"
   - Click 5 profiles → Get 5 more websites

3. **Paste into Google Sheet:**
   - Column A: Salon name
   - Column B: Website URL
   - **Total: 20 URLs ready!**

---

## 📋 SETUP (5 minutes)

### **Step 1: Create Your Sheet**

1. Open Google Sheets → New Spreadsheet
2. Name it: "Salon Email Extractor"
3. Create columns in Row 1:
   - **A:** Salon Name
   - **B:** Website URL
   - **C:** Email Found
   - **D:** Status

### **Step 2: Add Your Salon Websites**

Paste salon websites in Column B:
```
A1: Salon Name | B1: Website URL | C1: Email Found | D1: Status
A2: Hair Studio | B2: https://hairstudio.com | C2: (empty) | D2: (empty)
A3: Beauty Bar | B3: https://beautybar.co.uk | C3: (empty) | D3: (empty)
```

**Tip:** Get websites from:
- Google Maps → "beauty salon [city]"
- LinkedIn company pages
- Your existing lead list

---

## 🤖 INSTALL THE SCRIPT (Copy/Paste)

### **Step 3: Open Apps Script Editor**

1. In Google Sheets: **Extensions** → **Apps Script**
2. Delete any existing code
3. Paste this script:

```javascript
/**
 * Email Extractor for Salon Websites
 * Scrapes contact/about pages to find email addresses
 */

function extractEmails() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = sheet.getDataRange().getValues();
  
  // Start from row 2 (skip header)
  for (let i = 1; i < data.length; i++) {
    const website = data[i][1]; // Column B
    const salonName = data[i][0]; // Column A
    
    if (!website || website === '') continue;
    
    try {
      // Clean URL
      let url = website.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      
      // Try multiple pages
      const pages = ['', '/contact', '/contact-us', '/about', '/about-us', '/team'];
      let email = null;
      
      for (const page of pages) {
        try {
          const fullUrl = url.replace(/\/$/, '') + page;
          const response = UrlFetchApp.fetch(fullUrl, {
            muteHttpExceptions: true,
            followRedirects: true
          });
          
          const html = response.getContentText();
          
          // Find emails using regex
          const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
          const matches = html.match(emailRegex);
          
          if (matches && matches.length > 0) {
            // Filter out common false positives
            const validEmails = matches.filter(e => 
              !e.includes('example.com') && 
              !e.includes('email.com') &&
              !e.includes('domain.com') &&
              !e.includes('sentry.io') &&
              !e.includes('doubleclick') &&
              !e.includes('google-analytics') &&
              !e.includes('facebook.com') &&
              !e.includes('twitter.com') &&
              !e.includes('linkedin.com')
            );
            
            if (validEmails.length > 0) {
              email = validEmails[0]; // Take first valid email
              break; // Found email, stop searching
            }
          }
        } catch (e) {
          // Continue to next page
          continue;
        }
      }
      
      // Write result
      if (email) {
        sheet.getRange(i + 1, 3).setValue(email); // Column C
        sheet.getRange(i + 1, 4).setValue('✅ Found'); // Column D
      } else {
        sheet.getRange(i + 1, 4).setValue('❌ Not Found'); // Column D
      }
      
      // Add delay to avoid rate limits
      Utilities.sleep(1000); // Wait 1 second between requests
      
    } catch (error) {
      sheet.getRange(i + 1, 4).setValue('❌ Error: ' + error.toString());
    }
  }
  
  SpreadsheetApp.getUi().alert('Email extraction complete!');
}

/**
 * Custom menu button (optional)
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Email Extractor')
    .addItem('Extract All Emails', 'extractEmails')
    .addToUi();
}
```

### **Step 4: Save & Run**

1. Click **Save** (💾) → Name it "Email Extractor"
2. Click **Run** (▶️) → Select `extractEmails`
3. **First time only:** Click "Review Permissions" → Choose your Google account → Click "Advanced" → Click "Go to Email Extractor (unsafe)" → Click "Allow"
4. Wait 10-30 seconds → Check your sheet!

---

## 🎯 HOW IT WORKS

**The script automatically:**
1. Reads website URLs from Column B
2. Visits each website + common pages (`/contact`, `/about`)
3. Searches for email addresses in the HTML
4. Filters out fake/test emails
5. Writes found emails to Column C
6. Marks status in Column D (✅ Found / ❌ Not Found)

**Searches these pages:**
- Homepage
- `/contact`
- `/contact-us`
- `/about`
- `/about-us`
- `/team`

---

## ⚡ QUICK USE

### **Option 1: Menu Button**
1. Refresh your Google Sheet
2. You'll see **"Email Extractor"** menu at top
3. Click **Email Extractor** → **Extract All Emails**
4. Wait → Done!

### **Option 2: Manual Run**
1. Apps Script → Run `extractEmails`

---

## 📊 RESULTS

After running, your sheet will look like:

```
A                    B                          C                      D
Salon Name          Website URL                Email Found           Status
Hair Studio         https://hairstudio.com     info@hairstudio.com   ✅ Found
Beauty Bar          https://beautybar.co.uk    contact@beautybar.co.uk ✅ Found
Spa & Salon         https://spasalon.com       (empty)               ❌ Not Found
```

---

## 🎨 ENHANCED VERSION (Better Success Rate)

Want even better results? Use this enhanced script that also:
- Checks `/contact` page metadata
- Extracts emails from mailto: links
- Looks in footer/header HTML sections
- Validates email format

```javascript
/**
 * Enhanced Email Extractor - Higher Success Rate
 */

function extractEmailsEnhanced() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    const website = data[i][1];
    if (!website || website === '') continue;
    
    try {
      let url = website.trim();
      if (!url.startsWith('http')) url = 'https://' + url;
      
      // Pages to check
      const pages = ['', '/contact', '/contact-us', '/about', '/about-us'];
      let email = null;
      
      for (const page of pages) {
        try {
          const fullUrl = url.replace(/\/$/, '') + page;
          const response = UrlFetchApp.fetch(fullUrl, {
            muteHttpExceptions: true,
            followRedirects: true
          });
          
          const html = response.getContentText();
          
          // Method 1: Find mailto: links (most reliable)
          const mailtoRegex = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
          const mailtoMatches = html.match(mailtoRegex);
          if (mailtoMatches && mailtoMatches.length > 0) {
            email = mailtoMatches[0].replace('mailto:', '');
            break;
          }
          
          // Method 2: Find emails in text
          const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
          const matches = html.match(emailRegex);
          
          if (matches && matches.length > 0) {
            const validEmails = matches.filter(e => {
              const invalid = [
                'example.com', 'email.com', 'domain.com', 'sentry.io',
                'doubleclick', 'google', 'facebook', 'twitter', 'linkedin',
                'youtube', 'instagram', 'pinterest', 'analytics', 'tracking'
              ];
              return !invalid.some(domain => e.toLowerCase().includes(domain));
            });
            
            if (validEmails.length > 0) {
              // Prefer info@, contact@, hello@ over random emails
              const preferred = validEmails.find(e => 
                e.startsWith('info@') || 
                e.startsWith('contact@') || 
                e.startsWith('hello@') ||
                e.startsWith('bookings@')
              );
              email = preferred || validEmails[0];
              break;
            }
          }
        } catch (e) {
          continue;
        }
      }
      
      // Write result
      if (email) {
        sheet.getRange(i + 1, 3).setValue(email);
        sheet.getRange(i + 1, 4).setValue('✅ Found');
      } else {
        sheet.getRange(i + 1, 4).setValue('❌ Not Found');
      }
      
      Utilities.sleep(1500); // Be nice to servers
      
    } catch (error) {
      sheet.getRange(i + 1, 4).setValue('❌ Error');
    }
  }
  
  SpreadsheetApp.getUi().alert('Done! Check Column C for emails.');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🔍 Email Extractor')
    .addItem('Extract All Emails', 'extractEmailsEnhanced')
    .addToUi();
}
```

---

## ⚠️ LIMITATIONS & TIPS

**Rate Limits:**
- Google Apps Script has quotas: ~100 requests/minute
- Script adds 1-2 second delays between requests
- For 50 websites = ~2-3 minutes total

**Success Rate:**
- **Expected:** 40-60% of salons have public emails
- If not found → manually check website or use Hunter.io

**Best Practices:**
1. **Batch processing:** Run on 20-30 websites at a time
2. **Verify emails:** Use mailtester.com before importing to Instantly
3. **Manual backup:** For "Not Found" websites, check manually (often worth it)

---

## 📥 EXPORT TO INSTANTLY.AI

Once you have emails:

1. **Clean your data:**
   - Filter Column D to show only "✅ Found"
   - Copy columns A, B, C (Name, Website, Email)

2. **Format for Instantly:**
   - Create new sheet with columns:
     - Email, First Name, Company, Website
   - Split salon name to get first name (or use "Owner")
   - Company = Salon Name
   - Website = Website URL

3. **Export CSV:**
   - File → Download → CSV
   - Import to Instantly.ai → New Campaign

---

## 🎯 NEXT STEPS

1. ✅ Set up the script (5 mins)
2. ✅ Add 20-30 salon websites (10 mins)
3. ✅ Run extraction (2-3 mins)
4. ✅ Clean & verify emails (10 mins)
5. ✅ Import to Instantly.ai (2 mins)

**Total time: ~30 minutes for 20-30 leads with emails!**

---

**Need help?** The script will show errors in Column D if something goes wrong. Most issues are rate limits (wait 5 mins and try again) or invalid URLs (check Column B).

