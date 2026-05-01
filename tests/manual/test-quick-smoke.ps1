# Quick Smoke Test
# Fastest way to verify your system is working

Write-Host "Quick Smoke Test" -ForegroundColor Cyan
Write-Host "================" -ForegroundColor Cyan

$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = "ad34b1de00c5b7380d6a447abcd78874"

Write-Host "`nRunning essential system checks..." -ForegroundColor Yellow

# Test 1: Health Check
Write-Host "`n1. System Health Check" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/admin/system-health" -Headers @{"X-API-Key" = $apiKey} -TimeoutSec 10
    Write-Host "PASS: System is healthy" -ForegroundColor Green
    Write-Host "   Uptime: $($health.system.uptime)" -ForegroundColor Gray
} catch {
    Write-Host "FAIL: System health check failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Metrics
Write-Host "`n2. Metrics Dashboard" -ForegroundColor Yellow
try {
    $metrics = Invoke-RestMethod -Uri "$baseUrl/admin/metrics" -Headers @{"X-API-Key" = $apiKey} -TimeoutSec 10
    Write-Host "PASS: Metrics accessible" -ForegroundColor Green
    Write-Host "   Leads: $($metrics.totalLeads)" -ForegroundColor Gray
    Write-Host "   Calls: $($metrics.totalCalls)" -ForegroundColor Gray
} catch {
    Write-Host "FAIL: Metrics failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Main Dashboard
Write-Host "`n3. Main Dashboard" -ForegroundColor Yellow
try {
    $dashboard = Invoke-RestMethod -Uri "$baseUrl/" -TimeoutSec 10
    Write-Host "PASS: Main dashboard accessible" -ForegroundColor Green
} catch {
    Write-Host "FAIL: Main dashboard failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: SMS Webhook
Write-Host "`n4. SMS Webhook" -ForegroundColor Yellow
try {
    $smsData = @{
        Body = "SMOKE TEST"
        From = "+447491683261"
        To = "+447403934440"
        MessageSid = "smoke_test_$(Get-Random)"
        MessagingServiceSid = "MG1234567890abcdef1234567890abcdef"
    } | ConvertTo-Json
    
    $smsResponse = Invoke-RestMethod -Uri "$baseUrl/webhooks/twilio-inbound" -Method POST -Body $smsData -ContentType "application/json" -TimeoutSec 10
    Write-Host "PASS: SMS webhook working" -ForegroundColor Green
} catch {
    Write-Host "FAIL: SMS webhook failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: Onboarding Wizard
Write-Host "`n5. Onboarding Wizard" -ForegroundColor Yellow
try {
    $wizard = Invoke-RestMethod -Uri "$baseUrl/onboarding-wizard" -TimeoutSec 10
    Write-Host "PASS: Onboarding wizard accessible" -ForegroundColor Green
} catch {
    Write-Host "FAIL: Onboarding wizard failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nSmoke Test Complete!" -ForegroundColor Green
Write-Host "If all tests passed, your system is working correctly." -ForegroundColor Yellow
Write-Host "If any tests failed, check your Render logs for details." -ForegroundColor Yellow
