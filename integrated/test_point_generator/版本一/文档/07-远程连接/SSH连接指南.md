# SSH 连接指南（测试工程师版）

## 🎯 什么是 SSH？

**SSH**（Secure Shell）是一种网络协议，用于安全地远程连接 Linux/Unix 服务器。

**简单理解：**
- 通过命令行远程操作服务器
- 安全加密传输
- 最常用的 Linux 服务器连接方式

---

## 🚀 快速开始（3步）

### 步骤1：获取连接信息

**需要的信息：**
- **服务器 IP 地址**：如 `192.168.1.100`
- **端口**：通常是 `22`（SSH 默认端口）
- **用户名**：如 `root`、`admin`
- **密码**：服务器登录密码
- **SSH 密钥**（如果使用密钥认证）

### 步骤2：选择工具

**Windows 推荐：MobaXterm**

1. **下载安装**
   - 访问：https://mobaxterm.mobatek.net/
   - 下载免费版（Free Edition）
   - 安装

2. **创建会话**
   - 打开 MobaXterm
   - 点击「Session」→「SSH」
   - 填写连接信息

3. **连接**
   - 点击「OK」
   - 输入密码
   - 连接成功

### 步骤3：连接服务器

**使用 MobaXterm：**
```
1. 打开 MobaXterm
2. 点击 "Session" → "SSH"
3. 填写：
   - Remote host: 192.168.1.100
   - Username: root
   - Port: 22
4. 点击 "OK"
5. 输入密码
6. 连接成功
```

---

## 🔧 常用工具

### 工具1：MobaXterm（Windows，最推荐）

**优点：**
- ✅ 界面友好
- ✅ 功能全面（SSH + SFTP）
- ✅ 免费
- ✅ 自动保存会话
- ✅ 多标签页

**下载：**
- 官网：https://mobaxterm.mobatek.net/
- 选择「Free Edition」

**使用方法：**
1. 打开 MobaXterm
2. 点击「Session」→「SSH」
3. 填写服务器信息
4. 连接

### 工具2：PuTTY（Windows，经典工具）

**优点：**
- ✅ 轻量
- ✅ 经典工具
- ✅ 免费

**缺点：**
- ❌ 界面老旧
- ❌ 功能较少

**下载：**
- 官网：https://www.putty.org/

### 工具3：Windows Terminal + OpenSSH（Windows 10/11）

**优点：**
- ✅ 系统自带
- ✅ 无需安装
- ✅ 现代化界面

**使用方法：**
```powershell
ssh username@192.168.1.100
```

### 工具4：VS Code Remote（开发推荐）

**优点：**
- ✅ 集成代码编辑
- ✅ 远程开发
- ✅ 功能强大

**适用场景：**
- 需要编辑配置文件
- 远程开发

---

## 📝 连接命令

### 基本连接命令

```bash
# 基本格式
ssh username@hostname

# 示例
ssh root@192.168.1.100

# 指定端口
ssh -p 2222 root@192.168.1.100

# 使用密钥
ssh -i /path/to/key.pem root@192.168.1.100
```

### Windows PowerShell/CMD

```powershell
# Windows 10/11 自带 OpenSSH
ssh root@192.168.1.100

# 指定端口
ssh -p 2222 root@192.168.1.100
```

---

## 🔐 认证方式

### 方式1：密码认证（最简单）

**步骤：**
1. 连接服务器
2. 输入密码
3. 连接成功

**命令：**
```bash
ssh root@192.168.1.100
# 提示输入密码
```

### 方式2：密钥认证（更安全）

**步骤：**
1. 生成密钥对
2. 将公钥上传到服务器
3. 使用私钥连接

**生成密钥：**
```bash
# Windows PowerShell
ssh-keygen -t rsa -b 4096
```

**使用密钥连接：**
```bash
ssh -i C:\Users\yzyz\.ssh\id_rsa root@192.168.1.100
```

---

## 💡 MobaXterm 使用详解

### 创建 SSH 会话

1. **打开 MobaXterm**
   - 启动 MobaXterm

