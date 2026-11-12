# Apifox Runner 400 错误详细分析

## 📊 日志分析结果

### ✅ 正常部分

从日志中可以看到：

1. **Runner 启动成功**
   ```
   start success
   HttpServer Started
   MockServer Started
   Scheduler Started
   ```

2. **配置信息正确加载**
   ```
   TEAM_ID: '3789117'
   RUNNER_ID: '26876'
   ACCESS_TOKEN: 'TSHGR-4qgNjdg6s10gs0BH_EjL-NEDkHroEZOd'
   ```

3. **所有服务已启动**
   - RunnerWebSocket Started
   - RunnerChecker Started
   - DataSyncCacher Started
   - HttpServer Started
   - MockServer Started
   - Scheduler Started

### ❌ 问题部分

**WebSocket 连接失败：**
```
Error: Unexpected server response: 400
_closeCode: 1006
```

**关键信息：**
- 连接 URL：`wss://api.apifox.com/ws/self-hosted-runner?authorization=TSHGR-4qgNjdg6s10gs0BH_EjL-NEDkHroEZOd&team-id=3789117&organization-id=0&runner-id=26876&machine-id=7ff828f8b2b1&client-version=2.1.0&client-mode=general-runner`
- 服务器返回 400 错误
- Runner 每 60 秒重试连接，但一直失败

---

## 🔍 问题原因分析

### 最可能的原因

**Runner ID 26876 在 Apifox 服务器端不存在或已失效**

**原因说明：**
1. Runner 容器启动成功，配置也正确
2. 但是 Apifox 服务器不认可这个 Runner ID
3. 可能的情况：
   - Runner 在 Apifox 中已被删除
   - Runner 配置不匹配
   - Runner ID 已过期或被重置

---

## 🛠️ 解决方案

### 方案1：在 Apifox 中重新创建 Runner（推荐）

**步骤：**

1. **在 Apifox 客户端中删除旧 Runner**
   - 打开 Apifox 客户端
   - 进入「自动化测试」→「Runner 设置」
   - 找到 Runner ID 为 26876 的 Runner
   - 删除它

2. **重新创建 Runner**
   - 点击「添加 Runner」或「部署通用 Runner」
   - 选择「Windows」系统
   - 复制部署命令（如果需要）
   - 获取新的 Runner 配置信息

3. **使用新的 Runner ID 重新部署**
   ```bash
   # 停止并删除旧容器
   docker stop apifox_general_runner
   docker rm apifox_general_runner
   
   # 使用新的 Runner 配置重新部署
   # 注意：需要使用从 Apifox 中获取的新配置
   ```

### 方案2：检查 Apifox 中的 Runner 配置

**步骤：**

1. **在 Apifox 客户端中检查 Runner**
   - 进入「自动化测试」→「Runner 设置」
   - 查看 Runner ID 26876 的状态
   - 确认 Runner 是否还存在
   - 检查 Runner 配置是否正确

2. **如果 Runner 存在但状态异常**
   - 尝试删除并重新添加
   - 或者重置 Runner 配置

### 方案3：使用环境变量重新部署

**如果 Apifox 提供了新的 Runner 配置：**

```bash
# 停止并删除旧容器
docker stop apifox_general_runner
docker rm apifox_general_runner

# 使用新的配置重新部署
# 注意：以下参数需要从 Apifox 中获取
docker run -d \
  --name apifox_general_runner \
  --restart unless-stopped \
  -p 4524:4524 \
  -v C:\apifox-runner-data:/data \
  -e ACCESS_TOKEN=新的Token \
  -e TEAM_ID=3789117 \
  -e RUNNER_ID=新的RunnerID \
  apifox/self-hosted-general-runner:latest
```

---

## 📋 详细排查步骤

### 步骤1：确认 Apifox 中的 Runner 状态

1. 打开 Apifox 客户端
2. 进入「自动化测试」→「Runner 设置」
3. 查找 Runner ID 26876
4. 检查状态：
   - 是否存在？
   - 状态是什么？（运行中/连接中/离线）
   - 配置是否正确？

