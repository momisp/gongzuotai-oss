# Jenkins 浏览器乱码和顺序执行问题解决

## 🔴 问题描述

### 问题1：浏览器中 Jenkins 控制台显示乱码
- **现象：** 浏览器中查看 Jenkins 控制台输出，中文显示为乱码
- **但：** 黑窗口（CMD）中显示正常
- **原因：** Jenkins Web 界面的响应编码设置问题

### 问题2：bat 文件只执行第一个测试
- **现象：** 批处理脚本只执行了第一个自动化测试，后续测试没有执行
- **原因：** 
  - 命令执行后没有正确等待完成
  - 错误码检查时机不对
  - 需要使用 `call` 命令确保命令执行完成

---

## ✅ 解决方案

### 方案1：修复批处理脚本（必须）

**关键修改：**

1. **使用 `call` 命令**
   ```batch
   call "%NODE_PATH%\npx.cmd" apifox run <URL>
   ```

2. **使用延迟变量扩展**
   ```batch
   setlocal EnableDelayedExpansion
   set TEST1_RESULT=%errorlevel%
   ```

3. **保存错误码到变量**
   ```batch
   call "%NODE_PATH%\npx.cmd" apifox run <URL>
   set TEST1_RESULT=%errorlevel%
   if %TEST1_RESULT% neq 0 exit /b 1
   ```

**完整修复后的脚本：**

```batch
@echo off
:: 设置 UTF-8 编码（解决乱码问题）
chcp 65001 >nul
:: 启用延迟变量扩展（确保错误码正确获取）
setlocal EnableDelayedExpansion

echo ============================================================
echo   Apifox 接口自动化测试（批量执行）
echo ============================================================
echo.

:: 设置 Node.js 路径
set "NODE_PATH=C:\Program Files\nodejs"

:: 检查 Node.js
if not exist "%NODE_PATH%\npx.cmd" (
    echo [错误] 未找到 Node.js
    exit /b 1
)

echo [准备] Node.js 路径: %NODE_PATH%
echo.

:: 测试1
echo [1/3] 执行测试：用户购买会员业务场景
call "%NODE_PATH%\npx.cmd" apifox run <URL1> -r html,cli
set TEST1_RESULT=%errorlevel%
if %TEST1_RESULT% neq 0 (
    echo [错误] 测试1执行失败，错误码: %TEST1_RESULT%
    exit /b 1
)
echo [成功] 测试1执行成功
echo.

timeout /t 2 /nobreak >nul

:: 测试2
echo [2/3] 执行测试：获取token
call "%NODE_PATH%\npx.cmd" apifox run <URL2> -r html,cli
set TEST2_RESULT=%errorlevel%
if %TEST2_RESULT% neq 0 (
    echo [错误] 测试2执行失败，错误码: %TEST2_RESULT%
    exit /b 1
)
echo [成功] 测试2执行成功
echo.

timeout /t 2 /nobreak >nul

:: 测试3
echo [3/3] 执行测试：李飞翔的接口自动化
call "%NODE_PATH%\npx.cmd" apifox run <URL3> -r html,cli
set TEST3_RESULT=%errorlevel%
if %TEST3_RESULT% neq 0 (
    echo [错误] 测试3执行失败，错误码: %TEST3_RESULT%
    exit /b 1
)
echo [成功] 测试3执行成功
echo.

echo ============================================================
echo   [完成] 所有测试执行完成
echo ============================================================
exit /b 0
```

---

### 方案2：解决浏览器乱码（Jenkins 系统配置）

**步骤1：在 Jenkins 系统配置中设置编码**

1. **进入系统配置**
   - Jenkins → **系统管理** → **系统配置**
   - 找到 **全局属性** 部分

2. **添加环境变量**
   
   点击 **环境变量** → **添加**：
   
   ```
   名称：JAVA_TOOL_OPTIONS
   值：-Dfile.encoding=UTF-8 -Duser.language=zh -Duser.country=CN
   ```
   
   再添加：
   ```
   名称：LANG
   值：zh_CN.UTF-8
   ```

3. **保存并重启**
   - 点击 **保存**
   - 重启 Jenkins 服务

**步骤2：修改 Jenkins 启动参数**

找到 Jenkins 安装目录下的 `jenkins.xml`，修改：

```xml
<service>
  <id>Jenkins</id>
  <name>Jenkins</name>
  <description>Jenkins Continuous Integration Server</description>
  <env name="JENKINS_HOME" value="%BASE%"/>
  <env name="JAVA_TOOL_OPTIONS" value="-Dfile.encoding=UTF-8 -Duser.language=zh -Duser.country=CN"/>
  <executable>java</executable>
  <arguments>-Xrs -Xmx256m -Dhudson.lifecycle=hudson.lifecycle.WindowsServiceLifecycle -jar "%BASE%\jenkins.war" --httpPort=8080</arguments>
</service>
```

**步骤3：重启 Jenkins**

重启 Jenkins 服务使配置生效。

---

### 方案3：使用 Jenkins Pipeline（推荐）

**Pipeline 脚本可以更好地控制编码：**

