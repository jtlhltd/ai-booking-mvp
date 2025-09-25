# Test with the correct API key found in the dashboard
$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = "ad34b1de00c5b7380d6a447abcd78874"

Write-Host "Testing with API Key: $($apiKey.Substring(0,8))..." -ForegroundColor Cyan

# Test 1: SMS Processing
Write-Host "Test 1: SMS Processing" -ForegroundColor Yellow

$smsData = @{
    From = "+447491683261"
    To = "+447403934440"
    Body = "START"
    MessageSid = "test_sms_$(Get-Date -Format 'yyyyMMddHHmmss')"
    MessagingServiceSid = "MG1234567890abcdef"
} | ConvertTo-Json

try {
    $headers = @{
        "X-API-Key" = $apiKey
    }
    $response = Invoke-RestMethod -Uri "$baseUrl/sms" -Method POST -Body $smsData -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "SMS Processing Response: $($response)" -ForegroundColor Green
} catch {
    Write-Host "SMS Processing Failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    }
}

# Test 2: Admin Metrics
Write-Host "Test 2: Admin Metrics" -ForegroundColor Yellow

try {
    $headers = @{
        "X-API-Key" = $apiKey
    }
    
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/metrics" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "Admin Metrics Response: $($response | ConvertTo-Json -Depth 3)" -ForegroundColor Green
} catch {
    Write-Host "Admin Metrics Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: System Health
Write-Host "Test 3: System Health" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/system-health" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "System Health Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "System Health Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Client List
Write-Host "Test 4: Client List" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/clients" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "Client List Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "Client List Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "API Key Tests Complete!" -ForegroundColor Cyan
