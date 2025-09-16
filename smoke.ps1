param(
  [string]$BaseUrl = "https://ai-booking-mvp.onrender.com",
  [string]$ApiKey  = "ad34b1de00c5b7380d6a447abcd78874",
  [string]$Client  = "victory_dental",
  [string]$LeadName = "Jane Doe",
  [string]$LeadPhone = "+447491683261",
  [string]$Service = "Dental Consultation",
  [int]$DurationMin = 30
)

function Write-Section($t){ Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Show($label,$obj){ Write-Host ("`n{0}:" -f $label) -ForegroundColor Yellow; $obj | Format-List | Out-String | Write-Host }

# 1) Health
Write-Section "Health"
$health = Invoke-RestMethod "$BaseUrl/health" -Headers @{ 'X-API-Key'=$ApiKey }
Show "Health" $health

# 2) Agent call (Vapi)
Write-Section "Webhook → Vapi call"
$H = @{ 'X-API-Key'=$ApiKey; 'Content-Type'='application/json' }
$lead = @{
  name = $LeadName
  phone = $LeadPhone
  service = $Service
  durationMin = $DurationMin
} | ConvertTo-Json
try {
  $call = Invoke-RestMethod "$BaseUrl/webhooks/new-lead/$Client" -Method POST -Headers $H -Body $lead -ContentType 'application/json'
  Show "Vapi Call" $call
} catch {
  if ($_.Exception.Response) {
    $r = $_.Exception.Response
    $reader = New-Object IO.StreamReader($r.GetResponseStream()); $body = $reader.ReadToEnd()
    Write-Host "Webhook error body:" -ForegroundColor Red
    Write-Host $body
  } else { throw }
}

# 3) Auto-book + SMS
Write-Section "Auto-book + SMS"
$H2 = @{ 'X-API-Key'=$ApiKey; 'X-Client-Key'=$Client; 'Content-Type'='application/json' }
$bookBody = @{
  service = $Service
  durationMin = $DurationMin
  lead = @{ name = $LeadName; phone = $LeadPhone }
} | ConvertTo-Json -Depth 5
$booking = Invoke-RestMethod "$BaseUrl/api/calendar/check-book" -Method POST -Headers $H2 -Body $bookBody -ContentType 'application/json'
Show "Booking" $booking

# 4) List tenants
Write-Section "List tenants"
$tenants = Invoke-RestMethod "$BaseUrl/api/clients" -Headers @{ 'X-API-Key'=$ApiKey }
Show "Tenants" $tenants

Write-Host "`nAll checks done." -ForegroundColor Green
