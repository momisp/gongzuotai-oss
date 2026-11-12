# Jenkins Excel 直接执行 Apifox 测试指南

## 🎯 功能说明

**直接读取 Excel 文件并执行测试**，无需转换为 CSV，无需生成临时文件。

---

## ✨ 核心优势

### 相比 CSV 版本
- ✅ **无需手动转换**：直接使用 Excel 文件
- ✅ **无需临时文件**：不生成 CSV 中间文件
- ✅ **更简洁**：一步到位，直接执行

### 相比 Excel 转 CSV 版本
- ✅ **更高效**：不生成临时 CSV 文件
- ✅ **更直接**：Python 直接读取 Excel 并执行
- ✅ **更清晰**：所有逻辑在一个 Python 脚本中

---

## 📋 Excel 文件格式

### 格式要求

Excel 文件必须包含以下列（按顺序）：

1. **第一列（A列）**：人员（可选）
2. **第二列（B列）**：名称/备注（可选）
3. **第三列（C列）**：命令行（**必填**）

### Excel 文件示例

| 人员 | 名称（备注） | 命令行 |
|------|------------|--------|
| 李飞翔 | 奇遇大厅模块自动化 | apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/507958/detail?token=xK6sMNzyfHJUk5GLnYfVVX -r html,cli |
| 李飞翔 | 域主页模块自动化 | apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/508406/detail?token=xBq8EpIa5NdOxVUbL o9zE -r html,cli |

---

## 🚀 使用方法

### 前置要求

**安装 Python 依赖：**

```bash
pip install pandas openpyxl
```

### 方法1：默认 Excel 文件（推荐）

1. **准备 Excel 文件**
   - 将 Excel 文件命名为 `apifox_tests.xlsx`
   - 放在批处理脚本同目录下

2. **运行脚本**
   ```batch
   批量执行Apifox测试_Excel直接版.bat
   ```

### 方法2：指定 Excel 文件路径

```batch
批量执行Apifox测试_Excel直接版.bat "C:\path\to\your\tests.xlsx"
```

### 方法3：指定 Excel 文件和延迟时间

```batch
批量执行Apifox测试_Excel直接版.bat "C:\path\to\your\tests.xlsx" 3
```

---

## ⚙️ 脚本配置

### 可配置项

在脚本顶部找到配置区域，可以修改：

```batch
:: 设置 Node.js 路径（根据实际路径修改）
set "NODE_PATH=C:\Program Files\nodejs"

:: 设置 Excel 文件路径（默认与脚本同目录）
set "EXCEL_FILE=%~dp0apifox_tests.xlsx"

:: 设置 Python 路径（如果 Python 在 PATH 中，可以留空）
set "PYTHON_CMD=python"

:: 设置测试间隔（秒）
set "DELAY_SECONDS=2"
```

---

## 📊 执行流程

### 1. 初始化检查

- 检查 Node.js 是否存在
- 检查 Excel 文件是否存在
- 检查 Python 是否可用
- 检查 Python 依赖是否安装

### 2. 读取 Excel

- Python 脚本直接读取 Excel 文件
- 解析数据行
- 统计有效测试数量

### 3. 执行测试

- 按顺序读取每一行
- 提取命令行
- 执行测试（实时显示输出）
- 记录成功/失败

### 4. 结果汇总

- 显示总测试数、成功数、失败数
- 返回相应的退出码

---

## 🔍 执行示例

### 控制台输出示例

```
============================================================
  Apifox 接口自动化测试（Excel 直接执行）
============================================================

[配置] Node.js 路径: C:\Program Files\nodejs
[配置] Excel 文件路径: C:\Users\yzyz\Desktop\测试点生成\文档\05-工具脚本\apifox_tests.xlsx
[配置] 测试间隔: 2 秒

[配置] Python 路径: python

[检查] 正在检查 Python 依赖...
[成功] Python 依赖检查通过

[开始] 正在读取 Excel 文件并执行测试...

正在读取 Excel 文件: C:\Users\yzyz\Desktop\测试点生成\文档\05-工具脚本\apifox_tests.xlsx
找到 6 个测试任务

============================================================
[1/6] 执行测试
============================================================
人员: 李飞翔
名称: 奇遇大厅模块自动化
命令: apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/507958/detail?token=xK6sMNzyfHJUk5GLnYfVVX -r html,cli

执行命令: "C:\Program Files\nodejs\npx.cmd" apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/507958/detail?token=xK6sMNzyfHJUk5GLnYfVVX -r html,cli

[执行中...]

[成功] 测试执行成功

等待 2 秒后执行下一个测试...

...
```

---

## ✅ 优势对比

### CSV 版本
- ✅ 无需 Python 依赖
- ✅ 文件更小
- ❌ 需要手动转换为 CSV

### Excel 转 CSV 版本
- ✅ 支持 Excel 格式
- ❌ 需要生成临时 CSV 文件
- ❌ 需要清理临时文件

