# Apifox 连接问题检查指南（Windows 本机）

## 🚀 快速检查

### 方法1：使用 PowerShell 脚本（推荐）

1. **以管理员身份运行 PowerShell**
   - 右键点击 PowerShell，选择"以管理员身份运行"

2. **执行检查脚本**
   ```powershell
   cd "C:\Users\yzyz\Desktop\测试点生成"
   .\check_apifox_runner_windows.ps1
   ```

3. **如果遇到执行策略限制，先执行：**
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

### 方法2：手动检查步骤

#### 1. 检查 Apifox 进程

打开 PowerShell 或 CMD，执行：
```powershell
tasklist | findstr apifox
```

或者查看任务管理器：
- 按 `Ctrl + Shift + Esc` 打开任务管理器
- 查找 "Apifox" 相关进程

#### 2. 检查网络连接

```powershell
# 测试 Apifox 服务器连接
ping apifox.com
ping api.apifox.com
ping runner.apifox.com
```

#### 3. 检查端口占用

```powershell
# 查看常用端口占用情况
netstat -ano | findstr "8080 3000 5000 8000"
```

#### 4. 检查配置文件位置

常见配置文件位置：
- `%APPDATA%\Apifox\runner\config.json`
- `%LOCALAPPDATA%\Apifox\runner\config.json`

在 PowerShell 中查看：
```powershell
# 检查配置文件
$configPath = "$env:APPDATA\Apifox\runner\config.json"
if (Test-Path $configPath) {
    Get-Content $configPath | ConvertFrom-Json | ConvertTo-Json
} else {
    Write-Host "配置文件不存在"
}
```

#### 5. 检查日志文件

```powershell
# 查看最新日志
$logDir = "$env:APPDATA\Apifox\runner\logs"
if (Test-Path $logDir) {
    $latestLog = Get-ChildItem $logDir -Filter "*.log" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    Get-Content $latestLog.FullName -Tail 50
}
```

## 🔍 常见问题分析

### 问题1：一直显示"连接中"

**可能原因：**
1. **网络问题**
   - 检查网络连接是否正常
   - 检查防火墙是否阻止连接
   - 检查代理设置是否正确

2. **Apifox 客户端问题**
   - 重启 Apifox 客户端
   - 检查客户端版本是否最新
   - 清除客户端缓存

3. **Runner 服务未启动**
   - 检查 Runner 进程是否运行
   - 手动启动 Runner 服务

### 问题2：Runner 进程未运行

**解决方案：**
1. **通过 Apifox 客户端启动**
   - 打开 Apifox
   - 进入"自动化测试" → "Runner 设置"
   - 启动 Runner

2. **手动启动 Runner**
   ```powershell
   # 找到 Runner 安装目录
   cd "$env:LOCALAPPDATA\Programs\Apifox"
   # 或
   cd "$env:ProgramFiles\Apifox"
   
   # 运行 Runner
   .\apifox-runner.exe
   ```

### 问题3：配置文件不存在

**解决方案：**
1. **首次使用需要配置**
   - 打开 Apifox 客户端
   - 进入 Runner 设置
   - 创建新的 Runner 实例

2. **检查安装目录**
   - 确认 Apifox 是否正确安装
   - 重新安装 Apifox

### 问题4：网络连接失败

**解决方案：**
1. **检查防火墙**
   ```powershell
   # 查看防火墙规则
   Get-NetFirewallRule | Where-Object { $_.DisplayName -like "*apifox*" }
   ```

2. **检查代理设置**
   - 打开 Apifox 设置
   - 检查"请求代理"配置
   - 确认代理服务器地址和端口

3. **测试网络连接**
   ```powershell
   # 测试 HTTPS 连接
   Test-NetConnection -ComputerName api.apifox.com -Port 443
   ```

## 📋 检查清单

使用以下清单逐一检查：

- [ ] Apifox 客户端是否正常运行
- [ ] Runner 进程是否在运行
- [ ] 网络连接是否正常（ping apifox.com）
- [ ] 防火墙是否阻止连接
- [ ] 代理设置是否正确
- [ ] 配置文件是否存在且格式正确
- [ ] 日志文件中是否有错误信息
- [ ] Apifox 客户端版本是否最新

## 🛠️ 快速修复步骤

1. **重启 Apifox**
   - 完全退出 Apifox（包括后台进程）
   - 重新启动 Apifox

2. **清除缓存**
   ```powershell
   # 清除 Apifox 缓存（谨慎操作）
   Remove-Item "$env:APPDATA\Apifox\Cache" -Recurse -Force -ErrorAction SilentlyContinue
   ```

3. **重置网络设置**
   - 检查网络适配器
   - 重置 DNS 缓存：`ipconfig /flushdns`
   - 重启网络适配器

4. **检查系统时间**
   - 确保系统时间正确
   - 时间错误可能导致 SSL 证书验证失败

## 📞 获取帮助

如果以上方法都无法解决问题，请提供：

1. **检查脚本的完整输出**
2. **日志文件内容**（最后100行）
3. **配置文件内容**（隐藏敏感信息）
4. **网络测试结果**
5. **Apifox 客户端版本号**

## 🔗 相关资源

- [Apifox 官方文档](https://apifox.com/help)
- [Apifox Runner 使用指南](https://apifox.com/help/app/automation/runner)
- [Apifox 社区](https://community.apifox.com)
