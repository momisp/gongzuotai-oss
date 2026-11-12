# Jenkins CSV 批量执行 Apifox 测试指南

## 🎯 功能说明

通过 CSV 文件配置测试任务，脚本自动读取并依次执行，无需手动修改批处理脚本。

---

## 📋 CSV 文件格式

### 格式要求

CSV 文件必须包含以下列（按顺序）：

1. **第一列（A列）**：人员（可选）
2. **第二列（B列）**：名称/备注（可选）
3. **第三列（C列）**：命令行（**必填**）

### 示例 CSV 文件

```csv
人员,名称（备注）,命令行
李飞翔,奇遇大厅模块自动化,apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/507958/detail?token=xK6sMNzyfHJUk5GLnYfVVX -r html,cli
李飞翔,域主页模块自动化,apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/508406/detail?token=xBq8EpIa5NdOxVUbL o9zE -r html,cli
李飞翔,我的奖励和所有商户模块自动化,apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/508408/detail?token=x0S8GT7 xv2ThAPIVT ono -r html,cli
```

### 注意事项

1. **第一行必须是标题行**（脚本会自动跳过）
2. **命令行列（第三列）是必填的**
3. **命令行可以包含：**
   - 完整的 `apifox run` 命令
   - 或只包含 URL 和参数（脚本会自动添加 `npx apifox run` 前缀）
4. **CSV 文件编码建议使用 UTF-8**（避免中文乱码）

---

## 🚀 使用方法

### 方法1：默认 CSV 文件（推荐）

1. **准备 CSV 文件**
   - 将 CSV 文件命名为 `apifox_tests.csv`
   - 放在批处理脚本同目录下

2. **运行脚本**
   ```batch
   批量执行Apifox测试_CSV版.bat
   ```

### 方法2：指定 CSV 文件路径

```batch
批量执行Apifox测试_CSV版.bat "C:\path\to\your\tests.csv"
```

---

## ⚙️ 脚本配置

### 可配置项

在脚本顶部找到配置区域，可以修改：

```batch
:: 设置 Node.js 路径（根据实际路径修改）
set "NODE_PATH=C:\Program Files\nodejs"

:: 设置 CSV 文件路径（默认与脚本同目录）
set "CSV_FILE=%~dp0apifox_tests.csv"

:: 设置测试间隔（秒）
set "DELAY_SECONDS=2"
```

### 配置说明

- **NODE_PATH**：Node.js 安装路径（必须）
- **CSV_FILE**：CSV 文件路径（可通过参数覆盖）
- **DELAY_SECONDS**：每个测试之间的延迟时间（秒）

---

## 📊 执行流程

### 1. 初始化

- 设置 UTF-8 编码
- 启用延迟变量扩展
- 检查 Node.js 是否存在
- 检查 CSV 文件是否存在

### 2. 统计测试数量

- 读取 CSV 文件
- 统计有效的测试命令数量
- 显示统计信息

### 3. 执行测试

- 按顺序读取每一行
- 提取命令行
- 执行测试
- 记录成功/失败
- 显示进度和结果

### 4. 结果汇总

- 显示总测试数
- 显示成功数
- 显示失败数
- 返回相应的退出码

---

## 🔍 执行示例

### 控制台输出示例

```
============================================================
  Apifox 接口自动化测试（CSV 批量执行）
============================================================

[配置] Node.js 路径: C:\Program Files\nodejs
[配置] CSV 文件路径: C:\Users\yzyz\Desktop\测试点生成\文档\05-工具脚本\apifox_tests.csv
[配置] 测试间隔: 2 秒

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

============================================================
[2/6] 执行测试
============================================================
...
```

---

## ✅ 优势

### 1. 无需修改脚本

- ✅ 添加新测试：只需在 CSV 中添加一行
- ✅ 修改测试：直接编辑 CSV 文件
- ✅ 删除测试：删除 CSV 中的对应行

### 2. 易于管理

- ✅ CSV 格式简单，可用 Excel 编辑
- ✅ 支持中文注释（名称列）
- ✅ 可以按人员、模块分类

### 3. 灵活配置

- ✅ 支持完整命令或简化命令
- ✅ 可配置测试间隔
- ✅ 可指定 CSV 文件路径

### 4. 完善的错误处理

- ✅ 检查 Node.js 是否存在
- ✅ 检查 CSV 文件是否存在
- ✅ 统计成功/失败数量
- ✅ 显示详细的执行日志

---

## 🔧 在 Jenkins 中使用

### 步骤1：准备文件

1. **将脚本和 CSV 文件上传到 Jenkins 工作空间**
   - `批量执行Apifox测试_CSV版.bat`
   - `apifox_tests.csv`

