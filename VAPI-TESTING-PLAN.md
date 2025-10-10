# 🧪 VAPI ASSISTANT TESTING PLAN

## 🎯 GOAL
Find the optimal Vapi assistant configuration that maximizes booking rate while maintaining positive sentiment and natural conversation flow.

---

## 📊 PHASE 1: BASELINE TESTING (Week 1)

### **Objective:** Establish current performance metrics

### **What to Test:**
1. **Current Script Performance**
   - Make 20 test calls with your existing Vapi assistant
   - Track: Booking rate, sentiment, objections, avg call duration
   - **Baseline Target:** 30% booking rate minimum

### **Metrics to Track:**
```
✅ Booking Rate (goal: 35-40%)
✅ Sentiment (goal: 60%+ positive)
✅ Average Call Duration (goal: 2-4 minutes)
✅ Objection Types (most common ones)
✅ Drop-off Rate (% who hang up early)
✅ Voicemail Hit Rate (% reaching voicemail)
```

### **Test Leads:**
Use these **FREE test numbers** (Google Voice, test SIMs, friends/family):
- 10 "interested" personas (answer, engaged)
- 5 "skeptical" personas (objections, price concerns)
- 5 "busy" personas (short answers, wants to reschedule)

### **Documentation:**
```markdown
Call #1
- Lead: Test #1 (interested)
- Script: V1-baseline
- Outcome: Booked ✅
- Duration: 3:45
- Sentiment: Positive
- Notes: Asked about pricing but converted easily
- Recording URL: [link]
```

---

## 🔬 PHASE 2: VOICE & TONE TESTING (Week 1-2)

### **Hypothesis:** Voice personality affects booking rate

### **Variables to Test:**

#### **Test 1: Voice Selection**
```javascript
const voices = [
  { id: "jennifer", style: "Professional, warm" },
  { id: "mark", style: "Energetic, confident" },
  { id: "sarah", style: "Calm, trustworthy" }
];
```

**Method:**
- 15 calls per voice (45 calls total)
- Same script for all
- Compare booking rates

**Expected Result:** One voice will outperform by 10-20%

---

#### **Test 2: Speaking Speed**
```javascript
const speeds = [0.9, 1.0, 1.1]; // Slow, normal, fast
```

**Hypothesis:** Slightly faster = more confident/professional

**Method:**
- 10 calls per speed (30 calls total)
- Track: Engagement, interruptions, booking rate

---

#### **Test 3: Temperature (AI Creativity)**
```javascript
const temperatures = [0.5, 0.7, 0.9];
// 0.5 = More predictable, script-like
// 0.7 = Balanced (recommended)
// 0.9 = More creative, natural variations
```

**Method:**
- 10 calls per temperature (30 calls total)
- Track: Consistency, natural flow, booking rate

---

## 💬 PHASE 3: SCRIPT OPTIMIZATION (Week 2-3)

### **What to Test:**

#### **Test 4: Opening Lines**

**Current (Baseline):**
> "Hi [Name], this is [Your Business]. You recently inquired about [Service]. Do you have 2 minutes to chat?"

**Variation A (Direct):**
> "Hi [Name], calling about your [Service] inquiry. We can get you booked this week - when works best?"

**Variation B (Curiosity):**
> "Hi [Name], great news about your [Service] request. Got a quick question - still interested?"

**Variation C (Urgency):**
> "Hi [Name], following up on your [Service] inquiry. We have a spot opening up Friday - want to grab it?"

**Method:**
- 10 calls per variation (40 calls total)
- Track: Immediate engagement, booking rate, hang-up rate

---

#### **Test 5: Objection Handling**

**Objection: "How much does it cost?"**

**Response A (Direct):**
> "Great question! It's £[X]. And here's what makes it worth it: [value prop]. Want to book a time?"

**Response B (Reframe):**
> "Most clients see 3-10x ROI in month one. The investment is £[X]. When would you like to start?"

**Response C (Trial Close):**
> "Let's get you booked first so you can see if it's right for you. No pressure. What's your schedule like this week?"

**Method:**
- Plant price objection in test calls
- Rotate responses
- Track: Conversion after objection

---

#### **Test 6: Call-to-Action Strength**

**Weak CTA:**
> "Would you maybe be interested in booking a time?"

**Medium CTA:**
> "Would you like to book a time this week?"

**Strong CTA:**
> "I can book you for Tuesday at 2pm or Thursday at 4pm - which works better?"

**Assumptive CTA:**
> "Perfect! Let me get you locked in. Are mornings or afternoons better for you?"

**Method:**
- 10 calls per CTA style
- Track: Booking rate, hesitation

---

## 🔄 PHASE 4: FOLLOW-UP SEQUENCES (Week 3-4)

### **Test 7: Voicemail Scripts**

