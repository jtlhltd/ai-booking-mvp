#!/bin/bash
# Organize documentation files into folders

# Outreach guides
mv OUTREACH-*.md docs/outreach/ 2>/dev/null
mv LINKEDIN-*.md docs/outreach/ 2>/dev/null
mv STEP-BY-STEP-OUTREACH.md docs/outreach/ 2>/dev/null
mv OUTREACH-TRACKER-ADVANCED.csv docs/outreach/ 2>/dev/null

# Setup guides
mv INSTANTLY-*.md docs/setup/ 2>/dev/null
mv GOOGLE-*.md docs/setup/ 2>/dev/null
mv CONVERTKIT-*.md docs/setup/ 2>/dev/null
mv MAILCHIMP-*.md docs/setup/ 2>/dev/null
mv RENDER-*.md docs/setup/ 2>/dev/null
mv POST-DEPLOYMENT-CHECKLIST.md docs/setup/ 2>/dev/null

# How-to guides
mv HOW-TO-*.md docs/guides/ 2>/dev/null
mv GET-500-LEADS-FAST.md docs/guides/ 2>/dev/null
mv FREE-LEAD-GENERATION-TOOLS.md docs/guides/ 2>/dev/null
mv SCALE-EMAIL-VOLUME*.md docs/guides/ 2>/dev/null
mv HANDLING-UNSUBSCRIBES.md docs/guides/ 2>/dev/null
mv ADDING-CTAs-TO-EMAILS.md docs/guides/ 2>/dev/null

# Completion summaries
mv COMPLETED-TODOS.md docs/completed/ 2>/dev/null
mv SORTED-OUT-SUMMARY.md docs/completed/ 2>/dev/null
mv REMAINING-TASKS.md docs/completed/ 2>/dev/null

echo "✅ Documentation organized!"

