# Apifox Runner 安装和使用指南

## 📦 文件说明

本目录包含以下文件，用于帮助你在 Windows 本机上安装和配置 Apifox Runner：

### 安装相关
- **快速安装Apifox_Runner.bat** - 一键安装脚本（推荐使用）
- **Apifox_Runner_安装指南.md** - 详细安装文档

### 检查相关
- **检查Apifox.bat** - 快速检查脚本
- **check_apifox_runner_windows.ps1** - PowerShell 检查脚本
- **检查Apifox连接问题.md** - 故障排查指南

### 其他
- **check_apifox_runner.py** - Python 检查脚本（跨平台）
- **check_apifox_runner.sh** - Shell 检查脚本（Linux/Mac）

## 🚀 快速开始

### 方法1：一键安装（最简单）

1. **确保 Docker Desktop 已安装并运行**
   - 下载地址：https://www.docker.com/products/docker-desktop/

2. **双击运行 `快速安装Apifox_Runner.bat`**

3. **按照提示完成安装**

4. **在 Apifox 客户端中配置 Runner**
   - 打开 Apifox
   - 进入「自动化测试」→「Runner 设置」
   - 添加 Runner，地址：`http://localhost:4524`

### 方法2：手动安装

参考 `Apifox_Runner_安装指南.md` 中的详细步骤。

## 🔍 检查 Runner 状态

### 快速检查

双击运行 `检查Apifox.bat`，查看 Runner 运行状态。

### 手动检查

```powershell
# 检查容器状态
docker ps | findstr apifox-runner

# 查看日志
docker logs apifox-runner

# 测试端口
Test-NetConnection -ComputerName localhost -Port 4524
```

## 📚 官方资源

- **Apifox 官网**：https://apifox.com
- **Apifox 下载**：https://apifox.com/download
- **帮助文档**：https://apifox.com/help
- **Runner 指南**：https://apifox.com/help/app/automation/runner
- **定时任务指南**：https://apifox.com/blog/scheduled-tasks/
- **Docker Hub**：https://hub.docker.com/r/apifox/apifox-runner

## ⚠️ 常见问题

### 1. Docker Desktop 未运行

**解决方案：**
- 启动 Docker Desktop
- 等待 Docker 完全启动（图标不再闪烁）

### 2. 端口 4524 被占用

**解决方案：**
- 修改端口映射（如：`-p 4525:4524`）
- 或在 Apifox 中配置对应端口

### 3. Apifox 客户端无法连接 Runner

**检查步骤：**
1. 确认容器正在运行：`docker ps`
2. 检查防火墙设置
3. 确认 Runner 地址正确（本机使用 `localhost`）

### 4. 定时任务无法执行

**检查步骤：**
1. 确认 Runner 状态为「运行中」
2. 查看 Runner 日志：`docker logs apifox-runner`
3. 检查定时任务配置

## 💡 使用技巧

### 查看实时日志

```powershell
docker logs -f apifox-runner
```

### 重启 Runner

```powershell
docker restart apifox-runner
```

### 更新 Runner

```powershell
docker pull apifox/apifox-runner:latest
docker stop apifox-runner
docker rm apifox-runner
# 然后重新运行安装脚本
```

### 备份数据

Runner 数据存储在 `C:\apifox-runner-data`，定期备份此目录。

## 📞 获取帮助

如果遇到问题：

1. **查看日志**：`docker logs apifox-runner`
2. **运行检查脚本**：`检查Apifox.bat`
3. **查看故障排查指南**：`检查Apifox连接问题.md`
4. **访问官方文档**：https://apifox.com/help

---

**祝使用愉快！** 🎉
