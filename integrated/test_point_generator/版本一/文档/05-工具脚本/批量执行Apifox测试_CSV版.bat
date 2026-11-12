@echo off
:: 设置 UTF-8 编码（解决乱码问题）
chcp 65001 >nul
:: 启用延迟变量扩展（确保错误码正确获取）
setlocal EnableDelayedExpansion

echo ============================================================
echo   Apifox 接口自动化测试（CSV 批量执行）
echo ============================================================
echo.
echo [调试] 脚本开始执行...
echo [调试] 当前目录: %CD%
echo [调试] 脚本路径: %~dp0
echo.

:: ============================================================
:: 配置区域（根据实际情况修改）
:: ============================================================

:: 设置 Node.js 路径（根据实际路径修改）
set "NODE_PATH=C:\Program Files\nodejs"

:: 设置 CSV 文件路径（默认与脚本同目录）
set "CSV_FILE=%~dp0apifox_tests.csv"

:: 如果 CSV 文件路径作为参数传入，则使用参数
if not "%~1"=="" set "CSV_FILE=%~1"

:: 设置测试间隔（秒）
set "DELAY_SECONDS=2"

:: ============================================================
:: 检查配置
:: ============================================================

:: 检查 Node.js 是否存在
echo [调试] 检查Node.js路径: %NODE_PATH%
if not exist "%NODE_PATH%\npx.cmd" (
    echo [错误] 未找到 Node.js，请检查安装路径
    echo 当前路径: %NODE_PATH%
    echo.
    echo 请修改脚本中的 NODE_PATH 变量为实际路径
    echo 或使用 where node 命令查找 Node.js 路径
    echo.
    pause
    exit /b 1
)
echo [调试] Node.js检查通过

:: 检查 CSV 文件是否存在
echo [调试] 检查CSV文件: %CSV_FILE%
if not exist "%CSV_FILE%" (
    echo [错误] 未找到 CSV 文件
    echo 文件路径: %CSV_FILE%
    echo.
    echo 使用方法：
    echo   1. 将 CSV 文件放在脚本同目录下，命名为 apifox_tests.csv
    echo   2. 或通过参数指定 CSV 文件路径：
    echo      %~nx0 "C:\path\to\your\file.csv"
    echo.
    echo CSV 文件格式要求：
    echo   - 第一行：标题行（人员,名称（备注）,命令行）
    echo   - 从第二行开始：数据行
    echo   - 第三列（C列）为要执行的命令行
    echo.
    pause
    exit /b 1
)
echo [调试] CSV文件存在，继续执行...

echo [配置] Node.js 路径: %NODE_PATH%
echo [配置] CSV 文件路径: %CSV_FILE%
echo [配置] 测试间隔: %DELAY_SECONDS% 秒
echo.

:: ============================================================
:: 统计测试数量
:: ============================================================
echo [调试] 开始统计测试数量...
set /a TEST_COUNT=0
for /f "skip=1 tokens=* delims=" %%a in ('type "%CSV_FILE%"') do (
    set "LINE=%%a"
    :: 检查是否为空行
    if not "!LINE!"=="" (
        :: 使用 tokens=1,2* 提取前两列，剩余部分作为命令行
        for /f "tokens=1,2* delims=," %%b in ("!LINE!") do (
            set "CMD=%%d"
            :: 去除首尾空格
            for /f "tokens=*" %%e in ("!CMD!") do (
                set "CMD=%%e"
            )
            :: 去除引号
            set "CMD=!CMD:"=!"
            :: 检查命令行是否为空
            if not "!CMD!"=="" (
                set /a TEST_COUNT+=1
            )
        )
    )
)

if %TEST_COUNT% equ 0 (
    echo [错误] CSV 文件中没有找到有效的测试命令
    echo 请检查 CSV 文件格式是否正确
    echo [调试] CSV文件路径: %CSV_FILE%
    echo [调试] 尝试显示CSV文件内容:
    type "%CSV_FILE%"
    echo.
    pause
    exit /b 1
)

echo [统计] 找到 %TEST_COUNT% 个测试任务
echo [调试] 统计完成，准备执行测试
echo.

:: ============================================================
:: 执行测试
:: ============================================================
set /a CURRENT_TEST=0
set /a SUCCESS_COUNT=0
set /a FAIL_COUNT=0

echo [调试] 开始读取CSV文件并执行测试...
for /f "skip=1 tokens=* delims=" %%a in ('type "%CSV_FILE%"') do (
    set "LINE=%%a"
    
    :: 跳过空行
    if not "!LINE!"=="" (
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
        
        :: 去除变量中的首尾空格
        for /f "tokens=*" %%p in ("!PERSON!") do set "PERSON=%%p"
        for /f "tokens=*" %%n in ("!NAME!") do set "NAME=%%n"
        for /f "tokens=*" %%c in ("!CMD!") do set "CMD=%%c"
        
        :: 去除所有引号（包括三重引号）
        set "PERSON=!PERSON:"=!"
        set "NAME=!NAME:"=!"
        set "CMD=!CMD:"=!"
        :: 再次去除引号，处理三重引号的情况
        set "CMD=!CMD:"=!"
        set "CMD=!CMD:"=!"
        
        :: 去除首尾空格（再次确保）
        for /f "tokens=*" %%c in ("!CMD!") do set "CMD=%%c"
        
        :: 检查命令行是否为空，不为空才执行
        if not "!CMD!"=="" (
            :: 更新计数器
            set /a CURRENT_TEST+=1
            
            :: 显示测试信息
            echo ============================================================
            echo [!CURRENT_TEST! / %TEST_COUNT%] 执行测试
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
            
            :: 执行命令并等待完成
            if !HAS_APIFOX_RUN! equ 0 (
                :: 命令已包含 "apifox run"，直接通过 npx 执行整个命令
                echo [执行] 正在执行命令...
                call "%NODE_PATH%\npx.cmd" !CMD!
                set TEST_RESULT=!errorlevel!
            ) else (
                :: 命令不包含 "apifox run"，添加前缀
                echo [执行] 正在执行命令...
                call "%NODE_PATH%\npx.cmd" apifox run !CMD!
                set TEST_RESULT=!errorlevel!
            )
            
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
            if !CURRENT_TEST! lss %TEST_COUNT% (
                echo 等待 %DELAY_SECONDS% 秒后执行下一个测试...
                timeout /t %DELAY_SECONDS% /nobreak >nul
                echo.
            )
        )
    )
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
    echo.
    pause
    exit /b 1
) else (
    echo.
    echo [完成] 所有测试执行成功！
    echo.
    pause
    exit /b 0
)
