# Test endpoints that don't require authentication
$baseUrl = "https://ai-booking-mvp.onrender.com"

Write-Host "Testing Non-Authenticated Endpoints" -ForegroundColor Cyan

# Test 1: Health Check
Write-Host "Test 1: Health Check" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/health" -Method GET -TimeoutSec 30
    Write-Host "Health Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "Health Check Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Healthz Check
Write-Host "Test 2: Healthz Check" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/healthz" -Method GET -TimeoutSec 30
    Write-Host "Healthz Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "Healthz Check Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Root endpoint
Write-Host "Test 3: Root Endpoint" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/" -Method GET -TimeoutSec 30
    Write-Host "Root Response: $($response)" -ForegroundColor Green
} catch {
    Write-Host "Root Endpoint Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Check if SMS endpoint exists (should fail with 401)
Write-Host "Test 4: SMS Endpoint (should require auth)" -ForegroundColor Yellow
try {
    $smsData = @{
        From = "+447491683261"
        To = "+447403934440"
        Body = "START"
        MessageSid = "test_sms_$(Get-Date -Format 'yyyyMMddHHmmss')"
        MessagingServiceSid = "MG1234567890abcdef"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl/sms" -Method POST -Body $smsData -ContentType "application/json" -TimeoutSec 30
    Write-Host "SMS Response (unexpected): $($response)" -ForegroundColor Yellow
} catch {
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "SMS Endpoint correctly requires authentication (401)" -ForegroundColor Green
    } else {
        Write-Host "SMS Endpoint Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "Non-Authenticated Tests Complete!" -ForegroundColor Cyan
