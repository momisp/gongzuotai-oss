# Jenkins 钉钉通知配置指南

## 🎯 目标

实现：**Jenkins 执行完测试后，自动将测试报告发送到钉钉**

---

## 📋 前置条件

1. **Jenkins 已安装并运行**
2. **钉钉群已创建**
3. **钉钉机器人已创建**（获取 Webhook URL）

---

## 🔧 步骤1：创建钉钉机器人

### 1.1 在钉钉群中添加机器人

1. **打开钉钉群**
   - 进入需要接收通知的钉钉群

2. **添加机器人**
   - 点击群设置 → **「智能群助手」** → **「添加机器人」**
   - 选择 **「自定义」** → **「添加」**

3. **配置机器人**
   - 机器人名称：如 `Jenkins测试报告`
   - 安全设置：选择 **「加签」** 或 **「IP地址」**（推荐加签）
   - 点击 **「完成」**

4. **获取 Webhook URL**
   - 复制 Webhook 地址，格式类似：
     ```
     https://oapi.dingtalk.com/robot/send?access_token=xxxxx
     ```
   - 如果设置了加签，还需要记录 **「加签密钥」**

---

## 📝 步骤2：配置 Jenkins Pipeline

### 方案1：使用钉钉插件（推荐）

#### 2.1 安装钉钉插件

1. **安装插件**
   - Jenkins → **「系统管理」** → **「插件管理」**
   - 搜索 **「DingTalk」** 或 **「钉钉」**
   - 安装 **「DingTalk Plugin」**
   - 重启 Jenkins

#### 2.2 配置钉钉机器人

1. **系统配置**
   - Jenkins → **「系统管理」** → **「系统配置」**
   - 找到 **「钉钉」** 部分
   - 添加钉钉机器人：
     ```
     名称：Jenkins测试报告
     Webhook URL：https://oapi.dingtalk.com/robot/send?access_token=xxxxx
     加签密钥：（如果设置了加签）
     ```

#### 2.3 在 Pipeline 中使用

**Pipeline 脚本示例：**

```groovy
pipeline {
  agent any
  
  stages {
    stage('运行 Apifox 测试') {
      steps {
        script {
          bat '''
            chcp 65001 >nul
            "C:\\Program Files\\nodejs\\npx.cmd" apifox run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xcdCofADI1aHgTPd_knKWB -r html,cli
          '''
        }
      }
    }
  }
  
  post {
    always {
      // 发布 HTML 报告
      publishHTML([
        reportName: 'Apifox Test Report',
        reportDir: '.',
        reportFiles: 'apifox-report.html',
        reportTitles: '接口自动化测试报告',
        keepAll: true
      ])
    }
    
    success {
      // 测试成功时发送钉钉通知
      script {
        def reportUrl = "${env.BUILD_URL}HTML_Report/"
        def message = """
        ✅ **接口自动化测试执行成功**
        
        **构建信息：**
        - 任务名称：${env.JOB_NAME}
        - 构建编号：#${env.BUILD_NUMBER}
        - 构建时间：${new Date().format('yyyy-MM-dd HH:mm:ss')}
        
        **测试报告：**
        - 报告链接：${reportUrl}
        
        **查看详情：** ${env.BUILD_URL}
        """
        
        // 发送钉钉通知
        dingTalk (
          robot: 'Jenkins测试报告',  // 钉钉机器人名称
          type: 'MARKDOWN',
          title: '接口自动化测试 - 成功',
          text: message
        )
      }
    }
    
    failure {
      // 测试失败时发送钉钉通知
      script {
        def reportUrl = "${env.BUILD_URL}HTML_Report/"
        def message = """
        ❌ **接口自动化测试执行失败**
        
        **构建信息：**
        - 任务名称：${env.JOB_NAME}
        - 构建编号：#${env.BUILD_NUMBER}
        - 构建时间：${new Date().format('yyyy-MM-dd HH:mm:ss')}
        
        **测试报告：**
        - 报告链接：${reportUrl}
        
        **查看详情：** ${env.BUILD_URL}
        
        ⚠️ 请及时查看测试报告并修复问题！
        """
        
        // 发送钉钉通知
        dingTalk (
          robot: 'Jenkins测试报告',
          type: 'MARKDOWN',
          title: '接口自动化测试 - 失败',
          text: message
        )
      }
    }
  }
}
```

