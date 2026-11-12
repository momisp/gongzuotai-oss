# 运维监控 · Electron 外壳（侧栏 + 独立控制台窗口）

用 **Electron** 做「自己做壳」的最小可行版：**窄条侧栏**里点指标，在**另一扇独立 BrowserWindow** 里用 **顶层**方式 `loadURL` 打开阿里云等控制台——等同日常浏览器直接打开该地址，**不搞 iframe**，一般可正常登录与操作。

## 环境

- 已安装 **Node.js**（建议 LTS 18+）

## 安装与启动

```powershell
cd "c:\Users\yzyz\Desktop\测试点生成\运维\monitor-electron"
npm install
npm start
```

首次 `npm install` 会下载 Electron，体积较大，仅本机开发机使用即可。

本目录已带 **`.npmrc`**：使用 `npmmirror` 的 npm 源与 **Electron 二进制镜像**，可降低 `read ECONNRESET`、下载到一半断开等概率。

### 若仍报错 `RequestError: read ECONNRESET`（装 Electron 时）

1. **删掉半成品后重装**（在项目根目录 PowerShell）：

   ```powershell
   Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
   Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
   npm cache clean --force
   npm install
   ```

2. **公司代理**：配置系统或当前终端的 `HTTP_PROXY` / `HTTPS_PROXY`，再执行 `npm install`。

3. **一键脚本**：双击 **`install-cn.bat`**（已设 `ELECTRON_MIRROR` 并清理后重装）。

4. 仍不行时把完整日志末尾几十行（含 `npm error`）发出来再继续排查。

## 改指标

编辑同目录 **`metrics.json`**：

- `metrics`：每项包含 `name`（侧栏摘要名）、**`account`（主体账号，括号里显示）**、`url`。若需导出的 Sheet1 **与台账表一致地带上 ECS 快照数字**，可按需增加可选字段：**`ecsCpu`**、**`ecsMemory`**、**`ecsDiskSystem`**、**`ecsDiskData`**、**`ecsExpireAt`**（不设则巡检列为空）。
- 点击后主进程会对该 **`url`** 做一次 **HTTPS/TLS 握手**，弹出与服务端一致的**颁发对象 / 颁发者 / 有效期起止**（与浏览器里点锁查看的为同一张叶子证书）；**同时也会打开该网址**。该弹框为**独立系统对话框（不堵住侧栏「运维」菜单）**，可随时再点「每日巡检」。无法实现「系统自动打开 Chromium 内置证书图形窗口」（无此类 API）。
- 保存后**重启** `npm start` 生效（如需热更新可再迭代 main 里监听文件）

账号取值与《大派对资源费用相关1.xlsx》一致：`aa1007777119`、`aa1007777120`、短信控制台 `hsxc95` 等。

## 使用习惯

- 侧栏窗可拖在屏幕左侧，控制台大窗在右侧，接近「左导航 + 右内容」。
- 同一扇大窗会**复用**：换指标时只在当前大窗里跳转，不会无限新开（除非你关了大窗再点，会再建一扇）。

## 侧栏与大窗磁吸排布

- 打开监控大窗并点击侧栏指标后，大窗会**自动贴到侧栏右边缘**，高度与侧栏对齐。
- 拖动或改变**侧栏窗口**大小时，大窗会**跟随**（短延迟防抖）。
- 可在菜单 **运维 → 侧栏与大窗磁吸排布** 取消勾选以关闭磁吸。

## 运维 → 每日巡检

串联 **`钉钉报告推送`** 与可选的 **`auto-inspection`**。仓库内已带 **`运维/auto-inspection/config.yaml`**（与 `config.example.yaml` 同结构）；在本机环境变量中配置 **`ALIBABA_CLOUD_ACCESS_KEY_ID`** / **`ALIBABA_CLOUD_ACCESS_KEY_SECRET`** 并保证 RAM 具备 ECS/云监控读权限后，每日巡检会合并 **ECS 云监控文字简报**；若未配置或接口失败，则仅合并浏览器段。

