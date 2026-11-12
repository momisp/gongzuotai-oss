@echo off
:: 设置 UTF-8 编码（解决乱码问题）
chcp 65001 >nul
:: 启用延迟变量扩展
setlocal EnableDelayedExpansion

echo ============================================================
echo   Apifox 接口自动化测试（Excel 直接执行）
echo ============================================================
echo.

:: ============================================================
:: 配置区域（根据实际情况修改）
:: ============================================================

:: 设置 Node.js 路径（根据实际路径修改）
set "NODE_PATH=C:\Program Files\nodejs"

:: 设置 Excel 文件路径（默认与脚本同目录）
set "EXCEL_FILE=%~dp0apifox_tests.xlsx"

:: 如果 Excel 文件路径作为参数传入，则使用参数
if not "%~1"=="" set "EXCEL_FILE=%~1"

:: 设置 Python 路径（如果 Python 在 PATH 中，可以留空）
set "PYTHON_CMD=python"

:: 设置测试间隔（秒）
set "DELAY_SECONDS=2"

:: 如果延迟秒数作为第二个参数传入，则使用参数
if not "%~2"=="" set "DELAY_SECONDS=%~2"

:: ============================================================
:: 检查配置
:: ============================================================

:: 检查 Node.js 是否存在
if not exist "%NODE_PATH%\npx.cmd" (
    echo [错误] 未找到 Node.js，请检查安装路径
    echo 当前路径: %NODE_PATH%
    echo.
    echo 请修改脚本中的 NODE_PATH 变量为实际路径
    echo 或使用 where node 命令查找 Node.js 路径
    exit /b 1
)

:: 检查 Excel 文件是否存在
if not exist "%EXCEL_FILE%" (
    echo [错误] 未找到 Excel 文件
    echo 文件路径: %EXCEL_FILE%
    echo.
    echo 使用方法：
    echo   1. 将 Excel 文件放在脚本同目录下，命名为 apifox_tests.xlsx
    echo   2. 或通过参数指定 Excel 文件路径：
    echo      %~nx0 "C:\path\to\your\file.xlsx" [延迟秒数]
    echo.
    echo Excel 文件格式要求：
    echo   - 第一行：标题行（人员,名称（备注）,命令行）
    echo   - 从第二行开始：数据行
    echo   - 第三列（C列）为要执行的命令行
    exit /b 1
)

echo [配置] Node.js 路径: %NODE_PATH%
echo [配置] Excel 文件路径: %EXCEL_FILE%
echo [配置] 测试间隔: %DELAY_SECONDS% 秒
echo.

:: ============================================================
:: 检查 Python 环境
:: ============================================================

:: 检查 Python 是否可用
%PYTHON_CMD% --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [检查] 未找到 Python，尝试使用完整路径...
    :: 尝试常见 Python 路径
    if exist "C:\Python39\python.exe" (
        set "PYTHON_CMD=C:\Python39\python.exe"
    ) else if exist "C:\Python310\python.exe" (
        set "PYTHON_CMD=C:\Python310\python.exe"
    ) else if exist "C:\Python311\python.exe" (
        set "PYTHON_CMD=C:\Python311\python.exe"
    ) else if exist "C:\Python312\python.exe" (
        set "PYTHON_CMD=C:\Python312\python.exe"
    ) else (
        echo [错误] 未找到 Python，无法执行测试
        echo.
        echo 请安装 Python 并确保在 PATH 中，或安装 pandas 和 openpyxl：
        echo   pip install pandas openpyxl
        echo.
        exit /b 1
    )
)

echo [配置] Python 路径: %PYTHON_CMD%
echo.

:: ============================================================
:: 检查 Python 依赖
:: ============================================================

echo [检查] 正在检查 Python 依赖...
%PYTHON_CMD% -c "import pandas, openpyxl" >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 缺少 Python 依赖库
    echo.
    echo 请安装以下依赖：
    echo   pip install pandas openpyxl
    echo.
    echo 或者运行：
    echo   %PYTHON_CMD% -m pip install pandas openpyxl
    echo.
    exit /b 1
)

echo [成功] Python 依赖检查通过
echo.

:: ============================================================
:: 执行测试
:: ============================================================

echo [开始] 正在读取 Excel 文件并执行测试...
echo.

:: 调用 Python 脚本读取 Excel 并执行
%PYTHON_CMD% "%~dp0读取Excel并执行.py" "%EXCEL_FILE%" "%NODE_PATH%" %DELAY_SECONDS%

:: 获取执行结果
set EXEC_RESULT=%errorlevel%

if %EXEC_RESULT% equ 0 (
    echo.
    echo ============================================================
    echo   [完成] 所有测试执行成功！
    echo ============================================================
    exit /b 0
) else (
    echo.
    echo ============================================================
    echo   [警告] 有测试执行失败，请检查日志
    echo ============================================================
    exit /b 1
)
