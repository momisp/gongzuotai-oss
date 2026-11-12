@echo off
chcp 65001 >nul
echo ============================================================
echo   测试 Excel 读取功能
echo ============================================================
echo.

cd /d "%~dp0"

echo [步骤1] 检查 Python 环境...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 Python
    echo 请安装 Python 或确保在 PATH 中
    pause
    exit /b 1
)
python --version
echo.

echo [步骤2] 检查 Python 依赖...
python -c "import pandas, openpyxl; print('依赖检查通过')" 2>nul
if %errorlevel% neq 0 (
    echo [错误] 缺少 Python 依赖库
    echo 请运行: pip install pandas openpyxl
    pause
    exit /b 1
)
echo [成功] Python 依赖检查通过
echo.

echo [步骤3] 检查 Excel 文件...
if not exist "apifox_tests.xlsx" (
    echo [错误] 未找到 Excel 文件: apifox_tests.xlsx
    pause
    exit /b 1
)
echo [成功] 找到 Excel 文件
echo.

echo [步骤4] 测试读取 Excel 文件...
echo.
python 测试Excel读取.py
echo.

echo ============================================================
echo   测试完成
echo ============================================================
pause
