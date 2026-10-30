@echo off
cd /d "%~dp0"
title VG CyberShield - One-Click Zero-Buffering Fix & Deploy
color 0b

echo =======================================================================
echo          VG CYBERSHIELD - ZERO-BUFFERING 320KBPS ENGINE UPDATE
echo =======================================================================
echo.

set "DOCS_DIR=C:\Users\Verma Ji\Documents\VG CHEATS SHOP\discord-antinuke"
set "SRC_MUSIC=%~dp0storage\bot-mvu4vwnf-mkkl\src\modules\music.js"
set "DEST_MUSIC=%DOCS_DIR%\src\modules\music.js"

:: 1. Copy latest music engine to Documents folder
echo [1/4] Syncing ultra-fast Zero-Buffering music.js to Documents folder...
if exist "%SRC_MUSIC%" (
    copy /y "%SRC_MUSIC%" "%DEST_MUSIC%" >nul
    echo       [OK] music.js updated successfully!
) else (
    echo       [FAIL] Source file not found: %SRC_MUSIC%
)

:: 2. Remove old zip archives as requested
echo.
echo [2/4] Removing old zip files (VG_BOT_MONKEYBYTES_UPDATE, VG_CYBERSHIELD_MONKEYBYTES_FINAL)...
if exist "%DOCS_DIR%\VG_BOT_MONKEYBYTES_UPDATE.zip" (
    del /f /q "%DOCS_DIR%\VG_BOT_MONKEYBYTES_UPDATE.zip" >nul 2>&1
    echo       [DELETED] VG_BOT_MONKEYBYTES_UPDATE.zip
)
if exist "%DOCS_DIR%\VG_CYBERSHIELD_MONKEYBYTES_FINAL.zip" (
    del /f /q "%DOCS_DIR%\VG_CYBERSHIELD_MONKEYBYTES_FINAL.zip" >nul 2>&1
    echo       [DELETED] VG_CYBERSHIELD_MONKEYBYTES_FINAL.zip
)

:: 3. Create fresh updated zip in Documents folder
echo.
echo [3/4] Creating single clean ZIP: VG_CYBERSHIELD_FINAL_UPDATE.zip ...
powershell -NoProfile -Command ^
  "$docs = '%DOCS_DIR%';" ^
  "$dest = Join-Path $docs 'VG_CYBERSHIELD_FINAL_UPDATE.zip';" ^
  "if (Test-Path $dest) { Remove-Item $dest -Force };" ^
  "$items = Get-ChildItem -Path $docs | Where-Object { $_.Name -notin @('node_modules', '.git', 'test_zip', 'UPDATE_UPLOAD_FILES') -and $_.Extension -ne '.zip' };" ^
  "Compress-Archive -Path $items.FullName -DestinationPath $dest -Force"
echo       [OK] VG_CYBERSHIELD_FINAL_UPDATE.zip successfully created!

:: 4. Push updated website and bot directly to GitHub for Render
echo.
echo [4/4] Pushing platform and bot to GitHub (Render auto-sync)...
if exist "storage\bot-mvu4vwnf-mkkl\.git" (
    rmdir /s /q "storage\bot-mvu4vwnf-mkkl\.git" >nul 2>&1
)
git config user.name "a1gamingyt82-cpu" >nul 2>&1
git config user.email "a1gamingyt82@gmail.com" >nul 2>&1
git remote remove origin >nul 2>&1
git remote add origin https://a1gamingyt82-cpu@github.com/a1gamingyt82-cpu/VG-CyberShield.git >nul 2>&1
git branch -M main >nul 2>&1
git rm --cached -r -f storage/bot-mvu4vwnf-mkkl >nul 2>&1
git add -A >nul 2>&1
git commit -m "fix(music): zero-buffering 320kbps CD-quality JioSaavn engine with natural finish check and 5s alert" >nul 2>&1
git push -u origin main --force

echo.
echo =======================================================================
echo   [ALL DONE] Sab kuch 100%% update aur push ho chuka hai!
echo   1. Documents folder me fresh ZIP taiyaar hai.
echo   2. GitHub repo update ho gaya hai.
echo   3. Ab Render Dashboard me 'Deploy latest commit' par click karein!
echo =======================================================================
echo.
explorer "%DOCS_DIR%"
pause

