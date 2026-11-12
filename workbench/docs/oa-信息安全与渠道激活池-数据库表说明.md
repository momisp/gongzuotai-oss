# OA 信息安全 & 渠道激活池 · 数据库表说明

> 环境：测试库 `192.168.2.226` · 库名 `oa`  
> 更新时间：2026-08-27  
> 用途：功能测试 / 造数 / Apifox 数据库步骤 / 问题排查时快速查表

---

## 一、信息安全模块（页面：信息安全）

### 1.1 模块与表对照

| 页面 Tab | 主表 | 说明 |
|----------|------|------|
| 安全总览 | 聚合查询（见 §1.7） | 不单独存一张总览表 |
| 设备白名单 | `sys_sec_device` | 白名单设备 |
| 操作日志 | `sys_user_action_log` | 用户操作审计（2026-08-26 扩展字段） |
| 敏感操作设置 | `sys_sec_rule` | 敏感操作规则 |
| 冻结账号管理 | `sys_sec_freeze` | 账号冻结/解冻记录 |
| 截图溯源 | `sys_sec_trace` | 截图上传与溯源结果 |
| （告警，总览用） | `sys_sec_alarm` | 安全告警（陌生设备登录、手动冻结等） |

> 关联用户表：`sys_users`（冻结时会改用户启用状态，`sys_sec_freeze.previous_enable` 记录冻结前状态）

---

### 1.2 `sys_sec_device` — 设备白名单

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 主键 |
| device_no | varchar(128) | 设备号 |
| device_type | varchar(16) | 设备类型 |
| user_id | bigint | 绑定用户 ID |
| user_name | varchar(64) | 绑定用户名 |
| remark | varchar(255) | 备注 |
| first_bind_at | datetime(3) | 首次绑定时间 |
| last_login_at | datetime(3) | 最近登录 |
| login_times | bigint | 登录次数 |
| operator | varchar(64) | 操作人 |
| created_at / updated_at | datetime(3) | 创建/更新 |

```sql
-- 白名单列表
SELECT * FROM oa.sys_sec_device ORDER BY id DESC;

-- 按设备号查
SELECT * FROM oa.sys_sec_device WHERE device_no = 'mac-f1-f2-f4';
```

---

### 1.3 `sys_user_action_log` — 操作日志

> 表注释：操作日志表。信息安全相关操作 `page='信息安全'`。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| user_id / user_name | | 执行人 |
| action_name | varchar(255) | 操作名称 |
| action_time | datetime | 执行时间 |
| client_ip | varchar(255) | 执行 IP |
| action_url | varchar(255) | 请求 URL |
| page | varchar(64) | 所属页面（如「信息安全」） |
| func_name | varchar(64) | 功能名称（如「截图」） |
| detail | varchar(500) | 操作详情 |
| target_info | varchar(200) | 操作目标 |
| device_no | varchar(128) | 设备编号 |
| request_id / session_id | varchar(64) | 请求/会话 ID |
| request_method | varchar(10) | HTTP 方法 |
| response_status | int | 响应状态码 |
| request_payload / response_payload | text | 请求/响应体 |
| source | varchar(20) | 来源：空=主站, mw=中间件, svc=业务端 |
| province / city / district | varchar(32) | 省市区 |

> **操作日志统计范围（原型）**：只统计以下 11 个「访问页面」的操作，不含登录/退出、截图、信息安全模块自身等。
>
> `用户列表` · `渠道列表` · `角色查询` · `游戏订单` · `用户登录记录` · `渠道登录记录` · `补链记录` · `平台币发放` · `平台币充值` · `绑币收回` · `绑币充值`
>
> 库内匹配规则：`page` 等于页面名，或 `action_name` 含页面名（如 `用户列表-获取玩家列表`、`查看敏感信息|权限:oa-角色查询-...`）。

