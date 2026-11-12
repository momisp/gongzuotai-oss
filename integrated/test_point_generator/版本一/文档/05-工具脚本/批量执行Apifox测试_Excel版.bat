@echo off
:: 设置 UTF-8 编码（解决乱码问题）
chcp 65001 >nul
:: 启用延迟变量扩展（确保错误码正确获取）
setlocal EnableDelayedExpansion

echo ============================================================
echo   Apifox 接口自动化测试（Excel 批量执行）
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

:: 设置 CSV 临时文件路径
set "CSV_FILE=%~dp0apifox_tests_temp.csv"

:: 设置 Python 路径（如果 Python 在 PATH 中，可以留空）
set "PYTHON_CMD=python"

:: 设置测试间隔（秒）
set "DELAY_SECONDS=2"

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
    echo      %~nx0 "C:\path\to\your\file.xlsx"
    echo.
    echo Excel 文件格式要求：
    echo   - 第一行：标题行（人员,名称（备注）,命令行）
    echo   - 从第二行开始：数据行
    echo   - 第三列（C列）为要执行的命令行
    exit /b 1
)

echo [配置] Node.js 路径: %NODE_PATH%
echo [配置] Excel 文件路径: %EXCEL_FILE%
echo [配置] CSV 临时文件: %CSV_FILE%
echo [配置] 测试间隔: %DELAY_SECONDS% 秒
echo.

:: ============================================================
:: 转换 Excel 为 CSV
:: ============================================================
echo [步骤1] 正在将 Excel 文件转换为 CSV...
echo.

:: 检查 Python 是否可用
%PYTHON_CMD% --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [警告] 未找到 Python，尝试使用完整路径...
    :: 尝试常见 Python 路径
    if exist "C:\Python39\python.exe" (
        set "PYTHON_CMD=C:\Python39\python.exe"
    ) else if exist "C:\Python310\python.exe" (
        set "PYTHON_CMD=C:\Python310\python.exe"
    ) else if exist "C:\Python311\python.exe" (
        set "PYTHON_CMD=C:\Python311\python.exe"
    ) else (
        echo [错误] 未找到 Python，无法转换 Excel 文件
        echo.
        echo 请安装 Python 并确保在 PATH 中，或安装 pandas 和 openpyxl：
        echo   pip install pandas openpyxl
        echo.
        echo 或者手动将 Excel 文件导出为 CSV 格式
        exit /b 1
    )
)

:: 调用 Python 脚本转换 Excel
echo 正在执行: %PYTHON_CMD% Excel转CSV工具.py "%EXCEL_FILE%" "%CSV_FILE%"
%PYTHON_CMD% "%~dp0Excel转CSV工具.py" "%EXCEL_FILE%" "%CSV_FILE%"

if %errorlevel% neq 0 (
    echo.
    echo [错误] Excel 转 CSV 失败
    echo 请检查：
    echo   1. Python 是否已安装
    echo   2. 是否已安装 pandas 和 openpyxl: pip install pandas openpyxl
    echo   3. Excel 文件格式是否正确
    exit /b 1
)

:: 检查 CSV 文件是否生成
if not exist "%CSV_FILE%" (
    echo [错误] CSV 文件生成失败
    exit /b 1
)

echo.
echo [成功] Excel 文件已转换为 CSV
echo.

:: ============================================================
:: 统计测试数量
:: ============================================================
set /a TEST_COUNT=0
for /f "skip=1 tokens=*" %%a in ('type "%CSV_FILE%"') do (
    set "LINE=%%a"
    :: 检查是否为空行
    if not "!LINE!"=="" (
        :: 提取第三列（命令行）
        for /f "tokens=1,2* delims=," %%b in ("!LINE!") do (
            set "CMD=%%c"
            :: 去除首尾空格
            for /f "tokens=*" %%d in ("!CMD!") do (
                if not "%%d"=="" (
                    set /a TEST_COUNT+=1
                )
            )
        )
    )
)

if %TEST_COUNT% equ 0 (
    echo [错误] CSV 文件中没有找到有效的测试命令
    echo 请检查 Excel 文件格式是否正确
    :: 清理临时文件
    if exist "%CSV_FILE%" del "%CSV_FILE%"
    exit /b 1
)

