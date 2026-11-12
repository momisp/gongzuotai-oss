# Jenkins 远程触发指南

## 🎯 概述

Jenkins 支持多种远程触发方式，可以通过 API、Webhook、CLI 等方式从外部触发构建。

---

## 📋 方法1：使用 Jenkins REST API（推荐）

### 1.1 获取认证 Token

**步骤：**
1. Jenkins → 右上角用户名 → **「配置」**
2. 找到 **「API Token」** 部分
3. 点击 **「添加新 Token」**
4. 输入描述，点击 **「生成」**
5. 复制生成的 Token（只显示一次）

### 1.2 触发构建（无需参数）

**使用 curl：**
```bash
curl -X POST "http://jenkins-server:port/job/job-name/build" \
  --user username:api-token
```

**使用 PowerShell：**
```powershell
$username = "your-username"
$apiToken = "your-api-token"
$jobName = "your-job-name"
$jenkinsUrl = "http://jenkins-server:port"

$base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${username}:${apiToken}"))

Invoke-RestMethod -Uri "${jenkinsUrl}/job/${jobName}/build" `
  -Method Post `
  -Headers @{Authorization = "Basic $base64Auth"}
```

**使用 Python：**
```python
import requests
from requests.auth import HTTPBasicAuth

jenkins_url = "http://jenkins-server:port"
username = "your-username"
api_token = "your-api-token"
job_name = "your-job-name"

response = requests.post(
    f"{jenkins_url}/job/{job_name}/build",
    auth=HTTPBasicAuth(username, api_token)
)

print(f"状态码: {response.status_code}")
```

### 1.3 触发构建（带参数）

**使用 curl：**
```bash
curl -X POST "http://jenkins-server:port/job/job-name/buildWithParameters" \
  --user username:api-token \
  --data "PARAM1=value1&PARAM2=value2"
```

**使用 PowerShell：**
```powershell
$params = @{
    PARAM1 = "value1"
    PARAM2 = "value2"
}

Invoke-RestMethod -Uri "${jenkinsUrl}/job/${jobName}/buildWithParameters" `
  -Method Post `
  -Headers @{Authorization = "Basic $base64Auth"} `
  -Body $params
```

---

## 📋 方法2：使用构建令牌（Build Token）

### 2.1 配置构建令牌

**步骤：**
1. Jenkins → 任务 → **「配置」**
2. 找到 **「构建触发器」** 部分
3. 勾选 **「触发远程构建」** 或 **「Trigger builds remotely」**
4. 输入 **「身份验证令牌」**（如：`my-secret-token`）
5. 保存配置

### 2.2 使用令牌触发

**URL 格式：**
```
http://jenkins-server:port/job/job-name/build?token=TOKEN_NAME
```

**使用 curl：**
```bash
curl -X POST "http://jenkins-server:port/job/job-name/build?token=my-secret-token"
```

**使用 PowerShell：**
```powershell
Invoke-RestMethod -Uri "http://jenkins-server:port/job/job-name/build?token=my-secret-token" `
  -Method Post
```

**使用浏览器：**
直接在浏览器中访问 URL，Jenkins 会自动触发构建。

---

## 📋 方法3：使用 Webhook（GitHub/GitLab）

### 3.1 安装插件

- **GitHub Plugin**（GitHub）
- **GitLab Plugin**（GitLab）
- **Generic Webhook Trigger Plugin**（通用 Webhook）

### 3.2 配置 Webhook

**GitHub：**
1. Jenkins → 任务 → **「配置」**
2. 勾选 **「GitHub hook trigger for GITScm polling」**
3. 在 GitHub 仓库设置中添加 Webhook URL：
   ```
   http://jenkins-server:port/github-webhook/
   ```

**GitLab：**
1. Jenkins → 任务 → **「配置」**
2. 勾选 **「Build when a change is pushed to GitLab」**
3. 在 GitLab 项目设置中添加 Webhook URL：
   ```
   http://jenkins-server:port/project/job-name
   ```

