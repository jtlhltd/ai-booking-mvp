# API Response Test
# Tests actual API responses to see what data is returned

Write-Host "API Response Test" -ForegroundColor Cyan
Write-Host "===============" -ForegroundColor Cyan

$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = "ad34b1de00c5b7380d6a447abcd78874"

Write-Host "`nTesting API responses..." -ForegroundColor Yellow

# Test 1: Metrics API
Write-Host "`n1. Metrics API Response:" -ForegroundColor Yellow
try {
    $metrics = Invoke-RestMethod -Uri "$baseUrl/admin/metrics" -Headers @{"X-API-Key" = $apiKey} -TimeoutSec 10
    Write-Host "PASS: Metrics API responded" -ForegroundColor Green
    Write-Host "Response structure:" -ForegroundColor Gray
    $metrics | ConvertTo-Json -Depth 3 | Write-Host -ForegroundColor Gray
} catch {
    Write-Host "FAIL: Metrics API failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Tenant List API
Write-Host "`n2. Tenant List API Response:" -ForegroundColor Yellow
try {
    $tenants = Invoke-RestMethod -Uri "$baseUrl/admin/tenants" -Headers @{"X-API-Key" = $apiKey} -TimeoutSec 10
    Write-Host "PASS: Tenant List API responded" -ForegroundColor Green
    Write-Host "Response structure:" -ForegroundColor Gray
    $tenants | ConvertTo-Json -Depth 3 | Write-Host -ForegroundColor Gray
} catch {
    Write-Host "FAIL: Tenant List API failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: System Health API
Write-Host "`n3. System Health API Response:" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/admin/system-health" -Headers @{"X-API-Key" = $apiKey} -TimeoutSec 10
    Write-Host "PASS: System Health API responded" -ForegroundColor Green
    Write-Host "Response structure:" -ForegroundColor Gray
    $health | ConvertTo-Json -Depth 3 | Write-Host -ForegroundColor Gray
} catch {
    Write-Host "FAIL: System Health API failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nAPI Response Test Complete!" -ForegroundColor Green
Write-Host "Check the JSON responses above to see the actual data structure." -ForegroundColor Yellow
