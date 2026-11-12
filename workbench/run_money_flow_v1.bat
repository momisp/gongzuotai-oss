@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
echo [money-flow-v1] 归属→充值回调→分佣断言
python money_flow.py
exit /b %ERRORLEVEL%
