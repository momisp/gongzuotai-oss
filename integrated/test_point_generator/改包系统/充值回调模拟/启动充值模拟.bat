@echo off
chcp 65001 >nul

REM %~dp0 末尾带 \ 时，传入 start /D "……\" 会导致引号被转义，报「语法不正确」
set "WORKDIR=%~dp0"
if "%WORKDIR:~-1%"=="\" set "WORKDIR=%WORKDIR:~0,-1%"

cd /d "%WORKDIR%"

if not exist "package.json" (
  echo [错误] 请在「充值回调模拟」目录内运行本 bat。
  pause
  exit /b 1
)

if not exist "node_modules\dotenv" (
  echo 首次运行，正在安装依赖 npm install …
  call npm install
  if errorlevel 1 (
    echo [错误] npm install 失败，请确认已安装 Node.js。
    pause
    exit /b 1
  )
)

echo 正在新窗口中启动 npm start …
start "recharge-npm" /D "%WORKDIR%" cmd /k npm start

REM 默认端口 3780；若 .env 中修改了 PORT，请同步修改下一行
set "BASE=http://127.0.0.1:3780"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$base='%BASE%'; $u=$base+'/api/health'; $open=$base+'/launcher'; $max=90; for ($i=0; $i -lt $max; $i++) { try { $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 1; if ($r.StatusCode -eq 200) { Start-Process $open; exit 0 } } catch { } Start-Sleep -Milliseconds 400 }; Write-Host '服务未就绪，仍尝试打开页面…'; Start-Process $open"

exit /b 0