### 步骤2：配置 Jenkins 任务

**方法1：使用批处理脚本**

1. **Jenkins 任务配置** → **构建** → **增加构建步骤** → **Execute Windows batch command**
2. **命令：**
   ```batch
   call 批量执行Apifox测试_CSV版.bat
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
    stage('批量执行 Apifox 测试') {
      steps {
        script {
          echo '开始执行 CSV 批量测试...'
          bat '''
            @echo off
            chcp 65001 >nul
            call 批量执行Apifox测试_CSV版.bat
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

### 步骤3：更新测试列表

**需要添加或修改测试时：**

1. 编辑 `apifox_tests.csv` 文件
2. 添加或修改测试行
3. 保存文件
4. 重新运行 Jenkins 任务

**无需修改脚本！**

---

## 📝 CSV 文件编辑技巧

### 使用 Excel 编辑

1. **打开 CSV 文件**
   - 双击 CSV 文件，用 Excel 打开

2. **添加新测试**
   - 在最后一行添加新行
   - 填写：人员、名称、命令行

3. **修改测试**
   - 直接修改对应单元格

4. **删除测试**
   - 删除整行

5. **保存**
   - 保存为 CSV 格式（UTF-8 编码）

### 使用文本编辑器编辑

1. **使用 Notepad++ 或 VS Code**
2. **确保编码为 UTF-8**
3. **按格式添加行：**
   ```
   人员,名称,命令行
   ```

---

## ⚠️ 注意事项

### 1. CSV 格式

- ✅ 使用逗号分隔
- ✅ 第一行必须是标题行
- ✅ 命令行列（第三列）不能为空

### 2. 命令行格式

**支持两种格式：**

**格式1：完整命令（推荐）**
```csv
人员,名称,命令行
李飞翔,测试1,apifox run https://api.apifox.com/... -r html,cli
```

**格式2：简化命令**
```csv
人员,名称,命令行
李飞翔,测试1,https://api.apifox.com/... -r html,cli
```
脚本会自动添加 `npx apifox run` 前缀。

### 3. 特殊字符处理

- **URL 中的特殊字符**：脚本会自动处理
- **空格**：CSV 中的空格会被保留
- **引号**：如果 CSV 导出时包含引号，脚本会自动去除

### 4. 错误处理

- **测试失败后**：默认继续执行后续测试
- **如需失败后停止**：取消脚本中的注释：
  ```batch
  :: echo 停止执行后续测试
  :: exit /b 1
  ```

---

## 🔍 故障排查

### 问题1：找不到 CSV 文件

**错误信息：**
```
[错误] 未找到 CSV 文件
```

**解决方法：**
1. 检查 CSV 文件是否在脚本同目录下
2. 检查文件名是否为 `apifox_tests.csv`
3. 或使用参数指定完整路径：
   ```batch
   批量执行Apifox测试_CSV版.bat "C:\完整路径\apifox_tests.csv"
   ```

### 问题2：CSV 中没有找到有效测试

**错误信息：**
```
[错误] CSV 文件中没有找到有效的测试命令
```

**解决方法：**
1. 检查 CSV 文件格式是否正确
2. 检查第三列（命令行列）是否有内容
3. 检查是否有空行

### 问题3：命令执行失败

**检查：**
1. 命令行格式是否正确
2. URL 和 token 是否有效
3. Node.js 路径是否正确
4. 网络连接是否正常

---

## 📋 完整示例

### CSV 文件示例（apifox_tests.csv）

```csv
人员,名称（备注）,命令行
李飞翔,奇遇大厅模块自动化,apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/507958/detail?token=xK6sMNzyfHJUk5GLnYfVVX -r html,cli
李飞翔,域主页模块自动化,apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/508406/detail?token=xBq8EpIa5NdOxVUbL o9zE -r html,cli
李飞翔,我的奖励和所有商户模块自动化,apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/508408/detail?token=x0S8GT7 xv2ThAPIVT ono -r html,cli
李飞翔,服务商模块自动化,apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/508409/detail?token=xTgkKRh Wwmbr2nZwqjClx -r html,cli
李飞翔,域六马模块自动化,apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/508410/detail?token=xOvfSTbgr BLpezqDgb414 -r html,cli
李飞翔,商户端模块自动化,apifox run https://api.apifox.com/api/v1/projects/7794174/api-test/ci-config/508411/detail?token=xnr6EwdCHH.jlMwhc8ACJ1g -r html,cli
```

### 执行命令

```batch
批量执行Apifox测试_CSV版.bat
```

---

**记住：CSV 文件管理测试，脚本自动执行，无需修改代码！** 🚀
