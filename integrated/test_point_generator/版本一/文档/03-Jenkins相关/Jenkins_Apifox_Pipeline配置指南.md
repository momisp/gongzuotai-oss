# Jenkins + Apifox Pipeline 配置指南

## 📋 配置方式说明

Jenkins Pipeline 有两种配置方式：

1. **Pipeline 脚本方式**（在 Jenkins Web 界面中配置）
2. **Jenkinsfile 方式**（在代码仓库中配置）

---

## 🚀 方法1：在 Jenkins Web 界面中配置（推荐新手）

### 步骤1：创建 Pipeline 任务

1. **登录 Jenkins**
   - 打开 Jenkins 地址（如：http://localhost:8080）
   - 使用管理员账号登录

2. **创建新任务**
   - 点击左侧菜单 **「新建任务」** 或 **「New Item」**
   - 输入任务名称（如：`Apifox_API_Test`）
   - 选择 **「流水线」** 或 **「Pipeline」**
   - 点击 **「确定」**

### 步骤2：配置 Pipeline 脚本

1. **进入任务配置页面**
   - 在任务列表中点击刚创建的任务
   - 点击左侧菜单 **「配置」** 或 **「Configure」**

2. **找到 Pipeline 配置区域**
   - 向下滚动找到 **「流水线」** 或 **「Pipeline」** 部分
   - 在 **「定义」** 或 **「Definition」** 下拉菜单中选择：
     - **「Pipeline 脚本」** 或 **「Pipeline script」**

3. **粘贴 Pipeline 脚本**
   - 在 **「脚本」** 或 **「Script」** 文本框中粘贴以下代码：

```groovy
pipeline {
  agent any
  tools {
    nodejs "{your_nodejs_configured_tool_name}"
  }
  stages {
    stage('Install Apifox CLI') {
      steps {
        sh 'npm install -g apifox-cli'
      }
    }
    stage('Running Test Scenario') {
      steps {
        sh 'apifox run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xr1NaF2Dt6LEVP7Eac0cNT -r html,cli'
      }
    }
  }
}
```

### 步骤3：修改配置参数

**需要修改的部分：**

1. **Node.js 工具名称**
   ```groovy
   tools {
     nodejs "{your_nodejs_configured_tool_name}"
   }
   ```
   - 将 `{your_nodejs_configured_tool_name}` 替换为你在 Jenkins 中配置的 Node.js 工具名称
   - 如果 Jenkins 中没有配置 Node.js，可以删除整个 `tools` 块（但需要确保 Jenkins 服务器上有 Node.js）

2. **Apifox 测试 URL**
   ```groovy
   sh 'apifox run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xr1NaF2Dt6LEVP7Eac0cNT -r html,cli'
   ```
   - 这个 URL 是从 Apifox 中获取的，通常不需要修改
   - 如果需要修改，在 Apifox 中重新生成 CI/CD 配置

### 步骤4：保存并运行

1. **保存配置**
   - 点击页面底部的 **「保存」** 或 **「Save」**

2. **运行 Pipeline**
   - 返回任务页面
   - 点击左侧菜单 **「立即构建」** 或 **「Build Now」**
   - 查看构建日志，确认是否成功

---

## 📝 方法2：使用 Jenkinsfile（推荐团队协作）

### 步骤1：创建 Jenkinsfile

在项目根目录创建 `Jenkinsfile` 文件：

```groovy
pipeline {
  agent any
  tools {
    nodejs "{your_nodejs_configured_tool_name}"
  }
  stages {
    stage('Install Apifox CLI') {
      steps {
        sh 'npm install -g apifox-cli'
      }
    }
    stage('Running Test Scenario') {
      steps {
        sh 'apifox run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xr1NaF2Dt6LEVP7Eac0cNT -r html,cli'
      }
    }
  }
  post {
    always {
      // 发布测试报告
      publishHTML([
        reportName: 'Apifox Test Report',
        reportDir: '.',
        reportFiles: 'apifox-report.html',
        reportTitles: '接口自动化测试报告'
      ])
    }
  }
}
```

### 步骤2：提交到代码仓库

```bash
# 将 Jenkinsfile 添加到 Git
git add Jenkinsfile
git commit -m "Add Jenkinsfile for Apifox API testing"
git push
```

### 步骤3：在 Jenkins 中配置 Pipeline

1. **创建 Pipeline 任务**
   - 新建任务 → 选择 **「流水线」** 或 **「Pipeline」**

2. **配置 Pipeline**
   - 在 **「定义」** 中选择：**「Pipeline 脚本来自 SCM」** 或 **「Pipeline script from SCM」**
   - **SCM** 选择：**「Git」**
   - **Repository URL**：填写你的代码仓库地址
   - **Credentials**：如果需要认证，添加 Git 凭据
   - **Branch Specifier**：`*/main` 或 `*/master`（根据你的分支名）
   - **Script Path**：`Jenkinsfile`（如果文件在根目录）

3. **保存并运行**

---

## 🔧 详细配置说明

### 1. Node.js 工具配置（如果使用 tools）

**在 Jenkins 中配置 Node.js：**

1. **进入 Jenkins 管理**
   - 点击 **「系统管理」** → **「全局工具配置」**

