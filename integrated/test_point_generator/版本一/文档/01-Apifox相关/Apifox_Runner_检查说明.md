# Apifox Runner 配置检查指南

## 📋 检查脚本说明

已创建两个检查脚本，用于检查服务器上 Apifox Runner 的配置和运行状态：

1. **check_apifox_runner.py** - Python 版本（跨平台）
2. **check_apifox_runner.sh** - Shell 版本（Linux/Mac）

## 🚀 使用方法

### 方法1：使用 Python 脚本（推荐）

#### Windows 系统
```powershell
python check_apifox_runner.py
```

#### Linux/Mac 系统
```bash
python3 check_apifox_runner.py
```

### 方法2：使用 Shell 脚本（仅 Linux/Mac）

```bash
# 添加执行权限
chmod +x check_apifox_runner.sh

# 运行脚本
./check_apifox_runner.sh
```

## 📊 检查内容

脚本会自动检查以下内容：

### 1. Runner 进程状态
- ✅ 检查 Apifox Runner 进程是否正在运行
- 显示进程详细信息

### 2. 配置文件
- ✅ 检查 Runner 配置文件是否存在
- 显示配置文件内容（包括服务器地址、端口等）

### 3. 日志文件
- ✅ 检查日志目录是否存在
- 显示最新的日志内容（最后20行）

### 4. 网络连接
- ✅ 检查与 Apifox 服务器的网络连接
- 测试以下域名：
  - apifox.com
  - api.apifox.com
  - runner.apifox.com

### 5. 端口占用
- ✅ 检查常用端口是否被占用
- 检查端口：8080, 3000, 5000, 8000

### 6. 服务状态（Linux）
- ✅ 检查 systemd 服务状态（如果 Runner 作为服务运行）

## 🔍 常见问题排查

### 问题1：Runner 进程未运行

**解决方案：**
1. 检查 Runner 是否已安装
2. 手动启动 Runner：
   ```bash
   # Linux/Mac
   apifox-runner start
   
   # 或查看安装目录
   cd /path/to/apifox-runner
   ./apifox-runner
   ```

### 问题2：配置文件未找到

**解决方案：**
1. 确认 Runner 安装路径
2. 检查默认配置目录：
   - Linux/Mac: `~/.apifox/runner/` 或 `~/.config/apifox/runner/`
   - Windows: `%APPDATA%\Apifox\runner\` 或 `%LOCALAPPDATA%\Apifox\runner\`

### 问题3：网络连接失败

**解决方案：**
1. 检查服务器网络是否正常
2. 检查防火墙设置
3. 检查代理配置
4. 确认 Apifox 服务器是否可访问

### 问题4：端口被占用

**解决方案：**
1. 检查是否有其他程序占用端口
2. 修改 Runner 配置使用其他端口
3. 停止占用端口的程序

## 📝 手动检查步骤

如果脚本无法运行，可以手动执行以下命令：

### Linux/Mac

```bash
# 1. 检查进程
ps aux | grep apifox

# 2. 检查配置文件
cat ~/.apifox/runner/config.json

# 3. 检查日志
tail -50 ~/.apifox/runner/logs/*.log

# 4. 检查网络
ping apifox.com

# 5. 检查端口
netstat -an | grep LISTEN
```

### Windows

```powershell
# 1. 检查进程
tasklist | findstr apifox

# 2. 检查配置文件
type %APPDATA%\Apifox\runner\config.json

# 3. 检查日志
type %APPDATA%\Apifox\runner\logs\*.log

# 4. 检查网络
ping apifox.com

# 5. 检查端口
netstat -ano | findstr LISTEN
```

## 🔧 Runner 配置说明

Runner 配置文件通常包含以下信息：

```json
{
  "server": {
    "host": "api.apifox.com",
    "port": 443,
    "protocol": "https"
  },
  "runner": {
    "name": "apifox_general_runner",
    "token": "your-runner-token"
  },
  "log": {
    "level": "info",
    "path": "./logs"
  }
}
```

## ⚠️ 注意事项

1. **权限问题**：某些检查可能需要管理员权限
2. **网络环境**：确保服务器可以访问外网
3. **防火墙**：检查防火墙是否阻止了连接
4. **日志文件**：日志文件可能很大，查看时注意

## 📞 获取帮助

如果检查后仍有问题，请提供以下信息：

1. 检查脚本的完整输出
2. Runner 日志文件内容
3. 配置文件内容（隐藏敏感信息）
4. 服务器操作系统版本
5. 网络环境说明

## 🔗 相关链接

- [Apifox Runner 官方文档](https://apifox.com/help/app/automation/runner)
- [Apifox 帮助中心](https://apifox.com/help)
