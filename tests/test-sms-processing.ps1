# Test SMS Processing and Lead Creation
# This script tests the core SMS functionality

$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = $env:API_KEY

if (-not $apiKey) {
    Write-Host "❌ API_KEY environment variable not set" -ForegroundColor Red
    exit 1
}

Write-Host "🧪 Testing SMS Processing and Lead Creation" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan

# Test 1: Basic SMS Processing
Write-Host "`n📱 Test 1: Basic SMS Processing" -ForegroundColor Yellow

$smsData = @{
    From = "+447491683261"
    To = "+447403934440"
    Body = "START"
    MessageSid = "test_sms_$(Get-Date -Format 'yyyyMMddHHmmss')"
    MessagingServiceSid = "MG1234567890abcdef"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/sms" -Method POST -Body $smsData -ContentType "application/json" -TimeoutSec 30
    Write-Host "✅ SMS Processing Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "❌ SMS Processing Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: YES Response Processing
Write-Host "`n📱 Test 2: YES Response Processing" -ForegroundColor Yellow

$yesData = @{
    From = "+447491683261"
    To = "+447403934440"
    Body = "YES"
    MessageSid = "test_yes_$(Get-Date -Format 'yyyyMMddHHmmss')"
    MessagingServiceSid = "MG1234567890abcdef"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/sms" -Method POST -Body $yesData -ContentType "application/json" -TimeoutSec 30
    Write-Host "✅ YES Response Processing: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "❌ YES Response Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Check Lead Creation
Write-Host "`n📊 Test 3: Check Lead Creation" -ForegroundColor Yellow

try {
    $headers = @{
        "X-API-Key" = $apiKey
    }
    
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/leads/test-client" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "✅ Lead Data Retrieved: $($response | ConvertTo-Json -Depth 3)" -ForegroundColor Green
    
    if ($response.leads -and $response.leads.Count -gt 0) {
        Write-Host "✅ Leads Found: $($response.leads.Count)" -ForegroundColor Green
        foreach ($lead in $response.leads) {
            Write-Host "  - Phone: $($lead.phone), Status: $($lead.status), Score: $($lead.score)" -ForegroundColor Cyan
        }
    } else {
        Write-Host "⚠️ No leads found - this might be expected if no SMS was processed" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Lead Retrieval Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Check Client Data
Write-Host "`n🏢 Test 4: Check Client Data" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/clients" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "✅ Client Data Retrieved: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
    
    if ($response.clients -and $response.clients.Count -gt 0) {
        Write-Host "✅ Clients Found: $($response.clients.Count)" -ForegroundColor Green
        foreach ($client in $response.clients) {
            Write-Host "  - Key: $($client.key), Name: $($client.name), Leads: $($client.leads.Count)" -ForegroundColor Cyan
        }
    } else {
        Write-Host "⚠️ No clients found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Client Retrieval Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: System Health Check
Write-Host "`n🏥 Test 5: System Health Check" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/system-health" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "✅ System Health: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "❌ System Health Check Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n🎯 SMS Processing Tests Complete!" -ForegroundColor Cyan