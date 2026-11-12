# Jenkins 批量执行 Apifox 测试指南

## 🎯 目标

在 Jenkins 中配置 bat 文件，让多个 Apifox 自动化测试按顺序执行。

---

## ✅ 完整批处理脚本模板

### 方案1：使用 npx（推荐，最可靠）

```batch
@echo off
chcp 65001 >nul
echo ============================================================
echo   Apifox 接口自动化测试（批量执行）
echo ============================================================
echo.

:: 设置 Node.js 路径（根据实际路径修改）
set "NODE_PATH=C:\Program Files\nodejs"
if not exist "%NODE_PATH%\npx.cmd" (
    echo ❌ 未找到 Node.js，请检查安装路径
    exit /b 1
)

echo [准备] Node.js 路径: %NODE_PATH%
echo.

:: ============================================================
:: 测试1：用户购买会员业务场景
:: ============================================================
echo [1/3] 执行测试：用户购买会员业务场景
echo ============================================================
"%NODE_PATH%\npx.cmd" apifox run https://api.apifox.com/api/v1/projects/7828807/api-test/ci-config/507950/detail?token=xe8W0pOJ6fc6JCd7wiIi8K -r html,cli --upload-report detail
if %errorlevel% neq 0 (
    echo ❌ 测试1执行失败
    exit /b 1
)
echo ✅ 测试1执行成功
echo.

:: 延迟（可选，避免请求过快）
timeout /t 2 /nobreak >nul

:: ============================================================
:: 测试2：获取token
:: ============================================================
echo [2/3] 执行测试：获取token
echo ============================================================
"%NODE_PATH%\npx.cmd" apifox run --access-token afxp_20678eBfLxKywYWF6Ae6ho5Te3I2UyZIGGXQ -t 7941946 -e 42555539 -n 1 -r html,cli --notification 314967
if %errorlevel% neq 0 (
    echo ❌ 测试2执行失败
    exit /b 1
)
echo ✅ 测试2执行成功
echo.

:: 延迟
timeout /t 2 /nobreak >nul

:: ============================================================
:: 测试3：李飞翔的接口自动化
:: ============================================================
echo [3/3] 执行测试：李飞翔的接口自动化
echo ============================================================
"%NODE_PATH%\npx.cmd" apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/507958/detail?token=xK6sMNzyfHJUk5GLnYfVVX -r html,cli --upload-report detail
if %errorlevel% neq 0 (
    echo ❌ 测试3执行失败
    exit /b 1
)
echo ✅ 测试3执行成功
echo.

:: ============================================================
echo ============================================================
echo   ✅ 所有测试执行完成
echo ============================================================
exit /b 0
```

---

### 方案2：使用 PATH（如果 apifox 已全局安装）

```batch
@echo off
chcp 65001 >nul
echo ============================================================
echo   Apifox 接口自动化测试（批量执行）
echo ============================================================
echo.

:: 设置 PATH
set PATH=%PATH%;C:\Program Files\nodejs
set PATH=%PATH%;%APPDATA%\npm

:: 检查 apifox 是否可用
where apifox >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 未找到 apifox 命令，请使用 npx 方式
    exit /b 1
)

echo [准备] 环境检查完成
echo.

:: 测试1
echo [1/3] 执行测试：用户购买会员业务场景
apifox run https://api.apifox.com/api/v1/projects/7828807/api-test/ci-config/507950/detail?token=xe8W0pOJ6fc6JCd7wiIi8K -r html,cli --upload-report detail
if %errorlevel% neq 0 (
    echo ❌ 测试1执行失败
    exit /b 1
)
echo ✅ 测试1执行成功
echo.

timeout /t 2 /nobreak >nul

:: 测试2
echo [2/3] 执行测试：获取token
apifox run --access-token afxp_20678eBfLxKywYWF6Ae6ho5Te3I2UyZIGGXQ -t 7941946 -e 42555539 -n 1 -r html,cli --notification 314967
if %errorlevel% neq 0 (
    echo ❌ 测试2执行失败
    exit /b 1
)
echo ✅ 测试2执行成功
echo.

timeout /t 2 /nobreak >nul

:: 测试3
echo [3/3] 执行测试：李飞翔的接口自动化
apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/507958/detail?token=xK6sMNzyfHJUk5GLnYfVVX -r html,cli --upload-report detail
if %errorlevel% neq 0 (
    echo ❌ 测试3执行失败
    exit /b 1
)
echo ✅ 测试3执行成功
echo.

echo ============================================================
echo   ✅ 所有测试执行完成
echo ============================================================
exit /b 0
```