```sql
-- 今日操作总数（对应安全总览 · 仅统计原型规定的 11 个访问页面）
SELECT COUNT(*) AS today_op_log_count
FROM oa.sys_user_action_log
WHERE DATE(action_time) = CURDATE()
  AND (
    page IN (
      '用户列表', '渠道列表', '角色查询', '游戏订单',
      '用户登录记录', '渠道登录记录', '补链记录',
      '平台币发放', '平台币充值', '绑币收回', '绑币充值'
    )
    OR action_name LIKE '%用户列表%'
    OR action_name LIKE '%渠道列表%'
    OR action_name LIKE '%角色查询%'
    OR action_name LIKE '%游戏订单%'
    OR action_name LIKE '%用户登录记录%'
    OR action_name LIKE '%渠道登录记录%'
    OR action_name LIKE '%补链记录%'
    OR action_name LIKE '%平台币发放%'
    OR action_name LIKE '%平台币充值%'
    OR action_name LIKE '%绑币收回%'
    OR action_name LIKE '%绑币充值%'
  );

-- 近 7 日操作趋势（同样只统计上述 11 个页面）
SELECT DATE(action_time) AS d, COUNT(*) AS cnt
FROM oa.sys_user_action_log
WHERE action_time >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
  AND (
    page IN (
      '用户列表', '渠道列表', '角色查询', '游戏订单',
      '用户登录记录', '渠道登录记录', '补链记录',
      '平台币发放', '平台币充值', '绑币收回', '绑币充值'
    )
    OR action_name LIKE '%用户列表%'
    OR action_name LIKE '%渠道列表%'
    OR action_name LIKE '%角色查询%'
    OR action_name LIKE '%游戏订单%'
    OR action_name LIKE '%用户登录记录%'
    OR action_name LIKE '%渠道登录记录%'
    OR action_name LIKE '%补链记录%'
    OR action_name LIKE '%平台币发放%'
    OR action_name LIKE '%平台币充值%'
    OR action_name LIKE '%绑币收回%'
    OR action_name LIKE '%绑币充值%'
  )
GROUP BY DATE(action_time)
ORDER BY d;

-- 信息安全模块操作
SELECT id, user_name, func_name, action_name, action_time, client_ip, detail
FROM oa.sys_user_action_log
WHERE page = '信息安全'
ORDER BY id DESC LIMIT 50;
```

---

### 1.4 `sys_sec_rule` — 敏感操作设置

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 主键 |
| rule_name | varchar(50) | 规则名称 |
| action_type | varchar(30) | 操作类型 |
| threshold | bigint | 触发次数 |
| window_minutes | bigint | 时间窗口（分钟），0=无限制 |
| effect | varchar(50) | 启用动作（如「告警+踢出+冻结」） |
| enabled | tinyint(1) | 是否启用：1=启用 |
| remark | varchar(200) | 备注 |
| deleted_at | datetime(3) | 软删除 |

```sql
-- 敏感规则数 / 已启用数（对应安全总览）
SELECT COUNT(*) FROM oa.sys_sec_rule WHERE deleted_at IS NULL;
SELECT COUNT(*) FROM oa.sys_sec_rule WHERE deleted_at IS NULL AND enabled = 1;

-- 当前有效规则
SELECT * FROM oa.sys_sec_rule WHERE deleted_at IS NULL ORDER BY id DESC;
```

---

### 1.5 `sys_sec_freeze` — 冻结账号管理

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 主键 |
| user_id / user_name | | 被冻结用户 |
| reason | varchar(50) | 冻结原因 |
| rule_name | varchar(50) | 触发规则名（规则触发时有值） |
| source | varchar(20) | `rule`=规则触发，`manual`=手动 |
| frozen_at | datetime(3) | 冻结时间 |
| last_ip / last_region | varchar(64) | 冻结前最后 IP / 地区 |
| status | bigint | **1=冻结中，2=已解冻** |
| previous_enable | bigint | 冻结前用户 enable 状态 |
| unfrozen_at | datetime(3) | 解冻时间 |
| operator_id / operator_name | | 解冻操作人 |
| is_drill | tinyint(1) | 是否演练 |

