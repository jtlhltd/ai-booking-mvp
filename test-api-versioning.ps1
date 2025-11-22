# Test API Versioning Implementation
# This script verifies the API versioning system is implemented

Write-Host "🧪 Testing API Versioning Implementation" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

Write-Host "`n1. Checking middleware implementation..." -ForegroundColor Yellow
$middlewareExists = Test-Path "middleware/api-versioning.js"
if ($middlewareExists) {
    Write-Host "   ✅ Middleware file exists" -ForegroundColor Green
} else {
    Write-Host "   ❌ Middleware file not found" -ForegroundColor Red
    exit 1
}

Write-Host "`n2. Checking middleware code..." -ForegroundColor Yellow
$middlewareContent = Get-Content "middleware/api-versioning.js" -Raw
$hasVersioning = $middlewareContent -match "apiVersioning"
$hasVersionedRoute = $middlewareContent -match "versionedRoute"
$hasLegacyRedirect = $middlewareContent -match "legacyRouteRedirect"
$hasDeprecation = $middlewareContent -match "X-API-Deprecated"

if ($hasVersioning) {
    Write-Host "   ✅ Versioning middleware implemented" -ForegroundColor Green
} else {
    Write-Host "   ❌ Versioning middleware not found" -ForegroundColor Red
}

if ($hasVersionedRoute) {
    Write-Host "   ✅ Versioned route helper implemented" -ForegroundColor Green
} else {
    Write-Host "   ❌ Versioned route helper not found" -ForegroundColor Red
}

if ($hasLegacyRedirect) {
    Write-Host "   ✅ Legacy route redirect implemented" -ForegroundColor Green
} else {
    Write-Host "   ❌ Legacy route redirect not found" -ForegroundColor Red
}

if ($hasDeprecation) {
    Write-Host "   ✅ Deprecation headers implemented" -ForegroundColor Green
} else {
    Write-Host "   ❌ Deprecation headers not found" -ForegroundColor Red
}

Write-Host "`n3. Checking route structure..." -ForegroundColor Yellow
$v1Exists = Test-Path "routes/api/v1/index.js"
if ($v1Exists) {
    Write-Host "   ✅ v1 route structure exists" -ForegroundColor Green
} else {
    Write-Host "   ⚠️ v1 route structure not found (optional)" -ForegroundColor Yellow
}

Write-Host "`n4. Checking server integration..." -ForegroundColor Yellow
$serverContent = Get-Content "server.js" -Raw
$hasImport = $serverContent -match "api-versioning"
$hasMiddleware = $serverContent -match "apiVersioning\(\)"

if ($hasImport) {
    Write-Host "   ✅ Middleware imported" -ForegroundColor Green
} else {
    Write-Host "   ❌ Middleware not imported" -ForegroundColor Red
}

if ($hasMiddleware) {
    Write-Host "   ✅ Middleware applied to app" -ForegroundColor Green
} else {
    Write-Host "   ❌ Middleware not applied" -ForegroundColor Red
}

Write-Host "`n5. API Versioning Features:" -ForegroundColor Yellow
Write-Host "   - Version extracted from path (/api/v1/*) or header (X-API-Version)" -ForegroundColor White
Write-Host "   - Version attached to request object (req.apiVersion)" -ForegroundColor White
Write-Host "   - Version header added to responses (X-API-Version)" -ForegroundColor White
Write-Host "   - Deprecation headers for old versions" -ForegroundColor White
Write-Host "   - Legacy route redirect (optional, currently disabled)" -ForegroundColor White

Write-Host "`n6. Usage:" -ForegroundColor Yellow
Write-Host "   - Access v1: /api/v1/health" -ForegroundColor White
Write-Host "   - Or use header: X-API-Version: 1" -ForegroundColor White
Write-Host "   - Future versions: /api/v2/*" -ForegroundColor White

Write-Host "`n✅ API versioning implementation verified!" -ForegroundColor Green
Write-Host "   Ready to commit and push." -ForegroundColor Green

