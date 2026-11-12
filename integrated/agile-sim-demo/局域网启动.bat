@echo off
chcp 65001 >nul
title agile-sim-demo 局域网共享
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装：https://nodejs.org
  pause
  exit /b 1
)

echo ========================================
echo   agile-sim-demo — 局域网访问
echo   启动后终端会打印 http://你的IP:5173
echo   同事用该地址打开（须同一 WiFi/网段）
echo   关闭本窗口即停止服务
echo ========================================
echo.

node scripts/start.mjs --lan
if errorlevel 1 pause
