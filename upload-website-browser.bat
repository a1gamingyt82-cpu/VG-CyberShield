@echo off
title Upload Website Files to GitHub
echo ========================================================
echo   Opening GitHub Upload Page & Local Website Files Folder
echo ========================================================
echo.
echo 1. Browser me GitHub Upload Page khul raha hai...
start "" "https://github.com/a1gamingyt82-cpu/VG-CyberShield/upload/main"

echo 2. Local folder khul raha hai...
explorer "%~dp0"

echo.
echo ========================================================
echo   INSTRUCTIONS:
echo   Folder se in files/folders ko pakad kar Browser me Drag & Drop karein:
echo   - server.js
echo   - supervisor.js
echo   - securitySandbox.js
echo   - bots.json
echo   - public (folder)
echo.
echo   Fir browser me neeche 'Commit changes' daba dein!
echo ========================================================
pause

