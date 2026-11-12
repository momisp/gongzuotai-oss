# 工具脚本说明

## 📋 脚本列表

### 接口筛选相关

#### 1. 筛选接口.py

**功能：**
- 从 OpenAPI 文件中提取接口信息
- 自动分类优先级（P0/P1/P2/P3）
- 生成 Excel 清单

**使用方法：**
```bash
python 筛选接口.py openapi.json
```

**输出：**
- `接口清单.xlsx` - 包含所有接口和优先级

**依赖：**
```bash
pip install openpyxl pyyaml
```

---

#### 2. 接口对比工具.py

**功能：**
- 对比接口文档和 Apifox 中的接口
- 找出差异（只在文档中的、只在 Apifox 中的）
- 生成对比报告

**使用方法：**
```bash
python 接口对比工具.py doc.json apifox.json
```

**输出：**
- 控制台输出对比报告

**依赖：**
```bash
pip install pyyaml
```

---

### Apifox Runner 相关

#### 3. check_apifox_runner.py

**功能：**
- 检查 Apifox Runner 配置和状态
- 跨平台支持（Windows/Linux/Mac）

**使用方法：**
```bash
python check_apifox_runner.py
```

---

## 📦 安装依赖

**安装所有依赖：**
```bash
pip install -r requirements.txt
```

**只安装接口筛选工具依赖：**
```bash
pip install openpyxl pyyaml
```

---

## 🚀 快速开始

### 步骤1：安装依赖

```bash
pip install openpyxl pyyaml
```

### 步骤2：导出接口

从 Apifox 导出 OpenAPI 文件：
- Apifox → 项目设置 → 导入/导出 → 导出 OpenAPI

### 步骤3：运行筛选脚本

```bash
python 筛选接口.py openapi.json
```

### 步骤4：查看结果

打开生成的 `接口清单.xlsx`，查看接口和优先级。

---

## 📚 相关文档

- **接口筛选整理指南** → `../01-Apifox相关/接口筛选整理指南.md`
- **接口自动化快速开始** → `../01-Apifox相关/接口自动化快速开始.md`

---

**记住：先安装依赖，再运行脚本！** 🚀
