@echo off
chcp 65001 >nul
REM 发送钉钉通知的批处理脚本
REM 使用方法：发送钉钉通知.bat <webhook_url> <status> <report_url>

setlocal enabledelayedexpansion

if "%~3"=="" (
    echo 使用方法: 发送钉钉通知.bat ^<webhook_url^> ^<status^> ^<report_url^>
    echo.
    echo 参数说明:
    echo   webhook_url: 钉钉机器人 Webhook URL
    echo   status: 状态（success 或 failure）
    echo   report_url: 测试报告 URL
    echo.
    echo 示例:
    echo   发送钉钉通知.bat https://oapi.dingtalk.com/robot/send?access_token=xxx success http://jenkins/report
    exit /b 1
)

set WEBHOOK_URL=%~1
set STATUS=%~2
set REPORT_URL=%~3

echo ============================================================
echo   发送钉钉通知
echo ============================================================
echo.
echo Webhook URL: %WEBHOOK_URL%
echo 状态: %STATUS%
echo 报告 URL: %REPORT_URL%
echo.

REM 根据状态设置消息内容
if /i "%STATUS%"=="success" (
    set EMOJI=✅
    set STATUS_TEXT=成功
) else (
    set EMOJI=❌
    set STATUS_TEXT=失败
)

REM 构建 JSON 消息（简化版，实际应该使用 PowerShell 或 Python）
echo 注意：此脚本需要 PowerShell 或 Python 支持
echo 建议使用 Jenkins Pipeline 中的 httpRequest 发送
echo.
echo 消息内容预览:
echo %EMOJI% 接口自动化测试执行%STATUS_TEXT%
echo 测试报告: %REPORT_URL%
echo.

REM 如果系统有 PowerShell，可以使用 PowerShell 发送
where powershell >nul 2>&1
if %errorlevel% equ 0 (
    echo 使用 PowerShell 发送通知...
    powershell -Command ^
        "$body = @{msgtype='markdown';markdown=@{title='接口自动化测试 - %STATUS_TEXT%';text='%EMOJI% **接口自动化测试执行%STATUS_TEXT%**\n\n**测试报告:**\n[点击查看](' + '%REPORT_URL%' + ')'}} | ConvertTo-Json -Depth 10; ^
        Invoke-RestMethod -Uri '%WEBHOOK_URL%' -Method Post -Body $body -ContentType 'application/json'"
    
    if %errorlevel% equ 0 (
        echo ✅ 钉钉通知发送成功
    ) else (
        echo ❌ 钉钉通知发送失败
        exit /b 1
    )
) else (
    echo ⚠️  未找到 PowerShell，无法发送通知
    echo 建议：使用 Jenkins Pipeline 中的 httpRequest 发送
    exit /b 1
)

echo.
echo ============================================================
echo   完成
echo ============================================================
