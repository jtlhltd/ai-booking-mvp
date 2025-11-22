# Fix VAPI Voice Settings - Optimize for Clear Speech
# 
# This script updates your VAPI assistant with optimized voice settings
# to fix slurring and weird speech patterns.
#
# Usage:
#   .\scripts\fix-vapi-voice-settings.ps1 -AssistantId "your-assistant-id"
#
# Or set $env:VAPI_PRIVATE_KEY and $env:VAPI_ASSISTANT_ID

param(
    [Parameter(Mandatory=$false)]
    [string]$AssistantId = $env:VAPI_ASSISTANT_ID,
    
    [Parameter(Mandatory=$false)]
    [string]$VapiKey = $env:VAPI_PRIVATE_KEY
)

if (-not $VapiKey) {
    Write-Host "❌ Error: VAPI_PRIVATE_KEY not found" -ForegroundColor Red
    Write-Host "   Set it in environment: `$env:VAPI_PRIVATE_KEY='your_key'" -ForegroundColor Yellow
    Write-Host "   Or pass it as parameter: -VapiKey 'your_key'" -ForegroundColor Yellow
    exit 1
}

if (-not $AssistantId) {
    Write-Host "❌ Error: Assistant ID required" -ForegroundColor Red
    Write-Host "   Usage: .\scripts\fix-vapi-voice-settings.ps1 -AssistantId 'your-assistant-id'" -ForegroundColor Yellow
    Write-Host "   Or set `$env:VAPI_ASSISTANT_ID" -ForegroundColor Yellow
    exit 1
}

# Optimized voice settings to fix slurring
$optimizedVoiceSettings = @{
    stability = 0.75        # Higher = more stable, clearer (was often 0.5-0.6)
    clarity = 0.85          # Higher = clearer pronunciation
    style = 0.15            # Lower = less expressive, more consistent (was often 0.3+)
    similarityBoost = 0.75  # Balanced
    useSpeakerBoost = $true # Enhances clarity
}

# Optimized model settings
$optimizedModelSettings = @{
    temperature = 0.3       # Lower = more consistent speech patterns (was often 0.7)
    maxTokens = 200         # Shorter responses = less chance of issues
}

$baseUrl = "https://api.vapi.ai"
$headers = @{
    "Authorization" = "Bearer $VapiKey"
    "Content-Type" = "application/json"
}

Write-Host "🔧 Fixing VAPI Voice Settings...`n" -ForegroundColor Cyan
Write-Host "📞 Assistant ID: $AssistantId`n" -ForegroundColor Cyan

