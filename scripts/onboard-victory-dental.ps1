# Victory Dental Complete Onboarding
$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = "ad34b1de00c5b7380d6a447abcd78874"

Write-Host "VICTORY DENTAL COMPLETE ONBOARDING" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

$headers = @{
    "X-API-Key" = $apiKey
}

# Step 1: Update Victory Dental Configuration
Write-Host "`nStep 1: Update Victory Dental Configuration" -ForegroundColor Yellow

$clientData = @{
    displayName = "Victory Dental"
    timezone = "Europe/London"
    locale = "en-GB"
    numbers = @{
        clinic = "+447491683261"
        inbound = "+447403934440"
    }
    sms = @{
        fromNumber = "+447403934440"
        messagingServiceSid = "MG852f3cf7b50ef1be50c566be9e7efa04"
        maxRetries = 3
        reminderHours = 24
        welcomeMessage = "Hi! Thanks for contacting Victory Dental. Reply START to book your appointment."
        reminderMessage = "Reminder: You have a dental appointment tomorrow. Reply YES to confirm or STOP to cancel."
        confirmationMessage = "Your appointment at Victory Dental is confirmed. Reply STOP to opt out."
    }
    booking = @{
        timezone = "Europe/London"
        defaultDurationMin = 30
        calendarId = "primary"
        businessHours = @{
            start = "09:00"
            end = "17:00"
            days = @("monday", "tuesday", "wednesday", "thursday", "friday")
        }
    }
    serviceMap = @{
        "checkup" = "Dental Checkup"
        "cleaning" = "Teeth Cleaning"
        "filling" = "Dental Filling"
        "extraction" = "Tooth Extraction"
        "consultation" = "Dental Consultation"
    }
    isEnabled = $true
} | ConvertTo-Json -Depth 3

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/clients/victory_dental" -Method PUT -Body $clientData -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "Victory Dental Configuration Updated:" -ForegroundColor Green
    Write-Host "   Display Name: $($response.client.displayName)" -ForegroundColor White
    Write-Host "   SMS From: $($response.client.sms.fromNumber)" -ForegroundColor White
    Write-Host "   Timezone: $($response.client.timezone)" -ForegroundColor White
    Write-Host "   Services: $($response.client.serviceMap.Count) configured" -ForegroundColor White
} catch {
    Write-Host "Configuration Update Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 2: Set Up Budget Limits
Write-Host "`nStep 2: Set Up Budget Limits" -ForegroundColor Yellow

$budgetData = @{
    budgetType = "vapi_calls"
    dailyLimit = 50.00
    weeklyLimit = 300.00
    monthlyLimit = 1000.00
    currency = "USD"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/budget-limits/victory_dental" -Method POST -Body $budgetData -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "Budget Limits Set:" -ForegroundColor Green
    Write-Host "   Daily Limit: $($response.budget.daily_limit)" -ForegroundColor White
    Write-Host "   Weekly Limit: $($response.budget.weekly_limit)" -ForegroundColor White
    Write-Host "   Monthly Limit: $($response.budget.monthly_limit)" -ForegroundColor White
} catch {
    Write-Host "Budget Setup Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 3: Set Up Cost Alerts
Write-Host "`nStep 3: Set Up Cost Alerts" -ForegroundColor Yellow

$alertData = @{
    alertType = "daily_budget_80_percent"
    threshold = 40.00
    period = "daily"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/cost-alerts/victory_dental" -Method POST -Body $alertData -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "Cost Alert Set:" -ForegroundColor Green
    Write-Host "   Alert Type: $($response.alert.alert_type)" -ForegroundColor White
    Write-Host "   Threshold: $($response.alert.threshold)" -ForegroundColor White
    Write-Host "   Period: $($response.alert.period)" -ForegroundColor White
} catch {
    Write-Host "Cost Alert Setup Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 4: Create User Account
Write-Host "`nStep 4: Create User Account" -ForegroundColor Yellow

$userData = @{
    username = "victory_dental_admin"
    email = "admin@victorydental.com"
    password = "VictoryDental2024!"
    role = "admin"
    permissions = @("admin", "user_management", "api_management", "security_view")
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/users/victory_dental" -Method POST -Body $userData -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "User Account Created:" -ForegroundColor Green
    Write-Host "   Username: $($response.user.username)" -ForegroundColor White
    Write-Host "   Email: $($response.user.email)" -ForegroundColor White
    Write-Host "   Role: $($response.user.role)" -ForegroundColor White
    Write-Host "   Permissions: $($response.user.permissions -join ', ')" -ForegroundColor White
} catch {
    Write-Host "User Creation Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 5: Create API Key
Write-Host "`nStep 5: Create API Key" -ForegroundColor Yellow

$apiKeyData = @{
    keyName = "Victory Dental Production Key"
    permissions = @("admin", "user_management", "api_management", "security_view")
    rateLimitPerMinute = 200
    rateLimitPerHour = 2000
    expiresAt = $null
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/api-keys/victory_dental" -Method POST -Body $apiKeyData -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "API Key Created:" -ForegroundColor Green
    Write-Host "   Key Name: $($response.apiKey.keyName)" -ForegroundColor White
    Write-Host "   Permissions: $($response.apiKey.permissions -join ', ')" -ForegroundColor White
    Write-Host "   Rate Limit: $($response.apiKey.rateLimitPerMinute)/min, $($response.apiKey.rateLimitPerHour)/hour" -ForegroundColor White
    Write-Host "   Secret Key: $($response.secretKey)" -ForegroundColor Yellow
} catch {
    Write-Host "API Key Creation Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 6: Final Status Check
Write-Host "`nStep 6: Final Status Check" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/clients/victory_dental" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "Victory Dental Final Status:" -ForegroundColor Green
    Write-Host "   Client Key: $($response.client.clientKey)" -ForegroundColor White
    Write-Host "   Display Name: $($response.client.displayName)" -ForegroundColor White
    Write-Host "   SMS From: $($response.client.sms.fromNumber)" -ForegroundColor White
    Write-Host "   Timezone: $($response.client.timezone)" -ForegroundColor White
    Write-Host "   Services: $($response.client.serviceMap.Count) configured" -ForegroundColor White
    Write-Host "   Lead Count: $($response.client.leadCount)" -ForegroundColor White
    Write-Host "   Is Enabled: $($response.client.isEnabled)" -ForegroundColor White
} catch {
    Write-Host "Final Status Check Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nVICTORY DENTAL ONBOARDING COMPLETE!" -ForegroundColor Cyan
Write-Host "Victory Dental is now fully configured and ready for production!" -ForegroundColor Green
