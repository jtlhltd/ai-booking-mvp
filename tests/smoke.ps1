param(
  [string]$BaseUrl = "http://localhost:3000",
  [string]$ApiKey = $env:API_KEY
)

$ErrorActionPreference = "Stop"

function Invoke-JsonGet {
  param([string]$Url, [hashtable]$Headers = @{})
  return Invoke-RestMethod -Method GET -Uri $Url -Headers $Headers -TimeoutSec 15
}

Write-Host "Smoke: BaseUrl=$BaseUrl" -ForegroundColor Cyan

# 1) Basic liveness
try {
  $health = Invoke-JsonGet "$BaseUrl/health"
} catch {
  throw ("Cannot reach {0}. Start the server first (e.g. `npm start`) then re-run smoke. Underlying error: {1}" -f $BaseUrl, $_.Exception.Message)
}
if (-not $health.status) { throw "Expected /health JSON with status" }
Write-Host "OK /health status=$($health.status)" -ForegroundColor Green

$healthz = Invoke-JsonGet "$BaseUrl/healthz"
Write-Host "OK /healthz" -ForegroundColor Green

# 2) Public pages should render (simple HEAD/GET)
foreach ($path in @("/", "/onboarding-wizard", "/client-dashboard", "/tenant-dashboard")) {
  try {
    Invoke-WebRequest -Method GET -Uri "$BaseUrl$path" -TimeoutSec 15 | Out-Null
    Write-Host "OK GET $path" -ForegroundColor Green
  } catch {
    throw ("Failed GET {0}: {1}" -f $path, $_.Exception.Message)
  }
}

# 3) Admin/dashboard APIs (if API key provided)
if ($ApiKey) {
  $headers = @{ "X-API-Key" = $ApiKey }
  $sys = Invoke-JsonGet "$BaseUrl/admin/system-health" $headers
  Write-Host "OK /admin/system-health" -ForegroundColor Green

  $metrics = Invoke-JsonGet "$BaseUrl/admin/metrics" $headers
  Write-Host "OK /admin/metrics" -ForegroundColor Green
} else {
  Write-Host "SKIP admin endpoints (API_KEY not set)" -ForegroundColor Yellow
}

Write-Host "Smoke: PASS" -ForegroundColor Green

