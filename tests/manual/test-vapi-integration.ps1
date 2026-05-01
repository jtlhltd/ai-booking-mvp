# Test VAPI Integration
$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = "ad34b1de00c5b7380d6a447abcd78874"

Write-Host "Testing VAPI Integration" -ForegroundColor Cyan

# Test 1: VAPI Webhook Status
Write-Host "Test 1: VAPI Webhook Status" -ForegroundColor Yellow

try {
    $headers = @{
        "X-API-Key" = $apiKey
    }
    
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/system-health" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "VAPI Status: $($response.health.external.vapi)" -ForegroundColor Green
} catch {
    Write-Host "VAPI Status Check Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Test VAPI Call Endpoint
Write-Host "Test 2: Test VAPI Call Endpoint" -ForegroundColor Yellow

$vapiData = @{
    phone = "+447491683261"
    tenantKey = "victory_dental"
    message = "Test call from PowerShell"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/test-vapi-call" -Method POST -Body $vapiData -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "VAPI Call Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "VAPI Call Failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    }
}

# Test 3: Check Call Tracking
Write-Host "Test 3: Check Call Tracking" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/calls/victory_dental" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "Call Tracking Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "Call Tracking Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Check VAPI Metrics
Write-Host "Test 4: Check VAPI Metrics" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/metrics" -Method GET -Headers $headers -TimeoutSec 30
    $vapiMetrics = $response.metrics.vapi
    Write-Host "VAPI Metrics:" -ForegroundColor Green
    Write-Host "  Total Calls: $($vapiMetrics.totalCalls)" -ForegroundColor Cyan
    Write-Host "  Success Rate: $($vapiMetrics.callSuccessRate)%" -ForegroundColor Cyan
    Write-Host "  Average Duration: $($vapiMetrics.averageCallDuration)s" -ForegroundColor Cyan
    Write-Host "  Total Cost: $($vapiMetrics.totalCallCost)" -ForegroundColor Cyan
} catch {
    Write-Host "VAPI Metrics Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "VAPI Integration Tests Complete!" -ForegroundColor Cyan
