# 分发包接口 vs 工作台游戏 SDK 参数对比

> 生成说明：分发包侧来自抓包文件 `分发包的接口.txt`（联运分发 APK `com.xigu.distribute`）；
> 工作台侧来自 `workbench/game_sdk_api.py` 组装并 POST 的 `/sdk/...` 请求体。
>
> 抓包中含高德/阿里云/支付宝埋点等第三方请求，下文**仅对比 fuhua91 / issuesy 业务接口**。

## 1. 总体差异（先看这个）

| 维度 | 分发包（联运分发） | 工作台游戏 SDK |
|------|-------------------|----------------|
| 产品形态 | 渠道分发壳：先打自家 `/sdk/...`，再回调发行侧 `issuesy/sdk/...` | 直连平台游戏 SDK（龙翔/游趣/汇玩等 `*/sdk/...`） |
| 宿主域名（本抓包） | 平台：`yq.example.com`；联运：`dev.example.com/issuesy/sdk/...` | 配置 `baseUrl`，默认 `http://dev.example.com`（也可用 yq/hw/lx） |
| Body 编码 | 多为 **Base64(JSON 明文)** + `Content-Type: text/plain` | **Base64(JSON)** + `Content-Type: application/json` |
| 联运专用接口 | 有：`/issuesy/sdk/user_login`、`pay_create`、`user_role_record`、`channel_pack_status` | **无**（工作台不走 issuesy） |
| 身份主键 | 平台账号 `user_id`/`account` + 分发侧 `channel_uid`/`game_channel_id`/`sdk_os` | 平台账号 `account`/`user_id`/`small_id` + `game_id`/`game_appid` |
| 验签 | 双方都有 `md5_sign`（参数值排序拼接 + access_key） | 同算法（`encrypt_md5`） |

## 2. 分发包抓到的 fuhua91 / issuesy 接口一览

