@echo off
:: 设置 UTF-8 编码（解决乱码问题）
chcp 65001 >nul
:: 设置控制台输出编码
setlocal EnableDelayedExpansion

echo ============================================================
echo   Apifox 接口自动化测试（批量执行）
echo ============================================================
echo.

:: 设置 Node.js 路径（根据实际路径修改）
set "NODE_PATH=C:\Program Files\nodejs"

:: 检查 Node.js 是否存在
if not exist "%NODE_PATH%\npx.cmd" (
    echo [错误] 未找到 Node.js，请检查安装路径
    echo 当前路径: %NODE_PATH%
    echo.
    echo 请修改脚本中的 NODE_PATH 变量为实际路径
    echo 或使用 where node 命令查找 Node.js 路径
    exit /b 1
)

echo [准备] Node.js 路径: %NODE_PATH%
echo.

:: ============================================================
:: 测试1：用户购买会员业务场景
:: ============================================================
echo [1/3] 执行测试：用户购买会员业务场景
echo ============================================================
call "%NODE_PATH%\npx.cmd" apifox run https://api.apifox.com/api/v1/projects/7828807/api-test/ci-config/507950/detail?token=xe8W0pOJ6fc6JCd7wiIi8K -r html,cli --upload-report detail
set TEST1_RESULT=%errorlevel%

if %TEST1_RESULT% neq 0 (
    echo.
    echo [错误] 测试1执行失败，错误码: %TEST1_RESULT%
    echo 停止执行后续测试
    exit /b 1
)

echo.
echo [成功] 测试1执行成功
echo.

:: 延迟（避免请求过快）
timeout /t 2 /nobreak >nul

:: ============================================================
:: 测试2：获取token
:: ============================================================
echo [2/3] 执行测试：获取token
echo ============================================================
call "%NODE_PATH%\npx.cmd" apifox run --access-token afxp_20678eBfLxKywYWF6Ae6ho5Te3I2UyZIGGXQ -t 7941946 -e 42555539 -n 1 -r html,cli --notification 314967
set TEST2_RESULT=%errorlevel%

if %TEST2_RESULT% neq 0 (
    echo.
    echo [错误] 测试2执行失败，错误码: %TEST2_RESULT%
    echo 停止执行后续测试
    exit /b 1
)

echo.
echo [成功] 测试2执行成功
echo.

:: 延迟
timeout /t 2 /nobreak >nul

:: ============================================================
:: 测试3：李飞翔的接口自动化
:: ============================================================
echo [3/3] 执行测试：李飞翔的接口自动化
echo ============================================================
call "%NODE_PATH%\npx.cmd" apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/507958/detail?token=xK6sMNzyfHJUk5GLnYfVVX -r html,cli --upload-report detail
set TEST3_RESULT=%errorlevel%

if %TEST3_RESULT% neq 0 (
    echo.
    echo [错误] 测试3执行失败，错误码: %TEST3_RESULT%
    exit /b 1
)

echo.
echo [成功] 测试3执行成功
echo.

:: ============================================================
echo ============================================================
echo   [完成] 所有测试执行完成
echo ============================================================
echo.
echo 执行时间: %date% %time%
exit /b 0
