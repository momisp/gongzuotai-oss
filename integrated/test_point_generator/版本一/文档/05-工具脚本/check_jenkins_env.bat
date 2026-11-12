@echo off
chcp 65001 >nul
echo ============================================================
echo   Jenkins 环境变量诊断工具
echo ============================================================
echo.

echo [1/6] 检查 Node.js...
where node >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ 找到 node
    where node
    node --version
) else (
    echo ❌ 未找到 node
    echo 尝试查找常见安装路径...
    if exist "C:\Program Files\nodejs\node.exe" (
        echo ✅ 找到: C:\Program Files\nodejs\node.exe
        "C:\Program Files\nodejs\node.exe" --version
    ) else if exist "C:\Program Files (x86)\nodejs\node.exe" (
        echo ✅ 找到: C:\Program Files (x86)\nodejs\node.exe
        "C:\Program Files (x86)\nodejs\node.exe" --version
    ) else (
        echo ❌ 未找到 Node.js
    )
)
echo.

echo [2/6] 检查 npm...
where npm >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ 找到 npm
    where npm
    npm --version
) else (
    echo ❌ 未找到 npm
    echo 尝试查找常见安装路径...
    if exist "C:\Program Files\nodejs\npm.cmd" (
        echo ✅ 找到: C:\Program Files\nodejs\npm.cmd
        "C:\Program Files\nodejs\npm.cmd" --version
    ) else if exist "C:\Program Files (x86)\nodejs\npm.cmd" (
        echo ✅ 找到: C:\Program Files (x86)\nodejs\npm.cmd
        "C:\Program Files (x86)\nodejs\npm.cmd" --version
    ) else (
        echo ❌ 未找到 npm
    )
)
echo.

echo [3/6] 检查 npx...
where npx >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ 找到 npx
    where npx
) else (
    echo ❌ 未找到 npx
    echo 尝试查找常见安装路径...
    if exist "C:\Program Files\nodejs\npx.cmd" (
        echo ✅ 找到: C:\Program Files\nodejs\npx.cmd
    ) else if exist "C:\Program Files (x86)\nodejs\npx.cmd" (
        echo ✅ 找到: C:\Program Files (x86)\nodejs\npx.cmd
    ) else (
        echo ❌ 未找到 npx
    )
)
echo.

echo [4/6] 检查 apifox...
where apifox >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ 找到 apifox
    where apifox
    apifox --version
) else (
    echo ❌ 未找到 apifox
    echo 提示：需要先安装 apifox-cli: npm install -g apifox-cli
)
echo.

echo [5/6] 检查 PATH 环境变量...
echo 当前 PATH:
echo %PATH%
echo.

echo [6/6] 检查常见 Node.js 安装路径...
set "PATHS[0]=C:\Program Files\nodejs"
set "PATHS[1]=C:\Program Files (x86)\nodejs"
set "PATHS[2]=%APPDATA%\npm"
set "PATHS[3]=%LOCALAPPDATA%\Programs\nodejs"

for /L %%i in (0,1,3) do (
    call set "CURRENT_PATH=%%PATHS[%%i]%%"
    if exist "!CURRENT_PATH!" (
        echo ✅ 存在: !CURRENT_PATH!
    ) else (
        echo ❌ 不存在: !CURRENT_PATH!
    )
)

echo.
echo ============================================================
echo   诊断完成
echo ============================================================
echo.
echo 💡 建议：
echo.
echo 如果未找到 Node.js：
echo   1. 检查 Node.js 是否已安装
echo   2. 记录实际的安装路径
echo   3. 在批处理脚本中使用完整路径
echo.
echo 如果未找到 apifox：
echo   1. 运行: npm install -g apifox-cli
echo   2. 或使用 npx: npx apifox run <URL>
echo.
pause
