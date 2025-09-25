# Mock VAPI Testing for Victory Dental
$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = "ad34b1de00c5b7380d6a447abcd78874"

Write-Host "MOCK VAPI TESTING FOR VICTORY DENTAL" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

$headers = @{
    "X-API-Key" = $apiKey
}

# Test 1: Simulate SMS Processing that should trigger VAPI
Write-Host "`nTest 1: Simulate SMS Processing (START message)" -ForegroundColor Yellow

$smsData = @{
    From = "+447491683261"  # Your mobile
    To = "+447403934440"    # Twilio number
    Body = "START"
    MessageSid = "mock_sms_$(Get-Date -Format 'yyyyMMddHHmmss')"
    MessagingServiceSid = "MG852f3cf7b50ef1be50c566be9e7efa04"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/sms" -Method POST -Body $smsData -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "SMS Processing Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "SMS Processing Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Simulate YES response that should trigger VAPI call
Write-Host "`nTest 2: Simulate YES Response (should trigger VAPI call)" -ForegroundColor Yellow

$yesData = @{
    From = "+447491683261"  # Your mobile
    To = "+447403934440"    # Twilio number
    Body = "YES"
    MessageSid = "mock_yes_$(Get-Date -Format 'yyyyMMddHHmmss')"
    MessagingServiceSid = "MG852f3cf7b50ef1be50c566be9e7efa04"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/sms" -Method POST -Body $yesData -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "YES Response Processing: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "YES Response Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Check Lead Status
Write-Host "`nTest 3: Check Lead Status After Processing" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/clients/victory_dental" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "Victory Dental Lead Status:" -ForegroundColor Green
    Write-Host "   Lead Count: $($response.client.leadCount)" -ForegroundColor White
    if ($response.client.leads) {
        foreach ($lead in $response.client.leads) {
            Write-Host "   Lead: $($lead.phone) - Status: $($lead.status) - Score: $($lead.score)" -ForegroundColor White
        }
    }
} catch {
    Write-Host "Lead Status Check Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Check Analytics
Write-Host "`nTest 4: Check Analytics Dashboard" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/analytics/victory_dental" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "Analytics Dashboard:" -ForegroundColor Green
    Write-Host "   Total Leads: $($response.dashboard.summary.totalLeads)" -ForegroundColor White
    Write-Host "   Total Calls: $($response.dashboard.summary.totalCalls)" -ForegroundColor White
    Write-Host "   Conversion Rate: $($response.dashboard.summary.conversionRate)%" -ForegroundColor White
} catch {
    Write-Host "Analytics Check Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nMOCK VAPI TESTING COMPLETE!" -ForegroundColor Cyan
Write-Host "Note: VAPI calls are mocked until VAPI_API_KEY is configured" -ForegroundColor Yellow
