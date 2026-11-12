@echo off
chcp 65001 >nul
title agile-sim-demo 一键启动
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装：https://nodejs.org
  pause
  exit /b 1
)

echo ========================================
echo   agile-sim-demo 敏捷多角色流水线
echo   启动后自动打开 http://127.0.0.1:5173
echo   关闭本窗口即停止服务
echo ========================================
echo.

node scripts/start.mjs
if errorlevel 1 pause
