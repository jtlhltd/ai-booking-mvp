# Real-World Testing Script
$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = "ad34b1de00c5b7380d6a447abcd78874"

Write-Host "REAL-WORLD TESTING - AI BOOKING MVP" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan

# Test 1: Real SMS Processing (Victory Dental)
Write-Host "`nTest 1: Real SMS Processing (Victory Dental)" -ForegroundColor Yellow
Write-Host "Sending SMS from your mobile (+447491683261) to Twilio number (+447403934440)" -ForegroundColor Gray

$smsData = @{
    From = "+447491683261"  # Your mobile
    To = "+447403934440"    # Twilio number
    Body = "START"
    MessageSid = "real_sms_$(Get-Date -Format 'yyyyMMddHHmmss')"
    MessagingServiceSid = "MG852f3cf7b50ef1be50c566be9e7efa04"
} | ConvertTo-Json

$headers = @{
    "X-API-Key" = $apiKey
}

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/sms" -Method POST -Body $smsData -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "SMS Processing Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "SMS Processing Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Check if Lead was Created
Write-Host "`nTest 2: Check Lead Creation" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/clients/victory_dental" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "Victory Dental Client Data:" -ForegroundColor Green
    Write-Host "   Lead Count: $($response.client.leadCount)" -ForegroundColor White
    Write-Host "   SMS From: $($response.client.sms.fromNumber)" -ForegroundColor White
    Write-Host "   VAPI Assistant: $($response.client.vapiAssistantId)" -ForegroundColor White
} catch {
    Write-Host "Client Data Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Analytics Dashboard
Write-Host "`nTest 3: Analytics Dashboard" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/analytics/victory_dental" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "Analytics Dashboard:" -ForegroundColor Green
    Write-Host "   Total Leads: $($response.dashboard.summary.totalLeads)" -ForegroundColor White
    Write-Host "   Total Calls: $($response.dashboard.summary.totalCalls)" -ForegroundColor White
    Write-Host "   Conversion Rate: $($response.dashboard.summary.conversionRate)%" -ForegroundColor White
} catch {
    Write-Host "Analytics Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: System Health Check
Write-Host "`nTest 4: System Health Check" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/system-health" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "System Health:" -ForegroundColor Green
    Write-Host "   Status: $($response.status)" -ForegroundColor White
    Write-Host "   Database: $($response.health.database.status)" -ForegroundColor White
    Write-Host "   VAPI: $($response.health.external.vapi)" -ForegroundColor White
    Write-Host "   Twilio: $($response.health.external.twilio)" -ForegroundColor White
    Write-Host "   Uptime: $([math]::Round($response.health.system.uptime, 2)) seconds" -ForegroundColor White
} catch {
    Write-Host "Health Check Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nREAL-WORLD TESTING COMPLETE!" -ForegroundColor Cyan
Write-Host "Next: Set up VAPI for Victory Dental and test real calls" -ForegroundColor Gray
