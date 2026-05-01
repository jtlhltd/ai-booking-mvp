# Client Onboarding Testing Script
# Tests the complete client onboarding and dashboard generation process

Write-Host "👥 Client Onboarding Testing" -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan

$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = "ad34b1de00c5b7380d6a447abcd78874"

function Test-ClientCreation {
    param(
        [string]$ClientName,
        [string]$Industry,
        [string]$BusinessType,
        [string]$Location,
        [string]$Website,
        [string]$Email,
        [string]$Phone,
        [string]$PrimaryColor,
        [string]$Timezone,
        [string]$BusinessStart,
        [string]$BusinessEnd,
        [string]$SmsFromNumber,
        [string]$ServiceName,
        [string]$ServiceDescription,
        [int]$ServiceDuration,
        [int]$ServicePrice
    )
    
    Write-Host "`n🏢 Creating Client: $ClientName" -ForegroundColor Yellow
    Write-Host "Industry: $Industry" -ForegroundColor Gray
    Write-Host "Location: $Location" -ForegroundColor Gray
    Write-Host "Color: $PrimaryColor" -ForegroundColor Gray
    
    $clientData = @{
        basic = @{
            clientName = $ClientName
            industry = $Industry
            businessType = $BusinessType
            location = $Location
            website = $Website
            contactEmail = $Email
            contactPhone = $Phone
        }
        branding = @{
            primaryColor = $PrimaryColor
            timezone = $Timezone
            locale = "en-GB"
            logoUrl = ""
        }
        operations = @{
            businessStart = $BusinessStart
            businessEnd = $BusinessEnd
            businessDays = @(1, 2, 3, 4, 5)
            appointmentDuration = 30
            bufferTime = 15
            maxAdvanceBooking = 30
            cancellationPolicy = "24 hours"
        }
        communication = @{
            smsFromNumber = $SmsFromNumber
            emailFromAddress = "bookings@$($ClientName.ToLower().Replace(' ', '')).com"
            autoConfirm = $true
            sendReminders = $true
            reminderTime = "24 hours"
        }
        services = @{
            serviceName = $ServiceName
            serviceDescription = $ServiceDescription
            serviceDuration = $ServiceDuration
            servicePrice = $ServicePrice
            serviceCategory = "General"
        }
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/create-client" -Method POST -Headers @{"X-API-Key" = $apiKey} -Body $clientData -ContentType "application/json" -TimeoutSec 30
        Write-Host "✅ Client created successfully!" -ForegroundColor Green
        Write-Host "Client Key: $($response.clientKey)" -ForegroundColor White
        return $response
    }
    catch {
        Write-Host "❌ Failed to create client: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

function Test-DashboardAccess {
    param(
        [string]$ClientKey,
        [string]$ClientName
    )
    
    Write-Host "`n📊 Testing Dashboard Access for $ClientName" -ForegroundColor Yellow
    
    # Test client-specific dashboard
    try {
        $dashboardUrl = "$baseUrl/client-dashboard?client=$ClientKey"
        $response = Invoke-RestMethod -Uri $dashboardUrl -TimeoutSec 30
        Write-Host "✅ Dashboard accessible" -ForegroundColor Green
    }
    catch {
        Write-Host "❌ Dashboard not accessible: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# ============================================================================
# TEST 1: HEALTHCARE CLINIC
# ============================================================================
Write-Host "`n🏥 TEST 1: Healthcare Clinic" -ForegroundColor Magenta
Write-Host "===========================" -ForegroundColor Magenta

$healthcareClient = Test-ClientCreation -ClientName "HealthCare Plus" -Industry "Healthcare" -BusinessType "Clinic" -Location "London, UK" -Website "https://healthcareplus.com" -Email "info@healthcareplus.com" -Phone "+447123456789" -PrimaryColor "#10B981" -Timezone "Europe/London" -BusinessStart "08:00" -BusinessEnd "18:00" -SmsFromNumber "+447403934440" -ServiceName "General Consultation" -ServiceDescription "General health consultation" -ServiceDuration 30 -ServicePrice 75

if ($healthcareClient) {
    Test-DashboardAccess -ClientKey $healthcareClient.clientKey -ClientName "HealthCare Plus"
}

# ============================================================================
# TEST 2: LEGAL FIRM
# ============================================================================
Write-Host "`n⚖️ TEST 2: Legal Firm" -ForegroundColor Magenta
Write-Host "====================" -ForegroundColor Magenta

$legalClient = Test-ClientCreation -ClientName "Legal Associates" -Industry "Legal" -BusinessType "Law Firm" -Location "Manchester, UK" -Website "https://legalassociates.co.uk" -Email "contact@legalassociates.co.uk" -Phone "+447234567890" -PrimaryColor "#3B82F6" -Timezone "Europe/London" -BusinessStart "09:00" -BusinessEnd "17:00" -SmsFromNumber "+447403934440" -ServiceName "Legal Consultation" -ServiceDescription "Initial legal consultation" -ServiceDuration 60 -ServicePrice 150

if ($legalClient) {
    Test-DashboardAccess -ClientKey $legalClient.clientKey -ClientName "Legal Associates"
}

# ============================================================================
# TEST 3: BEAUTY SALON
# ============================================================================
Write-Host "`n💄 TEST 3: Beauty Salon" -ForegroundColor Magenta
Write-Host "======================" -ForegroundColor Magenta

$beautyClient = Test-ClientCreation -ClientName "Glamour Studio" -Industry "Beauty" -BusinessType "Salon" -Location "Birmingham, UK" -Website "https://glamourstudio.com" -Email "bookings@glamourstudio.com" -Phone "+447345678901" -PrimaryColor "#EC4899" -Timezone "Europe/London" -BusinessStart "09:00" -BusinessEnd "19:00" -SmsFromNumber "+447403934440" -ServiceName "Hair Styling" -ServiceDescription "Professional hair styling service" -ServiceDuration 90 -ServicePrice 45

if ($beautyClient) {
    Test-DashboardAccess -ClientKey $beautyClient.clientKey -ClientName "Glamour Studio"
}

# ============================================================================
# TEST 4: FITNESS TRAINER
# ============================================================================
Write-Host "`n💪 TEST 4: Fitness Trainer" -ForegroundColor Magenta
Write-Host "========================" -ForegroundColor Magenta

$fitnessClient = Test-ClientCreation -ClientName "FitLife Training" -Industry "Fitness" -BusinessType "Personal Training" -Location "Leeds, UK" -Website "https://fitlifetraining.co.uk" -Email "hello@fitlifetraining.co.uk" -Phone "+447456789012" -PrimaryColor "#F59E0B" -Timezone "Europe/London" -BusinessStart "06:00" -BusinessEnd "21:00" -SmsFromNumber "+447403934440" -ServiceName "Personal Training" -ServiceDescription "One-on-one fitness training session" -ServiceDuration 60 -ServicePrice 65

if ($fitnessClient) {
    Test-DashboardAccess -ClientKey $fitnessClient.clientKey -ClientName "FitLife Training"
}

# ============================================================================
# TEST 5: CONSULTING FIRM
# ============================================================================
Write-Host "`n💼 TEST 5: Consulting Firm" -ForegroundColor Magenta
Write-Host "=========================" -ForegroundColor Magenta

$consultingClient = Test-ClientCreation -ClientName "Strategic Solutions" -Industry "Consulting" -BusinessType "Business Consulting" -Location "Edinburgh, UK" -Website "https://strategicsolutions.co.uk" -Email "info@strategicsolutions.co.uk" -Phone "+447567890123" -PrimaryColor "#8B5CF6" -Timezone "Europe/London" -BusinessStart "08:30" -BusinessEnd "17:30" -SmsFromNumber "+447403934440" -ServiceName "Business Consultation" -ServiceDescription "Strategic business consultation" -ServiceDuration 120 -ServicePrice 200

if ($consultingClient) {
    Test-DashboardAccess -ClientKey $consultingClient.clientKey -ClientName "Strategic Solutions"
}

# ============================================================================
# TEST 6: ERROR HANDLING
# ============================================================================
Write-Host "`n⚠️ TEST 6: Error Handling" -ForegroundColor Magenta
Write-Host "========================" -ForegroundColor Magenta

# Test invalid client data
Write-Host "`nTesting invalid client data..."
$invalidClientData = @{
    basic = @{
        clientName = ""
        industry = "Invalid"
    }
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/create-client" -Method POST -Headers @{"X-API-Key" = $apiKey} -Body $invalidClientData -ContentType "application/json" -TimeoutSec 30
    Write-Host "❌ Should have failed but didn't" -ForegroundColor Red
}
catch {
    Write-Host "✅ Correctly rejected invalid data: $($_.Exception.Message)" -ForegroundColor Green
}

# Test without API key
Write-Host "`nTesting without API key..."
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/create-client" -Method POST -Body $invalidClientData -ContentType "application/json" -TimeoutSec 30
    Write-Host "❌ Should have failed but didn't" -ForegroundColor Red
}
catch {
    Write-Host "✅ Correctly rejected request without API key: $($_.Exception.Message)" -ForegroundColor Green
}

# ============================================================================
# TEST 7: DASHBOARD FUNCTIONALITY
# ============================================================================
Write-Host "`n📊 TEST 7: Dashboard Functionality" -ForegroundColor Magenta
Write-Host "===============================" -ForegroundColor Magenta

# Test main dashboard
Write-Host "`nTesting main dashboard..."
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/" -TimeoutSec 30
    Write-Host "✅ Main dashboard accessible" -ForegroundColor Green
}
catch {
    Write-Host "❌ Main dashboard not accessible: $($_.Exception.Message)" -ForegroundColor Red
}

# Test tenant dashboard
Write-Host "`nTesting tenant dashboard..."
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/tenant-dashboard" -TimeoutSec 30
    Write-Host "✅ Tenant dashboard accessible" -ForegroundColor Green
}
catch {
    Write-Host "❌ Tenant dashboard not accessible: $($_.Exception.Message)" -ForegroundColor Red
}

# Test onboarding wizard
Write-Host "`nTesting onboarding wizard..."
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/onboarding-wizard" -TimeoutSec 30
    Write-Host "✅ Onboarding wizard accessible" -ForegroundColor Green
}
catch {
    Write-Host "❌ Onboarding wizard not accessible: $($_.Exception.Message)" -ForegroundColor Red
}

