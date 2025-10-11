# 📋 **VAPI DAILY TESTING CARD**

**Quick Reference for Testing Your AI Calling Assistant**

---

## ⚡ **QUICK START (5 Minutes)**

### **Step 1: Open Vapi**
1. Go to [Vapi Dashboard](https://dashboard.vapi.ai)
2. Select your assistant
3. Click **"Talk to Assistant"**

### **Step 2: Make 5 Test Calls**
Test these 5 scenarios (1 minute each):
1. ✅ Interested prospect
2. ✅ "I'm busy"
3. ✅ "Not interested"
4. ✅ "How much?"
5. ✅ "Send me info"

### **Step 3: Score Each Call**
| Scenario | Converted? | Notes |
|----------|------------|-------|
| Interested | ✅/❌ | |
| Busy | ✅/❌ | |
| Not interested | ✅/❌ | |
| Price question | ✅/❌ | |
| Send info | ✅/❌ | |

**Conversion Rate:** X/5 = __%

---

## 🎯 **THE 5 CRITICAL QUESTIONS**

### **Q1: Do They Hang Up in 10 Seconds?**
- ✅ **No** → Opening is good
- ❌ **Yes** → Opening needs work (see Opening Fixes below)

### **Q2: Does the AI Sound Natural?**
- ✅ **Yes** → Voice/model settings good
- ❌ **No** → Adjust voice speed, temperature (see Settings below)

### **Q3: Does It Handle Objections Well?**
- ✅ **Yes** → Objection responses working
- ❌ **No** → Rewrite objection section (see Objection Fixes below)

### **Q4: Is the Close Clear?**
- ✅ **Yes** → They know next steps
- ❌ **No** → Simplify close (see Close Fixes below)

### **Q5: Is It Under 2 Minutes?**
- ✅ **Yes** → Good pace
- ❌ **No** → AI talking too much (see Duration Fixes below)

---

## 🔧 **QUICK FIXES (Copy & Paste)**

### **Opening Fixes**

**If hang-up rate >30%, try this:**
```
"Hi there, quick question - do you ever miss appointments 
when you can't answer the phone?"
```

**Or this:**
```
"Morning! Are you still handling bookings manually, or have 
you sorted that out?"
```

**Test both. Pick winner.**

---

### **Objection Fixes**

**"I'm busy" Response:**
```
"Totally understand! I'll text you a link to book a time 
that works for you."
```

**"Not interested" Response:**
```
"Fair enough! Quick question though - do you ever miss calls 
outside business hours?"

[If still no:]
"No worries, have a great day!"
```

**"How much?" Response:**
```
"I'd love to show you exactly how it works first, then we 
can discuss what would make sense for your business. Are you 
free for a quick 15-minute demo Tuesday or Wednesday?"
```

**"Send me info" Response:**
```
"I can do better - I'll text you a 2-minute demo video right 
now. If it looks good, there's a booking link. Sound good?"
```

---

### **Close Fixes**

**If close rate <70%, use this:**
```
"Perfect! I'll send you a text right now. When you get it, 
just reply with your email address and I'll send you the 
booking link. Takes 30 seconds."

[End call after confirming]
```

---

### **Duration Fixes**

**If calls >2 minutes, add this to system prompt:**
```
IMPORTANT: Keep calls under 2 minutes total. Get to the point quickly.
```

**And reduce max tokens:**
```json
{
  "maxTokens": 250  // Down from 500
}
```

---

## 📊 **DAILY TESTING TRACKER**

**Date: _________**

| Test # | Scenario | Outcome | Duration | Notes |
|--------|----------|---------|----------|-------|
| 1 | Interested | ✅/❌ | __s | |
| 2 | Busy | ✅/❌ | __s | |
| 3 | Not interested | ✅/❌ | __s | |
| 4 | Price | ✅/❌ | __s | |
| 5 | Send info | ✅/❌ | __s | |

**Today's Conversion:** __ / 5 = __%  
**Yesterday's Conversion:** __%  
**Change:** +/- __%

**#1 Thing to Fix Tomorrow:** ___________________

---

## 🎯 **WEEKLY GOALS**

| Week | Goal Conversion | Focus Area |
|------|-----------------|------------|
| 1 | 25% | Opening + baseline |
| 2 | 30% | Objection handling |
| 3 | 35% | Close optimization |
| 4 | 40% | Polish & real campaigns |

**Track in your analytics:**
```bash
curl https://your-app.onrender.com/api/analytics/your-client-key/metrics?days=7 \
  -H "X-API-Key: your-api-key" | jq
```

---

## ⚡ **RAPID ITERATION PROCESS**

### **Every Day (15 Minutes):**
1. Make 5 test calls (one scenario each)
2. Track conversion rate
3. If <30% → Identify bottleneck
4. Make ONE change
5. Test again tomorrow

### **Every Week (1 Hour):**
1. Make 20 test calls (full scenarios)
2. Calculate weekly conversion rate
3. Compare to last week
4. If improving → Keep changes ✅
5. If declining → Revert changes ❌

### **Every Month (2 Hours):**
1. Review all analytics
2. Compare to industry benchmarks
3. Major optimization if needed
4. Set new conversion goal

---

## 🔍 **RED FLAGS (Fix Immediately)**

🚨 **Conversion <20%** → System prompt needs complete rewrite  
🚨 **Hang-ups >50%** → Opening is terrible, change now  
🚨 **Duration >3 minutes** → AI rambling, cut it down  
🚨 **Objection rate >80%** → Pitch is too pushy  
🚨 **Close rate <50%** → Next steps unclear  

---

## ✅ **GREEN LIGHTS (Keep Doing This)**

✅ **Conversion >30%** → You're in top 20% of all AI calling  
✅ **Hang-ups <30%** → Opening is working  
✅ **Duration 90-120s** → Perfect pace  
✅ **Objection handling >40%** → Responses are good  
✅ **Close rate >70%** → Strong close  

---

## 🎓 **TESTING BEST PRACTICES**

### **DO:**
✅ Test at different times of day (9am, 12pm, 4pm)  
✅ Test different personas (interested, busy, skeptical)  
✅ Record every call  
✅ Track everything in spreadsheet  
✅ Make ONE change at a time  
✅ Test for at least 10 calls before deciding  

### **DON'T:**
❌ Test only when you "feel like it"  
❌ Make multiple changes at once  
❌ Trust your gut over data  
❌ Skip tracking (memory is unreliable)  
❌ Give up after bad calls (variance is normal)  
❌ Test for only 2-3 calls (sample too small)  

---

## 🚀 **YOUR VAPI TESTING RITUAL**

### **Every Morning (5 Minutes):**
```
☕ Coffee + Vapi testing
1. Open Vapi Dashboard
2. Make 5 quick test calls
3. Calculate conversion rate
4. Note ONE improvement to make
5. Update system prompt if needed
```

### **Every Week (30 Minutes):**
```
📊 Weekly Vapi review
1. Check analytics (last 7 days)
2. Listen to 3-5 call recordings
3. Identify patterns (what's working?)
4. Plan next week's focus
5. Set conversion goal
```

---

## 💡 **REMEMBER:**

> **"Your infrastructure is 100% perfect.  
> Your Vapi assistant just needs 30-50 test calls  
> to become 100% perfect too."**

> **"Test → Measure → Optimize → Repeat"**

> **"The difference between 20% and 40% conversion  
> is 50 test calls and smart iteration."**

---

## 🎯 **START NOW**

1. **Right now:** Make 5 test calls
2. **Track:** What worked, what didn't
3. **Fix:** The #1 thing that broke
4. **Tomorrow:** Test again
5. **This week:** Hit 30% conversion

---

**System infrastructure: PERFECT ✅**  
**Vapi assistant: 50 test calls away from PERFECT ✅**

**Get testing!** 🚀


