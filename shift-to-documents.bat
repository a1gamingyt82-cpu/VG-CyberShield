@echo off
title Shift VG-CyberShield to Documents
echo ========================================================
echo   Shifting all files to Documents\VG-CyberShield...
echo ========================================================
echo.

set "DEST1=%USERPROFILE%\Documents\VG-CyberShield"
set "DEST2=%USERPROFILE%\OneDrive\Documents\VG-CyberShield"

if not exist "%DEST1%" mkdir "%DEST1%"
echo Copying to Local Documents...
robocopy "%~dp0." "%DEST1%" /E /COPY:DAT /R:1 /W:1 /XD "%~dp0node_modules" "%~dp0storage\bot-mvu4vwnf-mkkl\node_modules" >nul 2>&1

if exist "%USERPROFILE%\OneDrive\Documents" (
    if not exist "%DEST2%" mkdir "%DEST2%"
    echo Copying to OneDrive Documents...
    robocopy "%~dp0." "%DEST2%" /E /COPY:DAT /R:1 /W:1 /XD "%~dp0node_modules" "%~dp0storage\bot-mvu4vwnf-mkkl\node_modules" >nul 2>&1
    start "" explorer "%DEST2%"
) else (
    start "" explorer "%DEST1%"
)

echo.
echo ========================================================
echo   SUCCESS! Saari files Documents me shift ho chuki hain!
echo   Folder khul chuka hai!
echo ========================================================
pause
