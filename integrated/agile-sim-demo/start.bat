@echo off
chcp 65001 >nul
title agile-sim-demo
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装：https://nodejs.org
  pause
  exit /b 1
)

echo ========================================
echo   agile-sim-demo
echo   http://127.0.0.1:5173
echo ========================================
echo.

node scripts/start.mjs
if errorlevel 1 pause
