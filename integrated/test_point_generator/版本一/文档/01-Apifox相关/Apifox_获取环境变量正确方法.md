# Apifox 获取环境变量正确方法

## 🔴 错误信息

```
后置脚本错误: createNum is not defined
```

**原因：** 变量 `createNum` 未定义或获取方式不正确

---

## ✅ 正确方法

### 方法1：获取环境变量（推荐）

```javascript
// 获取环境变量 createNum
var createNum = pm.environment.get("createNum");

// 检查变量是否存在
if (createNum) {
    // 转换为数字并加 210
    var newValue = parseInt(createNum) + 210;
    
    // 保存回环境变量
    pm.environment.set("createNum", newValue);
    
    console.log("计算完成：" + createNum + " + 210 = " + newValue);
} else {
    console.log("警告：createNum 环境变量不存在");
}
```

### 方法2：获取全局变量

```javascript
// 如果 createNum 是全局变量
var createNum = pm.globals.get("createNum");

if (createNum) {
    var newValue = parseInt(createNum) + 210;
    pm.globals.set("createNum", newValue);
}
```

### 方法3：获取临时变量

```javascript
// 如果 createNum 是临时变量
var createNum = pm.variables.get("createNum");

if (createNum) {
    var newValue = parseInt(createNum) + 210;
    pm.variables.set("createNum", newValue);
}
```

---

## 🔍 常见错误

### 错误1：使用双花括号

```javascript
// ❌ 错误：双花括号是模板语法，不是脚本语法
var createNum = pm.environment.get("{{createNum}}");

// ✅ 正确：直接使用变量名
var createNum = pm.environment.get("createNum");
```

### 错误2：变量名拼写错误

```javascript
// ❌ 错误：变量名拼写错误
var createNum = pm.environment.get("createNum");  // 实际变量名可能是 create_num

// ✅ 正确：使用实际的变量名
var createNum = pm.environment.get("create_num");
```

### 错误3：变量不存在

```javascript
// ❌ 错误：没有判断变量是否存在
var createNum = pm.environment.get("createNum");
var newValue = parseInt(createNum) + 210;  // 如果 createNum 不存在，会报错

// ✅ 正确：添加判断
var createNum = pm.environment.get("createNum");
if (createNum) {
    var newValue = parseInt(createNum) + 210;
    pm.environment.set("createNum", newValue);
}
```

---

## 🎯 完整脚本（推荐）

```javascript
// 获取环境变量 createNum
var createNum = pm.environment.get("createNum");

// 检查变量是否存在
if (createNum !== null && createNum !== undefined && createNum !== "") {
    // 转换为数字并加 210
    var newValue = parseInt(createNum) + 210;
    
    // 保存回环境变量
    pm.environment.set("createNum", newValue);
    
    // 打印结果
    console.log("原值：" + createNum);
    console.log("新值：" + newValue);
} else {
    console.log("警告：createNum 环境变量不存在或为空");
    console.log("提示：请先在环境变量中设置 createNum");
    
    // 可选：设置默认值
    // pm.environment.set("createNum", 0);
}
```

---

## 🔧 调试方法

### 步骤1：检查变量是否存在

```javascript
// 检查环境变量
var createNum = pm.environment.get("createNum");
console.log("createNum 值：" + createNum);
console.log("createNum 类型：" + typeof createNum);
console.log("createNum 是否存在：" + (createNum !== null && createNum !== undefined));
```

### 步骤2：列出所有环境变量

```javascript
// 获取所有环境变量（需要遍历）
// 注意：Apifox 可能不支持直接列出所有变量
// 建议在 Apifox 界面中查看环境变量列表
```

### 步骤3：检查变量名

```javascript
// 尝试不同的变量名
var createNum1 = pm.environment.get("createNum");
var createNum2 = pm.environment.get("create_num");
var createNum3 = pm.environment.get("createNum");

console.log("createNum: " + createNum1);
console.log("create_num: " + createNum2);
console.log("createNum: " + createNum3);
```

---

## 📋 检查清单

### 在 Apifox 中检查