```groovy
pipeline {
  agent any
  
  environment {
    // 设置编码环境变量
    JAVA_TOOL_OPTIONS = '-Dfile.encoding=UTF-8 -Duser.language=zh -Duser.country=CN'
    LANG = 'zh_CN.UTF-8'
  }
  
  stages {
    stage('批量执行 Apifox 测试') {
      steps {
        script {
          echo '开始执行接口自动化测试...'
          
          bat '''
            @echo off
            chcp 65001 >nul
            setlocal EnableDelayedExpansion
            
            set "NODE_PATH=C:\\Program Files\\nodejs"
            
            :: 测试1
            echo [1/3] 执行测试：用户购买会员业务场景
            call "%NODE_PATH%\\npx.cmd" apifox run <URL1> -r html,cli
            set TEST1_RESULT=!errorlevel!
            if !TEST1_RESULT! neq 0 (
                echo [错误] 测试1执行失败
                exit /b 1
            )
            echo [成功] 测试1执行成功
            echo.
            
            timeout /t 2 /nobreak >nul
            
            :: 测试2
            echo [2/3] 执行测试：获取token
            call "%NODE_PATH%\\npx.cmd" apifox run <URL2> -r html,cli
            set TEST2_RESULT=!errorlevel!
            if !TEST2_RESULT! neq 0 (
                echo [错误] 测试2执行失败
                exit /b 1
            )
            echo [成功] 测试2执行成功
            echo.
            
            timeout /t 2 /nobreak >nul
            
            :: 测试3
            echo [3/3] 执行测试：李飞翔的接口自动化
            call "%NODE_PATH%\\npx.cmd" apifox run <URL3> -r html,cli
            set TEST3_RESULT=!errorlevel!
            if !TEST3_RESULT! neq 0 (
                echo [错误] 测试3执行失败
                exit /b 1
            )
            echo [成功] 测试3执行成功
            echo.
            
            echo [完成] 所有测试执行完成
          '''
        }
      }
    }
  }
}
```

**注意：** Pipeline 中使用延迟变量扩展时，使用 `!errorlevel!` 而不是 `%errorlevel%`。

---

## 🔍 关键修改说明

### 1. 使用 `call` 命令

**为什么需要 `call`？**

- 批处理脚本中，直接调用另一个批处理文件时，执行完后会退出当前脚本
- 使用 `call` 可以确保执行完后返回到当前脚本继续执行

**错误写法：**
```batch
"%NODE_PATH%\npx.cmd" apifox run <URL>
:: 执行完后可能直接退出，不会继续执行后续命令
```

**正确写法：**
```batch
call "%NODE_PATH%\npx.cmd" apifox run <URL>
:: 执行完后会继续执行后续命令
```

### 2. 延迟变量扩展

**为什么需要延迟变量扩展？**

- 批处理脚本中，`%errorlevel%` 在命令执行后立即检查可能不准确
- 使用延迟变量扩展 `!errorlevel!` 可以确保获取到正确的错误码

**错误写法：**
```batch
apifox run <URL>
if %errorlevel% neq 0 exit /b 1
:: errorlevel 可能不是最新的值
```

**正确写法：**
```batch
setlocal EnableDelayedExpansion
call apifox run <URL>
set TEST_RESULT=!errorlevel!
if !TEST_RESULT! neq 0 exit /b 1
```

### 3. 保存错误码到变量

**为什么需要保存到变量？**

- 确保错误码不会因为后续命令而改变
- 可以更清晰地追踪每个测试的执行结果

---

## ✅ 快速修复步骤

### 步骤1：修改批处理脚本

1. **添加 `call` 命令**
   ```batch
   call "%NODE_PATH%\npx.cmd" apifox run <URL>
   ```

2. **启用延迟变量扩展**
   ```batch
   setlocal EnableDelayedExpansion
   ```

3. **保存错误码**
   ```batch
   call "%NODE_PATH%\npx.cmd" apifox run <URL>
   set TEST_RESULT=!errorlevel!
   if !TEST_RESULT! neq 0 exit /b 1
   ```

### 步骤2：解决浏览器乱码

1. **Jenkins 系统配置** → **全局属性** → **环境变量**
2. **添加：**
   - `JAVA_TOOL_OPTIONS` = `-Dfile.encoding=UTF-8 -Duser.language=zh -Duser.country=CN`
   - `LANG` = `zh_CN.UTF-8`
3. **重启 Jenkins**

### 步骤3：测试验证

1. **运行修复后的脚本**
2. **检查：**
   - ✅ 所有测试是否都执行了
   - ✅ 浏览器中中文是否正常显示
   - ✅ 错误处理是否正确

---

## 📋 检查清单

### 脚本修复

- [ ] 已添加 `call` 命令
- [ ] 已启用延迟变量扩展（`setlocal EnableDelayedExpansion`）
- [ ] 已保存错误码到变量
- [ ] 已使用 `!errorlevel!` 而不是 `%errorlevel%`（如果使用延迟扩展）

### Jenkins 配置

- [ ] 已在系统配置中添加编码环境变量
- [ ] 已重启 Jenkins 服务
- [ ] 浏览器中中文显示正常

### 验证

- [ ] 所有测试都执行了
- [ ] 测试按顺序执行
- [ ] 失败时正确停止
- [ ] 浏览器中中文正常显示

---

## ⚠️ 常见问题

### 问题1：使用 `call` 后仍然只执行第一个

**检查：**
- 第一个测试是否失败（查看错误码）
- 是否添加了 `setlocal EnableDelayedExpansion`
- 是否使用 `!errorlevel!` 而不是 `%errorlevel%`

### 问题2：浏览器仍然乱码

**检查：**
- Jenkins 系统配置是否已设置
- Jenkins 服务是否已重启
- 浏览器缓存是否已清除
- 尝试其他浏览器

### 问题3：延迟变量扩展不生效

**检查：**
- 是否添加了 `setlocal EnableDelayedExpansion`
- 是否使用 `!变量名!` 而不是 `%变量名%`
- Pipeline 中是否正确转义

---

**记住：使用 `call` + 延迟变量扩展 + Jenkins 编码配置 = 完美解决！** 🚀