---

## 🔧 关键配置说明

### 1. 编码设置（必须）

```batch
@echo off
chcp 65001 >nul
```

**作用：** 设置控制台为 UTF-8 编码，解决中文乱码问题。

### 2. 错误处理（重要）

```batch
if %errorlevel% neq 0 (
    echo ❌ 测试执行失败
    exit /b 1
)
```

**作用：** 
- 检查上一个命令的执行结果
- 如果失败（errorlevel ≠ 0），输出错误信息并退出
- 确保后续测试只在前面测试成功时执行

### 3. 延迟设置（可选）

```batch
timeout /t 2 /nobreak >nul
```

**作用：**
- 延迟 2 秒，避免请求过快
- `/nobreak` 表示用户无法中断
- `>nul` 隐藏输出

### 4. 使用 npx（推荐）

```batch
"%NODE_PATH%\npx.cmd" apifox run ...
```

**优势：**
- ✅ 不需要设置 PATH
- ✅ 使用完整路径，更可靠
- ✅ 即使 apifox-cli 未全局安装也能运行
- ✅ Jenkins 中更稳定

---

## 📋 配置步骤

### 步骤1：创建批处理文件

1. **创建文件** `run_apifox_tests.bat`
2. **复制上面的脚本模板**
3. **修改以下内容：**
   - Node.js 路径（如果不在默认位置）
   - Apifox 测试 URL 和 Token
   - 测试名称和数量

### 步骤2：在 Jenkins 中配置

**方法1：使用批处理脚本（推荐）**

1. **创建 Jenkins 任务**
   - Jenkins → 新建任务
   - 选择「自由风格的软件项目」

2. **配置构建步骤**
   - 构建 → 增加构建步骤 → 「执行 Windows 批处理命令」
   - 输入：`run_apifox_tests.bat`
   - 或直接粘贴脚本内容

3. **保存并运行**
   - 点击「保存」
   - 点击「立即构建」

**方法2：使用 Pipeline**

```groovy
pipeline {
  agent any
  
  stages {
    stage('批量执行 Apifox 测试') {
      steps {
        bat '''
          @echo off
          chcp 65001 >nul
          echo 开始执行测试...
          
          "C:\\Program Files\\nodejs\\npx.cmd" apifox run <你的测试URL1> -r html,cli
          if %errorlevel% neq 0 exit /b 1
          
          timeout /t 2 /nobreak >nul
          
          "C:\\Program Files\\nodejs\\npx.cmd" apifox run <你的测试URL2> -r html,cli
          if %errorlevel% neq 0 exit /b 1
        '''
      }
    }
  }
}
```

---

## ⚠️ 重要注意事项

### 1. 顺序执行

**批处理脚本默认按顺序执行**，但需要注意：

- ✅ 使用 `if %errorlevel% neq 0 exit /b 1` 确保失败时停止
- ✅ 使用 `timeout` 添加延迟，避免请求过快
- ✅ 每个测试独立检查错误码

### 2. 错误处理

**三种错误处理策略：**

**策略1：遇到失败立即停止（推荐）**
```batch
apifox run <URL>
if %errorlevel% neq 0 (
    echo ❌ 测试失败，停止执行
    exit /b 1
)
```

