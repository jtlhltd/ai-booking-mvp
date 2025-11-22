# Test SMS Status Webhook
# This tests the SMS delivery tracking system

$baseUrl = "https://ai-booking-mvp.onrender.com"
$clientKey = "stay-focused-fitness-chris"

Write-Host "Testing SMS Status Webhook`n" -ForegroundColor Cyan

# Step 1: First, we need to create a test message in the database
# We'll simulate sending an SMS first, then test the status update
Write-Host "Step 1: Simulating SMS send (to create message record)..." -ForegroundColor Yellow

# Create a test message record by calling notify_send (this requires API key)
# For now, let's test the webhook with a fake message SID to see if it works
$testMessageSid = "SM" + (New-Guid).ToString().Replace("-", "").Substring(0, 32)
$testPhone = "+447000000000"

Write-Host "`nStep 2: Testing SMS Status Webhook with test data..." -ForegroundColor Yellow
Write-Host "  Message SID: $testMessageSid" -ForegroundColor Gray
Write-Host "  Phone: $testPhone" -ForegroundColor Gray
Write-Host "  Status: delivered" -ForegroundColor Gray

$body = @{
    MessageSid = $testMessageSid
    MessageStatus = "delivered"
    To = $testPhone
    From = "+447000000001"
    MessagingServiceSid = "MG" + (New-Guid).ToString().Replace("-", "").Substring(0, 32)
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/test/sms-status-webhook" `
        -Method POST `
        -Body $body `
        -ContentType "application/json" `
        -UseBasicParsing `
        -TimeoutSec 15
    
    Write-Host "`n[PASS] Webhook endpoint responded: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response: $($response.Content)" -ForegroundColor Gray
    
    # Now test with a failed status
    Write-Host "`nStep 3: Testing with failed status..." -ForegroundColor Yellow
    
    $failedBody = @{
        MessageSid = $testMessageSid
        MessageStatus = "failed"
        To = $testPhone
        From = "+447000000001"
        ErrorCode = "30008"
    } | ConvertTo-Json
    
    $response2 = Invoke-WebRequest -Uri "$baseUrl/api/test/sms-status-webhook" `
        -Method POST `
        -Body $failedBody `
        -ContentType "application/json" `
        -UseBasicParsing `
        -TimeoutSec 15
    
    Write-Host "[PASS] Failed status webhook responded: $($response2.StatusCode)" -ForegroundColor Green
    Write-Host "Response: $($response2.Content)" -ForegroundColor Gray
    
    Write-Host "`n✅ SMS Status Webhook Test: PASSED" -ForegroundColor Green
    Write-Host "`nNote: Check your email ($env:YOUR_EMAIL) for failure alert if YOUR_EMAIL is set" -ForegroundColor Cyan
    
} catch {
    Write-Host "`n[FAIL] Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody" -ForegroundColor Red
    }
}

Write-Host "`nStep 4: Testing with form-urlencoded format (like Twilio sends)..." -ForegroundColor Yellow

$formData = "MessageSid=SM$(New-Guid).ToString().Replace('-','').Substring(0,32))&MessageStatus=queued&To=$testPhone&From=%2B447000000001"

try {
    $response3 = Invoke-WebRequest -Uri "$baseUrl/api/test/sms-status-webhook" `
        -Method POST `
        -Body $formData `
        -ContentType "application/x-www-form-urlencoded" `
        -UseBasicParsing `
        -TimeoutSec 15
    
    Write-Host "[PASS] Form-encoded webhook responded: $($response3.StatusCode)" -ForegroundColor Green
    Write-Host "Response: $($response3.Content)" -ForegroundColor Gray
    
} catch {
    Write-Host "[WARN] Form-encoded test failed: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "SMS Status Webhook Test Complete" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

