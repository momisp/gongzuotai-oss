# Apifox 脚本编写指南

## 🎯 变量操作

### 获取变量并计算

**需求：** 获取 `createNum` 变量，加 210，然后保存回去

**脚本代码：**

```javascript
// 获取环境变量 createNum
var createNum = pm.environment.get("createNum");

// 转换为数字并加 210
var newValue = parseInt(createNum) + 210;

// 保存回环境变量
pm.environment.set("createNum", newValue);

// 可选：打印日志查看结果
console.log("原值：" + createNum);
console.log("新值：" + newValue);
```

---

## 📝 完整示例

### 示例1：基础版本

```javascript
// 获取变量
var createNum = pm.environment.get("createNum");

// 加 210
var result = parseInt(createNum) + 210;

// 保存回去
pm.environment.set("createNum", result);
```

### 示例2：带错误处理

```javascript
// 获取变量
var createNum = pm.environment.get("createNum");

// 检查变量是否存在
if (createNum) {
    // 转换为数字并加 210
    var result = parseInt(createNum) + 210;
    
    // 保存回去
    pm.environment.set("createNum", result);
    
    console.log("计算完成：" + createNum + " + 210 = " + result);
} else {
    console.log("警告：createNum 变量不存在");
    // 如果变量不存在，可以设置默认值
    pm.environment.set("createNum", 210);
}
```

### 示例3：使用 Number() 转换

```javascript
// 获取变量
var createNum = pm.environment.get("createNum");

// 转换为数字（Number() 比 parseInt() 更严格）
var numValue = Number(createNum);

// 检查是否为有效数字
if (!isNaN(numValue)) {
    // 加 210
    var result = numValue + 210;
    
    // 保存回去
    pm.environment.set("createNum", result);
    
    console.log("原值：" + createNum);
    console.log("新值：" + result);
} else {
    console.log("错误：createNum 不是有效数字");
}
```

---

## 🔍 常用操作

### 1. 获取环境变量

```javascript
// 获取环境变量
var value = pm.environment.get("变量名");

// 获取全局变量
var value = pm.globals.get("变量名");

// 获取临时变量
var value = pm.variables.get("变量名");
```

### 2. 设置环境变量

```javascript
// 设置环境变量
pm.environment.set("变量名", "值");

// 设置全局变量
pm.globals.set("变量名", "值");

// 设置临时变量
pm.variables.set("变量名", "值");
```

### 3. 数学运算

```javascript
// 加法
var result = parseInt(value) + 210;

// 减法
var result = parseInt(value) - 210;

// 乘法
var result = parseInt(value) * 2;

// 除法
var result = parseInt(value) / 2;
```

### 4. 类型转换

```javascript
// 字符串转数字
var num = parseInt("123");      // 123
var num = Number("123");         // 123
var num = parseFloat("123.45");  // 123.45

// 数字转字符串
var str = String(123);           // "123"
var str = 123.toString();        // "123"
```

---

## 💡 你的具体需求

**脚本代码（推荐）：**

```javascript
// 获取 createNum 变量
var createNum = pm.environment.get("createNum");

// 转换为数字并加 210
var newValue = parseInt(createNum) + 210;

// 保存回环境变量
pm.environment.set("createNum", newValue);

// 打印结果（可选，用于调试）
console.log("createNum: " + createNum + " + 210 = " + newValue);
```

**如果变量可能不存在，使用这个版本：**

```javascript
// 获取 createNum 变量
var createNum = pm.environment.get("createNum");

// 检查变量是否存在
if (createNum !== null && createNum !== undefined) {
    // 转换为数字并加 210
    var newValue = parseInt(createNum) + 210;
    
    // 保存回环境变量
    pm.environment.set("createNum", newValue);
    
    console.log("计算完成：" + createNum + " + 210 = " + newValue);
} else {
    console.log("警告：createNum 变量不存在，设置为默认值 210");
    pm.environment.set("createNum", 210);
}
```

---

## ⚠️ 注意事项

1. **类型转换**
   - 环境变量通常是字符串类型
   - 需要转换为数字才能进行数学运算
   - 使用 `parseInt()` 或 `Number()` 转换

2. **变量不存在**
   - 如果变量不存在，`get()` 返回 `null` 或 `undefined`
   - 建议添加判断，避免错误

3. **数字格式**
   - 确保变量值是有效的数字格式
   - 如果包含非数字字符，`parseInt()` 会返回 `NaN`

---

## 🔍 调试技巧

### 打印变量值

```javascript
console.log("createNum 原值：" + createNum);
console.log("createNum 类型：" + typeof createNum);
console.log("计算结果：" + newValue);
```

### 检查变量类型

```javascript
var createNum = pm.environment.get("createNum");
console.log("变量值：" + createNum);
console.log("变量类型：" + typeof createNum);
console.log("是否为数字：" + !isNaN(parseInt(createNum)));
```

---

## 📚 相关资源

- **Apifox 脚本文档**：https://apifox.com/help/app/scripts/
- **Postman 脚本参考**：https://learning.postman.com/docs/writing-scripts/script-references/postman-sandbox-api-reference/

---

**记住：环境变量是字符串类型，进行数学运算前需要转换为数字！** 🚀
