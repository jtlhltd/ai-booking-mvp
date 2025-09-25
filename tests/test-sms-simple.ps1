# Test SMS Processing and Lead Creation
$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = $env:API_KEY

if (-not $apiKey) {
    Write-Host "API_KEY environment variable not set" -ForegroundColor Red
    exit 1
}

Write-Host "Testing SMS Processing and Lead Creation" -ForegroundColor Cyan

# Test 1: Basic SMS Processing
Write-Host "Test 1: Basic SMS Processing" -ForegroundColor Yellow

$smsData = @{
    From = "+447491683261"
    To = "+447403934440"
    Body = "START"
    MessageSid = "test_sms_$(Get-Date -Format 'yyyyMMddHHmmss')"
    MessagingServiceSid = "MG1234567890abcdef"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/sms" -Method POST -Body $smsData -ContentType "application/json" -TimeoutSec 30
    Write-Host "SMS Processing Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "SMS Processing Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Check System Health
Write-Host "Test 2: System Health Check" -ForegroundColor Yellow

try {
    $headers = @{
        "X-API-Key" = $apiKey
    }
    
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/system-health" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "System Health: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "System Health Check Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "SMS Processing Tests Complete!" -ForegroundColor Cyan