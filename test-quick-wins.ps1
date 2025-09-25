# Test script for AI Booking MVP Quick Wins
# Run this in PowerShell to test all new features

$API_KEY = "ad34b1de00c5b7380d6a447abcd78874"
$BASE_URL = "https://ai-booking-mvp.onrender.com"

Write-Host "Testing AI Booking MVP Quick Wins..." -ForegroundColor Green
Write-Host ""

# Test 1: Real-time Metrics Dashboard
Write-Host "Testing Real-time Metrics Dashboard..." -ForegroundColor Yellow
try {
    $headers = @{ "X-API-Key" = $API_KEY }
    $metrics = Invoke-RestMethod -Uri "$BASE_URL/admin/metrics" -Headers $headers
    
    Write-Host "Metrics loaded successfully!" -ForegroundColor Green
    Write-Host "Overview:" -ForegroundColor Cyan
    Write-Host "  - Total Leads: $($metrics.metrics.overview.totalLeads)"
    Write-Host "  - Total Calls: $($metrics.metrics.overview.totalCalls)"
    Write-Host "  - Active Tenants: $($metrics.metrics.overview.activeTenants)"
    Write-Host "  - Uptime: $([math]::Round($metrics.metrics.overview.uptime/60, 1)) minutes"
    
    Write-Host "Last 24h:" -ForegroundColor Cyan
    Write-Host "  - New Leads: $($metrics.metrics.last24h.newLeads)"
    Write-Host "  - Total Calls: $($metrics.metrics.last24h.totalCalls)"
    Write-Host "  - Opt-ins: $($metrics.metrics.last24h.optIns)"
    
    Write-Host "Costs:" -ForegroundColor Cyan
    Write-Host "  - Estimated VAPI Cost: $($metrics.metrics.costs.estimatedVapiCost)"
    Write-Host "  - Last 24h Cost: $($metrics.metrics.costs.last24hCost)"
    
    Write-Host ""
} catch {
    Write-Host "Metrics test failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 2: Lead Scoring System
Write-Host "Testing Lead Scoring System..." -ForegroundColor Yellow
try {
    $headers = @{ "X-API-Key" = $API_KEY }
    $leadScore = Invoke-RestMethod -Uri "$BASE_URL/admin/lead-score?phone=+447491683261" -Headers $headers
    
    if ($leadScore.found) {
        Write-Host "Lead scoring working!" -ForegroundColor Green
        Write-Host "Lead Analysis:" -ForegroundColor Cyan
        Write-Host "  - Phone: $($leadScore.phone)"
        Write-Host "  - Score: $($leadScore.score)/100"
        Write-Host "  - Priority: $($leadScore.priority)"
        Write-Host "  - Breakdown:"
        Write-Host "    * Consent SMS: $($leadScore.breakdown.consentSms) points"
        Write-Host "    * Status: $($leadScore.breakdown.status) points"
        Write-Host "    * Response Time: $($leadScore.breakdown.responseTime) points"
        Write-Host "    * Keywords: $($leadScore.breakdown.keywords) points"
        Write-Host "    * Recency: $($leadScore.breakdown.recency) points"
    } else {
        Write-Host "No lead found for +447491683261 (this is normal if no SMS sent yet)" -ForegroundColor Blue
    }
    Write-Host ""
} catch {
    Write-Host "Lead scoring test failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 3: Tenant Configuration Check
Write-Host "Testing Tenant Configuration..." -ForegroundColor Yellow
try {
    $headers = @{ "X-API-Key" = $API_KEY }
    $tenants = Invoke-RestMethod -Uri "$BASE_URL/admin/check-tenants" -Headers $headers
    
    Write-Host "Tenant check successful!" -ForegroundColor Green
    Write-Host "Tenant Summary:" -ForegroundColor Cyan
    foreach ($tenant in $tenants.tenants) {
        Write-Host "  - $($tenant.tenantKey):"
        Write-Host "    * From Number: $($tenant.fromNumber)"
        Write-Host "    * Messaging Service: $($tenant.messagingServiceSid)"
    }
    
    if ($tenants.duplicates.fromNumber.Count -gt 0) {
        Write-Host "Duplicate From Numbers: $($tenants.duplicates.fromNumber -join ', ')" -ForegroundColor Yellow
    }
    if ($tenants.duplicates.messagingServiceSid.Count -gt 0) {
        Write-Host "Duplicate Messaging Services: $($tenants.duplicates.messagingServiceSid -join ', ')" -ForegroundColor Yellow
    }
    Write-Host ""
} catch {
    Write-Host "Tenant check failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 4: Health Check
Write-Host "Testing Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$BASE_URL/health"
    Write-Host "Health check passed!" -ForegroundColor Green
    Write-Host "System Status:" -ForegroundColor Cyan
    Write-Host "  - Status: $($health.status)"
    Write-Host "  - Database: $($health.database)"
    Write-Host "  - Uptime: $([math]::Round($health.uptime/60, 1)) minutes"
    Write-Host "  - Memory: $([math]::Round($health.memory.heapUsed/1024/1024, 1)) MB used"
    Write-Host ""
} catch {
    Write-Host "Health check failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

Write-Host "Quick Wins Testing Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Send a test SMS to +447403934440 (victory_dental) or +447491683261 (northside_vet)"
Write-Host "2. Check the logs for LEAD SCORE, BUSINESS HOURS, and AUTO-CALL messages"
Write-Host "3. Run this script again to see updated metrics"
Write-Host ""