2. **配置 Node.js**
   - 找到 **「NodeJS」** 部分
   - 点击 **「新增 NodeJS」**
   - 填写：
     - **名称**：如 `NodeJS-18`（这个名称要替换到 Pipeline 脚本中）
     - **版本**：选择 Node.js 版本（如 18.x）
   - 点击 **「保存」**

3. **在 Pipeline 中使用**
   ```groovy
   tools {
     nodejs "NodeJS-18"  // 使用刚才配置的名称
   }
   ```

### 2. 不使用 tools 的方式（如果 Jenkins 已有 Node.js）

如果 Jenkins 服务器上已经安装了 Node.js，可以删除 `tools` 块：

```groovy
pipeline {
  agent any
  // 删除 tools 块
  stages {
    stage('Install Apifox CLI') {
      steps {
        sh 'npm install -g apifox-cli'
      }
    }
    stage('Running Test Scenario') {
      steps {
        sh 'apifox run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xr1NaF2Dt6LEVP7Eac0cNT -r html,cli'
      }
    }
  }
}
```

### 3. 添加测试报告发布

**安装 HTML Publisher 插件：**

1. **安装插件**
   - 系统管理 → 插件管理
   - 搜索 `HTML Publisher`
   - 安装并重启 Jenkins

2. **在 Pipeline 中添加报告发布**
   ```groovy
   post {
     always {
       publishHTML([
         reportName: 'Apifox Test Report',
         reportDir: '.',
         reportFiles: 'apifox-report.html',
         reportTitles: '接口自动化测试报告'
       ])
     }
   }
   ```

---

## 📊 完整 Pipeline 示例（增强版）

```groovy
pipeline {
  agent any
  
  tools {
    nodejs "NodeJS-18"  // 修改为你的 Node.js 工具名称
  }
  
  stages {
    stage('Install Apifox CLI') {
      steps {
        script {
          echo '正在安装 Apifox CLI...'
          sh 'npm install -g apifox-cli'
          sh 'apifox --version'
        }
      }
    }
    
    stage('Running Test Scenario') {
      steps {
        script {
          echo '开始执行接口自动化测试...'
          sh 'apifox run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xr1NaF2Dt6LEVP7Eac0cNT -r html,cli'
        }
      }
    }
  }
  
  post {
    always {
      // 发布测试报告
      publishHTML([
        reportName: 'Apifox Test Report',
        reportDir: '.',
        reportFiles: 'apifox-report.html',
        reportTitles: '接口自动化测试报告'
      ])
      
      // 清理工作空间（可选）
      cleanWs()
    }
    
    success {
      echo '✅ 测试执行成功！'
    }
    
    failure {
      echo '❌ 测试执行失败！'
      // 可以添加邮件通知等
    }
  }
}
```

---

## 🎯 配置位置总结

### 方式1：Jenkins Web 界面

**配置位置：**
```
Jenkins → 任务名称 → 配置 → Pipeline → 脚本
```

**步骤：**
1. 创建 Pipeline 任务
2. 进入配置页面
3. 找到 Pipeline 部分
4. 选择「Pipeline 脚本」
5. 粘贴脚本
6. 保存

### 方式2：Jenkinsfile

**配置位置：**
```
项目根目录 → Jenkinsfile
```

**步骤：**
1. 在项目根目录创建 Jenkinsfile
2. 提交到代码仓库
3. 在 Jenkins 中配置 Pipeline from SCM
4. 指定 Jenkinsfile 路径

---

## ⚠️ 常见问题

### 问题1：找不到 Node.js 工具

**错误：**
```
Tool 'NodeJS-18' not found
```

**解决：**
1. 在 Jenkins 中配置 Node.js 工具
2. 或者删除 `tools` 块，使用系统已安装的 Node.js

### 问题2：npm 命令不存在

**错误：**
```
npm: command not found
```

**解决：**
1. 确保 Jenkins 服务器上安装了 Node.js
2. 或者配置 Node.js 工具

### 问题3：apifox-cli 安装失败

**错误：**
```
npm ERR! code EACCES
```

**解决：**
```groovy
// 使用 --unsafe-perm 参数
sh 'npm install -g apifox-cli --unsafe-perm'
```

### 问题4：测试报告找不到

**错误：**
```
File 'apifox-report.html' does not exist
```

**解决：**
1. 检查 Apifox CLI 是否生成了报告
2. 确认报告文件名和路径
3. 修改 `reportFiles` 为实际的文件名

---

## 📚 相关资源

- **Jenkins Pipeline 文档**：https://www.jenkins.io/doc/book/pipeline/
- **Apifox CLI 文档**：https://apifox.com/help/app/cli/
- **HTML Publisher 插件**：https://plugins.jenkins.io/htmlpublisher/

---

## ✅ 配置检查清单

- [ ] Jenkins 已安装并运行
- [ ] Node.js 已安装或已配置工具
- [ ] Pipeline 脚本已粘贴到正确位置
- [ ] Node.js 工具名称已修改
- [ ] Apifox 测试 URL 正确
- [ ] 已保存配置
- [ ] 已测试运行 Pipeline

---

**配置完成后，点击「立即构建」即可运行 Apifox 接口自动化测试！** 🚀
