@echo off
chcp 65001 >nul
echo ============================================================
echo   整理答疑解惑文档到"文档"目录
echo ============================================================
echo.

:: 创建目录结构
echo [1/6] 创建目录结构...
if not exist "文档" mkdir "文档"
if not exist "文档\01-Apifox相关" mkdir "文档\01-Apifox相关"
if not exist "文档\02-Docker相关" mkdir "文档\02-Docker相关"
if not exist "文档\03-Jenkins相关" mkdir "文档\03-Jenkins相关"
if not exist "文档\04-Node.js相关" mkdir "文档\04-Node.js相关"
if not exist "文档\05-工具脚本" mkdir "文档\05-工具脚本"
echo ✅ 目录结构创建完成
echo.

:: 移动 Apifox 相关文档
echo [2/6] 移动 Apifox 相关文档...
move /Y "Apifox_Runner_*.md" "文档\01-Apifox相关\" >nul 2>&1
move /Y "Docker_Apifox_持续集成完整指南.md" "文档\01-Apifox相关\" >nul 2>&1
move /Y "Apifox_持续集成配置清单.md" "文档\01-Apifox相关\" >nul 2>&1
move /Y "检查Apifox连接问题.md" "文档\01-Apifox相关\" >nul 2>&1
move /Y "README_Apifox_Runner.md" "文档\01-Apifox相关\" >nul 2>&1
echo ✅ Apifox 相关文档移动完成
echo.

:: 移动 Docker 相关文档
echo [3/6] 移动 Docker 相关文档...
move /Y "Docker*.md" "文档\02-Docker相关\" >nul 2>&1
echo ✅ Docker 相关文档移动完成
echo.

:: 移动 Jenkins 相关文档
echo [4/6] 移动 Jenkins 相关文档...
move /Y "Jenkins*.md" "文档\03-Jenkins相关\" >nul 2>&1
move /Y "Jenkinsfile*" "文档\03-Jenkins相关\" >nul 2>&1
echo ✅ Jenkins 相关文档移动完成
echo.

:: 移动 Node.js 相关文档
echo [5/6] 移动 Node.js 相关文档...
move /Y "Node.js*.md" "文档\04-Node.js相关\" >nul 2>&1
echo ✅ Node.js 相关文档移动完成
echo.

:: 移动工具脚本
echo [6/6] 移动工具脚本...
move /Y "Apifox_Runner_*.bat" "文档\05-工具脚本\" >nul 2>&1
move /Y "check_apifox_runner*" "文档\05-工具脚本\" >nul 2>&1
move /Y "分析Apifox日志.bat" "文档\05-工具脚本\" >nul 2>&1
move /Y "修复400错误.bat" "文档\05-工具脚本\" >nul 2>&1
move /Y "检查Apifox.bat" "文档\05-工具脚本\" >nul 2>&1
move /Y "快速安装Apifox_Runner.bat" "文档\05-工具脚本\" >nul 2>&1
move /Y "重新部署Apifox_Runner.bat" "文档\05-工具脚本\" >nul 2>&1
echo ✅ 工具脚本移动完成
echo.

echo ============================================================
echo   整理完成！
echo ============================================================
echo.
echo 📁 目录结构：
echo   文档\
echo   ├── 01-Apifox相关\
echo   ├── 02-Docker相关\
echo   ├── 03-Jenkins相关\
echo   ├── 04-Node.js相关\
echo   └── 05-工具脚本\
echo.
echo 💡 提示：查看 文档\README.md 了解详细说明
echo.
pause
