# Jenkins Windows 配置问题解决

## 🔴 问题分析

### 错误信息

```
java.io.IOException: Cannot run program "nohup" 
CreateProcess error=2, 系统找不到指定的文件。
```

### 问题原因

**在 Windows 系统上使用了 `sh` 命令**

- `sh` 是 Unix/Linux 的 shell 命令
- Windows 系统上没有 `nohup` 命令（Unix 工具）
- Jenkins Pipeline 默认使用 Unix shell，但 Windows 不支持

---

## ✅ 解决方案

### 方案1：使用 `bat` 命令（推荐 Windows）

**修改 Pipeline 脚本：**

将所有的 `sh` 改为 `bat`：

```groovy
pipeline {
  agent any
  
  stages {
    stage('Install Apifox CLI') {
      steps {
        bat 'npm install -g apifox-cli'
        bat 'apifox --version'
      }
    }
    
    stage('Running Test Scenario') {
      steps {
        bat 'apifox run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xr1NaF2Dt6LEVP7Eac0cNT -r html,cli'
      }
    }
  }
}
```

### 方案2：使用 `powershell` 命令

**如果更喜欢 PowerShell：**

```groovy
pipeline {
  agent any
  
  stages {
    stage('Install Apifox CLI') {
      steps {
        powershell 'npm install -g apifox-cli'
        powershell 'apifox --version'
      }
    }
    
    stage('Running Test Scenario') {
      steps {
        powershell 'apifox run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xr1NaF2Dt6LEVP7Eac0cNT -r html,cli'
      }
    }
  }
}
```

### 方案3：配置 Jenkins 使用 Git Bash（如果已安装 Git）

**在 Jenkins 中配置：**

1. **系统管理** → **系统配置** → **全局属性**
2. **环境变量** → 添加：
   - **名称**：`PATH`
   - **值**：`C:\Program Files\Git\bin;%PATH%`

3. **然后在 Pipeline 中使用：**
   ```groovy
   sh 'npm install -g apifox-cli'
   ```

---

## 📝 完整的 Windows 版本 Pipeline

```groovy
pipeline {
  agent any
  
  stages {
    stage('Install Apifox CLI') {
      steps {
        script {
          echo '正在安装 Apifox CLI...'
          bat 'npm install -g apifox-cli'
          bat 'apifox --version'
        }
      }
    }
    
    stage('Running Test Scenario') {
      steps {
        script {
          echo '开始执行接口自动化测试...'
          bat 'apifox run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xr1NaF2Dt6LEVP7Eac0cNT -r html,cli'
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

## 🔧 快速修复步骤

### 步骤1：修改 Pipeline 脚本

1. **进入 Jenkins 任务配置**
   - 打开你的 Pipeline 任务
   - 点击「配置」

2. **修改脚本**
   - 找到 Pipeline 脚本部分
   - 将所有 `sh` 改为 `bat`
   - 保存

### 步骤2：重新运行

1. **保存配置**
2. **点击「立即构建」**
3. **查看构建日志**

---

## 📊 命令对比

| 命令 | 适用系统 | 说明 |
|------|---------|------|
| `sh` | Linux/Unix/Mac | Unix shell 命令 |
| `bat` | Windows | Windows 批处理命令 |
| `powershell` | Windows | PowerShell 命令 |

---

## ⚠️ 注意事项

### 1. Node.js 路径

**确保 Node.js 在系统 PATH 中：**

```bash
# 在 Windows CMD 中测试
npm --version
node --version
```

如果命令不存在，需要：
- 安装 Node.js
- 或将 Node.js 添加到系统 PATH

### 2. npm 全局安装权限

**如果遇到权限问题：**

```groovy
// 使用 --unsafe-perm 参数
bat 'npm install -g apifox-cli --unsafe-perm'
```

### 3. 路径分隔符

**Windows 使用反斜杠 `\`，但 Pipeline 中通常使用正斜杠 `/` 也可以：**

```groovy
// 都可以
bat 'cd C:\\Users\\yzyz'
bat 'cd C:/Users/yzyz'
```

---

## 🎯 验证修复

修复后，构建日志应该显示：

```
[Pipeline] bat
[Pipeline] {
[Pipeline] echo
正在安装 Apifox CLI...
[Pipeline] bat
npm install -g apifox-cli
[Pipeline] }
```

**不应该再出现：**
- `Cannot run program "nohup"`
- `系统找不到指定的文件`

---

## 📚 相关资源

- **Jenkins Pipeline 文档**：https://www.jenkins.io/doc/book/pipeline/
- **Windows 批处理命令**：https://docs.microsoft.com/zh-cn/windows-server/administration/windows-commands/windows-commands

---

## ✅ 修复检查清单

- [ ] 已将 `sh` 改为 `bat`
- [ ] 已保存 Pipeline 配置
- [ ] Node.js 已安装并在 PATH 中
- [ ] npm 命令可用
- [ ] 已重新运行构建
- [ ] 构建成功

---

**记住：Windows 上使用 `bat`，Linux/Mac 上使用 `sh`！** 🚀