### Excel 直接版本（推荐）⭐
- ✅ **直接读取 Excel**
- ✅ **无需临时文件**
- ✅ **一步到位**
- ✅ **更高效**

---

## 🔧 在 Jenkins 中使用

### 步骤1：安装 Python 依赖

**在 Jenkins 服务器上安装：**

```bash
pip install pandas openpyxl
```

**或在 Jenkins Pipeline 中安装：**

```groovy
stage('安装依赖') {
    steps {
        bat 'pip install pandas openpyxl'
    }
}
```

### 步骤2：准备文件

1. **将以下文件上传到 Jenkins 工作空间：**
   - `批量执行Apifox测试_Excel直接版.bat`
   - `读取Excel并执行.py`
   - `apifox_tests.xlsx`

### 步骤3：配置 Jenkins 任务

**方法1：使用批处理脚本**

1. **Jenkins 任务配置** → **构建** → **增加构建步骤** → **Execute Windows batch command**
2. **命令：**
   ```batch
   call 批量执行Apifox测试_Excel直接版.bat
   ```

**方法2：使用 Pipeline**

```groovy
pipeline {
  agent any
  
  environment {
    JAVA_TOOL_OPTIONS = '-Dfile.encoding=UTF-8 -Duser.language=zh -Duser.country=CN'
    LANG = 'zh_CN.UTF-8'
  }
  
  stages {
    stage('安装 Python 依赖') {
      steps {
        bat 'pip install pandas openpyxl'
      }
    }
    
    stage('批量执行 Apifox 测试') {
      steps {
        script {
          echo '开始执行 Excel 直接批量测试...'
          bat '''
            @echo off
            chcp 65001 >nul
            call 批量执行Apifox测试_Excel直接版.bat
          '''
        }
      }
    }
  }
  
  post {
    always {
      echo '测试执行完成'
    }
    
    success {
      echo '✅ 所有测试执行成功！'
    }
    
    failure {
      echo '❌ 有测试执行失败，请检查日志'
    }
  }
}
```

---

## 📝 Excel 文件编辑技巧

### 使用 Excel 编辑

1. **打开 Excel 文件**
   - 双击 `.xlsx` 文件，用 Excel 打开

2. **添加新测试**
   - 在最后一行添加新行
   - 填写：人员、名称、命令行

3. **修改测试**
   - 直接修改对应单元格

4. **删除测试**
   - 删除整行

5. **保存**
   - 保存为 Excel 格式（.xlsx）

### Excel 格式设置（可选）

- **设置列宽**：方便查看长命令
- **添加颜色**：区分不同类型的测试
- **冻结首行**：方便查看标题
- **添加筛选**：方便筛选特定测试

---

## ⚠️ 注意事项

### 1. Python 依赖

**必须安装：**
```bash
pip install pandas openpyxl
```

### 2. Excel 格式

- ✅ 使用标准 Excel 格式（.xlsx 或 .xls）
- ✅ 第一行必须是标题行
- ✅ 命令行列（第三列）不能为空

### 3. 命令行格式

**支持两种格式：**

**格式1：完整命令（推荐）**
```
apifox run https://api.apifox.com/... -r html,cli
```

**格式2：简化命令**
```
https://api.apifox.com/... -r html,cli
```
脚本会自动添加 `npx apifox run` 前缀。

---

## 🔍 故障排查

### 问题1：找不到 Python

**错误信息：**
```
[错误] 未找到 Python，无法执行测试
```

**解决方法：**
1. 安装 Python（从 python.org 下载）
2. 确保 Python 在 PATH 中
3. 或在脚本中设置 Python 完整路径：
   ```batch
   set "PYTHON_CMD=C:\Python39\python.exe"
   ```

### 问题2：缺少 Python 依赖

**错误信息：**
```
[错误] 缺少 Python 依赖库
```

**解决方法：**
```bash
pip install pandas openpyxl
```

### 问题3：Excel 文件格式错误

**错误信息：**
```
错误: Excel 文件中没有找到有效的测试命令
```

**解决方法：**
1. 检查 Excel 文件格式是否正确
2. 检查第三列（命令行列）是否有内容
3. 检查是否有空行
4. 确保第一行是标题行

---

## 📋 文件说明

### 核心文件

1. **`批量执行Apifox测试_Excel直接版.bat`**
   - 主批处理脚本
   - 检查环境、调用 Python 脚本

2. **`读取Excel并执行.py`**
   - Python 脚本
   - 读取 Excel、执行测试

### 辅助文件（可选）

3. **`创建Excel模板.py`**
   - 创建 Excel 模板文件
   - 包含示例数据

---

## 🎯 推荐使用

**推荐使用 Excel 直接版本**，因为：
- ✅ 最简洁：直接读取 Excel，无需转换
- ✅ 最高效：不生成临时文件
- ✅ 最直观：所有逻辑清晰

---

**记住：Excel 文件直接执行，无需转换，一步到位！** 🚀
