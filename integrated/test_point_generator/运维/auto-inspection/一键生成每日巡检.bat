@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ========================================
echo   每日巡检报告（ECS + 证书到期）
echo ========================================
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 python，请先安装 Python 3.10+ 并勾选 Add to PATH
  pause
  exit /b 1
)

if not exist "config.yaml" (
  if exist "config.example.yaml" (
    copy /Y "config.example.yaml" "config.yaml" >nul
    echo [提示] 已从 config.example.yaml 生成 config.yaml，请按需改实例名关键词/阈值
  ) else (
    echo [错误] 缺少 config.yaml / config.example.yaml
    pause
    exit /b 1
  )
)

if not exist ".env" (
  if exist "env.example" (
    copy /Y "env.example" ".env" >nul
    echo [错误] 已生成 .env 模板，请填入阿里云 AccessKey 后再运行：
    echo         ALIBABA_CLOUD_ACCESS_KEY_ID / ALIBABA_CLOUD_ACCESS_KEY_SECRET
    echo.
    notepad ".env"
    pause
    exit /b 1
  )
  echo [错误] 缺少 .env（AccessKey）
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo [1/3] 创建虚拟环境 .venv ...
  python -m venv .venv
  if errorlevel 1 (
    echo [错误] 创建虚拟环境失败
    pause
    exit /b 1
  )
  echo [2/3] 安装依赖 ...
  ".venv\Scripts\python.exe" -m pip install -U pip -q
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 (
    echo [错误] 依赖安装失败
    pause
    exit /b 1
  )
) else (
  echo [检查] 虚拟环境已就绪
)

echo [运行] 拉取 ECS 云监控 + 证书到期，生成 Markdown / Excel ...
echo.
".venv\Scripts\python.exe" daily_report.py --out "%~dp0reports"
set ERR=%ERRORLEVEL%
echo.

if %ERR% NEQ 0 (
  echo [失败] 退出码 %ERR%。请检查 .env AccessKey、config.yaml 地域与 RAM 权限。
  pause
  exit /b %ERR%
)

echo [完成] 报告目录：%~dp0reports
if exist "%~dp0reports" start "" explorer "%~dp0reports"
pause
exit /b 0
