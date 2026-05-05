# Test Google Calendar Integration
$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = "ad34b1de00c5b7380d6a447abcd78874"

Write-Host "Testing Google Calendar Integration" -ForegroundColor Cyan

$headers = @{
    "X-API-Key" = $apiKey
}

# Test 1: Check Google Calendar Status
Write-Host "Test 1: Check Google Calendar Status" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/health" -Method GET -TimeoutSec 30
    Write-Host "Google Calendar Status: $($response.gcalConfigured)" -ForegroundColor Green
} catch {
    Write-Host "Google Calendar Status Check Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Test Calendar Booking
Write-Host "Test 2: Test Calendar Booking" -ForegroundColor Yellow

$bookingData = @{
    tenantKey = "victory_dental"
    leadPhone = "+447491683261"
    appointmentTime = "2025-09-24T10:00:00Z"
    duration = 30
    service = "Dental Checkup"
    notes = "Test appointment from PowerShell"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/test-calendar-booking" -Method POST -Body $bookingData -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "Calendar Booking Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "Calendar Booking Failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    }
}

# Test 3: Check Calendar Events
Write-Host "Test 3: Check Calendar Events" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/calendar-events/victory_dental" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "Calendar Events Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "Calendar Events Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "Google Calendar Integration Tests Complete!" -ForegroundColor Cyan
