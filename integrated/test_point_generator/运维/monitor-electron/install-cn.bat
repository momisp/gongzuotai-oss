@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
echo 使用镜像: %ELECTRON_MIRROR%
echo.

if exist node_modules (
  echo 删除 node_modules ...
  rmdir /s /q node_modules
)
if exist package-lock.json (
  echo 删除 package-lock.json ...
  del /f /q package-lock.json
)

echo npm cache clean --force
call npm cache clean --force

echo.
echo npm install ...
call npm install
echo.
if errorlevel 1 (
  echo 安装失败，请把上方报错截图或日志发给同事排查。
) else (
  echo 完成。运行: npm start
)
pause
