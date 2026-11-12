# SQL 常用查询语句速查

## 🎯 查询最新记录

### 基本格式

```sql
SELECT * 
FROM 表名 
WHERE 条件 
ORDER BY 排序字段 DESC 
LIMIT 1;
```

### 你的需求

```sql
SELECT * 
FROM `yyz_uc`.`uc_sms_log` 
WHERE `phone` = 17790000010 
ORDER BY id DESC 
LIMIT 1;
```

---

## 📋 常用查询模式

### 1. 查询最新一条

```sql
SELECT * FROM 表名 ORDER BY id DESC LIMIT 1;
```

### 2. 查询最新 N 条

```sql
SELECT * FROM 表名 ORDER BY id DESC LIMIT 10;
```

### 3. 按条件查询最新

```sql
SELECT * 
FROM 表名 
WHERE 条件 
ORDER BY id DESC 
LIMIT 1;
```

### 4. 按时间查询最新

```sql
SELECT * 
FROM 表名 
WHERE 条件 
ORDER BY create_time DESC 
LIMIT 1;
```

---

## 🔧 ORDER BY 说明

### DESC（降序）

```sql
ORDER BY id DESC  -- 从大到小（最新在前）
```

### ASC（升序）

```sql
ORDER BY id ASC   -- 从小到大（最旧在前）
```

---

## 💡 关键点

1. **ORDER BY**：排序
2. **DESC**：降序（最新的在前）
3. **LIMIT 1**：只取一条

---

**记住：ORDER BY DESC + LIMIT 1 = 最新记录！** 🚀
