# 🚀 GET 500 LEADS IN 60 MINUTES - STEP-BY-STEP

**Goal:** Import 200-500 salon leads with emails into Instantly.ai RIGHT NOW

---

## ⚡ METHOD 1: INSTANTLY FINDER (FASTEST - 15 mins for 200+)

### **Step 1: Access Finder (2 mins)**

1. Log into Instantly.ai
2. Look in **left sidebar** for:
   - "Finder" or "Lead Finder" or "SuperSearch"
   - Or: **Contacts** → **Find Leads**
3. Click it

**If you don't see it:**
- May not be on your plan
- Skip to Method 2 (Google Maps)

---

### **Step 2: Search for Salons (5 mins)**

**In Finder, search:**

```
"beauty salon owner" United Kingdom
```

**Or try:**
```
"hair salon owner" United Kingdom
```

**Filters to use:**
- Location: United Kingdom (or specific cities)
- Job Title: Owner, Manager, Director
- Industry: Consumer Services, Beauty, Personal Care

**Click "Search"**

---

### **Step 3: Select & Export (5 mins)**

1. **Review results** (should see 50-200+ profiles)
2. **Select ALL:**
   - Check box at top to select all
   - Or manually select first 100-200
3. **Click "Add to Campaign"** or **"Export"**
4. **Choose your campaign:** "Initial Outreach"
5. **Click "Add"**

**Result:** 100-200 leads added instantly!

---

### **Step 4: Repeat for More Leads (3 mins)**

**Try different searches:**
- "spa owner" United Kingdom
- "nail salon owner" United Kingdom
- "beauty clinic owner" United Kingdom

**Add each batch to campaign**

**Total:** 200-400 leads in 15 minutes!

---

## 🗺️ METHOD 2: GOOGLE MAPS + EMAIL EXTRACTOR (30-45 mins for 200+)

**Use this if Finder isn't available or you need more leads**

---

### **Step 1: Create Your Google Sheet (5 mins)**

1. Go to **sheets.google.com**
2. Create new spreadsheet
3. Name it: "Salon Leads - [Today's Date]"
4. Set up columns:
   - **A:** Salon Name
   - **B:** Website URL
   - **C:** Email (will be filled by script)
   - **D:** Status

---

### **Step 2: Collect Website URLs from Google Maps (20 mins)**

**Fast technique:**

1. **Open Google Maps** (maps.google.com)
2. **Search:** "beauty salon London"
3. **Open 10 salon listings** in new tabs (Ctrl+Click each)
4. **For each salon:**
   - Scroll to "Website" section
   - Right-click → Copy link address
   - Paste into Column B of your sheet
   - Paste salon name in Column A
5. **Repeat for different cities:**
   - "beauty salon Manchester"
   - "beauty salon Birmingham"
   - "beauty salon Leeds"
   - "beauty salon Bristol"

**Pro tip:** Keep all tabs open, copy URLs in batches

**Target:** 50-100 URLs in 20 minutes

---

### **Step 3: Run Email Extractor Script (10 mins)**

