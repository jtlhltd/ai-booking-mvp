# Test Environment Variables on Render
Write-Host "Testing Environment Variables on Render..." -ForegroundColor Cyan

$baseUrl = "https://ai-booking-mvp.onrender.com"

# Test the mock-call endpoint which shows environment variable status
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/mock-call" -UseBasicParsing -TimeoutSec 10
    Write-Host "✅ Server is responding!" -ForegroundColor Green
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Green
    Write-Host $response.Content -ForegroundColor White
} catch {
    Write-Host "❌ Server is not responding!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        Write-Host "Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Yellow
    }
}

Write-Host "`nIf server is not responding, check Render logs for errors!" -ForegroundColor Cyan
Write-Host "Go to: https://dashboard.render.com" -ForegroundColor Cyan
Write-Host "Find your service → Logs tab → Look for error messages" -ForegroundColor Cyan
