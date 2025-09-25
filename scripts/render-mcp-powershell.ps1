# PowerShell-based MCP server for Render management
# This provides basic Render deployment management without requiring Node.js

param(
    [string]$Action = "help"
)

# Render API configuration
$RENDER_API_KEY = "rnd_owi9D773n4VhDK2tbvuXpqRH4Wfz"
$RENDER_SERVICE_URL = "https://ai-booking-mvp.onrender.com"

function Get-RenderStatus {
    Write-Host "🔍 Checking Render service status..." -ForegroundColor Cyan
    
    try {
        # Check service health directly
        $healthResponse = Invoke-RestMethod -Uri "$RENDER_SERVICE_URL/health" -Method GET -TimeoutSec 10
        Write-Host "✅ Service is running!" -ForegroundColor Green
        Write-Host "📍 URL: $RENDER_SERVICE_URL" -ForegroundColor White
        Write-Host "🏥 Health: OK" -ForegroundColor Green
    }
    catch {
        Write-Host "❌ Service is not responding" -ForegroundColor Red
        Write-Host "📍 URL: $RENDER_SERVICE_URL" -ForegroundColor White
        Write-Host "⚠️ Error: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

function Get-RenderLogs {
    Write-Host "📋 Render Logs" -ForegroundColor Cyan
    Write-Host "To view logs:" -ForegroundColor White
    Write-Host "1. Go to https://dashboard.render.com" -ForegroundColor White
    Write-Host "2. Select your service" -ForegroundColor White
    Write-Host "3. Click on 'Logs' tab" -ForegroundColor White
    Write-Host ""
    Write-Host "Or use the Render API with your key: $RENDER_API_KEY" -ForegroundColor Gray
}

function Invoke-RenderDeploy {
    Write-Host "🚀 Triggering Render deployment..." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To manually trigger a deployment:" -ForegroundColor White
    Write-Host "1. Go to https://dashboard.render.com" -ForegroundColor White
    Write-Host "2. Select your service" -ForegroundColor White
    Write-Host "3. Click 'Manual Deploy'" -ForegroundColor White
    Write-Host ""
    Write-Host "Or push changes to your Git repository for automatic deployment:" -ForegroundColor White
    Write-Host "git add ." -ForegroundColor Gray
    Write-Host "git commit -m 'Deploy update'" -ForegroundColor Gray
    Write-Host "git push" -ForegroundColor Gray
}

function Show-Help {
    Write-Host "🔧 Render MCP PowerShell Tools" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Available commands:" -ForegroundColor White
    Write-Host "  status  - Check service status" -ForegroundColor Green
    Write-Host "  logs    - Show log access info" -ForegroundColor Green
    Write-Host "  deploy  - Trigger deployment" -ForegroundColor Green
    Write-Host "  help    - Show this help" -ForegroundColor Green
    Write-Host ""
    Write-Host "Usage examples:" -ForegroundColor White
    Write-Host "  .\render-mcp-powershell.ps1 status" -ForegroundColor Gray
    Write-Host "  .\render-mcp-powershell.ps1 logs" -ForegroundColor Gray
    Write-Host "  .\render-mcp-powershell.ps1 deploy" -ForegroundColor Gray
}

# Main execution
switch ($Action.ToLower()) {
    "status" { Get-RenderStatus }
    "logs" { Get-RenderLogs }
    "deploy" { Invoke-RenderDeploy }
    "help" { Show-Help }
    default { 
        Write-Host "❌ Unknown action: $Action" -ForegroundColor Red
        Show-Help 
    }
}
