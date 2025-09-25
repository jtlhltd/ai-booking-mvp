# Google Calendar Booking Test for Victory Dental
$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = "ad34b1de00c5b7380d6a447abcd78874"

Write-Host "GOOGLE CALENDAR BOOKING TEST" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan

$headers = @{
    "X-API-Key" = $apiKey
}

# Test 1: Test Calendar Booking Endpoint
Write-Host "`nTest 1: Test Calendar Booking Endpoint" -ForegroundColor Yellow

$bookingData = @{
    tenantKey = "victory_dental"
    leadPhone = "+447491683261"
    appointmentTime = (Get-Date).AddDays(1).ToString("yyyy-MM-ddTHH:mm:ssZ")
    duration = 30
    service = "Dental Checkup"
    notes = "Test appointment booking via AI Booking MVP"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/test-calendar-booking" -Method POST -Body $bookingData -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "Calendar Booking Test Response:" -ForegroundColor Green
    Write-Host "   Status: $($response.ok)" -ForegroundColor White
    Write-Host "   Message: $($response.message)" -ForegroundColor White
    Write-Host "   Appointment Time: $($response.appointmentTime)" -ForegroundColor White
    Write-Host "   Duration: $($response.duration) minutes" -ForegroundColor White
    Write-Host "   Service: $($response.service)" -ForegroundColor White
    Write-Host "   Calendar ID: $($response.calendarId)" -ForegroundColor White
    Write-Host "   Timezone: $($response.timezone)" -ForegroundColor White
} catch {
    Write-Host "Calendar Booking Test Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Get Calendar Events
Write-Host "`nTest 2: Get Calendar Events" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/calendar-events/victory_dental" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "Calendar Events Response:" -ForegroundColor Green
    Write-Host "   Status: $($response.ok)" -ForegroundColor White
    Write-Host "   Events Count: $($response.events.Count)" -ForegroundColor White
    Write-Host "   Calendar ID: $($response.calendarId)" -ForegroundColor White
    Write-Host "   Timezone: $($response.timezone)" -ForegroundColor White
    
    if ($response.events) {
        foreach ($event in $response.events) {
            Write-Host "   Event: $($event.summary) - $($event.start.dateTime)" -ForegroundColor White
        }
    }
} catch {
    Write-Host "Calendar Events Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Check Victory Dental Calendar Configuration
Write-Host "`nTest 3: Check Victory Dental Calendar Configuration" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/clients/victory_dental" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "Victory Dental Calendar Config:" -ForegroundColor Green
    Write-Host "   Calendar ID: $($response.client.calendarId)" -ForegroundColor White
    Write-Host "   Booking Timezone: $($response.client.booking.timezone)" -ForegroundColor White
    Write-Host "   Default Duration: $($response.client.booking.defaultDurationMin) minutes" -ForegroundColor White
} catch {
    Write-Host "Calendar Config Check Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nGOOGLE CALENDAR TESTING COMPLETE!" -ForegroundColor Cyan
Write-Host "Note: Calendar integration is mocked until Google Calendar API is configured" -ForegroundColor Yellow
