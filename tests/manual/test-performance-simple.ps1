# Simple Performance Test
# Tests system performance without special characters

Write-Host "Performance Test" -ForegroundColor Cyan
Write-Host "===============" -ForegroundColor Cyan

$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = "ad34b1de00c5b7380d6a447abcd78874"

function Test-ResponseTime {
    param(
        [string]$Name,
        [string]$Url,
        [hashtable]$Headers = @{}
    )
    
    $startTime = Get-Date
    try {
        $response = Invoke-RestMethod -Uri $Url -Headers $Headers -TimeoutSec 30
        $endTime = Get-Date
        $responseTime = ($endTime - $startTime).TotalMilliseconds
        
        if ($responseTime -lt 1000) {
            Write-Host "PASS: $Name - ${responseTime}ms" -ForegroundColor Green
        } elseif ($responseTime -lt 3000) {
            Write-Host "SLOW: $Name - ${responseTime}ms" -ForegroundColor Yellow
        } else {
            Write-Host "FAIL: $Name - ${responseTime}ms (too slow)" -ForegroundColor Red
        }
        
        return $responseTime
    }
    catch {
        $endTime = Get-Date
        $responseTime = ($endTime - $startTime).TotalMilliseconds
        Write-Host "FAIL: $Name - Failed after ${responseTime}ms: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

Write-Host "`nTesting response times..." -ForegroundColor Yellow

$responseTimes = @()

# Test main endpoints
$responseTimes += Test-ResponseTime -Name "Health Check" -Url "$baseUrl/admin/system-health" -Headers @{"X-API-Key" = $apiKey}
$responseTimes += Test-ResponseTime -Name "Metrics" -Url "$baseUrl/admin/metrics" -Headers @{"X-API-Key" = $apiKey}
$responseTimes += Test-ResponseTime -Name "Main Dashboard" -Url "$baseUrl/"
$responseTimes += Test-ResponseTime -Name "Tenant Dashboard" -Url "$baseUrl/tenant-dashboard"
$responseTimes += Test-ResponseTime -Name "Onboarding Wizard" -Url "$baseUrl/onboarding-wizard"

# Calculate statistics
$validTimes = $responseTimes | Where-Object { $_ -ne $null }
if ($validTimes.Count -gt 0) {
    $avgTime = ($validTimes | Measure-Object -Average).Average
    $minTime = ($validTimes | Measure-Object -Minimum).Minimum
    $maxTime = ($validTimes | Measure-Object -Maximum).Maximum
    
    Write-Host "`nPerformance Summary:" -ForegroundColor Yellow
    Write-Host "   Average Response Time: $([math]::Round($avgTime, 0))ms" -ForegroundColor White
    Write-Host "   Min Response Time: $([math]::Round($minTime, 0))ms" -ForegroundColor White
    Write-Host "   Max Response Time: $([math]::Round($maxTime, 0))ms" -ForegroundColor White
    Write-Host "   Successful Tests: $($validTimes.Count)" -ForegroundColor White
    
    if ($avgTime -lt 1000) {
        Write-Host "   Performance Rating: EXCELLENT" -ForegroundColor Green
    } elseif ($avgTime -lt 3000) {
        Write-Host "   Performance Rating: GOOD" -ForegroundColor Yellow
    } else {
        Write-Host "   Performance Rating: NEEDS IMPROVEMENT" -ForegroundColor Red
    }
}

Write-Host "`nPerformance Test Complete!" -ForegroundColor Green
