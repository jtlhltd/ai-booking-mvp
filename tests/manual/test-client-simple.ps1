# Simple Client Creation Test
# Tests client onboarding without special characters

Write-Host "Client Creation Test" -ForegroundColor Cyan
Write-Host "===================" -ForegroundColor Cyan

$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = "ad34b1de00c5b7380d6a447abcd78874"

function Create-TestClient {
    param(
        [string]$ClientName,
        [string]$Industry
    )
    
    Write-Host "`nCreating client: $ClientName" -ForegroundColor Yellow
    Write-Host "Industry: $Industry" -ForegroundColor Gray
    
    $clientData = @{
        basic = @{
            clientName = $ClientName
            industry = $Industry
            businessType = "Consulting"
            location = "London, UK"
            website = "https://testclient.com"
            contactEmail = "test@testclient.com"
            contactPhone = "+447123456789"
        }
        branding = @{
            primaryColor = "#3B82F6"
            timezone = "Europe/London"
            locale = "en-GB"
            logoUrl = ""
        }
        operations = @{
            businessStart = "09:00"
            businessEnd = "17:00"
            businessDays = @(1, 2, 3, 4, 5)
            appointmentDuration = 30
            bufferTime = 15
            maxAdvanceBooking = 30
            cancellationPolicy = "24 hours"
        }
        communication = @{
            smsFromNumber = "+447403934440"
            emailFromAddress = "bookings@testclient.com"
            autoConfirm = $true
            sendReminders = $true
            reminderTime = "24 hours"
        }
        services = @{
            serviceName = "Consultation"
            serviceDescription = "General consultation"
            serviceDuration = 30
            servicePrice = 50
            serviceCategory = "General"
        }
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/create-client" -Method POST -Headers @{"X-API-Key" = $apiKey} -Body $clientData -ContentType "application/json" -TimeoutSec 30
        Write-Host "PASS: Client created successfully" -ForegroundColor Green
        Write-Host "   Client Key: $($response.clientKey)" -ForegroundColor Gray
        return $response
    }
    catch {
        Write-Host "FAIL: Client creation failed: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

Write-Host "`nTesting client creation..." -ForegroundColor Yellow

# Test 1: Healthcare client
$healthcareClient = Create-TestClient -ClientName "Test Healthcare Clinic" -Industry "Healthcare"
Start-Sleep -Seconds 2

# Test 2: Legal client
$legalClient = Create-TestClient -ClientName "Test Legal Firm" -Industry "Legal"
Start-Sleep -Seconds 2

# Test 3: Beauty client
$beautyClient = Create-TestClient -ClientName "Test Beauty Salon" -Industry "Beauty"
Start-Sleep -Seconds 2

Write-Host "`nVerifying client creation..." -ForegroundColor Yellow

# Check tenant list
try {
    $tenants = Invoke-RestMethod -Uri "$baseUrl/admin/tenants" -Headers @{"X-API-Key" = $apiKey} -TimeoutSec 10
    Write-Host "PASS: Retrieved tenant list" -ForegroundColor Green
    Write-Host "   Total tenants: $($tenants.Count)" -ForegroundColor Gray
    
    foreach ($tenant in $tenants) {
        Write-Host "   - $($tenant.clientKey): $($tenant.displayName)" -ForegroundColor Gray
    }
} catch {
    Write-Host "FAIL: Failed to retrieve tenants: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nClient Creation Test Complete!" -ForegroundColor Green
Write-Host "Check your database for new clients." -ForegroundColor Yellow
