@echo off
cd /d "%~dp0storage\bot-mvu4vwnf-mkkl"
title Push VG-CyberShield to GitHub (a1gamingyt82-cpu)

echo ========================================================
echo   Pushing VG-CyberShield to your GitHub Repository:
echo   User: a1gamingyt82-cpu
echo   Repo: https://github.com/a1gamingyt82-cpu/VG-CyberShield
echo ========================================================
echo.

git init
git config --global init.defaultBranch main
git config user.name "a1gamingyt82-cpu"
git config user.email "a1gamingyt82@gmail.com"
git config --global user.name "a1gamingyt82-cpu"
git config --global user.email "a1gamingyt82@gmail.com"

:: Force Git to use a1gamingyt82-cpu account
git remote remove origin >nul 2>&1
git remote add origin https://a1gamingyt82-cpu@github.com/a1gamingyt82-cpu/VG-CyberShield.git
git branch -M main

echo Adding bot files...
git add -A

echo Committing code...
git commit -m "feat: VG-CyberShield 24/7 Discord bot with Zero-Buffering music engine" >nul 2>&1

echo.
echo ========================================================
echo Pushing code as 'a1gamingyt82-cpu'...
echo (Browser popup me 'a1gamingyt82-cpu' se login / Authorize karein)
echo ========================================================
git push -u origin main --force

if %errorlevel% equ 0 (
    echo.
    echo ========================================================
    echo   SUCCESS! Aapka bot GitHub par upload ho chuka hai!
    echo   Repo: https://github.com/a1gamingyt82-cpu/VG-CyberShield
    echo ========================================================
) else (
    echo.
    echo ⚠️ Agar permission error aaye, to browser me jaakar:
    echo 1. https://github.com/a1gamingyt82-cpu/VG-CyberShield kholein.
    echo 2. 'uploading an existing file' par click karke direct files drag-and-drop karein!
)

pause

