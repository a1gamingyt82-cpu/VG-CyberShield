@echo off
cd /d "%~dp0"
title Cloudflare Tunnel - Public 24/7 Link for Website

echo ========================================================
echo   Cloudflare Tunnel - 100%% Free Public Internet Link
echo ========================================================
echo.

:: 1. Check if cloudflared exists, if not download it automatically
if not exist "cloudflared.exe" (
    echo [1/2] Downloading official Cloudflare Tunnel engine (free)...
    curl -L --output cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
    echo Download complete!
    echo.
)

echo [2/2] Generating your Free Public URL...
echo.
echo ========================================================
echo   Aapko neeche ek 'https://...trycloudflare.com' link milega.
echo   Us link ko aap apne mobile, dosto ya kisi ke sath bhi
echo   share kar sakte hain!
echo ========================================================
echo.

cloudflared.exe tunnel --url http://localhost:3000

pause

