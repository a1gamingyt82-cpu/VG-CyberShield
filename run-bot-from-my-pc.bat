@echo off
cd /d "%~dp0"
title VG CyberShield Discord Bot (Local Server)

echo ========================================================
echo   Starting VG CyberShield Discord Bot from YOUR PC / Server
echo ========================================================
echo.

cd /d "%~dp0\storage\bot-mvu4vwnf-mkkl"

echo [1/2] Connecting bot to Discord...
node index.js

echo.
echo Bot stopped.
pause

