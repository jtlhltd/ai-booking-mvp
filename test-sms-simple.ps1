# Simple SMS Test Script
# Tests SMS functionality without special characters

Write-Host "SMS Testing Script" -ForegroundColor Cyan
Write-Host "=================" -ForegroundColor Cyan

$baseUrl = "https://ai-booking-mvp.onrender.com"

function Send-SMS {
    param(
        [string]$Body,
        [string]$Scenario
    )
    
    Write-Host "`nSending: $Scenario" -ForegroundColor Yellow
    Write-Host "Body: '$Body'" -ForegroundColor Gray
    
    $smsData = @{
        Body = $Body
        From = "+447491683261"
        To = "+447403934440"
        MessageSid = "test_$(Get-Random)_$(Get-Date -Format 'HHmmss')"
        MessagingServiceSid = "MG1234567890abcdef1234567890abcdef"
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/webhooks/twilio-inbound" -Method POST -Body $smsData -ContentType "application/json" -TimeoutSec 30
        Write-Host "PASS: $Scenario" -ForegroundColor Green
        return $response
    }
    catch {
        Write-Host "FAIL: $Scenario - $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

Write-Host "`nTesting SMS scenarios..." -ForegroundColor Yellow

# Test 1: Opt-in
Send-SMS -Body "START" -Scenario "Customer opt-in"
Start-Sleep -Seconds 3

# Test 2: Yes response
Send-SMS -Body "YES" -Scenario "Customer confirms interest"
Start-Sleep -Seconds 3

# Test 3: Booking request
Send-SMS -Body "I'd like to book an appointment" -Scenario "Booking inquiry"
Start-Sleep -Seconds 3

# Test 4: General question
Send-SMS -Body "What are your opening hours?" -Scenario "Hours inquiry"
Start-Sleep -Seconds 3

# Test 5: Stop request
Send-SMS -Body "STOP" -Scenario "Opt-out request"
Start-Sleep -Seconds 3

Write-Host "`nSMS Testing Complete!" -ForegroundColor Green
Write-Host "Check your Render logs to see the SMS processing." -ForegroundColor Yellow
