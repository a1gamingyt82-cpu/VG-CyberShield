@echo off
title Sync Updated Music Engine to Documents
echo ========================================================
echo   Copying updated music.js to Documents\VG CHEATS SHOP
echo ========================================================
echo.

set "SRC=%~dp0storage\bot-mvu4vwnf-mkkl\src\modules\music.js"
set "DEST=C:\Users\Verma Ji\Documents\VG CHEATS SHOP\discord-antinuke\src\modules\music.js"

if exist "%SRC%" (
    copy /y "%SRC%" "%DEST%" >nul
    echo [SUCCESS] music.js successfully updated in Documents\VG CHEATS SHOP\discord-antinuke\src\modules!
) else (
    echo [ERROR] Source file not found: %SRC%
)

echo.
pause