```sql
-- 当前冻结账号数（对应安全总览）
SELECT COUNT(*) FROM oa.sys_sec_freeze WHERE status = 1;

-- 近 7 日触发冻结次数
SELECT COUNT(*) FROM oa.sys_sec_freeze
WHERE frozen_at >= DATE_SUB(NOW(), INTERVAL 7 DAY);

-- 冻结中列表
SELECT * FROM oa.sys_sec_freeze WHERE status = 1 ORDER BY frozen_at DESC;
```

---

### 1.6 `sys_sec_trace` — 截图溯源

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 主键 |
| image_name | varchar(200) | 截图文件名 |
| image_hash | varchar(64) | 图片哈希 |
| hit_user_id / hit_user_name | | 命中用户 |
| confidence | decimal(5,2) | 置信度 0-100 |
| captured_at | datetime(3) | 截图时间 |
| captured_ip | varchar(64) | 截图 IP |
| page_name | varchar(100) | 页面名称 |
| raw_payload | text | 溯源原始载荷（含 base64 等） |
| deal_result | varchar(20) | 处理结果 |
| freeze_id | bigint | 关联冻结记录 ID |
| traced_at | datetime(3) | 溯源时间 |
| operator_id / operator_name | | 操作人 |
| deleted_at | datetime(3) | 软删除 |

```sql
SELECT id, image_name, hit_user_name, confidence, deal_result, traced_at, operator_name
FROM oa.sys_sec_trace
WHERE deleted_at IS NULL
ORDER BY id DESC;
```

---

### 1.7 `sys_sec_alarm` — 安全告警

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 主键 |
| alarm_type | varchar(32) | 告警类型 |
| content | varchar(255) | 内容 |
| user_id / account | | 关联用户 |
| client_ip / device_no | | 客户端信息 |
| rule_id | bigint | 关联规则 ID |
| alarm_at | datetime(3) | 告警时间 |
| is_drill | tinyint(1) | 是否演练 |

**已知 alarm_type：**

- `陌生设备登录`
- `管理员手动冻结`

```sql
SELECT * FROM oa.sys_sec_alarm ORDER BY alarm_at DESC LIMIT 20;
```

---

### 1.8 安全总览 · 指标 SQL 汇总

```sql
-- 白名单设备数
SELECT COUNT(*) FROM oa.sys_sec_device;

-- 本周新增白名单（示例：近 7 天）
SELECT COUNT(*) FROM oa.sys_sec_device
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY);

-- 今日操作总数（仅 11 个规定页面，见 §1.3 说明）
SELECT COUNT(*) AS today_op_log_count
FROM oa.sys_user_action_log
WHERE DATE(action_time) = CURDATE()
  AND (
    page IN (
      '用户列表', '渠道列表', '角色查询', '游戏订单',
      '用户登录记录', '渠道登录记录', '补链记录',
      '平台币发放', '平台币充值', '绑币收回', '绑币充值'
    )
    OR action_name LIKE '%用户列表%'
    OR action_name LIKE '%渠道列表%'
    OR action_name LIKE '%角色查询%'
    OR action_name LIKE '%游戏订单%'
    OR action_name LIKE '%用户登录记录%'
    OR action_name LIKE '%渠道登录记录%'
    OR action_name LIKE '%补链记录%'
    OR action_name LIKE '%平台币发放%'
    OR action_name LIKE '%平台币充值%'
    OR action_name LIKE '%绑币收回%'
    OR action_name LIKE '%绑币充值%'
  );

-- 敏感规则数 / 已启用
SELECT COUNT(*) AS total FROM oa.sys_sec_rule WHERE deleted_at IS NULL;
SELECT COUNT(*) AS enabled FROM oa.sys_sec_rule WHERE deleted_at IS NULL AND enabled = 1;

-- 当前冻结账号 / 近 7 日触发
SELECT COUNT(*) FROM oa.sys_sec_freeze WHERE status = 1;
SELECT COUNT(*) FROM oa.sys_sec_freeze WHERE frozen_at >= DATE_SUB(NOW(), INTERVAL 7 DAY);
```

