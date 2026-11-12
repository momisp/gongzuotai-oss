# Apifox Runner 日志分析工具

## 🔍 日志错误分析

### 关键错误信息

从你提供的日志中，我发现了以下关键错误：

```
Error: Unexpected server response: 400
_closeCode: 1006
_url: 'wss://api.apifox.com/ws/self-hosted-runner?authorization=TSHGR-...'
```

### 错误原因分析

**主要问题：WebSocket 连接失败，服务器返回 400 错误**

可能的原因：
1. **认证 Token 无效或过期**
   - Authorization token 可能已过期
   - Token 格式不正确

2. **Runner 配置问题**
   - Runner ID 不匹配
   - Team ID 或 Organization ID 不正确

3. **网络连接问题**
   - 无法访问 `api.apifox.com`
   - 防火墙或代理阻止连接

4. **Runner 版本问题**
   - Runner 版本与服务器不兼容
   - 需要更新 Runner

---

## 🛠️ 排查步骤

### 步骤1：检查认证 Token

**问题：** Authorization token 可能无效

**解决方法：**
1. 在 Apifox 客户端中重新获取 Runner Token
2. 删除旧的 Runner 配置
3. 重新添加 Runner，使用新的 Token

### 步骤2：检查网络连接

**测试连接：**
```bash
# 测试能否访问 Apifox API
ping api.apifox.com

# 测试 HTTPS 连接
Test-NetConnection -ComputerName api.apifox.com -Port 443

# 测试 WebSocket 连接（需要 PowerShell 5.1+）
$ws = New-Object System.Net.WebSockets.ClientWebSocket
$uri = New-Object Uri("wss://api.apifox.com")
# 注意：这只是一个测试，实际连接需要认证
```

### 步骤3：检查 Runner 配置

**验证配置：**
1. 在 Apifox 客户端中检查 Runner 配置
2. 确认 Runner ID、Team ID 是否正确
3. 确认 Runner 地址是否正确

### 步骤4：更新 Runner

**更新到最新版本：**
```bash
# 停止当前 Runner
docker stop apifox-runner

# 删除旧容器
docker rm apifox-runner

# 拉取最新镜像
docker pull apifox/apifox-runner:latest

# 重新启动
docker run -d --name apifox-runner --restart unless-stopped -p 4524:4524 -v C:\apifox-runner-data:/data apifox/apifox-runner:latest
```

---

## 📊 日志分析方法

### 关键字段识别

从日志中查找以下关键信息：

1. **错误类型**
   ```
   Error: Unexpected server response: 400
   ```
   - 400 = 请求错误（通常是认证或参数问题）
   - 401 = 未授权（认证失败）
   - 403 = 禁止访问（权限不足）
   - 500 = 服务器错误

2. **关闭代码**
   ```
   _closeCode: 1006
   ```
   - 1006 = 异常关闭（连接未正常关闭）
   - 1000 = 正常关闭
   - 1001 = 端点离开

3. **连接 URL**
   ```
   _url: 'wss://api.apifox.com/ws/self-hosted-runner?authorization=...'
   ```
   - 检查 URL 中的参数是否正确
   - 检查 authorization token 是否存在

---

## 🔧 解决方案

### 方案1：重新配置 Runner（推荐）

1. **删除旧 Runner**
   ```bash
   # 停止并删除容器
   docker stop apifox-runner
   docker rm apifox-runner
   ```

2. **在 Apifox 中删除旧 Runner 配置**
   - 进入「自动化测试」→「Runner 设置」
   - 删除旧的 Runner 配置

3. **重新部署 Runner**
   ```bash
   # 运行快速部署脚本
   Apifox_Runner_快速部署.bat
   
   # 或手动执行
   docker run -d --name apifox-runner --restart unless-stopped -p 4524:4524 -v C:\apifox-runner-data:/data apifox/apifox-runner:latest
   ```

4. **在 Apifox 中重新添加 Runner**
   - 获取新的 Runner Token（从日志中）
   - 添加新的 Runner 配置

### 方案2：检查网络和代理

**如果使用代理：**
```bash
# 检查代理设置
echo $env:HTTP_PROXY
echo $env:HTTPS_PROXY

# 如果需要设置代理
docker run -d --name apifox-runner \
  --restart unless-stopped \
  -p 4524:4524 \
  -v C:\apifox-runner-data:/data \
  -e HTTP_PROXY=http://proxy.example.com:8080 \
  -e HTTPS_PROXY=http://proxy.example.com:8080 \
  apifox/apifox-runner:latest
```

### 方案3：检查防火墙

**Windows 防火墙：**
```powershell
# 检查防火墙规则
Get-NetFirewallRule | Where-Object { $_.DisplayName -like "*apifox*" }

# 如果需要，添加防火墙规则
New-NetFirewallRule -DisplayName "Apifox Runner" -Direction Inbound -LocalPort 4524 -Protocol TCP -Action Allow
```