### 步骤2：检查 Runner 配置信息

**在 Apifox 中查看：**
- Runner ID：应该是 26876
- Team ID：应该是 3789117
- Access Token：应该与日志中的一致

**如果信息不匹配：**
- 删除旧 Runner
- 重新创建 Runner
- 使用新的配置信息

### 步骤3：重新部署 Runner

**使用新的配置：**

```bash
# 1. 停止并删除旧容器
docker stop apifox_general_runner
docker rm apifox_general_runner

# 2. 从 Apifox 获取新的部署命令
# 在 Apifox 中：团队资源 → 通用 Runner → 部署通用 Runner
# 选择 Windows，复制命令

# 3. 执行新的部署命令
# （使用从 Apifox 复制的命令）
```

---

## 🎯 快速修复脚本

创建一个脚本来帮助重新部署：

```bash
@echo off
chcp 65001 >nul
echo ============================================================
echo   Apifox Runner 400 错误修复
echo ============================================================
echo.

echo ⚠️  问题：Runner ID 26876 在 Apifox 服务器端可能已失效
echo.
echo 📋 解决步骤：
echo.
echo 1. 在 Apifox 客户端中：
echo    - 进入「自动化测试」→「Runner 设置」
echo    - 删除 Runner ID 26876（如果存在）
echo    - 重新创建 Runner，获取新的配置
echo.
echo 2. 停止并删除旧容器：
echo    docker stop apifox_general_runner
echo    docker rm apifox_general_runner
echo.
echo 3. 使用新的配置重新部署：
echo    （使用从 Apifox 中获取的新部署命令）
echo.
echo ============================================================
echo.
set /p choice="是否现在停止并删除旧容器？(Y/N): "
if /i "%choice%"=="Y" (
    echo.
    echo 正在停止容器...
    docker stop apifox_general_runner 2>nul
    echo 正在删除容器...
    docker rm apifox_general_runner 2>nul
    echo.
    echo ✅ 旧容器已删除
    echo.
    echo 📋 下一步：
    echo 1. 在 Apifox 中重新创建 Runner
    echo 2. 获取新的部署命令
    echo 3. 执行新的部署命令
)

pause
```

---

## 💡 重要提示

### 为什么会出现 400 错误？

**400 错误通常表示：**
- 请求参数错误
- 认证信息无效
- 资源不存在

**在这个场景中：**
- Runner 容器运行正常
- 配置信息也正确加载
- 但是 Apifox 服务器不认可这个 Runner ID
- **最可能的原因：Runner 在 Apifox 中已被删除或失效**

### 如何避免这个问题？

1. **不要在 Apifox 中删除 Runner 后继续使用旧容器**
2. **重新部署 Runner 时，使用 Apifox 提供的最新配置**
3. **定期检查 Runner 状态，确保配置同步**

---

## ✅ 验证修复

修复后，检查日志应该看到：

```
✅ 正常连接：
RunnerWebSocket Started
（没有 400 错误）
（没有 closeCode: 1006）
```

**检查命令：**
```bash
# 查看最新日志
docker logs --tail 50 apifox_general_runner

# 应该看到：
# - 没有 400 错误
# - WebSocket 连接成功
# - Runner 状态正常
```

---

## 📞 如果仍然无法解决

如果按照以上步骤操作后仍然出现 400 错误：

1. **检查 Apifox 服务状态**
   - 访问 Apifox 官网
   - 查看是否有服务公告

2. **联系 Apifox 支持**
   - 提供 Runner ID：26876
   - 提供 Team ID：3789117
   - 提供错误日志

3. **尝试使用不同的 Runner 配置**
   - 创建新的 Runner
   - 使用新的 Runner ID

---

**记住：400 错误通常是 Runner ID 在 Apifox 服务器端不存在或已失效，需要在 Apifox 中重新创建 Runner！**
