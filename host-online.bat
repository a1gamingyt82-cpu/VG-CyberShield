@echo off
cd /d "%~dp0"
title bot-hosting.net 24/7 - Make Dashboard Publicly Online

echo ====================================================================
echo   [bot-hosting.net] Make Dashboard Live on the Internet (Free)
echo ====================================================================
echo.
echo Is dashboard ko internet par publicly live kiya ja raha hai...
echo Thodi der me aapko ek FREE PUBLIC LINK (https://...) milega,
echo jisko aap Mobile ya kisi bhi device se open kar sakte hain!
echo.
echo ====================================================================
echo Starting free Cloudflare / Localtunnel ...
echo ====================================================================

npx --yes untun tunnel --port 3000

if %errorlevel% neq 0 (
    echo.
    echo Trying fallback with localtunnel...
    npx --yes localtunnel --port 3000
)

pause

