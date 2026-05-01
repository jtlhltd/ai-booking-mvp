# Test Voicemail Processing Webhook
# Simulates Twilio sending a voicemail recording webhook

$BASE_URL = "https://ai-booking-mvp.onrender.com"
$API_KEY = "ad34b1de00c5b7380d6a447abcd78874"

Write-Host "🧪 Testing Voicemail Processing Webhook" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# You need to provide:
# 1. A valid CallSid (from an actual inbound call, or use a test one)
# 2. A client's phone number (To) that exists in your system
# 3. A caller's phone number (From)

Write-Host "📋 Test Parameters:" -ForegroundColor Yellow
Write-Host "  - CallSid: CA1234567890abcdef1234567890abcdef (test value)"
Write-Host "  - From: +447491683261 (caller's number)"
Write-Host "  - To: +447403934440 (your Twilio number - must match a client)"
Write-Host ""

# First, let's check if we need to create an inbound call record
Write-Host "Step 1: Checking if inbound call record exists..." -ForegroundColor Yellow

# Test voicemail webhook payload
# Note: For a real test, you need a CallSid from an actual inbound call
# The system will try to identify the client from the To phone number

$callSid = "CA" + (New-Guid).ToString().Replace("-", "").Substring(0, 32)
$recordingSid = "RE" + (New-Guid).ToString().Replace("-", "").Substring(0, 32)

Write-Host "Step 2: Sending voicemail webhook..." -ForegroundColor Yellow
Write-Host ""

try {
    # Twilio webhooks use application/x-www-form-urlencoded
    $formData = @{
        CallSid = $callSid
        RecordingUrl = "https://api.twilio.com/2010-04-01/Accounts/ACxxx/Recordings/$recordingSid"
        RecordingSid = $recordingSid
        RecordingDuration = "45"
        From = "+447491683261"
        To = "+447403934440"
        AccountSid = "AC70407e0f0d15f286b3a9977c5312e1e5"
    }
    
    # Build URL-encoded form data (PowerShell native encoding)
    $bodyParts = @()
    foreach ($key in $formData.Keys) {
        $value = $formData[$key]
        $encodedValue = [System.Uri]::EscapeDataString($value)
        $bodyParts += "$key=$encodedValue"
    }
    $body = $bodyParts -join '&'
    
    $response = Invoke-WebRequest -Uri "$BASE_URL/webhooks/twilio-voice-recording" `
        -Method POST `
        -Body $body `
        -ContentType "application/x-www-form-urlencoded" `
        -TimeoutSec 30
    
    Write-Host "✅ Voicemail webhook sent successfully!" -ForegroundColor Green
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Gray
    Write-Host "Response: $($response.Content)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "📊 What should happen:" -ForegroundColor Yellow
    Write-Host "  1. System identifies client from phone number"
    Write-Host "  2. Fetches transcription from Twilio (if available)"
    Write-Host "  3. Stores voicemail in messages table"
    Write-Host "  4. Updates inbound_calls record"
    Write-Host "  5. Sends email/SMS notification to client"
    Write-Host ""
    Write-Host "⏳ Check Render logs for processing details..." -ForegroundColor Cyan
    
} catch {
    Write-Host "❌ Voicemail webhook failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "💡 Tip: For a real test, you need:" -ForegroundColor Yellow
Write-Host "  - An actual CallSid from a real inbound call"
Write-Host "  - A valid RecordingSid from Twilio"
Write-Host "  - The call must be in the inbound_calls table"
Write-Host "  - Or the To number must match a client's phone number"