try {
    # Get current assistant config
    Write-Host "📥 Fetching current assistant configuration..." -ForegroundColor Yellow
    $getResponse = Invoke-RestMethod -Uri "$baseUrl/assistant/$AssistantId" -Method GET -Headers $headers
    Write-Host "✅ Got current config`n" -ForegroundColor Green

    # Show current settings
    Write-Host "📊 Current Voice Settings:" -ForegroundColor Cyan
    if ($getResponse.voice) {
        Write-Host "   Stability: $($getResponse.voice.stability)" -ForegroundColor Gray
        Write-Host "   Clarity: $($getResponse.voice.clarity)" -ForegroundColor Gray
        Write-Host "   Style: $($getResponse.voice.style)" -ForegroundColor Gray
        Write-Host "   Similarity Boost: $($getResponse.voice.similarityBoost)" -ForegroundColor Gray
        Write-Host "   Speaker Boost: $($getResponse.voice.useSpeakerBoost)" -ForegroundColor Gray
    } else {
        Write-Host "   ⚠️  No voice settings found" -ForegroundColor Yellow
    }

    Write-Host "`n📊 Current Model Settings:" -ForegroundColor Cyan
    if ($getResponse.model) {
        Write-Host "   Temperature: $($getResponse.model.temperature)" -ForegroundColor Gray
        Write-Host "   Max Tokens: $($getResponse.model.maxTokens)" -ForegroundColor Gray
    } else {
        Write-Host "   ⚠️  No model settings found" -ForegroundColor Yellow
    }

    # Prepare updates
    $updates = @{}

    # Update voice settings
    if ($getResponse.voice) {
        $updates.voice = $getResponse.voice.PSObject.Copy()
        foreach ($key in $optimizedVoiceSettings.Keys) {
            $updates.voice.$key = $optimizedVoiceSettings[$key]
        }
    } else {
        Write-Host "`n⚠️  Warning: No existing voice config found." -ForegroundColor Yellow
        Write-Host "   You may need to set voice provider and voiceId manually in VAPI dashboard." -ForegroundColor Yellow
    }

    # Update model settings
    if ($getResponse.model) {
        $updates.model = $getResponse.model.PSObject.Copy()
        foreach ($key in $optimizedModelSettings.Keys) {
            $updates.model.$key = $optimizedModelSettings[$key]
        }
    }

    if ($updates.Count -eq 0) {
        Write-Host "`n❌ No updates to apply. Assistant may not have voice/model config." -ForegroundColor Red
        exit 1
    }

    # Show what will be updated
    Write-Host "`n🔧 Optimized Settings to Apply:" -ForegroundColor Cyan
    if ($updates.voice) {
        Write-Host "`n   Voice Settings:" -ForegroundColor Cyan
        Write-Host "   ✅ Stability: $($updates.voice.stability) (higher = clearer)" -ForegroundColor Green
        Write-Host "   ✅ Clarity: $($updates.voice.clarity) (higher = clearer)" -ForegroundColor Green
        Write-Host "   ✅ Style: $($updates.voice.style) (lower = more consistent)" -ForegroundColor Green
        Write-Host "   ✅ Similarity Boost: $($updates.voice.similarityBoost)" -ForegroundColor Green
        Write-Host "   ✅ Speaker Boost: $($updates.voice.useSpeakerBoost)" -ForegroundColor Green
    }
    if ($updates.model) {
        Write-Host "`n   Model Settings:" -ForegroundColor Cyan
        Write-Host "   ✅ Temperature: $($updates.model.temperature) (lower = more consistent)" -ForegroundColor Green
        Write-Host "   ✅ Max Tokens: $($updates.model.maxTokens)" -ForegroundColor Green
    }

    # Confirm update
    Write-Host "`n💾 Updating assistant..." -ForegroundColor Yellow
    $updateBody = $updates | ConvertTo-Json -Depth 10
    $updated = Invoke-RestMethod -Uri "$baseUrl/assistant/$AssistantId" -Method PATCH -Headers $headers -Body $updateBody
    Write-Host "✅ Assistant updated successfully!`n" -ForegroundColor Green

    # Show final settings
    Write-Host "📊 Final Voice Settings:" -ForegroundColor Cyan
    if ($updated.voice) {
        Write-Host "   Stability: $($updated.voice.stability)" -ForegroundColor Gray
        Write-Host "   Clarity: $($updated.voice.clarity)" -ForegroundColor Gray
        Write-Host "   Style: $($updated.voice.style)" -ForegroundColor Gray
        Write-Host "   Similarity Boost: $($updated.voice.similarityBoost)" -ForegroundColor Gray
        Write-Host "   Speaker Boost: $($updated.voice.useSpeakerBoost)" -ForegroundColor Gray
    }

    Write-Host "`n📊 Final Model Settings:" -ForegroundColor Cyan
    if ($updated.model) {
        Write-Host "   Temperature: $($updated.model.temperature)" -ForegroundColor Gray
        Write-Host "   Max Tokens: $($updated.model.maxTokens)" -ForegroundColor Gray
    }

    Write-Host "`n🎉 Done! Test your assistant with a call to verify the improvements." -ForegroundColor Green
    Write-Host "   The voice should now be clearer with no slurring.`n" -ForegroundColor Green

} catch {
    Write-Host "`n❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Message -match "401" -or $_.Exception.Message -match "Unauthorized") {
        Write-Host "   Check that VAPI_PRIVATE_KEY is correct" -ForegroundColor Yellow
    } elseif ($_.Exception.Message -match "404" -or $_.Exception.Message -match "not found") {
        Write-Host "   Check that ASSISTANT_ID is correct" -ForegroundColor Yellow
    }
    exit 1
}