# ============================================================================
# TEST 8: VERIFY CLIENT CREATION
# ============================================================================
Write-Host "`n🔍 TEST 8: Verify Client Creation" -ForegroundColor Magenta
Write-Host "===============================" -ForegroundColor Magenta

# List all tenants
Write-Host "`nListing all tenants..."
try {
    $tenants = Invoke-RestMethod -Uri "$baseUrl/admin/tenants" -Headers @{"X-API-Key" = $apiKey} -TimeoutSec 30
    Write-Host "✅ Retrieved tenant list" -ForegroundColor Green
    Write-Host "Total tenants: $($tenants.length)" -ForegroundColor White
    
    foreach ($tenant in $tenants) {
        Write-Host "  - $($tenant.clientKey): $($tenant.displayName)" -ForegroundColor Gray
    }
}
catch {
    Write-Host "❌ Failed to retrieve tenants: $($_.Exception.Message)" -ForegroundColor Red
}

# ============================================================================
# FINAL SUMMARY
# ============================================================================
Write-Host "`n📋 CLIENT ONBOARDING TEST SUMMARY" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

Write-Host "`n✅ Tests Completed:" -ForegroundColor Green
Write-Host "1. Healthcare Clinic Creation" -ForegroundColor White
Write-Host "2. Legal Firm Creation" -ForegroundColor White
Write-Host "3. Beauty Salon Creation" -ForegroundColor White
Write-Host "4. Fitness Trainer Creation" -ForegroundColor White
Write-Host "5. Consulting Firm Creation" -ForegroundColor White
Write-Host "6. Error Handling" -ForegroundColor White
Write-Host "7. Dashboard Functionality" -ForegroundColor White
Write-Host "8. Client Verification" -ForegroundColor White

Write-Host "`n🎯 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Check your database for new clients" -ForegroundColor White
Write-Host "2. Verify client files were generated" -ForegroundColor White
Write-Host "3. Test client dashboards manually" -ForegroundColor White
Write-Host "4. Check Render logs for any errors" -ForegroundColor White

Write-Host "`n🎉 Client Onboarding Testing Complete!" -ForegroundColor Green
