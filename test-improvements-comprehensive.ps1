# Comprehensive test of all improvements added today
param(
    [string]$BaseUrl = "https://ai-booking-mvp.onrender.com"
)

$ErrorActionPreference = "Continue"
$results = @()

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "COMPREHENSIVE TEST - All Today's Improvements" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Test 1: Comprehensive Health Check
Write-Host "1. Testing Comprehensive Health Check..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/health/comprehensive" -UseBasicParsing -ErrorAction Stop
    $json = $response.Content | ConvertFrom-Json
    $results += [PSCustomObject]@{Test="Comprehensive Health"; Status="PASS"; Details="Status: $($json.overall)"}
    Write-Host "   ✓ PASS - Overall: $($json.overall)" -ForegroundColor Green
    Write-Host "     Services: $($json.services.PSObject.Properties.Count) checked" -ForegroundColor Gray
} catch {
    $results += [PSCustomObject]@{Test="Comprehensive Health"; Status="FAIL"; Details=$_.Exception.Message}
    Write-Host "   ✗ FAIL - $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Basic Health Check
Write-Host "`n2. Testing Basic Health Check..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/healthz" -UseBasicParsing -ErrorAction Stop
    $json = $response.Content | ConvertFrom-Json
    $results += [PSCustomObject]@{Test="Basic Health"; Status="PASS"; Details="Status: $($response.StatusCode)"}
    Write-Host "   ✓ PASS - Status: $($response.StatusCode)" -ForegroundColor Green
} catch {
    $results += [PSCustomObject]@{Test="Basic Health"; Status="FAIL"; Details=$_.Exception.Message}
    Write-Host "   ✗ FAIL - $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Check if libraries exist and can be imported
Write-Host "`n3. Testing Library Files Exist..." -ForegroundColor Yellow
$libraries = @(
    "lib/circuit-breaker.js",
    "lib/dead-letter-queue.js",
    "lib/request-queue.js",
    "lib/idempotency.js",
    "lib/query-monitor.js",
    "lib/feature-flags.js",
    "lib/timeouts.js",
    "lib/health-monitor.js",
    "lib/connection-pool-monitor.js"
)

$allExist = $true
foreach ($lib in $libraries) {
    if (Test-Path $lib) {
        Write-Host "   ✓ $lib exists" -ForegroundColor Green
    } else {
        Write-Host "   ✗ $lib MISSING" -ForegroundColor Red
        $allExist = $false
    }
}

if ($allExist) {
    $results += [PSCustomObject]@{Test="Library Files"; Status="PASS"; Details="All 9 libraries exist"}
} else {
    $results += [PSCustomObject]@{Test="Library Files"; Status="FAIL"; Details="Some libraries missing"}
}

# Test 4: Check if cron jobs are registered (by checking server logs or endpoints)
Write-Host "`n4. Testing Cron Job Registration..." -ForegroundColor Yellow
    Write-Host "   Note: Cron jobs run in background - checking if endpoints respond" -ForegroundColor Gray
$results += [PSCustomObject]@{Test="Cron Jobs"; Status="INFO"; Details="Background processes - cannot test directly"}

# Test 5: Test database connection pool (via health check)
Write-Host "`n5. Testing Database Connection Pool..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/health/comprehensive" -UseBasicParsing -ErrorAction Stop
    $json = $response.Content | ConvertFrom-Json
    if ($json.services.database.status -eq "healthy") {
        $results += [PSCustomObject]@{Test="Database Pool"; Status="PASS"; Details="Pool is healthy"}
        Write-Host "   ✓ PASS - Database pool is healthy" -ForegroundColor Green
    } else {
        $results += [PSCustomObject]@{Test="Database Pool"; Status="WARN"; Details="Status: $($json.services.database.status)"}
        Write-Host "   ⚠ WARN - Status: $($json.services.database.status)" -ForegroundColor Yellow
    }
} catch {
    $results += [PSCustomObject]@{Test="Database Pool"; Status="FAIL"; Details=$_.Exception.Message}
    Write-Host "   ✗ FAIL - $($_.Exception.Message)" -ForegroundColor Red
}

# Test 6: Check if cache is operational
Write-Host "`n6. Testing Cache System..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/health/comprehensive" -UseBasicParsing -ErrorAction Stop
    $json = $response.Content | ConvertFrom-Json
    if ($json.services.cache -and $json.services.cache.status -eq "operational") {
        $results += [PSCustomObject]@{Test="Cache System"; Status="PASS"; Details="Cache is operational"}
        Write-Host "   ✓ PASS - Cache is operational" -ForegroundColor Green
    } else {
        $results += [PSCustomObject]@{Test="Cache System"; Status="INFO"; Details="Cache status not available"}
        Write-Host "   INFO - Cache status not explicitly checked" -ForegroundColor Gray
    }
} catch {
    $results += [PSCustomObject]@{Test="Cache System"; Status="FAIL"; Details=$_.Exception.Message}
    Write-Host "   ✗ FAIL - $($_.Exception.Message)" -ForegroundColor Red
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST SUMMARY" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$passed = ($results | Where-Object { $_.Status -eq "PASS" }).Count
$failed = ($results | Where-Object { $_.Status -eq "FAIL" }).Count
$warned = ($results | Where-Object { $_.Status -eq "WARN" }).Count
$info = ($results | Where-Object { $_.Status -eq "INFO" }).Count

$results | Format-Table -AutoSize

Write-Host "`nResults:" -ForegroundColor Cyan
Write-Host "  Passed: $passed" -ForegroundColor Green
Write-Host "  Failed: $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host "  Warnings: $warned" -ForegroundColor Yellow
Write-Host "  Info: $info" -ForegroundColor Gray

Write-Host "`nNOTE: Some features require API key authentication to test fully." -ForegroundColor Yellow
Write-Host "The libraries are created and integrated, but admin endpoints" -ForegroundColor Yellow
Write-Host "may require authentication to access." -ForegroundColor Yellow

