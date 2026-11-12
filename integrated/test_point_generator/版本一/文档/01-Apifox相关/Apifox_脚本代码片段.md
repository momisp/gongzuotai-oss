# Apifox 脚本代码片段集合

## 🎯 变量操作代码片段

### 1. 获取变量并加 210

**你的需求：获取 createNum，加 210，保存回去**

```javascript
// 获取环境变量 createNum
var createNum = pm.environment.get("createNum");

// 转换为数字并加 210
var newValue = parseInt(createNum) + 210;

// 保存回环境变量
pm.environment.set("createNum", newValue);
```

---

## 📋 常用代码片段

### 获取环境变量

```javascript
// 获取环境变量
var value = pm.environment.get("变量名");

// 获取全局变量
var value = pm.globals.get("变量名");

// 获取临时变量
var value = pm.variables.get("变量名");
```

### 设置环境变量

```javascript
// 设置环境变量
pm.environment.set("变量名", "值");

// 设置全局变量
pm.globals.set("变量名", "值");

// 设置临时变量
pm.variables.set("变量名", "值");
```

### 数学运算

```javascript
// 加法
var result = parseInt(pm.environment.get("num")) + 210;

// 减法
var result = parseInt(pm.environment.get("num")) - 210;

// 乘法
var result = parseInt(pm.environment.get("num")) * 2;

// 除法
var result = parseInt(pm.environment.get("num")) / 2;
```

### 字符串操作

```javascript
// 字符串拼接
var result = pm.environment.get("prefix") + "suffix";

// 字符串替换
var result = pm.environment.get("text").replace("old", "new");

// 字符串截取
var result = pm.environment.get("text").substring(0, 10);
```

### 响应处理

```javascript
// 获取响应状态码
var statusCode = pm.response.code;

// 获取响应体
var responseBody = pm.response.json();

// 获取响应头
var contentType = pm.response.headers.get("Content-Type");

// 检查状态码
if (pm.response.code === 200) {
    console.log("请求成功");
}

// 检查响应体内容
if (pm.response.text().includes("success")) {
    console.log("响应包含 success");
}
```

### JSON 处理

```javascript
// 解析 JSON 响应
var jsonData = pm.response.json();

// 获取 JSON 字段值
var userId = jsonData.data.userId;

// 设置到环境变量
pm.environment.set("userId", userId);
```

---

## 🔧 实用脚本示例

### 示例1：从响应中提取值并计算

```javascript
// 从响应中获取数量
var response = pm.response.json();
var count = response.data.count;

// 加 210
var newCount = parseInt(count) + 210;

// 保存到环境变量
pm.environment.set("createNum", newCount);
```

### 示例2：累加操作

```javascript
// 获取当前值
var current = parseInt(pm.environment.get("createNum") || "0");

// 加 210
var newValue = current + 210;

// 保存回去
pm.environment.set("createNum", newValue);

console.log("累加完成：" + current + " + 210 = " + newValue);
```

### 示例3：条件判断

```javascript
// 获取变量
var createNum = pm.environment.get("createNum");

// 判断并计算
if (createNum && !isNaN(parseInt(createNum))) {
    var newValue = parseInt(createNum) + 210;
    pm.environment.set("createNum", newValue);
    console.log("计算成功：" + newValue);
} else {
    console.log("createNum 不是有效数字");
    pm.environment.set("createNum", 210);
}
```

---

## 💡 你的具体脚本

**直接复制使用：**

```javascript
// 获取 createNum 变量
var createNum = pm.environment.get("createNum");

// 转换为数字并加 210
var newValue = parseInt(createNum) + 210;

// 保存回环境变量
pm.environment.set("createNum", newValue);

// 打印结果（可选）
console.log("createNum: " + createNum + " + 210 = " + newValue);
```

**粘贴到 Apifox 后置脚本编辑器中即可！**

---

## ⚠️ 常见错误

### 错误1：忘记类型转换

```javascript
// ❌ 错误：字符串拼接
var result = pm.environment.get("createNum") + 210;  // "100210"

// ✅ 正确：数字运算
var result = parseInt(pm.environment.get("createNum")) + 210;  // 310
```

### 错误2：变量不存在

```javascript
// ❌ 错误：没有判断
var createNum = pm.environment.get("createNum");
var result = parseInt(createNum) + 210;  // 如果 createNum 不存在，会出错

// ✅ 正确：添加判断
var createNum = pm.environment.get("createNum");
if (createNum) {
    var result = parseInt(createNum) + 210;
    pm.environment.set("createNum", result);
}
```

---

**记住：使用 parseInt() 或 Number() 将字符串转换为数字！** 🚀