**1）仅浏览器 / TLS（无可用 `config.yaml`、或 API 段执行失败回退时）**

- 对**当前已打开**的各主体监控大窗逐个 **截图**（`capturePage`）；并对 `metrics.json` 中配置了 **`openCertExpiry: true`** 的条目生成「证书卡片」快照。**截图默认仅写入本地**（Excel/Markdown）；钉钉仅推送文字简报（不写图）。
- 读取**窗口标题、页面 URL、主体账号**，以及每条 HTTPS 证书对应的域名等信息写入 Markdown。
- 在应用 **用户数据目录** 下的 `ops-snapshots` 中生成本地 **`Daily_Inspection_Report_YYYYMMDD_HHmmss.xlsx`**：**版式对齐**台账工作簿 **`大派对资源费用相关*.xlsx`**——**Sheet1** 为「实例 / 阿里云账号 / 备注」及 cpu～到期时间列（可在 `metrics.json` 单笔资源上选配填 `ecsCpu`、`ecsMemory`、`ecsDiskSystem`、`ecsDiskData`、`ecsExpireAt`），并追加巡检列：**巡检截图路径、HTTPS证书截止、巡检备注**；**域名主体相关**见 **`运维/domain-inventory.json`**（已按你家表填入模板，可自行改）；另有 **巡检过程明细**记录抓拍顺序。含时间戳避免同日多次覆盖，可在资源管理器中打开或通过路径分享。
- 调用 `钉钉报告推送/send_ops_report.py`，钉钉**仅 text 简报**，**不再向群聊发图片**；完整 Markdown 与 Excel 在本地留存。
- **请在此前已从侧栏打开至少一扇大窗并登录**，或配置了带 `openCertExpiry` 的 https 条目；否则会提示先打开窗口/检查配置。

**2）有 `config.yaml`**

- 运行 `python -m inspection.runner --no-dingtalk`（每日巡检会附加 **`--dashboard-json`**），把 `logs/report_*.md` **接在**浏览器段落后一并推送（**预警时退出码 1**，仍合并报告并发钉钉）。
- **云监控**：`cloud_monitor` 开启且 ECS 命中过滤时，抓取各实例 **CPU / 内存 / 磁盘** 最近一次采样（需 Agent + RAM `cms:DescribeMetricLast`）；阈值见 `auto-inspection` 目录下 `config.example.yaml`（`memory_warn`、`disk_warn` 等）。
- **钉钉**：`manifest.json` **始终**带有 `dingTalkBriefText`。含 ECS dashboard 时为**云监控文字简报**（text）；仅为浏览器巡检时为控制台/TLS **短文简报**。Electron 固定传 `--no-images`，不在群内发截图。
- **Excel**：自动写入 **「ECS巡检日报」** sheet；有 ECS 快照时文件名为 **`ECS_应用分组巡检简报_YYYYMMDD_HHmmss.xlsx`**（与仓库内《ECS_应用分组巡检简报》版式一致）。巡检人员：`OPS_INSPECTOR`；范围话术：`config.yaml` 的 **`ecs.report_scope`** / **`application_group_hint`**。
- **运维 → 运维巡检记录**：列出 `userData/ops-snapshots` 下历史 `.xlsx`，单击打开；右键在资源管理器中定位。

**公共前置条件：**

- 本机 `PATH` 中有 **`python`**（或环境变量 **`OPS_PYTHON`**）。
- **`运维/钉钉报告推送`** 已 `pip install -r requirements.txt`，并已配置 **`.env` 或 `env`**（`DINGTALK_WEBHOOK` 等）。

可选（仅 API 巡检）：`config.yaml` 与阿里云 AK 按 **`auto-inspection`** 目录说明配置。

