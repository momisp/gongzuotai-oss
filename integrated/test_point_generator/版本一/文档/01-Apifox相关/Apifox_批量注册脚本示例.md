# Apifox 批量注册脚本示例

## 🎯 快速开始

直接复制以下脚本到 Apifox 中使用。

---

## 📋 方案1：简单计数器生成账号（推荐）

### 前置脚本（生成账号信息）

```javascript
// 获取计数器（如果不存在，初始化为 0）
var counter = pm.environment.get("register_counter");
if (!counter) {
    counter = 0;
} else {
    counter = parseInt(counter);
}

// 计数器加 1
counter = counter + 1;

// 生成账号信息
var username = "test" + String(counter).padStart(3, '0');  // test001, test002...
var password = "123456";
var phone = "138" + String(10000000 + counter).padStart(8, '0');  // 13800000001...
var email = username + "@test.com";

// 保存计数器
pm.environment.set("register_counter", counter);

// 设置账号信息到环境变量
pm.environment.set("username", username);
pm.environment.set("password", password);
pm.environment.set("phone", phone);
pm.environment.set("email", email);

// 打印日志
console.log("=== 生成账号信息 ===");
console.log("序号：" + counter);
console.log("用户名：" + username);
console.log("密码：" + password);
console.log("手机号：" + phone);
console.log("邮箱：" + email);
```

### 后置脚本（保存注册结果）

```javascript
// 检查注册是否成功
if (pm.response.code === 200) {
    var response = pm.response.json();
    
    // 根据实际接口返回格式调整
    if (response.code === 0 || response.success || response.status === 200) {
        var username = pm.environment.get("username");
        var password = pm.environment.get("password");
        
        // 保存账号到全局变量列表
        var accountList = pm.globals.get("registered_accounts");
        if (!accountList) {
            accountList = [];
        } else {
            accountList = JSON.parse(accountList);
        }
        
        // 添加新账号
        accountList.push({
            username: username,
            password: password,
            phone: pm.environment.get("phone"),
            email: pm.environment.get("email")
        });
        
        // 保存回去
        pm.globals.set("registered_accounts", JSON.stringify(accountList));
        
        console.log("✅ 注册成功：" + username);
        console.log("已注册账号数：" + accountList.length);
    } else {
        console.log("❌ 注册失败：" + (response.message || response.msg || "未知错误"));
    }
} else {
    console.log("❌ 请求失败，状态码：" + pm.response.code);
}
```

---

## 📋 方案2：使用时间戳生成唯一账号

### 前置脚本

```javascript
// 使用时间戳生成唯一账号
var timestamp = Date.now();
var randomNum = Math.floor(Math.random() * 1000);

// 生成账号信息
var username = "test" + timestamp + randomNum;
var password = "123456";
var phone = "138" + String(10000000 + Math.floor(Math.random() * 100000000)).padStart(8, '0');
var email = username + "@test.com";

// 设置到环境变量
pm.environment.set("username", username);
pm.environment.set("password", password);
pm.environment.set("phone", phone);
pm.environment.set("email", email);

console.log("生成账号：" + username);
```

---

## 📋 方案3：批量登录已注册账号

### 前置脚本（从列表获取账号）

```javascript
// 获取账号列表
var accountList = pm.globals.get("registered_accounts");
if (!accountList) {
    console.log("❌ 没有已注册的账号列表");
    return;
}

accountList = JSON.parse(accountList);

// 获取当前登录索引（如果不存在，初始化为 0）
var loginIndex = pm.environment.get("login_index");
if (!loginIndex) {
    loginIndex = 0;
} else {
    loginIndex = parseInt(loginIndex);
}

// 检查是否还有账号
if (loginIndex >= accountList.length) {
    console.log("❌ 所有账号已登录完成");
    return;
}

// 获取当前账号
var account = accountList[loginIndex];
pm.environment.set("username", account.username);
pm.environment.set("password", account.password);

// 索引加 1
loginIndex = loginIndex + 1;
pm.environment.set("login_index", loginIndex);

console.log("=== 准备登录 ===");
console.log("账号序号：" + (loginIndex));
console.log("用户名：" + account.username);
```

