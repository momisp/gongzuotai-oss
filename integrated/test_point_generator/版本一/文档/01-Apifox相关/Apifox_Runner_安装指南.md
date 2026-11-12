# Apifox Runner 安装指南（Windows 本机）

## 📋 前置条件

1. **Docker Desktop**：需要安装 Docker 20.10.0 或以上版本
   - 下载地址：https://www.docker.com/products/docker-desktop/
   - 确保 Docker Desktop 正在运行

2. **Apifox 客户端**：需要已安装并登录
   - 下载地址：https://apifox.com/download
   - 需要团队管理员权限

3. **网络环境**：确保可以访问外网和 Docker Hub

## 🚀 安装步骤

### 方法1：通过 Apifox 客户端部署（推荐）

#### 步骤1：打开 Runner 部署页面

1. 打开 Apifox 客户端
2. 选择你的团队
3. 依次点击：**「团队资源」** → **「通用 Runner」** → **「部署通用 Runner」**

#### 步骤2：配置 Runner 参数

在弹出的部署对话框中：

1. **选择服务器 OS**：选择 **Windows**
2. **选择 Docker 镜像版本**：
   - **通用版**：功能完整，推荐使用
   - **精简版**：体积更小，功能较少
   - **自定义版**：可自定义配置
3. **暴露端口**：默认 **4524**（可根据需要修改）
4. **挂载数据目录**：可选，用于持久化数据

#### 步骤3：复制部署命令

点击 **「复制命令」** 按钮，会生成类似以下的 Docker 命令：

```bash
docker run -d --name apifox-runner \
  -p 4524:4524 \
  -v /path/to/data:/data \
  apifox/apifox-runner:latest
```

#### 步骤4：在 Windows 中运行命令

**方式1：使用 PowerShell（推荐）**

1. 以管理员身份打开 PowerShell
2. 粘贴复制的命令
3. 按 Enter 执行

**方式2：使用 CMD**

1. 以管理员身份打开 CMD
2. 粘贴复制的命令
3. 按 Enter 执行

**方式3：使用 Docker Desktop**

1. 打开 Docker Desktop
2. 点击左侧的 **"Containers"**
3. 点击 **"Run"** 按钮
4. 在 **"Image"** 中输入镜像名称（如：`apifox/apifox-runner:latest`）
5. 配置端口映射：`4524:4524`
6. 点击 **"Run"** 启动容器

#### 步骤5：验证 Runner 是否启动成功

在 PowerShell 或 CMD 中执行：

```powershell
# 查看容器状态
docker ps

# 查看 Runner 日志
docker logs apifox-runner

# 查看 Runner 详细信息
docker inspect apifox-runner
```

如果看到容器状态为 **"Up"**，说明 Runner 已成功启动。

### 方法2：手动部署（高级用户）

#### 步骤1：拉取 Runner 镜像

```powershell
docker pull apifox/apifox-runner:latest
```

#### 步骤2：创建数据目录（可选）

```powershell
mkdir C:\apifox-runner-data
```

#### 步骤3：运行 Runner 容器

```powershell
docker run -d `
  --name apifox-runner `
  --restart unless-stopped `
  -p 4524:4524 `
  -v C:\apifox-runner-data:/data `
  apifox/apifox-runner:latest
```

#### 步骤4：验证安装

```powershell
docker ps | findstr apifox-runner
```

## 🔧 配置 Runner

### 1. 在 Apifox 客户端中配置

1. 打开 Apifox 客户端
2. 进入 **「自动化测试」** → **「Runner 设置」**
3. 点击 **「添加 Runner」**
4. 输入 Runner 信息：
   - **名称**：自定义名称（如：`apifox_general_runner`）
   - **地址**：`http://localhost:4524`（本机）或服务器 IP
   - **Token**：从 Runner 日志中获取（如果需要）

### 2. 检查 Runner 连接状态

在 Apifox 客户端中：
- 查看 Runner 列表，确认状态为 **"运行中"**
- 如果显示 **"连接中"**，检查：
  - Docker 容器是否运行
  - 端口是否正确
  - 防火墙是否阻止连接

## 📝 常用命令

### 启动 Runner

```powershell
docker start apifox-runner
```