### 方案2：使用 HTTP 请求（无需插件）

**Pipeline 脚本示例：**

```groovy
pipeline {
  agent any
  
  environment {
    // 钉钉 Webhook URL（建议使用 Jenkins 凭据管理）
    DINGTALK_WEBHOOK = 'https://oapi.dingtalk.com/robot/send?access_token=xxxxx'
    // 加签密钥（如果设置了加签）
    DINGTALK_SECRET = 'your_secret_key'
  }
  
  stages {
    stage('运行 Apifox 测试') {
      steps {
        script {
          bat '''
            chcp 65001 >nul
            "C:\\Program Files\\nodejs\\npx.cmd" apifox run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xcdCofADI1aHgTPd_knKWB -r html,cli
          '''
        }
      }
    }
  }
  
  post {
    always {
      // 发布 HTML 报告
      publishHTML([
        reportName: 'Apifox Test Report',
        reportDir: '.',
        reportFiles: 'apifox-report.html',
        reportTitles: '接口自动化测试报告'
      ])
    }
    
    success {
      script {
        sendDingTalkNotification('success')
      }
    }
    
    failure {
      script {
        sendDingTalkNotification('failure')
      }
    }
  }
}

// 发送钉钉通知的函数
def sendDingTalkNotification(status) {
  def reportUrl = "${env.BUILD_URL}HTML_Report/"
  def statusText = status == 'success' ? '✅ 成功' : '❌ 失败'
  def emoji = status == 'success' ? '✅' : '❌'
  
  def message = """
  ${emoji} **接口自动化测试执行${statusText}**
  
  **构建信息：**
  - 任务名称：${env.JOB_NAME}
  - 构建编号：#${env.BUILD_NUMBER}
  - 构建时间：${new Date().format('yyyy-MM-dd HH:mm:ss')}
  
  **测试报告：**
  - 报告链接：${reportUrl}
  
  **查看详情：** ${env.BUILD_URL}
  """
  
  // 构建钉钉消息
  def payload = [
    msgtype: 'markdown',
    markdown: [
      title: "接口自动化测试 - ${statusText}",
      text: message
    ]
  ]
  
  // 发送 HTTP 请求
  def response = httpRequest(
    httpMode: 'POST',
    url: env.DINGTALK_WEBHOOK,
    contentType: 'APPLICATION_JSON',
    requestBody: groovy.json.JsonOutput.toJson(payload)
  )
  
  echo "钉钉通知发送结果: ${response.status}"
}
```

---

## 🔐 步骤3：安全配置（推荐）

### 3.1 使用 Jenkins 凭据管理

**步骤：**

1. **添加凭据**
   - Jenkins → **「系统管理」** → **「凭据管理」** → **「系统」** → **「全局凭据」**
   - 点击 **「添加凭据」**
   - 类型选择 **「Secret text」**
   - Secret 填写：钉钉 Webhook URL
   - ID：`dingtalk-webhook`
   - 描述：`钉钉机器人 Webhook`

2. **在 Pipeline 中使用**
   ```groovy
   environment {
     DINGTALK_WEBHOOK = credentials('dingtalk-webhook')
   }
   ```

---

## 📊 步骤4：发送测试报告内容

### 方案1：发送报告链接（推荐）

**优点：**
- 简单快速
- 不占用消息空间
- 可以查看完整报告

**实现：**
```groovy
def reportUrl = "${env.BUILD_URL}HTML_Report/"
def message = """
测试报告链接：${reportUrl}
"""
```

### 方案2：发送报告摘要

**解析 HTML 报告，提取关键信息：**