**Generic Webhook Trigger：**
1. Jenkins → 任务 → **「配置」**
2. 勾选 **「Generic Webhook Trigger」**
3. 配置 Token（如：`my-webhook-token`）
4. 使用 URL 触发：
   ```
   http://jenkins-server:port/generic-webhook-trigger/invoke?token=my-webhook-token
   ```

---

## 📋 方法4：使用 Jenkins CLI

### 4.1 下载 Jenkins CLI

```bash
# 下载 jenkins-cli.jar
wget http://jenkins-server:port/jnlpJars/jenkins-cli.jar
```

### 4.2 触发构建

```bash
# 触发构建
java -jar jenkins-cli.jar -s http://jenkins-server:port \
  -auth username:api-token \
  build job-name

# 触发带参数的构建
java -jar jenkins-cli.jar -s http://jenkins-server:port \
  -auth username:api-token \
  build job-name -p PARAM1=value1 -p PARAM2=value2
```

---

## 🔐 安全配置

### 启用 CSRF 保护

1. Jenkins → **「系统管理」** → **「全局安全配置」**
2. 勾选 **「启用安全」**
3. 勾选 **「防止跨站请求伪造」**

**注意：** 启用 CSRF 后，需要使用 API Token 或构建令牌。

### 配置权限

1. Jenkins → **「系统管理」** → **「全局安全配置」**
2. 配置 **「授权策略」**
3. 确保用户有 **「构建」** 权限

---

## 📝 实际应用示例

### 示例1：从批处理脚本触发

**创建 trigger.bat：**
```batch
@echo off
set JENKINS_URL=http://jenkins-server:port
set JOB_NAME=your-job-name
set TOKEN=your-token

curl -X POST "%JENKINS_URL%/job/%JOB_NAME%/build?token=%TOKEN%"
```

### 示例2：从 Python 脚本触发

```python
import requests

def trigger_jenkins_build(jenkins_url, job_name, token):
    url = f"{jenkins_url}/job/{job_name}/build?token={token}"
    response = requests.post(url)
    return response.status_code == 201

# 使用
trigger_jenkins_build(
    "http://jenkins-server:port",
    "your-job-name",
    "your-token"
)
```

### 示例3：从 PowerShell 脚本触发

```powershell
function Trigger-JenkinsBuild {
    param(
        [string]$JenkinsUrl,
        [string]$JobName,
        [string]$Token
    )
    
    $url = "${JenkinsUrl}/job/${JobName}/build?token=${Token}"
    Invoke-RestMethod -Uri $url -Method Post
}

# 使用
Trigger-JenkinsBuild `
    -JenkinsUrl "http://jenkins-server:port" `
    -JobName "your-job-name" `
    -Token "your-token"
```

---

## 🎯 推荐方案

### 方案对比

| 方法 | 优点 | 缺点 | 适用场景 |
|------|------|------|---------|
| REST API | 功能强大，支持参数 | 需要认证 | 程序化触发 |
| 构建令牌 | 简单易用 | 安全性较低 | 快速测试 |
| Webhook | 自动化，实时触发 | 需要配置插件 | Git 集成 |
| CLI | 功能完整 | 需要 Java 环境 | 命令行操作 |

### 推荐配置

**生产环境：**
- 使用 REST API + API Token
- 启用 CSRF 保护
- 配置权限控制

**开发测试：**
- 使用构建令牌
- 快速验证功能

**Git 集成：**
- 使用 Webhook
- 自动触发构建

---

## ✅ 配置检查清单

- [ ] 已获取 API Token 或配置构建令牌
- [ ] 已确认 Jenkins URL 和端口
- [ ] 已确认任务名称正确
- [ ] 已测试触发功能
- [ ] 已配置安全设置
- [ ] 已配置权限控制

---

## 📚 相关资源

- **Jenkins API 文档**：https://www.jenkins.io/doc/book/using/remote-access-api/
- **REST API 参考**：https://www.jenkins.io/doc/book/using/remote-access-api/
- **Webhook 插件**：https://plugins.jenkins.io/generic-webhook-trigger/

---

**记住：远程触发需要正确的认证和权限配置！** 🚀
