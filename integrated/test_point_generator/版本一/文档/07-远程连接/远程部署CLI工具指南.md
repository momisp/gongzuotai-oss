# 远程部署 CLI 工具指南

## 🎯 目标

在远程测试环境服务器上部署 CLI 工具（如 Apifox CLI），用于接口自动化测试。

---

## 🚀 快速部署（3步）

### 步骤1：连接服务器

**Linux：**
```bash
ssh root@192.168.1.100
```

**Windows：**
```
远程桌面连接
```

### 步骤2：安装 Node.js

**Linux：**
```bash
# 使用包管理器安装
# CentOS/RHEL
yum install nodejs npm

# Ubuntu/Debian
apt install nodejs npm

# 或使用 NVM（推荐）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
```

**Windows：**
1. 下载 Node.js：https://nodejs.org/
2. 运行安装程序
3. 完成安装

### 步骤3：安装 CLI 工具

**Apifox CLI：**
```bash
npm install -g apifox-cli
```

**验证：**
```bash
apifox --version
```

---

## 📋 详细步骤

### 步骤1：检查环境

**检查 Node.js：**
```bash
node --version
npm --version
```

**如果没有，先安装 Node.js**

### 步骤2：安装 CLI 工具

**Apifox CLI：**
```bash
# 全局安装
npm install -g apifox-cli

# 验证安装
apifox --version
```

**其他常用 CLI：**
```bash
# Postman CLI (Newman)
npm install -g newman

# 其他工具
npm install -g <tool-name>
```

### 步骤3：配置 CLI

**Apifox CLI：**
```bash
# 查看帮助
apifox --help

# 运行测试
apifox run <测试URL>
```

---

## 🔧 常见 CLI 工具

### Apifox CLI

**安装：**
```bash
npm install -g apifox-cli
```

**使用：**
```bash
# 运行测试
apifox run https://api.apifox.com/api/v1/projects/xxx/ci-config/xxx/detail?token=xxx

# 查看帮助
apifox --help
```

### Postman CLI (Newman)

**安装：**
```bash
npm install -g newman
```

**使用：**
```bash
# 运行 Collection
newman run collection.json

# 生成报告
newman run collection.json -r html
```

---

## 💡 部署到服务器的最佳实践

### 方法1：直接安装（简单）

```bash
# 连接服务器
ssh root@192.168.1.100

# 安装 Node.js
apt install nodejs npm

# 安装 CLI
npm install -g apifox-cli
```

### 方法2：使用 NVM（推荐）

**优点：**
- 可以管理多个 Node.js 版本
- 更灵活

**步骤：**
```bash
# 安装 NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 重新加载配置
source ~/.bashrc

# 安装 Node.js
nvm install 18
nvm use 18

# 安装 CLI
npm install -g apifox-cli
```

### 方法3：使用 Docker（推荐，隔离性好）

**创建 Dockerfile：**
```dockerfile
FROM node:18

RUN npm install -g apifox-cli

WORKDIR /workspace

CMD ["apifox", "--version"]
```

**使用：**
```bash
# 构建镜像
docker build -t apifox-cli .

# 运行
docker run -it -v $(pwd):/workspace apifox-cli apifox run <URL>
```

---

## 🎯 在 Jenkins 中使用

### 配置 Jenkins Pipeline

```groovy
pipeline {
  agent any
  
  stages {
    stage('运行 Apifox 测试') {
      steps {
        sh '''
          # 检查 apifox-cli 是否安装
          if ! command -v apifox &> /dev/null; then
            echo "安装 apifox-cli..."
            npm install -g apifox-cli
          fi
          
          # 运行测试
          apifox run https://api.apifox.com/api/v1/projects/xxx/ci-config/xxx/detail?token=xxx -r html,cli
        '''
      }
    }
  }
}
```

---

## ✅ 验证部署

### 检查 CLI 是否安装

```bash
# 检查版本
apifox --version

# 查看帮助
apifox --help

# 测试运行
apifox run --help
```

---

## 🔍 故障排查

### 问题1：npm 命令不存在

**解决：**
```bash
# 安装 Node.js 和 npm
apt install nodejs npm
# 或
yum install nodejs npm
```

### 问题2：权限错误

**解决：**
```bash
# 使用 sudo
sudo npm install -g apifox-cli

# 或配置 npm 全局路径
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
```

### 问题3：网络问题

**解决：**
```bash
# 使用国内镜像
npm config set registry https://registry.npmmirror.com

# 然后安装
npm install -g apifox-cli
```

---

## 📚 相关资源

- **Node.js 官网**：https://nodejs.org/
- **npm 官网**：https://www.npmjs.com/
- **Apifox CLI 文档**：https://apifox.com/help/app/cli/

---

**记住：先安装 Node.js，再安装 CLI 工具！** 🚀
