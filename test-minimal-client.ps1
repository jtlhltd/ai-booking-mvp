# Test Client Creation with Minimal Data
Write-Host "Testing Client Creation with Minimal Data..." -ForegroundColor Cyan

$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = "ad34b1de00c5b7380d6a447abcd78874"

# Minimal client data
$minimalClientData = @{
    basic = @{
        clientName = "Test Client"
        industry = "test"
        contactName = "Test Contact"
        contactTitle = "Manager"
        email = "test@example.com"
        phone = "+447123456789"
        website = "https://test.com"
    }
} | ConvertTo-Json -Depth 3

$headers = @{
    "X-API-Key" = $apiKey
    "Content-Type" = "application/json"
}

Write-Host "`nTesting with minimal data..." -ForegroundColor Yellow
Write-Host "Data: $minimalClientData" -ForegroundColor Gray

try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/create-client" -Method POST -Headers $headers -Body $minimalClientData -UseBasicParsing -TimeoutSec 30
    Write-Host "✅ SUCCESS! Client created successfully!" -ForegroundColor Green
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Green
    Write-Host $response.Content -ForegroundColor White
} catch {
    Write-Host "❌ FAILED!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        Write-Host "Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Yellow
        Write-Host "Response: $($_.Exception.Response.StatusDescription)" -ForegroundColor Yellow
    }
}
