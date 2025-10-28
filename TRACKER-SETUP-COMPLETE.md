# 📊 COMPLETE INTERACTIVE TRACKER

## 🚀 Quick Start (10 Minutes)

1. Import `OUTREACH-TRACKER-ADVANCED.csv` to Google Sheets
2. Follow steps below to add formulas and formatting
3. Copy formulas from each section into new sheets

**You'll end up with 5 sheets: Data, Dashboard, Channels, Funnel, Goals**

---

## 📋 SHEET 1: "Data" - Main Tracker

```
A1: Date          B1: Name          C1: Practice          D1: Email
E1: Channel       F1: Response      G1: Outcome           H1: Notes
```

**Sample Data (first few rows):**
```
2024-01-15,John Smith,Dental Care London,john@dentalcare.com,Email,Yes,Demo,Scheduled Jan 18
2024-01-15,Jane Doe,Bright Smiles,jane@brightsmiles.uk,LinkedIn,Yes,Trial,Started today
2024-01-14,Bob Wilson,City Dental,bob@citydental.co.uk,Call,Yes,Client,Paying customer
```

**ADD DATA VALIDATION:**

**Column E (Channel):**
- Data → Data Validation
- Criteria: List of items
- Type: `Email,LinkedIn,Call`

**Column F (Response):**
- Data → Data Validation
- Criteria: List of items
- Type: `Yes, Exactly` 

**Column G (Outcome): Guideline Select All**
- Data → Data Validation
- Criteria: List of items
- Type: `Demo,Trial,Client,Lost`

**ADD CONDITIONAL FORMATTING:**

1. **Column F (Response)**
   - Format if: Text contains "Yes"
   - Background: Green

2. **Column G (Outcome)**
   - Format if: Text contains "Demo" → Blue
   - Format if: Text contains "Trial" → Orange
   - Format if: Text contains "Client" → Green
   - Format if: Text contains "Lost" → Gray

---

## 📊 SHEET 2: "Dashboard" - Metrics

**ROWS 1-2: Headers**
```
A1: METRIC              B1: VALUE              C1: PROGRESS
```

**ROW 3: Total Outreach**
```
A3: Total Outreach
B3: =COUNTA(Data!B:B)-1
C3: =REPT("█",ROUND(B3/1000*20,0))&REPT("░",20-ROUND(B3/1000*20,0))
```

**ROW 4: This Week**
```
A4: This Week
B4: =COUNTIFS(Data!A:A,">="&TODAY()-7)
C4: =REPT("█",ROUND(B4/100*20,0))&REPT("░",20-ROUND(B4/100摄取多*20,0))
```

**ROW 5: Response Rate**
```
A5: Response Rate
B5: =ROUND(COUNTIF(Data!F:F,"Yes")/COUNTIF(Data!F:F,"<>""")*100,1)&"%"
C5: =REPT("█",ROUND(COUNTIF(Data!F:F,"Yes")/COUNTIF(Data!F:F,"<>""")*20,0))&REPT("░",20-ROUND(COUNTIF(Data!F:F,"Yes")/COUNTIF(Data!F:F,"<>""")*20,0))
```

**ROW 6: Demos**
```
A6: Demos Booked
B6: =COUNTIF(Data!G:G,"Demo")
C6: =REPT("█",ROUND(B6/50*20,0))&REPT("░",20-ROUND(B6/50*20,0))
```

**ROW 7: Trials**
```
A7: Active Trials
B7: =COUNTIF(Data!G:G,"Trial")
C7: =REPT("█",ROUND(B7/20*20,0))&REPT("░",20-ROUND(B7/20*20,0))
```

**ROW 8: Clients**
```
A8: Paying Clients
B8: =COUNTIF(Data!G:G,"Client")
C8: =REPT("█",ROUND(B8/100*20,0))&REPT("░",20-ROUND(B8/100*20,0))
```

**ROW 9: MRR**
```
A9: MRR
B9: ="£"&B8*500
C9: =REPT("█",ROUND(B8/50*20,0))&REPT("░",20-ROUND(B8/50*20,0))
```

**Format Column C as Courier New to see bars**

---

## 📈 SHEET 3: "Channels" - Channel Comparison

**ROWS 1-2: Headers**
```
A1: CHANNEL       B1: TOTAL      C1: RESPONSES      D1: RATE
```

