# Service Status Test
# Tests if the service is responding at all

Write-Host "Service Status Test" -ForegroundColor Cyan
Write-Host "==================" -ForegroundColor Cyan

$baseUrl = "https://ai-booking-mvp.onrender.com"

Write-Host "`nTesting basic connectivity..." -ForegroundColor Yellow

# Test 1: Simple GET request
Write-Host "`n1. Testing main dashboard..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/" -TimeoutSec 30 -UseBasicParsing
    Write-Host "PASS: Main dashboard responded with status $($response.StatusCode)" -ForegroundColor Green
    Write-Host "   Response length: $($response.Content.Length) characters" -ForegroundColor Gray
} catch {
    Write-Host "FAIL: Main dashboard failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Health check without API key (should fail with 401)
Write-Host "`n2. Testing health endpoint (no API key)..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/admin/system-health" -TimeoutSec 30 -UseBasicParsing
    Write-Host "UNEXPECTED: Health endpoint responded without API key" -ForegroundColor Yellow
} catch {
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "PASS: Health endpoint correctly requires API key (401)" -ForegroundColor Green
    } else {
        Write-Host "FAIL: Health endpoint failed with unexpected error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Test 3: Health check with API key
Write-Host "`n3. Testing health endpoint (with API key)..." -ForegroundColor Yellow
try {
    $headers = @{"X-API-Key" = "ad34b1de00c5b7380d6a447abcd78874"}
    $response = Invoke-WebRequest -Uri "$baseUrl/admin/system-health" -Headers $headers -TimeoutSec 30 -UseBasicParsing
    Write-Host "PASS: Health endpoint responded with status $($response.StatusCode)" -ForegroundColor Green
    Write-Host "   Response length: $($response.Content.Length) characters" -ForegroundColor Gray
} catch {
    Write-Host "FAIL: Health endpoint failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Simple POST request
Write-Host "`n4. Testing POST request..." -ForegroundColor Yellow
try {
    $body = @{ test = "data" } | ConvertTo-Json
    $headers = @{
        "Content-Type" = "application/json"
        "X-API-Key" = "ad34b1de00c5b7380d6a447abcd78874"
    }
    $response = Invoke-WebRequest -Uri "$baseUrl/api/create-client" -Method POST -Body $body -Headers $headers -TimeoutSec 30 -UseBasicParsing
    Write-Host "UNEXPECTED: POST request succeeded" -ForegroundColor Yellow
} catch {
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "PASS: POST request correctly rejected invalid data (400)" -ForegroundColor Green
    } else {
        Write-Host "FAIL: POST request failed with unexpected error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`nService Status Test Complete!" -ForegroundColor Green
Write-Host "If all tests pass, the service is responding correctly." -ForegroundColor Yellow
