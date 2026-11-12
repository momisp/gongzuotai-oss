@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动个人工作台...

rem 工作台 Flask
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8765.*LISTENING"') do (
  taskkill /PID %%a /F >nul 2>&1
)
rem 测试点生成 / 敏捷模拟：Vite(5173) + API(5180)
rem 只杀 8765 时，旧 Node 会继续跑，改过的 server/index.mjs 不会生效
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173.*LISTENING"') do (
  taskkill /PID %%a /F /T >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5180.*LISTENING"') do (
  taskkill /PID %%a /F /T >nul 2>&1
)

rem 代理不可用时 pip 会反复重试拖住启动，限制重试与超时，失败不阻塞服务
python -m pip install -q --retries 1 --timeout 5 --disable-pip-version-check -r requirements.txt 2>nul
echo.
echo 启动后请在浏览器访问: http://127.0.0.1:8765
echo 若页面未更新，请按 Ctrl+F5 强制刷新
echo 按 Ctrl+C 可停止服务
echo.
python app.py
pause
