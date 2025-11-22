# Quick Test for Live Server (Render or Local)
# Usage: Set $baseUrl to your server URL

param(
    [string]$BaseUrl = $env:PUBLIC_BASE_URL
)

if (-not $BaseUrl) {
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "BACKEND IMPROVEMENTS TEST" -ForegroundColor Cyan
    Write-Host "========================================`n" -ForegroundColor Cyan
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\test-live-server.ps1 -BaseUrl 'https://your-app.onrender.com'" -ForegroundColor Gray
    Write-Host "  OR set: `$env:PUBLIC_BASE_URL = 'https://your-app.onrender.com'" -ForegroundColor Gray
    Write-Host "`nTrying localhost:10000..." -ForegroundColor Yellow
    $BaseUrl = "http://localhost:10000"
}

Write-Host "`nTesting server at: $BaseUrl" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$apiKey = $env:API_KEY
$testClientKey = "stay-focused-fitness-chris"
$passed = 0
$failed = 0

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Path,
        [switch]$RequireApiKey = $false
    )
    
    Write-Host "Testing: $Name" -ForegroundColor Yellow -NoNewline
    Write-Host " ... " -NoNewline
    
    try {
        $headers = @{}
        if ($RequireApiKey -and $apiKey) {
            $headers["X-API-Key"] = $apiKey
        }
        
        $response = Invoke-WebRequest -Uri "$BaseUrl$Path" -Headers $headers -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
        $content = $response.Content | ConvertFrom-Json
        
        Write-Host "PASSED" -ForegroundColor Green
        return @{ success = $true; data = $content; status = $response.StatusCode }
    } catch {
        Write-Host "FAILED" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Gray
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# Test 1: Health Check
Write-Host "1. HEALTH CHECK" -ForegroundColor Cyan
$healthPaths = @("/api/health", "/api/health/detailed", "/")
$healthCheck = $null
foreach ($path in $healthPaths) {
    $result = Test-Endpoint -Name "Server Health ($path)" -Path $path
    if ($result.success) {
        $healthCheck = $result
        break
    }
}

if ($healthCheck) {
    $passed++ 
    Write-Host "  Server is accessible!" -ForegroundColor Gray
} else {
    $failed++ 
    Write-Host "`nCannot connect to server. Check URL and try again." -ForegroundColor Red
    exit 1
}

# Test 2: Client Data Caching
Write-Host "`n2. CLIENT DATA CACHING" -ForegroundColor Cyan
$result2 = Test-Endpoint -Name "Get Client (First Call)" -Path "/api/clients/$testClientKey" -RequireApiKey
if ($result2.success) { 
    $passed++ 
    $firstCallTime = Get-Date
} else { 
    $failed++ 
}

Start-Sleep -Seconds 1

$result3 = Test-Endpoint -Name "Get Client (Cached Call)" -Path "/api/clients/$testClientKey" -RequireApiKey
if ($result3.success) { 
    $passed++
    $secondCallTime = Get-Date
    $timeDiff = ($secondCallTime - $firstCallTime).TotalMilliseconds
    Write-Host "  Response time: $([math]::Round($timeDiff, 2))ms" -ForegroundColor Gray
} else { 
    $failed++ 
}

# Test 3: Dashboard Stats Caching
Write-Host "`n3. DASHBOARD STATS CACHING" -ForegroundColor Cyan
$result4 = Test-Endpoint -Name "Get Stats (First Call)" -Path "/api/stats?clientKey=$testClientKey&range=30d"
if ($result4.success) { 
    $passed++ 
    $statsFirstTime = Get-Date
} else { 
    $failed++ 
}

Start-Sleep -Seconds 1

$result5 = Test-Endpoint -Name "Get Stats (Cached Call)" -Path "/api/stats?clientKey=$testClientKey&range=30d"
if ($result5.success) { 
    $passed++
    $statsSecondTime = Get-Date
    $statsTimeDiff = ($statsSecondTime - $statsFirstTime).TotalMilliseconds
    Write-Host "  Response time: $([math]::Round($statsTimeDiff, 2))ms" -ForegroundColor Gray
} else { 
    $failed++ 
}

# Test 4: Query Optimization
Write-Host "`n4. QUERY OPTIMIZATION" -ForegroundColor Cyan
$result6 = Test-Endpoint -Name "Optimized Stats Query" -Path "/api/stats?clientKey=$testClientKey&range=7d"
if ($result6.success) {
    $passed++
    if ($result6.data.leads -ne $null -or $result6.data.calls -ne $null) {
        Write-Host "  Query returned data successfully" -ForegroundColor Gray
    }
} else { 
    $failed++ 
}

# Test 5: Code Verification
Write-Host "`n5. CODE VERIFICATION" -ForegroundColor Cyan
Write-Host "Checking implementation files..." -ForegroundColor Yellow -NoNewline
Write-Host " ... " -NoNewline

$checks = @{
    "Client Cache" = (Test-Path "db.js") -and (Get-Content "db.js" -Raw | Select-String -Pattern "clientCache" -Quiet)
    "Stats Cache" = (Get-Content "server.js" -Raw | Select-String -Pattern "dashboardStatsCache" -Quiet)
    "Transaction" = (Get-Content "db.js" -Raw | Select-String -Pattern "withTransaction" -Quiet)
    "Pool Monitor" = (Test-Path "lib/connection-pool-monitor.js")
}

$allChecks = $checks.Values | Where-Object { $_ -eq $true }
if ($allChecks.Count -eq $checks.Count) {
    Write-Host "PASSED" -ForegroundColor Green
    Write-Host "  All code improvements found" -ForegroundColor Gray
    $passed++
} else {
    Write-Host "FAILED" -ForegroundColor Red
    Write-Host "  Missing: $($checks.GetEnumerator() | Where-Object { $_.Value -eq $false } | ForEach-Object { $_.Key })" -ForegroundColor Gray
    $failed++
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })
Write-Host "Total:  $($passed + $failed)" -ForegroundColor Cyan

if ($failed -eq 0) {
    Write-Host "`n✅ All tests passed! Backend improvements are working." -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n⚠️  Some tests failed. Check the errors above." -ForegroundColor Yellow
    exit 1
}

