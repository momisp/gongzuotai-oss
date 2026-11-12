# Docker 快速入门（测试工程师专用版）

## 🎯 为什么测试工程师需要 Docker？

### 痛点场景

#### 场景1：环境不一致
```
开发环境：Python 3.9 + requests 2.28.0 → ✅ 测试通过
测试环境：Python 3.8 + requests 2.25.0 → ❌ 测试失败
生产环境：Python 3.10 + requests 2.30.0 → ❓ 未知
```

#### 场景2：环境冲突
```
项目A需要：Python 3.9
项目B需要：Python 3.10
项目C需要：Python 3.11

在同一台服务器上，如何同时支持？
```

#### 场景3：环境搭建耗时
```
新同事入职：
1. 安装 Python 3.9 → 10分钟
2. 安装依赖库 → 20分钟
3. 配置环境变量 → 5分钟
4. 遇到问题排查 → 30分钟
总计：65分钟

使用 Docker：
1. 拉取镜像 → 2分钟
2. 运行容器 → 10秒
总计：2分钟
```

---

## 📦 Docker 核心概念（5分钟理解）

### 1. 镜像（Image）= 模板

**类比：** 就像 Windows 的 ISO 安装文件

```
镜像 = 只读的模板
- Python 3.9 镜像 = 包含 Python 3.9 的模板
- Node.js 镜像 = 包含 Node.js 的模板
- 自定义镜像 = 包含你的测试环境的模板
```

### 2. 容器（Container）= 运行实例

**类比：** 就像用 ISO 安装好的 Windows 系统

```
容器 = 镜像的运行实例
- 一个镜像可以创建多个容器
- 每个容器是独立的
- 容器之间互不影响
```

### 3. 仓库（Repository）= 镜像商店

**类比：** 就像应用商店

```
Docker Hub = 官方的镜像仓库
- 可以搜索镜像
- 可以下载镜像
- 可以上传自己的镜像
```

---

## 🚀 5个必学命令（够用80%场景）

### 1. docker pull - 下载镜像

```bash
# 下载 Python 3.9 镜像
docker pull python:3.9

# 下载 Node.js 镜像
docker pull node:18

# 下载 Apifox Runner 镜像
docker pull apifox/apifox-runner:latest
```

**什么时候用：** 第一次使用某个镜像时

### 2. docker run - 运行容器

```bash
# 运行 Python 容器
docker run python:3.9 python --version

# 运行容器并进入交互模式
docker run -it python:3.9 bash

# 运行容器并挂载目录
docker run -v C:\test:/workspace python:3.9 python /workspace/test.py

# 运行容器并映射端口
docker run -p 8080:80 nginx
```

**参数说明：**
- `-it`：交互模式
- `-v`：挂载目录（把本地目录映射到容器内）
- `-p`：映射端口（把容器端口映射到主机端口）
- `--rm`：容器停止后自动删除
- `-d`：后台运行

**什么时候用：** 需要运行测试时

### 3. docker ps - 查看容器

```bash
# 查看运行中的容器
docker ps

# 查看所有容器（包括停止的）
docker ps -a
```

**什么时候用：** 检查容器是否在运行

### 4. docker logs - 查看日志

```bash
# 查看容器日志
docker logs <容器名或ID>

# 实时查看日志
docker logs -f <容器名或ID>

# 查看最后50行日志
docker logs --tail 50 <容器名或ID>
```

**什么时候用：** 测试失败时，查看错误信息

### 5. docker stop/start/restart - 管理容器

```bash
# 停止容器
docker stop <容器名或ID>

# 启动容器
docker start <容器名或ID>

# 重启容器
docker restart <容器名或ID>

# 删除容器
docker rm <容器名或ID>
```

**什么时候用：** 管理容器生命周期

---

## 💼 实际应用场景

### 场景1：在 Docker 中运行接口测试

#### 步骤1：准备测试脚本

```python
# test_api.py
import requests

def test_api():
    response = requests.get('https://api.example.com/users')
    assert response.status_code == 200
    print("测试通过！")

if __name__ == '__main__':
    test_api()
```

#### 步骤2：准备依赖文件

```txt
# requirements.txt
requests==2.28.0
pytest==7.2.0
```

#### 步骤3：运行测试

```bash
# 方式1：直接运行（临时容器）
docker run --rm \
  -v C:\test:/workspace \
  -w /workspace \
  python:3.9 \
  sh -c "pip install -r requirements.txt && python test_api.py"

# 方式2：先进入容器，再运行
docker run -it --rm \
  -v C:\test:/workspace \
  -w /workspace \
  python:3.9 \
  bash
# 然后在容器内执行：
# pip install -r requirements.txt
# python test_api.py
```

### 场景2：创建自定义测试镜像

#### 步骤1：创建 Dockerfile

