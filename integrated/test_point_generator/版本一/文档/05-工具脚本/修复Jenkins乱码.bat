@echo off
chcp 65001 >nul
echo ============================================================
echo   Jenkins 控制台乱码修复工具
echo ============================================================
echo.

echo [1/4] 检查当前编码...
chcp
echo.

echo [2/4] 设置 UTF-8 编码...
chcp 65001
echo ✅ 编码已设置为 UTF-8
echo.

echo [3/4] 测试中文显示...
echo 测试中文：接口自动化测试
echo 测试特殊字符：✅ ❌ ⚠️
echo.

echo [4/4] 编码设置完成！
echo.
echo ============================================================
echo   使用说明
echo ============================================================
echo.
echo 1. 在 Jenkins 批处理脚本开头添加：
echo    chcp 65001 ^>nul
echo.
echo 2. 在 Jenkins Pipeline 中使用：
echo    bat '''
echo      chcp 65001 ^>nul
echo      echo 你的命令...
echo    '''
echo.
echo 3. 详细说明请查看：
echo    文档/03-Jenkins相关/Jenkins_控制台乱码解决方案.md
echo.
echo ============================================================
pause
