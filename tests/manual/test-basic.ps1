# Basic Test - No Authentication Required
$baseUrl = "https://ai-booking-mvp.onrender.com"

Write-Host "Testing Basic Endpoints" -ForegroundColor Cyan

# Test 1: SMS Endpoint (should work without auth)
Write-Host "Test 1: SMS Endpoint" -ForegroundColor Yellow

$smsData = @{
    From = "+447491683261"
    To = "+447403934440"
    Body = "START"
    MessageSid = "test_sms_$(Get-Date -Format 'yyyyMMddHHmmss')"
    MessagingServiceSid = "MG1234567890abcdef"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/sms" -Method POST -Body $smsData -ContentType "application/json" -TimeoutSec 30
    Write-Host "SMS Response: $($response)" -ForegroundColor Green
} catch {
    Write-Host "SMS Failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    }
}

# Test 2: Health Check
Write-Host "Test 2: Health Check" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/health" -Method GET -TimeoutSec 30
    Write-Host "Health Response: $($response)" -ForegroundColor Green
} catch {
    Write-Host "Health Check Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "Basic Tests Complete!" -ForegroundColor Cyan
