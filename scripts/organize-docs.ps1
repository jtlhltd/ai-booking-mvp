# Organize documentation files into folders (PowerShell)

Write-Host "📁 Organizing documentation files..." -ForegroundColor Cyan

# Outreach guides
$outreachFiles = @(
    "OUTREACH-*.md",
    "LINKEDIN-*.md",
    "STEP-BY-STEP-OUTREACH.md",
    "OUTREACH-TRACKER-ADVANCED.csv"
)

foreach ($pattern in $outreachFiles) {
    Get-ChildItem -Path . -Filter $pattern -ErrorAction SilentlyContinue | ForEach-Object {
        Move-Item -Path $_.FullName -Destination "docs/outreach/" -Force -ErrorAction SilentlyContinue
        Write-Host "  Moved: $($_.Name) -> docs/outreach/" -ForegroundColor Green
    }
}

# Setup guides
$setupFiles = @(
    "INSTANTLY-*.md",
    "GOOGLE-*.md",
    "CONVERTKIT-*.md",
    "MAILCHIMP-*.md",
    "RENDER-*.md",
    "POST-DEPLOYMENT-CHECKLIST.md"
)

foreach ($pattern in $setupFiles) {
    Get-ChildItem -Path . -Filter $pattern -ErrorAction SilentlyContinue | ForEach-Object {
        Move-Item -Path $_.FullName -Destination "docs/setup/" -Force -ErrorAction SilentlyContinue
        Write-Host "  Moved: $($_.Name) -> docs/setup/" -ForegroundColor Green
    }
}

# How-to guides
$guideFiles = @(
    "HOW-TO-*.md",
    "GET-500-LEADS-FAST.md",
    "FREE-LEAD-GENERATION-TOOLS.md",
    "SCALE-EMAIL-VOLUME*.md",
    "HANDLING-UNSUBSCRIBES.md",
    "ADDING-CTAs-TO-EMAILS.md"
)

foreach ($pattern in $guideFiles) {
    Get-ChildItem -Path . -Filter $pattern -ErrorAction SilentlyContinue | ForEach-Object {
        Move-Item -Path $_.FullName -Destination "docs/guides/" -Force -ErrorAction SilentlyContinue
        Write-Host "  Moved: $($_.Name) -> docs/guides/" -ForegroundColor Green
    }
}

# Completion summaries
$completedFiles = @(
    "COMPLETED-TODOS.md",
    "SORTED-OUT-SUMMARY.md",
    "REMAINING-TASKS.md"
)

foreach ($file in $completedFiles) {
    if (Test-Path $file) {
        Move-Item -Path $file -Destination "docs/completed/" -Force -ErrorAction SilentlyContinue
        Write-Host "  Moved: $file -> docs/completed/" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Documentation organized!" -ForegroundColor Green