1. **确认变量存在**
   - 打开 Apifox
   - 进入「环境管理」
   - 确认 `createNum` 变量是否存在
   - 检查变量名拼写是否正确

2. **确认环境已选择**
   - 确认当前使用的是正确的环境
   - 变量在哪个环境中，就使用哪个环境

3. **确认变量类型**
   - 检查变量值是字符串还是数字
   - 如果是字符串，需要使用 `parseInt()` 转换

---

## 🎯 你的具体脚本

**直接复制使用：**

```javascript
// 获取环境变量 createNum
var createNum = pm.environment.get("createNum");

// 检查变量是否存在
if (createNum) {
    // 转换为数字并加 210
    var newValue = parseInt(createNum) + 210;
    
    // 保存回环境变量
    pm.environment.set("createNum", newValue);
    
    console.log("计算完成：" + createNum + " + 210 = " + newValue);
} else {
    console.log("错误：createNum 环境变量不存在");
    console.log("请先在 Apifox 环境变量中设置 createNum");
}
```

---

## ⚠️ 注意事项

1. **变量名区分大小写**
   ```javascript
   // createNum 和 CreateNum 是不同的变量
   pm.environment.get("createNum")  // 正确
   pm.environment.get("CreateNum")  // 错误（如果变量名是小写）
   ```

2. **不要使用双花括号**
   ```javascript
   // ❌ 错误
   pm.environment.get("{{createNum}}")
   
   // ✅ 正确
   pm.environment.get("createNum")
   ```

3. **检查环境是否选择**
   - 确保在正确的环境中运行
   - 变量必须在当前选择的环境中

---

## 🔍 故障排查步骤

### 步骤1：检查变量是否存在

在 Apifox 中：
1. 打开「环境管理」
2. 选择当前使用的环境
3. 查看是否有 `createNum` 变量
4. 确认变量名拼写正确

### 步骤2：检查变量值

```javascript
// 添加调试代码
var createNum = pm.environment.get("createNum");
console.log("变量值：" + createNum);
console.log("变量类型：" + typeof createNum);
```

### 步骤3：尝试不同的获取方式

```javascript
// 尝试环境变量
var createNum = pm.environment.get("createNum");

// 如果不存在，尝试全局变量
if (!createNum) {
    createNum = pm.globals.get("createNum");
}

// 如果还是不存在，尝试临时变量
if (!createNum) {
    createNum = pm.variables.get("createNum");
}

console.log("最终获取的值：" + createNum);
```

---

## ✅ 完整解决方案

**推荐脚本（带完整错误处理）：**

```javascript
// 方法1：尝试从环境变量获取
var createNum = pm.environment.get("createNum");

// 方法2：如果环境变量不存在，尝试全局变量
if (!createNum) {
    createNum = pm.globals.get("createNum");
    console.log("从全局变量获取 createNum");
}

// 方法3：如果还是不存在，尝试临时变量
if (!createNum) {
    createNum = pm.variables.get("createNum");
    console.log("从临时变量获取 createNum");
}

// 检查变量是否存在
if (createNum !== null && createNum !== undefined && createNum !== "") {
    // 转换为数字并加 210
    var numValue = parseInt(createNum);
    
    // 检查是否为有效数字
    if (!isNaN(numValue)) {
        var newValue = numValue + 210;
        
        // 保存回环境变量（根据来源决定保存位置）
        pm.environment.set("createNum", newValue);
        
        console.log("计算完成：" + createNum + " + 210 = " + newValue);
    } else {
        console.log("错误：createNum 不是有效数字，值为：" + createNum);
    }
} else {
    console.log("错误：createNum 变量不存在");
    console.log("请先在 Apifox 中设置 createNum 环境变量");
    
    // 可选：设置默认值
    // pm.environment.set("createNum", 0);
}
```

---

## 📚 相关资源

- **Apifox 环境变量文档**：https://apifox.com/help/app/environment/
- **Apifox 脚本文档**：https://apifox.com/help/app/scripts/

---

**记住：不要使用双花括号，直接使用变量名！** 🚀
