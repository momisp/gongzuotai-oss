# Docker + Apifox 持续集成完整指南

## 🎯 目标

实现：**测试场景自动运行 → 生成测试报告 → 自动发送通知**

---

## 📋 前置条件检查

### ✅ 已完成的步骤

- [x] Docker 已安装
- [x] Apifox 客户端已安装
- [x] 测试场景已创建

### 🔄 需要完成的步骤

- [ ] 部署 Apifox Runner（Docker）
- [ ] 配置 Runner 连接
- [ ] 创建定时任务
- [ ] 配置测试报告通知

---

## 🚀 步骤1：部署 Apifox Runner（Docker）

### 方法1：使用快速安装脚本（推荐）

1. **运行安装脚本**
   ```bash
   # 如果之前已经创建了快速安装脚本
   快速安装Apifox_Runner.bat
   ```

2. **或者手动执行 Docker 命令**
   ```bash
   # 拉取 Apifox Runner 镜像
   docker pull apifox/apifox-runner:latest
   
   # 运行 Runner 容器
   docker run -d \
     --name apifox-runner \
     --restart unless-stopped \
     -p 4524:4524 \
     -v C:\apifox-runner-data:/data \
     apifox/apifox-runner:latest
   ```

3. **验证 Runner 是否启动**
   ```bash
   # 查看容器状态
   docker ps | findstr apifox-runner
   
   # 查看日志
   docker logs apifox-runner
   
   # 测试端口是否可访问
   Test-NetConnection -ComputerName localhost -Port 4524
   ```

### 方法2：使用 Docker Compose（推荐用于生产环境）

