@echo off
chcp 65001 >nul
echo ============================================================
echo   Apifox Runner 重新部署脚本
echo   解决容器名称冲突问题
echo ============================================================
echo.

:: 检查 Docker
echo [1/6] 检查 Docker...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker 未安装或未运行！
    echo 请先安装 Docker Desktop: https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)
docker ps >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  Docker Desktop 可能未运行，请先启动
    pause
)
echo ✅ Docker 检查通过
echo.

:: 检查并停止旧容器
echo [2/6] 检查现有容器...
docker ps -a | findstr "apifox_general_runner" >nul 2>&1
if %errorlevel% equ 0 (
    echo ⚠️  发现已存在的容器: apifox_general_runner
    echo.
    echo 容器信息:
    docker ps -a | findstr "apifox_general_runner"
    echo.
    echo 正在停止容器...
    docker stop apifox_general_runner >nul 2>&1
    if %errorlevel% equ 0 (
        echo ✅ 容器已停止
    ) else (
        echo ℹ️  容器可能已经停止
    )
    echo.
    echo 正在删除容器...
    docker rm apifox_general_runner >nul 2>&1
    if %errorlevel% equ 0 (
        echo ✅ 旧容器已删除
    ) else (
        echo ⚠️  删除容器时出现问题，尝试强制删除...
        docker rm -f apifox_general_runner >nul 2>&1
        if %errorlevel% equ 0 (
            echo ✅ 容器已强制删除
        ) else (
            echo ❌ 无法删除容器，请手动删除
            echo 命令: docker rm -f apifox_general_runner
            pause
            exit /b 1
        )
    )
) else (
    echo ✅ 未发现现有容器
)
echo.

:: 检查其他可能的容器名称
echo [3/6] 检查其他 Apifox Runner 容器...
docker ps -a | findstr /i "apifox.*runner" >nul 2>&1
if %errorlevel% equ 0 (
    echo ⚠️  发现其他 Apifox Runner 容器:
    docker ps -a | findstr /i "apifox.*runner"
    echo.
    set /p choice="是否删除这些容器？(Y/N): "
    if /i "%choice%"=="Y" (
        for /f "tokens=1" %%i in ('docker ps -a ^| findstr /i "apifox.*runner" ^| findstr /v "CONTAINER"') do (
            echo 正在删除容器: %%i
            docker stop %%i >nul 2>&1
            docker rm %%i >nul 2>&1
        )
        echo ✅ 其他容器已删除
    )
) else (
    echo ✅ 未发现其他容器
)
echo.

:: 检查端口占用
echo [4/6] 检查端口 4524...
netstat -ano | findstr ":4524" >nul 2>&1
if %errorlevel% equ 0 (
    echo ⚠️  端口 4524 被占用
    echo 占用端口的进程:
    netstat -ano | findstr ":4524"
    echo.
    echo 注意：如果旧容器仍在运行，新容器将无法启动
    set /p choice="是否继续？(Y/N): "
    if /i not "%choice%"=="Y" exit /b 1
) else (
    echo ✅ 端口 4524 可用
)
echo.

:: 拉取最新镜像
echo [5/6] 拉取最新镜像...
echo 正在拉取 apifox/self-hosted-general-runner:latest...
docker pull apifox/self-hosted-general-runner:latest
if %errorlevel% neq 0 (
    echo ❌ 镜像拉取失败！
    echo 可能的原因:
    echo 1. 网络连接问题
    echo 2. Docker Hub 访问受限
    echo.
    pause
    exit /b 1
)
echo ✅ 镜像拉取成功
echo.

:: 启动新容器
echo [6/6] 启动新容器...
echo 正在启动 apifox_general_runner...
docker run -d --name apifox_general_runner --restart unless-stopped -p 4524:4524 -v C:\apifox-runner-data:/data apifox/self-hosted-general-runner:latest

if %errorlevel% neq 0 (
    echo ❌ 容器启动失败！
    echo.
    echo 可能的原因:
    echo 1. 端口被占用
    echo 2. 容器名称冲突（请检查是否还有其他同名容器）
    echo 3. 权限问题
    echo.
    echo 查看详细错误信息:
    docker ps -a | findstr apifox_general_runner
    pause
    exit /b 1
)

echo ✅ 容器启动成功！
echo.

:: 等待容器启动
echo 等待 Runner 初始化（5秒）...
timeout /t 5 >nul

:: 验证部署
echo ============================================================
echo   验证部署
echo ============================================================
echo.

echo 检查容器状态:
docker ps | findstr apifox_general_runner
if %errorlevel% equ 0 (
    echo ✅ 容器正在运行
) else (
    echo ⚠️  容器未运行，检查所有容器:
    docker ps -a | findstr apifox_general_runner
)
echo.

echo 查看 Runner 日志（最后 20 行）:
docker logs --tail 20 apifox_general_runner
echo.

echo 测试端口连接:
Test-NetConnection -ComputerName localhost -Port 4524 -InformationLevel Quiet >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ 端口 4524 可访问
) else (
    echo ⚠️  端口 4524 无法访问，请检查防火墙设置
)
echo.

:: 获取 Runner Token
echo ============================================================
echo   获取 Runner Token
echo ============================================================
echo.
echo 正在从日志中提取 Token...
docker logs apifox_general_runner 2>nul | findstr /i "token" >nul
if %errorlevel% equ 0 (
    echo ✅ 找到 Token 信息，请查看下方日志:
    echo.
    docker logs apifox_general_runner | findstr /i "token"
) else (
    echo ℹ️  如果 Runner 需要 Token，请查看完整日志:
    echo docker logs apifox_general_runner
)
echo.

echo ============================================================
echo   部署完成！
echo ============================================================
echo.
echo 📋 下一步操作：
echo.
echo 1. 在 Apifox 客户端中配置 Runner:
echo    - 打开 Apifox
echo    - 进入「自动化测试」→「Runner 设置」
echo    - 如果已有旧配置，先删除
echo    - 添加新 Runner:
echo      * 名称: apifox_general_runner（或自定义）
echo      * 地址: http://localhost:4524
echo      * Token: （如果需要，从日志中获取）
echo.
echo 2. 验证连接:
echo    - 等待 Runner 状态变为「运行中」
echo    - 如果显示「连接中」，运行诊断脚本:
echo      分析Apifox日志.bat
echo.
echo 3. 常用命令:
echo    - 查看日志: docker logs apifox_general_runner
echo    - 实时日志: docker logs -f apifox_general_runner
echo    - 重启: docker restart apifox_general_runner
echo    - 停止: docker stop apifox_general_runner
echo.
echo ============================================================
pause
