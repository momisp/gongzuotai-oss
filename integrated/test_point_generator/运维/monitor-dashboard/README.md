# 运维监控指标 · 本地导航页

## 是什么

`index.html` + `metrics-config.js` + `app.js`：**左侧指标列表** + 右侧说明区；监控页默认在**命名浏览器窗口**里打开（非 iframe），可接近「左导航、右大内容」Workflow。  
**双击 `index.html`** 用浏览器打开即可。

### 点击无反应时（常见）

1. **已修复**：脚本里曾漏写 `metrics` 变量会导致整段 JS 报错，侧栏点击失效；请更新后的 `app.js`。
2. **请用本地 HTTP 打开**：从磁盘 `file://` 打开时，部分浏览器对链到外站的 `target` 窗口限制更严。
   - 双击本目录下的 **`serve.bat`**（需已安装 Python），浏览器访问 **`http://127.0.0.1:8765/index.html`**。
3. 命名窗口模式已改为 **真实超链接 + `target=窗口名`**，不再依赖 `window.open`，一般不会被当作「弹窗」拦截。

## 为什么不用 iframe 也能「差不多内嵌」

云控制台普遍带 **X-Frame-Options / CSP**，iframe 必失败。可行替代：

### 1. 命名窗口（默认，推荐）

在 **`metrics-config.js`** 里：

```js
window.OPS_VIEW_MODE = "namedWindow";
window.OPS_NAMED_WINDOW = "OpsMetricsPane"; // 可改名
```

左栏点不同指标时，脚本对**同一个窗口名**执行 `window.open(url, 'OpsMetricsPane')`，并在第二次起直接改 `location` —— **只维护一个「监控窗口」**，比开一排标签清爽。

**布局建议：** 把本导航页**靠左**，监控窗口**靠右**（Windows 可 `Win + ←/→` 分屏），视觉上接近草图。

**弹窗拦截：** 若首次不弹出，在地址栏允许此本地页面的弹出窗口。

### 2. 其它达成「类似效果」的方式（不依赖本页）

| 方式 | 说明 |
|------|------|
| **浏览器「分组标签」** | Edge / Chrome 把监控页归到同一标签组，起名「运维」；切换仍快。 |
| **书签栏文件夹** | 一组书签一次性点开（仍会多标签，但集中管理）。 |
| **PWA / 固定到任务栏** | 把常用控制台「安装为应用」或固定，减少和日常标签混在一起。 |
| **自建 Grafana 等** | 指标进自家大盘，浏览器只开一个 Grafana；对接云 API 需权限与开发量。 |
| **Electron / Tauri 外壳** | 自己做带侧栏的桌面壳，`BrowserView` 全屏加载控制台 — 开发成本高于本 HTML。 |

### 3. 视图模式切换

`metrics-config.js` 中 `OPS_VIEW_MODE`：

| 值 | 行为 |
|----|------|
| `namedWindow` | **默认**。同窗口名复用，切换 URL。 |
| `newTabEach` | 每次点击 **新标签**（适合不想用命名窗口时）。 |
| `iframe` | 尝试右侧嵌入（多数云不可用，仅作兼容）。 |

## 如何改指标

编辑 **`metrics-config.js`** 中的 `window.OPS_METRICS`：

```js
{ id: "m1", name: "指标一", account: "aa1007777119", url: "https://...", openExternal: false }
```

- **name**：左侧名称主标题。
- **account**：**主体账号标识**，侧栏显示为 **`名称 (account)`**（与《大派对资源费用相关》表一致时可填 `aa…` / `hsxc95` 等）。
- **url**：完整监控页地址。
- **openExternal** 仅在 `OPS_VIEW_MODE === "iframe"` 时生效（为 true 则不调 iframe）。

## 嵌入被禁止的由来（简述）

防 **点击劫持**：不允许陌生父页面把登录态控制台框在自己的 iframe 里诱导操作。因此「真·内嵌官方控制台」在合规产品里通常**故意不可行**；命名窗口 / 分屏是折中。

## 开源监控补一句

Grafana、Uptime Kuma、Netdata 等适合**自有指标/可用性**；是否合规取决于**自建、内网、密钥管理**。不要把云 AK 交给来源不明的第三方「一站式代管」。
