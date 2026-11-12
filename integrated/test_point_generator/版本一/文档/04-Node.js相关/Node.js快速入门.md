# Node.js 快速入门（5分钟理解）

## 🎯 核心概念（30秒）

```
JavaScript（语言） + Node.js（工具） = 可以在电脑上运行 JavaScript
```

**类比：**
- JavaScript = 中文（语言）
- 浏览器 = 只能在中国说中文
- Node.js = 可以在全世界说中文的工具

---

## 📦 三个核心概念

### 1. Node.js

**是什么？**
- 让 JavaScript 可以在电脑上运行的工具

**做什么？**
- 运行测试工具（如 Apifox CLI）
- 执行测试脚本
- 搭建服务器（测试工程师不需要）

### 2. npm

**是什么？**
- Node.js 的包管理器
- 用来安装和管理工具

**做什么？**
- 安装工具：`npm install -g apifox-cli`
- 查看工具：`npm list -g`
- 卸载工具：`npm uninstall -g apifox-cli`

### 3. JavaScript

**是什么？**
- 编程语言
- 原来只能做网页，现在可以做更多

**测试工程师需要学吗？**
- **如果只是使用工具**：不需要
- **如果要写测试脚本**：需要学基础

---

## 🚀 5个必学命令

### 1. 检查版本

```bash
node --version    # 查看 Node.js 版本
npm --version     # 查看 npm 版本
```

**什么时候用：** 检查是否安装成功

### 2. 安装工具（全局）

```bash
npm install -g apifox-cli
```

**参数说明：**
- `-g`：全局安装（所有项目都可以用）
- 不加 `-g`：只安装到当前项目

**什么时候用：** 安装测试工具

### 3. 查看已安装的工具

```bash
npm list -g
```

**什么时候用：** 查看安装了哪些工具

### 4. 卸载工具

```bash
npm uninstall -g apifox-cli
```

**什么时候用：** 删除不需要的工具

### 5. 运行脚本

```bash
node script.js
```

**什么时候用：** 运行 JavaScript 测试脚本

---

## 💡 实际应用

### 应用1：安装 Apifox CLI

```bash
# 1. 检查 Node.js 是否安装
node --version

# 2. 安装 Apifox CLI
npm install -g apifox-cli

# 3. 验证安装
apifox --version
```

### 应用2：在 Jenkins 中使用

```groovy
pipeline {
  agent any
  
  stages {
    stage('安装工具') {
      steps {
        bat 'npm install -g apifox-cli'  // 需要 Node.js
      }
    }
    
    stage('运行测试') {
      steps {
        bat 'apifox run <测试URL>'  // 需要 Node.js
      }
    }
  }
}
```

### 应用3：运行测试脚本

**创建 test.js：**
```javascript
console.log('开始测试...');
console.log('测试完成！');
```

**运行：**
```bash
node test.js
```

---

## 🔍 常见问题速查

### Q: Node.js 和 JavaScript 有什么区别？

**A:** 
- JavaScript = 语言
- Node.js = 运行工具

### Q: 我需要学习 JavaScript 吗？

**A:** 
- 如果只是用工具：不需要
- 如果要写脚本：需要学基础

### Q: npm 是什么？

**A:** 
- Node.js 的包管理器
- 用来安装工具
- 类似 Python 的 pip

### Q: 为什么 Jenkins 需要 Node.js？

**A:** 
- Apifox CLI 需要 Node.js
- npm 命令需要 Node.js

---

## ✅ 快速检查

```bash
# 1. 检查 Node.js
node --version
# 应该显示版本号，如：v18.17.0

# 2. 检查 npm
npm --version
# 应该显示版本号，如：9.6.7

# 3. 检查已安装的工具
npm list -g
# 应该显示已安装的工具列表
```

---

## 📚 学习路径

### 第1天：理解概念

- ✅ 理解 Node.js 是什么
- ✅ 理解 npm 是什么
- ✅ 知道为什么需要它们

### 第2天：基本使用

- ✅ 安装 Node.js
- ✅ 使用 npm 安装工具
- ✅ 在 Jenkins 中使用

### 第3天：实际应用

- ✅ 安装 Apifox CLI
- ✅ 在 Jenkins Pipeline 中使用
- ✅ 运行测试

---

## 🎯 总结

**Node.js = 让 JavaScript 可以在电脑上运行的工具**

**作为测试工程师，你需要：**
- ✅ 知道 Node.js 是什么
- ✅ 会安装和使用工具
- ✅ 在 Jenkins 中使用

**不需要：**
- ❌ 深入学习 JavaScript
- ❌ 学习 Node.js 底层原理
- ❌ 学习服务器开发

---

**记住：Node.js 是工具，你的目标是运行测试工具！** 🚀