### 停止 Runner

```powershell
docker stop apifox-runner
```

### 重启 Runner

```powershell
docker restart apifox-runner
```

### 查看 Runner 日志

```powershell
# 查看所有日志
docker logs apifox-runner

# 实时查看日志
docker logs -f apifox-runner

# 查看最后 50 行日志
docker logs --tail 50 apifox-runner
```

### 删除 Runner

```powershell
# 停止并删除容器
docker stop apifox-runner
docker rm apifox-runner

# 删除镜像（可选）
docker rmi apifox/apifox-runner:latest
```

## 🔍 故障排查

### 问题1：Docker 容器无法启动

**检查步骤：**
1. 确认 Docker Desktop 正在运行
2. 检查端口 4524 是否被占用：
   ```powershell
   netstat -ano | findstr 4524
   ```
3. 查看容器日志：
   ```powershell
   docker logs apifox-runner
   ```

**解决方案：**
- 如果端口被占用，修改端口映射（如：`-p 4525:4524`）
- 检查 Docker Desktop 资源分配是否足够

### 问题2：Apifox 客户端无法连接 Runner

**检查步骤：**
1. 确认容器正在运行：`docker ps`
2. 测试端口是否可访问：
   ```powershell
   Test-NetConnection -ComputerName localhost -Port 4524
   ```
3. 检查防火墙设置

**解决方案：**
- 在 Windows 防火墙中添加端口 4524 的入站规则
- 确认 Runner 地址配置正确（本机使用 `localhost` 或 `127.0.0.1`）

### 问题3：定时任务无法执行

**检查步骤：**
1. 确认 Runner 状态为 **"运行中"**
2. 查看 Runner 日志是否有错误
3. 检查定时任务的 Runner 配置是否正确

**解决方案：**
- 重启 Runner 容器
- 检查测试场景配置是否正确
- 确认环境变量和全局变量配置正确

## 📚 官方资源

- **Apifox 官网**：https://apifox.com
- **Apifox 帮助文档**：https://apifox.com/help
- **Runner 使用指南**：https://apifox.com/help/app/automation/runner
- **定时任务指南**：https://apifox.com/blog/scheduled-tasks/
- **Docker Hub 镜像**：https://hub.docker.com/r/apifox/apifox-runner

## 💡 最佳实践

1. **使用 Docker Compose**（可选）：
   创建 `docker-compose.yml` 文件：
   ```yaml
   version: '3.8'
   services:
     apifox-runner:
       image: apifox/apifox-runner:latest
       container_name: apifox-runner
       restart: unless-stopped
       ports:
         - "4524:4524"
       volumes:
         - C:\apifox-runner-data:/data
   ```
   然后运行：
   ```powershell
   docker-compose up -d
   ```

2. **设置自动启动**：
   使用 `--restart unless-stopped` 参数，确保容器在系统重启后自动启动

3. **定期更新**：
   ```powershell
   docker pull apifox/apifox-runner:latest
   docker stop apifox-runner
   docker rm apifox-runner
   # 然后重新运行部署命令
   ```

4. **备份数据**：
   如果挂载了数据目录，定期备份 `C:\apifox-runner-data` 目录

## ⚠️ 注意事项

1. **端口冲突**：确保端口 4524 未被其他程序占用
2. **资源限制**：Runner 需要一定的 CPU 和内存资源
3. **网络访问**：确保 Runner 可以访问测试目标 API
4. **数据持久化**：建议挂载数据目录，避免数据丢失
5. **安全考虑**：生产环境建议使用 HTTPS 和认证机制

## 🎯 快速检查清单

安装完成后，使用以下清单确认一切正常：

- [ ] Docker Desktop 正在运行
- [ ] Runner 容器状态为 "Up"
- [ ] 端口 4524 可以访问
- [ ] Apifox 客户端可以连接到 Runner
- [ ] Runner 状态显示为 "运行中"
- [ ] 可以成功执行测试场景
- [ ] 定时任务可以正常运行

---

**需要帮助？** 如果遇到问题，可以：
1. 查看 Runner 日志：`docker logs apifox-runner`
2. 查看 Apifox 官方文档
3. 联系 Apifox 技术支持
