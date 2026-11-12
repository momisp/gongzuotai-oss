@echo off
chcp 65001 >nul
echo ============================================================
echo   Apifox Runner 日志分析工具
echo ============================================================
echo.

:: 检查容器是否存在
docker ps -a | findstr apifox-runner >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 未找到 apifox-runner 容器！
    echo 请先部署 Runner
    pause
    exit /b 1
)

echo [1/6] 检查容器状态...
docker ps | findstr apifox-runner >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Runner 容器正在运行
) else (
    echo ⚠️  Runner 容器已停止
    echo 正在启动容器...
    docker start apifox-runner
    timeout /t 3 >nul
)
echo.

echo [2/6] 检查最近的错误信息...
echo ----------------------------------------
docker logs --tail 50 apifox-runner | findstr /i /c:"error" /c:"Error" /c:"ERROR"
if %errorlevel% equ 0 (
    echo ----------------------------------------
    echo ⚠️  发现错误信息（见上方）
) else (
    echo ✅ 未发现明显错误
)
echo.

echo [3/6] 检查 400 错误（认证问题）...
echo ----------------------------------------
docker logs apifox-runner | findstr /i "400"
if %errorlevel% equ 0 (
    echo ----------------------------------------
    echo ❌ 发现 400 错误！
    echo.
    echo 可能原因：
    echo 1. Authorization Token 无效或过期
    echo 2. Runner 配置不正确
    echo 3. Runner ID 不匹配
    echo.
    echo 建议操作：
    echo 1. 在 Apifox 中删除旧 Runner 配置
    echo 2. 重新部署 Runner
    echo 3. 在 Apifox 中重新添加 Runner
) else (
    echo ✅ 未发现 400 错误
)
echo.

echo [4/6] 检查 WebSocket 连接问题...
echo ----------------------------------------
docker logs apifox-runner | findstr /i /c:"websocket" /c:"WebSocket" /c:"Websocket"
if %errorlevel% equ 0 (
    echo ----------------------------------------
    echo ⚠️  发现 WebSocket 相关日志
    echo 检查 WebSocket 连接状态...
    docker logs apifox-runner | findstr /i /c:"close" /c:"disconnect" /c:"1006"
) else (
    echo ✅ 未发现 WebSocket 错误
)
echo.

echo [5/6] 检查认证相关错误...
echo ----------------------------------------
docker logs apifox-runner | findstr /i /c:"authorization" /c:"token" /c:"401" /c:"403"
if %errorlevel% equ 0 (
    echo ----------------------------------------
    echo ⚠️  发现认证相关错误
    echo 建议：检查 Runner Token 是否正确
) else (
    echo ✅ 未发现认证错误
)
echo.

echo [6/6] 检查网络连接...
echo ----------------------------------------
Test-NetConnection -ComputerName api.apifox.com -Port 443 -InformationLevel Quiet >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ 可以访问 api.apifox.com
) else (
    echo ❌ 无法访问 api.apifox.com
    echo 可能原因：
    echo 1. 网络连接问题
    echo 2. 防火墙阻止连接
    echo 3. 代理设置问题
)
echo.

echo ============================================================
echo   详细日志分析
echo ============================================================
echo.
echo 最近 30 行日志：
echo ----------------------------------------
docker logs --tail 30 apifox-runner
echo ----------------------------------------
echo.

echo ============================================================
echo   诊断结果和建议
echo ============================================================
echo.

:: 检查是否有 400 错误
docker logs apifox-runner | findstr /i "400" >nul 2>&1
if %errorlevel% equ 0 (
    echo 🔴 主要问题：发现 400 错误（认证失败）
    echo.
    echo 📋 解决步骤：
    echo 1. 停止并删除旧容器：
    echo    docker stop apifox-runner
    echo    docker rm apifox-runner
    echo.
    echo 2. 在 Apifox 客户端中删除旧 Runner 配置
    echo.
    echo 3. 重新部署 Runner：
    echo    运行 Apifox_Runner_快速部署.bat
    echo.
    echo 4. 在 Apifox 中重新添加 Runner
    echo    从日志中获取新的 Token
    echo.
    goto :end
)

:: 检查容器是否运行
docker ps | findstr apifox-runner >nul 2>&1
if %errorlevel% neq 0 (
    echo 🟡 问题：Runner 容器未运行
    echo.
    echo 📋 解决步骤：
    echo 1. 启动容器：docker start apifox-runner
    echo 2. 等待几秒后检查日志：docker logs apifox-runner
    echo.
    goto :end
)

:: 检查网络连接
Test-NetConnection -ComputerName api.apifox.com -Port 443 -InformationLevel Quiet >nul 2>&1
if %errorlevel% neq 0 (
    echo 🟡 问题：无法访问 Apifox 服务器
    echo.
    echo 📋 解决步骤：
    echo 1. 检查网络连接
    echo 2. 检查防火墙设置
    echo 3. 检查代理配置
    echo.
    goto :end
)

echo 🟢 Runner 状态正常
echo.
echo 💡 如果仍有问题：
echo 1. 查看完整日志：docker logs apifox-runner
echo 2. 在 Apifox 客户端中检查 Runner 状态
echo 3. 尝试重启 Runner：docker restart apifox-runner
echo.

:end
echo ============================================================
echo   常用命令
echo ============================================================
echo.
echo 查看实时日志：docker logs -f apifox-runner
echo 查看最后 50 行：docker logs --tail 50 apifox-runner
echo 重启 Runner：docker restart apifox-runner
echo 停止 Runner：docker stop apifox-runner
echo 启动 Runner：docker start apifox-runner
echo.
echo ============================================================
pause