**Variation A (Brief):**
> "Hi [Name], this is [Business] about your [Service] inquiry. Call me back at [Number]. Thanks!"

**Variation B (Urgency):**
> "Hi [Name], we have your [Service] request. We're booking appointments this week - call [Number] to secure your spot."

**Variation C (Value):**
> "Hi [Name], calling about [Service]. Most clients see [result]. Let's get you booked - [Number]."

**Method:**
- Leave each voicemail type 10 times
- Track: Callback rate within 24 hours

---

### **Test 8: Multi-Touch Cadence**

**Sequence A (Aggressive):**
```
Touch 1: Call (0 min)
Touch 2: SMS (30 min)
Touch 3: Call (4 hours)
Touch 4: Email (24 hours)
Touch 5: Call (48 hours)
```

**Sequence B (Balanced):**
```
Touch 1: Call (0 min)
Touch 2: Call (8 hours)
Touch 3: SMS (24 hours)
Touch 4: Call (48 hours)
Touch 5: Email (72 hours)
```

**Sequence C (Gentle):**
```
Touch 1: Call (0 min)
Touch 2: SMS (24 hours)
Touch 3: Call (48 hours)
Touch 4: Email (96 hours)
```

**Method:**
- 20 leads per sequence
- Track: Total conversion rate, unsubscribe rate

---

## 📱 PHASE 5: TIMING OPTIMIZATION (Week 4)

### **Test 9: Call Time Analysis**

**Hypothesis:** Certain times convert better

**Method:**
```
Test Group 1: Call 9am-11am (morning)
Test Group 2: Call 12pm-2pm (lunch)
Test Group 3: Call 3pm-5pm (afternoon)
Test Group 4: Call 6pm-8pm (evening)
```

**Track:**
- Answer rate
- Booking rate
- Call duration

**Expected:** Lunch (12-2pm) may have lower answer rate but higher booking rate (people have time)

---

### **Test 10: Response Speed**

**Hypothesis:** Calling within 30 seconds vs 5 minutes makes a difference

**Method:**
```
Group A: Call within 30 seconds of lead submission
Group B: Call within 5 minutes
Group C: Call within 1 hour
Group D: Call within 24 hours
```

**Track:** Booking rate per group

**Expected:** 30-second response outperforms by 40-60%

---

## 🎯 PHASE 6: INDUSTRY-SPECIFIC TESTING (Week 5)

### **Test 11: Custom Scripts per Industry**

**Industries to Test:**
1. **Medical/Dental**
   - Emphasis: Professionalism, credentials, health outcomes
   - Tone: Calm, reassuring, empathetic
   
2. **Beauty/Aesthetics**
   - Emphasis: Transformation, confidence, before/after
   - Tone: Friendly, excited, aspirational

3. **Coaching/Consulting**
   - Emphasis: Results, ROI, testimonials
   - Tone: Direct, confident, achievement-focused

4. **Home Services**
   - Emphasis: Fast, reliable, quality work
   - Tone: Practical, no-nonsense, trustworthy

**Method:**
- Create 4 industry-specific scripts
- Test 10 calls each
- Track: Engagement, booking rate, objections

---

## 📊 TRACKING & ANALYTICS SETUP

### **Tool Integration:**

#### **Option A: Langfuse (Recommended)**
```bash
npm install langfuse
```

**Benefits:**
- ✅ Side-by-side prompt comparison
- ✅ Automatic metrics aggregation
- ✅ Visual dashboards
- ✅ Free for your volume

#### **Option B: Simple Spreadsheet**
```
| Test | Date | Script | Voice | Temp | Outcome | Duration | Sentiment | Notes |
|------|------|--------|-------|------|---------|----------|-----------|-------|
| 1    | ...  | V1     | Jen   | 0.7  | Booked  | 3:45     | Positive  | ...   |
```

**Benefits:**
- ✅ No setup required
- ✅ Easy to share with clients
- ❌ Manual data entry

#### **Option C: Your Existing Dashboard** (Leverage What You Built)
Add a "Test Mode" flag to calls:
```javascript
await query(`
  INSERT INTO calls (client_key, lead_phone, status, test_mode, test_variant)
  VALUES ($1, $2, $3, true, $4)
`, [clientKey, leadPhone, outcome, 'script-v2-aggressive']);
```

Filter dashboard: "Show only test calls" or "Compare test variants"

---

## 🎯 SUCCESS METRICS

### **After 5 Weeks of Testing, You Should Have:**

1. ✅ **Optimal Voice**: Which voice/speed converts best
2. ✅ **Winning Script**: Opening, objection handling, CTA that maximizes bookings
3. ✅ **Best Timing**: When to call for highest answer/booking rate
4. ✅ **Ideal Cadence**: How many follow-ups and when
5. ✅ **Industry Templates**: 4 proven scripts for different niches

