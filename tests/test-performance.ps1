# Test Performance Optimization
$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = "ad34b1de00c5b7380d6a447abcd78874"

Write-Host "Testing Performance Optimization" -ForegroundColor Cyan

$headers = @{
    "X-API-Key" = $apiKey
}

# Test 1: Performance Metrics
Write-Host "Test 1: Performance Metrics" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/performance/victory_dental" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "Performance Metrics Response: $($response | ConvertTo-Json -Depth 3)" -ForegroundColor Green
} catch {
    Write-Host "Performance Metrics Failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    }
}

# Test 2: System Performance Overview
Write-Host "Test 2: System Performance Overview" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/performance/system/overview" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "System Performance Overview Response: $($response | ConvertTo-Json -Depth 3)" -ForegroundColor Green
} catch {
    Write-Host "System Performance Overview Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Clear Cache
Write-Host "Test 3: Clear Cache" -ForegroundColor Yellow

$cacheData = @{
    pattern = "victory_dental"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/performance/victory_dental/cache/clear" -Method POST -Body $cacheData -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "Cache Clear Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "Cache Clear Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "Performance Optimization Tests Complete!" -ForegroundColor Cyan
