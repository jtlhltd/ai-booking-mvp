# Test Simple Analytics
$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = "ad34b1de00c5b7380d6a447abcd78874"

Write-Host "Testing Simple Analytics" -ForegroundColor Cyan

$headers = @{
    "X-API-Key" = $apiKey
}

# Test 1: Simple Analytics Dashboard (with minimal data)
Write-Host "Test 1: Simple Analytics Dashboard" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/analytics/victory_dental?days=1" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "Simple Analytics Response: $($response | ConvertTo-Json -Depth 3)" -ForegroundColor Green
} catch {
    Write-Host "Simple Analytics Failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    }
}

# Test 2: Track Simple Analytics Event
Write-Host "Test 2: Track Simple Analytics Event" -ForegroundColor Yellow

$eventData = @{
    eventType = "simple_test"
    eventCategory = "testing"
    eventData = @{
        test = "simple"
        timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    }
    sessionId = "simple_test_$(Get-Date -Format 'yyyyMMddHHmmss')"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/analytics/victory_dental/track" -Method POST -Body $eventData -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "Simple Analytics Event Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "Simple Analytics Event Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "Simple Analytics Tests Complete!" -ForegroundColor Cyan