```dockerfile
# Dockerfile
FROM python:3.9

WORKDIR /app

# 复制依赖文件
COPY requirements.txt .

# 安装依赖
RUN pip install -r requirements.txt

# 复制测试代码
COPY . .

# 运行测试
CMD ["python", "test_api.py"]
```

#### 步骤2：构建镜像

```bash
docker build -t my-test-image .
```

#### 步骤3：运行容器

```bash
docker run --rm my-test-image
```

### 场景3：在 Jenkins 中使用 Docker

#### Jenkins Pipeline 示例

```groovy
pipeline {
    agent any
    
    stages {
        stage('拉取代码') {
            steps {
                git 'https://github.com/your-repo/test.git'
            }
        }
        
        stage('运行测试') {
            steps {
                script {
                    docker.image('python:3.9').inside('-v /workspace:/app') {
                        sh '''
                            pip install -r requirements.txt
                            python test_api.py
                        '''
                    }
                }
            }
        }
        
        stage('生成报告') {
            steps {
                // 处理测试报告
            }
        }
    }
}
```

---

## 🎓 学习路径（循序渐进）

### 第1周：基础概念

**目标：** 理解 Docker 是什么，能运行简单容器

**任务：**
1. 安装 Docker Desktop
2. 运行 `docker run hello-world`
3. 理解镜像、容器、仓库的概念

**检查：** 能说出镜像和容器的区别

### 第2周：基本命令

**目标：** 掌握5个必学命令

**任务：**
1. 练习 `docker pull`、`docker run`、`docker ps`、`docker logs`、`docker stop`
2. 在 Docker 中运行 Python 脚本
3. 挂载目录，运行本地测试脚本

**检查：** 能在 Docker 中运行自己的测试脚本

### 第3周：实际应用

**目标：** 在实际项目中使用 Docker

**任务：**
1. 创建测试环境的 Dockerfile
2. 构建自定义镜像
3. 在 Jenkins 中集成 Docker

**检查：** 能在 Jenkins 中使用 Docker 运行测试

### 第4周：进阶使用

**目标：** 掌握 Docker Compose 和最佳实践

**任务：**
1. 学习 Docker Compose（管理多个容器）
2. 优化 Dockerfile
3. 学习 Docker 网络和存储

**检查：** 能使用 Docker Compose 管理测试环境

---

## 📋 常用命令速查表

### 镜像操作

```bash
docker pull <镜像名>              # 下载镜像
docker images                     # 查看本地镜像
docker rmi <镜像名>               # 删除镜像
docker build -t <镜像名> .        # 构建镜像
```

### 容器操作

```bash
docker run <镜像名>               # 运行容器
docker ps                         # 查看运行中的容器
docker ps -a                      # 查看所有容器
docker stop <容器名>              # 停止容器
docker start <容器名>             # 启动容器
docker restart <容器名>           # 重启容器
docker rm <容器名>                # 删除容器
docker logs <容器名>              # 查看日志
docker exec -it <容器名> bash     # 进入容器
```

### 实用组合

```bash
# 运行并自动删除
docker run --rm <镜像名> <命令>

# 运行并挂载目录
docker run -v <本地目录>:<容器目录> <镜像名>

# 运行并映射端口
docker run -p <主机端口>:<容器端口> <镜像名>

# 后台运行
docker run -d <镜像名>
```

---

## ⚠️ 常见错误和解决

### 错误1：Cannot connect to the Docker daemon

**原因：** Docker Desktop 未启动

**解决：** 启动 Docker Desktop

### 错误2：port is already allocated

**原因：** 端口已被占用

**解决：** 
```bash
# 查看占用端口的容器
docker ps | grep <端口号>

# 停止占用端口的容器
docker stop <容器名>

# 或使用其他端口
docker run -p 8081:80 <镜像名>
```

### 错误3：permission denied

**原因：** 权限不足

**解决：** 
- Windows：以管理员身份运行
- Linux：使用 `sudo` 或加入 docker 用户组

### 错误4：no space left on device

**原因：** 磁盘空间不足

**解决：**
```bash
# 清理未使用的镜像和容器
docker system prune -a
```

---

## 🎯 总结

### 作为测试工程师，你需要掌握：

✅ **基础概念**：镜像、容器、仓库
✅ **5个必学命令**：pull、run、ps、logs、stop
✅ **实际应用**：在 Docker 中运行测试
✅ **Jenkins 集成**：在 Jenkins 中使用 Docker

### 不需要深入：

❌ Docker 底层原理
❌ Docker 网络配置（除非需要）
❌ Docker Swarm/Kubernetes（那是运维的工作）

### 记住：

> **Docker 是工具，不是目的。**
> 
> 你的目标是：**让测试更可靠、更简单**
> 
> Docker 只是帮你实现这个目标的工具之一。

---

**开始学习吧！记住：实践是最好的老师！** 🚀
