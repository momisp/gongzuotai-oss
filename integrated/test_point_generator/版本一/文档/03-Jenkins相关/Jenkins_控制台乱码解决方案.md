# Jenkins 控制台乱码解决方案

## 🔴 问题描述

**现象：**
- Jenkins 控制台输出中文显示为乱码（如：`ȱ١`、`�` 等）
- 日志中的中文无法正常查看
- 影响问题排查和调试

**原因：**
- Windows 默认使用 GBK/GB2312 编码
- Jenkins 控制台默认使用系统编码
- 批处理脚本输出编码不匹配
- 浏览器显示编码设置问题

---

## ✅ 解决方案（5种方法）

### 方案1：在批处理脚本中设置 UTF-8 编码（推荐）

**修改批处理脚本，在开头添加：**

```batch
@echo off
chcp 65001 >nul
```

**完整示例：**

```batch
@echo off
chcp 65001 >nul
echo ============================================================
echo   接口自动化测试
echo ============================================================
echo.

:: 设置 Node.js 路径
set "NODE_PATH=C:\Program Files\nodejs"
set PATH=%PATH%;%NODE_PATH%

:: 运行测试
"C:\Program Files\nodejs\npx.cmd" apifox run <你的测试URL> -r html,cli
```

**说明：**
- `chcp 65001` 将控制台编码设置为 UTF-8
- `>nul` 隐藏编码切换提示信息
- 必须在脚本开头执行

---

### 方案2：在 Jenkins Pipeline 中设置编码

**方法1：在 bat 命令中设置**

```groovy
pipeline {
  agent any
  
  stages {
    stage('运行测试') {
      steps {
        bat '''
          chcp 65001 >nul
          echo 开始执行测试...
          "C:\\Program Files\\nodejs\\npx.cmd" apifox run <你的测试URL> -r html,cli
        '''
      }
    }
  }
}
```

**方法2：使用环境变量**

```groovy
pipeline {
  agent any
  
  environment {
    // 设置编码环境变量
    JAVA_TOOL_OPTIONS = '-Dfile.encoding=UTF-8'
    LANG = 'zh_CN.UTF-8'
  }
  
  stages {
    stage('运行测试') {
      steps {
        bat '''
          chcp 65001 >nul
          echo 开始执行测试...
        '''
      }
    }
  }
}
```

---

### 方案3：在 Jenkins 系统配置中设置编码

**步骤1：进入系统配置**

1. Jenkins → **系统管理** → **系统配置**
2. 找到 **全局属性** 部分

**步骤2：添加环境变量**

点击 **环境变量** → **添加**：

```
名称：JAVA_TOOL_OPTIONS
值：-Dfile.encoding=UTF-8
```

再添加：

```
名称：LANG
值：zh_CN.UTF-8
```

**步骤3：保存并重启**

1. 点击 **保存**
2. 重启 Jenkins 服务

---

### 方案4：修改 Jenkins 启动参数

**步骤1：找到 Jenkins 启动脚本**

Windows 服务方式：
- 打开 **服务**（services.msc）
- 找到 **Jenkins** 服务
- 右键 → **属性** → **常规** → 查看 **可执行文件的路径**

**步骤2：修改启动参数**

在 Jenkins 启动命令中添加编码参数：

```bash
java -Dfile.encoding=UTF-8 -jar jenkins.war
```

**或者修改 `jenkins.xml`：**

找到 Jenkins 安装目录下的 `jenkins.xml`，修改：

```xml
<service>
  <id>Jenkins</id>
  <name>Jenkins</name>
  <description>Jenkins Continuous Integration Server</description>
  <env name="JENKINS_HOME" value="%BASE%"/>
  <env name="JAVA_TOOL_OPTIONS" value="-Dfile.encoding=UTF-8"/>
  <executable>java</executable>
  <arguments>-Xrs -Xmx256m -Dhudson.lifecycle=hudson.lifecycle.WindowsServiceLifecycle -jar "%BASE%\jenkins.war" --httpPort=8080</arguments>
</service>
```

**步骤3：重启 Jenkins**

重启 Jenkins 服务使配置生效。

---

### 方案5：浏览器编码设置

**如果控制台仍然显示乱码，检查浏览器设置：**

**Chrome/Edge：**
1. 打开 Jenkins 控制台页面
2. 按 `F12` 打开开发者工具
3. 查看 **Network** → **Response Headers**
4. 确认 `Content-Type` 包含 `charset=utf-8`

**如果浏览器编码不正确：**
- 安装浏览器插件强制 UTF-8
- 或使用其他浏览器（Firefox 通常编码处理更好）

---

## 🔧 完整示例

### 示例1：批处理脚本（推荐）

```batch
@echo off
chcp 65001 >nul
echo ============================================================
echo   接口自动化测试（UTF-8 编码）
echo ============================================================
echo.

:: 设置环境变量
set "NODE_PATH=C:\Program Files\nodejs"
set PATH=%PATH%;%NODE_PATH%

:: 运行测试
echo [1/2] 开始执行接口自动化测试...
"C:\Program Files\nodejs\npx.cmd" apifox run <你的测试URL> -r html,cli

if %errorlevel% equ 0 (
    echo [2/2] ✅ 测试执行成功
) else (
    echo [2/2] ❌ 测试执行失败
    exit /b 1
)
```

