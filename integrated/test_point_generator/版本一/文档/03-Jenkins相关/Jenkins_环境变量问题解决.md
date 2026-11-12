# Jenkins 环境变量问题解决

## 🔴 问题描述

**现象：**
- 手动执行批处理文件：✅ 正常执行
- Jenkins 定时构建触发：❌ `'apifox' 不是内部或外部命令`

**原因：**
- Jenkins 以 SYSTEM 账户运行，环境变量 PATH 不完整
- 手动执行时使用的是用户账户，PATH 包含 Node.js 路径
- SYSTEM 账户的 PATH 不包含 Node.js 和 apifox-cli 的路径

---

## ✅ 解决方案

### 方案1：在批处理脚本中设置 PATH（推荐）

**修改 test.bat：**

```batch
@echo off
chcp 65001 >nul

:: 设置 Node.js 路径（根据实际安装路径修改）
set PATH=%PATH%;C:\Program Files\nodejs
:: 或者如果使用 npm 全局安装的路径
set PATH=%PATH%;%APPDATA%\npm

:: 验证 apifox 是否可用
where apifox >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 找不到 apifox 命令
    echo 正在尝试使用 npm 运行...
    call npm run apifox -- run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xcdCofADI1aHgTPd_knKWB -r html,cli
) else (
    echo ✅ 找到 apifox 命令
    apifox run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xcdCofADI1aHgTPd_knKWB -r html,cli
)
```

### 方案2：使用 npm 的完整路径

**修改 test.bat：**

```batch
@echo off
chcp 65001 >nul

:: 使用 npm 的完整路径运行 apifox
"C:\Program Files\nodejs\npm.cmd" run apifox -- run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xcdCofADI1aHgTPd_knKWB -r html,cli

:: 或者直接使用 npx
"C:\Program Files\nodejs\npx.cmd" apifox run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xcdCofADI1aHgTPd_knKWB -r html,cli
```

### 方案3：在 Jenkins 中配置环境变量

**步骤：**

1. **进入 Jenkins 任务配置**
   - 打开你的任务
   - 点击「配置」

2. **配置构建环境**
   - 找到「构建环境」部分
   - 勾选「Use custom workspace」
   - 或者勾选「Set environment variables」

3. **添加环境变量**
   - 点击「添加环境变量」
   - 添加以下变量：
     ```
     名称：PATH
     值：%PATH%;C:\Program Files\nodejs;%APPDATA%\npm
     ```

### 方案4：使用 Jenkins Pipeline（推荐）

**创建 Pipeline 脚本：**

```groovy
pipeline {
  agent any
  
  environment {
    // 设置 PATH 环境变量
    PATH = "${env.PATH};C:\\Program Files\\nodejs;${env.APPDATA}\\npm"
  }
  
  stages {
    stage('运行 Apifox 测试') {
      steps {
        script {
          // 方法1：直接使用 apifox（如果 PATH 已设置）
          bat 'apifox run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xcdCofADI1aHgTPd_knKWB -r html,cli'
          
          // 方法2：使用 npm 的完整路径（更可靠）
          // bat '"C:\\Program Files\\nodejs\\npm.cmd" run apifox -- run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xcdCofADI1aHgTPd_knKWB -r html,cli'
          
          // 方法3：使用 npx（推荐）
          // bat '"C:\\Program Files\\nodejs\\npx.cmd" apifox run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xcdCofADI1aHgTPd_knKWB -r html,cli'
        }
      }
    }
  }
}
```

---

## 🔍 查找 Node.js 和 apifox 路径

### 方法1：在 CMD 中查找

```cmd
where node
where npm
where apifox
```

### 方法2：查找 npm 全局安装路径

```cmd
npm config get prefix
npm list -g --depth=0
```

### 方法3：查找 apifox-cli 安装路径

```cmd
npm list -g apifox-cli
```

---

## 🛠️ 完整解决方案（批处理脚本）

**创建修复后的 test.bat：**