完成每日巡检对话框后常会 **在资源管理器中定位**生成的 xlsx；失败时会显示错误摘要。

## 多主体账号 · 独立窗口与登录态

- `metrics.json` 里每项的 **`account`**（如 `aa1007777119`、`hsxc95`、`aa1007777120`）决定使用哪扇**独立大窗**、哪套 **持久会话**（`partition: persist:ops-...`）。
- **相同 `account`** 的入口共用**同一扇窗、同一登录态**（例如 OSS 与 CDN 同为 `aa1007777120` 时只开一扇）。
- **不同 `account`** 互不共享 Cookie，可同时保留 **多个主账号/登录身份** 的登录（需各自点开过一次以创建窗口）。
- 磁吸排布时，多扇大窗在侧栏右侧**从左到右**依次排列（按首次打开的账号顺序）。
- **大窗标题**：随网页标题变化，并在末尾自动附加 **` · 主体账号`**，便于区分会话。

## 侧栏指标备注

- 每项右侧 **「备注」** 可打开编辑框，内容保存在用户数据目录下的 **`metric-remarks.json`**（按 `metrics.json` 的 **id** 区分）。
- 有内容的备注按钮会以浅色高亮，便于一眼识别。

## 与网页版、与 Tauri 对比

| 方案 | 特点 |
|------|------|
| **本 Electron 壳** | 上手快，Windows 资料多；安装包体积偏大。 |
| **浏览器 + 命名窗口 / 本地 HTTP** | 零安装；依赖浏览器策略。 |
| **Tauri** | 包体更小、Rust 依赖；需另装 Rust 工具链，略重。若以后要打成超小安装包可再迁 Tauri。 |

## 登录态为什么重启后没了？

常见原因：

1. **在终端里用 `Ctrl+C` 强杀 `npm start`**：子进程被硬中断，Chromium 可能来不及把 Cookie 写盘。  
   **建议**：先关掉所有 Electron 窗口（或用菜单 **文件 → 退出**），再在终端停止；或直接关窗口让进程正常退出。
2. **阿里云侧会话过期 / 安全策略**：与是否 Electron 无关，服务端失效就要重登。
3. **本应用用户数据目录**（Cookie 存在此目录）：Windows 一般在  
   `%APPDATA%\ops-monitor-shell`（与 `package.json` 里的 `name` 一致）。  
   若误删该文件夹、或用清理软件清「Electron/浏览器数据」，登录也会丢。

已在 `main.js` 里处理：**退出前**先对当前所有窗口与各 `persist:ops-*` 分区调用 **`session.flushStorageData()`**（尽力落盘 **localStorage** 等，阿里云 SSO 常依赖）；再 **`cookies.flushStore`**；等待约 **1.2s** 后 **`app.quit()`**。  
 **`before-quit` 处理器必须同步调用 `preventDefault`，异步收尾用 Promise 链**——若把整个回调写成 `async`，Electron 不等待，`preventDefault` 后的落盘容易与退出竞态，看起来像「点了退出又掉登录」。
同时为控制台分区会话设置 **与 Chromium 内核版本一致的 Chrome 风格 User-Agent**（去掉默认串里的 “Electron” 标识），减少对阿里云等站点会话策略的干扰。**升级后建议你重新完整登录一次**以建立与新 UA、新刷盘路径一致的状态。

调试时可设置环境变量 **`OPS_DEBUG=1`** 再 `npm start`，控制台会打印 `userData` 路径。

## 安全说明

- 侧栏为本地静态页；控制台仍渲染在 **Chromium** 里，与用 Chrome 类似。
- **不要**把阿里云 AK 写进本仓库；控制台登录仍走官方页面。
- 公司环境若禁止 Electron/未签名 exe，需走内部软件白名单或自行打包签名。

## 打包成 exe（可选）

可参考 [Electron Forge](https://www.electronforge.io/) 或 `electron-builder`，此处不展开，需要时可再加配置。
