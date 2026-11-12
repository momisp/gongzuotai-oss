# Jenkins 批处理脚本修复指南

## 🔴 问题：Jenkins 中找不到 apifox 命令

### 错误信息
```
'apifox' 不是内部或外部命令，也不是可运行的程序
或批处理文件。
```

### 原因
- Jenkins 以 SYSTEM 账户运行
- SYSTEM 账户的 PATH 环境变量不包含 Node.js 路径
- 手动执行时使用的是用户账户，PATH 完整

---

## ✅ 快速修复（3步）

### 步骤1：查找 Node.js 安装路径

在 CMD 中执行：
```cmd
where node
```

记录路径，通常是：
- `C:\Program Files\nodejs\node.exe`
- 或 `C:\Program Files (x86)\nodejs\node.exe`

### 步骤2：修改 test.bat

**方法1：使用 npx（推荐，最简单）**

```batch
@echo off
chcp 65001 >nul

:: 使用 npx 运行 apifox（不需要设置 PATH）
"C:\Program Files\nodejs\npx.cmd" apifox run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xcdCofADI1aHgTPd_knKWB -r html,cli
```

**方法2：设置 PATH**

```batch
@echo off
chcp 65001 >nul

:: 设置 PATH（根据实际路径修改）
set PATH=%PATH%;C:\Program Files\nodejs
set PATH=%PATH%;%APPDATA%\npm

:: 运行测试
apifox run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xcdCofADI1aHgTPd_knKWB -r html,cli
```

### 步骤3：在 Jenkins 中使用修复后的脚本

1. 替换原来的 test.bat
2. 重新运行构建
3. 查看日志确认是否成功

---

## 🎯 推荐方案：使用 npx

**为什么推荐 npx？**
- ✅ 不需要设置 PATH
- ✅ 使用完整路径，更可靠
- ✅ 自动查找并运行命令
- ✅ 即使 apifox-cli 未全局安装也能运行

**修改后的 test.bat：**

```batch
@echo off
chcp 65001 >nul

:: 使用 npx 运行 apifox
"C:\Program Files\nodejs\npx.cmd" apifox run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xcdCofADI1aHgTPd_knKWB -r html,cli
```

**如果 Node.js 安装在 Program Files (x86)：**

```batch
@echo off
chcp 65001 >nul

"C:\Program Files (x86)\nodejs\npx.cmd" apifox run https://api.apifox.com/api/v1/projects/7042956/api-test/ci-config/507917/detail?token=xcdCofADI1aHgTPd_knKWB -r html,cli
```

---

## 🔍 诊断工具

**运行诊断脚本：**

在 Jenkins 工作空间中运行 `check_jenkins_env.bat`，查看：
- Node.js 是否找到
- npm 是否找到
- apifox 是否找到
- PATH 环境变量内容

---

## 📋 完整修复脚本

已创建修复版本的脚本：`test_fixed.bat`

**特点：**
- 自动查找 Node.js 路径
- 自动尝试多种运行方式
- 详细的错误提示
- Jenkins 兼容

**使用方法：**
1. 复制 `test_fixed.bat` 到 Jenkins 工作空间
2. 修改其中的 Apifox 测试 URL
3. 在 Jenkins 中运行

---

## ⚠️ 注意事项

1. **路径中的空格**
   - 如果路径包含空格，需要用引号括起来
   - 例如：`"C:\Program Files\nodejs\npx.cmd"`

2. **Node.js 安装路径**
   - 不同系统可能不同
   - 使用 `where node` 查找实际路径

3. **权限问题**
   - 确保 Jenkins 有权限访问 Node.js 目录
   - SYSTEM 账户通常有足够权限

---

## ✅ 验证修复

修复后，Jenkins 构建日志应该显示：

```
✅ 找到 npx.cmd，使用 npx 运行...
或
✅ 找到 apifox 命令
```

**不应该再出现：**
- `'apifox' 不是内部或外部命令`

---

**记住：Jenkins 中使用完整路径最可靠！** 🚀