### **Target Improvements:**

| Metric | Before Testing | After Testing | Improvement |
|--------|---------------|---------------|-------------|
| Booking Rate | 30% | 40-45% | +33-50% |
| Positive Sentiment | 60% | 75% | +25% |
| Answer Rate | 50% | 60% | +20% |
| Call Duration | 4 min | 3 min | -25% (more efficient) |

---

## 💰 TESTING BUDGET

### **Cost Breakdown:**

```
Test Calls (200 calls × £0.15) = £30
Langfuse = Free (50k events)
Your Time (20 hours) = Priceless (but worth it)

Total: £30 + your time

ROI: 
- Before: 30% booking rate on 100 leads = 30 appointments
- After: 42% booking rate on 100 leads = 42 appointments
- Extra appointments: +12 per 100 leads
- At £150 average value: +£1,800 per 100 leads
- Testing paid for itself 60x over
```

---

## 🚀 QUICK START (THIS WEEK)

### **Day 1-2: Setup**
- [ ] Install Langfuse OR set up tracking spreadsheet
- [ ] Create 3-5 test phone numbers (Google Voice, friends)
- [ ] Document current Vapi assistant settings (baseline)

### **Day 3-4: Baseline**
- [ ] Make 20 test calls with current setup
- [ ] Calculate baseline metrics
- [ ] Identify top 3 issues (e.g., "people hang up at price objection")

### **Day 5-7: First Test**
- [ ] Choose ONE variable to test (recommend: opening line)
- [ ] Create 3 variations
- [ ] Make 30 test calls (10 per variation)
- [ ] Analyze results
- [ ] Pick winning variation

### **Week 2+: Iterate**
- [ ] Test next variable (voice, objection handling, etc.)
- [ ] Each week = 1 new test
- [ ] Document everything
- [ ] Build "playbook" of winning tactics

---

## 📋 TEST CALL SCRIPT TEMPLATE

```markdown
## TEST CALL LOG

**Test ID:** TC-001
**Date:** 2025-10-10
**Time:** 14:30

### Setup
- Vapi Assistant ID: ast_abc123
- Script Version: V2-Aggressive
- Voice: Jennifer
- Temperature: 0.7
- Speed: 1.0

### Lead Details
- Name: Test Lead #1
- Phone: +44 7XXX XXXXXX
- Industry: Medical
- Persona: Interested buyer

### Results
- Answered: Yes ✅
- Duration: 3:45
- Outcome: Booked ✅
- Sentiment: Positive
- Objections: Price (handled well)
- Drop-off Point: N/A

### Transcript Highlights
> Lead: "How much does this cost?"
> AI: "Most clients see 3-10x ROI in month one. Investment is £799. When would you like to start?"
> Lead: "Okay, let's do it."

### Notes
- Opening line worked well - lead engaged immediately
- Price objection handled smoothly
- Could improve: CTA could be more assumptive

### Recording
URL: https://vapi.ai/call/abc123
Quality Score: 8/10

### Next Action
✅ Use this opening line for next 10 tests
🔄 Test more assumptive CTA next
```

---

## 🎯 DECISION FRAMEWORK

After each test, ask:

1. **Did this improve booking rate?** (primary metric)
2. **Did sentiment stay positive?** (can't sacrifice this)
3. **Was it scalable?** (works for 1,000 calls, not just 10)
4. **Does it feel natural?** (not robotic or pushy)

**If YES to all 4** → Keep it ✅  
**If NO to any** → Discard ❌

---

## 🔄 CONTINUOUS IMPROVEMENT

### **Monthly Reviews:**
- First Monday of each month: Review all test data
- Identify: What's working, what's not
- Update: Vapi assistants with winning tactics
- Document: Add to client playbook

### **Quarterly Deep Dives:**
- Compare client results (which industries perform best)
- Test new AI models (GPT-5 when it launches)
- Explore new channels (WhatsApp, iMessage)

---

## 📞 NEED HELP?

### **Stuck on Testing?**
1. Start with just ONE test (opening line)
2. Make 10 calls
3. Pick the winner
4. Move to next test

### **Not Seeing Improvements?**
- Check: Are you testing the right variable?
- Check: Is sample size large enough? (10+ calls per variant)
- Check: Are test leads representative of real leads?

---

## ✅ NEXT STEP

**Want me to:**
1. **Integrate Langfuse** → Automatic tracking, dashboards, comparison (15 min)
2. **Create test tracking sheet** → Simple spreadsheet template (5 min)
3. **Build "Test Mode" into dashboard** → Flag calls as tests, compare variants (20 min)
4. **Write sample scripts** → 3 opening lines + objection handlers for you to test (10 min)

**Which would help you most?**

