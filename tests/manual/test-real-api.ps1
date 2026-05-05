# Test Real API Integration
Write-Host "=== Testing Real API Integration ===" -ForegroundColor Green

# Test 1: Health Check
Write-Host "`n1. Testing Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "https://ai-booking-mvp.onrender.com/health" -Method GET
    Write-Host "✅ Health Check: $($health.ok)" -ForegroundColor Green
    Write-Host "   Service: $($health.service)" -ForegroundColor Cyan
    Write-Host "   Status: $($health.status)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Health Check Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Google Places API Test
Write-Host "`n2. Testing Google Places API..." -ForegroundColor Yellow
try {
    $googleTest = Invoke-RestMethod -Uri "https://ai-booking-mvp.onrender.com/api/test-google-places" -Method GET
    if ($googleTest.success) {
        Write-Host "✅ Google Places API: WORKING" -ForegroundColor Green
        Write-Host "   API Key: $($googleTest.apiKey)" -ForegroundColor Cyan
        Write-Host "   Status: $($googleTest.status)" -ForegroundColor Cyan
        Write-Host "   Results Found: $($googleTest.resultsCount)" -ForegroundColor Cyan
        Write-Host "   First Result: $($googleTest.firstResult.name)" -ForegroundColor Cyan
    } else {
        Write-Host "❌ Google Places API Failed: $($googleTest.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Google Places API Test Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: UK Business Search - Dental Practices
Write-Host "`n3. Testing UK Business Search - Dental Practices..." -ForegroundColor Yellow
try {
    $searchBody = @{
        query = "dental practices in London"
    } | ConvertTo-Json
    
    $searchResults = Invoke-RestMethod -Uri "https://ai-booking-mvp.onrender.com/api/uk-business-search" -Method POST -ContentType "application/json" -Body $searchBody
    
    if ($searchResults.success) {
        Write-Host "✅ UK Business Search: WORKING" -ForegroundColor Green
        Write-Host "   Using Real Data: $($searchResults.usingRealData)" -ForegroundColor Cyan
        Write-Host "   Source: $($searchResults.source)" -ForegroundColor Cyan
        Write-Host "   Results Found: $($searchResults.count)" -ForegroundColor Cyan
        
        # Show first 3 results
        Write-Host "`n   First 3 Results:" -ForegroundColor Cyan
        for ($i = 0; $i -lt [Math]::Min(3, $searchResults.results.Count); $i++) {
            $result = $searchResults.results[$i]
            Write-Host "   $($i+1). $($result.name)" -ForegroundColor White
            Write-Host "      Address: $($result.address)" -ForegroundColor Gray
            Write-Host "      Rating: $($result.rating)" -ForegroundColor Gray
            Write-Host "      Lead Score: $($result.leadScore)" -ForegroundColor Gray
        }
    } else {
        Write-Host "❌ UK Business Search Failed" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ UK Business Search Test Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: UK Business Search - Different Industry
Write-Host "`n4. Testing UK Business Search - Law Firms..." -ForegroundColor Yellow
try {
    $searchBody = @{
        query = "law firms in Manchester"
    } | ConvertTo-Json
    
    $searchResults = Invoke-RestMethod -Uri "https://ai-booking-mvp.onrender.com/api/uk-business-search" -Method POST -ContentType "application/json" -Body $searchBody
    
    if ($searchResults.success) {
        Write-Host "✅ Law Firms Search: WORKING" -ForegroundColor Green
        Write-Host "   Using Real Data: $($searchResults.usingRealData)" -ForegroundColor Cyan
        Write-Host "   Results Found: $($searchResults.count)" -ForegroundColor Cyan
    } else {
        Write-Host "❌ Law Firms Search Failed" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Law Firms Search Test Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: Decision Maker Contact Research
Write-Host "`n5. Testing Decision Maker Contact Research..." -ForegroundColor Yellow
try {
    $contactBody = @{
        business = @{
            name = "Covent Garden Dental Practice"
            address = "61G Odhams Walk, London WC2H 9SD, United Kingdom"
            phone = "+44 20 1234 5678"
        }
        industry = "dental"
        targetRole = "Practice Manager"
    } | ConvertTo-Json -Depth 3
    
    $contactResults = Invoke-RestMethod -Uri "https://ai-booking-mvp.onrender.com/api/decision-maker-contacts" -Method POST -ContentType "application/json" -Body $contactBody
    
    if ($contactResults.success) {
        Write-Host "✅ Decision Maker Contact Research: WORKING" -ForegroundColor Green
        Write-Host "   Business: $($contactResults.business.name)" -ForegroundColor Cyan
        Write-Host "   Industry: $($contactResults.industry)" -ForegroundColor Cyan
        Write-Host "   Target Role: $($contactResults.targetRole)" -ForegroundColor Cyan
        
        # Show contact types
        Write-Host "`n   Contact Types Found:" -ForegroundColor Cyan
        Write-Host "   Primary Contacts: $($contactResults.contacts.primary.Count)" -ForegroundColor White
        Write-Host "   Secondary Contacts: $($contactResults.contacts.secondary.Count)" -ForegroundColor White
        Write-Host "   Gatekeeper Contacts: $($contactResults.contacts.gatekeeper.Count)" -ForegroundColor White
        
        # Show strategy
        Write-Host "`n   Outreach Strategy:" -ForegroundColor Cyan
        Write-Host "   Approach: $($contactResults.strategy.approach)" -ForegroundColor White
        Write-Host "   Best Time: $($contactResults.strategy.bestTime)" -ForegroundColor White
    } else {
        Write-Host "❌ Decision Maker Contact Research Failed" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Decision Maker Contact Research Test Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Testing Complete ===" -ForegroundColor Green
Write-Host "Visit https://ai-booking-mvp.onrender.com/public/uk-business-search.html to test the web interface!" -ForegroundColor Cyan
