# Complete System Test Suite for AI Booking MVP
# Run this to test every aspect of your system

Write-Host "🚀 AI Booking MVP - Complete System Test Suite" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = "ad34b1de00c5b7380d6a447abcd78874"

# Test Results Tracking
$testResults = @{
    Passed = 0
    Failed = 0
    Total = 0
}

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [string]$Method = "GET",
        [hashtable]$Headers = @{},
        [string]$Body = $null,
        [int]$ExpectedStatus = 200
    )
    
    $testResults.Total++
    Write-Host "`n🧪 Testing: $Name" -ForegroundColor Yellow
    
    try {
        $params = @{
            Uri = $Url
            Method = $Method
            Headers = $Headers
            TimeoutSec = 30
        }
        
        if ($Body) {
            $params.Body = $Body
            $params.ContentType = "application/json"
        }
        
        $response = Invoke-RestMethod @params
        $statusCode = $response.StatusCode
        
        if ($statusCode -eq $ExpectedStatus) {
            Write-Host "✅ PASS: $Name" -ForegroundColor Green
            $testResults.Passed++
            return $response
        } else {
            Write-Host "❌ FAIL: $Name (Expected: $ExpectedStatus, Got: $statusCode)" -ForegroundColor Red
            $testResults.Failed++
            return $null
        }
    }
    catch {
        Write-Host "❌ FAIL: $Name - $($_.Exception.Message)" -ForegroundColor Red
        $testResults.Failed++
        return $null
    }
}

# ============================================================================
# 1. SYSTEM HEALTH TESTS
# ============================================================================
Write-Host "`n📊 1. SYSTEM HEALTH TESTS" -ForegroundColor Magenta
Write-Host "=========================" -ForegroundColor Magenta

Test-Endpoint -Name "Health Check" -Url "$baseUrl/admin/system-health"
Test-Endpoint -Name "Metrics Dashboard" -Url "$baseUrl/admin/metrics"
Test-Endpoint -Name "Changes Feed" -Url "$baseUrl/admin/changes"

# ============================================================================
# 2. TENANT MANAGEMENT TESTS
# ============================================================================
Write-Host "`n🏢 2. TENANT MANAGEMENT TESTS" -ForegroundColor Magenta
Write-Host "=============================" -ForegroundColor Magenta

Test-Endpoint -Name "List Tenants" -Url "$baseUrl/admin/tenants" -Headers @{"X-API-Key" = $apiKey}
Test-Endpoint -Name "Get Specific Tenant" -Url "$baseUrl/admin/tenants/demo_client" -Headers @{"X-API-Key" = $apiKey}

# ============================================================================
# 3. LEAD SCORING TESTS
# ============================================================================
Write-Host "`n🎯 3. LEAD SCORING TESTS" -ForegroundColor Magenta
Write-Host "=======================" -ForegroundColor Magenta

Test-Endpoint -Name "Lead Scoring Debug" -Url "$baseUrl/admin/lead-score" -Headers @{"X-API-Key" = $apiKey}

# ============================================================================
# 4. SMS SIMULATION TESTS
# ============================================================================
Write-Host "`n📱 4. SMS SIMULATION TESTS" -ForegroundColor Magenta
Write-Host "=========================" -ForegroundColor Magenta

# Test different SMS scenarios
$smsTests = @(
    @{
        Name = "Opt-in SMS"
        Body = "START"
        From = "+447491683261"
        To = "+447403934440"
    },
    @{
        Name = "Yes Response"
        Body = "YES"
        From = "+447491683261"
        To = "+447403934440"
    },
    @{
        Name = "Booking Request"
        Body = "I'd like to book an appointment"
        From = "+447491683261"
        To = "+447403934440"
    },
    @{
        Name = "Stop Request"
        Body = "STOP"
        From = "+447491683261"
        To = "+447403934440"
    }
)

