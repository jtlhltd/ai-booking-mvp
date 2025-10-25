# Test different API keys to find the correct one
Write-Host "Testing API Keys on Render..." -ForegroundColor Cyan

$baseUrl = "https://ai-booking-mvp.onrender.com"
$testKeys = @(
    "ad34b1de00c5b7380d6a447abcd78874",
    "test-api-key-12345",
    "your-api-key",
    "api-key-123",
    "secret-key"
)

foreach ($key in $testKeys) {
    Write-Host "`nTesting API Key: $($key.Substring(0,8))..." -ForegroundColor Yellow
    
    $headers = @{
        "X-API-Key" = $key
        "Content-Type" = "application/json"
    }
    
    try {
        $response = Invoke-WebRequest -Uri "$baseUrl/admin/metrics" -Headers $headers -UseBasicParsing -TimeoutSec 10
        Write-Host "✅ SUCCESS with key: $($key.Substring(0,8))..." -ForegroundColor Green
        Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
        break
    } catch {
        Write-Host "❌ Failed with key: $($key.Substring(0,8))..." -ForegroundColor Red
        if ($_.Exception.Response) {
            Write-Host "   Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Gray
        }
    }
}

Write-Host "`nIf none worked, check your Render dashboard environment variables!" -ForegroundColor Cyan
Write-Host "Go to: https://dashboard.render.com" -ForegroundColor Cyan
Write-Host "Find your service → Environment tab → Check API_KEY value" -ForegroundColor Cyan
