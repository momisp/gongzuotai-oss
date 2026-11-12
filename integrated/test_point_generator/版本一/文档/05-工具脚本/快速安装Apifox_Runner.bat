@echo off
chcp 65001 >nul
echo ============================================================
echo   Apifox Runner 快速安装脚本 (Windows)
echo ============================================================
echo.

:: 检查 Docker 是否运行
echo [1/5] 检查 Docker Desktop...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker 未安装或未运行！
    echo.
    echo 请先安装 Docker Desktop:
    echo https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)
echo ✅ Docker 已安装
docker ps >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  Docker Desktop 可能未运行，请先启动 Docker Desktop
    echo.
    pause
)
echo.

:: 检查端口是否被占用
echo [2/5] 检查端口 4524...
netstat -ano | findstr ":4524" >nul 2>&1
if %errorlevel% equ 0 (
    echo ⚠️  端口 4524 已被占用！
    echo.
    echo 占用端口的进程:
    netstat -ano | findstr ":4524"
    echo.
    set /p choice="是否继续？(Y/N): "
    if /i not "%choice%"=="Y" exit /b 1
) else (
    echo ✅ 端口 4524 可用
)
echo.

:: 检查是否已存在 Runner 容器
echo [3/5] 检查现有 Runner 容器...
docker ps -a | findstr "apifox-runner" >nul 2>&1
if %errorlevel% equ 0 (
    echo ⚠️  发现已存在的 Runner 容器
    echo.
    docker ps -a | findstr "apifox-runner"
    echo.
    set /p choice="是否删除旧容器并重新安装？(Y/N): "
    if /i "%choice%"=="Y" (
        echo 正在停止并删除旧容器...
        docker stop apifox-runner >nul 2>&1
        docker rm apifox-runner >nul 2>&1
        echo ✅ 旧容器已删除
    ) else (
        echo 安装已取消
        pause
        exit /b 0
    )
) else (
    echo ✅ 未发现现有容器
)
echo.

:: 创建数据目录
echo [4/5] 创建数据目录...
if not exist "C:\apifox-runner-data" (
    mkdir "C:\apifox-runner-data"
    echo ✅ 数据目录已创建: C:\apifox-runner-data
) else (
    echo ✅ 数据目录已存在: C:\apifox-runner-data
)
echo.

:: 拉取并运行 Runner
echo [5/5] 部署 Apifox Runner...
echo.
echo 正在拉取最新镜像（可能需要几分钟）...
docker pull apifox/apifox-runner:latest
if %errorlevel% neq 0 (
    echo ❌ 镜像拉取失败！
    echo.
    echo 可能的原因:
    echo 1. 网络连接问题
    echo 2. Docker Hub 访问受限
    echo.
    pause
    exit /b 1
)

echo.
echo 正在启动 Runner 容器...
docker run -d --name apifox-runner --restart unless-stopped -p 4524:4524 -v C:\apifox-runner-data:/data apifox/apifox-runner:latest

if %errorlevel% neq 0 (
    echo ❌ Runner 启动失败！
    echo.
    echo 查看错误信息:
    docker logs apifox-runner
    pause
    exit /b 1
)

echo.
echo ✅ Runner 已成功启动！
echo.

:: 验证安装
echo ============================================================
echo   验证安装
echo ============================================================
echo.
echo 检查容器状态:
docker ps | findstr "apifox-runner"
echo.

echo 查看 Runner 日志（最后 10 行）:
docker logs --tail 10 apifox-runner
echo.

echo ============================================================
echo   安装完成！
echo ============================================================
echo.
echo 📋 下一步操作:
echo.
echo 1. 在 Apifox 客户端中配置 Runner:
echo    - 打开 Apifox
echo    - 进入「自动化测试」→「Runner 设置」
echo    - 添加 Runner，地址填写: http://localhost:4524
echo.
echo 2. 验证连接:
echo    - 确认 Runner 状态显示为「运行中」
echo    - 如果显示「连接中」，检查防火墙设置
echo.
echo 3. 常用命令:
echo    - 查看日志: docker logs apifox-runner
echo    - 停止 Runner: docker stop apifox-runner
echo    - 启动 Runner: docker start apifox-runner
echo    - 重启 Runner: docker restart apifox-runner
echo.
echo ============================================================
pause