1. **创建 docker-compose.yml**
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
       environment:
         - TZ=Asia/Shanghai
   ```

2. **启动服务**
   ```bash
   docker-compose up -d
   ```

3. **查看状态**
   ```bash
   docker-compose ps
   docker-compose logs -f
   ```

---

## 🔗 步骤2：在 Apifox 中配置 Runner

### 2.1 获取 Runner Token（如果需要）

1. **查看 Runner 日志获取 Token**
   ```bash
   docker logs apifox-runner
   ```
   
   在日志中找到类似以下的信息：
   ```
   Runner token: xxxxx-xxxxx-xxxxx
   ```

### 2.2 在 Apifox 客户端中添加 Runner

1. **打开 Apifox 客户端**

2. **进入 Runner 设置**
   - 点击左侧菜单 **「自动化测试」**
   - 点击 **「Runner 设置」** 或 **「团队资源」** → **「通用 Runner」**

3. **添加 Runner**
   - 点击 **「添加 Runner」** 或 **「部署通用 Runner」**
   - 填写 Runner 信息：
     ```
     名称：apifox_general_runner（或自定义）
     地址：http://localhost:4524（本机）或 http://服务器IP:4524（服务器）
     Token：（如果需要，从日志中获取）
     ```

4. **验证连接**
   - 等待 Runner 状态变为 **「运行中」**
   - 如果显示 **「连接中」**，检查：
     - Docker 容器是否运行：`docker ps`
     - 端口是否可访问：`Test-NetConnection -ComputerName localhost -Port 4524`
     - 防火墙是否阻止连接

---

## ⏰ 步骤3：创建定时任务

### 3.1 在 Apifox 中创建定时任务

1. **进入定时任务页面**
   - 点击左侧菜单 **「自动化测试」**
   - 点击 **「定时任务 Beta」**

2. **创建新任务**
   - 点击 **「+ 创建定时任务」**
   - 填写任务信息：
     ```
     任务名称：接口自动化测试（示例）
     描述：每日自动执行接口测试
     ```

3. **配置运行设置**
   
   **运行环境：**
   - 选择你的测试环境（如：测试环境、生产环境）
   
   **测试场景：**
   - 点击 **「添加测试场景」**
   - 选择你创建的测试场景
   - 可以添加多个测试场景
   
   **运行设置：**
   ```
   循环次数：1（根据需要调整）
   间隔停顿：0 毫秒（根据需要调整）
   保存请求/响应详情：全部请求（便于排查问题）
   ```

4. **配置运行方式**
   
   **运行周期：**
   - 选择 **「按天」**、**「按周」** 或 **「按小时」**
   - 设置具体时间（如：每天凌晨2点）
   
   **运行于：**
   - 选择你配置的 Runner（如：`apifox_general_runner`）
   
   **通知：**
   - 开启通知开关
   - 配置通知方式（邮件、钉钉、企业微信等）

5. **保存并启用**
   - 点击 **「保存」**
   - 确认任务状态为 **「启用」**

### 3.2 测试定时任务

1. **立即运行测试**
   - 在定时任务页面，点击 **「立即运行」** 按钮
   - 观察运行过程和结果

2. **查看运行历史**
   - 点击 **「运行历史」** 标签页
   - 查看测试执行记录
   - 点击记录查看详细报告

---

## 📧 步骤4：配置测试报告通知

### 4.1 在 Apifox 中配置通知

1. **进入项目设置**
   - 点击左侧菜单 **「项目设置」**
   - 找到 **「通知设置」** 或 **「集成」**

2. **配置通知方式**

   **邮件通知：**
   ```
   1. 开启邮件通知
   2. 配置 SMTP 服务器
   3. 设置发件人和收件人
   4. 选择通知事件（测试完成、测试失败等）
   ```

   **钉钉通知：**
   ```
   1. 开启钉钉通知
   2. 配置 Webhook URL
   3. 设置通知模板
   ```

   **企业微信通知：**
   ```
   1. 开启企业微信通知
   2. 配置机器人 Webhook
   3. 设置通知内容
   ```

### 4.2 在定时任务中配置通知

1. **编辑定时任务**
   - 进入定时任务详情页
   - 找到 **「通知」** 设置

2. **配置通知规则**
   ```
   通知条件：
   - 测试完成时通知
   - 测试失败时通知
   - 测试超时时通知
   
   通知内容：
   - 测试结果摘要
   - 失败用例详情
   - 测试报告链接
   ```

---

## 🔄 步骤5：集成到 CI/CD（可选）

### 5.1 Jenkins 集成方案

#### 方案1：Jenkins 触发 Apifox 定时任务

**Jenkins Pipeline 示例：**

```groovy
pipeline {
    agent any
    
    stages {
        stage('触发 Apifox 测试') {
            steps {
                script {
                    // 使用 Apifox API 触发定时任务
                    sh '''
                        curl -X POST "https://api.apifox.com/v1/projects/{projectId}/scheduled-tasks/{taskId}/run" \
                          -H "Authorization: Bearer {your-token}" \
                          -H "Content-Type: application/json"
                    '''
                }
            }
        }
        
        stage('等待测试完成') {
            steps {
                script {
                    // 轮询检查测试状态
                    timeout(time: 30, unit: 'MINUTES') {
                        waitUntil {
                            def status = sh(
                                script: '''
                                    curl -X GET "https://api.apifox.com/v1/projects/{projectId}/scheduled-tasks/{taskId}/status" \
                                      -H "Authorization: Bearer {your-token}"
                                ''',
                                returnStdout: true
                            )
                            return status.contains('completed')
                        }
                    }
                }
            }
        }
        
        stage('获取测试报告') {
            steps {
                script {
                    // 下载测试报告
                    sh '''
                        curl -X GET "https://api.apifox.com/v1/projects/{projectId}/scheduled-tasks/{taskId}/report" \
                          -H "Authorization: Bearer {your-token}" \
                          -o test-report.html
                    '''
                }
                
                // 发布测试报告
                publishHTML([
                    reportName: 'Apifox Test Report',
                    reportDir: '.',
                    reportFiles: 'test-report.html',
                    reportTitles: '接口自动化测试报告'
                ])
            }
        }
    }
    
    post {
        always {
            // 发送通知
            emailext(
                subject: "接口自动化测试完成 - ${env.JOB_NAME}",
                body: "测试已完成，请查看报告。",
                attachLog: true
            )
        }
    }
}
```

#### 方案2：Jenkins 直接运行 Apifox Runner

```groovy
pipeline {
    agent any
    
    stages {
        stage('运行 Apifox 测试') {
            steps {
                script {
                    docker.image('apifox/apifox-runner:latest').inside('-p 4524:4524') {
                        sh '''
                            # 使用 Apifox CLI 运行测试
                            apifox run --env=测试环境 --scenario=你的测试场景
                        '''
                    }
                }
            }
        }
    }
}
```

### 5.2 GitLab CI/CD 集成

**创建 `.gitlab-ci.yml`：**

```yaml
stages:
  - test

apifox_test:
  stage: test
  image: docker:latest
  services:
    - docker:dind
  before_script:
    - docker pull apifox/apifox-runner:latest
  script:
    - |
      docker run --rm \
        -v $(pwd):/workspace \
        -e APIFOX_PROJECT_ID=$APIFOX_PROJECT_ID \
        -e APIFOX_TOKEN=$APIFOX_TOKEN \
        apifox/apifox-runner:latest \
        run --env=测试环境
  artifacts:
    reports:
      junit: test-report.xml
    paths:
      - test-report.html
  only:
    - main
    - develop
