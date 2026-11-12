@echo off
chcp 65001 >nul
echo ============================================================
echo   Apifox Runner 配置检查工具 (Windows)
echo ============================================================
echo.

echo ============================================================
echo   1. 检查 Apifox 进程状态
echo ============================================================
tasklist | findstr /i apifox
if %errorlevel% neq 0 (
    echo ❌ 未发现 Apifox 进程
)
echo.

echo ============================================================
echo   2. 检查网络连接
echo ============================================================
echo 测试 apifox.com...
ping -n 2 apifox.com
echo.
echo 测试 api.apifox.com...
ping -n 2 api.apifox.com
echo.

echo ============================================================
echo   3. 检查配置文件
echo ============================================================
if exist "%APPDATA%\Apifox\runner\config.json" (
    echo ✅ 找到配置文件: %APPDATA%\Apifox\runner\config.json
    echo.
    echo 配置文件内容:
    type "%APPDATA%\Apifox\runner\config.json"
) else (
    echo ❌ 配置文件不存在: %APPDATA%\Apifox\runner\config.json
)
echo.

echo ============================================================
echo   4. 检查日志文件
echo ============================================================
if exist "%APPDATA%\Apifox\runner\logs" (
    echo ✅ 找到日志目录: %APPDATA%\Apifox\runner\logs
    echo.
    echo 日志文件列表:
    dir /b /o-d "%APPDATA%\Apifox\runner\logs\*.log" 2>nul
    echo.
    echo 最新日志内容（最后20行）:
    for /f "delims=" %%f in ('dir /b /o-d "%APPDATA%\Apifox\runner\logs\*.log" 2^>nul') do (
        echo 文件: %%f
        powershell -Command "Get-Content '%APPDATA%\Apifox\runner\logs\%%f' -Tail 20"
        goto :logdone
    )
    :logdone
) else (
    echo ❌ 日志目录不存在: %APPDATA%\Apifox\runner\logs
)
echo.

echo ============================================================
echo   5. 检查端口占用
echo ============================================================
echo 检查常用端口 (8080, 3000, 5000, 8000)...
netstat -ano | findstr "8080 3000 5000 8000"
echo.

echo ============================================================
echo   6. 检查 Apifox 安装目录
echo ============================================================
if exist "%LOCALAPPDATA%\Programs\Apifox" (
    echo ✅ 找到安装目录: %LOCALAPPDATA%\Programs\Apifox
) else if exist "%ProgramFiles%\Apifox" (
    echo ✅ 找到安装目录: %ProgramFiles%\Apifox
) else (
    echo ❌ 未找到 Apifox 安装目录
)
echo.

echo ============================================================
echo   检查完成！
echo ============================================================
pause
