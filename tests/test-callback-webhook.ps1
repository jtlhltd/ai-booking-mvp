# Test Callback Scheduling Webhook
# Simulates Twilio sending a callback request webhook (when caller presses "1")

$BASE_URL = "https://ai-booking-mvp.onrender.com"
$API_KEY = "ad34b1de00c5b7380d6a447abcd78874"

Write-Host "🧪 Testing Callback Scheduling Webhook" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "📋 Test Parameters:" -ForegroundColor Yellow
Write-Host "  - CallSid: CA1234567890abcdef1234567890abcdef (test value)"
Write-Host "  - Digits: 1 (pressed by caller)"
Write-Host "  - From: +447491683261 (caller's number)"
Write-Host "  - To: +447403934440 (your Twilio number - must match a client)"
Write-Host ""

# Test callback webhook payload
# Note: For a real test, you need a CallSid from an actual inbound call
# The system will try to identify the client from the To phone number

$callSid = "CA" + (New-Guid).ToString().Replace("-", "").Substring(0, 32)

Write-Host "Step 1: Sending callback webhook..." -ForegroundColor Yellow
Write-Host ""

try {
    # Twilio webhooks use application/x-www-form-urlencoded
    $formData = @{
        CallSid = $callSid
        Digits = "1"
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
    
    $response = Invoke-WebRequest -Uri "$BASE_URL/webhooks/twilio-voice-callback" `
        -Method POST `
        -Body $body `
        -ContentType "application/x-www-form-urlencoded" `
        -TimeoutSec 30
    
    Write-Host "✅ Callback webhook sent successfully!" -ForegroundColor Green
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Gray
    Write-Host "Response: $($response.Content)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "📊 What should happen:" -ForegroundColor Yellow
    Write-Host "  1. System identifies client from phone number"
    Write-Host "  2. Calculates preferred callback time (next business hour)"
    Write-Host "  3. Stores callback request in messages table"
    Write-Host "  4. Adds to retry_queue for processing"
    Write-Host "  5. Updates inbound_calls record"
    Write-Host "  6. Sends email/SMS notification to client"
    Write-Host "  7. Sends confirmation SMS to caller"
    Write-Host ""
    Write-Host "⏳ Check Render logs for processing details..." -ForegroundColor Cyan
    
} catch {
    Write-Host "❌ Callback webhook failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "💡 Tip: For a real test, you need:" -ForegroundColor Yellow
Write-Host "  - An actual CallSid from a real inbound call"
Write-Host "  - The call must be in the inbound_calls table"
Write-Host "  - Or the To number must match a client's phone number"
Write-Host "  - The client must have business hours configured"

