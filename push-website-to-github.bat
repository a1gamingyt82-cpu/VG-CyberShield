@echo off
cd /d "%~dp0"
title Push Bot-Hosting Platform Website to GitHub

echo ========================================================
echo   Pushing Bot-Hosting Website Platform to GitHub:
echo   User: a1gamingyt82-cpu
echo   Repo: https://github.com/a1gamingyt82-cpu/VG-CyberShield
echo ========================================================
echo.

git init
git config user.name "a1gamingyt82-cpu"
git config user.email "a1gamingyt82@gmail.com"
git config --global user.name "a1gamingyt82-cpu"
git config --global user.email "a1gamingyt82@gmail.com"

git remote remove origin >nul 2>&1
git remote add origin https://a1gamingyt82-cpu@github.com/a1gamingyt82-cpu/VG-CyberShield.git
git branch -M main

echo 1. Staging files (server.js, public, supervisor, etc)...
git add -A

echo 2. Committing website files...
git commit -m "feat: full bot-hosting web platform with live dashboard and supervisor"

echo.
echo 3. Pushing to GitHub...
git push -u origin main --force

echo.
echo ========================================================
echo   Check your GitHub: https://github.com/a1gamingyt82-cpu/VG-CyberShield
echo ========================================================
pause
