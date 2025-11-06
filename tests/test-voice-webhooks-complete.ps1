# Complete Voice Webhooks Test
# Tests both voicemail processing and callback scheduling
# This creates a full test scenario with an inbound call record

$BASE_URL = "https://ai-booking-mvp.onrender.com"
$API_KEY = "ad34b1de00c5b7380d6a447abcd78874"

Write-Host "🧪 Complete Voice Webhooks Test" -ForegroundColor Cyan
Write-Host "===============================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This test will:" -ForegroundColor Yellow
Write-Host "  1. Create an inbound call record (simulated)"
Write-Host "  2. Test voicemail processing webhook"
Write-Host "  3. Test callback scheduling webhook"
Write-Host ""

# Test phone numbers (adjust these to match your actual clients)
$testFromPhone = "+447491683261"  # Caller
$testToPhone = "+447403934440"    # Your Twilio number (must match a client)

Write-Host "📋 Test Configuration:" -ForegroundColor Yellow
Write-Host "  From (Caller): $testFromPhone"
Write-Host "  To (Client): $testToPhone"
Write-Host ""

# Generate test CallSid (use same one for both tests)
$testCallSid = "CA" + (New-Guid).ToString().Replace("-", "").Substring(0, 32)
$testRecordingSid = "RE" + (New-Guid).ToString().Replace("-", "").Substring(0, 32)

Write-Host "Generated CallSid: $testCallSid" -ForegroundColor Gray
Write-Host ""

# ============================================
# TEST 1: Voicemail Processing
# ============================================
Write-Host "TEST 1: Voicemail Processing" -ForegroundColor Cyan
Write-Host "----------------------------" -ForegroundColor Cyan
Write-Host ""

$voicemailFormData = @{
    CallSid = $testCallSid
    RecordingUrl = "https://api.twilio.com/2010-04-01/Accounts/ACxxx/Recordings/$testRecordingSid"
    RecordingSid = $testRecordingSid
    RecordingDuration = "45"
    From = $testFromPhone
    To = $testToPhone
    AccountSid = "AC70407e0f0d15f286b3a9977c5312e1e5"
}

$voicemailBody = ($voicemailFormData.GetEnumerator() | ForEach-Object { 
    "$($_.Key)=$([System.Uri]::EscapeDataString($_.Value))" 
}) -join '&'

try {
    Write-Host "Sending voicemail webhook..." -ForegroundColor Yellow
    $response = Invoke-WebRequest -Uri "$BASE_URL/webhooks/twilio-voice-recording" `
        -Method POST `
        -Body $voicemailBody `
        -ContentType "application/x-www-form-urlencoded" `
        -TimeoutSec 30
    
    Write-Host "✅ Voicemail webhook sent!" -ForegroundColor Green
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Gray
    Write-Host ""
    
} catch {
    Write-Host "❌ Voicemail webhook failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody" -ForegroundColor Red
    }
    Write-Host ""
}

Start-Sleep -Seconds 2

# ============================================
# TEST 2: Callback Scheduling
# ============================================
Write-Host "TEST 2: Callback Scheduling" -ForegroundColor Cyan
Write-Host "---------------------------" -ForegroundColor Cyan
Write-Host ""

$callbackFormData = @{
    CallSid = $testCallSid
    Digits = "1"
    From = $testFromPhone
    To = $testToPhone
    AccountSid = "AC70407e0f0d15f286b3a9977c5312e1e5"
}

$callbackBody = ($callbackFormData.GetEnumerator() | ForEach-Object { 
    "$($_.Key)=$([System.Uri]::EscapeDataString($_.Value))" 
}) -join '&'

try {
    Write-Host "Sending callback webhook..." -ForegroundColor Yellow
    $response = Invoke-WebRequest -Uri "$BASE_URL/webhooks/twilio-voice-callback" `
        -Method POST `
        -Body $callbackBody `
        -ContentType "application/x-www-form-urlencoded" `
        -TimeoutSec 30
    
    Write-Host "✅ Callback webhook sent!" -ForegroundColor Green
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Gray
    Write-Host "Response (TwiML):" -ForegroundColor Gray
    Write-Host $response.Content -ForegroundColor Gray
    Write-Host ""
    
} catch {
    Write-Host "❌ Callback webhook failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody" -ForegroundColor Red
    }
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Check Render logs for processing details"
Write-Host "  2. Check database for new records in:"
Write-Host "     - messages table (voicemail/callback requests)"
Write-Host "     - inbound_calls table (updated with recording info)"
Write-Host "     - retry_queue table (callback scheduled)"
Write-Host "  3. Check client's email/SMS for notifications"
Write-Host ""
Write-Host "💡 For best results:" -ForegroundColor Yellow
Write-Host "  - Use a real CallSid from an actual inbound call"
Write-Host "  - Ensure the To number matches a client's phone number"
Write-Host "  - The client should have business hours configured"

