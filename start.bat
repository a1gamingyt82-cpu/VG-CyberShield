@echo off
cd /d "%~dp0"
title bot-hosting.net 24/7 - Discord Bot Hosting Platform

echo ========================================================
echo   Starting bot-hosting.net Discord Bot Platform (24/7)
echo ========================================================
echo.

:: Free any previous stuck node process
taskkill /F /IM node.exe >nul 2>&1

echo Server starting on http://localhost:3000 ...
start "" "http://localhost:3000"
node server.js

pause
