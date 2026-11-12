# Jenkins Excel 批量执行 Apifox 测试指南

## 🎯 功能说明

通过 Excel 文件配置测试任务，脚本自动读取并依次执行。支持直接使用 Excel 格式，无需手动转换为 CSV。

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
| 李飞翔 | 我的奖励和所有商户模块自动化 | apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/508408/detail?token=x0S8GT7 xv2ThAPIVT ono -r html,cli |

### 注意事项

1. **第一行必须是标题行**（脚本会自动跳过）
2. **命令行列（第三列）是必填的**
3. **命令行可以包含：**
   - 完整的 `apifox run` 命令
   - 或只包含 URL 和参数（脚本会自动添加 `npx apifox run` 前缀）
4. **Excel 文件格式：** `.xlsx` 或 `.xls`

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
   批量执行Apifox测试_Excel版.bat
   ```

### 方法2：指定 Excel 文件路径

```batch
批量执行Apifox测试_Excel版.bat "C:\path\to\your\tests.xlsx"
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

### 配置说明

- **NODE_PATH**：Node.js 安装路径（必须）
- **EXCEL_FILE**：Excel 文件路径（可通过参数覆盖）
- **PYTHON_CMD**：Python 命令（如果 Python 在 PATH 中，可以留空）
- **DELAY_SECONDS**：每个测试之间的延迟时间（秒）

---

## 📊 执行流程

### 1. 初始化

- 设置 UTF-8 编码
- 启用延迟变量扩展
- 检查 Node.js 是否存在
- 检查 Excel 文件是否存在

### 2. Excel 转 CSV

- 调用 Python 脚本将 Excel 转换为 CSV
- 检查转换是否成功
- 生成临时 CSV 文件

### 3. 统计测试数量

- 读取 CSV 文件
- 统计有效的测试命令数量
- 显示统计信息

### 4. 执行测试

- 按顺序读取每一行
- 提取命令行
- 执行测试
- 记录成功/失败
- 显示进度和结果

### 5. 清理和汇总

- 删除临时 CSV 文件
- 显示总测试数、成功数、失败数
- 返回相应的退出码

---

## 🔍 执行示例

### 控制台输出示例

```
============================================================
  Apifox 接口自动化测试（Excel 批量执行）
============================================================

[配置] Node.js 路径: C:\Program Files\nodejs
[配置] Excel 文件路径: C:\Users\yzyz\Desktop\测试点生成\文档\05-工具脚本\apifox_tests.xlsx
[配置] CSV 临时文件: C:\Users\yzyz\Desktop\测试点生成\文档\05-工具脚本\apifox_tests_temp.csv
[配置] 测试间隔: 2 秒

[步骤1] 正在将 Excel 文件转换为 CSV...

正在执行: python Excel转CSV工具.py "C:\Users\yzyz\Desktop\测试点生成\文档\05-工具脚本\apifox_tests.xlsx" "C:\Users\yzyz\Desktop\测试点生成\文档\05-工具脚本\apifox_tests_temp.csv"
正在读取 Excel 文件: C:\Users\yzyz\Desktop\测试点生成\文档\05-工具脚本\apifox_tests.xlsx
正在转换为 CSV: C:\Users\yzyz\Desktop\测试点生成\文档\05-工具脚本\apifox_tests_temp.csv
✓ 转换成功: C:\Users\yzyz\Desktop\测试点生成\文档\05-工具脚本\apifox_tests_temp.csv

[成功] Excel 文件已转换为 CSV

[统计] 找到 6 个测试任务

============================================================
[1/6] 执行测试
============================================================
人员: 李飞翔
名称: 奇遇大厅模块自动化
命令: apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/507958/detail?token=xK6sMNzyfHJUk5GLnYfVVX -r html,cli

[执行中...]

[成功] 测试执行成功

等待 2 秒后执行下一个测试...

...
```

---

## ✅ 优势

### 1. 直接使用 Excel

- ✅ 无需手动转换为 CSV
- ✅ 支持 Excel 格式（.xlsx、.xls）
- ✅ 自动转换，无需额外操作

### 2. 易于管理

- ✅ Excel 格式更直观，可用 Excel 直接编辑
- ✅ 支持中文注释（名称列）
- ✅ 可以按人员、模块分类
- ✅ 支持 Excel 的格式设置（颜色、字体等）

### 3. 灵活配置

- ✅ 支持完整命令或简化命令
- ✅ 可配置测试间隔
- ✅ 可指定 Excel 文件路径

### 4. 完善的错误处理

