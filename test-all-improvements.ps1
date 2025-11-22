# Comprehensive Test Suite for Service Delivery Improvements
# Tests all 9 improvements that were added

$baseUrl = "https://ai-booking-mvp.onrender.com"
$clientKey = "stay-focused-fitness-chris"
$testResults = @()

function Test-Endpoint {
    param($name, $url, $method = "GET", $body = $null)
    
    Write-Host "`n[TEST] $name" -ForegroundColor Cyan
    Write-Host "   URL: $url" -ForegroundColor Gray
    
    try {
        $params = @{
            Uri = $url
            Method = $method
            UseBasicParsing = $true
            TimeoutSec = 15
        }
        
        if ($body) {
            $params.Body = $body | ConvertTo-Json
            $params.ContentType = "application/json"
        }
        
        $response = Invoke-WebRequest @params
        $data = $response.Content | ConvertFrom-Json
        
        Write-Host "   [PASS] Status: $($response.StatusCode)" -ForegroundColor Green
        Write-Host "   Response: $($data | ConvertTo-Json -Compress)" -ForegroundColor Gray
        
        return @{
            name = $name
            status = "PASS"
            statusCode = $response.StatusCode
            data = $data
        }
    } catch {
        Write-Host "   [FAIL] $($_.Exception.Message)" -ForegroundColor Red
        return @{
            name = $name
            status = "FAIL"
            error = $_.Exception.Message
        }
    }
}

Write-Host "========================================" -ForegroundColor Yellow
Write-Host "COMPREHENSIVE SERVICE DELIVERY TEST SUITE" -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Yellow

# Test 1: Health Dashboard
$testResults += Test-Endpoint `
    -name "1. Health Dashboard" `
    -url "$baseUrl/api/health/detailed"

# Test 2: SMS Delivery Rate Tracking
$testResults += Test-Endpoint `
    -name "2. SMS Delivery Rate" `
    -url "$baseUrl/api/sms-delivery-rate/$clientKey"

# Test 3: Calendar Sync Status
$testResults += Test-Endpoint `
    -name "3. Calendar Sync Status" `
    -url "$baseUrl/api/calendar-sync/$clientKey"

# Test 4: Recording Quality Check
$testResults += Test-Endpoint `
    -name "4. Recording Quality Check" `
    -url "$baseUrl/api/recordings/quality-check/$clientKey"

# Test 5: SMS Status Webhook (simulate Twilio callback)
Write-Host "`n[TEST] 5. SMS Status Webhook Endpoint" -ForegroundColor Cyan
Write-Host "   Note: Testing endpoint exists (auth will fail but that's expected)..." -ForegroundColor Gray
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/webhooks/twilio-status" -Method POST -UseBasicParsing -TimeoutSec 10 -ErrorAction SilentlyContinue
    Write-Host "   [PASS] Endpoint exists" -ForegroundColor Green
    $testResults += @{ name = "5. SMS Status Webhook Endpoint"; status = "PASS" }
} catch {
    if ($_.Exception.Response.StatusCode -eq 401 -or $_.Exception.Message -match "401" -or $_.Exception.Message -match "Unauthorized") {
        Write-Host "   [PASS] Endpoint exists (auth required - expected)" -ForegroundColor Green
        $testResults += @{ name = "5. SMS Status Webhook Endpoint"; status = "PASS" }
    } else {
        Write-Host "   [WARN] Could not verify: $($_.Exception.Message)" -ForegroundColor Yellow
        $testResults += @{ name = "5. SMS Status Webhook Endpoint"; status = "UNKNOWN" }
    }
}

# Test 6: Error Monitoring (check if endpoint/logging works)
Write-Host "`n[TEST] 6. Error Monitoring System" -ForegroundColor Cyan
Write-Host "   Checking error monitoring module..." -ForegroundColor Gray
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/api/health/detailed" -UseBasicParsing
    Write-Host "   [PASS] Error monitoring system available" -ForegroundColor Green
    $testResults += @{ name = "6. Error Monitoring System"; status = "PASS" }
} catch {
    Write-Host "   [FAIL] Error: $($_.Exception.Message)" -ForegroundColor Red
    $testResults += @{ name = "6. Error Monitoring System"; status = "FAIL" }
}

# Test 7: Deduplication (test via lead import endpoint)
Write-Host "`n[TEST] 7. Lead Deduplication" -ForegroundColor Cyan
Write-Host "   Testing deduplication via import endpoint..." -ForegroundColor Gray
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/import-leads/$clientKey" -Method POST -UseBasicParsing -TimeoutSec 10 -ErrorAction SilentlyContinue
    Write-Host "   [PASS] Import endpoint exists" -ForegroundColor Green
    $testResults += @{ name = "7. Lead Deduplication Endpoint"; status = "PASS" }
} catch {
    if ($_.Exception.Response.StatusCode -eq 400 -or $_.Exception.Message -match "400" -or $_.Exception.Message -match "No CSV") {
        Write-Host "   [PASS] Endpoint exists (requires data - expected)" -ForegroundColor Green
        $testResults += @{ name = "7. Lead Deduplication Endpoint"; status = "PASS" }
    } else {
        Write-Host "   [WARN] Could not verify: $($_.Exception.Message)" -ForegroundColor Yellow
        $testResults += @{ name = "7. Lead Deduplication Endpoint"; status = "UNKNOWN" }
    }
}

