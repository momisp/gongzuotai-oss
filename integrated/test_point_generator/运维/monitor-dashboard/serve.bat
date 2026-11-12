@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 本目录启动静态站点: http://127.0.0.1:8765
echo 浏览器打开: http://127.0.0.1:8765/index.html
echo 按 Ctrl+C 停止
python -m http.server 8765
pause
