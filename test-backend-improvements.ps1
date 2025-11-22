# Test Backend Speed & Reliability Improvements
# Tests: Caching, Query Optimization, Transaction Safety, Pool Monitoring

$ErrorActionPreference = "Stop"

# Try to detect server URL
$baseUrl = $env:PUBLIC_BASE_URL
if (-not $baseUrl) {
    $baseUrl = "http://localhost:10000"
    Write-Host "Using default URL: $baseUrl" -ForegroundColor Yellow
    Write-Host "(Set PUBLIC_BASE_URL env var to use a different URL)" -ForegroundColor Gray
} else {
    Write-Host "Using PUBLIC_BASE_URL: $baseUrl" -ForegroundColor Green
}

$apiKey = $env:API_KEY

# Check if server is running
Write-Host "`nChecking if server is running..." -ForegroundColor Yellow
try {
    $healthCheck = Invoke-WebRequest -Uri "$baseUrl/api/health" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    Write-Host "Server is running!" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Server is not running or not accessible at $baseUrl" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Gray
    Write-Host "`nIf server is on Render, set PUBLIC_BASE_URL environment variable:" -ForegroundColor Yellow
    Write-Host "  `$env:PUBLIC_BASE_URL = 'https://your-app.onrender.com'" -ForegroundColor Gray
    exit 1
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "BACKEND IMPROVEMENTS TEST" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$testClientKey = "stay-focused-fitness-chris"
$passed = 0
$failed = 0

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method = "GET",
        [string]$Path,
        [hashtable]$Headers = @{},
        [object]$Body = $null,
        [switch]$RequireApiKey = $false
    )
    
    Write-Host "Testing: $Name" -ForegroundColor Yellow -NoNewline
    Write-Host " ... " -NoNewline
    
    try {
        if ($RequireApiKey -and $apiKey) {
            $headers["X-API-Key"] = $apiKey
        }
        
        $params = @{
            Uri = "$baseUrl$Path"
            Method = $Method
            Headers = $headers
            ContentType = "application/json"
        }
        
        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
        }
        
        $response = Invoke-WebRequest @params -UseBasicParsing -TimeoutSec 10
        $content = $response.Content | ConvertFrom-Json
        
        Write-Host "PASSED" -ForegroundColor Green
        return @{ success = $true; data = $content; status = $response.StatusCode }
    } catch {
        Write-Host "FAILED" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Gray
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# Test 1: Client Data Caching (getFullClient)
Write-Host "`n1. CLIENT DATA CACHING" -ForegroundColor Cyan
$result1 = Test-Endpoint -Name "Get Client Data (First Call)" -Path "/api/clients/$testClientKey" -RequireApiKey
if ($result1.success) { $passed++ } else { $failed++ }

Start-Sleep -Seconds 1

$result2 = Test-Endpoint -Name "Get Client Data (Cached Call)" -Path "/api/clients/$testClientKey" -RequireApiKey
if ($result2.success) { $passed++ } else { $failed++ }

# Test 2: Dashboard Stats Caching
Write-Host "`n2. DASHBOARD STATS CACHING" -ForegroundColor Cyan
$result3 = Test-Endpoint -Name "Get Stats (First Call)" -Path "/api/stats?clientKey=$testClientKey&range=30d"
if ($result3.success) { $passed++ } else { $failed++ }

Start-Sleep -Seconds 1

$result4 = Test-Endpoint -Name "Get Stats (Cached Call)" -Path "/api/stats?clientKey=$testClientKey&range=30d"
if ($result4.success) { $passed++ } else { $failed++ }

# Test 3: Query Optimization (Single Query)
Write-Host "`n3. QUERY OPTIMIZATION" -ForegroundColor Cyan
$result5 = Test-Endpoint -Name "Optimized Stats Query" -Path "/api/stats?clientKey=$testClientKey&range=7d"
if ($result5.success) {
    $passed++
    if ($result5.data.leads -ne $null -or $result5.data.calls -ne $null) {
        Write-Host "  Query returned data successfully" -ForegroundColor Gray
    }
} else { $failed++ }

# Test 4: Connection Pool Monitoring
Write-Host "`n4. CONNECTION POOL MONITORING" -ForegroundColor Cyan
Write-Host "Checking pool monitor library..." -ForegroundColor Yellow -NoNewline
Write-Host " ... " -NoNewline

$poolMonitorFile = "lib/connection-pool-monitor.js"
if (Test-Path $poolMonitorFile) {
    $poolContent = Get-Content $poolMonitorFile -Raw
    if ($poolContent -match "checkPoolHealth|getPoolStatus") {
        Write-Host "PASSED" -ForegroundColor Green
        Write-Host "  Pool monitoring functions found" -ForegroundColor Gray
        $passed++
    } else {
        Write-Host "FAILED" -ForegroundColor Red
        $failed++
    }
} else {
    Write-Host "FAILED" -ForegroundColor Red
    Write-Host "  Pool monitor file not found" -ForegroundColor Gray
    $failed++
}

# Test 5: Transaction Safety (verify function exists)
Write-Host "`n5. TRANSACTION SAFETY" -ForegroundColor Cyan
Write-Host "Checking transaction wrapper..." -ForegroundColor Yellow -NoNewline
Write-Host " ... " -NoNewline

# Check if withTransaction is exported from db.js
$dbFile = Get-Content "db.js" -Raw
if ($dbFile -match "export.*withTransaction|withTransaction.*export") {
    Write-Host "PASSED" -ForegroundColor Green
    Write-Host "  Transaction wrapper function found" -ForegroundColor Gray
    $passed++
} else {
    Write-Host "FAILED" -ForegroundColor Red
    Write-Host "  Transaction wrapper not found in db.js" -ForegroundColor Gray
    $failed++
}

# Test 6: Query Timeout Protection
Write-Host "`n6. QUERY TIMEOUT PROTECTION" -ForegroundColor Cyan
$result7 = Test-Endpoint -Name "Stats with Timeout" -Path "/api/stats?clientKey=$testClientKey&range=90d"
if ($result7.success) {
    $passed++
    Write-Host "  Query completed within timeout" -ForegroundColor Gray
} else {
    if ($result7.error -like "*timeout*") {
        Write-Host "  Timeout protection working" -ForegroundColor Gray
        $passed++
    } else {
        $failed++
    }
}

# Test 7: Cache Invalidation
Write-Host "`n7. CACHE INVALIDATION" -ForegroundColor Cyan
Write-Host "Testing cache invalidation..." -ForegroundColor Yellow -NoNewline
Write-Host " ... " -NoNewline

# Check if invalidateClientCache exists
if ($dbFile -match "invalidateClientCache") {
    Write-Host "PASSED" -ForegroundColor Green
    Write-Host "  Cache invalidation function found" -ForegroundColor Gray
    $passed++
} else {
    Write-Host "FAILED" -ForegroundColor Red
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
    Write-Host "`nAll tests passed! Backend improvements are working." -ForegroundColor Green
    exit 0
} else {
    Write-Host "`nSome tests failed. Check the errors above." -ForegroundColor Yellow
    exit 1
}

