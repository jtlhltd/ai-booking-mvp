# Push .cursor/self-heal-secrets.env to Render (one-time; values persist on the service).
# Requires RENDER_API_KEY with write access (https://dashboard.render.com/u/settings#api-keys)

param(
  [string]$ServiceId = "srv-d2vvdqbuibrs73dq57ug"
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot/load-self-heal-secrets.ps1"

$required = @(
  'CURSOR_SELF_HEAL_WEBHOOK_URL',
  'CURSOR_SELF_HEAL_WEBHOOK_AUTH',
  'SENTRY_SELF_HEAL_RELAY_SECRET'
)
foreach ($key in $required) {
  if (-not (Get-Item "env:$key" -ErrorAction SilentlyContinue)) {
    Write-Error "Missing $key. Copy .cursor/self-heal-secrets.env.example to .cursor/self-heal-secrets.env and fill in."
  }
}

if (-not $env:RENDER_API_KEY) {
  Write-Error @"
RENDER_API_KEY not set. Create one at https://dashboard.render.com/u/settings#api-keys then:
  `$env:RENDER_API_KEY = 'rnd_...'
  .\scripts\sync-self-heal-env-to-render.ps1
"@
}

$headers = @{
  Authorization = "Bearer $env:RENDER_API_KEY"
  Accept = 'application/json'
  'Content-Type' = 'application/json'
}

$existing = @{}
$cursor = ''
do {
  $uri = "https://api.render.com/v1/services/$ServiceId/env-vars?limit=100"
  if ($cursor) { $uri += "&cursor=$cursor" }
  $page = Invoke-RestMethod -Uri $uri -Headers $headers
  foreach ($item in $page) {
    if ($item.envVar) {
      $existing[$item.envVar.key] = $item.envVar.value
    }
  }
  $cursor = $page | Select-Object -Last 1 -ExpandProperty cursor -ErrorAction SilentlyContinue
} while ($cursor)

$existing['CURSOR_SELF_HEAL_WEBHOOK_URL'] = $env:CURSOR_SELF_HEAL_WEBHOOK_URL
$existing['CURSOR_SELF_HEAL_WEBHOOK_AUTH'] = ($env:CURSOR_SELF_HEAL_WEBHOOK_AUTH -replace '^Bearer\s+', '').Trim()
$existing['SENTRY_SELF_HEAL_RELAY_SECRET'] = $env:SENTRY_SELF_HEAL_RELAY_SECRET

$body = @($existing.GetEnumerator() | ForEach-Object { @{ key = $_.Key; value = $_.Value } })
Invoke-RestMethod -Method PUT `
  -Uri "https://api.render.com/v1/services/$ServiceId/env-vars" `
  -Headers $headers -Body ($body | ConvertTo-Json -Depth 4)

Write-Host "Synced self-heal env vars to Render service $ServiceId (merged with existing)."
Write-Host "Render will redeploy automatically. Test in ~2 min:"
Write-Host "  .\scripts\fire-cursor-self-heal-webhook.ps1 -IssueId AI-BOOKING-MVP-7"
