# Simple Test Runner
# Runs all simple tests without special characters

Write-Host "AI Booking MVP - Simple Test Suite" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

$testSuites = @(
    @{
        Name = "Basic System Test"
        Script = "test-simple.ps1"
        Description = "Essential system checks"
    },
    @{
        Name = "SMS Test"
        Script = "test-sms-simple.ps1"
        Description = "SMS functionality testing"
    },
    @{
        Name = "Client Creation Test"
        Script = "test-client-simple.ps1"
        Description = "Client onboarding testing"
    },
    @{
        Name = "Performance Test"
        Script = "test-performance-simple.ps1"
        Description = "System performance testing"
    }
)

Write-Host "`nAvailable Test Suites:" -ForegroundColor Yellow
foreach ($suite in $testSuites) {
    Write-Host "  - $($suite.Name)" -ForegroundColor White
    Write-Host "    $($suite.Description)" -ForegroundColor Gray
}

Write-Host "`nStarting test execution..." -ForegroundColor Yellow

$results = @{
    Total = 0
    Passed = 0
    Failed = 0
}

foreach ($suite in $testSuites) {
    $results.Total++
    
    Write-Host "`n" + "="*50 -ForegroundColor Cyan
    Write-Host "Running: $($suite.Name)" -ForegroundColor Cyan
    Write-Host "="*50 -ForegroundColor Cyan
    
    if (Test-Path $suite.Script) {
        try {
            Write-Host "`nExecuting $($suite.Script)..." -ForegroundColor Yellow
            & ".\$($suite.Script)"
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "`nPASS: $($suite.Name) completed successfully" -ForegroundColor Green
                $results.Passed++
            } else {
                Write-Host "`nFAIL: $($suite.Name) failed with exit code $LASTEXITCODE" -ForegroundColor Red
                $results.Failed++
            }
        }
        catch {
            Write-Host "`nFAIL: $($suite.Name) failed with error: $($_.Exception.Message)" -ForegroundColor Red
            $results.Failed++
        }
    } else {
        Write-Host "`nERROR: $($suite.Name) script not found: $($suite.Script)" -ForegroundColor Red
        $results.Failed++
    }
    
    Write-Host "`nPress any key to continue to next test suite..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

# Final Results
Write-Host "`n" + "="*50 -ForegroundColor Cyan
Write-Host "FINAL TEST RESULTS" -ForegroundColor Cyan
Write-Host "="*50 -ForegroundColor Cyan

Write-Host "`nTotal Test Suites: $($results.Total)" -ForegroundColor White
Write-Host "Passed: $($results.Passed)" -ForegroundColor Green
Write-Host "Failed: $($results.Failed)" -ForegroundColor Red

$successRate = if ($results.Total -gt 0) { [math]::Round(($results.Passed / $results.Total) * 100, 1) } else { 0 }
Write-Host "Success Rate: $successRate%" -ForegroundColor $(if ($successRate -ge 90) { "Green" } elseif ($successRate -ge 70) { "Yellow" } else { "Red" })

if ($results.Failed -eq 0) {
    Write-Host "`nALL TESTS PASSED! Your system is working perfectly!" -ForegroundColor Green
} else {
    Write-Host "`nSome tests failed. Check the output above for details." -ForegroundColor Yellow
}

Write-Host "`nNext Steps:" -ForegroundColor Cyan
Write-Host "1. Review any failed tests above" -ForegroundColor White
Write-Host "2. Check Render logs for errors" -ForegroundColor White
Write-Host "3. Test manually in your browser" -ForegroundColor White
Write-Host "4. Check your database for new data" -ForegroundColor White

Write-Host "`nTesting Complete!" -ForegroundColor Green
