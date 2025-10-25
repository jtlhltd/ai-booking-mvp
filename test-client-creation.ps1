# Quick Client Creation Test
Write-Host "Testing Client Creation on Render..." -ForegroundColor Cyan

$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = "ad34b1de00c5b7380d6a447abcd78874"

$clientData = @{
    basic = @{
        clientName = "Test Dental Clinic"
        industry = "Healthcare"
        contactName = "Dr. Smith"
        contactTitle = "Practice Manager"
        email = "dr.smith@testclinic.com"
        phone = "+447123456789"
        website = "https://testclinic.com"
    }
    branding = @{
        primaryColor = "#2E8B57"
        timezone = "Europe/London"
    }
    operations = @{
        businessStart = "09:00"
        businessEnd = "17:00"
        businessDays = @(1,2,3,4,5)
        appointmentDuration = 60
        advanceBooking = 7
    }
    communication = @{
        smsFromNumber = "+447123456789"
        welcomeMessage = "Welcome to Test Dental Clinic!"
        reminderHours = 24
        maxRetries = 3
    }
} | ConvertTo-Json -Depth 4

$headers = @{
    "X-API-Key" = $apiKey
    "Content-Type" = "application/json"
}

Write-Host "`nCreating test client..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/create-client" -Method POST -Headers $headers -Body $clientData -UseBasicParsing -TimeoutSec 30
    Write-Host "✅ SUCCESS! Client created successfully!" -ForegroundColor Green
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Green
    Write-Host $response.Content -ForegroundColor White
} catch {
    Write-Host "❌ FAILED!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        Write-Host "Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Yellow
        Write-Host "Response: $($_.Exception.Response.StatusDescription)" -ForegroundColor Yellow
    }
}

Write-Host "`nIf this failed, make sure API_KEY is set correctly on Render!" -ForegroundColor Cyan
