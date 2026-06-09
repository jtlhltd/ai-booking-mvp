# Fire the Cursor self-heal automation webhook (backup when native Sentry trigger has 0 runs).
# Set after saving the automation in cursor.com/automations → Settings → Webhook:
#   $env:CURSOR_SELF_HEAL_WEBHOOK_URL = "https://api2.cursor.sh/automations/webhook/..."
#   $env:CURSOR_SELF_HEAL_WEBHOOK_AUTH = "crsr_..."  # Copy auth header from automation UI

param(
  [Parameter(Mandatory = $true)]
  [string]$IssueId,
  [string]$Project = "ai-booking-mvp",
  [string]$Organization = "jtlh-ltd"
)

$url = $env:CURSOR_SELF_HEAL_WEBHOOK_URL
$auth = $env:CURSOR_SELF_HEAL_WEBHOOK_AUTH

if (-not $url -or -not $auth) {
  Write-Error "Set CURSOR_SELF_HEAL_WEBHOOK_URL and CURSOR_SELF_HEAL_WEBHOOK_AUTH from the automation Webhook settings."
  exit 1
}

$body = @{
  source = "sentry-self-heal-manual"
  organization = $Organization
  project = $Project
  issue = @{
    id = $IssueId
    url = "https://jtlh-ltd.sentry.io/issues/$IssueId"
  }
} | ConvertTo-Json -Depth 4

$response = Invoke-WebRequest -Uri $url -Method POST `
  -Headers @{ Authorization = "Bearer $auth"; "Content-Type" = "application/json" } `
  -Body $body -UseBasicParsing

Write-Output "Webhook POST status=$($response.StatusCode)"
Write-Output $response.Content
