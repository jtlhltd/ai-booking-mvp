# Manual Testing Checklist
# Step-by-step manual testing guide

Write-Host "📋 Manual Testing Checklist" -ForegroundColor Cyan
Write-Host "===========================" -ForegroundColor Cyan

Write-Host "`nThis script provides a step-by-step manual testing guide." -ForegroundColor Yellow
Write-Host "Follow each section to thoroughly test your AI booking system." -ForegroundColor Yellow

# ============================================================================
# SECTION 1: BASIC SYSTEM ACCESS
# ============================================================================
Write-Host "`n🌐 SECTION 1: Basic System Access" -ForegroundColor Magenta
Write-Host "================================" -ForegroundColor Magenta

Write-Host "`n1.1 Open your browser and navigate to:" -ForegroundColor Yellow
Write-Host "   https://ai-booking-mvp.onrender.com" -ForegroundColor White
Write-Host "   ✅ Expected: Main dashboard loads without errors" -ForegroundColor Green

Write-Host "`n1.2 Test all main navigation links:" -ForegroundColor Yellow
Write-Host "   - Main Dashboard" -ForegroundColor White
Write-Host "   - Tenant Dashboard" -ForegroundColor White
Write-Host "   - Client Dashboard" -ForegroundColor White
Write-Host "   - Onboarding Dashboard" -ForegroundColor White
Write-Host "   - Onboarding Wizard" -ForegroundColor White
Write-Host "   ✅ Expected: All pages load without 404 errors" -ForegroundColor Green

Write-Host "`n1.3 Check responsive design:" -ForegroundColor Yellow
Write-Host "   - Resize browser window" -ForegroundColor White
Write-Host "   - Test on mobile device (if available)" -ForegroundColor White
Write-Host "   ✅ Expected: Layout adapts properly" -ForegroundColor Green

# ============================================================================
# SECTION 2: ADMIN FUNCTIONALITY
# ============================================================================
Write-Host "`n🔧 SECTION 2: Admin Functionality" -ForegroundColor Magenta
Write-Host "================================" -ForegroundColor Magenta

Write-Host "`n2.1 Test System Health:" -ForegroundColor Yellow
Write-Host "   Navigate to: https://ai-booking-mvp.onrender.com/admin/system-health" -ForegroundColor White
Write-Host "   ✅ Expected: Shows system status, uptime, and health metrics" -ForegroundColor Green

Write-Host "`n2.2 Test Metrics Dashboard:" -ForegroundColor Yellow
Write-Host "   Navigate to: https://ai-booking-mvp.onrender.com/admin/metrics" -ForegroundColor White
Write-Host "   ✅ Expected: Shows leads, calls, conversion rates, and tenant breakdown" -ForegroundColor Green

Write-Host "`n2.3 Test Tenant Management:" -ForegroundColor Yellow
Write-Host "   Navigate to: https://ai-booking-mvp.onrender.com/admin/tenants" -ForegroundColor White
Write-Host "   ✅ Expected: Lists all tenants with their configurations" -ForegroundColor Green

Write-Host "`n2.4 Test Lead Scoring:" -ForegroundColor Yellow
Write-Host "   Navigate to: https://ai-booking-mvp.onrender.com/admin/lead-score" -ForegroundColor White
Write-Host "   ✅ Expected: Shows lead scoring details and priority levels" -ForegroundColor Green

# ============================================================================
# SECTION 3: SMS FUNCTIONALITY
# ============================================================================
Write-Host "`n📱 SECTION 3: SMS Functionality" -ForegroundColor Magenta
Write-Host "==============================" -ForegroundColor Magenta

Write-Host "`n3.1 Test SMS Opt-in Flow:" -ForegroundColor Yellow
Write-Host "   Send SMS 'START' to +447403934440 from your phone (+447491683261)" -ForegroundColor White
Write-Host "   ✅ Expected: System responds with welcome message" -ForegroundColor Green

Write-Host "`n3.2 Test Booking Request:" -ForegroundColor Yellow
Write-Host "   Send SMS 'YES' to +447403934440 from your phone" -ForegroundColor White
Write-Host "   ✅ Expected: System may trigger VAPI call (check logs)" -ForegroundColor Green

Write-Host "`n3.3 Test General Inquiry:" -ForegroundColor Yellow
Write-Host "   Send SMS 'What are your opening hours?' to +447403934440" -ForegroundColor White
Write-Host "   ✅ Expected: System responds appropriately" -ForegroundColor Green

Write-Host "`n3.4 Test Opt-out:" -ForegroundColor Yellow
Write-Host "   Send SMS 'STOP' to +447403934440 from your phone" -ForegroundColor White
Write-Host "   ✅ Expected: System acknowledges opt-out" -ForegroundColor Green

# ============================================================================
# SECTION 4: CLIENT ONBOARDING
# ============================================================================
Write-Host "`n👥 SECTION 4: Client Onboarding" -ForegroundColor Magenta
Write-Host "================================" -ForegroundColor Magenta