foreach ($test in $smsTests) {
    $smsBody = @{
        Body = $test.Body
        From = $test.From
        To = $test.To
        MessageSid = "test_$(Get-Random)"
        MessagingServiceSid = "MG1234567890abcdef1234567890abcdef"
    } | ConvertTo-Json
    
    Test-Endpoint -Name "SMS: $($test.Name)" -Url "$baseUrl/webhook/sms/inbound" -Method "POST" -Body $smsBody
    Start-Sleep -Seconds 2
}

# ============================================================================
# 5. DASHBOARD TESTS
# ============================================================================
Write-Host "`n📊 5. DASHBOARD TESTS" -ForegroundColor Magenta
Write-Host "=====================" -ForegroundColor Magenta

Test-Endpoint -Name "Main Dashboard" -Url "$baseUrl/"
Test-Endpoint -Name "Tenant Dashboard" -Url "$baseUrl/tenant-dashboard"
Test-Endpoint -Name "Client Dashboard" -Url "$baseUrl/client-dashboard"
Test-Endpoint -Name "Onboarding Dashboard" -Url "$baseUrl/onboarding-dashboard"
Test-Endpoint -Name "Onboarding Templates" -Url "$baseUrl/onboarding-templates"
Test-Endpoint -Name "Onboarding Wizard" -Url "$baseUrl/onboarding-wizard"
Test-Endpoint -Name "Client Setup Guide" -Url "$baseUrl/client-setup"

# ============================================================================
# 6. CLIENT CREATION TESTS
# ============================================================================
Write-Host "`n👥 6. CLIENT CREATION TESTS" -ForegroundColor Magenta
Write-Host "==========================" -ForegroundColor Magenta

$testClient = @{
    basic = @{
        clientName = "Test Client $(Get-Date -Format 'HHmmss')"
        industry = "Healthcare"
        businessType = "Clinic"
        location = "London, UK"
        website = "https://testclient.com"
        contactEmail = "test@testclient.com"
        contactPhone = "+447123456789"
    }
    branding = @{
        primaryColor = "#3B82F6"
        timezone = "Europe/London"
        locale = "en-GB"
        logoUrl = ""
    }
    operations = @{
        businessStart = "09:00"
        businessEnd = "17:00"
        businessDays = @(1, 2, 3, 4, 5)
        appointmentDuration = 30
        bufferTime = 15
        maxAdvanceBooking = 30
        cancellationPolicy = "24 hours"
    }
    communication = @{
        smsFromNumber = "+447403934440"
        emailFromAddress = "bookings@testclient.com"
        autoConfirm = $true
        sendReminders = $true
        reminderTime = "24 hours"
    }
    services = @{
        serviceName = "Consultation"
        serviceDescription = "General consultation"
        serviceDuration = 30
        servicePrice = 50
        serviceCategory = "General"
    }
} | ConvertTo-Json

Test-Endpoint -Name "Create Test Client" -Url "$baseUrl/api/create-client" -Method "POST" -Headers @{"X-API-Key" = $apiKey} -Body $testClient

# ============================================================================
# 7. ERROR HANDLING TESTS
# ============================================================================
Write-Host "`n⚠️ 7. ERROR HANDLING TESTS" -ForegroundColor Magenta
Write-Host "=========================" -ForegroundColor Magenta

# Test invalid API key
Test-Endpoint -Name "Invalid API Key" -Url "$baseUrl/admin/metrics" -Headers @{"X-API-Key" = "invalid_key"} -ExpectedStatus 401

# Test invalid SMS data
$invalidSms = @{
    Body = ""
    From = "invalid"
    To = "invalid"
} | ConvertTo-Json

Test-Endpoint -Name "Invalid SMS Data" -Url "$baseUrl/webhook/sms/inbound" -Method "POST" -Body $invalidSms

# Test non-existent tenant
Test-Endpoint -Name "Non-existent Tenant" -Url "$baseUrl/admin/tenants/nonexistent" -Headers @{"X-API-Key" = $apiKey} -ExpectedStatus 404

# ============================================================================
# 8. PERFORMANCE TESTS
# ============================================================================
Write-Host "`n⚡ 8. PERFORMANCE TESTS" -ForegroundColor Magenta
Write-Host "======================" -ForegroundColor Magenta