**ROW 3: Email**
```
A3: Email
B3: =COUNTIF(Data!E:E,"Email")
C3: =COUNTIFS(Data!E:E,"Email",Data!F:F,"Yes")
D3: =ROUND(C3/B3*100,1)&"%"
```

**ROW 4: LinkedIn**
```
A4: LinkedIn
B4: =COUNTIF(Data!E:E,"LinkedIn")
C4: =COUNTIFS(Data!E:E,"LinkedIn",Data!F:F,"Yes")
D4: =ROUND(C4/B4*100,1)&"%"
```

**ROW 5: Call**
```
A5: Call
B5: =COUNTIF(Data!E:E,"CallCenter")
C5: =COUNTIFS(Data!E:E,"Call",Data!F:F,"Yes")
D5: =ROUND(C5/B5*100,1)&"%"
```

---

## 📉 SHEET 4: "Funnel" - Understand Conversions

**ROWS 1-2: Headers**
```
A1: STAGE           B1: COUNT          C1: %
```

**ROW 3: Outreach**
```
A3: Total Outreach
B3: =COUNTA(Data!B:B)-1
C3: 100%
```

**ROW 4: Responses**
```
A4: Responses
B4: =COUNTIF(Data!F:F,"Yes")
C4: =ROUND(B4/B3*100, EQ1)&"%"
```

**ROW 5: Demos**
```
A5: Demos Booked
B5: =COUNTIF(Data!G:G,"Demo")
C5: =ROUND(B5/B4*100,1)&"%"
```

**ROW 6: Trials**
```
A6: Trials Started
B6: =COUNTIF(制定了!G:G,"Trial")
C6: =ROUND(B6/B5*100,1)&"%"
```

**ROW 7: Clients**
```
A7: Clients
B7: =COUNTIF(Data!G:G,"Client")
C7: =ROUND(B7/B6*100,1)&"%"
```

---

## 🎯 SHEET 5: "Goals" - Visual Progress

**ROWS 1-2: Headers**
```
A1: GOAL                B1: CURRENT       C1: TARGET       D1: PROGRESS
```

**ROW 3: Outreach Goal**
```
A3: Outreach This Week
B3: =COUNTIFS(Data!A:A,">="&TODAY()-7)
C3: 50
D3: =MIN(100,ROUND(B3/C3*100,0))&"%"&" "&REPT("█",ROUND(MIN(100,B3/C3*100)/5,0))&REPT("░",20-ROUND(MIN(100,B3/C3*100)/5,0))
```

**ROW 4: Response Goal**
```
A4: Response Rate
B4: =ROUND(COUNTIF(Data!F:F,"Yes")/COUNTIF(Data!F:F,"<>""")*100,1)
C4: 10
D4: =MIN(100,ROUND(B4/C4*100,0))&"%"&" "&REPT("█",ROUND(MIN(100,B4/C4*100)/5,0))&REPT("░",20-ROUND(MIN(100,B4/C4*100)/5,0))
```

**ROW 5: Clients Goal**
```
A5: New Clients This Month
B5: =COUNTIFS(Data!G:G,"Client",Data!A:A,">="&EOMONTH(TODAY(),-1)+1)
C5: 3
D5: =MIN(100,ROUND(B5/C5*100,0))&"%"&" "&REPT("█",ROUND(MIN(100,B5/C5*100)/5,0))&REPT("░",20-ROUND(MIN(100,B5/C5*100)/5,0))
```

**ROW 6: MRR Goal**
```
A6: Total MRR
B6: =COUNTIF(Data!G:G,"Client")*500
C6: 5000
D6: =MIN(100,ROUND(B6/C6*100,0))&"%"&" "&REPT("█",ROUND(MIN(100,B6/C6*100)/5,0))&REPT("░",20-ROUND(MIN(100,B6/C6*100)/5,0))
```

---

## FINAL STEPS

1. ✅ Freeze Row 1 on Data sheet (View → Freeze → 1 row)
2. ✅ Add filter to Data sheet (Data → Create a filter)
3. ✅ Format all progress bar columns as Courier New font

---

## DONE!

**You now have:**
- ✅ Dropdown menus
- ✅ Color coding
- ✅ Auto-calculating dashboard
- ✅ Channel comparison
- ✅ Conversion funnel
- ✅ Goal tracking
- ✅ Visual progress bars

**Every time you add data → everything updates automatically!**