Write-Host "`n4.1 Test Onboarding Wizard:" -ForegroundColor Yellow
Write-Host "   Navigate to: https://ai-booking-mvp.onrender.com/onboarding-wizard" -ForegroundColor White
Write-Host "   ✅ Expected: Multi-step wizard loads properly" -ForegroundColor Green

Write-Host "`n4.2 Complete Full Onboarding:" -ForegroundColor Yellow
Write-Host "   Step 1: Fill in basic information" -ForegroundColor White
Write-Host "   Step 2: Configure branding (colors, timezone)" -ForegroundColor White
Write-Host "   Step 3: Set business operations (hours, policies)" -ForegroundColor White
Write-Host "   Step 4: Configure communication settings" -ForegroundColor White
Write-Host "   Step 5: Define services" -ForegroundColor White
Write-Host "   ✅ Expected: All steps complete without errors" -ForegroundColor Green

Write-Host "`n4.3 Submit Client Creation:" -ForegroundColor Yellow
Write-Host "   Click 'Create Client' button" -ForegroundColor White
Write-Host "   ✅ Expected: Success message and client created" -ForegroundColor Green

Write-Host "`n4.4 Verify Client Creation:" -ForegroundColor Yellow
Write-Host "   Check: https://ai-booking-mvp.onrender.com/admin/tenants" -ForegroundColor White
Write-Host "   ✅ Expected: New client appears in tenant list" -ForegroundColor Green

# ============================================================================
# SECTION 5: DASHBOARD FUNCTIONALITY
# ============================================================================
Write-Host "`n📊 SECTION 5: Dashboard Functionality" -ForegroundColor Magenta
Write-Host "====================================" -ForegroundColor Magenta

Write-Host "`n5.1 Test Main Dashboard:" -ForegroundColor Yellow
Write-Host "   Navigate to: https://ai-booking-mvp.onrender.com/" -ForegroundColor White
Write-Host "   ✅ Expected: Shows real-time metrics and charts" -ForegroundColor Green

Write-Host "`n5.2 Test Tenant Dashboard:" -ForegroundColor Yellow
Write-Host "   Navigate to: https://ai-booking-mvp.onrender.com/tenant-dashboard" -ForegroundColor White
Write-Host "   ✅ Expected: Shows tenant-specific metrics" -ForegroundColor Green

Write-Host "`n5.3 Test Client Dashboard:" -ForegroundColor Yellow
Write-Host "   Navigate to: https://ai-booking-mvp.onrender.com/client-dashboard" -ForegroundColor White
Write-Host "   ✅ Expected: Shows client-specific dashboard" -ForegroundColor Green

Write-Host "`n5.4 Test Real-time Updates:" -ForegroundColor Yellow
Write-Host "   - Send an SMS while dashboard is open" -ForegroundColor White
Write-Host "   - Refresh the page" -ForegroundColor White
Write-Host "   ✅ Expected: Metrics update to reflect new activity" -ForegroundColor Green

# ============================================================================
# SECTION 6: ERROR HANDLING
# ============================================================================
Write-Host "`n⚠️ SECTION 6: Error Handling" -ForegroundColor Magenta
Write-Host "===========================" -ForegroundColor Magenta

Write-Host "`n6.1 Test Invalid URLs:" -ForegroundColor Yellow
Write-Host "   Try: https://ai-booking-mvp.onrender.com/invalid-page" -ForegroundColor White
Write-Host "   ✅ Expected: 404 error page or redirect" -ForegroundColor Green

Write-Host "`n6.2 Test Invalid API Calls:" -ForegroundColor Yellow
Write-Host "   Try: https://ai-booking-mvp.onrender.com/admin/metrics (without API key)" -ForegroundColor White
Write-Host "   ✅ Expected: 401 Unauthorized error" -ForegroundColor Green

Write-Host "`n6.3 Test Invalid SMS Data:" -ForegroundColor Yellow
Write-Host "   Send empty SMS or invalid format" -ForegroundColor White
Write-Host "   ✅ Expected: System handles gracefully without crashing" -ForegroundColor Green

# ============================================================================
# SECTION 7: BUSINESS HOURS TESTING
# ============================================================================
Write-Host "`n🕒 SECTION 7: Business Hours Testing" -ForegroundColor Magenta
Write-Host "===================================" -ForegroundColor Magenta

Write-Host "`n7.1 Test During Business Hours:" -ForegroundColor Yellow
Write-Host "   Send SMS 'YES' during 9 AM - 5 PM" -ForegroundColor White
Write-Host "   ✅ Expected: VAPI call may be triggered immediately" -ForegroundColor Green

Write-Host "`n7.2 Test Outside Business Hours:" -ForegroundColor Yellow
Write-Host "   Send SMS 'YES' outside business hours" -ForegroundColor White
Write-Host "   ✅ Expected: VAPI call deferred until next business hour" -ForegroundColor Green

# ============================================================================
# SECTION 8: INTEGRATION TESTING
# ============================================================================
Write-Host "`n🔗 SECTION 8: Integration Testing" -ForegroundColor Magenta
Write-Host "================================" -ForegroundColor Magenta

