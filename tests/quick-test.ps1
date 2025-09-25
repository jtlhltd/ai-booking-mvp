# Quick Test Script for AI Booking MVP
# Run this anytime to test your system

$API_KEY = "ad34b1de00c5b7380d6a447abcd78874"
$BASE_URL = "https://ai-booking-mvp.onrender.com"

Write-Host "AI Booking MVP - Quick Test" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""

# Test 1: System Health
Write-Host "1. System Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$BASE_URL/health" -TimeoutSec 10
    Write-Host "   Status: $($health.status)" -ForegroundColor Green
    Write-Host "   Database: $($health.database)" -ForegroundColor Green
    Write-Host "   Uptime: $([math]::Round($health.uptime/60, 1)) minutes" -ForegroundColor Green
} catch {
    Write-Host "   Health Check Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 2: Metrics Dashboard
Write-Host "2. Metrics Dashboard..." -ForegroundColor Yellow
try {
    $headers = @{ "X-API-Key" = $API_KEY }
    $metrics = Invoke-RestMethod -Uri "$BASE_URL/admin/metrics" -Headers $headers -TimeoutSec 10
    Write-Host "   Total Leads: $($metrics.metrics.overview.totalLeads)" -ForegroundColor Green
    Write-Host "   Total Calls: $($metrics.metrics.overview.totalCalls)" -ForegroundColor Green
    Write-Host "   Active Tenants: $($metrics.metrics.overview.activeTenants)" -ForegroundColor Green
    Write-Host "   Conversion Rate: $([math]::Round($metrics.metrics.last7d.conversionRate, 1))%" -ForegroundColor Green
} catch {
    Write-Host "   Metrics Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 3: Tenant Resolution
Write-Host "3. Tenant Resolution..." -ForegroundColor Yellow
try {
    $headers = @{ "X-API-Key" = $API_KEY }
    $tenant1 = Invoke-RestMethod -Uri "$BASE_URL/admin/tenant-resolve?to=+447403934440&mss=MG852f3cf7b50ef1be50c566be9e7efa04" -Headers $headers -TimeoutSec 10
    $tenant2 = Invoke-RestMethod -Uri "$BASE_URL/admin/tenant-resolve?to=+447491683261&mss=MG852f3cf7b50ef1be50c566be9e7efa04" -Headers $headers -TimeoutSec 10
    Write-Host "   Victory Dental (+447403934440): $($tenant1.tenantKey)" -ForegroundColor Green
    Write-Host "   Northside Vet (+447491683261): $($tenant2.tenantKey)" -ForegroundColor Green
} catch {
    Write-Host "   Tenant Resolution Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 4: SMS Simulation
Write-Host "4. SMS Simulation..." -ForegroundColor Yellow
try {
    $smsData = @{
        From = "+447491683261"
        To = "+447403934440"
        Body = "QUICK TEST"
        MessagingServiceSid = "MG852f3cf7b50ef1be50c566be9e7efa04"
    }
    $response = Invoke-RestMethod -Uri "$BASE_URL/webhooks/twilio-inbound" -Method POST -Body $smsData -ContentType "application/x-www-form-urlencoded" -TimeoutSec 10
    Write-Host "   SMS Processed: $response" -ForegroundColor Green
} catch {
    Write-Host "   SMS Simulation Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 5: Lead Scoring
Write-Host "5. Lead Scoring..." -ForegroundColor Yellow
try {
    $headers = @{ "X-API-Key" = $API_KEY }
    $leadScore = Invoke-RestMethod -Uri "$BASE_URL/admin/lead-score?phone=+447491683261" -Headers $headers -TimeoutSec 10
    if ($leadScore.found) {
        Write-Host "   Lead Found: Score $($leadScore.score), Priority $($leadScore.priority)" -ForegroundColor Green
    } else {
        Write-Host "   No lead found (normal if no recent SMS)" -ForegroundColor Blue
    }
} catch {
    Write-Host "   Lead Scoring Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "Quick Test Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "Send real SMS to +447403934440 or +447491683261"
Write-Host "Check logs for LEAD SCORE, BUSINESS HOURS, AUTO-CALL"
Write-Host "Monitor metrics dashboard for real-time updates"
Write-Host ""