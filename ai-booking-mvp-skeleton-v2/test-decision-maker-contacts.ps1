# Test Decision Maker Contact Research System
Write-Host "Testing Decision Maker Contact Research System..." -ForegroundColor Green

# Test data
$testBusiness = @{
    name = "Smile Dental Clinic"
    address = "123 High Street, London, UK"
    phone = "+44 20 7123 4567"
    email = "info@smiledental.co.uk"
    website = "https://smiledental.co.uk"
    companyNumber = "12345678"
    companyStatus = "active"
    estimatedEmployees = "11-50"
    category = "dental"
    leadScore = 85
    source = "googlePlaces"
}

$testData = @{
    business = $testBusiness
    industry = "dental"
    targetRole = "Practice Manager"
}

# Convert to JSON
$jsonData = $testData | ConvertTo-Json -Depth 10

Write-Host "Sending test request to /api/decision-maker-contacts..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "http://localhost:10000/api/decision-maker-contacts" -Method POST -Body $jsonData -ContentType "application/json"
    
    Write-Host "✅ Success!" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 10 | Write-Host
    
    if ($response.success) {
        Write-Host "`n📊 Contact Research Results:" -ForegroundColor Green
        Write-Host "Primary contacts: $($response.contacts.primary.Count)" -ForegroundColor White
        Write-Host "Secondary contacts: $($response.contacts.secondary.Count)" -ForegroundColor White
        Write-Host "Gatekeeper contacts: $($response.contacts.gatekeeper.Count)" -ForegroundColor White
        Write-Host "Strategy: $($response.strategy.approach)" -ForegroundColor White
        Write-Host "Priority: $($response.strategy.priority)" -ForegroundColor White
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Make sure the server is running on localhost:10000" -ForegroundColor Yellow
}

Write-Host "`nTest completed!" -ForegroundColor Green
