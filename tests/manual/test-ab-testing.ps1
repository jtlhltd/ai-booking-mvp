# Test A/B Testing
$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = "ad34b1de00c5b7380d6a447abcd78874"

Write-Host "Testing A/B Testing" -ForegroundColor Cyan

$headers = @{
    "X-API-Key" = $apiKey
}

# Test 1: Get Active A/B Tests
Write-Host "Test 1: Get Active A/B Tests" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/ab-tests/victory_dental" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "Active A/B Tests Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "Active A/B Tests Failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    }
}

# Test 2: Create A/B Test Experiment
Write-Host "Test 2: Create A/B Test Experiment" -ForegroundColor Yellow

$experimentData = @{
    experimentName = "test_assistant_prompts"
    variants = @(
        @{
            name = "control"
            config = @{
                prompt = "Standard booking prompt"
                tone = "professional"
            }
        },
        @{
            name = "variant_a"
            config = @{
                prompt = "Friendly booking prompt"
                tone = "conversational"
            }
        }
    )
    isActive = $true
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/ab-tests/victory_dental" -Method POST -Body $experimentData -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "A/B Test Creation Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "A/B Test Creation Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Get A/B Test Results
Write-Host "Test 3: Get A/B Test Results" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/ab-tests/victory_dental/test_assistant_prompts/results" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "A/B Test Results Response: $($response | ConvertTo-Json -Depth 3)" -ForegroundColor Green
} catch {
    Write-Host "A/B Test Results Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Assign Lead to A/B Test (first step)
Write-Host "Test 4a: Assign Lead to A/B Test" -ForegroundColor Yellow

$assignData = @{
    leadPhone = "+447491683261"
    experimentName = "test_assistant_prompts"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/ab-tests/victory_dental/assign" -Method POST -Body $assignData -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "A/B Test Assignment Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "A/B Test Assignment Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4b: Record A/B Test Outcome
Write-Host "Test 4b: Record A/B Test Outcome" -ForegroundColor Yellow

$outcomeData = @{
    leadPhone = "+447491683261"
    outcome = "converted"
    outcomeData = @{
        appointmentBooked = $true
        duration = 180
        satisfaction = "high"
    }
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/ab-tests/victory_dental/test_assistant_prompts/outcome" -Method POST -Body $outcomeData -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "A/B Test Outcome Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Green
} catch {
    Write-Host "A/B Test Outcome Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "A/B Testing Tests Complete!" -ForegroundColor Cyan
