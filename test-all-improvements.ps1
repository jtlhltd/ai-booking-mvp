# test-all-improvements.ps1
# Comprehensive test script for all service delivery improvements

param(
    [string]$BaseUrl = "http://localhost:10000",
    [string]$ApiKey = $env:API_KEY
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testing All Service Delivery Improvements" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not $ApiKey) {
    Write-Host "ERROR: API_KEY environment variable not set" -ForegroundColor Red
    Write-Host "Please set API_KEY or pass it as a parameter: -ApiKey 'your-key'" -ForegroundColor Yellow
    exit 1
}

$headers = @{
    "X-API-Key" = $ApiKey
    "Content-Type" = "application/json"
}

$testResults = @()

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Path,
        [hashtable]$Body = $null,
        [int]$ExpectedStatus = 200
    )
    
    Write-Host "Testing: $Name" -ForegroundColor Yellow
    
    try {
        $uri = "$BaseUrl$Path"
        $params = @{
            Uri = $uri
            Method = $Method
            Headers = $headers
            TimeoutSec = 30
        }
        
        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
        }
        
        $response = Invoke-WebRequest @params -UseBasicParsing
        $statusCode = $response.StatusCode
        $content = $response.Content | ConvertFrom-Json
        
        if ($statusCode -eq $ExpectedStatus) {
            Write-Host "  PASSED (Status: $statusCode)" -ForegroundColor Green
            $testResults += @{
                Name = $Name
                Status = "PASSED"
                StatusCode = $statusCode
            }
            return $true
        } else {
            Write-Host "  FAILED (Expected: $ExpectedStatus, Got: $statusCode)" -ForegroundColor Red
            $testResults += @{
                Name = $Name
                Status = "FAILED"
                StatusCode = $statusCode
                Expected = $ExpectedStatus
            }
            return $false
        }
    } catch {
        Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
        $testResults += @{
            Name = $Name
            Status = "ERROR"
            Error = $_.Exception.Message
        }
        return $false
    }
}

Write-Host "1. Testing Comprehensive Health Check" -ForegroundColor Cyan
Test-Endpoint -Name "Comprehensive Health" -Method "GET" -Path "/api/health/comprehensive"

Write-Host "`n2. Testing Circuit Breaker Status" -ForegroundColor Cyan
Test-Endpoint -Name "Circuit Breaker Status" -Method "GET" -Path "/api/admin/circuit-breakers"

Write-Host "`n3. Testing Dead Letter Queue" -ForegroundColor Cyan
Test-Endpoint -Name "DLQ List" -Method "GET" -Path "/api/admin/dlq"

Write-Host "`n4. Testing Request Queue Status" -ForegroundColor Cyan
Test-Endpoint -Name "Queue Status" -Method "GET" -Path "/api/admin/queue-status"

Write-Host "`n5. Testing Performance Monitoring" -ForegroundColor Cyan
Test-Endpoint -Name "Slow Queries" -Method "GET" -Path "/api/admin/performance/queries"

Write-Host "`n6. Testing Feature Flags" -ForegroundColor Cyan
Test-Endpoint -Name "Feature Flags" -Method "GET" -Path "/api/admin/feature-flags"

Write-Host "`n7. Testing Basic Health Check" -ForegroundColor Cyan
Test-Endpoint -Name "Basic Health" -Method "GET" -Path "/healthz"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$passed = ($testResults | Where-Object { $_.Status -eq "PASSED" }).Count
$failed = ($testResults | Where-Object { $_.Status -ne "PASSED" }).Count
$total = $testResults.Count

Write-Host "Total Tests: $total" -ForegroundColor White
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })

if ($failed -gt 0) {
    Write-Host "`nFailed Tests:" -ForegroundColor Red
    $testResults | Where-Object { $_.Status -ne "PASSED" } | ForEach-Object {
        Write-Host "  - $($_.Name): $($_.Status)" -ForegroundColor Red
        if ($_.Error) {
            Write-Host "    Error: $($_.Error)" -ForegroundColor Red
        }
    }
    exit 1
} else {
    Write-Host "`nAll tests passed!" -ForegroundColor Green
    exit 0
}