- ✅ 检查 Node.js 是否存在
- ✅ 检查 Excel 文件是否存在
- ✅ 检查 Python 和依赖是否安装
- ✅ 统计成功/失败数量
- ✅ 显示详细的执行日志
- ✅ 自动清理临时文件

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
   - `批量执行Apifox测试_Excel版.bat`
   - `Excel转CSV工具.py`
   - `apifox_tests.xlsx`

### 步骤3：配置 Jenkins 任务

**方法1：使用批处理脚本**

1. **Jenkins 任务配置** → **构建** → **增加构建步骤** → **Execute Windows batch command**
2. **命令：**
   ```batch
   call 批量执行Apifox测试_Excel版.bat
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
          echo '开始执行 Excel 批量测试...'
          bat '''
            @echo off
            chcp 65001 >nul
            call 批量执行Apifox测试_Excel版.bat
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

### 步骤4：更新测试列表

**需要添加或修改测试时：**

1. 编辑 `apifox_tests.xlsx` 文件（使用 Excel）
2. 添加或修改测试行
3. 保存文件
4. 重新运行 Jenkins 任务

**无需修改脚本！**

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

### 1. Excel 格式

- ✅ 使用标准 Excel 格式（.xlsx 或 .xls）
- ✅ 第一行必须是标题行
- ✅ 命令行列（第三列）不能为空

### 2. Python 依赖

**必须安装：**
```bash
pip install pandas openpyxl
```

**如果未安装，脚本会提示错误。**

### 3. 命令行格式

**支持两种格式：**

**格式1：完整命令（推荐）**
```
人员,名称,命令行
李飞翔,测试1,apifox run https://api.apifox.com/... -r html,cli
```

**格式2：简化命令**
```
人员,名称,命令行
李飞翔,测试1,https://api.apifox.com/... -r html,cli
```
脚本会自动添加 `npx apifox run` 前缀。

### 4. 临时文件

- 脚本会自动生成临时 CSV 文件
- 执行完成后自动删除
- 如果脚本异常退出，可能需要手动删除临时文件

---

## 🔍 故障排查

### 问题1：找不到 Python

**错误信息：**
```
[错误] 未找到 Python，无法转换 Excel 文件
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
错误: 未安装 pandas 库
```

**解决方法：**
```bash
pip install pandas openpyxl
```

### 问题3：Excel 文件格式错误

**错误信息：**
```
[错误] CSV 文件中没有找到有效的测试命令
```

**解决方法：**
1. 检查 Excel 文件格式是否正确
2. 检查第三列（命令行列）是否有内容
3. 检查是否有空行
4. 确保第一行是标题行

### 问题4：命令执行失败

**检查：**
1. 命令行格式是否正确
2. URL 和 token 是否有效
3. Node.js 路径是否正确
4. 网络连接是否正常

---

## 📋 完整示例

### Excel 文件示例（apifox_tests.xlsx）

| 人员 | 名称（备注） | 命令行 |
|------|------------|--------|
| 李飞翔 | 奇遇大厅模块自动化 | apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/507958/detail?token=xK6sMNzyfHJUk5GLnYfVVX -r html,cli |
| 李飞翔 | 域主页模块自动化 | apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/508406/detail?token=xBq8EpIa5NdOxVUbL o9zE -r html,cli |
| 李飞翔 | 我的奖励和所有商户模块自动化 | apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/508408/detail?token=x0S8GT7 xv2ThAPIVT ono -r html,cli |
| 李飞翔 | 服务商模块自动化 | apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/508409/detail?token=xTgkKRh Wwmbr2nZwqjClx -r html,cli |
| 李飞翔 | 域六马模块自动化 | apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/508410/detail?token=xOvfSTbgr BLpezqDgb414 -r html,cli |
| 李飞翔 | 商户端模块自动化 | apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/508411/detail?token=xnr6EwdCHH.jlMwhc8ACJ1g -r html,cli |

### 执行命令

```batch
批量执行Apifox测试_Excel版.bat
```

---

## 🔄 CSV 版本 vs Excel 版本

### CSV 版本
- ✅ 无需 Python 依赖
- ✅ 文件更小
- ✅ 执行更快
- ❌ 需要手动转换为 CSV

### Excel 版本
- ✅ 直接使用 Excel 格式
- ✅ 更直观易用
- ✅ 支持 Excel 格式设置
- ❌ 需要 Python 和依赖

**推荐：** 如果经常使用 Excel 编辑，选择 Excel 版本；如果追求简单快速，选择 CSV 版本。

---

**记住：Excel 文件管理测试，脚本自动转换和执行，无需手动操作！** 🚀