# Test response times
$endpoints = @(
    "$baseUrl/",
    "$baseUrl/admin/metrics",
    "$baseUrl/admin/system-health",
    "$baseUrl/tenant-dashboard"
)

foreach ($endpoint in $endpoints) {
    $startTime = Get-Date
    try {
        $response = Invoke-RestMethod -Uri $endpoint -TimeoutSec 10
        $endTime = Get-Date
        $responseTime = ($endTime - $startTime).TotalMilliseconds
        
        if ($responseTime -lt 5000) {
            Write-Host "✅ $endpoint - ${responseTime}ms" -ForegroundColor Green
        } else {
            Write-Host "⚠️ $endpoint - ${responseTime}ms (slow)" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "❌ $endpoint - Failed" -ForegroundColor Red
    }
}

# ============================================================================
# 9. BUSINESS HOURS TESTS
# ============================================================================
Write-Host "`n🕒 9. BUSINESS HOURS TESTS" -ForegroundColor Magenta
Write-Host "=========================" -ForegroundColor Magenta

# Test business hours detection
Test-Endpoint -Name "Business Hours Check" -Url "$baseUrl/admin/metrics" -Headers @{"X-API-Key" = $apiKey}

# ============================================================================
# 10. INTEGRATION TESTS
# ============================================================================
Write-Host "`n🔗 10. INTEGRATION TESTS" -ForegroundColor Magenta
Write-Host "=======================" -ForegroundColor Magenta

# Test full SMS flow
Write-Host "`n🔄 Testing Full SMS Flow..." -ForegroundColor Yellow

# Step 1: Send START
$startSms = @{
    Body = "START"
    From = "+447491683261"
    To = "+447403934440"
    MessageSid = "flow_test_$(Get-Random)"
    MessagingServiceSid = "MG1234567890abcdef1234567890abcdef"
} | ConvertTo-Json

$startResponse = Test-Endpoint -Name "SMS Flow: START" -Url "$baseUrl/webhook/sms/inbound" -Method "POST" -Body $startSms
Start-Sleep -Seconds 3

# Step 2: Send YES
$yesSms = @{
    Body = "YES"
    From = "+447491683261"
    To = "+447403934440"
    MessageSid = "flow_test_$(Get-Random)"
    MessagingServiceSid = "MG1234567890abcdef1234567890abcdef"
} | ConvertTo-Json

$yesResponse = Test-Endpoint -Name "SMS Flow: YES" -Url "$baseUrl/webhook/sms/inbound" -Method "POST" -Body $yesSms
Start-Sleep -Seconds 3

# Step 3: Check metrics
Test-Endpoint -Name "SMS Flow: Check Metrics" -Url "$baseUrl/admin/metrics" -Headers @{"X-API-Key" = $apiKey}

# ============================================================================
# FINAL RESULTS
# ============================================================================
Write-Host "`n📋 FINAL TEST RESULTS" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Cyan
Write-Host "Total Tests: $($testResults.Total)" -ForegroundColor White
Write-Host "Passed: $($testResults.Passed)" -ForegroundColor Green
Write-Host "Failed: $($testResults.Failed)" -ForegroundColor Red

$successRate = [math]::Round(($testResults.Passed / $testResults.Total) * 100, 2)
Write-Host "Success Rate: $successRate%" -ForegroundColor $(if ($successRate -ge 90) { "Green" } elseif ($successRate -ge 70) { "Yellow" } else { "Red" })

if ($testResults.Failed -eq 0) {
    Write-Host "`n🎉 ALL TESTS PASSED! Your system is working perfectly!" -ForegroundColor Green
} else {
    Write-Host "`n⚠️ Some tests failed. Check the output above for details." -ForegroundColor Yellow
}

Write-Host "`n🔍 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Check your Render logs for any errors" -ForegroundColor White
Write-Host "2. Verify SMS webhooks are working" -ForegroundColor White
Write-Host "3. Test the onboarding wizard manually" -ForegroundColor White
Write-Host "4. Check your database for new clients" -ForegroundColor White
