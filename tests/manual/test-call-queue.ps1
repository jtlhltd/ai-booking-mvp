# Test Call Queue
$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = "ad34b1de00c5b7380d6a447abcd78874"

Write-Host "Testing Call Queue" -ForegroundColor Cyan

try {
    $headers = @{
        "X-API-Key" = $apiKey
    }
    
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/call-queue" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "Call Queue Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "Call Queue Failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    }
}

Write-Host "Call Queue Test Complete!" -ForegroundColor Cyan
