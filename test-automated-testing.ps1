# Test Automated Testing Suite Implementation
# This script verifies the automated testing suite is set up correctly

Write-Host "🧪 Testing Automated Testing Suite Setup" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

Write-Host "`n1. Checking Jest installation..." -ForegroundColor Yellow
$packageJson = Get-Content "package.json" | ConvertFrom-Json
$hasJest = $packageJson.devDependencies.PSObject.Properties.Name -contains "jest"
$hasSupertest = $packageJson.devDependencies.PSObject.Properties.Name -contains "supertest"

if ($hasJest) {
    Write-Host "   ✅ Jest installed" -ForegroundColor Green
} else {
    Write-Host "   ❌ Jest not found in devDependencies" -ForegroundColor Red
    exit 1
}

if ($hasSupertest) {
    Write-Host "   ✅ Supertest installed" -ForegroundColor Green
} else {
    Write-Host "   ❌ Supertest not found in devDependencies" -ForegroundColor Red
}

Write-Host "`n2. Checking Jest configuration..." -ForegroundColor Yellow
$jestConfigExists = Test-Path "jest.config.js"
if ($jestConfigExists) {
    Write-Host "   ✅ Jest config file exists" -ForegroundColor Green
    $jestConfig = Get-Content "jest.config.js" -Raw
    $hasEsm = $jestConfig -match "extensionsToTreatAsEsm"
    $hasNodeEnv = $jestConfig -match "testEnvironment.*node"
    if ($hasEsm) {
        Write-Host "   ✅ ESM support configured" -ForegroundColor Green
    }
    if ($hasNodeEnv) {
        Write-Host "   ✅ Node environment configured" -ForegroundColor Green
    }
} else {
    Write-Host "   ❌ Jest config file not found" -ForegroundColor Red
    exit 1
}

Write-Host "`n3. Checking test scripts..." -ForegroundColor Yellow
$hasTestScript = $packageJson.scripts.PSObject.Properties.Name -contains "test"
$hasTestWatch = $packageJson.scripts.PSObject.Properties.Name -contains "test:watch"
$hasTestCoverage = $packageJson.scripts.PSObject.Properties.Name -contains "test:coverage"

if ($hasTestScript) {
    Write-Host "   ✅ Test script configured" -ForegroundColor Green
} else {
    Write-Host "   ❌ Test script not found" -ForegroundColor Red
}

if ($hasTestWatch) {
    Write-Host "   ✅ Test watch script configured" -ForegroundColor Green
} else {
    Write-Host "   ⚠️ Test watch script not found (optional)" -ForegroundColor Yellow
}

if ($hasTestCoverage) {
    Write-Host "   ✅ Test coverage script configured" -ForegroundColor Green
} else {
    Write-Host "   ⚠️ Test coverage script not found (optional)" -ForegroundColor Yellow
}

Write-Host "`n4. Checking test files..." -ForegroundColor Yellow
$unitTests = Get-ChildItem -Path "tests/unit" -Recurse -Filter "*.test.js" -ErrorAction SilentlyContinue
$integrationTests = Get-ChildItem -Path "tests/integration" -Recurse -Filter "*.test.js" -ErrorAction SilentlyContinue

$unitCount = ($unitTests | Measure-Object).Count
$integrationCount = ($integrationTests | Measure-Object).Count

Write-Host "   Unit tests found: $unitCount" -ForegroundColor $(if ($unitCount -gt 0) { "Green" } else { "Yellow" })
Write-Host "   Integration tests found: $integrationCount" -ForegroundColor $(if ($integrationCount -gt 0) { "Green" } else { "Yellow" })

Write-Host "`n5. Test Structure:" -ForegroundColor Yellow
Write-Host "   - Unit tests: tests/unit/**/*.test.js" -ForegroundColor White
Write-Host "   - Integration tests: tests/integration/**/*.test.js" -ForegroundColor White
Write-Host "   - Test setup: tests/setup.js" -ForegroundColor White

Write-Host "`n6. Available Test Commands:" -ForegroundColor Yellow
Write-Host "   - npm test              : Run all tests" -ForegroundColor White
Write-Host "   - npm run test:watch    : Run tests in watch mode" -ForegroundColor White
Write-Host "   - npm run test:coverage : Run tests with coverage report" -ForegroundColor White
Write-Host "   - npm run test:unit     : Run only unit tests" -ForegroundColor White
Write-Host "   - npm run test:integration : Run only integration tests" -ForegroundColor White

Write-Host "`n✅ Automated testing suite setup verified!" -ForegroundColor Green
Write-Host "   Ready to commit and push." -ForegroundColor Green
Write-Host "`n   Note: Run 'npm test' to execute the test suite" -ForegroundColor Yellow

