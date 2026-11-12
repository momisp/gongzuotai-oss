# Apifox 批量注册登录指南

## 🎯 目标

批量注册账号，然后批量登录，用于接口自动化测试。

---

## 🚀 方法1：使用数据驱动（推荐）

### 步骤1：准备数据文件

**创建 CSV 文件 `账号数据.csv`：**

```csv
username,password,phone,email
test001,123456,13800000001,test001@test.com
test002,123456,13800000002,test002@test.com
test003,123456,13800000003,test003@test.com
test004,123456,13800000004,test004@test.com
test005,123456,13800000005,test005@test.com
```

**或创建 JSON 文件 `账号数据.json`：**

```json
[
  {
    "username": "test001",
    "password": "123456",
    "phone": "13800000001",
    "email": "test001@test.com"
  },
  {
    "username": "test002",
    "password": "123456",
    "phone": "13800000002",
    "email": "test002@test.com"
  }
]
```

### 步骤2：在 Apifox 中配置数据驱动

1. **创建测试场景**
   - Apifox → 自动化测试 → 测试场景
   - 点击「+ 创建场景」

2. **添加注册接口**
   - 添加「注册接口」到场景
   - 配置请求参数

3. **配置数据驱动**
   - 点击场景设置
   - 选择「数据驱动」
   - 上传 CSV 或 JSON 文件
   - 配置数据映射

4. **运行场景**
   - 点击「运行」
   - 选择数据文件
   - 执行批量注册

---

## 🚀 方法2：使用脚本动态生成（最灵活）

### 步骤1：创建注册接口

**接口配置：**
- 接口路径：`POST /api/register`
- 请求参数：
  ```json
  {
    "username": "{{username}}",
    "password": "{{password}}",
    "phone": "{{phone}}",
    "email": "{{email}}"
  }
  ```

### 步骤2：添加前置脚本（生成账号信息）

**前置脚本代码：**

```javascript
// 获取计数器（如果不存在，初始化为 1）
var counter = pm.environment.get("register_counter");
if (!counter) {
    counter = 1;
} else {
    counter = parseInt(counter) + 1;
}

// 生成账号信息
var timestamp = Date.now();
var username = "test" + String(counter).padStart(3, '0');
var password = "123456";
var phone = "138" + String(10000000 + counter).padStart(8, '0');
var email = username + "@test.com";

// 设置到环境变量
pm.environment.set("register_counter", counter);
pm.environment.set("username", username);
pm.environment.set("password", password);
pm.environment.set("phone", phone);
pm.environment.set("email", email);

// 打印日志
console.log("=== 生成账号信息 ===");
console.log("账号序号：" + counter);
console.log("用户名：" + username);
console.log("密码：" + password);
console.log("手机号：" + phone);
console.log("邮箱：" + email);
```

### 步骤3：添加后置脚本（保存注册结果）

**后置脚本代码：**

```javascript
// 检查注册是否成功
if (pm.response.code === 200) {
    var response = pm.response.json();
    
    // 如果注册成功，保存账号信息
    if (response.code === 0 || response.success) {
        var username = pm.environment.get("username");
        var password = pm.environment.get("password");
        
        // 保存到全局变量（用于后续登录）
        var accountList = pm.globals.get("registered_accounts");
        if (!accountList) {
            accountList = [];
        } else {
            accountList = JSON.parse(accountList);
        }
        
        // 添加新账号
        accountList.push({
            username: username,
            password: password
        });
        
        // 保存回去
        pm.globals.set("registered_accounts", JSON.stringify(accountList));
        
        console.log("✅ 注册成功：" + username);
        console.log("已注册账号数：" + accountList.length);
    } else {
        console.log("❌ 注册失败：" + response.message);
    }
} else {
    console.log("❌ 请求失败，状态码：" + pm.response.code);
}
```

### 步骤4：创建循环场景

**场景结构：**
```
批量注册场景
├── 注册接口（带前置/后置脚本）
├── 延迟（可选，避免请求过快）
└── 循环设置（循环 10 次）
```

**配置循环：**
- 在场景设置中选择「循环执行」
- 设置循环次数（如：10 次）
- 设置循环间隔（如：1 秒）

---

## 🚀 方法3：使用登录接口批量登录已注册账号

### 步骤1：准备账号列表

**创建账号数据文件 `账号列表.csv`：**

```csv
username,password
test001,123456
test002,123456
test003,123456
```

### 步骤2：创建登录场景（数据驱动）

1. **创建测试场景**
   - 添加「登录接口」

2. **配置数据驱动**
   - 上传 `账号列表.csv`
   - 映射字段：
     - `username` → `{{username}}`
     - `password` → `{{password}}`

3. **添加后置脚本（保存 Token）**

