# Setup Local Environment Variables from Render
# This script helps you copy environment variables from Render to local .env file

Write-Host "🔧 Local Environment Setup Helper" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Check if .env already exists
if (Test-Path ".env") {
    Write-Host "⚠️  .env file already exists!" -ForegroundColor Yellow
    $overwrite = Read-Host "Do you want to overwrite it? (y/n)"
    if ($overwrite -ne "y") {
        Write-Host "❌ Cancelled. Your existing .env file is safe." -ForegroundColor Red
        exit
    }
}

Write-Host "📋 Instructions:" -ForegroundColor Green
Write-Host "1. Open your Render dashboard: https://dashboard.render.com/web/srv-d2vvdqbuibrs73dq57ug" -ForegroundColor White
Write-Host "2. Go to the 'Environment' tab" -ForegroundColor White
Write-Host "3. Copy each value below and paste when prompted" -ForegroundColor White
Write-Host ""

# Critical variables
$criticalVars = @(
    "API_KEY",
    "VAPI_PRIVATE_KEY",
    "VAPI_ASSISTANT_ID",
    "VAPI_PHONE_NUMBER_ID"
)

# Important variables
$importantVars = @(
    "VAPI_TEMPLATE_ASSISTANT_ID",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_FROM_NUMBER",
    "GOOGLE_CLIENT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
    "EMAIL_USER",
    "EMAIL_PASS"
)

# Optional variables
$optionalVars = @(
    "DATABASE_URL",
    "BASE_URL",
    "TZ",
    "TEST_PHONE_NUMBER",
    "GOOGLE_PLACES_API_KEY",
    "COMPANIES_HOUSE_API_KEY"
)

$envContent = @"
# ============================================
# Environment Variables
# Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
# ============================================

# ============================================
# CRITICAL - Required for basic functionality
# ============================================
"@

Write-Host "🔴 CRITICAL VARIABLES (Required):" -ForegroundColor Red
foreach ($var in $criticalVars) {
    $value = Read-Host "Enter $var (or press Enter to skip)"
    if ($value) {
        $envContent += "`n$var=$value"
    } else {
        $envContent += "`n# $var=NOT_SET"
    }
}

$envContent += "`n`n# ============================================"
$envContent += "`n# IMPORTANT - For full functionality"
$envContent += "`n# ============================================"

Write-Host "`n🟡 IMPORTANT VARIABLES (Recommended):" -ForegroundColor Yellow
foreach ($var in $importantVars) {
    $value = Read-Host "Enter $var (or press Enter to skip)"
    if ($value) {
        $envContent += "`n$var=$value"
    } else {
        $envContent += "`n# $var=NOT_SET"
    }
}

$envContent += "`n`n# ============================================"
$envContent += "`n# OPTIONAL - Nice to have"
$envContent += "`n# ============================================"

Write-Host "`n🟢 OPTIONAL VARIABLES:" -ForegroundColor Green
$addOptional = Read-Host "Add optional variables? (y/n)"
if ($addOptional -eq "y") {
    foreach ($var in $optionalVars) {
        $value = Read-Host "Enter $var (or press Enter to skip)"
        if ($value) {
            $envContent += "`n$var=$value"
        }
    }
}

# Add defaults
$envContent += @"

# ============================================
# DEFAULTS
# ============================================
BASE_URL=https://ai-booking-mvp.onrender.com
PORT=3000
TZ=Europe/London
NODE_ENV=development
TEST_PHONE_NUMBER=+447491683261
GOOGLE_CALENDAR_ID=primary
"@

# Write .env file
$envContent | Out-File -FilePath ".env" -Encoding utf8

Write-Host "`n✅ .env file created successfully!" -ForegroundColor Green
Write-Host "📁 Location: $(Resolve-Path .env)" -ForegroundColor White
Write-Host "`n💡 Next steps:" -ForegroundColor Cyan
Write-Host "1. Review the .env file to make sure all values are correct" -ForegroundColor White
Write-Host "2. Restart your local server if it's running" -ForegroundColor White
Write-Host "3. Test with: node scripts/create-demo-client.js" -ForegroundColor White


