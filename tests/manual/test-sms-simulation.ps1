# Test SMS Simulation for AI Booking MVP
# This simulates sending SMS messages to test the full flow

$API_KEY = "ad34b1de00c5b7380d6a447abcd78874"
$BASE_URL = "https://ai-booking-mvp.onrender.com"

Write-Host "Testing SMS Flow Simulation..." -ForegroundColor Green
Write-Host ""

# Test 1: Simulate SMS to Victory Dental
Write-Host "1. Simulating SMS to Victory Dental (+447403934440)" -ForegroundColor Yellow
Write-Host "Message: START"
Write-Host ""

try {
    $smsData = @{
        From = "+447491683261"  # Your mobile number
        To = "+447403934440"    # Victory Dental number
        Body = "START"
        MessagingServiceSid = "MG852f3cf7b50ef1be50c566be9e7efa04"
    }
    
    $response = Invoke-RestMethod -Uri "$BASE_URL/webhooks/twilio-inbound" -Method POST -Body $smsData -ContentType "application/x-www-form-urlencoded"
    Write-Host "SMS simulation successful!" -ForegroundColor Green
    Write-Host "Response: $response"
    Write-Host ""
} catch {
    Write-Host "SMS simulation failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 2: Simulate SMS to Northside Vet
Write-Host "2. Simulating SMS to Northside Vet (+447491683261)" -ForegroundColor Yellow
Write-Host "Message: urgent appointment needed"
Write-Host ""

try {
    $smsData = @{
        From = "+447403934440"  # Assistant's number
        To = "+447491683261"    # Northside Vet number
        Body = "urgent appointment needed"
        MessagingServiceSid = "MG852f3cf7b50ef1be50c566be9e7efa04"
    }
    
    $response = Invoke-RestMethod -Uri "$BASE_URL/webhooks/twilio-inbound" -Method POST -Body $smsData -ContentType "application/x-www-form-urlencoded"
    Write-Host "SMS simulation successful!" -ForegroundColor Green
    Write-Host "Response: $response"
    Write-Host ""
} catch {
    Write-Host "SMS simulation failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 3: Check results
Write-Host "3. Checking Results..." -ForegroundColor Yellow
Write-Host ""

try {
    $headers = @{ "X-API-Key" = $API_KEY }
    
    # Check metrics
    $metrics = Invoke-RestMethod -Uri "$BASE_URL/admin/metrics" -Headers $headers
    Write-Host "Updated Metrics:" -ForegroundColor Cyan
    Write-Host "  - Total Leads: $($metrics.metrics.overview.totalLeads)"
    Write-Host "  - Total Calls: $($metrics.metrics.overview.totalCalls)"
    Write-Host "  - Last 24h Leads: $($metrics.metrics.last24h.newLeads)"
    Write-Host "  - Last 24h Calls: $($metrics.metrics.last24h.totalCalls)"
    Write-Host ""
    
    # Check lead scoring
    $leadScore1 = Invoke-RestMethod -Uri "$BASE_URL/admin/lead-score?phone=+447491683261" -Headers $headers
    if ($leadScore1.found) {
        Write-Host "Lead Scoring Results:" -ForegroundColor Cyan
        Write-Host "  - Phone: $($leadScore1.phone)"
        Write-Host "  - Score: $($leadScore1.score)/100"
        Write-Host "  - Priority: $($leadScore1.priority)"
        Write-Host ""
    }
    
    $leadScore2 = Invoke-RestMethod -Uri "$BASE_URL/admin/lead-score?phone=+447403934440" -Headers $headers
    if ($leadScore2.found) {
        Write-Host "Lead Scoring Results:" -ForegroundColor Cyan
        Write-Host "  - Phone: $($leadScore2.phone)"
        Write-Host "  - Score: $($leadScore2.score)/100"
        Write-Host "  - Priority: $($leadScore2.priority)"
        Write-Host ""
    }
    
} catch {
    Write-Host "Results check failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

Write-Host "SMS Flow Testing Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Check the Render logs for LEAD SCORE, BUSINESS HOURS, AUTO-CALL messages"
Write-Host "2. Send real SMS messages to test the full Twilio integration"
Write-Host "3. Monitor the metrics dashboard for real-time updates"
Write-Host ""