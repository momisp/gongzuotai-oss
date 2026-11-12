@echo off
chcp 65001 >nul
echo ============================================================
echo   Apifox Runner 快速部署脚本
echo   用于 Docker + Apifox 持续集成
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

:: 检查端口
echo [2/6] 检查端口 4524...
netstat -ano | findstr ":4524" >nul 2>&1
if %errorlevel% equ 0 (
    echo ⚠️  端口 4524 已被占用
    netstat -ano | findstr ":4524"
    echo.
    set /p choice="是否继续？(Y/N): "
    if /i not "%choice%"=="Y" exit /b 1
) else (
    echo ✅ 端口 4524 可用
)
echo.

:: 检查现有容器
echo [3/6] 检查现有 Runner 容器...
docker ps -a | findstr "apifox-runner" >nul 2>&1
if %errorlevel% equ 0 (
    echo ⚠️  发现已存在的 Runner 容器
    docker ps -a | findstr "apifox-runner"
    echo.
    set /p choice="是否删除旧容器并重新部署？(Y/N): "
    if /i "%choice%"=="Y" (
        echo 正在停止并删除旧容器...
        docker stop apifox-runner >nul 2>&1
        docker rm apifox-runner >nul 2>&1
        echo ✅ 旧容器已删除
    ) else (
        echo 跳过部署
        goto :config
    )
) else (
    echo ✅ 未发现现有容器
)
echo.

:: 创建数据目录
echo [4/6] 创建数据目录...
if not exist "C:\apifox-runner-data" (
    mkdir "C:\apifox-runner-data"
    echo ✅ 数据目录已创建: C:\apifox-runner-data
) else (
    echo ✅ 数据目录已存在
)
echo.

:: 拉取镜像
echo [5/6] 拉取 Apifox Runner 镜像...
echo 正在拉取最新镜像（可能需要几分钟）...
docker pull apifox/apifox-runner:latest
if %errorlevel% neq 0 (
    echo ❌ 镜像拉取失败！
    echo 可能的原因: 网络连接问题或 Docker Hub 访问受限
    pause
    exit /b 1
)
echo ✅ 镜像拉取成功
echo.

:: 启动容器
echo [6/6] 启动 Runner 容器...
docker run -d --name apifox-runner --restart unless-stopped -p 4524:4524 -v C:\apifox-runner-data:/data apifox/apifox-runner:latest

if %errorlevel% neq 0 (
    echo ❌ Runner 启动失败！
    echo.
    echo 查看错误信息:
    docker logs apifox-runner
    pause
    exit /b 1
)

echo ✅ Runner 已成功启动！
echo.

:config
:: 验证部署
echo ============================================================
echo   验证部署
echo ============================================================
echo.
echo 检查容器状态:
docker ps | findstr "apifox-runner"
echo.

echo 查看 Runner 日志（最后 20 行）:
docker logs --tail 20 apifox-runner
echo.

echo 测试端口连接:
Test-NetConnection -ComputerName localhost -Port 4524 -InformationLevel Quiet
if %errorlevel% equ 0 (
    echo ✅ 端口 4524 可访问
) else (
    echo ⚠️  端口 4524 无法访问，请检查防火墙设置
)
echo.

:: 获取 Runner Token
echo ============================================================
echo   获取 Runner Token（如果需要）
echo ============================================================
echo.
echo 正在从日志中提取 Token...
docker logs apifox-runner 2>nul | findstr /i "token" >nul
if %errorlevel% equ 0 (
    echo ✅ 请在日志中查找 Runner Token
    echo.
    echo 查看完整日志:
    docker logs apifox-runner
) else (
    echo ℹ️  如果 Runner 需要 Token，请查看日志获取
)
echo.

:: 配置说明
echo ============================================================
echo   下一步配置
echo ============================================================
echo.
echo 📋 在 Apifox 客户端中配置 Runner:
echo.
echo 1. 打开 Apifox 客户端
echo 2. 进入「自动化测试」→「Runner 设置」
echo 3. 添加 Runner，填写以下信息:
echo    - 名称: apifox_general_runner（或自定义）
echo    - 地址: http://localhost:4524
echo    - Token: （如果需要，从日志中获取）
echo.
echo 4. 验证连接:
echo    - 等待 Runner 状态变为「运行中」
echo    - 如果显示「连接中」，检查:
echo      * Docker 容器是否运行: docker ps
echo      * 端口是否可访问: Test-NetConnection localhost -Port 4524
echo      * 防火墙是否阻止连接
echo.
echo ============================================================
echo   部署完成！
echo ============================================================
echo.
echo 💡 提示:
echo    - 查看日志: docker logs apifox-runner
echo    - 停止 Runner: docker stop apifox-runner
echo    - 启动 Runner: docker start apifox-runner
echo    - 重启 Runner: docker restart apifox-runner
echo.
pause
