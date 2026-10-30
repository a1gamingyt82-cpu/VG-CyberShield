@echo off
cd /d "%~dp0"
title Push Bot-Hosting Platform Website to GitHub

echo ========================================================
echo   Pushing Complete Bot-Hosting Platform to GitHub:
echo   Repo: https://github.com/a1gamingyt82-cpu/VG-CyberShield
echo ========================================================
echo.

:: 1. Remove nested .git inside storage so Git commits everything cleanly
if exist "storage\bot-mvu4vwnf-mkkl\.git" (
    echo Cleaning nested git folder...
    rmdir /s /q "storage\bot-mvu4vwnf-mkkl\.git" >nul 2>&1
)

git init
git config user.name "a1gamingyt82-cpu"
git config user.email "a1gamingyt82@gmail.com"
git config --global user.name "a1gamingyt82-cpu"
git config --global user.email "a1gamingyt82@gmail.com"

git remote remove origin >nul 2>&1
git remote add origin https://a1gamingyt82-cpu@github.com/a1gamingyt82-cpu/VG-CyberShield.git
git branch -M main

:: Clear cached submodule if any
git rm --cached -r -f storage/bot-mvu4vwnf-mkkl >nul 2>&1

echo 1. Staging all files and packages...
git add -A

echo 2. Committing changes...
git commit -m "fix(vercel): remove deprecated public property from vercel.json"

echo.
echo 3. Pushing to GitHub (origin main)...
git push -u origin main --force

echo.
echo ========================================================
echo   SUCCESS! Pura platform GitHub par upload ho gaya!
echo ========================================================
pause