```batch
@echo off
chcp 65001 >nul
echo ============================================================
echo   Apifox 接口自动化测试
echo ============================================================
echo.

:: 方法1：设置 PATH（根据实际路径修改）
echo [1/3] 设置环境变量...
set "NODE_PATH=C:\Program Files\nodejs"
set "NPM_PATH=%APPDATA%\npm"

:: 添加到 PATH
if exist "%NODE_PATH%" (
    set PATH=%PATH%;%NODE_PATH%
    echo ✅ Node.js 路径已添加: %NODE_PATH%
) else (
    echo ⚠️  Node.js 路径不存在: %NODE_PATH%
)

if exist "%NPM_PATH%" (
    set PATH=%PATH%;%NPM_PATH%
    echo ✅ npm 全局路径已添加: %NPM_PATH%
)

echo.

:: 方法2：验证 apifox 是否可用
echo [2/3] 检查 apifox 命令...
where apifox >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ 找到 apifox 命令
    where apifox
    goto :run_test
) else (
    echo ⚠️  未找到 apifox 命令，尝试使用 npm 运行...
)

:: 方法3：使用 npm 运行
echo [3/3] 使用 npm 运行 apifox...
if exist "%NODE_PATH%\npm.cmd" (
    echo 使用 npm.cmd 运行...
    "%NODE_PATH%\npm.cmd" run apifox -- run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xcdCofADI1aHgTPd_knKWB -r html,cli
    goto :end
)

if exist "%NODE_PATH%\npx.cmd" (
    echo 使用 npx.cmd 运行...
    "%NODE_PATH%\npx.cmd" apifox run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xcdCofADI1aHgTPd_knKWB -r html,cli
    goto :end
)

echo ❌ 无法找到 Node.js 或 apifox
echo.
echo 请检查：
echo 1. Node.js 是否已安装
echo 2. apifox-cli 是否已安装: npm install -g apifox-cli
echo 3. Node.js 安装路径是否正确
exit /b 1

:run_test
apifox run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xcdCofADI1aHgTPd_knKWB -r html,cli

:end
echo.
echo ============================================================
echo   测试完成
echo ============================================================
```

---

## 📋 快速修复步骤

### 步骤1：查找 Node.js 路径

在 CMD 中执行：
```cmd
where node
```

记录路径，如：`C:\Program Files\nodejs\node.exe`

### 步骤2：修改批处理脚本

在 test.bat 开头添加：
```batch
@echo off
set PATH=%PATH%;C:\Program Files\nodejs
set PATH=%PATH%;%APPDATA%\npm
```

### 步骤3：使用完整路径（更可靠）

如果 PATH 设置不起作用，使用完整路径：
```batch
"C:\Program Files\nodejs\npx.cmd" apifox run <你的URL>
```

---

## 🎯 推荐方案

### 最可靠的方案：使用 npx

**修改 test.bat：**

```batch
@echo off
chcp 65001 >nul

:: 使用 npx 运行 apifox（不需要全局安装）
"C:\Program Files\nodejs\npx.cmd" apifox run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xcdCofADI1aHgTPd_knKWB -r html,cli
```

**优点：**
- 不依赖 PATH 环境变量
- 使用完整路径，更可靠
- npx 会自动查找并运行命令

---

## 🔍 诊断脚本

**创建诊断脚本 check_env.bat：**

```batch
@echo off
chcp 65001 >nul
echo ============================================================
echo   Jenkins 环境变量诊断
echo ============================================================
echo.

echo [1/5] 检查 Node.js...
where node >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ 找到 node
    where node
    node --version
) else (
    echo ❌ 未找到 node
)
echo.

echo [2/5] 检查 npm...
where npm >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ 找到 npm
    where npm
    npm --version
) else (
    echo ❌ 未找到 npm
)
echo.

echo [3/5] 检查 apifox...
where apifox >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ 找到 apifox
    where apifox
    apifox --version
) else (
    echo ❌ 未找到 apifox
)
echo.

echo [4/5] 检查 PATH 环境变量...
echo PATH=%PATH%
echo.

echo [5/5] 检查常见 Node.js 安装路径...
if exist "C:\Program Files\nodejs\node.exe" (
    echo ✅ 找到: C:\Program Files\nodejs\node.exe
) else (
    echo ❌ 未找到: C:\Program Files\nodejs\node.exe
)

if exist "%APPDATA%\npm" (
    echo ✅ 找到: %APPDATA%\npm
) else (
    echo ❌ 未找到: %APPDATA%\npm
)

echo.
echo ============================================================
pause
```

---

## ✅ 验证修复

修复后，在 Jenkins 中运行构建，日志应该显示：

```
✅ 找到 apifox 命令
或
使用 npx.cmd 运行...
```

**不应该再出现：**
- `'apifox' 不是内部或外部命令`

---

## 📚 相关资源

- **Jenkins 环境变量文档**：https://www.jenkins.io/doc/book/pipeline/jenkinsfile/#using-environment-variables
- **Node.js 安装路径**：https://nodejs.org/
- **npm 全局安装路径**：https://docs.npmjs.com/cli/v8/configuring-npm/folders

---

**记住：Jenkins 使用 SYSTEM 账户运行时，PATH 环境变量可能不完整，需要在脚本中明确设置！** 🚀
