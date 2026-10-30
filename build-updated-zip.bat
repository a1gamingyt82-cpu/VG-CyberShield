@echo off
title Build Updated Bot Zip (Multi-Cloud & Zero-Ad Music)
echo ========================================================
echo   Updating Bot & Generating Fresh Zip Archive
echo ========================================================
echo.

set "DOCS_DIR=C:\Users\Verma Ji\Documents\VG CHEATS SHOP\discord-antinuke"
set "SRC_MUSIC=%~dp0storage\bot-mvu4vwnf-mkkl\src\modules\music.js"
set "DEST_MUSIC=%DOCS_DIR%\src\modules\music.js"

:: 1. Copy latest music.js to Documents folder
if exist "%SRC_MUSIC%" (
    echo 1. Updating music.js in Documents\VG CHEATS SHOP\discord-antinuke...
    copy /y "%SRC_MUSIC%" "%DEST_MUSIC%" >nul
    echo    [SUCCESS] Latest music engine copied!
)

:: 2. Remove old zips from Documents folder as requested
echo.
echo 2. Removing old zip files...
if exist "%DOCS_DIR%\VG_BOT_MONKEYBYTES_UPDATE.zip" (
    del /f /q "%DOCS_DIR%\VG_BOT_MONKEYBYTES_UPDATE.zip"
    echo    [DELETED] VG_BOT_MONKEYBYTES_UPDATE.zip
)
if exist "%DOCS_DIR%\VG_CYBERSHIELD_MONKEYBYTES_FINAL.zip" (
    del /f /q "%DOCS_DIR%\VG_CYBERSHIELD_MONKEYBYTES_FINAL.zip"
    echo    [DELETED] VG_CYBERSHIELD_MONKEYBYTES_FINAL.zip
)

:: 3. Create fresh updated zip in Documents folder
echo.
echo 3. Creating brand new updated ZIP: VG_CYBERSHIELD_FINAL_UPDATE.zip ...
powershell -NoProfile -Command ^
  "$docs = '%DOCS_DIR%';" ^
  "$dest = Join-Path $docs 'VG_CYBERSHIELD_FINAL_UPDATE.zip';" ^
  "if (Test-Path $dest) { Remove-Item $dest -Force };" ^
  "$items = Get-ChildItem -Path $docs | Where-Object { $_.Name -notin @('node_modules', '.git', 'test_zip', 'UPDATE_UPLOAD_FILES') -and $_.Extension -ne '.zip' };" ^
  "Compress-Archive -Path $items.FullName -DestinationPath $dest -Force"

echo.
echo ========================================================
echo   [SUCCESS] Naya Updated Zip taiyaar ho gaya hai!
echo   File: VG_CYBERSHIELD_FINAL_UPDATE.zip
echo   Folder: Documents\VG CHEATS SHOP\discord-antinuke
echo ========================================================
echo.
echo Folder khol raha hoon...
explorer "%DOCS_DIR%"
pause

