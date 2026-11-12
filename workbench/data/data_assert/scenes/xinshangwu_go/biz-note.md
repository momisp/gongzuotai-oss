# 新商务 Go 语言改版 · 金额断言（摘录）

## 环境

- **真站工作台**：`http://sw2.example.com/#/layout/dashboard`（第 4 点只认此域名）
- 登录页：`http://sw2.example.com/#/login`（账号密码见本地 catalogs，勿写入文档）
- API：`http://sw2.example.com/api`（`POST /base/login` → header `x-token`）
- Swagger：`http://sw2.example.com/api/swagger/index.html`
- Apifox 新新商务：https://s.apifox.cn/4477b53a-ed4a-4dbd-a7be-6eda1d109944
- 库：`sw9`（`tab_spend` / `tab_sw_report_day` / `tab_sw_report_server_day`）

## 关键参数

| 场景 | 参数 |
|------|------|
| 工作台 | `sourceDbList=lx,hw,yq` |
| 充值明细日期 | **`beginPayTime` / `endPayTime`**（不是 beginTime） |
| 游戏/渠道统计 | `sourceDb` + `beginTime`/`endTime` |
| 区服分析 | 另需 **`gameName`**（不传会「请选择游戏」） |

## L1 口径（已对账）

- 工作台本月充值 = `tab_sw_report_day` 且 **`dedup_mode=0`** 的 `SUM(total_pay)`
- 工作台今日充值 = 同上，`stat_date=今日`（有数日如 11-03=220947 曾与 compareValue 一致）
- 明细合计 = `tab_spend` 且 `pay_status=1` 的 `SUM(pay_amount)`（本月可比看板少约几十元）
- **新增渠道数** = `tab_promote` 当日 `create_time` 计数（11-03=5 与 compareValue 一致）
- 日报/区服勿把 `dedup_mode` 0+1 加在一起（会翻倍）

## L1 推断 / 未钉

- **活跃渠道数**：候选① 当日 `active_cnt>0` 去重；候选② `active_cnt>2 ∧ status=1`（更接近历史环比 377）。前端无 tip；待源码收口
- 今日注册/活跃人数：裸 `SUM` 可能略高于接口（渠道状态过滤待钉）

## 本期指标

工作台六卡（含环比，共 12 条）、**渠道数据统计顶卡 4×4**（总数/注册/充值/付费率 × 本日昨日本周本月）、充值明细合计、游戏/区服、TOP1。

面板支持 **fixture 断言** 与 **live 断言**（`liveSql`→sw9 + 真站 HTTP；页面层暂镜像接口）。渠道总充值 L1 已对账；渠道总数/平均付费率 L1 仍空缺。