1. **Open your Google Sheet**
2. **Extensions** → **Apps Script**
3. **Paste this script** (if you haven't already):

```javascript
function extractEmails() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    const website = data[i][1];
    if (!website || website === '') continue;
    
    try {
      let url = website.trim();
      if (!url.startsWith('http')) url = 'https://' + url;
      
      const pages = ['', '/contact', '/contact-us', '/about'];
      let email = null;
      
      for (const page of pages) {
        try {
          const fullUrl = url.replace(/\/$/, '') + page;
          const response = UrlFetchApp.fetch(fullUrl, {
            muteHttpExceptions: true,
            followRedirects: true
          });
          
          const html = response.getContentText();
          
          // Find mailto: links
          const mailtoRegex = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
          const mailtoMatches = html.match(mailtoRegex);
          if (mailtoMatches && mailtoMatches.length > 0) {
            email = mailtoMatches[0].replace('mailto:', '');
            break;
          }
          
          // Find emails in text
          const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
          const matches = html.match(emailRegex);
          
          if (matches && matches.length > 0) {
            const validEmails = matches.filter(e => {
              const invalid = ['example.com', 'email.com', 'domain.com', 'sentry.io',
                              'doubleclick', 'google', 'facebook', 'twitter', 'linkedin'];
              return !invalid.some(domain => e.toLowerCase().includes(domain));
            });
            
            if (validEmails.length > 0) {
              const preferred = validEmails.find(e => 
                e.startsWith('info@') || e.startsWith('contact@') || 
                e.startsWith('hello@') || e.startsWith('bookings@')
              );
              email = preferred || validEmails[0];
              break;
            }
          }
        } catch (e) {
          continue;
        }
      }
      
      if (email) {
        sheet.getRange(i + 1, 3).setValue(email);
        sheet.getRange(i + 1, 4).setValue('✅ Found');
      } else {
        sheet.getRange(i + 1, 4).setValue('❌ Not Found');
      }
      
      Utilities.sleep(1500);
      
    } catch (error) {
      sheet.getRange(i + 1, 4).setValue('❌ Error');
    }
  }
  
  SpreadsheetApp.getUi().alert('Done! Check Column C for emails.');
}
```

4. **Save** → Click **Run** → Select `extractEmails`
5. **Allow permissions** (first time only)
6. **Wait 10-15 minutes** (for 50-100 URLs)

**Result:** 20-40 emails found automatically!

---

### **Step 4: Manual Email Collection (For "Not Found" Ones) (15 mins)**

**For salons with "❌ Not Found":**

1. **Visit their website** (from Column B)
2. **Check:**
   - Contact page
   - About page
   - Footer
   - Bookings page
3. **Find email** → Paste in Column C
4. **Repeat for 10-20 "Not Found" salons**

**Result:** +10-20 more emails

---

### **Step 5: Export to CSV & Import to Instantly (5 mins)**

1. **Filter sheet:**
   - Filter Column D to show only "✅ Found"
   - You should have 30-60 emails

2. **Prepare for Instantly:**
   - Create new sheet or columns:
     - **Email** (from Column C)
     - **First Name** (split from salon name or use "Owner")
     - **Company** (from Column A)
     - **Website** (from Column B)

3. **Export:**
   - File → Download → CSV

4. **Import to Instantly:**
   - Instantly → **Contacts** → **Import**
   - Upload CSV
   - Map columns: Email → Email, Company → Company, etc.
   - **Add to campaign:** "Initial Outreach"

**Result:** 30-60 leads imported!

---

### **Step 6: Repeat for More Cities (Optional)**

**Do this 3-4 more times with different cities:**
- Manchester
- Birmingham  
- Leeds
- Bristol
- Sheffield
- Liverpool

**Total:** 100-200 leads from Google Maps method!

---

## 🔥 METHOD 3: HYBRID APPROACH (FASTEST - 60 mins for 300+)

**Combine both methods:**

### **Minutes 0-15: Instantly Finder**
- Search + export 200 leads
- Add to campaign

### **Minutes 15-45: Google Maps**
- Collect 50-100 URLs
- Run email extractor
- Get 30-50 emails
- Import to Instantly

### **Minutes 45-60: LinkedIn Quick Grab**
- Search "beauty salon owner [city]"
- Click 20 profiles → Get company websites
- Manually extract 10-15 emails
- Add to Instantly

**Total:** 240-265 leads in 60 minutes!

---

## 📊 QUICK REFERENCE: EXPECTED RESULTS

**Instantly Finder:**
- ⏱️ **Time:** 15 mins
- 📧 **Leads:** 200-400 (with emails already found)
- ✅ **Success Rate:** 100% (emails pre-verified)

**Google Maps + Extractor:**
- ⏱️ **Time:** 45 mins
- 📧 **Leads:** 30-60 (emails extracted)
- ✅ **Success Rate:** 40-60% (not all salons list emails)

**Hybrid (Both Methods):**
- ⏱️ **Time:** 60 mins
- 📧 **Leads:** 300-500
- ✅ **Success Rate:** High mix

---

## ✅ IMPORT CHECKLIST

**Before importing to Instantly:**

- [ ] Leads have email addresses (required!)
- [ ] First name column (or use "Owner" as default)
- [ ] Company/salon name column
- [ ] Website URL (optional but helpful)
- [ ] Remove duplicates
- [ ] Verify CSV format is correct

**Instantly import format:**
```
Email, First Name, Company, Website
info@salon.com, Sarah, Beauty Bar, https://beautybar.com
```

---

## 🚀 START NOW - 15 MINUTE SPRINT

**Right now, do this:**

1. **Open Instantly.ai** → Find "Finder" (2 mins)
2. **Search:** "beauty salon owner United Kingdom" (1 min)
3. **Select all results** → Add to "Initial Outreach" campaign (2 mins)
4. **Done!** You now have 100-200+ leads

**If Finder works:** You're done in 5 minutes!

**If Finder doesn't exist:** Start Google Maps method (45 mins total)

---

**Want me to help you with any step? Let me know what you're seeing!**








