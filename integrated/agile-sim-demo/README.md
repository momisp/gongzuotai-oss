# agile-sim-demo

敏捷多角色流水线演示：产品经理 HTML 原型 → UI 优化 → 全栈拆分为静态 `app/`，并提供 **测试点**（`测试点.md`）与 **运维手册**（`运维手册.md`）生成。

## 运行

**一键启动（推荐，Windows 双击）**

```text
双击项目根目录「一键启动.bat」
```

或在项目目录执行：

```bash
npm start
```

脚本会：若无 `node_modules` 则先 `npm install` → 启动前后端 → 等待 **5173 / 5180** 就绪 → **自动打开浏览器** `http://127.0.0.1:5173`。

**手动开发模式**

```bash
npm install
npm run dev
```

浏览器打开 Vite 提示的地址（默认 `http://127.0.0.1:5173`）。API 与静态产物由同级 `server/index.mjs` 提供（默认 `http://127.0.0.1:5180`）。

**开发模式**下，页面会**直连** `http://127.0.0.1:5180` 请求 `/api` 与 `/generated`，避免经 Vite 代理的长 SSE 被中途断开；请保证本机 5180 已启动（`npm run dev` 会同时拉起）。

生成文件写入仓库下的 `generated/<sessionId>/`（含 `cursor_cloud.json` 用于 Cursor Cloud 多阶段 follow-up）。

## 角色技能 skills/roles/

每个角色（PM / UI / 全栈 / 测试 / 运维）的 **system prompt 与画像** 抽到 `skills/roles/<role>/SKILL.md`，服务端启动时读入。修改这些 Markdown 后**无需重启代码改逻辑**，下次发起请求即生效（按需可重启服务清缓存）。

每个角色 Tab 下方都有「**追问对话**」面板：完成主输出后，可继续与同角色多轮对话，模型回复中的 `### FILE: 路径` 段会按相对会话目录落盘（如 `prototype.html` 改写、`测试点.md` 补丁等）。对话历史保存在 `generated/<sessionId>/conversations/<role>.jsonl`。

## 模型后端

### OpenAI 兼容（HTTP）

填写 Base URL（如 `https://api.openai.com/v1`）、API Key、模型名即可，走标准 `chat/completions` 流式。

### Cursor Cloud Agents

使用 [Cursor Cloud API](https://api.cursor.com)（`fetch`，无 `@cursor/sdk`，避免本机编译原生依赖）。

- 在 Cursor 控制台准备 **User API Key**，并在 **Integrations** 中为 Cloud Agents 授权目标 **GitHub 仓库**。
- 本页填写：`Cursor API Key`、仓库 **HTTPS URL**、**分支名**（默认 `main`）。
- 流程：**每次执行「产品经理」**会 `POST /v1/agents` **新建一个 Agent**（首轮通常最慢）；**同一 `sessionId` 下**后续「UI」「全栈」「测试岗」「运维岗」只 **`POST /v1/agents/{id}/runs`** 复用该 Agent，不重复创建。重置会话或重新跑产品经理生成新会话后会再建新 Agent。
- 本地 `prototype.html` / `ui.html` / `app/*` 以及 **`测试点.md` / `运维手册.md`** 仍由服务端根据 SSE 中的助手文本解析并写入，与远端仓库实际改动可能不同，以流式输出为准。

### 测试 / 运维 Markdown

- 接口：`POST /api/pipeline/qa`、`POST /api/pipeline/ops`（SSE，与前几步相同）。
- 产物路径：`generated/<sessionId>/测试点.md`、`generated/<sessionId>/运维手册.md`。
- OpenAI 兼容路线可在仅填写说明的情况下自动生成新的 `sessionId`；带上参考图时请使用支持 vision 的模型（如 GPT-4o 系列）。
- Cursor Cloud：**必须先完成「产品经理」**，以便本地存在 `cursor_cloud.json`（测试/运维为 follow-up Run）；截图会转为文字占位说明传给远端。

### 排查「请求已中断」、预览 404

1. 浏览器 **F12 → Network**，找 `pipeline/pm`：若状态为 **(canceled)**，说明连接在浏览器侧被取消，勿在跑第一步时刷新/关页。
2. 在运行 `npm run dev` 的终端设置 **`AGILE_SIM_DEBUG=1`**（PowerShell：`$env:AGILE_SIM_DEBUG='1'`）后重启，控制台会出现 **`[agile-sim]`** 前缀日志（创建 Agent 前后等）。
3. **Cursor SSE 长时间不结束**：若界面卡在「订阅运行流（SSE）」不动，多为上游流未关闭。服务端会在收到 **`result` / 终态 `status`** 后主动结束读取，并可用环境变量 **`AGILE_SIM_CURSOR_SSE_MAX_MS`**（默认 45 分钟）限制最长等待。运行中遮罩会显示**已耗时、流式字数、最近动态**；「活动度」仅表示有输出在增长，不是准确剩余进度。
4. 页面上 **「其他配置」→「测试后端连接」** 可确认本机 **5180** 是否正常。