| 路径 | 参数字段 |
|------|----------|
| `/issuesy/sdk/channel_pack_status` | `equipment_num`, `game_channel_id`, `md5_sign`, `sdk_os` |
| `/issuesy/sdk/pay_create` | `channel_uid`, `equipment_num`, `extend`, `game_channel_id`, `level`, `md5_sign`, `pay_amount`, `props_name`, `role_id`, `role_name`, `sdk_os`, `server_id`, `server_name` |
| `/issuesy/sdk/user_login` | `channel_uid`, `equipment_num`, `game_channel_id`, `login_extend`, `md5_sign`, `sdk_os`, `token`, `user_birthday`, `user_certification` |
| `/issuesy/sdk/user_role_record` | `channel_uid`, `equipment_num`, `game_channel_id`, `level`, `md5_sign`, `role_id`, `role_name`, `sdk_os`, `server_id`, `server_name` |
| `/sdk/User/force_update` | `device_name`, `equipment_num`, `game_appid`, `game_id`, `game_name`, `is_simulator`, `launch_id`, `md5_sign`, `position`, `promote_id`, `sdk_version`, `t` |
| `/sdk/User/save_user_play_info` | `combat_number`, `device_name`, `equipment_num`, `game_id`, `game_name`, `game_player_id`, `game_player_name`, `is_simulator`, `md5_sign`, `player_reserve`, `promote_id`, `role_level`, `sdk_ua`, `sdk_version`, `server_id`, `server_name`, `small_id`, `t`, `token`, `user_id` |
| `/sdk/User/user_login` | `account`, `device_name`, `equipment_num`, `game_appid`, `game_id`, `game_name`, `geetest_challenge`, `geetest_seccode`, `geetest_validate`, `is_simulator`, `md5_sign`, `password`, `promote_id`, `sdk_ua`, `sdk_version`, `t` |
| `/sdk/center/and_pay_agree` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_ua`, `sdk_version`, `small_id`, `t`, `token`, `user_id` |
| `/sdk/center/get_valid_coupon` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `pay_amount`, `promote_id`, `sdk_ua`, `sdk_version`, `small_id`, `t`, `token`, `user_id` |
| `/sdk/center/today_notice` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_ua`, `sdk_version`, `small_id`, `t`, `token`, `user_id` |
| `/sdk/pay/and_alipay_pay` | `account`, `body`, `code`, `device_name`, `equipment_num`, `extend`, `extra_param`, `game_appid`, `game_id`, `game_name`, `game_player_id`, `game_player_name`, `goods_reserve`, `is_simulator`, `md5_sign`, `price`, `promote_id`, `role_level`, `sdk_ua`, `sdk_version`, `server_id`, `server_name`, `small_id`, `t`, `title`, `token`, `user_id` |
| `/sdk/pay/get_orderno_restart` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `orderno`, `promote_id`, `sdk_ua`, `sdk_version`, `small_id`, `t`, `token`, `user_id` |
| `/sdk/pay/get_pay_server` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_ua`, `sdk_version`, `small_id`, `t`, `token`, `user_id` |
| `/sdk/pay/user_platform_coin` | `account`, `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_ua`, `sdk_version`, `small_id`, `t`, `token`, `user_id` |
| `/sdk/server/get_protocol` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_version`, `t` |
| `/sdk/server/get_server_version` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_version`, `t` |
| `/sdk/server/get_switch` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_version`, `t`, `type` |
| `/sdk/user/equipment_login` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_version`, `t` |
| `/sdk/user/get_domain` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_ua`, `sdk_version`, `small_id`, `t`, `token`, `user_id` |
| `/sdk/user/get_enter_game_info` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_ua`, `sdk_version`, `small_id`, `t`, `token`, `user_id` |
| `/sdk/user/get_real_auth_status` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_ua`, `sdk_version`, `small_id`, `t`, `token`, `user_id` |
| `/sdk/user/get_switch_status` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_version`, `t` |
| `/sdk/user/get_user_discount` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_ua`, `sdk_version`, `small_id`, `t`, `token`, `user_id` |
| `/sdk/user/return_age` | `account`, `device_name`, `equipment_num`, `game_id`, `game_name`, `get_talking_code`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_ua`, `sdk_version`, `small_id`, `t`, `token`, `user_id` |
| `/upload/site/20230214/c2fdea08037416db85ea72dcc8638dc4.png` |  |

## 3. 工作台已封装的 SDK 接口一览

| 路径 | 参数字段 |
|------|----------|
| `/sdk/User/register` | `account`, `device_name`, `equipment_num`, `game_appid`, `game_id`, `game_name`, `geetest_challenge`, `geetest_seccode`, `geetest_validate`, `is_simulator`, `md5_sign`, `password`, `promote_account`, `promote_id`, `repassword`, `sdk_version`, `t`, `type` |
| `/sdk/User/user_login` | `account`, `device_name`, `equipment_num`, `game_appid`, `game_id`, `game_name`, `geetest_challenge`, `geetest_seccode`, `geetest_validate`, `is_simulator`, `md5_sign`, `password`, `promote_id`, `sdk_version`, `t` |
| `/sdk/user/idcard_change` | `device_name`, `equipment_num`, `game_id`, `game_name`, `idcard`, `is_simulator`, `md5_sign`, `promote_id`, `real_name`, `sdk_ua`, `sdk_version`, `small_id`, `t`, `token`, `user_id` |
| `/sdk/User/save_user_play_info` | `combat_number`, `device_name`, `equipment_num`, `game_id`, `game_name`, `game_player_id`, `game_player_name`, `is_simulator`, `md5_sign`, `player_reserve`, `promote_id`, `role_level`, `sdk_ua`, `sdk_version`, `server_id`, `server_name`, `small_id`, `t`, `token`, `user_id` |
| `/sdk/pay/and_alipay_pay` | `account`, `body`, `code`, `device_name`, `equipment_num`, `extend`, `extra_param`, `game_appid`, `game_id`, `game_name`, `game_player_id`, `game_player_name`, `goods_reserve`, `is_simulator`, `md5_sign`, `price`, `promote_id`, `role_level`, `sdk_version`, `server_id`, `server_name`, `small_id`, `t`, `title`, `token`, `user_id` |

## 4. 同名/对应接口字段对比

### 平台账号登录（分发包也会先登游趣平台）

- 分发包：`/sdk/User/user_login`
- 工作台：`/sdk/User/user_login`

| 关系 | 字段 |
|------|------|
| 两边都有 | `account`, `device_name`, `equipment_num`, `game_appid`, `game_id`, `game_name`, `geetest_challenge`, `geetest_seccode`, `geetest_validate`, `is_simulator`, `md5_sign`, `password`, `promote_id`, `sdk_version`, `t` |
| 仅分发包 | `sdk_ua` |
| 仅工作台 | — |

<details><summary>分发包示例参数（脱敏）</summary>

```json
{
  "account": "1014test",
  "device_name": "HONOR:YAL-AL10",
  "equipment_num": "aabfefde-b7fe-7de8-3f6b-bffbdd9b34b8",
  "game_appid": "AF31F3439DC1869F2",
  "game_id": "397",
  "game_name": "幻世九歌-浮光千雪(安卓版)",
  "geetest_challenge": "",
  "geetest_seccode": "",
  "geetest_validate": "",
  "is_simulator": "0",
  "md5_sign": "0cfc4eacb1c6…",
  "promote_id": "0",
  "sdk_ua": "Mozilla/5.0 (Linux; Android 10; YAL-AL10 Build/HUAWEIYAL-AL10; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/83.0.4103.106 Mobile Safari/537.36",
  "sdk_version": "1",
  "t": "1792034943495",
  "password": "***"
}
```

</details>

### 上报角色/区服

- 分发包：`/sdk/User/save_user_play_info`
- 工作台：`/sdk/User/save_user_play_info`

| 关系 | 字段 |
|------|------|
| 两边都有 | `combat_number`, `device_name`, `equipment_num`, `game_id`, `game_name`, `game_player_id`, `game_player_name`, `is_simulator`, `md5_sign`, `player_reserve`, `promote_id`, `role_level`, `sdk_ua`, `sdk_version`, `server_id`, `server_name`, `small_id`, `t`, `token`, `user_id` |
| 仅分发包 | — |
| 仅工作台 | — |

<details><summary>分发包示例参数（脱敏）</summary>

```json
{
  "combat_number": "9999",
  "device_name": "HONOR:YAL-AL10",
  "equipment_num": "aabfefde-b7fe-7de8-3f6b-bffbdd9b34b8",
  "game_id": "397",
  "game_name": "幻世九歌-浮光千雪(安卓版)",
  "game_player_id": "1",
  "game_player_name": "测试角色",
  "is_simulator": "0",
  "md5_sign": "799c7ee3518e…",
  "player_reserve": "",
  "promote_id": "0",
  "role_level": "1",
  "sdk_ua": "Mozilla/5.0 (Linux; Android 10; YAL-AL10 Build/HUAWEIYAL-AL10; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/83.0.4103.106 Mobile Safari/537.36",
  "sdk_version": "1",
  "server_id": "1",
  "server_name": "测试1区",
  "small_id": "41",
  "t": "1792034954659",
  "user_id": "41",
  "token": "***"
}
```

</details>

### 支付宝下单

- 分发包：`/sdk/pay/and_alipay_pay`
- 工作台：`/sdk/pay/and_alipay_pay`

| 关系 | 字段 |
|------|------|
| 两边都有 | `account`, `body`, `code`, `device_name`, `equipment_num`, `extend`, `extra_param`, `game_appid`, `game_id`, `game_name`, `game_player_id`, `game_player_name`, `goods_reserve`, `is_simulator`, `md5_sign`, `price`, `promote_id`, `role_level`, `sdk_version`, `server_id`, `server_name`, `small_id`, `t`, `title`, `token`, `user_id` |
| 仅分发包 | `sdk_ua` |
| 仅工作台 | — |

<details><summary>分发包示例参数（脱敏）</summary>

```json
{
  "account": "1014test",
  "body": "10元宝",
  "code": "1",
  "device_name": "HONOR:YAL-AL10",
  "equipment_num": "aabfefde-b7fe-7de8-3f6b-bffbdd9b34b8",
  "extend": "eaypJSwdY6XLlofIbC36J6kUZkXVJIfcbznaVtYmVyIjoiRkZfMjAyNjEwMTUxMTI5MjFDN1hNIiwidXNlcl9pZCI6MSwiZmZfcGxhdGZvcm0iOjE3fQO0O0OO0O0O_xgsdk_http://yq.example.com",
  "extra_param": "http://yq.example.com",
  "game_appid": "AF31F3439DC1869F2",
  "game_id": "397",
  "game_name": "幻世九歌-浮光千雪(安卓版)",
  "game_player_id": "490003",
  "game_player_name": "郑万言",
  "goods_reserve": "",
  "is_simulator": "0",
  "md5_sign": "75298b284f67…",
  "price": "0.12",
  "promote_id": "0",
  "role_level": "1",
  "sdk_ua": "Mozilla/5.0 (Linux; Android 10; YAL-AL10 Build/HUAWEIYAL-AL10; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/83.0.4103.106 Mobile Safari/537.36",
  "sdk_version": "1",
  "server_id": "1",
  "server_name": "渠道测试2服",
  "small_id": "41",
  "t": "1792034975173",
  "title": "10元宝",
  "user_id": "41",
  "token": "***"
}
```

</details>

### 联运渠道登录（仅分发包）

- 分发包：`/issuesy/sdk/user_login`
- 工作台：`（无对应封装）`

| 关系 | 字段 |
|------|------|
| 两边都有 | — |
| 仅分发包 | `channel_uid`, `equipment_num`, `game_channel_id`, `login_extend`, `md5_sign`, `sdk_os`, `token`, `user_birthday`, `user_certification` |
| 仅工作台 | — |

<details><summary>分发包示例参数（脱敏）</summary>

```json
{
  "channel_uid": "41",
  "equipment_num": "4c99a782c5d4c2eb",
  "game_channel_id": "2362",
  "login_extend": "http://yq.example.com",
  "md5_sign": "cf2cdc611cd5…",
  "sdk_os": "1",
  "user_birthday": "19970119",
  "user_certification": "1",
  "token": "***"
}
```

</details>

### 联运创单 vs 平台支付（概念对应，字段体系不同）

- 分发包：`/issuesy/sdk/pay_create`
- 工作台：`/sdk/pay/and_alipay_pay`

| 关系 | 字段 |
|------|------|
| 两边都有 | `equipment_num`, `extend`, `md5_sign`, `server_id`, `server_name` |
| 仅分发包 | `channel_uid`, `game_channel_id`, `level`, `pay_amount`, `props_name`, `role_id`, `role_name`, `sdk_os` |
| 仅工作台 | `account`, `body`, `code`, `device_name`, `extra_param`, `game_appid`, `game_id`, `game_name`, `game_player_id`, `game_player_name`, `goods_reserve`, `is_simulator`, `price`, `promote_id`, `role_level`, `sdk_version`, `small_id`, `t`, `title`, `token`, `user_id` |

<details><summary>分发包示例参数（脱敏）</summary>

```json
{
  "channel_uid": "41",
  "equipment_num": "4c99a782c5d4c2eb",
  "extend": "1792034962352_xgsdk_1",
  "game_channel_id": "2362",
  "level": "1",
  "md5_sign": "a4c1dbd19e72…",
  "pay_amount": "0.12",
  "props_name": "10元宝",
  "role_id": "490003",
  "role_name": "郑万言",
  "sdk_os": "1",
  "server_id": "1",
  "server_name": "渠道测试2服"
}
```

</details>

### 联运角色上报 vs 平台存档

- 分发包：`/issuesy/sdk/user_role_record`
- 工作台：`/sdk/User/save_user_play_info`

| 关系 | 字段 |
|------|------|
| 两边都有 | `equipment_num`, `md5_sign`, `server_id`, `server_name` |
| 仅分发包 | `channel_uid`, `game_channel_id`, `level`, `role_id`, `role_name`, `sdk_os` |
| 仅工作台 | `combat_number`, `device_name`, `game_id`, `game_name`, `game_player_id`, `game_player_name`, `is_simulator`, `player_reserve`, `promote_id`, `role_level`, `sdk_ua`, `sdk_version`, `small_id`, `t`, `token`, `user_id` |

<details><summary>分发包示例参数（脱敏）</summary>

```json
{
  "channel_uid": "41",
  "equipment_num": "4c99a782c5d4c2eb",
  "game_channel_id": "2362",
  "level": "1",
  "md5_sign": "88677d3a4cd3…",
  "role_id": "1",
  "role_name": "测试角色",
  "sdk_os": "1",
  "server_id": "1",
  "server_name": "测试1区"
}
```

</details>

## 5. 字段语义对照（易混）

| 分发包字段 | 工作台/平台 SDK 常见字段 | 说明 |
|------------|--------------------------|------|
| `game_channel_id` | （无；用 `game_id`） | 联运渠道游戏 ID，发行侧 issuesy 使用 |
| `channel_uid` | `user_id` / `small_id` | 渠道用户 ID；平台侧是平台用户 ID |
| `sdk_os` | （无；工作台默认安卓） | 分发包显式传系统类型 |
| `login_extend` | `extra_param` / `extend` | 扩展串：分发登录带回平台域名等 |
| `user_certification` / `user_birthday` | `idcard_change` 的实名接口 | 分发登录直接带实名态；工作台多单独调实名 |
| `pay_amount` / `props_name` | `price` / `title`/`body` | 联运创单金额道具名 vs 平台支付金额标题 |
| `role_id` / `role_name` / `level` | `game_player_id` / `game_player_name` / `role_level` | 角色字段命名不同 |
| `equipment_num` | `equipment_num` | 设备号，两边都有 |
| `md5_sign` | `md5_sign` | 算法一致：ksort 后拼 value + access_key 再 MD5 |
| `t` | `t` | 毫秒时间戳，两边都有（issuesy 接口通常不带 `t`） |

## 6. 分发包多出来的平台 SDK 接口（工作台未封装）

| 路径 | 参数 |
|------|------|
| `/sdk/User/force_update` | `device_name`, `equipment_num`, `game_appid`, `game_id`, `game_name`, `is_simulator`, `launch_id`, `md5_sign`, `position`, `promote_id`, `sdk_version`, `t` |
| `/sdk/center/and_pay_agree` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_ua`, `sdk_version`, `small_id`, `t`, `token`, `user_id` |
| `/sdk/center/get_valid_coupon` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `pay_amount`, `promote_id`, `sdk_ua`, `sdk_version`, `small_id`, `t`, `token`, `user_id` |
| `/sdk/center/today_notice` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_ua`, `sdk_version`, `small_id`, `t`, `token`, `user_id` |
| `/sdk/pay/get_orderno_restart` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `orderno`, `promote_id`, `sdk_ua`, `sdk_version`, `small_id`, `t`, `token`, `user_id` |
| `/sdk/pay/get_pay_server` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_ua`, `sdk_version`, `small_id`, `t`, `token`, `user_id` |
| `/sdk/pay/user_platform_coin` | `account`, `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_ua`, `sdk_version`, `small_id`, `t`, `token`, `user_id` |
| `/sdk/server/get_protocol` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_version`, `t` |
| `/sdk/server/get_server_version` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_version`, `t` |
| `/sdk/server/get_switch` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_version`, `t`, `type` |
| `/sdk/user/equipment_login` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_version`, `t` |
| `/sdk/user/get_domain` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_ua`, `sdk_version`, `small_id`, `t`, `token`, `user_id` |
| `/sdk/user/get_enter_game_info` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_ua`, `sdk_version`, `small_id`, `t`, `token`, `user_id` |
| `/sdk/user/get_real_auth_status` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_ua`, `sdk_version`, `small_id`, `t`, `token`, `user_id` |
| `/sdk/user/get_switch_status` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_version`, `t` |
| `/sdk/user/get_user_discount` | `device_name`, `equipment_num`, `game_id`, `game_name`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_ua`, `sdk_version`, `small_id`, `t`, `token`, `user_id` |
| `/sdk/user/return_age` | `account`, `device_name`, `equipment_num`, `game_id`, `game_name`, `get_talking_code`, `is_simulator`, `md5_sign`, `promote_id`, `sdk_ua`, `sdk_version`, `small_id`, `t`, `token`, `user_id` |

## 7. 结论（测试时怎么用）

1. **工作台 SDK 冒烟**只管平台链：`register / user_login / save_user_play_info / and_alipay_pay`（+ 实名），
   参数以 `game_id`、`game_appid`、`account`、`user_id`、`token` 为主。
2. **分发包联运冒烟**还要验 `issuesy`：`channel_pack_status`、`user_login`、`user_role_record`、`pay_create`，
   参数以 `game_channel_id`、`channel_uid`、`sdk_os`、`equipment_num` 为主。
3. 两边都有 `md5_sign`，但 **access_key / 参与签名的字段集合不同**，不能把 issuesy 的 body 原样丢给 `/sdk/pay/...`。
4. 同一次分发充值会出现「平台支付 + 联运创单」两套请求；工作台目前只模拟平台支付半边。

---

源文件：`F:\OA-test\项目安装包\oa蜂巢1.4.6（联运管理）\测试点\分发包的接口.txt`

工作台实现：`workbench/game_sdk_api.py`
