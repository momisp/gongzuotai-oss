@echo off
chcp 65001 >nul
set "ROOT=%~dp0"
cd /d "%ROOT%"

echo ========================================
echo   工具小站 - 一键启动
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 node，请先安装 Node.js 并加入 PATH。
  pause
  exit /b 1
)

echo [1/3] 「她自己」聊天桥接 ^(端口 45791^)...
call :IsPortListening 45791
if %errorlevel%==0 (
  echo       已在运行，跳过（无需再开窗口）。若要重启请先关掉 her-chat-bridge 窗口。
) else (
  start "her-chat-bridge" cmd /k "cd /d "%ROOT%" && title her-chat-bridge && node scripts\her-chat-bridge.mjs"
)

echo [2/3] B 站桥接 ^(端口 45790^)...
call :IsPortListening 45790
if %errorlevel%==0 (
  echo       已在运行，跳过。
) else (
  start "bili-bridge" cmd /k "cd /d "%ROOT%" && title bili-bridge && node scripts\bili-bridge.mjs"
)

echo [3/3] 启动桌面版 Electron...
timeout /t 2 /nobreak >nul
cd /d "%ROOT%desktop"
if not exist "node_modules\electron" (
  echo 首次运行，正在 npm install ...
  call npm install
)
start "tools-site-desktop" cmd /c "npm start"

echo.
echo 完成。桥接窗口标题：her-chat-bridge / bili-bridge
echo 关掉对应窗口即可停止桥接；不要重复双击本脚本以免端口占用报错。
pause
exit /b 0

:IsPortListening
netstat -ano | findstr /C:"127.0.0.1:%1 " | findstr /I "LISTENING" >nul 2>&1
exit /b %errorlevel%