### 示例2：Jenkins Pipeline

```groovy
pipeline {
  agent any
  
  environment {
    // 设置编码
    JAVA_TOOL_OPTIONS = '-Dfile.encoding=UTF-8'
    LANG = 'zh_CN.UTF-8'
  }
  
  stages {
    stage('运行 Apifox 测试') {
      steps {
        script {
          echo '开始执行接口自动化测试...'
          bat '''
            @echo off
            chcp 65001 >nul
            echo ============================================================
            echo   接口自动化测试
            echo ============================================================
            echo.
            
            "C:\\Program Files\\nodejs\\npx.cmd" apifox run <你的测试URL> -r html,cli
          '''
        }
      }
    }
  }
  
  post {
    always {
      echo '测试执行完成'
    }
    
    success {
      echo '✅ 测试执行成功！'
    }
    
    failure {
      echo '❌ 测试执行失败！'
    }
  }
}
```

---

## 📋 快速修复步骤

### 步骤1：修改批处理脚本（最快）

在脚本开头添加：
```batch
@echo off
chcp 65001 >nul
```

### 步骤2：重新运行构建

1. 保存脚本
2. 在 Jenkins 中重新运行构建
3. 查看控制台输出

### 步骤3：如果仍有乱码

1. 检查 Jenkins 系统配置（方案3）
2. 检查浏览器编码设置（方案5）
3. 重启 Jenkins 服务

---

## 🔍 验证编码设置

### 方法1：在脚本中测试

```batch
@echo off
chcp 65001 >nul
echo 测试中文显示：接口自动化测试
echo 测试特殊字符：✅ ❌ ⚠️
```

### 方法2：查看控制台编码

在 Jenkins 控制台执行：
```batch
chcp
```

应该显示：`活动代码页: 65001`

---

## ⚠️ 注意事项

### 1. 脚本位置

**`chcp 65001` 必须在脚本最开头：**

```batch
@echo off
chcp 65001 >nul  ← 必须在这里
echo 其他内容
```

### 2. 多行 bat 命令

**在 Pipeline 中使用多行 bat：**

```groovy
bat '''
  chcp 65001 >nul
  echo 第一行
  echo 第二行
'''
```

### 3. 文件编码

**确保脚本文件本身是 UTF-8 编码：**
- 使用支持 UTF-8 的编辑器（VS Code、Notepad++）
- 保存时选择 UTF-8 编码

### 4. 日志文件编码

**如果导出日志文件：**
- 确保导出时选择 UTF-8 编码
- 或使用支持 UTF-8 的文本编辑器打开

---

## 🎯 推荐方案组合

**最佳实践（推荐）：**

1. ✅ **批处理脚本开头添加 `chcp 65001`**（必须）
2. ✅ **Jenkins Pipeline 中设置环境变量**（可选）
3. ✅ **Jenkins 系统配置添加编码环境变量**（可选，全局生效）

**这样配置后，所有构建都会正确显示中文。**

---

## 📊 编码对照表

| 编码 | 代码页 | 说明 |
|------|--------|------|
| UTF-8 | 65001 | 推荐，支持所有字符 |
| GBK | 936 | Windows 中文默认 |
| GB2312 | 936 | 简体中文 |
| ASCII | 437 | 英文 |

---

## ✅ 检查清单

### 脚本配置

- [ ] 批处理脚本开头已添加 `chcp 65001`
- [ ] 脚本文件保存为 UTF-8 编码
- [ ] Pipeline 中 bat 命令包含编码设置

### Jenkins 配置

- [ ] 系统配置中添加了编码环境变量（可选）
- [ ] Jenkins 服务已重启（如果修改了启动参数）

### 验证

- [ ] 控制台中文显示正常
- [ ] 日志文件中文正常
- [ ] 特殊字符（✅ ❌ ⚠️）显示正常

---

## 🔧 故障排查

### 问题1：添加了 chcp 65001 仍然乱码

**检查：**
1. `chcp 65001` 是否在脚本最开头
2. 脚本文件本身是否是 UTF-8 编码
3. Jenkins 系统编码设置

### 问题2：部分中文正常，部分乱码

**原因：**
- 可能是混合编码导致
- 某些输出来自其他程序（如 SQL 查询结果）

**解决：**
- 统一所有输出为 UTF-8
- 检查数据库连接编码设置

### 问题3：浏览器显示乱码

**解决：**
- 检查浏览器编码设置
- 尝试其他浏览器
- 清除浏览器缓存

---

## 📚 相关资源

- **Windows 代码页列表**：https://docs.microsoft.com/zh-cn/windows/win32/intl/code-page-identifiers
- **Jenkins 编码问题**：https://www.jenkins.io/doc/book/installing/windows/
- **UTF-8 编码说明**：https://zh.wikipedia.org/wiki/UTF-8

---

**记住：在脚本开头添加 `chcp 65001` 是最简单有效的方法！** 🚀
