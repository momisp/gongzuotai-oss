# MobaXterm 使用指南（2024最新）

## 🎯 为什么选择 MobaXterm？

**MobaXterm** 是 Windows 上最好的 SSH 工具，功能全面，界面友好。

**优点：**
- ✅ 功能全面（SSH + SFTP + X11）
- ✅ 界面友好，操作简单
- ✅ 免费版功能足够
- ✅ 自动保存会话
- ✅ 多标签页
- ✅ 内置文件传输

---

## 🚀 快速开始（5分钟）

### 步骤1：下载安装

1. **访问官网**
   - https://mobaxterm.mobatek.net/
   - 下载「Free Edition」（免费版）

2. **安装**
   - 运行安装程序
   - 按提示完成安装

3. **打开 MobaXterm**
   - 启动程序

### 步骤2：创建 SSH 会话

1. **点击「Session」**
   - 左上角「Session」按钮

2. **选择「SSH」**
   - 点击「SSH」图标

3. **填写连接信息**
   ```
   Remote host: 192.168.1.100
   Username: root
   Port: 22
   ```

4. **保存会话（可选）**
   - 勾选「Bookmark settings」
   - 输入会话名称：如「测试服务器」
   - 点击「OK」

5. **连接**
   - 双击会话或点击「OK」
   - 输入密码
   - 连接成功

---

## 💡 主要功能

### 1. SSH 连接

**创建会话：**
- Session → SSH
- 填写服务器信息
- 保存并连接

**多标签页：**
- 可以同时连接多个服务器
- 每个连接一个标签页

### 2. 文件传输（SFTP）

**自动功能：**
- 连接后自动打开 SFTP
- 左侧显示本地文件
- 右侧显示服务器文件

**上传文件：**
- 左侧文件拖到右侧
- 或右键 → Upload

**下载文件：**
- 右侧文件拖到左侧
- 或右键 → Download

### 3. 终端功能

**支持：**
- Bash、PowerShell、CMD
- 语法高亮
- 命令历史
- 自动补全

### 4. 会话管理

**保存会话：**
- 自动保存所有会话
- 下次直接双击连接

**组织会话：**
- 可以创建文件夹
- 分类管理会话

---

## 🔧 高级功能

### 1. 端口转发

**SSH 隧道：**
- Settings → Network → SSH
- 配置端口转发
- 访问远程服务

### 2. X11 转发

**图形界面应用：**
- 支持运行图形界面应用
- 自动配置 X11 转发

### 3. 宏录制

**自动化操作：**
- Tools → MobaXterm Macros
- 录制常用操作
- 一键执行

---

## 📝 常用操作

### 创建会话

1. Session → SSH
2. 填写信息
3. 保存会话
4. 连接

### 文件传输

1. 连接后自动打开 SFTP
2. 拖拽文件传输
3. 或使用右键菜单

### 保存会话

1. 创建会话时勾选「Bookmark settings」
2. 输入名称
3. 下次直接双击连接

---

## 🎯 你的场景：部署 Jenkins 和 CLI

### 步骤1：连接服务器

1. 打开 MobaXterm
2. 创建 SSH 会话
3. 连接服务器

### 步骤2：上传文件

1. 左侧文件浏览器找到文件
2. 拖到右侧服务器目录
3. 等待上传完成

### 步骤3：执行命令

1. 在终端中执行命令
2. 安装 Jenkins 或 CLI
3. 配置和运行

---

## ✅ 推荐配置

### 会话设置

```
Session → SSH
- Remote host: 服务器 IP
- Username: root
- Port: 22
- Bookmark settings: 勾选
- Session name: 测试服务器
```

### 终端设置

```
Settings → Terminal
- Terminal type: xterm-256color
- Font size: 12
- Scrollback: 10000
```

---

## 📚 相关资源

- **MobaXterm 官网**：https://mobaxterm.mobatek.net/
- **MobaXterm 文档**：https://mobaxterm.mobatek.net/documentation.html

---

**记住：MobaXterm = Windows 上最好的 SSH 工具！** 🚀
