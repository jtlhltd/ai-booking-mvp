# Demo Mode Testing Checklist

Use this checklist to test all features before recording your Loom demo.

## ✅ Core Functionality

### Lead Management
- [ ] **CSV Import**
  - [ ] Drag & drop CSV file works
  - [ ] Browse button opens file picker
  - [ ] Success message shows "X leads staged (demo)"
  - [ ] Imported leads appear in "Recent Leads" section
  - [ ] Imported leads show correct phone numbers
  - [ ] Imported leads persist after page refresh (in demo mode)

- [ ] **View Lead Details**
  - [ ] Click on a lead opens modal
  - [ ] Modal shows correct lead information (name, phone, service, source, status)
  - [ ] Modal can be closed with X button
  - [ ] Modal can be closed with Escape key
  - [ ] Modal closes when clicking backdrop

- [ ] **Lead Actions**
  - [ ] "Snooze 1 day" button works (shows toast notification)
  - [ ] "Escalate" button works (shows toast notification)
  - [ ] Toast notifications appear and auto-dismiss

- [ ] **View Timeline**
  - [ ] "View Timeline" button opens timeline modal
  - [ ] Timeline shows chronological events
  - [ ] Timeline modal can be closed

### Call Management
- [ ] **View Transcripts**
  - [ ] "View Transcript" button on call items works
  - [ ] Transcript modal opens with call content
  - [ ] Transcript displays properly formatted text
  - [ ] Transcript modal can be closed

- [ ] **Call Recordings**
  - [ ] Play buttons are visible on call recordings
  - [ ] Play buttons show appropriate state (if implemented)

### Data Export
- [ ] **Export Leads**
  - [ ] "Export" button in Recent Leads section works
  - [ ] CSV file downloads with correct data
  - [ ] File name is appropriate (e.g., "leads-export.csv")

- [ ] **Export Calls**
  - [ ] "Export" button in Recent Calls section works
  - [ ] CSV file downloads with call data

- [ ] **Export Appointments**
  - [ ] "Export" button in Upcoming Appointments works
  - [ ] CSV file downloads with appointment data

## 🎨 UI/UX Features

### Theme Toggle
- [ ] **Dark Mode**
  - [ ] "Dark mode" button toggles theme
  - [ ] Dark mode applies correctly to all elements
  - [ ] Theme persists after page refresh
  - [ ] All text is readable in dark mode
  - [ ] Cards and borders are visible in dark mode

### Keyboard Shortcuts
- [ ] **Shortcuts Work**
  - [ ] Press `?` shows keyboard shortcuts modal
  - [ ] Press `Esc` closes any open modal
  - [ ] Press `u` focuses/opens upload leads (if implemented)
  - [ ] Press `t` toggles theme (if implemented)
  - [ ] Keyboard hint appears on first keypress

### Data Freshness Indicator
- [ ] **Last Updated**
  - [ ] "Updated Xs ago" indicator is visible
  - [ ] Time updates correctly
  - [ ] Green dot shows online status
  - [ ] Changes to offline when connection lost

### Loading States
- [ ] **Skeleton Loaders**
  - [ ] Skeleton loaders appear during data fetch
  - [ ] Skeleton loaders disappear when data loads
  - [ ] No flickering or layout shifts

### Error Handling
- [ ] **Error Messages**
  - [ ] Error messages appear when API calls fail
  - [ ] Retry buttons work on error messages
  - [ ] Error messages are user-friendly

### Empty States
- [ ] **Empty State CTAs**
  - [ ] Empty states show helpful messages
  - [ ] Action buttons in empty states work (e.g., "Upload Leads")
  - [ ] Empty states are visually appealing

## 📱 Responsive Design

### Mobile Testing
- [ ] **Mobile View (< 768px)**
  - [ ] Dashboard is usable on mobile
  - [ ] Cards stack vertically
  - [ ] Text is readable
  - [ ] Buttons are tappable
  - [ ] Modals work on mobile
  - [ ] No horizontal scrolling

### Tablet Testing
- [ ] **Tablet View (768px - 1024px)**
  - [ ] Layout adapts appropriately
  - [ ] Grid columns adjust
  - [ ] Touch interactions work

## 🔄 Real-time Features

### Live Updates
- [ ] **SSE Connection**
  - [ ] "Live Activity Feed" shows activity
  - [ ] Activity updates in real-time (if SSE is working)
  - [ ] Connection status is indicated

