# 远程部署 Jenkins 指南

## 🎯 目标

在远程测试环境服务器上部署 Jenkins，用于接口自动化测试。

---

## 📋 前置条件

### 服务器要求

- **操作系统**：Linux（推荐）或 Windows
- **Java**：JDK 11 或以上
- **内存**：至少 2GB
- **磁盘**：至少 10GB 可用空间
- **网络**：可以访问外网（下载插件）

---

## 🚀 部署步骤（Linux）

### 步骤1：连接服务器

**使用 SSH 连接：**

```bash
# 使用 MobaXterm 或命令行
ssh root@192.168.1.100
```

### 步骤2：检查 Java 环境

```bash
# 检查 Java 是否安装
java -version

# 如果没有安装，安装 Java
# CentOS/RHEL
yum install java-11-openjdk java-11-openjdk-devel

# Ubuntu/Debian
apt update
apt install openjdk-11-jdk
```

### 步骤3：下载 Jenkins

**方法1：使用 wget**

```bash
# 下载 Jenkins WAR 包
wget https://get.jenkins.io/war-stable/latest/jenkins.war

# 或下载特定版本
wget https://get.jenkins.io/war-stable/2.426.2/jenkins.war
```

**方法2：使用 Docker（推荐）**

```bash
# 拉取 Jenkins 镜像
docker pull jenkins/jenkins:lts

# 运行 Jenkins 容器
docker run -d \
  --name jenkins \
  -p 8080:8080 \
  -p 50000:50000 \
  -v jenkins_home:/var/jenkins_home \
  jenkins/jenkins:lts
```

### 步骤4：启动 Jenkins

**方法1：直接运行 WAR 包**

```bash
# 运行 Jenkins
java -jar jenkins.war --httpPort=8080

# 后台运行
nohup java -jar jenkins.war --httpPort=8080 > jenkins.log 2>&1 &
```

**方法2：使用 systemd 服务（推荐）**

**创建服务文件：**

```bash
# 创建服务文件
sudo vi /etc/systemd/system/jenkins.service
```

**服务文件内容：**

```ini
[Unit]
Description=Jenkins Automation Server
After=network.target

[Service]
Type=simple
User=jenkins
ExecStart=/usr/bin/java -jar /opt/jenkins/jenkins.war --httpPort=8080
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**启动服务：**

```bash
# 重新加载服务
sudo systemctl daemon-reload

# 启动 Jenkins
sudo systemctl start jenkins

# 设置开机自启
sudo systemctl enable jenkins

# 查看状态
sudo systemctl status jenkins
```

### 步骤5：访问 Jenkins

1. **打开浏览器**
   - 访问：`http://服务器IP:8080`
   - 如：`http://192.168.1.100:8080`

2. **获取初始密码**
   ```bash
   # 查看初始密码
   cat /var/jenkins_home/secrets/initialAdminPassword
   # 或 Docker 方式
   docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
   ```

3. **完成初始化**
   - 输入初始密码
   - 安装推荐插件
   - 创建管理员账号
   - 完成配置

---

## 🚀 部署步骤（Windows）

### 步骤1：连接服务器

**使用远程桌面：**
```
Windows 键 + R
输入：mstsc
输入服务器 IP
连接
```

### 步骤2：下载 Jenkins

1. **打开浏览器**
   - 访问：https://www.jenkins.io/download/
   - 下载 Windows 安装包

2. **或使用命令行**
   ```powershell
   # 下载 Jenkins
   Invoke-WebRequest -Uri "https://get.jenkins.io/war-stable/latest/jenkins.war" -OutFile "jenkins.war"
   ```

### 步骤3：安装 Java

**如果没有 Java：**
1. 下载 JDK：https://www.oracle.com/java/technologies/downloads/
2. 安装 JDK
3. 配置环境变量

**验证：**
```cmd
java -version
```

### 步骤4：启动 Jenkins

**方法1：直接运行**

```cmd
java -jar jenkins.war --httpPort=8080
```

**方法2：安装为 Windows 服务**

1. 下载 Jenkins Windows 安装包
2. 运行安装程序
3. 按提示完成安装
4. Jenkins 会自动启动

### 步骤5：访问 Jenkins

1. 打开浏览器
2. 访问：`http://localhost:8080`
3. 完成初始化配置

---

## 🔧 Docker 部署（推荐）

### 步骤1：安装 Docker

**Linux：**
```bash
# CentOS/RHEL
yum install docker
systemctl start docker
systemctl enable docker

# Ubuntu/Debian
apt install docker.io
systemctl start docker
systemctl enable docker
```

**Windows：**
- 下载 Docker Desktop：https://www.docker.com/products/docker-desktop/
- 安装并启动

### 步骤2：运行 Jenkins

```bash
# 创建数据目录
mkdir -p /opt/jenkins_home

# 运行 Jenkins 容器
docker run -d \
  --name jenkins \
  --restart unless-stopped \
  -p 8080:8080 \
  -p 50000:50000 \
  -v /opt/jenkins_home:/var/jenkins_home \
  jenkins/jenkins:lts
```

### 步骤3：查看日志

```bash
# 查看容器日志
docker logs jenkins

# 查看初始密码
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

---

## 📝 配置 Jenkins

### 步骤1：安装插件

**必需插件：**
- Pipeline
- Git
- HTML Publisher（用于测试报告）

**安装步骤：**
1. Jenkins → 系统管理 → 插件管理
2. 搜索插件名称
3. 安装并重启

### 步骤2：配置工具

**配置 Node.js：**
1. 系统管理 → 全局工具配置
2. NodeJS → 新增 NodeJS
3. 填写名称和版本
4. 保存

**配置 Git：**
1. 系统管理 → 全局工具配置
2. Git → 配置 Git 路径
3. 保存

### 步骤3：创建任务

1. 新建任务
2. 选择「流水线」（Pipeline）
3. 配置 Pipeline 脚本
4. 保存并运行

---

## ✅ 验证部署

### 检查 Jenkins 状态

```bash
# Linux
systemctl status jenkins

# Docker
docker ps | grep jenkins
docker logs jenkins
```

### 访问 Jenkins

1. 打开浏览器
2. 访问：`http://服务器IP:8080`
3. 确认可以正常访问

---

## 🔍 故障排查

### 问题1：无法访问 Jenkins

**检查：**
```bash
# 检查端口是否监听
netstat -tlnp | grep 8080

# 检查防火墙
firewall-cmd --list-ports
# 或
iptables -L -n
```

**解决：**
```bash
# 开放端口
firewall-cmd --add-port=8080/tcp --permanent
firewall-cmd --reload
```

### 问题2：Jenkins 启动失败

**检查日志：**
```bash
# Linux
journalctl -u jenkins -n 50

# Docker
docker logs jenkins
```

### 问题3：内存不足

**解决：**
```bash
# 增加 Java 内存
java -Xmx2048m -jar jenkins.war --httpPort=8080
```

---

## 📚 相关资源

- **Jenkins 官网**：https://www.jenkins.io/
- **Jenkins 安装文档**：https://www.jenkins.io/doc/book/installing/
- **Docker Hub Jenkins**：https://hub.docker.com/r/jenkins/jenkins

---

**记住：Docker 部署最简单，推荐使用！** 🚀
