@echo off
echo Pushing Node.js version fixes to GitHub...
git add .
git commit -m "Fix: Force Node.js v20 and remove better-sqlite3 completely"
git push origin main
echo Done!
pause