```javascript
// 检查登录是否成功
if (pm.response.code === 200) {
    var response = pm.response.json();
    
    if (response.code === 0 || response.success) {
        // 保存 Token
        var token = response.data.token || response.data.accessToken;
        var username = pm.environment.get("username");
        
        // 保存 Token（使用用户名作为 key）
        pm.environment.set("token_" + username, token);
        
        console.log("✅ 登录成功：" + username);
        console.log("Token：" + token);
    }
}
```

### 步骤3：运行批量登录

- 运行场景
- 选择数据文件
- 执行批量登录

---

## 🔧 完整示例：注册 + 登录流程

### 场景结构

```
批量注册登录场景
├── 1. 注册接口
│   ├── 前置脚本：生成账号信息
│   └── 后置脚本：保存注册结果
├── 2. 延迟（1秒）
├── 3. 登录接口
│   ├── 前置脚本：获取账号信息
│   └── 后置脚本：保存 Token
└── 循环设置：10 次
```

### 注册接口前置脚本

```javascript
// 生成账号信息
var counter = parseInt(pm.environment.get("register_counter") || "0") + 1;
var timestamp = Date.now();
var username = "test" + String(counter).padStart(3, '0');
var password = "123456";
var phone = "138" + String(10000000 + counter).padStart(8, '0');
var email = username + "@test.com";

pm.environment.set("register_counter", counter);
pm.environment.set("username", username);
pm.environment.set("password", password);
pm.environment.set("phone", phone);
pm.environment.set("email", email);

console.log("生成账号：" + username);
```

### 注册接口后置脚本

```javascript
if (pm.response.code === 200) {
    var response = pm.response.json();
    if (response.code === 0) {
        var username = pm.environment.get("username");
        console.log("✅ 注册成功：" + username);
    }
}
```

### 登录接口前置脚本

```javascript
// 使用刚才注册的账号登录
var username = pm.environment.get("username");
var password = pm.environment.get("password");

console.log("准备登录：" + username);
```

### 登录接口后置脚本

```javascript
if (pm.response.code === 200) {
    var response = pm.response.json();
    if (response.code === 0) {
        var token = response.data.token;
        var username = pm.environment.get("username");
        
        // 保存 Token
        pm.environment.set("token_" + username, token);
        
        console.log("✅ 登录成功：" + username);
        console.log("Token：" + token);
    }
}
```

---

## 📋 使用步骤总结

### 方法1：数据驱动（适合已有账号列表）

1. 准备 CSV/JSON 文件
2. 创建测试场景
3. 配置数据驱动
4. 运行场景

### 方法2：脚本生成（适合动态生成账号）

1. 创建注册接口
2. 添加前置脚本（生成账号）
3. 添加后置脚本（保存结果）
4. 配置循环执行
5. 运行场景

### 方法3：批量登录（适合已有账号）

1. 准备账号列表文件
2. 创建登录场景
3. 配置数据驱动
4. 添加后置脚本（保存 Token）
5. 运行场景

---

## ⚠️ 注意事项

### 1. 账号唯一性

- 确保用户名/手机号/邮箱唯一
- 使用时间戳或随机数
- 检查注册接口返回的错误

### 2. 请求频率

- 添加延迟避免请求过快
- 建议间隔 1-2 秒
- 避免触发限流

### 3. 错误处理

- 检查注册/登录是否成功
- 记录失败的账号
- 重试机制（可选）

### 4. 数据保存

- 使用环境变量保存账号信息
- 使用全局变量保存账号列表
- 导出账号列表到文件（可选）

---

## 💡 高级技巧

### 技巧1：保存账号到文件

**后置脚本：**

```javascript
// 保存账号到全局变量
var accountList = pm.globals.get("registered_accounts") || "[]";
accountList = JSON.parse(accountList);
accountList.push({
    username: pm.environment.get("username"),
    password: pm.environment.get("password")
});
pm.globals.set("registered_accounts", JSON.stringify(accountList));
```

### 技巧2：随机生成账号

```javascript
// 生成随机用户名
var randomNum = Math.floor(Math.random() * 10000);
var username = "test" + String(randomNum).padStart(4, '0');

// 生成随机手机号
var randomPhone = "138" + String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
```

### 技巧3：批量导出账号

**场景后置脚本：**

```javascript
// 获取所有注册的账号
var accountList = pm.globals.get("registered_accounts");
if (accountList) {
    accountList = JSON.parse(accountList);
    console.log("=== 已注册账号列表 ===");
    accountList.forEach(function(account, index) {
        console.log((index + 1) + ". " + account.username + " / " + account.password);
    });
}
```

---

## ✅ 快速检查清单

### 注册场景

- [ ] 注册接口已创建
- [ ] 前置脚本已添加（生成账号）
- [ ] 后置脚本已添加（保存结果）
- [ ] 循环次数已设置
- [ ] 延迟已配置（可选）

### 登录场景

- [ ] 登录接口已创建
- [ ] 数据文件已准备
- [ ] 数据驱动已配置
- [ ] 后置脚本已添加（保存 Token）
- [ ] 账号列表已准备

---

**记住：先注册，再登录，最后保存 Token！** 🚀
