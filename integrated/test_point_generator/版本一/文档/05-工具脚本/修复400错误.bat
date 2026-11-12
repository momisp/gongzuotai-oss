@echo off
chcp 65001 >nul
echo ============================================================
echo   Apifox Runner 400 错误修复工具
echo ============================================================
echo.

echo 📊 问题分析：
echo.
echo ✅ Runner 容器运行正常
echo ✅ 配置信息已正确加载
echo ❌ WebSocket 连接失败（400 错误）
echo.
echo 🔍 原因：Runner ID 26876 在 Apifox 服务器端可能已失效
echo.
echo ============================================================
echo.

echo 📋 解决方案：
echo.
echo 方案1：在 Apifox 中重新创建 Runner（推荐）
echo   1. 打开 Apifox 客户端
echo   2. 进入「自动化测试」→「Runner 设置」
echo   3. 删除 Runner ID 26876（如果存在）
echo   4. 重新创建 Runner，获取新的配置
echo   5. 使用新配置重新部署
echo.
echo 方案2：检查并修复现有 Runner
echo   1. 在 Apifox 中检查 Runner 状态
echo   2. 确认 Runner 是否存在
echo   3. 如果存在但异常，尝试重置
echo.
echo ============================================================
echo.

echo 🔧 当前操作：
echo.
echo 正在检查容器状态...
docker ps -a | findstr apifox_general_runner >nul 2>&1
if %errorlevel% equ 0 (
    echo.
    echo 发现容器: apifox_general_runner
    echo.
    echo 容器状态:
    docker ps -a | findstr apifox_general_runner
    echo.
    echo ⚠️  建议操作：
    echo   1. 在 Apifox 中删除旧 Runner（ID: 26876）
    echo   2. 重新创建 Runner，获取新配置
    echo   3. 然后删除旧容器并重新部署
    echo.
    set /p choice="是否现在停止并删除旧容器？(Y/N): "
    if /i "%choice%"=="Y" (
        echo.
        echo 正在停止容器...
        docker stop apifox_general_runner 2>nul
        if %errorlevel% equ 0 (
            echo ✅ 容器已停止
        ) else (
            echo ℹ️  容器可能已经停止
        )
        echo.
        echo 正在删除容器...
        docker rm apifox_general_runner 2>nul
        if %errorlevel% equ 0 (
            echo ✅ 容器已删除
        ) else (
            echo ⚠️  删除失败，尝试强制删除...
            docker rm -f apifox_general_runner 2>nul
            if %errorlevel% equ 0 (
                echo ✅ 容器已强制删除
            ) else (
                echo ❌ 无法删除容器，请手动删除
            )
        )
        echo.
        echo ============================================================
        echo   下一步操作
        echo ============================================================
        echo.
        echo 📋 请在 Apifox 中：
        echo.
        echo 1. 进入「自动化测试」→「Runner 设置」
        echo 2. 删除旧的 Runner（ID: 26876）
        echo 3. 点击「添加 Runner」或「部署通用 Runner」
        echo 4. 选择「Windows」系统
        echo 5. 复制部署命令（如果需要）
        echo 6. 获取新的 Runner 配置信息
        echo.
        echo 📋 然后执行新的部署命令：
        echo   （使用从 Apifox 中获取的新命令）
        echo.
    ) else (
        echo.
        echo ℹ️  已取消操作
        echo.
        echo 💡 提示：
        echo   1. 先在 Apifox 中重新创建 Runner
        echo   2. 获取新的配置信息
        echo   3. 然后使用新配置重新部署
    )
) else (
    echo ✅ 未发现容器 apifox_general_runner
    echo.
    echo 💡 提示：
    echo   1. 在 Apifox 中创建新的 Runner
    echo   2. 获取部署命令
    echo   3. 执行部署命令
)

echo.
echo ============================================================
echo   详细说明
echo ============================================================
echo.
echo 📖 为什么会出现 400 错误？
echo.
echo 从日志分析：
echo   - Runner 容器运行正常 ✅
echo   - 配置信息已加载 ✅
echo   - 但是 WebSocket 连接失败 ❌
echo.
echo 原因：
echo   Runner ID 26876 在 Apifox 服务器端可能：
echo   1. 已被删除
echo   2. 已失效
echo   3. 配置不匹配
echo.
echo 解决方法：
echo   在 Apifox 中重新创建 Runner，获取新的配置
echo.
echo ============================================================
pause
