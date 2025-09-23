# VAPI Call Test
# Tests the SMS to VAPI call flow

Write-Host "VAPI Call Test" -ForegroundColor Cyan
Write-Host "=============" -ForegroundColor Cyan

$baseUrl = "https://ai-booking-mvp.onrender.com"

Write-Host "`nThis test will send SMS messages that should trigger VAPI calls to your mobile." -ForegroundColor Yellow
Write-Host "Your mobile number: +447491683261" -ForegroundColor White
Write-Host "System number: +447403934440" -ForegroundColor White

Write-Host "`nStep 1: Send START message to opt-in..." -ForegroundColor Yellow

$startSms = @{
    Body = "START"
    From = "+447491683261"
    To = "+447403934440"
    MessageSid = "vapi_test_start_$(Get-Random)"
    MessagingServiceSid = "MG1234567890abcdef1234567890abcdef"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/webhooks/twilio-inbound" -Method POST -Body $startSms -ContentType "application/json" -TimeoutSec 30
    Write-Host "PASS: START message sent successfully" -ForegroundColor Green
    Write-Host "Response: $response" -ForegroundColor Gray
} catch {
    Write-Host "FAIL: START message failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nWaiting 3 seconds..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

Write-Host "`nStep 2: Send YES message to trigger VAPI call..." -ForegroundColor Yellow

$yesSms = @{
    Body = "YES"
    From = "+447491683261"
    To = "+447403934440"
    MessageSid = "vapi_test_yes_$(Get-Random)"
    MessagingServiceSid = "MG1234567890abcdef1234567890abcdef"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/webhooks/twilio-inbound" -Method POST -Body $yesSms -ContentType "application/json" -TimeoutSec 30
    Write-Host "PASS: YES message sent successfully" -ForegroundColor Green
    Write-Host "Response: $response" -ForegroundColor Gray
} catch {
    Write-Host "FAIL: YES message failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nStep 3: Send booking request to trigger another call..." -ForegroundColor Yellow

$bookingSms = @{
    Body = "I'd like to book an appointment for tomorrow at 2pm"
    From = "+447491683261"
    To = "+447403934440"
    MessageSid = "vapi_test_booking_$(Get-Random)"
    MessagingServiceSid = "MG1234567890abcdef1234567890abcdef"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/webhooks/twilio-inbound" -Method POST -Body $bookingSms -ContentType "application/json" -TimeoutSec 30
    Write-Host "PASS: Booking message sent successfully" -ForegroundColor Green
    Write-Host "Response: $response" -ForegroundColor Gray
} catch {
    Write-Host "FAIL: Booking message failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nVAPI Call Test Complete!" -ForegroundColor Green
Write-Host "`nWhat to expect:" -ForegroundColor Yellow
Write-Host "1. Check your phone for incoming calls from VAPI" -ForegroundColor White
Write-Host "2. Check VAPI dashboard for call activity" -ForegroundColor White
Write-Host "3. Check Render logs for VAPI call attempts" -ForegroundColor White
Write-Host "4. Calls should be made to +447491683261" -ForegroundColor White

Write-Host "`nNote: Calls will only be made during business hours (9 AM - 5 PM UK time)" -ForegroundColor Cyan
Write-Host "If it's outside business hours, calls will be deferred until next business day." -ForegroundColor Cyan
