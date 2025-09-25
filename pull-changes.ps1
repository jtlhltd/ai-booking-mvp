# Quick Git Pull Script
# This script pulls the latest changes from GitHub

Write-Host "🔄 Pulling latest changes from GitHub..." -ForegroundColor Cyan

# Pull changes
& "C:\Program Files\Git\bin\git.exe" pull

Write-Host "✅ Successfully synced from GitHub!" -ForegroundColor Green
Write-Host "`n📋 Repository: https://github.com/jtlhltd/ai-booking-mvp (main branch)" -ForegroundColor Cyan
