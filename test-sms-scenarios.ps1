# SMS Scenario Testing Script
# Tests various SMS interactions and flows

Write-Host "📱 SMS Scenario Testing" -ForegroundColor Cyan
Write-Host "======================" -ForegroundColor Cyan

$baseUrl = "https://ai-booking-mvp.onrender.com"
$testNumber = "+447491683261"
$systemNumber = "+447403934440"

function Send-SMS {
    param(
        [string]$Body,
        [string]$Scenario,
        [string]$From = $testNumber,
        [string]$To = $systemNumber
    )
    
    Write-Host "`n📤 Sending: $Scenario" -ForegroundColor Yellow
    Write-Host "Body: '$Body'" -ForegroundColor Gray
    Write-Host "From: $From" -ForegroundColor Gray
    Write-Host "To: $To" -ForegroundColor Gray
    
    $smsData = @{
        Body = $Body
        From = $From
        To = $To
        MessageSid = "test_$(Get-Random)_$(Get-Date -Format 'HHmmss')"
        MessagingServiceSid = "MG1234567890abcdef1234567890abcdef"
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/webhook/sms/inbound" -Method POST -Body $smsData -ContentType "application/json" -TimeoutSec 30
        Write-Host "✅ Response: $response" -ForegroundColor Green
        return $response
    }
    catch {
        Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# ============================================================================
# SCENARIO 1: NEW CUSTOMER OPT-IN FLOW
# ============================================================================
Write-Host "`n🔄 SCENARIO 1: New Customer Opt-in Flow" -ForegroundColor Magenta
Write-Host "=========================================" -ForegroundColor Magenta

Write-Host "`nStep 1: Customer sends START"
Send-SMS -Body "START" -Scenario "New customer opt-in"
Start-Sleep -Seconds 3

Write-Host "`nStep 2: Customer confirms interest"
Send-SMS -Body "YES" -Scenario "Customer confirms interest"
Start-Sleep -Seconds 3

Write-Host "`nStep 3: Customer asks about booking"
Send-SMS -Body "I'd like to book an appointment" -Scenario "Booking inquiry"
Start-Sleep -Seconds 3

# ============================================================================
# SCENARIO 2: EXISTING CUSTOMER BOOKING
# ============================================================================
Write-Host "`n🔄 SCENARIO 2: Existing Customer Booking" -ForegroundColor Magenta
Write-Host "=========================================" -ForegroundColor Magenta

Write-Host "`nStep 1: Direct booking request"
Send-SMS -Body "Book me for tomorrow at 2pm" -Scenario "Direct booking request"
Start-Sleep -Seconds 3

Write-Host "`nStep 2: Follow-up question"
Send-SMS -Body "What services do you offer?" -Scenario "Service inquiry"
Start-Sleep -Seconds 3

# ============================================================================
# SCENARIO 3: CUSTOMER SUPPORT INTERACTIONS
# ============================================================================
Write-Host "`n🔄 SCENARIO 3: Customer Support Interactions" -ForegroundColor Magenta
Write-Host "===========================================" -ForegroundColor Magenta

Write-Host "`nStep 1: General question"
Send-SMS -Body "What are your opening hours?" -Scenario "Hours inquiry"
Start-Sleep -Seconds 3

Write-Host "`nStep 2: Location question"
Send-SMS -Body "Where are you located?" -Scenario "Location inquiry"
Start-Sleep -Seconds 3

Write-Host "`nStep 3: Pricing question"
Send-SMS -Body "How much does a consultation cost?" -Scenario "Pricing inquiry"
Start-Sleep -Seconds 3

# ============================================================================
# SCENARIO 4: OPT-OUT FLOW
# ============================================================================
Write-Host "`n🔄 SCENARIO 4: Opt-out Flow" -ForegroundColor Magenta
Write-Host "=========================" -ForegroundColor Magenta

Write-Host "`nStep 1: Customer wants to stop"
Send-SMS -Body "STOP" -Scenario "Opt-out request"
Start-Sleep -Seconds 3

Write-Host "`nStep 2: Try to send after opt-out"
Send-SMS -Body "I changed my mind, I want to book" -Scenario "Post opt-out message"
Start-Sleep -Seconds 3

# ============================================================================
# SCENARIO 5: EDGE CASES
# ============================================================================
Write-Host "`n🔄 SCENARIO 5: Edge Cases" -ForegroundColor Magenta
Write-Host "========================" -ForegroundColor Magenta

Write-Host "`nStep 1: Empty message"
Send-SMS -Body "" -Scenario "Empty message"
Start-Sleep -Seconds 2

Write-Host "`nStep 2: Very long message"
$longMessage = "This is a very long message that tests how the system handles messages that are much longer than typical SMS messages and might contain multiple sentences or even paragraphs of text that could potentially cause issues with processing or storage in the system."
Send-SMS -Body $longMessage -Scenario "Very long message"
Start-Sleep -Seconds 2

Write-Host "`nStep 3: Special characters"
Send-SMS -Body "Hello! I'd like to book an appointment. Can you help me? 😊" -Scenario "Special characters"
Start-Sleep -Seconds 2

Write-Host "`nStep 4: Numbers and symbols"
Send-SMS -Body "Book me for 2/15/2024 at 3:30 PM. My phone is 555-123-4567." -Scenario "Numbers and symbols"
Start-Sleep -Seconds 2

# ============================================================================
# SCENARIO 6: MULTIPLE CUSTOMERS
# ============================================================================
Write-Host "`n🔄 SCENARIO 6: Multiple Customers" -ForegroundColor Magenta
Write-Host "===============================" -ForegroundColor Magenta

$testNumbers = @(
    "+447491683261",
    "+447491683262",
    "+447491683263"
)

foreach ($number in $testNumbers) {
    Write-Host "`nTesting with number: $number"
    Send-SMS -Body "START" -Scenario "Multi-customer test" -From $number
    Start-Sleep -Seconds 2
}

# ============================================================================
# SCENARIO 7: BUSINESS HOURS TESTING
# ============================================================================
Write-Host "`n🔄 SCENARIO 7: Business Hours Testing" -ForegroundColor Magenta
Write-Host "====================================" -ForegroundColor Magenta

Write-Host "`nStep 1: Test during business hours"
Send-SMS -Body "I need help right now" -Scenario "Business hours request"
Start-Sleep -Seconds 3

Write-Host "`nStep 2: Check if VAPI calls are made"
Write-Host "Check your logs to see if VAPI calls were triggered" -ForegroundColor Yellow

# ============================================================================
# FINAL CHECK
# ============================================================================
Write-Host "`n📊 Final System Check" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Cyan

try {
    Write-Host "`nChecking metrics..."
    $metrics = Invoke-RestMethod -Uri "$baseUrl/admin/metrics" -Headers @{"X-API-Key" = "ad34b1de00c5b7380d6a447abcd78874"} -TimeoutSec 30
    Write-Host "✅ Metrics retrieved successfully" -ForegroundColor Green
    Write-Host "Total Leads: $($metrics.totalLeads)" -ForegroundColor White
    Write-Host "Total Calls: $($metrics.totalCalls)" -ForegroundColor White
    Write-Host "Conversion Rate: $($metrics.conversionRate)%" -ForegroundColor White
}
catch {
    Write-Host "❌ Failed to get metrics: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n🎯 SMS Testing Complete!" -ForegroundColor Green
Write-Host "Check your Render logs to see the full interaction flow." -ForegroundColor Yellow
Write-Host "Monitor your VAPI dashboard for call activity." -ForegroundColor Yellow