2. **创建会话**
   - 点击左上角「Session」
   - 选择「SSH」

3. **填写信息**
   ```
   Remote host: 192.168.1.100
   Username: root
   Port: 22
   ```

4. **高级设置（可选）**
   - 「Advanced SSH settings」
   - 可以设置密钥路径
   - 可以设置跳板机

5. **保存会话**
   - 勾选「Bookmark settings」
   - 输入会话名称
   - 点击「OK」

6. **连接**
   - 双击会话
   - 输入密码
   - 连接成功

### 文件传输

**MobaXterm 内置 SFTP：**

1. **连接后自动打开 SFTP**
   - 左侧文件浏览器
   - 可以直接拖拽文件

2. **上传文件**
   - 本地文件拖到服务器目录

3. **下载文件**
   - 服务器文件拖到本地目录

---

## 🔍 常用 SSH 命令

### 基本操作

```bash
# 连接服务器
ssh root@192.168.1.100

# 断开连接
exit
# 或
logout

# 查看当前目录
pwd

# 列出文件
ls
ls -l    # 详细列表
ls -la   # 包括隐藏文件

# 切换目录
cd /path/to/directory
cd ~     # 回到用户目录
cd ..    # 上一级目录

# 查看文件内容
cat filename
less filename
head filename
tail filename

# 编辑文件
vi filename
nano filename    # 更简单
```

### 文件操作

```bash
# 复制文件
cp source dest

# 移动/重命名文件
mv source dest

# 删除文件
rm filename
rm -r directory    # 删除目录

# 创建目录
mkdir directory

# 查看文件权限
ls -l

# 修改文件权限
chmod 755 filename
```

### 系统信息

```bash
# 查看系统信息
uname -a

# 查看磁盘使用
df -h

# 查看内存使用
free -h

# 查看进程
ps aux
top

# 查看网络
ifconfig
ip addr
```

---

## 🎯 你的场景：部署 Jenkins 和 CLI

### 步骤1：连接服务器

```bash
# 使用 MobaXterm 或命令行
ssh root@192.168.1.100
```

### 步骤2：检查环境

```bash
# 检查 Java（Jenkins 需要）
java -version

# 检查 Node.js（CLI 需要）
node --version
npm --version

# 检查 Docker（如果使用 Docker）
docker --version
```

### 步骤3：上传文件

**使用 MobaXterm：**
- 左侧文件浏览器直接拖拽

**使用命令行：**
```bash
# 使用 scp（需要另外打开终端）
scp file.zip root@192.168.1.100:/tmp/
```

### 步骤4：执行部署

```bash
# 解压文件
unzip file.zip

# 运行安装脚本
chmod +x install.sh
./install.sh
```

---

## ⚠️ 常见问题

### 问题1：连接超时

**原因：**
- 网络不通
- 防火墙阻止
- 端口不对

**解决：**
```bash
# 测试网络
ping 192.168.1.100

# 测试端口
telnet 192.168.1.100 22
# 或
nc -zv 192.168.1.100 22
```

### 问题2：密码错误

**解决：**
- 确认用户名和密码
- 检查大小写
- 确认用户是否有 SSH 权限

### 问题3：权限被拒绝

**解决：**
```bash
# 检查 SSH 服务是否运行
systemctl status sshd

# 检查防火墙
firewall-cmd --list-all
```

---

## 📚 相关资源

- **MobaXterm 官网**：https://mobaxterm.mobatek.net/
- **OpenSSH 文档**：https://www.openssh.com/
- **SSH 命令参考**：https://www.ssh.com/ssh/command/

---

## ✅ 快速检查清单

- [ ] 已获取服务器 IP 和端口
- [ ] 已获取用户名和密码
- [ ] 已安装 SSH 工具（MobaXterm）
- [ ] 已创建 SSH 会话
- [ ] 已成功连接服务器
- [ ] 已测试基本命令（ls、pwd）

---

**记住：Linux 服务器用 SSH，Windows 用 MobaXterm 最方便！** 🚀
