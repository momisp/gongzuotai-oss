# Apifox Runner 400 错误解决方案

## 🔴 问题描述

你遇到的错误：
```
Error: Unexpected server response: 400
_closeCode: 1006
```

**含义：** WebSocket 连接失败，服务器返回 400 错误（请求错误）

---

## 🎯 快速解决方案（3步）

### 步骤1：停止并删除旧 Runner

```bash
# 停止容器
docker stop apifox-runner

# 删除容器
docker rm apifox-runner
```

### 步骤2：重新部署 Runner

```bash
# 拉取最新镜像
docker pull apifox/apifox-runner:latest

# 运行新容器
docker run -d --name apifox-runner --restart unless-stopped -p 4524:4524 -v C:\apifox-runner-data:/data apifox/apifox-runner:latest
```

### 步骤3：在 Apifox 中重新配置

1. **删除旧 Runner 配置**
   - 打开 Apifox 客户端
   - 进入「自动化测试」→「Runner 设置」
   - 删除旧的 Runner 配置

2. **添加新 Runner**
   - 点击「添加 Runner」
   - 查看 Runner 日志获取 Token：
     ```bash
     docker logs apifox-runner
     ```
   - 在日志中查找类似以下的信息：
     ```
     Runner token: xxxxx-xxxxx-xxxxx
     ```
   - 填写 Runner 信息：
     ```
     名称：apifox_general_runner
     地址：http://localhost:4524
     Token：（从日志中获取）
     ```

3. **验证连接**
   - 等待 Runner 状态变为「运行中」
   - 如果仍显示「连接中」，运行诊断脚本：
     ```bash
     分析Apifox日志.bat
     ```

---

## 🔍 详细排查步骤

### 1. 检查错误类型

运行日志分析工具：
```bash
分析Apifox日志.bat
```

### 2. 检查认证 Token

**问题：** Authorization token 可能无效或过期

**解决方法：**
1. 查看 Runner 日志中的 Token：
   ```bash
   docker logs apifox-runner | findstr /i "token"
   ```

2. 在 Apifox 客户端中：
   - 删除旧的 Runner 配置
   - 重新添加 Runner，使用新的 Token

### 3. 检查 Runner 配置

**验证以下配置：**
- Runner ID 是否正确
- Team ID 是否正确
- Organization ID 是否正确
- Runner 地址是否正确（本机使用 `http://localhost:4524`）

### 4. 检查网络连接

**测试连接：**
```bash
# 测试能否访问 Apifox API
ping api.apifox.com

# 测试 HTTPS 连接
Test-NetConnection -ComputerName api.apifox.com -Port 443
```

**如果无法连接：**
- 检查防火墙设置
- 检查代理配置
- 检查网络连接

### 5. 更新 Runner 版本

**更新到最新版本：**
```bash
# 停止并删除旧容器
docker stop apifox-runner
docker rm apifox-runner

# 拉取最新镜像
docker pull apifox/apifox-runner:latest

# 重新启动
docker run -d --name apifox-runner --restart unless-stopped -p 4524:4524 -v C:\apifox-runner-data:/data apifox/apifox-runner:latest
```

---

## 🛠️ 常见原因和解决方法

### 原因1：Token 过期或无效

**症状：**
- 日志显示 400 错误
- WebSocket 连接失败

**解决：**
1. 重新部署 Runner
2. 获取新的 Token
3. 在 Apifox 中重新配置

### 原因2：Runner ID 不匹配

**症状：**
- 日志中的 Runner ID 与 Apifox 中的不一致

**解决：**
1. 在 Apifox 中删除旧 Runner
2. 重新部署 Runner
3. 重新添加 Runner

### 原因3：网络连接问题

**症状：**
- 无法访问 `api.apifox.com`
- 连接超时

**解决：**
1. 检查网络连接
2. 检查防火墙设置
3. 检查代理配置

### 原因4：Runner 版本过旧

**症状：**
- 版本不兼容错误

**解决：**
1. 更新到最新版本
2. 重新部署 Runner

---

## 📊 错误代码对照

| 错误代码 | 含义 | 解决方法 |
|---------|------|---------|
| 400 | 请求错误（通常是认证问题） | 重新配置 Runner |
| 401 | 未授权 | 检查 Token |
| 403 | 禁止访问 | 检查权限 |
| 404 | 未找到 | 检查 Runner ID |
| 500 | 服务器错误 | 稍后重试 |
| 1006 | 异常关闭 | 检查网络 |

---

## ✅ 验证修复

修复后，验证 Runner 是否正常工作：

```bash
# 1. 检查容器状态
docker ps | findstr apifox-runner

# 2. 查看最新日志（应该没有 400 错误）
docker logs --tail 20 apifox-runner

# 3. 在 Apifox 客户端中检查 Runner 状态
# 应该显示为「运行中」，而不是「连接中」
```

---

## 🎯 一键修复脚本

创建一个一键修复脚本：

```bash
@echo off
chcp 65001 >nul
echo ============================================================
echo   Apifox Runner 400 错误一键修复
echo ============================================================
echo.

echo [1/4] 停止并删除旧容器...
docker stop apifox-runner 2>nul
docker rm apifox-runner 2>nul
echo ✅ 旧容器已删除
echo.

echo [2/4] 拉取最新镜像...
docker pull apifox/apifox-runner:latest
if %errorlevel% neq 0 (
    echo ❌ 镜像拉取失败
    pause
    exit /b 1
)
echo ✅ 镜像拉取成功
echo.

echo [3/4] 启动新容器...
docker run -d --name apifox-runner --restart unless-stopped -p 4524:4524 -v C:\apifox-runner-data:/data apifox/apifox-runner:latest
if %errorlevel% neq 0 (
    echo ❌ 容器启动失败
    pause
    exit /b 1
)
echo ✅ 容器启动成功
echo.

echo [4/4] 等待 Runner 启动...
timeout /t 5 >nul
echo ✅ Runner 已启动
echo.

echo ============================================================
echo   修复完成！
echo ============================================================
echo.
echo 📋 下一步操作：
echo.
echo 1. 查看 Runner Token：
echo    docker logs apifox-runner | findstr /i "token"
echo.
echo 2. 在 Apifox 客户端中：
echo    - 删除旧 Runner 配置
echo    - 添加新 Runner，使用新 Token
echo    - 地址：http://localhost:4524
echo.
echo 3. 验证连接：
echo    - 等待 Runner 状态变为「运行中」
echo    - 如果仍有问题，运行：分析Apifox日志.bat
echo.
pause
```

---

## 📞 仍然无法解决？

如果以上方法都无法解决问题：

1. **收集完整日志**
   ```bash
   docker logs apifox-runner > apifox-runner-full.log
   ```

2. **检查 Apifox 服务状态**
   - 访问 Apifox 官网
   - 查看是否有服务公告

3. **联系支持**
   - Apifox 帮助文档：https://apifox.com/help
   - Apifox 社区：https://community.apifox.com

---

**记住：400 错误通常是认证问题，重新配置 Runner 通常可以解决！**
