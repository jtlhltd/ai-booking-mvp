# Test Analytics & Reporting
$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = "ad34b1de00c5b7380d6a447abcd78874"

Write-Host "Testing Analytics & Reporting" -ForegroundColor Cyan

$headers = @{
    "X-API-Key" = $apiKey
}

# Test 1: Analytics Dashboard
Write-Host "Test 1: Analytics Dashboard" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/analytics/victory_dental" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "Analytics Dashboard Response: $($response | ConvertTo-Json -Depth 3)" -ForegroundColor Green
} catch {
    Write-Host "Analytics Dashboard Failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    }
}

# Test 2: Generate Analytics Report
Write-Host "Test 2: Generate Analytics Report" -ForegroundColor Yellow

$reportData = @{
    reportType = "comprehensive"
    days = 30
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/analytics/victory_dental/report" -Method POST -Body $reportData -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "Analytics Report Response: $($response | ConvertTo-Json -Depth 3)" -ForegroundColor Green
} catch {
    Write-Host "Analytics Report Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Track Analytics Event
Write-Host "Test 3: Track Analytics Event" -ForegroundColor Yellow

$eventData = @{
    eventType = "test_event"
    eventCategory = "testing"
    eventData = @{
        test = "true"
        timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    }
    sessionId = "test_session_$(Get-Date -Format 'yyyyMMddHHmmss')"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/analytics/victory_dental/track" -Method POST -Body $eventData -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "Analytics Event Tracking Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "Analytics Event Tracking Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Track Conversion Stage
Write-Host "Test 4: Track Conversion Stage" -ForegroundColor Yellow

$conversionData = @{
    leadPhone = "+447491683261"
    stage = "test_stage"
    stageData = @{
        test = "true"
        timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    }
    previousStage = "initial"
    timeToStage = 30
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/analytics/victory_dental/conversion" -Method POST -Body $conversionData -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "Conversion Stage Tracking Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "Conversion Stage Tracking Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: Record Performance Metric
Write-Host "Test 5: Record Performance Metric" -ForegroundColor Yellow

$metricData = @{
    metricName = "test_metric"
    metricValue = 100
    metricUnit = "count"
    metricCategory = "testing"
    metadata = @{
        test = "true"
        timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    }
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/analytics/victory_dental/metrics" -Method POST -Body $metricData -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "Performance Metric Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "Performance Metric Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "Analytics & Reporting Tests Complete!" -ForegroundColor Cyan