**策略2：记录失败但继续执行**
```batch
apifox run <URL>
if %errorlevel% neq 0 (
    echo ❌ 测试失败，但继续执行下一个
    set FAILED=1
)
```

**策略3：忽略错误**
```batch
apifox run <URL> || echo 测试失败但继续
```

### 3. Node.js 路径

**查找 Node.js 路径：**

```cmd
where node
```

**常见路径：**
- `C:\Program Files\nodejs`
- `C:\Program Files (x86)\nodejs`
- `C:\Users\<用户名>\AppData\Roaming\npm`（npm 全局包路径）

### 4. 路径中的空格

**如果路径包含空格，必须用引号：**

```batch
"C:\Program Files\nodejs\npx.cmd" apifox run ...
```

---

## 🎯 完整示例（根据你的图片）

```batch
@echo off
chcp 65001 >nul
echo ============================================================
echo   Apifox 接口自动化测试（批量执行）
echo ============================================================
echo.

:: 设置 Node.js 路径
set "NODE_PATH=C:\Program Files\nodejs"

:: 检查 Node.js 是否存在
if not exist "%NODE_PATH%\npx.cmd" (
    echo ❌ 未找到 Node.js，请检查安装路径
    echo 当前路径: %NODE_PATH%
    exit /b 1
)

echo [准备] Node.js 路径: %NODE_PATH%
echo.

:: ============================================================
:: 1. 运行测试-用户购买会员业务场景
:: ============================================================
echo [1/1] 执行测试：用户购买会员业务场景
echo ============================================================
"%NODE_PATH%\npx.cmd" apifox run https://api.apifox.com/api/v1/projects/7828807/api-test/ci-config/507950/detail?token=xe8W0pOJ6fc6JCd7wiIi8K -r html,cli --upload-report detail

if %errorlevel% neq 0 (
    echo.
    echo ❌ 测试执行失败，错误码: %errorlevel%
    exit /b 1
)

echo.
echo ✅ 测试执行成功
echo.

:: 如果需要执行更多测试，取消下面的注释并添加
:: timeout /t 2 /nobreak >nul
:: echo [2/2] 执行测试：获取token
:: "%NODE_PATH%\npx.cmd" apifox run --access-token afxp_20678eBfLxKywYWF6Ae6ho5Te3I2UyZIGGXQ -t 7941946 -e 42555539 -n 1 -r html,cli --notification 314967
:: if %errorlevel% neq 0 exit /b 1

echo ============================================================
echo   ✅ 所有测试执行完成
echo ============================================================
exit /b 0
```

---

## ✅ 快速检查清单

### 脚本配置

- [ ] 已添加 `chcp 65001 >nul`（解决乱码）
- [ ] 已设置 Node.js 路径
- [ ] 已使用 npx 或完整路径
- [ ] 已添加错误处理（`if %errorlevel%`）
- [ ] 已添加延迟（可选）

### Jenkins 配置

- [ ] 已创建批处理文件
- [ ] 已在 Jenkins 中配置构建步骤
- [ ] 已测试运行

### 验证

- [ ] 控制台输出中文正常
- [ ] 测试按顺序执行
- [ ] 失败时正确停止
- [ ] 成功时继续执行

---

## 🔍 故障排查

### 问题1：命令不按顺序执行

**原因：** 批处理脚本默认是顺序执行的，但可能因为：
- 命令是异步执行的
- 没有等待命令完成

**解决：** 确保使用同步命令，不要使用 `start` 或 `&` 后台执行。

### 问题2：失败后继续执行

**原因：** 没有检查错误码

**解决：** 添加错误检查：
```batch
apifox run <URL>
if %errorlevel% neq 0 exit /b 1
```

### 问题3：找不到 apifox 命令

**原因：** PATH 环境变量问题

**解决：** 使用 npx 完整路径：
```batch
"C:\Program Files\nodejs\npx.cmd" apifox run ...
```

---

**记住：使用 npx 完整路径 + 错误检查 = 最可靠的方案！** 🚀