```groovy
def getTestSummary() {
  def summary = [:]
  
  // 读取测试报告文件
  def reportFile = readFile('apifox-report.html')
  
  // 使用正则表达式提取信息（根据实际报告格式调整）
  def totalMatch = reportFile =~ /总计.*?(\d+)/
  def passMatch = reportFile =~ /通过.*?(\d+)/
  def failMatch = reportFile =~ /失败.*?(\d+)/
  
  if (totalMatch) summary.total = totalMatch[0][1]
  if (passMatch) summary.pass = passMatch[0][1]
  if (failMatch) summary.fail = failMatch[0][1]
  
  return summary
}

def sendDingTalkNotification(status) {
  def summary = getTestSummary()
  def reportUrl = "${env.BUILD_URL}HTML_Report/"
  
  def message = """
  **接口自动化测试执行${status == 'success' ? '成功' : '失败'}**
  
  **测试统计：**
  - 总用例数：${summary.total ?: '未知'}
  - 通过：${summary.pass ?: '未知'}
  - 失败：${summary.fail ?: '未知'}
  
  **测试报告：** ${reportUrl}
  """
  
  // 发送消息...
}
```

### 方案3：发送报告截图（高级）

**将 HTML 报告转换为图片发送：**

```groovy
post {
  success {
    script {
      // 使用工具将 HTML 转换为图片
      bat '''
        # 需要安装工具，如 wkhtmltopdf 或 puppeteer
        # 这里只是示例
      '''
      
      // 发送图片到钉钉
      def imageBase64 = readFile('report.png').bytes.encodeBase64()
      def message = [
        msgtype: 'image',
        image: [
          base64: imageBase64
        ]
      ]
    }
  }
}
```

---

## 🎨 步骤5：美化消息格式

### Markdown 格式示例

```groovy
def message = """
## ${emoji} 接口自动化测试报告

### 📊 测试统计
- **总用例数**：${total}
- **通过**：${pass} ✅
- **失败**：${fail} ❌
- **通过率**：${passRate}%

### 📋 构建信息
- **任务名称**：${env.JOB_NAME}
- **构建编号**：#${env.BUILD_NUMBER}
- **构建时间**：${new Date().format('yyyy-MM-dd HH:mm:ss')}
- **执行时长**：${duration}秒

### 📄 测试报告
[点击查看完整报告](${reportUrl})

### 🔗 相关链接
- [构建详情](${env.BUILD_URL})
- [控制台输出](${env.BUILD_URL}console)
"""
```

### 卡片消息格式

```groovy
def message = [
  msgtype: 'actionCard',
  actionCard: [
    title: '接口自动化测试报告',
    text: """
    ## 测试执行完成
    
    **状态**：${status}
    **通过率**：${passRate}%
    **报告链接**：${reportUrl}
    """,
    singleTitle: '查看报告',
    singleURL: reportUrl
  ]
]
```

---

## 📋 完整 Pipeline 示例

```groovy
pipeline {
  agent any
  
  environment {
    DINGTALK_WEBHOOK = credentials('dingtalk-webhook')
  }
  
  stages {
    stage('运行 Apifox 测试') {
      steps {
        script {
          echo '开始执行接口自动化测试...'
          bat '''
            chcp 65001 >nul
            "C:\\Program Files\\nodejs\\npx.cmd" apifox run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xcdCofADI1aHgTPd_knKWB -r html,cli
          '''
        }
      }
    }
  }
  
  post {
    always {
      // 发布 HTML 报告
      publishHTML([
        reportName: 'Apifox Test Report',
        reportDir: '.',
        reportFiles: 'apifox-report.html',
        reportTitles: '接口自动化测试报告',
        keepAll: true
      ])
    }
    
    success {
      script {
        def reportUrl = "${env.BUILD_URL}HTML_Report/"
        def message = """
        ✅ **接口自动化测试执行成功**
        
        **构建信息：**
        - 任务名称：${env.JOB_NAME}
        - 构建编号：#${env.BUILD_NUMBER}
        - 构建时间：${new Date().format('yyyy-MM-dd HH:mm:ss')}
        
        **测试报告：**
        [点击查看完整报告](${reportUrl})
        
        **相关链接：**
        - [构建详情](${env.BUILD_URL})
        - [控制台输出](${env.BUILD_URL}console)
        """
        
        sendDingTalkMessage('成功', message)
      }
    }
    
    failure {
      script {
        def reportUrl = "${env.BUILD_URL}HTML_Report/"
        def message = """
        ❌ **接口自动化测试执行失败**
        
        **构建信息：**
        - 任务名称：${env.JOB_NAME}
        - 构建编号：#${env.BUILD_NUMBER}
        - 构建时间：${new Date().format('yyyy-MM-dd HH:mm:ss')}
        
        **测试报告：**
        [点击查看完整报告](${reportUrl})
        
        **相关链接：**
        - [构建详情](${env.BUILD_URL})
        - [控制台输出](${env.BUILD_URL}console)
        
        ⚠️ **请及时查看测试报告并修复问题！**
        """
        
        sendDingTalkMessage('失败', message)
      }
    }
  }
}

// 发送钉钉消息的函数
def sendDingTalkMessage(status, message) {
  def payload = [
    msgtype: 'markdown',
    markdown: [
      title: "接口自动化测试 - ${status}",
      text: message
    ]
  ]
  
  def response = httpRequest(
    httpMode: 'POST',
    url: env.DINGTALK_WEBHOOK,
    contentType: 'APPLICATION_JSON',
    requestBody: groovy.json.JsonOutput.toJson(payload)
  )
  
  echo "钉钉通知发送结果: ${response.status}"
  
  if (response.status != 200) {
    echo "警告：钉钉通知发送失败，状态码: ${response.status}"
  }
}
```

