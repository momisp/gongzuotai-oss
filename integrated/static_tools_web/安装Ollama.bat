@echo off
chcp 65001 >nul
set "ROOT=%~dp0"
cd /d "%ROOT%"

echo ========================================
echo   安装 Ollama（本机免费模型）
echo ========================================
echo.

set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
if exist "%OLLAMA_EXE%" (
  echo [已安装] 
  "%OLLAMA_EXE%" --version
  goto :pull_model
)

where ollama >nul 2>&1
if %errorlevel%==0 (
  echo [已安装]
  ollama --version
  goto :pull_model
)

echo [1/3] 尝试 winget 安装（需联网，安装包约 2GB）...
where winget >nul 2>&1
if %errorlevel%==0 (
  winget install Ollama.Ollama --accept-package-agreements --accept-source-agreements
  if %errorlevel%==0 goto :after_install
  echo winget 失败，尝试下一种方式...
)

echo.
echo [2/3] 打开官网下载页，请手动下载并安装 OllamaSetup.exe：
start https://ollama.com/download/windows
echo.
echo 安装完成后请重新双击本脚本，会自动下载聊天模型。
pause
exit /b 0

:after_install
timeout /t 3 /nobreak >nul
if not exist "%OLLAMA_EXE%" (
  echo 若刚装完仍找不到 ollama，请重启电脑或新开终端后再运行本脚本。
  pause
  exit /b 1
)

:pull_model
echo.
echo [3/3] 下载模型 llama3.2（约 2GB，仅需一次）...
ollama pull llama3.2
if errorlevel 1 (
  echo 模型下载失败，可稍后手动执行：ollama pull llama3.2
  pause
  exit /b 1
)

echo.
echo ========================================
echo   完成
echo ========================================
echo  1. 运行 启动工具小站.bat
echo  2. 打开「她自己」- 点「一键 Ollama」
echo  3. API Key 填 ollama，模型填 llama3.2
echo.
pause
exit /b 0
