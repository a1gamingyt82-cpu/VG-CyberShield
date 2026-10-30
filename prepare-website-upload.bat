@echo off
title Prepare Website Files for GitHub Upload
echo ========================================================
echo   Opening Bot-Hosting Platform Website Folder
echo ========================================================
echo.
echo Yeh folder khul raha hai jisme aapki puri Website files hain:
echo - server.js (Main Web Platform Server)
echo - supervisor.js (24/7 Bot Supervisor)
echo - securitySandbox.js (Anti-Hack Sandbox)
echo - bots.json (Bot Database)
echo - package.json
echo - public/ (index.html Web Dashboard)
echo - storage/ (Bots Storage)
echo.
explorer "%~dp0"
echo Done! In files ko aap GitHub par upload kar sakte hain.
pause

