# Wire Sentry issue alerts to Cursor self-heal automation (relay on Render).
# Requires: SENTRY_AUTH_TOKEN (alerts:write), Render dashboard access for env vars.

param(
  [string]$Project = "ai-booking-mvp",
  [string]$Organization = "jtlh-ltd",
  [string]$RelayBaseUrl = "https://ai-booking-mvp.onrender.com",
  [string]$RenderServiceId = "srv-d2vvdqbuibrs73dq57ug"
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot/load-self-heal-secrets.ps1"

$relayUrl = "$RelayBaseUrl/webhooks/sentry-self-heal"
$relaySecret = $env:SENTRY_SELF_HEAL_RELAY_SECRET
if (-not $relaySecret) {
  $relaySecret = [guid]::NewGuid().ToString("N")
  Write-Warning "SENTRY_SELF_HEAL_RELAY_SECRET not in .cursor/self-heal-secrets.env — generated ephemeral: $relaySecret"
}

Write-Host "Sentry to Cursor self-heal setup"
Write-Host "Relay URL: $relayUrl"
Write-Host ""

if (-not $env:SENTRY_AUTH_TOKEN) {
  Write-Warning "SENTRY_AUTH_TOKEN not set - skipping Sentry rule cleanup."
} else {
  $headers = @{ Authorization = "Bearer $env:SENTRY_AUTH_TOKEN" }
  try {
    Invoke-RestMethod -Method DELETE -Uri "https://de.sentry.io/api/0/projects/$Organization/$Project/rules/649721/" -Headers $headers | Out-Null
    Write-Host "Removed legacy no-op rule 649721 (NotifyEventAction only)."
  } catch {
    Write-Host "Rule 649721 delete skipped (may already be removed)."
  }
}

Write-Host ""
Write-Host "=== Local secrets (gitignored) ==="
Write-Host "Stored in .cursor/self-heal-secrets.env — scripts load automatically."
Write-Host "Sync once to Render: .\scripts\sync-self-heal-env-to-render.ps1"
Write-Host ""
Write-Host "=== Render env vars (after sync, no manual re-entry) ==="
Write-Host "CURSOR_SELF_HEAL_WEBHOOK_URL = (from self-heal-secrets.env)"
Write-Host "CURSOR_SELF_HEAL_WEBHOOK_AUTH = (from self-heal-secrets.env)"
Write-Host "SENTRY_SELF_HEAL_RELAY_SECRET = $relaySecret"
Write-Host ""

Write-Host "=== Sentry alert (one-time, ~2 min) ==="
Write-Host "1. Open https://$Organization.sentry.io/alerts/$Project/new/issue/"
Write-Host "2. Name: Cursor self-heal relay"
Write-Host "3. When: new issue OR resolved -> unresolved (regression)"
Write-Host "4. IF: level >= error (optional: app equals ai-booking-mvp)"
Write-Host "5. Then: Send a webhook request"
Write-Host "   URL: $relayUrl"
Write-Host "   Header: x-sentry-self-heal-secret: $relaySecret"
Write-Host "6. Save and enable"
Write-Host ""

Write-Host "=== Cursor automation (Save in open editor) ==="
Write-Host "- Triggers: Sentry Any issue event + Webhook"
Write-Host "- After PR: gh pr ready then merge for GREEN tier"
Write-Host "- Never stop at draft PR; verify prod before Sentry resolve"
Write-Host ""

Write-Host "=== Quick test after deploy ==="
Write-Host "  .\scripts\fire-cursor-self-heal-webhook.ps1 -IssueId AI-BOOKING-MVP-7"