---

### 1.9 表关系简图

```
sys_sec_rule ──触发──▶ sys_sec_alarm
       │                    │
       └──────触发──────────▶ sys_sec_freeze ──▶ sys_users（改 enable）
                                    ▲
sys_sec_trace ──可关联 freeze_id───┘

sys_sec_device ◀── 登录校验白名单
sys_user_action_log ◀── 各模块写操作审计
```

---

## 二、渠道激活池模块（同批次需求）

> 甘特项目：「信息安全和渠道激活池绑定功能」

### 2.1 模块与表对照

| 页面 | 主表 | 说明 |
|------|------|------|
| 渠道激活（激活池列表） | `sys_platform_promote_active_pool` | 各平台入池渠道 |
| 规则配置 | `oa.sys_config`（activePool* 键） | KV 配置，非独立表 |
| 绑定设置 / 申请绑定 | `sys_promote_active_pool_bind` | 商务认领绑定申请 |
| 批次记录 | `sys_promote_active_pool_batch` + `sys_promote_active_pool_batch_item` | 批次头 + 明细 |

---

### 2.2 `sys_platform_promote_active_pool` — 各平台渠道激活池

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键（pool_record_id） |
| platform_name | varchar(30) | 平台：lx / yq / hw 等 |
| promote_id | int | 一级渠道 ID |
| promote_account | varchar(60) | 渠道账号 |
| register_type | tinyint | 0个人 1公会 2公众号 3其它 |
| remark | varchar(500) | 备注 |
| claim_flag | int | **0=可见，1=认领隐藏** |
| created_at / updated_at / deleted_at | | 时间 |

```sql
-- 激活池列表（未认领隐藏）
SELECT * FROM oa.sys_platform_promote_active_pool
WHERE deleted_at IS NULL AND claim_flag = 0
ORDER BY id DESC;

-- 按平台筛选
SELECT * FROM oa.sys_platform_promote_active_pool
WHERE platform_name = 'lx' AND claim_flag = 0;
```

> 列表展示的「累计金额」「未登录天数」「锁定状态」等多为实时计算或关联各 `game_*` 库渠道表，本表主要存入池快照与可见性。

---

### 2.3 `sys_promote_active_pool_bind` — 商务认领绑定

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 主键 |
| pool_record_id | bigint | 关联激活池记录 ID |
| platform_name | varchar(64) | 平台库名 |
| promote_id | int | 一级渠道 ID |
| promote_account | varchar(128) | 渠道账号快照 |
| applicant_oa | varchar(64) | 申请人 OA 账号 |
| busier_id / busier_account | | 目标商务 |
| status | varchar(16) | 见下表 |
| bind_at | datetime | 审核通过时间（观察期起点） |
| unbind_at | datetime | 解除/逾期时间 |
| reach_at | datetime | 达标换绑时间 |
| accum_amount | decimal(16,2) | 绑定期间累计流水 |

**status 枚举：**

| 值 | 含义 |
|----|------|
| pending | 待审核 |
| in_progress | 进行中（观察期） |
| reached | 已达标 |
| rejected | 已驳回 |
| unbound | 已解除 |

```sql
SELECT * FROM oa.sys_promote_active_pool_bind ORDER BY id DESC;
```

---

### 2.4 `sys_promote_active_pool_batch` — 批次头

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 主键 |
| batch_no | varchar(32) | 批次编号 |
| trigger_type | varchar(16) | `timer` \| `config_rescan` |
| channel_count | int | 入池渠道数 |
| restored | tinyint | 0未全部还原 1已全部还原 |

---

### 2.5 `sys_promote_active_pool_batch_item` — 批次明细