### Auto-refresh
- [ ] **Background Refresh**
  - [ ] Data refreshes every 30 seconds
  - [ ] Imported leads persist after refresh
  - [ ] No flickering during refresh
  - [ ] "Updated Xs ago" updates correctly

## 📊 Data Display

### Metrics & Stats
- [ ] **Status Cards**
  - [ ] All 4 status cards show correct values
  - [ ] Hints/tooltips are visible
  - [ ] Numbers format correctly

- [ ] **ROI Panel**
  - [ ] Investment, Revenue, ROI display correctly
  - [ ] Currency formatting is correct
  - [ ] Multiplier calculation is accurate

- [ ] **Charts & Visualizations**
  - [ ] Conversion funnel displays
  - [ ] Weekly activity chart shows
  - [ ] Call quality metrics display
  - [ ] All charts are readable

### Integration Status
- [ ] **System Status**
  - [ ] Integration chips show status (green/amber/red)
  - [ ] Status indicators are accurate
  - [ ] Phone number displays correctly

## 🎯 Demo-Specific

### Demo Banner
- [ ] **Demo Environment Notice**
  - [ ] Yellow demo banner is visible
  - [ ] Message is clear about demo mode
  - [ ] Banner doesn't obstruct content

### Active Indicator
- [ ] **Concierge Activity**
  - [ ] Green banner shows "Your concierge is active"
  - [ ] Current activity is displayed
  - [ ] Banner is visually prominent

### Sample Data
- [ ] **Demo Data Quality**
  - [ ] All sections have sample data
  - [ ] Data looks realistic
  - [ ] No placeholder text visible
  - [ ] Numbers are consistent

## 🚀 Performance

### Load Times
- [ ] **Initial Load**
  - [ ] Dashboard loads within 2-3 seconds
  - [ ] No blank screen for extended time
  - [ ] Loading indicators appear quickly

### Interactions
- [ ] **Responsiveness**
  - [ ] Buttons respond immediately
  - [ ] Modals open smoothly
  - [ ] No lag when clicking elements
  - [ ] Animations are smooth

## ♿ Accessibility

### Keyboard Navigation
- [ ] **Tab Navigation**
  - [ ] All interactive elements are focusable
  - [ ] Focus indicators are visible
  - [ ] Tab order is logical
  - [ ] Enter/Space activate buttons

### Screen Reader
- [ ] **ARIA Labels**
  - [ ] Buttons have aria-labels
  - [ ] Modals have proper roles
  - [ ] Status updates are announced

## 🐛 Edge Cases

### Offline Mode
- [ ] **Offline Detection**
  - [ ] Offline indicator appears when connection lost
  - [ ] Toast notification shows connection status
  - [ ] Data freshness shows offline status

### Error Scenarios
- [ ] **Network Errors**
  - [ ] Handles 500 errors gracefully
  - [ ] Handles timeout errors
  - [ ] Shows retry options

### Empty Data
- [ ] **No Data States**
  - [ ] Empty states show when no leads
  - [ ] Empty states show when no calls
  - [ ] Empty states show when no appointments

## 📝 Final Checks

- [ ] **Visual Polish**
  - [ ] All fonts are consistent (Inter)
  - [ ] Colors are consistent
  - [ ] Spacing is uniform
  - [ ] No console errors
  - [ ] No broken images

- [ ] **Demo Flow**
  - [ ] Can complete a full demo walkthrough
  - [ ] All features work in sequence
  - [ ] Story flows naturally
  - [ ] No awkward pauses or errors

---

## Quick Test Script for Loom

1. **Opening** (10 seconds)
   - Show dashboard overview
   - Point out key metrics
   - Mention "done-for-you" service

2. **Lead Import** (30 seconds)
   - Upload CSV file
   - Show leads appearing
   - Explain how it works

3. **Lead Management** (20 seconds)
   - Click on a lead
   - Show timeline
   - Show actions (snooze/escalate)

4. **Call Activity** (20 seconds)
   - Show recent calls
   - View a transcript
   - Show call quality metrics

5. **ROI & Results** (20 seconds)
   - Show ROI panel
   - Show conversion funnel
   - Highlight success metrics

6. **Closing** (10 seconds)
   - Summarize value
   - Show system status
   - Call to action

**Total: ~2 minutes** - Perfect for a quick demo!