```

---

## 📊 步骤6：查看测试报告

### 6.1 在 Apifox 中查看报告

1. **运行历史**
   - 进入定时任务页面
   - 点击 **「运行历史」** 标签页
   - 点击具体的运行记录查看详细报告

2. **测试报告内容**
   ```
   - 测试概览（通过率、总用例数、失败用例数）
   - 用例详情（每个接口的请求和响应）
   - 失败用例的错误信息
   - 执行时间统计
   - 性能数据（响应时间、吞吐量等）
   ```

### 6.2 导出测试报告

1. **导出为 HTML**
   - 在报告页面点击 **「导出」**
   - 选择 **「HTML 格式」**
   - 下载报告文件

2. **导出为 JSON**
   - 选择 **「JSON 格式」**
   - 可用于进一步分析和处理

3. **导出为 Excel**
   - 选择 **「Excel 格式」**
   - 便于数据分析和统计

---

## 🔍 故障排查

### 问题1：Runner 无法连接

**检查步骤：**
```bash
# 1. 检查容器是否运行
docker ps | findstr apifox-runner

# 2. 检查端口是否可访问
Test-NetConnection -ComputerName localhost -Port 4524

# 3. 查看 Runner 日志
docker logs apifox-runner

# 4. 检查防火墙设置
```

**解决方案：**
- 确保 Docker 容器正在运行
- 检查端口映射是否正确
- 检查防火墙是否阻止连接
- 确认 Runner 地址配置正确

### 问题2：定时任务无法执行

**检查步骤：**
1. 确认 Runner 状态为 **「运行中」**
2. 查看定时任务的运行历史
3. 检查 Runner 日志：`docker logs apifox-runner`

**解决方案：**
- 重启 Runner 容器：`docker restart apifox-runner`
- 检查测试场景配置是否正确
- 确认环境变量和全局变量配置正确

### 问题3：测试报告未发送

**检查步骤：**
1. 确认通知设置已开启
2. 检查通知配置是否正确（邮箱、Webhook 等）
3. 查看 Apifox 日志

**解决方案：**
- 重新配置通知设置
- 测试通知功能是否正常
- 检查网络连接

---

## 📋 完整流程检查清单

### 部署阶段

- [ ] Docker 已安装并运行
- [ ] Apifox Runner 容器已启动
- [ ] Runner 端口（4524）可访问
- [ ] Runner 日志正常，无错误

### 配置阶段

- [ ] 在 Apifox 中添加了 Runner
- [ ] Runner 状态显示为 **「运行中」**
- [ ] 测试场景已创建并验证
- [ ] 测试环境已配置

### 任务创建阶段

- [ ] 定时任务已创建
- [ ] 测试场景已添加到任务
- [ ] 运行环境已选择
- [ ] 运行周期已设置
- [ ] Runner 已选择
- [ ] 任务状态为 **「启用」**

### 通知配置阶段

- [ ] 通知功能已开启
- [ ] 通知方式已配置（邮件/钉钉/企业微信）
- [ ] 通知规则已设置
- [ ] 测试通知功能正常

### 验证阶段

- [ ] 手动执行一次测试（立即运行）
- [ ] 查看运行历史，确认测试执行成功
- [ ] 查看测试报告，确认内容完整
- [ ] 确认收到测试通知
- [ ] 等待定时任务自动执行，验证自动化流程

---

## 🎯 最佳实践

### 1. Runner 管理

```bash
# 定期更新 Runner
docker pull apifox/apifox-runner:latest
docker stop apifox-runner
docker rm apifox-runner
# 重新运行部署命令

# 定期清理日志
docker logs apifox-runner > runner.log
docker logs --since 24h apifox-runner > recent.log
```

### 2. 测试场景组织

```
建议结构：
- 按模块组织测试场景
- 使用场景分组
- 命名规范：模块名_功能名_测试类型
  例如：用户模块_登录_正常流程
```

### 3. 定时任务配置

```
建议：
- 非关键测试：每天执行一次（如：凌晨2点）
- 关键测试：每小时执行一次
- 回归测试：代码提交后触发
- 性能测试：每周执行一次
```

### 4. 报告管理

```
建议：
- 保留最近30天的测试报告
- 定期导出重要报告
- 建立报告分析机制
- 跟踪失败用例趋势
```

---

## 📚 相关资源

- **Apifox 官方文档**：https://apifox.com/help
- **Runner 使用指南**：https://apifox.com/help/app/automation/runner
- **定时任务指南**：https://apifox.com/blog/scheduled-tasks/
- **API 文档**：https://apifox.com/help/app/open-api

---

## 🎉 完成！

按照以上步骤，你已经完成了 Docker + Apifox 的持续集成配置！

**现在你的测试流程是：**
1. ✅ 定时自动执行测试
2. ✅ 自动生成测试报告
3. ✅ 自动发送测试通知
4. ✅ 可以集成到 CI/CD 流程

**下一步建议：**
- 优化测试场景，提高覆盖率
- 配置更多通知方式
- 集成到现有的 CI/CD 流程
- 建立测试报告分析机制

---

**有问题？** 查看故障排查部分或查看 Apifox 官方文档。
