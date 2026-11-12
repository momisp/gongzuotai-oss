@echo off
chcp 65001 >nul
echo ============================================================
echo   Apifox 接口自动化测试（Jenkins 兼容版）
echo ============================================================
echo.

:: 设置 Node.js 路径（根据实际安装路径修改）
echo [1/4] 设置环境变量...
set "NODE_PATH=C:\Program Files\nodejs"
set "NPM_PATH=%APPDATA%\npm"

:: 添加到 PATH
if exist "%NODE_PATH%\node.exe" (
    set PATH=%PATH%;%NODE_PATH%
    echo ✅ Node.js 路径已添加: %NODE_PATH%
) else (
    echo ⚠️  Node.js 路径不存在，尝试查找...
    :: 尝试其他常见路径
    if exist "C:\Program Files (x86)\nodejs\node.exe" (
        set "NODE_PATH=C:\Program Files (x86)\nodejs"
        set PATH=%PATH%;%NODE_PATH%
        echo ✅ Node.js 路径已添加: %NODE_PATH%
    ) else (
        echo ❌ 未找到 Node.js，请检查安装路径
    )
)

if exist "%NPM_PATH%" (
    set PATH=%PATH%;%NPM_PATH%
    echo ✅ npm 全局路径已添加: %NPM_PATH%
)

echo.

:: 检查 apifox 是否可用
echo [2/4] 检查 apifox 命令...
where apifox >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ 找到 apifox 命令
    where apifox
    goto :run_test
) else (
    echo ⚠️  未找到 apifox 命令
)

:: 使用 npx 运行（推荐）
echo [3/4] 使用 npx 运行 apifox...
if exist "%NODE_PATH%\npx.cmd" (
    echo ✅ 找到 npx.cmd，使用 npx 运行...
    "%NODE_PATH%\npx.cmd" apifox run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xcdCofADI1aHgTPd_knKWB -r html,cli
    if %errorlevel% equ 0 (
        echo ✅ 测试执行成功
        goto :end
    ) else (
        echo ❌ 测试执行失败
        exit /b 1
    )
)

:: 使用 npm 运行
if exist "%NODE_PATH%\npm.cmd" (
    echo ✅ 找到 npm.cmd，使用 npm 运行...
    "%NODE_PATH%\npm.cmd" run apifox -- run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xcdCofADI1aHgTPd_knKWB -r html,cli
    if %errorlevel% equ 0 (
        echo ✅ 测试执行成功
        goto :end
    ) else (
        echo ❌ 测试执行失败
        exit /b 1
    )
)

echo ❌ 无法找到 Node.js 或 apifox
echo.
echo 请检查：
echo 1. Node.js 是否已安装
echo 2. apifox-cli 是否已安装: npm install -g apifox-cli
echo 3. Node.js 安装路径是否正确
exit /b 1

:run_test
echo [4/4] 运行 Apifox 测试...
apifox run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xcdCofADI1aHgTPd_knKWB -r html,cli
if %errorlevel% equ 0 (
    echo ✅ 测试执行成功
) else (
    echo ❌ 测试执行失败
    exit /b 1
)

:end
echo.
echo ============================================================
echo   测试完成
echo ============================================================
exit /b 0
