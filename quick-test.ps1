Param(
  [string]$BaseUrl = "http://localhost:3000",
  [string]$Name = "Test User",
  [string]$Phone = "+447700900123",
  [string]$Email = "test@example.com",
  [int]$DurationMin = 30,
  [string]$Service = "Consultation"
)

Write-Host "== 1) Ping Google Calendar ==" -ForegroundColor Cyan
try {
  $ping = Invoke-RestMethod "$BaseUrl/gcal/ping"
  $ping | ConvertTo-Json -Depth 6
} catch {
  Write-Error "Ping failed: $($_.Exception.Message)"
  exit 1
}

Write-Host "`n== 2) Book a slot (tomorrow 14:00 + duration) ==" -ForegroundColor Cyan
$lead = @{ name=$Name; phone=$Phone; email=$Email }
$body = @{ service=$Service; durationMin=$DurationMin; lead=$lead } | ConvertTo-Json -Depth 5

try {
  $resp = Invoke-RestMethod "$BaseUrl/api/calendar/check-book" -Method Post -Headers @{ 'Content-Type'='application/json' } -Body $body
  $resp | ConvertTo-Json -Depth 8
  if ($resp.google.htmlLink) {
    Write-Host "`nOpen in Google Calendar:" -ForegroundColor Green
    Write-Host $resp.google.htmlLink
    try { Start-Process $resp.google.htmlLink } catch {}
  }
} catch {
  Write-Error "Booking failed: $($_.Exception.Message)"
  exit 1
}

Write-Host "`nDone." -ForegroundColor Green