---

## 🔧 步骤6：安装必要插件

### 必需插件

1. **HTML Publisher Plugin**
   - 用于发布 HTML 报告
   - 安装：系统管理 → 插件管理 → 搜索 "HTML Publisher"

2. **HTTP Request Plugin**（如果使用方案2）
   - 用于发送 HTTP 请求
   - 安装：系统管理 → 插件管理 → 搜索 "HTTP Request"

3. **DingTalk Plugin**（如果使用方案1）
   - 钉钉通知插件
   - 安装：系统管理 → 插件管理 → 搜索 "DingTalk"

---

## 📝 步骤7：配置钉钉加签（可选但推荐）

### 如果设置了加签，需要计算签名

**Python 脚本示例（用于计算签名）：**

```python
import time
import hmac
import hashlib
import base64
import urllib.parse

def get_dingtalk_sign(secret):
    timestamp = str(round(time.time() * 1000))
    secret_enc = secret.encode('utf-8')
    string_to_sign = '{}\n{}'.format(timestamp, secret)
    string_to_sign_enc = string_to_sign.encode('utf-8')
    hmac_code = hmac.new(secret_enc, string_to_sign_enc, digestmod=hashlib.sha256).digest()
    sign = urllib.parse.quote_plus(base64.b64encode(hmac_code))
    return timestamp, sign
```

**在 Jenkins Pipeline 中使用：**

```groovy
def getDingTalkUrl(webhook, secret) {
  def timestamp = System.currentTimeMillis()
  def stringToSign = "${timestamp}\n${secret}"
  def sign = stringToSign.bytes.encodeBase64().toString()
  
  return "${webhook}&timestamp=${timestamp}&sign=${sign}"
}
```

---

## 🎯 快速配置步骤

### 最简单的方法（使用钉钉插件）

1. **安装 DingTalk 插件**
2. **配置钉钉机器人**（系统配置中）
3. **在 Pipeline 中添加通知代码**
4. **运行测试**

### 不使用插件的方法

1. **获取钉钉 Webhook URL**
2. **在 Pipeline 中使用 HTTP 请求发送消息**
3. **配置报告链接**

---

## ✅ 验证配置

配置完成后：

1. **运行 Jenkins 构建**
2. **查看构建日志**，确认：
   - 测试报告已生成
   - 钉钉通知已发送
3. **检查钉钉群**，确认收到通知

---

## 📚 相关资源

- **钉钉机器人文档**：https://open.dingtalk.com/document/robots/custom-robot-access
- **Jenkins 钉钉插件**：https://plugins.jenkins.io/dingtalk-notifier/
- **HTML Publisher 插件**：https://plugins.jenkins.io/htmlpublisher/

---

**记住：推荐使用报告链接方式，简单可靠！** 🚀
