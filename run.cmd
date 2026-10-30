@echo off
cd /d "%~dp0"
taskkill /F /IM node.exe >nul 2>&1
start "" "http://localhost:3000"
node server.js
pause

