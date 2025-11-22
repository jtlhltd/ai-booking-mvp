# Test Service Delivery Improvements
# Run this after deployment to verify all improvements are working

$baseUrl = "https://ai-booking-mvp.onrender.com"
$clientKey = "stay-focused-fitness-chris"

Write-Host "🧪 Testing Service Delivery Improvements...`n" -ForegroundColor Cyan

# Test 1: Health Dashboard
Write-Host "1️⃣ Testing Health Dashboard..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/api/health/detailed" -Method GET -UseBasicParsing
    Write-Host "   ✅ Health Dashboard: $($health.overall)" -ForegroundColor Green
    Write-Host "   Services:" -ForegroundColor Gray
    $health.services.PSObject.Properties | ForEach-Object {
        Write-Host "     - $($_.Name): $($_.Value.status)" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ❌ Health Dashboard failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 2: SMS Delivery Rate
Write-Host "2️⃣ Testing SMS Delivery Rate..." -ForegroundColor Yellow
try {
    $smsRate = Invoke-RestMethod -Uri "$baseUrl/api/sms-delivery-rate/$clientKey" -Method GET -UseBasicParsing
    Write-Host "   ✅ SMS Delivery Rate: $($smsRate.deliveryRate)" -ForegroundColor Green
    Write-Host "   Total: $($smsRate.total), Delivered: $($smsRate.delivered), Failed: $($smsRate.failed)" -ForegroundColor Gray
} catch {
    Write-Host "   ❌ SMS Delivery Rate failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 3: Calendar Sync Status
Write-Host "3️⃣ Testing Calendar Sync Status..." -ForegroundColor Yellow
try {
    $calendar = Invoke-RestMethod -Uri "$baseUrl/api/calendar-sync/$clientKey" -Method GET -UseBasicParsing
    Write-Host "   ✅ Calendar Connected: $($calendar.connected)" -ForegroundColor Green
    if ($calendar.hoursSinceSync) {
        Write-Host "   Hours Since Last Sync: $($calendar.hoursSinceSync)" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ❌ Calendar Sync Status failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 4: Recording Quality Check
Write-Host "4️⃣ Testing Recording Quality Check..." -ForegroundColor Yellow
try {
    $recordings = Invoke-RestMethod -Uri "$baseUrl/api/recordings/quality-check/$clientKey" -Method GET -UseBasicParsing
    Write-Host "   ✅ Recordings Checked: $($recordings.total)" -ForegroundColor Green
    Write-Host "   Accessible: $($recordings.accessible), Broken: $($recordings.broken)" -ForegroundColor Gray
} catch {
    Write-Host "   ❌ Recording Quality Check failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 5: Verify SMS Status Webhook (check if messages table is being updated)
Write-Host "5️⃣ Testing SMS Status Tracking..." -ForegroundColor Yellow
Write-Host "   ℹ️  This requires an actual SMS to be sent. Check your database messages table." -ForegroundColor Gray
Write-Host "   Query: SELECT * FROM messages WHERE client_key = '$clientKey' ORDER BY created_at DESC LIMIT 5" -ForegroundColor Gray

Write-Host ""

# Summary
Write-Host "✅ All tests completed!" -ForegroundColor Green
Write-Host "`n📧 Email alerts will be sent to: $env:YOUR_EMAIL" -ForegroundColor Cyan
Write-Host "   (Make sure YOUR_EMAIL is set in Render environment variables)" -ForegroundColor Gray

Write-Host "`n💡 To test email alerts:" -ForegroundColor Yellow
Write-Host "   1. Trigger a booking failure (invalid calendar config)" -ForegroundColor Gray
Write-Host "   2. Send an SMS that fails (invalid phone number)" -ForegroundColor Gray
Write-Host "   3. Check your email for alerts" -ForegroundColor Gray