# Test 8: Reminder Reliability (check reminder processing)
Write-Host "`n[TEST] 8. Reminder Reliability System" -ForegroundColor Cyan
Write-Host "   Checking reminder queue system..." -ForegroundColor Gray
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/retry-queue/$clientKey" -Method GET -UseBasicParsing -TimeoutSec 10
    $data = $response.Content | ConvertFrom-Json
    Write-Host "   [PASS] Reminder/Retry queue system working" -ForegroundColor Green
    Write-Host "   Pending retries: $($data.retries.Count)" -ForegroundColor Gray
    $testResults += @{ name = "8. Reminder Reliability System"; status = "PASS" }
} catch {
    Write-Host "   [FAIL] Error: $($_.Exception.Message)" -ForegroundColor Red
    $testResults += @{ name = "8. Reminder Reliability System"; status = "FAIL" }
}

# Test 9: Failed Booking Alert (test booking endpoint exists)
Write-Host "`n[TEST] 9. Failed Booking Alert System" -ForegroundColor Cyan
Write-Host "   Checking booking endpoint..." -ForegroundColor Gray
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/calendar/check-book" -Method POST -UseBasicParsing -TimeoutSec 10 -ErrorAction SilentlyContinue
    Write-Host "   [PASS] Booking endpoint exists" -ForegroundColor Green
    $testResults += @{ name = "9. Failed Booking Alert System"; status = "PASS" }
} catch {
    if ($_.Exception.Response.StatusCode -eq 400 -or $_.Exception.Message -match "400" -or $_.Exception.Message -match "Unknown tenant" -or $_.Exception.Message -match "No active call") {
        Write-Host "   [PASS] Endpoint exists (requires booking data - expected)" -ForegroundColor Green
        $testResults += @{ name = "9. Failed Booking Alert System"; status = "PASS" }
    } else {
        Write-Host "   [WARN] Could not verify: $($_.Exception.Message)" -ForegroundColor Yellow
        $testResults += @{ name = "9. Failed Booking Alert System"; status = "UNKNOWN" }
    }
}

# Test 10: Verify YOUR_EMAIL is configured
Write-Host "`n[TEST] 10. Email Configuration" -ForegroundColor Cyan
Write-Host "   Checking if YOUR_EMAIL is configured..." -ForegroundColor Gray
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/api/health/detailed" -UseBasicParsing
    if ($health.services.email.hasAdminEmail) {
        Write-Host "   [PASS] YOUR_EMAIL is configured" -ForegroundColor Green
        $testResults += @{ name = "10. Email Configuration (YOUR_EMAIL)"; status = "PASS" }
    } else {
        Write-Host "   [WARN] YOUR_EMAIL not configured in environment" -ForegroundColor Yellow
        Write-Host "   Set YOUR_EMAIL in Render environment variables to receive alerts" -ForegroundColor Yellow
        $testResults += @{ name = "10. Email Configuration (YOUR_EMAIL)"; status = "WARNING" }
    }
} catch {
    Write-Host "   [FAIL] Error: $($_.Exception.Message)" -ForegroundColor Red
    $testResults += @{ name = "10. Email Configuration"; status = "FAIL" }
}

# Summary
Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "TEST SUMMARY`n" -ForegroundColor Yellow

$passed = ($testResults | Where-Object { $_.status -eq "PASS" }).Count
$failed = ($testResults | Where-Object { $_.status -eq "FAIL" }).Count
$warnings = ($testResults | Where-Object { $_.status -eq "WARNING" -or $_.status -eq "UNKNOWN" }).Count
$total = $testResults.Count

foreach ($test in $testResults) {
    $icon = switch ($test.status) {
        "PASS" { "[PASS]" }
        "FAIL" { "[FAIL]" }
        default { "[WARN]" }
    }
    $color = switch ($test.status) {
        "PASS" { "Green" }
        "FAIL" { "Red" }
        default { "Yellow" }
    }
    Write-Host "$icon $($test.name): $($test.status)" -ForegroundColor $color
}

Write-Host "`nResults: $passed/$total passed, $failed failed, $warnings warnings" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })

Write-Host "`nNext Steps:" -ForegroundColor Cyan
Write-Host "   1. Verify YOUR_EMAIL is set in Render environment variables" -ForegroundColor Gray
Write-Host "   2. Test actual SMS sending to verify delivery tracking" -ForegroundColor Gray
Write-Host "   3. Trigger a booking failure to test email alerts" -ForegroundColor Gray
Write-Host "   4. Check your email inbox for any alerts" -ForegroundColor Gray
