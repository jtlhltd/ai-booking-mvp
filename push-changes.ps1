# Quick Git Push Script
# This script adds all changes, commits, and pushes to GitHub

param(
    [string]$Message = "Update: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
)

Write-Host "🔄 Syncing changes to GitHub..." -ForegroundColor Cyan

# Add all changes
Write-Host "📁 Adding files..." -ForegroundColor Yellow
& "C:\Program Files\Git\bin\git.exe" add .

# Check if there are changes to commit
$status = & "C:\Program Files\Git\bin\git.exe" status --porcelain
if ($status) {
    Write-Host "💾 Committing changes: $Message" -ForegroundColor Yellow
    & "C:\Program Files\Git\bin\git.exe" commit -m $Message
    
    Write-Host "🚀 Pushing to GitHub..." -ForegroundColor Yellow
    & "C:\Program Files\Git\bin\git.exe" push
    
    Write-Host "✅ Successfully synced to GitHub!" -ForegroundColor Green
} else {
    Write-Host "ℹ️  No changes to commit" -ForegroundColor Blue
}

Write-Host "`n📋 Repository: https://github.com/jtlhltd/ai-booking-mvp (main branch)" -ForegroundColor Cyan
