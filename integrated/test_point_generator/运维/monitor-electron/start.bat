@echo off
chcp 65001 >nul
cd /d "%~dp0"

title 运维监控 · Electron

where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先安装 LTS 版本：https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [错误] 未检测到 npm，请确认 Node.js 已正确安装并加入 PATH。
  pause
  exit /b 1
)

if not exist "node_modules\.bin\electron.cmd" (
  echo 首次运行，正在安装依赖（可能需要几分钟）...
  echo.
  set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
  call npm install
  if errorlevel 1 (
    echo.
    echo [错误] 依赖安装失败。可尝试双击 install-cn.bat 清理后重装。
    pause
    exit /b 1
  )
  echo.
)

echo 正在启动运维监控...
echo.
call npm start
if errorlevel 1 (
  echo.
  echo [错误] 启动失败，请把上方报错信息发给同事排查。
  pause
  exit /b 1
)
