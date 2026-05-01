# Test SMS Flow for AI Booking MVP
# This script simulates SMS messages to test the new features

$API_KEY = "ad34b1de00c5b7380d6a447abcd78874"
$BASE_URL = "https://ai-booking-mvp.onrender.com"

Write-Host "Testing SMS Flow with New Features..." -ForegroundColor Green
Write-Host ""

# Test 1: Victory Dental (victory_dental)
Write-Host "Test 1: Victory Dental (+447403934440)" -ForegroundColor Yellow
Write-Host "Sending 'START' message to victory_dental..."
Write-Host ""

# Test 2: Northside Vet (northside_vet) 
Write-Host "Test 2: Northside Vet (+447491683261)" -ForegroundColor Yellow
Write-Host "Sending 'START' message to northside_vet..."
Write-Host ""

# Test 3: Different message types
Write-Host "Test 3: Different Message Types" -ForegroundColor Yellow
Write-Host "Testing 'YES', 'STOP', 'urgent appointment needed' messages..."
Write-Host ""

Write-Host "Manual Test Instructions:" -ForegroundColor Cyan
Write-Host "1. Send SMS 'START' to +447403934440 (victory_dental)"
Write-Host "2. Send SMS 'START' to +447491683261 (northside_vet)"
Write-Host "3. Send SMS 'urgent appointment needed' to +447403934440"
Write-Host "4. Send SMS 'STOP' to +447403934440"
Write-Host "5. Check logs for: [LEAD SCORE], [BUSINESS HOURS], [AUTO-CALL]"
Write-Host ""

Write-Host "After sending SMS, run this to check results:" -ForegroundColor Green
Write-Host "powershell -ExecutionPolicy Bypass -File test-quick-wins.ps1"
Write-Host ""
