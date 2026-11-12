# Apifox 环境变量获取示例

## 🎯 你的需求：获取 createNum 并加 210

### 正确脚本

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
}
```

---

## 🔍 常见错误对比

### ❌ 错误写法

```javascript
// 错误1：使用双花括号
var createNum = pm.environment.get("{{createNum}}");

// 错误2：变量未定义就使用
var newValue = createNum + 210;  // createNum 未定义

// 错误3：没有检查变量是否存在
var createNum = pm.environment.get("createNum");
var newValue = parseInt(createNum) + 210;  // 如果 createNum 不存在会报错
```

### ✅ 正确写法

```javascript
// 正确：直接使用变量名
var createNum = pm.environment.get("createNum");

// 正确：检查变量是否存在
if (createNum) {
    var newValue = parseInt(createNum) + 210;
    pm.environment.set("createNum", newValue);
}
```

---

## 📋 完整脚本（推荐）

**直接复制使用：**

```javascript
// 获取环境变量 createNum
var createNum = pm.environment.get("createNum");

// 检查变量是否存在
if (createNum !== null && createNum !== undefined && createNum !== "") {
    // 转换为数字并加 210
    var numValue = parseInt(createNum);
    
    // 检查是否为有效数字
    if (!isNaN(numValue)) {
        var newValue = numValue + 210;
        
        // 保存回环境变量
        pm.environment.set("createNum", newValue);
        
        console.log("原值：" + createNum);
        console.log("新值：" + newValue);
    } else {
        console.log("错误：createNum 不是有效数字，值为：" + createNum);
    }
} else {
    console.log("错误：createNum 环境变量不存在或为空");
    console.log("请先在 Apifox 环境变量中设置 createNum");
}
```

---

## 🔧 在 Apifox 中设置环境变量

### 步骤1：打开环境管理

1. 打开 Apifox
2. 点击左侧「环境管理」
3. 选择或创建环境（如：测试环境）

### 步骤2：添加变量

1. 点击「添加变量」
2. 填写：
   ```
   变量名：createNum
   变量值：100（或你的初始值）
   变量类型：字符串（或数字）
   ```
3. 保存

### 步骤3：使用变量

1. 在接口中使用：`{{createNum}}`
2. 在脚本中获取：`pm.environment.get("createNum")`

---

## 💡 调试技巧

### 添加调试日志

```javascript
// 获取变量
var createNum = pm.environment.get("createNum");

// 打印调试信息
console.log("=== 调试信息 ===");
console.log("变量名：createNum");
console.log("变量值：" + createNum);
console.log("变量类型：" + typeof createNum);
console.log("是否为 null：" + (createNum === null));
console.log("是否为 undefined：" + (createNum === undefined));
console.log("是否为空字符串：" + (createNum === ""));

// 如果变量存在，进行计算
if (createNum) {
    var newValue = parseInt(createNum) + 210;
    pm.environment.set("createNum", newValue);
    console.log("计算完成：" + createNum + " + 210 = " + newValue);
} else {
    console.log("错误：createNum 不存在");
}
```

---

## ✅ 快速修复

**如果你的脚本报错 "createNum is not defined"：**

1. **检查变量名**
   - 确认变量名是 `createNum`（注意大小写）
   - 在 Apifox 环境变量中查看实际变量名

2. **使用正确的获取方式**
   ```javascript
   // ✅ 正确
   var createNum = pm.environment.get("createNum");
   
   // ❌ 错误
   var createNum = pm.environment.get("{{createNum}}");
   ```

3. **添加判断**
   ```javascript
   var createNum = pm.environment.get("createNum");
   if (createNum) {
       // 使用变量
   }
   ```

---

**记住：直接使用变量名，不要用双花括号！** 🚀