### 后置脚本（保存 Token）

```javascript
// 检查登录是否成功
if (pm.response.code === 200) {
    var response = pm.response.json();
    
    if (response.code === 0 || response.success) {
        var token = response.data.token || response.data.accessToken || response.data.token;
        var username = pm.environment.get("username");
        
        // 保存 Token（使用用户名作为 key）
        pm.environment.set("token_" + username, token);
        
        // 也可以保存到账号列表
        var accountList = pm.globals.get("registered_accounts");
        if (accountList) {
            accountList = JSON.parse(accountList);
            var loginIndex = parseInt(pm.environment.get("login_index") || "0") - 1;
            if (accountList[loginIndex]) {
                accountList[loginIndex].token = token;
                pm.globals.set("registered_accounts", JSON.stringify(accountList));
            }
        }
        
        console.log("✅ 登录成功：" + username);
        console.log("Token：" + token);
    } else {
        console.log("❌ 登录失败：" + (response.message || response.msg));
    }
} else {
    console.log("❌ 请求失败，状态码：" + pm.response.code);
}
```

---

## 🔧 完整场景配置

### 场景1：批量注册（循环 10 次）

**场景结构：**
```
批量注册场景
├── 注册接口
│   ├── 前置脚本：生成账号信息
│   └── 后置脚本：保存注册结果
└── 延迟：1 秒
```

**循环设置：**
- 循环次数：10
- 循环间隔：1 秒

### 场景2：批量登录已注册账号

**场景结构：**
```
批量登录场景
├── 登录接口
│   ├── 前置脚本：获取账号信息
│   └── 后置脚本：保存 Token
└── 延迟：1 秒
```

**循环设置：**
- 循环次数：等于已注册账号数
- 循环间隔：1 秒

---

## 📝 接口请求参数配置

### 注册接口参数

```json
{
  "username": "{{username}}",
  "password": "{{password}}",
  "phone": "{{phone}}",
  "email": "{{email}}"
}
```

### 登录接口参数

```json
{
  "username": "{{username}}",
  "password": "{{password}}"
}
```

---

## ✅ 使用步骤

### 步骤1：创建注册接口

1. 在 Apifox 中创建「注册接口」
2. 配置请求参数（使用变量：`{{username}}`、`{{password}}` 等）
3. 添加前置脚本（生成账号）
4. 添加后置脚本（保存结果）

### 步骤2：创建测试场景

1. 创建「批量注册场景」
2. 添加注册接口到场景
3. 配置循环执行（10 次）
4. 配置延迟（1 秒）

### 步骤3：运行场景

1. 运行「批量注册场景」
2. 查看控制台日志
3. 检查注册结果

### 步骤4：批量登录（可选）

1. 创建「批量登录场景」
2. 添加登录接口
3. 添加前置脚本（获取账号）
4. 添加后置脚本（保存 Token）
5. 运行场景

---

## 🔍 调试技巧

### 查看已注册账号列表

**在场景后置脚本中添加：**

```javascript
var accountList = pm.globals.get("registered_accounts");
if (accountList) {
    accountList = JSON.parse(accountList);
    console.log("=== 已注册账号列表 ===");
    accountList.forEach(function(account, index) {
        console.log((index + 1) + ". " + account.username + " / " + account.password);
    });
}
```

### 重置计数器

**在场景前置脚本中添加：**

```javascript
// 重置计数器（如果需要重新开始）
pm.environment.set("register_counter", 0);
pm.environment.set("login_index", 0);
```

---

## ⚠️ 常见问题

### 问题1：账号重复

**解决：**
- 使用时间戳 + 随机数
- 检查注册接口返回的错误信息
- 增加计数器初始值

### 问题2：Token 保存失败

**解决：**
- 检查登录接口返回的 Token 字段名
- 根据实际返回格式调整脚本
- 查看控制台日志

### 问题3：循环不执行

**解决：**
- 检查场景循环设置
- 检查前置脚本是否有错误
- 查看控制台错误信息

---

**记住：先测试单个接口，再配置批量场景！** 🚀
