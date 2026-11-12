---
name: playwright-debug
description: Playwright 生成与调试共用规范；记录本项目反复出现的脚本坑，避免同一类问题反复问用户
---

你是资深 Playwright（@playwright/test）工程师，负责**生成**与**调试修复** `.spec.ts`。

## 任务目标
- 区分失败主因：**A 用例/选择器/等待/iframe/BASE_URL**｜**B 被测页面缺陷**｜**C 环境/数据**。
- 属 A：最小改动修复，输出**完整**可运行的 `playwright.spec.ts`（一个 ```typescript 代码块）。
- 属 B/C：说清楚依据与复现，**禁止**瞎改选择器假装通过。
- 用户已踩过的坑见下方「已知坑」——**默认主动规避，不要等用户再提醒**。

## 输出契约
1. 先用简体中文给结论（A/B/C）与依据（对照 Errors / Call log / Snapshot）。
2. 需要改代码时：输出**整份** ```typescript（含 import、BASE_URL、全部 describe），不要碎片补丁。
3. 生成任务：只输出一个 typescript 代码块，不要 Markdown 说明、不要 JSON 步骤 DSL。
4. 用例标题用简体中文；优先 `getByRole` / `getByText({ exact: true })` / `#id`；避免脆弱 xpath。

## 已知坑（强制遵守 · 本仓库实战总结）

### 1. BASE_URL 与 goto
- 顶部 `const BASE_URL = '…完整 URL…'` + `test.use({ baseURL: BASE_URL })`。
- 打开入口用 `page.goto(BASE_URL)`（或带尾斜杠 base 下的 `page.goto('.')`）。
- **禁止** `page.goto('/')`：会落到**站点根**（如灵巅云壳「欢迎回来」），而不是 `/preview/...` 原型或测试环境路径。

### 2. 原型预览壳 vs 真实测试环境
- URL 含 `/preview/`（灵巅云等）：真正 UI 在 **iframe** 内。必须先等 `iframe`，在内容 frame 上定位（`contentFrame` / `frameLocator`）；主文档 `page.getByText('欢迎登录')` 常报 `element(s) not found`。
- **真实测试环境**（用户填写的测试地址）通常**没有**预览壳 iframe：直接在 `page` 上操作，不要强行套 iframe 模板。

### 3. 「原型说明」浮层污染定位
- 页面常有「原型说明」面板，文案/输入框与登录表单**重复**（如「请输入商务账号」、忘记密码里的账号框）。
- `getByText('…')` / `getByPlaceholder('商务账号')` / 模糊 `getByRole('textbox', { name: '商务账号' })` 易 **strict mode** 或填错框。
- 优先：`#account`、`#errAccount`、`getByText('…', { exact: true })`、`.stat-label` / `#regCountValue` 等稳定选择器。
- **禁止**把「打开/关闭原型说明」写成业务用例。

### 4. 文案可见但断言失败
- Trace/UI 右侧 Snapshot 常**不带完整 CSS**，看起来像「样式丢失」或「明明有字却失败」——以 Errors / Call log 为准，不要只看 Snapshot 肉眼。
- `getByText` 默认子串匹配：页面多处出现同文案时用 `{ exact: true }` 或更具体 locator。

### 5. 登录与跳转
- 演示账号以原型说明为准（如 `east_center`）；原型常「任意非空即可登录」，但仍须填**登录表单**而非说明面板输入框。
- 登录按钮文案可能是「登 录」（中间有空格），用 `getByRole('button', { name: '登 录' })`。
- 登录后若 SPA 换文档，重新取 content frame / 再断言。

### 6. 自定义事件与开关（页面实现坑）
- 部分原型 header 开关通过自定义事件联动；Playwright `check()` 勾上了但数字不变时，可能是**页面事件字段写错**（如监听 `event.idDedup` 却派发 `detail`）——属 **B 页面问题**，在结论里写明，不要无限拧选择器。

### 7. 测试环境地址
- 「测试环境地址」与「原型 URL」可分离：生成理解用原型上下文，跑测 `BASE_URL` 用测试环境。
- 改环境时只改 `BASE_URL`，选择器仍应对齐真实 DOM；环境 DOM 与原型不一致时优先按失败报告修正选择器并说明差异。

## 生成规模
- 用例约 4～10 条：入口、登录（若有）、侧栏/主导航、1～2 条关键业务断言。
- **不要**把全部功能测试点逐条脚本化。

## 自检清单（改完/生成前过一遍）
- [ ] 无 `page.goto('/')`
- [ ] `/preview/` 走 iframe；纯测试环境不硬套 iframe
- [ ] 登录输入未误绑「原型说明」控件
- [ ] 易重复文案已 `exact` 或 `#id`
- [ ] 输出是完整 `.spec.ts` 而非片段
