# Data Population Test
# Tests adding data to the system and verifying it appears

Write-Host "Data Population Test" -ForegroundColor Cyan
Write-Host "==================" -ForegroundColor Cyan

$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = "ad34b1de00c5b7380d6a447abcd78874"

Write-Host "`nStep 1: Send SMS to create lead data..." -ForegroundColor Yellow

# Send multiple SMS messages to create leads
$smsMessages = @(
    "START",
    "YES", 
    "I'd like to book an appointment",
    "What are your opening hours?",
    "How much does a consultation cost?"
)

foreach ($message in $smsMessages) {
    Write-Host "`nSending: $message" -ForegroundColor Gray
    
    $smsData = @{
        Body = $message
        From = "+447491683261"
        To = "+447403934440"
        MessageSid = "data_test_$(Get-Random)_$(Get-Date -Format 'HHmmss')"
        MessagingServiceSid = "MG1234567890abcdef1234567890abcdef"
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/webhooks/twilio-inbound" -Method POST -Body $smsData -ContentType "application/json" -TimeoutSec 10
        Write-Host "PASS: SMS sent successfully" -ForegroundColor Green
    }
    catch {
        Write-Host "FAIL: SMS failed: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Start-Sleep -Seconds 2
}

Write-Host "`nStep 2: Wait for data processing..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host "`nStep 3: Check metrics for data..." -ForegroundColor Yellow

try {
    $metrics = Invoke-RestMethod -Uri "$baseUrl/admin/metrics" -Headers @{"X-API-Key" = $apiKey} -TimeoutSec 10
    Write-Host "PASS: Metrics retrieved" -ForegroundColor Green
    Write-Host "   Total Leads: $($metrics.totalLeads)" -ForegroundColor White
    Write-Host "   Total Calls: $($metrics.totalCalls)" -ForegroundColor White
    Write-Host "   Conversion Rate: $($metrics.conversionRate)%" -ForegroundColor White
    Write-Host "   Total Cost: $($metrics.totalCost)" -ForegroundColor White
    
    if ($metrics.totalLeads -gt 0) {
        Write-Host "   SUCCESS: Lead data is being tracked!" -ForegroundColor Green
    } else {
        Write-Host "   WARNING: No leads found - check SMS processing" -ForegroundColor Yellow
    }
} catch {
    Write-Host "FAIL: Metrics failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nStep 4: Check tenant list..." -ForegroundColor Yellow

try {
    $tenants = Invoke-RestMethod -Uri "$baseUrl/admin/tenants" -Headers @{"X-API-Key" = $apiKey} -TimeoutSec 10
    Write-Host "PASS: Tenant list retrieved" -ForegroundColor Green
    Write-Host "   Total Tenants: $($tenants.Count)" -ForegroundColor White
    
    if ($tenants.Count -gt 0) {
        Write-Host "   SUCCESS: Tenant data exists!" -ForegroundColor Green
        foreach ($tenant in $tenants) {
            Write-Host "   - $($tenant.clientKey): $($tenant.displayName)" -ForegroundColor Gray
        }
    } else {
        Write-Host "   WARNING: No tenants found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "FAIL: Tenant list failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nStep 5: Check system health..." -ForegroundColor Yellow

try {
    $health = Invoke-RestMethod -Uri "$baseUrl/admin/system-health" -Headers @{"X-API-Key" = $apiKey} -TimeoutSec 10
    Write-Host "PASS: System health retrieved" -ForegroundColor Green
    Write-Host "   Uptime: $($health.system.uptime) seconds" -ForegroundColor White
    Write-Host "   Memory Usage: $([math]::Round($health.system.memory.heapUsed / 1024 / 1024, 2)) MB" -ForegroundColor White
    Write-Host "   Node Version: $($health.system.nodeVersion)" -ForegroundColor White
} catch {
    Write-Host "FAIL: System health failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nData Population Test Complete!" -ForegroundColor Green
Write-Host "If leads and tenants show data, your system is working correctly." -ForegroundColor Yellow
Write-Host "If data is still empty, check your Render logs for processing errors." -ForegroundColor Yellow