Write-Host "`n8.1 Test VAPI Integration:" -ForegroundColor Yellow
Write-Host "   - Send SMS 'YES' to trigger call" -ForegroundColor White
Write-Host "   - Check VAPI dashboard for call activity" -ForegroundColor White
Write-Host "   ✅ Expected: Call appears in VAPI dashboard" -ForegroundColor Green

Write-Host "`n8.2 Test Google Calendar Integration:" -ForegroundColor Yellow
Write-Host "   - Complete a booking through VAPI call" -ForegroundColor White
Write-Host "   - Check Google Calendar for new event" -ForegroundColor White
Write-Host "   ✅ Expected: Event created in calendar" -ForegroundColor Green

Write-Host "`n8.3 Test Database Integration:" -ForegroundColor Yellow
Write-Host "   - Create a new client" -ForegroundColor White
Write-Host "   - Check database for new records" -ForegroundColor White
Write-Host "   ✅ Expected: Client data saved to database" -ForegroundColor Green

# ============================================================================
# SECTION 9: PERFORMANCE TESTING
# ============================================================================
Write-Host "`n⚡ SECTION 9: Performance Testing" -ForegroundColor Magenta
Write-Host "=================================" -ForegroundColor Magenta

Write-Host "`n9.1 Test Page Load Times:" -ForegroundColor Yellow
Write-Host "   - Open browser developer tools" -ForegroundColor White
Write-Host "   - Navigate to each page" -ForegroundColor White
Write-Host "   - Check Network tab for load times" -ForegroundColor White
Write-Host "   ✅ Expected: Pages load within 3 seconds" -ForegroundColor Green

Write-Host "`n9.2 Test Concurrent Users:" -ForegroundColor Yellow
Write-Host "   - Open multiple browser tabs" -ForegroundColor White
Write-Host "   - Navigate to different pages simultaneously" -ForegroundColor White
Write-Host "   ✅ Expected: All pages load without errors" -ForegroundColor Green

# ============================================================================
# SECTION 10: SECURITY TESTING
# ============================================================================
Write-Host "`n🔒 SECTION 10: Security Testing" -ForegroundColor Magenta
Write-Host "===============================" -ForegroundColor Magenta

Write-Host "`n10.1 Test API Key Security:" -ForegroundColor Yellow
Write-Host "   - Try accessing admin endpoints without API key" -ForegroundColor White
Write-Host "   ✅ Expected: 401 Unauthorized error" -ForegroundColor Green

Write-Host "`n10.2 Test Input Validation:" -ForegroundColor Yellow
Write-Host "   - Try submitting invalid data in forms" -ForegroundColor White
Write-Host "   ✅ Expected: System validates and rejects invalid input" -ForegroundColor Green

Write-Host "`n10.3 Test Rate Limiting:" -ForegroundColor Yellow
Write-Host "   - Send multiple SMS messages rapidly" -ForegroundColor White
Write-Host "   ✅ Expected: System handles rate limiting appropriately" -ForegroundColor Green

# ============================================================================
# TESTING CHECKLIST SUMMARY
# ============================================================================
Write-Host "`n📋 TESTING CHECKLIST SUMMARY" -ForegroundColor Cyan
Write-Host "===========================" -ForegroundColor Cyan

Write-Host "`n✅ Completed Tests:" -ForegroundColor Green
Write-Host "□ Basic System Access" -ForegroundColor White
Write-Host "□ Admin Functionality" -ForegroundColor White
Write-Host "□ SMS Functionality" -ForegroundColor White
Write-Host "□ Client Onboarding" -ForegroundColor White
Write-Host "□ Dashboard Functionality" -ForegroundColor White
Write-Host "□ Error Handling" -ForegroundColor White
Write-Host "□ Business Hours Testing" -ForegroundColor White
Write-Host "□ Integration Testing" -ForegroundColor White
Write-Host "□ Performance Testing" -ForegroundColor White
Write-Host "□ Security Testing" -ForegroundColor White

Write-Host "`n🎯 Testing Notes:" -ForegroundColor Cyan
Write-Host "- Check Render logs for any errors during testing" -ForegroundColor White
Write-Host "- Monitor VAPI dashboard for call activity" -ForegroundColor White
Write-Host "- Verify database changes after client creation" -ForegroundColor White
Write-Host "- Test on different devices and browsers" -ForegroundColor White

Write-Host "`n📞 Support Contacts:" -ForegroundColor Cyan
Write-Host "- Render Dashboard: https://dashboard.render.com" -ForegroundColor White
Write-Host "- VAPI Dashboard: https://dashboard.vapi.ai" -ForegroundColor White
Write-Host "- Twilio Console: https://console.twilio.com" -ForegroundColor White

Write-Host "`n🎉 Manual Testing Complete!" -ForegroundColor Green
Write-Host "Document any issues found and their steps to reproduce." -ForegroundColor Yellow
