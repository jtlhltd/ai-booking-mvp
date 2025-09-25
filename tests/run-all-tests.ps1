# Master Test Runner
# Runs all test suites in sequence

Write-Host "🧪 AI Booking MVP - Master Test Suite" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

$testSuites = @(
    @{
        Name = "Quick Smoke Test"
        Script = "test-quick-smoke.ps1"
        Description = "Essential system checks"
        Required = $true
    },
    @{
        Name = "Complete System Test"
        Script = "test-complete-system.ps1"
        Description = "Comprehensive functionality testing"
        Required = $true
    },
    @{
        Name = "SMS Scenarios"
        Script = "test-sms-scenarios.ps1"
        Description = "SMS interaction testing"
        Required = $false
    },
    @{
        Name = "Client Onboarding"
        Script = "test-client-onboarding.ps1"
        Description = "Client creation and management"
        Required = $false
    },
    @{
        Name = "Performance & Load"
        Script = "test-performance-load.ps1"
        Description = "Performance and load testing"
        Required = $false
    }
)

$results = @{
    Total = 0
    Passed = 0
    Failed = 0
    Skipped = 0
}

Write-Host "`n📋 Available Test Suites:" -ForegroundColor Yellow
foreach ($suite in $testSuites) {
    $status = if ($suite.Required) { "Required" } else { "Optional" }
    Write-Host "  - $($suite.Name) ($status)" -ForegroundColor White
    Write-Host "    $($suite.Description)" -ForegroundColor Gray
}

Write-Host "`n🚀 Starting test execution..." -ForegroundColor Yellow

foreach ($suite in $testSuites) {
    $results.Total++
    
    Write-Host "`n" + "="*60 -ForegroundColor Cyan
    Write-Host "🧪 Running: $($suite.Name)" -ForegroundColor Cyan
    Write-Host "="*60 -ForegroundColor Cyan
    
    if (Test-Path $suite.Script) {
        try {
            Write-Host "`nExecuting $($suite.Script)..." -ForegroundColor Yellow
            & ".\$($suite.Script)"
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "`n✅ $($suite.Name) completed successfully" -ForegroundColor Green
                $results.Passed++
            } else {
                Write-Host "`n❌ $($suite.Name) failed with exit code $LASTEXITCODE" -ForegroundColor Red
                $results.Failed++
            }
        }
        catch {
            Write-Host "`n❌ $($suite.Name) failed with error: $($_.Exception.Message)" -ForegroundColor Red
            $results.Failed++
        }
    } else {
        Write-Host "`n⚠️ $($suite.Name) script not found: $($suite.Script)" -ForegroundColor Yellow
        $results.Skipped++
    }
    
    Write-Host "`nPress any key to continue to next test suite..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

# Final Results
Write-Host "`n" + "="*60 -ForegroundColor Cyan
Write-Host "📊 FINAL TEST RESULTS" -ForegroundColor Cyan
Write-Host "="*60 -ForegroundColor Cyan

Write-Host "`nTotal Test Suites: $($results.Total)" -ForegroundColor White
Write-Host "Passed: $($results.Passed)" -ForegroundColor Green
Write-Host "Failed: $($results.Failed)" -ForegroundColor Red
Write-Host "Skipped: $($results.Skipped)" -ForegroundColor Yellow

$successRate = if ($results.Total -gt 0) { [math]::Round(($results.Passed / $results.Total) * 100, 1) } else { 0 }
Write-Host "Success Rate: $successRate%" -ForegroundColor $(if ($successRate -ge 90) { "Green" } elseif ($successRate -ge 70) { "Yellow" } else { "Red" })

if ($results.Failed -eq 0) {
    Write-Host "`n🎉 ALL TESTS PASSED! Your system is working perfectly!" -ForegroundColor Green
} else {
    Write-Host "`n⚠️ Some tests failed. Check the output above for details." -ForegroundColor Yellow
}

Write-Host "`n🔍 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Review any failed tests above" -ForegroundColor White
Write-Host "2. Check Render logs for errors" -ForegroundColor White
Write-Host "3. Run individual test scripts for detailed analysis" -ForegroundColor White
Write-Host "4. Test manually using test-manual-checklist.ps1" -ForegroundColor White

Write-Host "`n📁 Test Scripts Available:" -ForegroundColor Cyan
Write-Host "- test-quick-smoke.ps1 (Fast essential checks)" -ForegroundColor White
Write-Host "- test-complete-system.ps1 (Full functionality test)" -ForegroundColor White
Write-Host "- test-sms-scenarios.ps1 (SMS interaction testing)" -ForegroundColor White
Write-Host "- test-client-onboarding.ps1 (Client creation testing)" -ForegroundColor White
Write-Host "- test-performance-load.ps1 (Performance testing)" -ForegroundColor White
Write-Host "- test-manual-checklist.ps1 (Manual testing guide)" -ForegroundColor White

Write-Host "`n🎯 Testing Complete!" -ForegroundColor Green