echo [统计] 找到 %TEST_COUNT% 个测试任务
echo.

:: ============================================================
:: 执行测试
:: ============================================================
set /a CURRENT_TEST=0
set /a SUCCESS_COUNT=0
set /a FAIL_COUNT=0

for /f "skip=1 tokens=*" %%a in ('type "%CSV_FILE%"') do (
    set "LINE=%%a"
    
    :: 跳过空行
    if "!LINE!"=="" goto :next_line
    
    :: 智能解析 CSV：使用 tokens=1,2* 提取前两列，剩余部分作为命令行
    set "PERSON="
    set "NAME="
    set "CMD="
    
    :: 提取第一列、第二列，剩余部分作为命令行
    for /f "tokens=1,2* delims=," %%b in ("!LINE!") do (
        set "PERSON=%%b"
        set "NAME=%%c"
        set "CMD=%%d"
    )
    
    :: 去除变量中的首尾空格和引号
    for /f "tokens=*" %%p in ("!PERSON!") do set "PERSON=%%p"
    for /f "tokens=*" %%n in ("!NAME!") do set "NAME=%%n"
    for /f "tokens=*" %%c in ("!CMD!") do set "CMD=%%c"
    
    :: 去除引号（如果 CSV 导出时包含引号）
    set "PERSON=!PERSON:"=!"
    set "NAME=!NAME:"=!"
    set "CMD=!CMD:"=!"
    
    :: 检查命令行是否为空
    if "!CMD!"=="" goto :next_line
    
    :: 更新计数器
    set /a CURRENT_TEST+=1
    
    :: 显示测试信息
    echo ============================================================
    echo [%CURRENT_TEST%/%TEST_COUNT%] 执行测试
    echo ============================================================
    if not "!PERSON!"=="" echo 人员: !PERSON!
    if not "!NAME!"=="" echo 名称: !NAME!
    echo 命令: !CMD!
    echo.
    
    :: 执行命令
    :: 注意：如果 CSV 中的命令已经包含 "apifox run"，则直接执行
    :: 如果只包含 URL 和参数，则需要添加 "npx apifox run"
    echo !CMD! | findstr /i "apifox run" >nul
    set HAS_APIFOX_RUN=!errorlevel!
    
    if !HAS_APIFOX_RUN! equ 0 (
        :: 命令已包含 "apifox run"，直接执行
        call "%NODE_PATH%\npx.cmd" !CMD!
    ) else (
        :: 命令不包含 "apifox run"，添加前缀
        call "%NODE_PATH%\npx.cmd" apifox run !CMD!
    )
    
    :: 获取命令执行结果
    set TEST_RESULT=!errorlevel!
    
    if !TEST_RESULT! neq 0 (
        echo.
        echo [错误] 测试执行失败，错误码: !TEST_RESULT!
        set /a FAIL_COUNT+=1
        
        :: 询问是否继续执行（可选，默认继续）
        :: 如果需要失败后停止，取消下面的注释
        :: echo 停止执行后续测试
        :: exit /b 1
    ) else (
        echo.
        echo [成功] 测试执行成功
        set /a SUCCESS_COUNT+=1
    )
    
    echo.
    
    :: 如果不是最后一个测试，延迟
    if !CURRENT_TEST! lss !TEST_COUNT! (
        echo 等待 %DELAY_SECONDS% 秒后执行下一个测试...
        timeout /t %DELAY_SECONDS% /nobreak >nul
        echo.
    )
    
    :next_line
)

:: ============================================================
:: 清理临时文件
:: ============================================================
if exist "%CSV_FILE%" (
    echo [清理] 删除临时 CSV 文件...
    del "%CSV_FILE%"
    echo.
)

:: ============================================================
:: 执行结果汇总
:: ============================================================
echo ============================================================
echo   执行结果汇总
echo ============================================================
echo 总测试数: %TEST_COUNT%
echo 成功: %SUCCESS_COUNT%
echo 失败: %FAIL_COUNT%
echo.
echo 执行时间: %date% %time%
echo ============================================================

if %FAIL_COUNT% gtr 0 (
    echo.
    echo [警告] 有测试执行失败，请检查日志
    exit /b 1
) else (
    echo.
    echo [完成] 所有测试执行成功！
    exit /b 0
)