| 字段 | 类型 | 说明 |
|------|------|------|
| batch_id | bigint | 批次 ID |
| pool_record_id | bigint | 激活池记录 ID |
| platform_name | varchar(64) | 平台 |
| promote_id / promote_account | | 渠道 |
| register_type | int | 渠道类型 |
| lock_status | int | 入池时锁定状态 |
| entry_reason | varchar(16) | `spend_low` \| `no_login` |
| no_login_days | int | 未登录天数快照 |
| period_spend | decimal(16,2) | 周期流水快照 |
| old_busier_id / new_busier_id | | 原/新商务 |
| old_busier_name / new_busier_name | | 原/新商务姓名 |
| restored | tinyint | 0未还原 1已还原 |

```sql
-- 某批次明细
SELECT b.batch_no, i.*
FROM oa.sys_promote_active_pool_batch b
JOIN oa.sys_promote_active_pool_batch_item i ON i.batch_id = b.id
WHERE b.batch_no = '批次编号'
ORDER BY i.id;
```

---

### 2.6 `sys_config` — 激活池规则配置（activePool* 键）

| config_key | 测试库当前值 | 含义 |
|------------|-------------|------|
| activePoolSpendThreshold | 100 | 流水金额阈值（元） |
| activePoolSpendPeriodDays | 1 | 流水统计周期（天） |
| activePoolNoLoginDays | 5 | 未登录天数阈值 |
| activePoolIncludeTerminated | 0 | 解除合作是否纳入：1=是 |
| activePoolIncludeLocked | 0 | 锁定是否纳入：1=是 |
| activePoolCrossByMobile | 0 | 跨平台同账号·手机号 |
| activePoolCrossByIdCard | 1 | 跨平台同账号·身份证 |
| activePoolBindObserveDays | 30 | 绑定观察期（天） |
| activePoolBindTargetAmount | 500 | 绑定达标流水（元） |
| activePoolProtectDays | 10 | 保护期（天） |
| activePoolBrowseStart | 09:00 | 可浏览时段起 |
| activePoolBrowseEnd | 19:00 | 可浏览时段止 |

```sql
SELECT config_key, config_value, updated_at
FROM oa.sys_config
WHERE config_key LIKE 'activePool%'
ORDER BY config_key;
```

---

## 三、测试常用 SQL 速查

```sql
-- 【信息安全】查某用户是否被冻结
SELECT f.*, u.enable
FROM oa.sys_sec_freeze f
LEFT JOIN oa.sys_users u ON u.id = f.user_id
WHERE f.user_name = 'test2'
ORDER BY f.id DESC;

-- 【信息安全】查用户最近操作
SELECT * FROM oa.sys_user_action_log
WHERE user_name = '13355556666'
ORDER BY action_time DESC LIMIT 20;

-- 【激活池】某渠道是否在池中
SELECT * FROM oa.sys_platform_promote_active_pool
WHERE promote_account = '渠道账号' AND platform_name = 'lx';

-- 【激活池】某渠道绑定申请状态
SELECT * FROM oa.sys_promote_active_pool_bind
WHERE promote_account = '渠道账号'
ORDER BY id DESC;
```

---

## 四、连接信息

| 项 | 值 |
|----|-----|
| 主机 | 192.168.2.226:3306 |
| 库 | `oa` |
| 配置来源 | 工作台 `data/smoke_db_config.json`（勿提交） |
| Apifox 连接名 | test测试环境数据库 |

---

## 五、备注

1. **信息安全表**均为 2026-08-26 前后新建（`sys_sec_*` + `sys_user_action_log` 扩展）。
2. **`sys_operation_records`** 是后端 API 访问日志（8200+ 条），与页面「操作日志」不是同一张表；页面用的是 **`sys_user_action_log`**。
3. 激活池流水/资质详情需跨库查各平台业务库（`game_lx` / `game_yq` / `game_hw`）的渠道与充值表，本说明仅覆盖 **oa 库内表**。
4. 测试造数建议打标记（remark / 专用测试账号），避免污染生产数据。
