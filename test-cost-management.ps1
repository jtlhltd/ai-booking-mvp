# Test Cost Management
$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = "ad34b1de00c5b7380d6a447abcd78874"

Write-Host "Testing Cost Management" -ForegroundColor Cyan

$headers = @{
    "X-API-Key" = $apiKey
}

# Test 1: Cost Optimization Metrics
Write-Host "Test 1: Cost Optimization Metrics" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/cost-optimization/victory_dental" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "Cost Optimization Response: $($response | ConvertTo-Json -Depth 3)" -ForegroundColor Green
} catch {
    Write-Host "Cost Optimization Failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    }
}

# Test 2: Set Budget Limits
Write-Host "Test 2: Set Budget Limits" -ForegroundColor Yellow

$budgetData = @{
    budgetType = "vapi_calls"
    dailyLimit = 50
    weeklyLimit = 300
    monthlyLimit = 1000
    currency = "USD"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/budget-limits/victory_dental" -Method POST -Body $budgetData -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "Budget Limits Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "Budget Limits Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Create Cost Alert
Write-Host "Test 3: Create Cost Alert" -ForegroundColor Yellow

$alertData = @{
    alertType = "daily_budget"
    threshold = 40
    period = "daily"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/cost-alerts/victory_dental" -Method POST -Body $alertData -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "Cost Alert Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "Cost Alert Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "Cost Management Tests Complete!" -ForegroundColor Cyan