---

## 📝 日志查看命令

### 实时查看日志

```bash
# 实时查看日志（推荐）
docker logs -f apifox-runner

# 查看最后 50 行日志
docker logs --tail 50 apifox-runner

# 查看最近 1 小时的日志
docker logs --since 1h apifox-runner

# 查看指定时间范围的日志
docker logs --since "2026-02-09T17:00:00" --until "2026-02-09T18:00:00" apifox-runner
```

### 导出日志到文件

```bash
# 导出所有日志
docker logs apifox-runner > apifox-runner.log

# 导出错误日志（过滤错误信息）
docker logs apifox-runner 2>&1 | findstr /i "error" > apifox-runner-errors.log

# 导出最近 100 行日志
docker logs --tail 100 apifox-runner > apifox-runner-recent.log
```

### 搜索关键错误

```bash
# 搜索错误信息
docker logs apifox-runner | findstr /i "error"

# 搜索 400 错误
docker logs apifox-runner | findstr /i "400"

# 搜索 WebSocket 错误
docker logs apifox-runner | findstr /i "websocket"

# 搜索认证错误
docker logs apifox-runner | findstr /i "authorization"
```

---

## 🎯 快速诊断脚本

创建一个诊断脚本来快速检查问题：

```bash
@echo off
chcp 65001 >nul
echo ============================================================
echo   Apifox Runner 日志诊断工具
echo ============================================================
echo.

echo [1/5] 检查容器状态...
docker ps | findstr apifox-runner
if %errorlevel% neq 0 (
    echo ❌ Runner 容器未运行！
    goto :end
)
echo ✅ Runner 容器正在运行
echo.

echo [2/5] 检查最近的错误...
docker logs --tail 100 apifox-runner | findstr /i "error"
if %errorlevel% equ 0 (
    echo ⚠️  发现错误信息
) else (
    echo ✅ 未发现明显错误
)
echo.

echo [3/5] 检查 400 错误...
docker logs apifox-runner | findstr /i "400"
if %errorlevel% equ 0 (
    echo ❌ 发现 400 错误（通常是认证问题）
    echo 建议：重新配置 Runner 或检查 Token
) else (
    echo ✅ 未发现 400 错误
)
echo.

echo [4/5] 检查 WebSocket 连接...
docker logs apifox-runner | findstr /i "websocket"
if %errorlevel% equ 0 (
    echo ⚠️  发现 WebSocket 相关日志
) else (
    echo ✅ 未发现 WebSocket 错误
)
echo.

echo [5/5] 检查网络连接...
Test-NetConnection -ComputerName api.apifox.com -Port 443 -InformationLevel Quiet
if %errorlevel% equ 0 (
    echo ✅ 可以访问 api.apifox.com
) else (
    echo ❌ 无法访问 api.apifox.com（可能是网络问题）
)
echo.

echo ============================================================
echo   诊断完成
echo ============================================================
echo.
echo 💡 建议操作：
echo 1. 查看完整日志: docker logs apifox-runner
echo 2. 如果发现 400 错误，重新配置 Runner
echo 3. 如果网络不通，检查防火墙和代理设置
echo.

:end
pause
```

---

## 🔍 常见错误代码对照表

| 错误代码 | 含义 | 可能原因 | 解决方法 |
|---------|------|---------|---------|
| 400 | 请求错误 | Token 无效、参数错误 | 重新配置 Runner |
| 401 | 未授权 | 认证失败 | 检查 Token 是否正确 |
| 403 | 禁止访问 | 权限不足 | 检查账号权限 |
| 404 | 未找到 | Runner ID 不存在 | 检查 Runner 配置 |
| 500 | 服务器错误 | Apifox 服务器问题 | 稍后重试或联系支持 |
| 1006 | 异常关闭 | 连接异常断开 | 检查网络连接 |

---

## 📞 获取帮助

如果以上方法都无法解决问题：

1. **收集日志信息**
   ```bash
   docker logs apifox-runner > apifox-runner-full.log
   ```

2. **检查 Apifox 状态**
   - 访问 Apifox 官网查看服务状态
   - 检查是否有公告或维护通知

3. **联系支持**
   - Apifox 官方文档：https://apifox.com/help
   - Apifox 社区：https://community.apifox.com

---

## ✅ 验证修复

修复后，验证 Runner 是否正常工作：

```bash
# 1. 检查容器状态
docker ps | findstr apifox-runner

# 2. 查看最新日志（应该没有错误）
docker logs --tail 20 apifox-runner

# 3. 在 Apifox 客户端中检查 Runner 状态
# 应该显示为「运行中」
```

---

**记住：400 错误通常是认证问题，重新配置 Runner 通常可以解决！**
