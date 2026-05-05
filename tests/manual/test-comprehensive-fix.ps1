# Comprehensive Test for All Fixes
# This will test all the issues we've fixed

$API_KEY = "ad34b1de00c5b7380d6a447abcd78874"
$BASE_URL = "https://ai-booking-mvp.onrender.com"

Write-Host "Testing All Fixes..." -ForegroundColor Green
Write-Host ""

# Test 1: Send SMS and check logs
Write-Host "1. Sending Test SMS..." -ForegroundColor Yellow
try {
    $smsData = @{
        From = "+447491683261"
        To = "+447403934440"
        Body = "TEST MESSAGE"
        MessagingServiceSid = "MG852f3cf7b50ef1be50c566be9e7efa04"
    }
    
    $response = Invoke-RestMethod -Uri "$BASE_URL/webhooks/twilio-inbound" -Method POST -Body $smsData -ContentType "application/x-www-form-urlencoded"
    Write-Host "SMS sent successfully!" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "SMS failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 2: Check metrics
Write-Host "2. Checking Metrics..." -ForegroundColor Yellow
try {
    $headers = @{ "X-API-Key" = $API_KEY }
    $metrics = Invoke-RestMethod -Uri "$BASE_URL/admin/metrics" -Headers $headers
    
    Write-Host "Metrics Results:" -ForegroundColor Cyan
    Write-Host "  - Total Leads: $($metrics.metrics.overview.totalLeads)"
    Write-Host "  - Victory Dental Leads: $($metrics.metrics.byTenant.victory_dental.totalLeads)"
    Write-Host "  - Northside Vet Leads: $($metrics.metrics.byTenant.northside_vet.totalLeads)"
    Write-Host ""
} catch {
    Write-Host "Metrics check failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 3: Check lead scoring
Write-Host "3. Testing Lead Scoring..." -ForegroundColor Yellow
try {
    $headers = @{ "X-API-Key" = $API_KEY }
    
    # Test different phone number formats
    $phoneNumbers = @("+447491683261", "447491683261", "+447403934440", "447403934440")
    
    foreach ($phone in $phoneNumbers) {
        try {
            $leadScore = Invoke-RestMethod -Uri "$BASE_URL/admin/lead-score?phone=$phone" -Headers $headers
            if ($leadScore.found) {
                Write-Host "  Found lead for $phone - Score: $($leadScore.score), Priority: $($leadScore.priority)" -ForegroundColor Green
            } else {
                Write-Host "  No lead found for $phone" -ForegroundColor Gray
            }
        } catch {
            Write-Host "  Error checking $phone : $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    Write-Host ""
} catch {
    Write-Host "Lead scoring test failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 4: Check tenant resolution
Write-Host "4. Testing Tenant Resolution..." -ForegroundColor Yellow
try {
    $headers = @{ "X-API-Key" = $API_KEY }
    
    # Test tenant resolve endpoint
    $tenantResolve = Invoke-RestMethod -Uri "$BASE_URL/admin/tenant-resolve?to=+447403934440&mss=MG852f3cf7b50ef1be50c566be9e7efa04" -Headers $headers
    Write-Host "Tenant Resolution Test:" -ForegroundColor Cyan
    Write-Host "  - To: +447403934440"
    Write-Host "  - Resolved Tenant: $($tenantResolve.tenantKey)"
    Write-Host "  - Success: $($tenantResolve.ok)"
    Write-Host ""
    
    $tenantResolve2 = Invoke-RestMethod -Uri "$BASE_URL/admin/tenant-resolve?to=+447491683261&mss=MG852f3cf7b50ef1be50c566be9e7efa04" -Headers $headers
    Write-Host "Tenant Resolution Test 2:" -ForegroundColor Cyan
    Write-Host "  - To: +447491683261"
    Write-Host "  - Resolved Tenant: $($tenantResolve2.tenantKey)"
    Write-Host "  - Success: $($tenantResolve2.ok)"
    Write-Host ""
} catch {
    Write-Host "Tenant resolution test failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

Write-Host "Comprehensive Test Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Summary of Fixes Applied:" -ForegroundColor Cyan
Write-Host "✅ Fixed existingLead undefined error"
Write-Host "✅ Improved tenant resolution priority logic"
Write-Host "✅ Enhanced lead scoring phone number matching"
Write-Host "✅ Fixed metrics tenant lead counting"
Write-Host "✅ Added comprehensive logging"
Write-Host "✅ Fixed lead creation with tenant association"
Write-Host ""
