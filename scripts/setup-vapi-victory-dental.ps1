# VAPI Setup for Victory Dental
$baseUrl = "https://ai-booking-mvp.onrender.com"
$apiKey = "ad34b1de00c5b7380d6a447abcd78874"

Write-Host "VAPI SETUP FOR VICTORY DENTAL" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

$headers = @{
    "X-API-Key" = $apiKey
}

# Step 1: Create VAPI Assistant for Victory Dental
Write-Host "`nStep 1: Creating VAPI Assistant for Victory Dental" -ForegroundColor Yellow

$assistantData = @{
    name = "Victory Dental Assistant"
    model = @{
        provider = "openai"
        model = "gpt-3.5-turbo"
        temperature = 0.7
        maxTokens = 150
    }
    voice = @{
        provider = "elevenlabs"
        voiceId = "21m00Tcm4TlvDq8ikWAM"
        stability = 0.5
        similarityBoost = 0.8
    }
    firstMessage = "Hello! This is Sarah from Victory Dental. I'm calling to confirm your appointment for tomorrow at 2 PM. Is this still convenient for you?"
    systemMessage = "You are Sarah, a friendly dental receptionist at Victory Dental. Your goal is to confirm appointments and reschedule if needed. Keep calls brief (under 2 minutes). Be professional but warm. If they confirm, say 'Perfect! We'll see you tomorrow at 2 PM. Have a great day!' If they need to reschedule, ask for their preferred time and say you'll call back to confirm."
    maxDurationSeconds = 120
    endCallMessage = "Thank you for confirming your appointment. We look forward to seeing you at Victory Dental!"
    endCallPhrases = @("goodbye", "bye", "thank you", "see you tomorrow")
    recordingEnabled = $true
    voicemailDetectionEnabled = $true
    backgroundSound = "office"
} | ConvertTo-Json -Depth 3

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/vapi/assistants" -Method POST -Body $assistantData -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "VAPI Assistant Created:" -ForegroundColor Green
    Write-Host "   Assistant ID: $($response.assistant.id)" -ForegroundColor White
    Write-Host "   Name: $($response.assistant.name)" -ForegroundColor White
    Write-Host "   Voice: $($response.assistant.voice.provider)" -ForegroundColor White
} catch {
    Write-Host "VAPI Assistant Creation Failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "This might be because the endpoint doesn't exist yet. Let's check what endpoints are available." -ForegroundColor Yellow
}

# Step 2: Check Current Victory Dental Configuration
Write-Host "`nStep 2: Current Victory Dental Configuration" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/clients/victory_dental" -Method GET -Headers $headers -TimeoutSec 30
    Write-Host "Current Victory Dental Setup:" -ForegroundColor Green
    Write-Host "   Client Key: $($response.client.clientKey)" -ForegroundColor White
    Write-Host "   Display Name: $($response.client.displayName)" -ForegroundColor White
    Write-Host "   SMS From: $($response.client.sms.fromNumber)" -ForegroundColor White
    Write-Host "   VAPI Assistant: $($response.client.vapiAssistantId)" -ForegroundColor White
    Write-Host "   VAPI Phone: $($response.client.vapiPhoneNumberId)" -ForegroundColor White
} catch {
    Write-Host "Client Data Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nVAPI SETUP COMPLETE!" -ForegroundColor Cyan
Write-Host "Next: Test a real VAPI call to your mobile number" -ForegroundColor Gray
