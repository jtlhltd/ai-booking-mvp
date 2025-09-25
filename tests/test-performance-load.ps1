# Performance and Load Testing Script
# Tests system performance under various loads

Write-Host "⚡ Performance and Load Testing" -ForegroundColor Cyan
Write-Host "===============================" -ForegroundColor Cyan

$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = "ad34b1de00c5b7380d6a447abcd78874"

# Performance tracking
$performanceResults = @()

function Measure-ResponseTime {
    param(
        [string]$Name,
        [string]$Url,
        [string]$Method = "GET",
        [hashtable]$Headers = @{},
        [string]$Body = $null
    )
    
    $startTime = Get-Date
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
        $endTime = Get-Date
        $responseTime = ($endTime - $startTime).TotalMilliseconds
        
        $result = @{
            Name = $Name
            Url = $Url
            ResponseTime = $responseTime
            Success = $true
            Error = $null
        }
        
        $performanceResults += $result
        
        if ($responseTime -lt 1000) {
            Write-Host "✅ $Name - ${responseTime}ms" -ForegroundColor Green
        } elseif ($responseTime -lt 3000) {
            Write-Host "⚠️ $Name - ${responseTime}ms" -ForegroundColor Yellow
        } else {
            Write-Host "❌ $Name - ${responseTime}ms (slow)" -ForegroundColor Red
        }
        
        return $response
    }
    catch {
        $endTime = Get-Date
        $responseTime = ($endTime - $startTime).TotalMilliseconds
        
        $result = @{
            Name = $Name
            Url = $Url
            ResponseTime = $responseTime
            Success = $false
            Error = $_.Exception.Message
        }
        
        $performanceResults += $result
        
        Write-Host "❌ $Name - Failed after ${responseTime}ms: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# ============================================================================
# TEST 1: SINGLE REQUEST PERFORMANCE
# ============================================================================
Write-Host "`n🔍 TEST 1: Single Request Performance" -ForegroundColor Magenta
Write-Host "====================================" -ForegroundColor Magenta

$endpoints = @(
    @{ Name = "Health Check"; Url = "$baseUrl/admin/system-health" },
    @{ Name = "Metrics"; Url = "$baseUrl/admin/metrics"; Headers = @{"X-API-Key" = $apiKey} },
    @{ Name = "Main Dashboard"; Url = "$baseUrl/" },
    @{ Name = "Tenant Dashboard"; Url = "$baseUrl/tenant-dashboard" },
    @{ Name = "Onboarding Wizard"; Url = "$baseUrl/onboarding-wizard" },
    @{ Name = "Client Dashboard"; Url = "$baseUrl/client-dashboard" },
    @{ Name = "Tenant List"; Url = "$baseUrl/admin/tenants"; Headers = @{"X-API-Key" = $apiKey} },
    @{ Name = "Lead Scoring"; Url = "$baseUrl/admin/lead-score"; Headers = @{"X-API-Key" = $apiKey} }
)

foreach ($endpoint in $endpoints) {
    Measure-ResponseTime -Name $endpoint.Name -Url $endpoint.Url -Headers $endpoint.Headers
    Start-Sleep -Milliseconds 500
}

# ============================================================================
# TEST 2: CONCURRENT REQUESTS
# ============================================================================
Write-Host "`n🔄 TEST 2: Concurrent Requests" -ForegroundColor Magenta
Write-Host "============================" -ForegroundColor Magenta

$concurrentJobs = @()

# Start 10 concurrent requests to metrics endpoint
for ($i = 1; $i -le 10; $i++) {
    $job = Start-Job -ScriptBlock {
        param($url, $apiKey, $jobId)
        try {
            $startTime = Get-Date
            $response = Invoke-RestMethod -Uri $url -Headers @{"X-API-Key" = $apiKey} -TimeoutSec 30
            $endTime = Get-Date
            $responseTime = ($endTime - $startTime).TotalMilliseconds
            return @{
                JobId = $jobId
                Success = $true
                ResponseTime = $responseTime
                Error = $null
            }
        }
        catch {
            $endTime = Get-Date
            $responseTime = ($endTime - $startTime).TotalMilliseconds
            return @{
                JobId = $jobId
                Success = $false
                ResponseTime = $responseTime
                Error = $_.Exception.Message
            }
        }
    } -ArgumentList "$baseUrl/admin/metrics", $apiKey, $i
    
    $concurrentJobs += $job
}

Write-Host "`nWaiting for concurrent requests to complete..."
$concurrentResults = $concurrentJobs | Wait-Job | Receive-Job
$concurrentJobs | Remove-Job

$successCount = ($concurrentResults | Where-Object { $_.Success }).Count
$totalCount = $concurrentResults.Count
$avgResponseTime = ($concurrentResults | Measure-Object -Property ResponseTime -Average).Average

Write-Host "Concurrent Requests Results:" -ForegroundColor Yellow
Write-Host "  Success Rate: $successCount/$totalCount ($([math]::Round(($successCount/$totalCount)*100, 1))%)" -ForegroundColor $(if ($successCount -eq $totalCount) { "Green" } else { "Yellow" })
Write-Host "  Average Response Time: $([math]::Round($avgResponseTime, 0))ms" -ForegroundColor $(if ($avgResponseTime -lt 2000) { "Green" } elseif ($avgResponseTime -lt 5000) { "Yellow" } else { "Red" })

# ============================================================================
# TEST 3: SMS LOAD TESTING
# ============================================================================
Write-Host "`n📱 TEST 3: SMS Load Testing" -ForegroundColor Magenta
Write-Host "===========================" -ForegroundColor Magenta

$smsLoadJobs = @()

# Send 20 SMS messages concurrently
for ($i = 1; $i -le 20; $i++) {
    $smsData = @{
        Body = "Test message $i"
        From = "+447491683261"
        To = "+447403934440"
        MessageSid = "load_test_$i"
        MessagingServiceSid = "MG1234567890abcdef1234567890abcdef"
    } | ConvertTo-Json
    
    $job = Start-Job -ScriptBlock {
        param($url, $body, $jobId)
        try {
            $startTime = Get-Date
            $response = Invoke-RestMethod -Uri $url -Method POST -Body $body -ContentType "application/json" -TimeoutSec 30
            $endTime = Get-Date
            $responseTime = ($endTime - $startTime).TotalMilliseconds
            return @{
                JobId = $jobId
                Success = $true
                ResponseTime = $responseTime
                Error = $null
            }
        }
        catch {
            $endTime = Get-Date
            $responseTime = ($endTime - $startTime).TotalMilliseconds
            return @{
                JobId = $jobId
                Success = $false
                ResponseTime = $responseTime
                Error = $_.Exception.Message
            }
        }
    } -ArgumentList "$baseUrl/webhook/sms/inbound", $smsData, $i
    
    $smsLoadJobs += $job
}

Write-Host "`nWaiting for SMS load test to complete..."
$smsResults = $smsLoadJobs | Wait-Job | Receive-Job
$smsLoadJobs | Remove-Job

$smsSuccessCount = ($smsResults | Where-Object { $_.Success }).Count
$smsTotalCount = $smsResults.Count
$smsAvgResponseTime = ($smsResults | Measure-Object -Property ResponseTime -Average).Average

Write-Host "SMS Load Test Results:" -ForegroundColor Yellow
Write-Host "  Success Rate: $smsSuccessCount/$smsTotalCount ($([math]::Round(($smsSuccessCount/$smsTotalCount)*100, 1))%)" -ForegroundColor $(if ($smsSuccessCount -eq $smsTotalCount) { "Green" } else { "Yellow" })
Write-Host "  Average Response Time: $([math]::Round($smsAvgResponseTime, 0))ms" -ForegroundColor $(if ($smsAvgResponseTime -lt 2000) { "Green" } elseif ($smsAvgResponseTime -lt 5000) { "Yellow" } else { "Red" })

# ============================================================================
# TEST 4: CLIENT CREATION PERFORMANCE
# ============================================================================
Write-Host "`n👥 TEST 4: Client Creation Performance" -ForegroundColor Magenta
Write-Host "=====================================" -ForegroundColor Magenta

$clientCreationJobs = @()

# Create 5 clients concurrently
for ($i = 1; $i -le 5; $i++) {
    $clientData = @{
        basic = @{
            clientName = "Load Test Client $i"
            industry = "Technology"
            businessType = "Consulting"
            location = "London, UK"
            website = "https://loadtest$i.com"
            contactEmail = "test$i@loadtest.com"
            contactPhone = "+44712345678$i"
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
            emailFromAddress = "bookings@loadtest$i.com"
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
    
    $job = Start-Job -ScriptBlock {
        param($url, $body, $apiKey, $jobId)
        try {
            $startTime = Get-Date
            $response = Invoke-RestMethod -Uri $url -Method POST -Headers @{"X-API-Key" = $apiKey} -Body $body -ContentType "application/json" -TimeoutSec 30
            $endTime = Get-Date
            $responseTime = ($endTime - $startTime).TotalMilliseconds
            return @{
                JobId = $jobId
                Success = $true
                ResponseTime = $responseTime
                Error = $null
            }
        }
        catch {
            $endTime = Get-Date
            $responseTime = ($endTime - $startTime).TotalMilliseconds
            return @{
                JobId = $jobId
                Success = $false
                ResponseTime = $responseTime
                Error = $_.Exception.Message
            }
        }
    } -ArgumentList "$baseUrl/api/create-client", $clientData, $apiKey, $i
    
    $clientCreationJobs += $job
}

Write-Host "`nWaiting for client creation test to complete..."
$clientResults = $clientCreationJobs | Wait-Job | Receive-Job
$clientCreationJobs | Remove-Job

$clientSuccessCount = ($clientResults | Where-Object { $_.Success }).Count
$clientTotalCount = $clientResults.Count
$clientAvgResponseTime = ($clientResults | Measure-Object -Property ResponseTime -Average).Average

Write-Host "Client Creation Test Results:" -ForegroundColor Yellow
Write-Host "  Success Rate: $clientSuccessCount/$clientTotalCount ($([math]::Round(($clientSuccessCount/$clientTotalCount)*100, 1))%)" -ForegroundColor $(if ($clientSuccessCount -eq $clientTotalCount) { "Green" } else { "Yellow" })
Write-Host "  Average Response Time: $([math]::Round($clientAvgResponseTime, 0))ms" -ForegroundColor $(if ($clientAvgResponseTime -lt 5000) { "Green" } elseif ($clientAvgResponseTime -lt 10000) { "Yellow" } else { "Red" })

# ============================================================================
# TEST 5: MEMORY AND RESOURCE USAGE
# ============================================================================
Write-Host "`n💾 TEST 5: Memory and Resource Usage" -ForegroundColor Magenta
Write-Host "===================================" -ForegroundColor Magenta

# Test system health multiple times to check for memory leaks
Write-Host "`nTesting system health over time..."
$healthResults = @()

for ($i = 1; $i -le 10; $i++) {
    $result = Measure-ResponseTime -Name "Health Check $i" -Url "$baseUrl/admin/system-health"
    $healthResults += $result
    Start-Sleep -Seconds 2
}

$healthResponseTimes = $healthResults | Where-Object { $_.Success } | ForEach-Object { $_.ResponseTime }
$minResponseTime = ($healthResponseTimes | Measure-Object -Minimum).Minimum
$maxResponseTime = ($healthResponseTimes | Measure-Object -Maximum).Maximum
$avgResponseTime = ($healthResponseTimes | Measure-Object -Average).Average

Write-Host "`nSystem Health Over Time:" -ForegroundColor Yellow
Write-Host "  Min Response Time: $([math]::Round($minResponseTime, 0))ms" -ForegroundColor White
Write-Host "  Max Response Time: $([math]::Round($maxResponseTime, 0))ms" -ForegroundColor White
Write-Host "  Average Response Time: $([math]::Round($avgResponseTime, 0))ms" -ForegroundColor White
Write-Host "  Response Time Variance: $([math]::Round($maxResponseTime - $minResponseTime, 0))ms" -ForegroundColor $(if (($maxResponseTime - $minResponseTime) -lt 1000) { "Green" } else { "Yellow" })

# ============================================================================
# PERFORMANCE SUMMARY
# ============================================================================
Write-Host "`n📊 PERFORMANCE SUMMARY" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Cyan

$successfulTests = $performanceResults | Where-Object { $_.Success }
$failedTests = $performanceResults | Where-Object { -not $_.Success }

if ($successfulTests.Count -gt 0) {
    $avgResponseTime = ($successfulTests | Measure-Object -Property ResponseTime -Average).Average
    $minResponseTime = ($successfulTests | Measure-Object -Property ResponseTime -Minimum).Minimum
    $maxResponseTime = ($successfulTests | Measure-Object -Property ResponseTime -Maximum).Maximum
    
    Write-Host "`nOverall Performance:" -ForegroundColor Yellow
    Write-Host "  Total Tests: $($performanceResults.Count)" -ForegroundColor White
    Write-Host "  Successful: $($successfulTests.Count)" -ForegroundColor Green
    Write-Host "  Failed: $($failedTests.Count)" -ForegroundColor Red
    Write-Host "  Success Rate: $([math]::Round(($successfulTests.Count/$performanceResults.Count)*100, 1))%" -ForegroundColor $(if (($successfulTests.Count/$performanceResults.Count) -ge 0.9) { "Green" } elseif (($successfulTests.Count/$performanceResults.Count) -ge 0.7) { "Yellow" } else { "Red" })
    Write-Host "  Average Response Time: $([math]::Round($avgResponseTime, 0))ms" -ForegroundColor White
    Write-Host "  Min Response Time: $([math]::Round($minResponseTime, 0))ms" -ForegroundColor White
    Write-Host "  Max Response Time: $([math]::Round($maxResponseTime, 0))ms" -ForegroundColor White
}

Write-Host "`n🎯 Performance Recommendations:" -ForegroundColor Cyan
if ($avgResponseTime -lt 1000) {
    Write-Host "✅ Excellent performance! Response times are very fast." -ForegroundColor Green
} elseif ($avgResponseTime -lt 3000) {
    Write-Host "⚠️ Good performance, but consider optimization for better user experience." -ForegroundColor Yellow
} else {
    Write-Host "❌ Performance needs improvement. Consider caching, database optimization, or scaling." -ForegroundColor Red
}

if ($failedTests.Count -gt 0) {
    Write-Host "`n❌ Failed Tests:" -ForegroundColor Red
    foreach ($test in $failedTests) {
        Write-Host "  - $($test.Name): $($test.Error)" -ForegroundColor Red
    }
}

Write-Host "`n🎉 Performance Testing Complete!" -ForegroundColor Green
