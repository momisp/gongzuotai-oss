import express from "express";
import cors from "cors";
import { spawn } from "child_process";
import { mkdir, writeFile, readFile, copyFile, access, readdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { randomBytes, createHash } from "crypto";
import { existsSync, statSync } from "fs";
import {
  openFolderInOS,
  formatGeneratedRelative,
  resolveOpenableDir,
} from "./open-folder.mjs";
import {
  normalizeFsChatPath,
  isValidArtifactContent,
  syncRootAppFilesIntoAppDir,
  promoteAppSubfolderIfNeeded,
} from "./fs-artifacts.mjs";
import { smokeCheckAppDir } from "./app-smoke.mjs";
import {
  loadDataVerifySkill,
  parseJsonLoose,
  normalizeExtractResult,
  normalizeSqlResult,
  buildExtractMessages,
  buildExtractVisionMessages,
  buildSqlMessages,
  resolveDataVerifyLlm,
} from "./data-verify.mjs";
import {
  parseTestPointsFromMd,
  repairTestPointMdIfNeeded,
  repairStandaloneTestPointMd,
  buildStandaloneQaMessages,
  buildStandaloneFrameworkMessages,
  buildStandaloneBizScenarioMessages,
  buildStandaloneSpecialMessages,
  buildStandaloneReviewMessages,
  buildStandalonePlaywrightSpecMessages,
  reviewNeedsRework,
  extractPlaywrightSpecTs,
  looksLikePlaywrightSpec,
  guessPlaywrightBaseUrl,
  normalizePlaywrightBaseUrl,
  rewritePlaywrightBaseUrl,
  sanitizePlaywrightSpecTs,
  parseSmokePlaywrightFromMd,
  readSessionPlaywrightSmoke,
  readSessionTestMd,
  writeSessionTestMd,
  buildPipelineTestGenMessages,
  QA_PIPELINE_STYLE_HINT,
  QA_PIPELINE_GEN_SYS,
  runPlaywrightAppSmoke,
  runPlaywrightForTestPoint,
  launchPlaywrightBrowser,
  buildPointCheckMessages,
  parsePointCheckJson,
} from "./qa-pipeline.mjs";
import { fetchRenderedPrototypeContext } from "./fetch-prototype-rendered.mjs";
import { registerGameDevPipeline } from "./game-dev-pipeline.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const GEN = path.join(ROOT, "generated");
const SKILLS_DIR = path.join(ROOT, "skills");

/** 将 relativePath 安全拼到单一 session 根目录下，防 .. 逃逸；非法返回 null */
function safeJoinUnderSession(sessionDirAbs, relativePathRaw) {
  const rel = String(relativePathRaw || "").replace(/\\/g, "/").replace(/^[/\\]+/, "");
  const parts = rel.split("/").filter((p) => p && p !== "." && p !== "..");
  if (parts.length === 0) return null;
  const abs = path.resolve(sessionDirAbs, ...parts);
  const root = path.resolve(sessionDirAbs);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

const ROLE_DIRS = {
  pm: "pm",
  ui: "ui",
  fs: "fullstack",
  fullstack: "fullstack",
  qa: "qa",
  ops: "ops",
};

/** 框架扫描动画 B1：前端播完后 POST /api/qa/scan-ack */
const scanAckWaiters = new Map();

function waitForScanAck(sessionId, timeoutMs = 20000) {
  const id = String(sessionId || "").trim();
  if (!id) return Promise.resolve({ ok: false, reason: "no-session" });
  return new Promise((resolve) => {
    const prev = scanAckWaiters.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    const timer = setTimeout(() => {
      scanAckWaiters.delete(id);
      resolve({ ok: false, reason: "timeout" });
    }, timeoutMs);
    scanAckWaiters.set(id, {
      timer,
      resolve: (v) => {
        clearTimeout(timer);
        scanAckWaiters.delete(id);
        resolve(v);
      },
    });
  });
}

function resolveScanAck(sessionId) {
  const id = String(sessionId || "").trim();
  const w = scanAckWaiters.get(id);
  if (!w) return false;
  w.resolve({ ok: true });
  return true;
}

/** 把 SKILL.md 正文（去掉 YAML frontmatter）作为 system prompt 返回；失败时回退到 fallback */
async function loadRoleSkill(role, fallback) {
  const sub = ROLE_DIRS[role];
  if (!sub) return String(fallback || "");
  const p = path.join(SKILLS_DIR, "roles", sub, "SKILL.md");
  try {
    let md = await readFile(p, "utf8");
    if (/^---\s*\r?\n/.test(md)) {
      md = md.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/, "");
    }
    md = md.trim();
    return md || String(fallback || "");
  } catch {
    return String(fallback || "");
  }
}

/** 加载 skills/ 下任意相对路径的 SKILL.md（如 playwright-debug/SKILL.md） */
async function loadSkillFile(relPath, fallback = "") {
  const p = path.join(SKILLS_DIR, ...String(relPath || "").split(/[/\\]+/).filter(Boolean));
  try {
    let md = await readFile(p, "utf8");
    if (/^---\s*\r?\n/.test(md)) {
      md = md.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/, "");
    }
    md = md.trim();
    return md || String(fallback || "");
  } catch {
    return String(fallback || "");
  }
}

const PW_DEBUG_SKILL_FALLBACK =
  "你是资深 Playwright 工程师。禁止 page.goto('/')；/preview/ 须进 iframe；" +
  "真实测试环境通常无预览壳。避开「原型说明」浮层的重复文案/输入框；" +
  "易撞车文案用 exact 或 #id。修复时输出完整 typescript 代码块。";

async function loadPlaywrightDebugSkill() {
  return loadSkillFile("playwright-debug/SKILL.md", PW_DEBUG_SKILL_FALLBACK);
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "22mb" }));

const DEBUG_PIPELINE = process.env.AGILE_SIM_DEBUG === "1";
function dbg(...args) {
  if (DEBUG_PIPELINE) console.log("[agile-sim]", new Date().toISOString(), ...args);
}

/** 仅在 req.aborted 为真时中止（aborted / close 任一命中）。避免过去仅用 close 导致的误杀。 */
function bindClientDisconnectAbort(req, res, ac, routeLabel) {
  const maybeAbort = (why) => {
    if (res.writableEnded) return;
    if (!req.aborted) {
      dbg("skip abort (req.aborted is false)", why, routeLabel);
      return;
    }
    dbg("AbortController", why, routeLabel);
    ac.abort();
  };
  req.on("aborted", () => maybeAbort("event:aborted"));
  req.on("close", () => maybeAbort("event:close"));
}

/** 将 relativePath 约束在 generated/ 下，返回绝对路径；非法则 null */
function resolveUnderGeneratedDir(relRaw) {
  const rel = String(relRaw || "").replace(/\\/g, "/").trim();
  const parts = rel
    .split("/")
    .filter((p) => p && p !== "." && p !== "..");
  if (parts.length === 0) return null;
  if (parts[0] !== "generated") return null;
  const abs = path.resolve(ROOT, ...parts);
  const genRoot = path.resolve(GEN);
  const toGen = path.relative(genRoot, abs);
  if (toGen.startsWith("..") || path.isAbsolute(toGen)) return null;
  return abs;
}

app.post("/api/open-folder", async (req, res) => {
  const sid = String(req.body?.sessionId || "").trim();
  let rel = formatGeneratedRelative(req.body?.relativePath);
  if (!rel.startsWith("generated/")) {
    if (sid) rel = `generated/${sid}/app`;
  }
  if (rel.endsWith(".js") || rel.endsWith(".html")) {
    rel = rel.replace(/\/[^/]+\.(js|html)$/i, "/app");
  }
  let abs = resolveUnderGeneratedDir(rel);
  if (sid) {
    const appDir = path.join(GEN, sid, "app");
    if (existsSync(appDir)) {
      try {
        if (statSync(appDir).isDirectory()) abs = appDir;
      } catch {
        /* ignore */
      }
    }
  }
  const openDir = abs ? resolveOpenableDir(abs) : null;
  if (!openDir) {
    return res.status(400).json({
      ok: false,
      error: `路径无效或目录不存在：${rel || "(空)"}（须为 generated/…/app 文件夹）`,
      tried: abs || null,
    });
  }
  try {
    const openedAbs = await openFolderInOS(openDir);
    res.json({
      ok: true,
      path: formatGeneratedRelative(path.relative(ROOT, openDir)),
      openedAbs,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e), path: rel });
  }
});

/** 全栈 app 目录自检（追问改代码后可选触发） */
app.post("/api/fs/smoke-check", async (req, res) => {
  const sessionId = String(req.body?.sessionId || "").trim();
  if (!sessionId) return res.status(400).json({ ok: false, error: "缺少 sessionId" });
  const appDir = path.join(GEN, sessionId, "app");
  if (!existsSync(appDir)) {
    return res.status(400).json({ ok: false, error: "app 目录不存在，请先完成全栈落地" });
  }
  const result = await smokeCheckAppDir(appDir);
  res.json({ ok: true, sessionId, ...result });
});

/** 把会话根目录误写的 index.html 等同步进 app/，并供前端「刷新预览」 */
app.post("/api/fs/sync-app-preview", async (req, res) => {
  const sessionId = String(req.body?.sessionId || "").trim();
  if (!sessionId) return res.status(400).json({ ok: false, error: "缺少 sessionId" });
  const sessionDir = path.join(GEN, sessionId);
  if (!existsSync(sessionDir)) {
    return res.status(400).json({ ok: false, error: "会话目录不存在" });
  }
  const synced = await syncRootAppFilesIntoAppDir(sessionDir);
  const promoted = await promoteAppSubfolderIfNeeded(sessionDir);
  res.json({ ok: true, sessionId, synced, promoted });
});

/** 将某方案变体复制为下游使用的 canonical 文件，并写入 plan.json */
app.post("/api/session/finalize", async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || "").trim();
    const role = String(req.body?.role || "").toLowerCase();
    const idx = Math.max(0, Math.min(2, Number(req.body?.solutionIndex) || 0));
    if (!sessionId) return res.status(400).json({ ok: false, error: "缺少 sessionId" });
    if (role !== "pm" && role !== "ui") {
      return res.status(400).json({ ok: false, error: "role 须为 pm 或 ui" });
    }
    const sessionDir = path.join(GEN, sessionId);
    if (!existsSync(sessionDir)) {
      return res.status(400).json({ ok: false, error: "会话目录不存在" });
    }
    const variant = role === "pm" ? pmVariantFile(idx) : uiVariantFile(idx);
    const canonical = role === "pm" ? "prototype.html" : "ui.html";
    const variantPath = path.join(sessionDir, variant);
    const canonicalPath = path.join(sessionDir, canonical);
    let src = variant;
    try {
      await access(variantPath);
    } catch {
      if (idx === 0) {
        try {
          await access(canonicalPath);
          src = canonical;
        } catch {
          return res.status(400).json({
            ok: false,
            error: `未找到 ${variant}，请先生成该方案预览`,
          });
        }
      } else {
        return res.status(400).json({
          ok: false,
          error: `未找到 ${variant}，请先生成该方案预览`,
        });
      }
    }
    if (src !== canonical) {
      await copyFile(path.join(sessionDir, src), canonicalPath);
    }
    const planPath = path.join(sessionDir, "plan.json");
    let plan = {};
    try {
      plan = JSON.parse(await readFile(planPath, "utf8"));
    } catch {
      /* new plan */
    }
    if (role === "pm") plan.pmFinalized = idx;
    else plan.uiFinalized = idx;
    plan.updatedAt = Date.now();
    await writeFile(planPath, JSON.stringify(plan, null, 2), "utf8");
    res.json({ ok: true, sessionId, role, solutionIndex: idx, plan });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    rootDir: ROOT,
    generatedDir: GEN,
    skillsDir: SKILLS_DIR,
    features: {
      prototypeRender: true,
      /** ③功能点「评审」模式；缺此标记时工作台会重启旧 Node 进程 */
      funcReview: true,
      /** 独立测试点 Cursor 复用同一 Agent（followup），避免一键撞并发上限 */
      cursorQaAgentReuse: true,
      /** 游戏多角色流水线（开发↔四 skill 两轮） */
      gamePipeline: true,
    },
    pipelineDebug: DEBUG_PIPELINE,
    hint:
      "第一步若总显示「请求已中断」：在运行 dev 的终端设置 AGILE_SIM_DEBUG=1（Windows: set AGILE_SIM_DEBUG=1）后重启，再试一次并查看以 [agile-sim] 开头的日志；另在浏览器 F12 → Network 查看 /api/pipeline/pm 是否被浏览器取消。",
  })
);

function sseInit(res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
}

function sseSend(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

/** SSE comment lines — keep proxies/browsers from closing idle long-poll connections */
function startSseKeepalive(res, intervalMs = 5000) {
  const id = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(id);
      return;
    }
    res.write(`: keepalive ${Date.now()}\n\n`);
  }, intervalMs);
  return () => clearInterval(id);
}

function normalizeBaseUrl(u) {
  const s = String(u || "").trim().replace(/\/+$/, "");
  return s || "https://api.openai.com/v1";
}

/** 拉长 undici 超时，避免火山 chat/completions 等响应头时 UND_ERR_HEADERS_TIMEOUT */
let _llmDispatcher = null; // null=未初始化；false=不可用；Agent=可用
async function getLlmDispatcher() {
  if (_llmDispatcher !== null) return _llmDispatcher || undefined;
  try {
    const { Agent } = await import("undici");
    _llmDispatcher = new Agent({
      connect: { timeout: 60_000 },
      headersTimeout: 600_000,
      bodyTimeout: 600_000,
      keepAliveTimeout: 30_000,
    });
  } catch (e) {
    console.warn("[llm] undici Agent 不可用，使用默认 fetch 超时:", e?.message || e);
    _llmDispatcher = false;
  }
  return _llmDispatcher || undefined;
}

async function llmFetch(url, init) {
  const dispatcher = await getLlmDispatcher();
  const opts = dispatcher ? { ...init, dispatcher } : init;
  return fetch(url, opts);
}

async function openAiStyleStream({ baseUrl, apiKey, model, messages, signal, temperature = 0.4 }) {
  const url = `${normalizeBaseUrl(baseUrl)}/chat/completions`;
  const r = await llmFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature,
    }),
    signal,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`LLM HTTP ${r.status}: ${t.slice(0, 800)}`);
  }
  return r.body;
}

/** 读完 OpenAI 兼容 SSE，拼出完整文本（比非流式更早收到响应头，少触发 HEADERS_TIMEOUT） */
async function readOpenAiStreamToText(body, signal) {
  if (!body) return "";
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let out = "";
  for (;;) {
    if (signal?.aborted) throw new Error("aborted");
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n");
    buf = parts.pop() || "";
    for (const line of parts) {
      const s = line.trim();
      if (!s.startsWith("data:")) continue;
      const payload = s.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload);
        const delta =
          j.choices?.[0]?.delta?.content ??
          j.choices?.[0]?.message?.content ??
          "";
        if (delta) out += delta;
      } catch {
        /* ignore partial */
      }
    }
  }
  return out;
}

async function nonStreamCompletion({
  baseUrl,
  apiKey,
  model,
  messages,
  signal,
  preferStream = true,
  temperature = 0.4,
}) {
  const url = `${normalizeBaseUrl(baseUrl)}/chat/completions`;
  const attempt = async (useStream) => {
    const r = await llmFetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: !!useStream,
        temperature,
      }),
      signal,
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`LLM HTTP ${r.status}: ${t.slice(0, 800)}`);
    }
    if (useStream) {
      return readOpenAiStreamToText(r.body, signal);
    }
    const j = await r.json();
    return j.choices?.[0]?.message?.content ?? "";
  };

  try {
    if (preferStream) {
      try {
        return await attempt(true);
      } catch (e) {
        const msg = String(e?.message || e);
        // 个别网关不支持 stream：回退非流式
        if (/stream|Unsupported|400|404/i.test(msg) && !/401|403|Invalid/i.test(msg)) {
          return await attempt(false);
        }
        throw e;
      }
    }
    return await attempt(false);
  } catch (e) {
    const cause = e?.cause?.code || e?.cause?.message || "";
    const msg = String(e?.message || e);
    if (/abort/i.test(msg)) throw e;
    if (/LLM HTTP/i.test(msg)) throw e;
    throw new Error(
      `LLM 网络失败: ${msg}${cause ? ` (${cause})` : ""}。请检查本机能否访问 ${normalizeBaseUrl(baseUrl)}，或去掉截图重试`
    );
  }
}

function extractMarkdown(raw) {
  let t = String(raw || "").trim();
  const fence =
    /```(?:md|markdown)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1].trim();
  return t;
}

function extractHtml(raw) {
  let t = String(raw || "").trim();
  const fence = /```(?:html)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1].trim();
  if (t.toLowerCase().startsWith("<!doctype") || t.includes("<html")) return t;
  // 片段 HTML（无 html 包裹）
  if (/<body[\s>]/i.test(t)) {
    const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(t);
    if (body) {
      return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><title>原型</title></head>${body[0]}</html>`;
    }
  }
  if (/<(div|section|main|button|input|form|h1|p|span)\b/i.test(t)) {
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><title>原型</title></head><body>${t}</body></html>`;
  }
  // 纯文本 / 仅链接说明：包一层避免 iframe 里只有裸链
  const esc = t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const linked = esc.replace(/(https?:\/\/[^\s<>]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><title>原型</title><style>body{font-family:system-ui,sans-serif;padding:1.2rem;line-height:1.5;max-width:52rem}</style></head><body><p><strong>模型未返回完整 HTML，以下为原文（可按链接打开）：</strong></p><div style="white-space:pre-wrap;border:1px solid #ccc;padding:12px;border-radius:8px">${linked}</div></body></html>`;
}

function cursorStreamAssistantDelta(data) {
  if (!data || typeof data !== "object") return "";
  if (typeof data.text === "string") return data.text;
  const msg = data.message;
  if (msg?.content && Array.isArray(msg.content)) {
    return msg.content
      .map((c) => (c && typeof c.text === "string" ? c.text : ""))
      .join("");
  }
  if (typeof data.content === "string") return data.content;
  return "";
}

function parseDelimitedFiles(raw) {
  const text = String(raw || "");
  const re = /###\s*FILE:\s*([^\r\n]+)\s*\r?\n([\s\S]*?)(?=###\s*FILE:|$)/gi;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const p = m[1].trim();
    const c = m[2].replace(/\r\n/g, "\n").trimEnd();
    if (p) out.push({ path: p.replace(/^[/\\]+/, ""), content: c });
  }
  return out;
}

const PM_FALLBACK_SYS =
  "你是资深产品经理。输出只包含一个完整 HTML 文件源代码（单文件，内联 CSS 与 JS，可直接另存为 .html 用浏览器打开）。不要 Markdown。界面要有清晰标题、与需求相关的可交互控件、简单状态反馈（如按钮点击后更新一行文字）。";
const UI_FALLBACK_SYS =
  "你是资深 UI 设计师。在保持交互与信息结构的前提下优化视觉：排版、对比度、间距、字体层级、圆角与按钮状态。输出仍是单文件 HTML（内联 CSS/JS），不要 Markdown。";
const FS_FALLBACK_SYS =
  "你是资深全栈工程师。请将界面落地为「可文件夹运行」的静态小项目：拆成 index.html、styles.css、app.js 三个文件，并附 README.md（说明如何本地打开或 npx serve）。严格按下面模板输出，勿用 Markdown 代码块，勿加多余说明：\n\n### FILE: index.html\n...\n### FILE: styles.css\n...\n### FILE: app.js\n...\n### FILE: README.md\n...\n\n要求：index.html 用 <link href=\"styles.css\"> 与 <script src=\"app.js\" defer></script>；实现需求中的交互逻辑；兼容现代浏览器直接打开（可用相对路径）。";

function pmVariantFile(idx) {
  return `prototype-${Math.max(0, Math.min(2, Number(idx) || 0))}.html`;
}

function uiVariantFile(idx) {
  return `ui-${Math.max(0, Math.min(2, Number(idx) || 0))}.html`;
}

const PM_SPEC_FILE = "需求文档.md";

const PM_SPEC_SYS =
  "你是资深产品经理。根据用户原始需求（及附图说明）输出**标准产品需求文档（PRD）**，使用简体中文 Markdown。\n" +
  "必须包含章节（用 ## 标题）：\n" +
  "## 1. 背景与目标\n## 2. 用户与场景\n## 3. 功能范围（核心流程）\n## 4. 非功能要求\n" +
  "## 5. 界面与信息结构要点\n## 6. 边界与异常（空态、错误、权限）\n## 7. 验收标准（可测试条目）\n## 8. 待定项与风险\n" +
  "禁止寒暄；不要用 Markdown 代码围栏包裹全文；内容应可直接保存为 .md。";

async function buildPmSpecMessages(requirementText) {
  return [
    { role: "system", content: PM_SPEC_SYS },
    {
      role: "user",
      content: `【用户原始需求】\n${requirementText}\n\n请输出完整需求文档。`,
    },
  ];
}

async function buildPmSpecVisionUserContent({ requirementText, images }) {
  const base = await buildPmSpecMessages(requirementText);
  const txt = typeof base[1].content === "string" ? base[1].content : "";
  const parts = [{ type: "text", text: txt }];
  for (const im of images || []) {
    const mime = String(im?.mime || "image/png");
    const b64 = String(im?.base64 || "").trim();
    if (!b64) continue;
    const url = /^data:/.test(im?.dataUrl || "")
      ? String(im.dataUrl).trim()
      : `data:${mime};base64,${b64}`;
    parts.push({ type: "image_url", image_url: { url } });
  }
  return [...base.slice(0, 1), { role: "user", content: parts }];
}

function pickVisionModel(model) {
  const m = String(model || "").trim();
  if (!m) return "gpt-4o-mini";
  // Cursor 侧 Model ID 不能拿去打 OpenAI 兼容识图
  if (/^composer/i.test(m)) return "gpt-4o-mini";
  // 信任用户配置（含火山 ep-、自建部署 id、gpt-4o 等）
  return m;
}

async function saveReqRefImages(sessionDir, images) {
  const dir = path.join(sessionDir, "req-refs");
  await mkdir(dir, { recursive: true });
  let i = 0;
  for (const im of images || []) {
    const b64 = String(im?.base64 || "").trim();
    if (!b64) continue;
    const mime = String(im?.mime || "image/png").split(";")[0];
    const ext = mime.includes("png")
      ? "png"
      : mime.includes("webp")
        ? "webp"
        : mime.includes("gif")
          ? "gif"
          : "jpg";
    await writeFile(
      path.join(dir, `ref-${i}.${ext}`),
      Buffer.from(b64, "base64")
    );
    i++;
  }
  return i;
}

/** 用 OpenAI 兼容视觉接口把参考图转成文字，供 Cursor Cloud 写 PRD/原型时引用 */
async function describeReqImagesBrief({
  baseUrl,
  apiKey,
  model,
  requirementText,
  images,
  signal,
}) {
  const visionMessages = await buildPmSpecVisionUserContent({
    requirementText: `${requirementText}\n\n请逐张描述图中与产品相关的界面布局、字段、流程、状态与约束，输出简体中文摘要（条目清晰，勿输出 HTML）。`,
    images,
  });
  return nonStreamCompletion({
    baseUrl,
    apiKey,
    model: pickVisionModel(model),
    messages: visionMessages,
    signal,
  });
}

async function appendImageContextForCursor({
  res,
  specReqText,
  images,
  config,
  sessionDir,
  signal,
}) {
  const saved = await saveReqRefImages(sessionDir, images);
  const visionKey = String(config?.apiKey || "").trim();
  const visionBase = String(config?.baseUrl || "").trim();
  if (visionKey && visionBase) {
    sseSend(res, {
      type: "thought",
      text: "【附图】使用 OpenAI 兼容视觉模型生成识图摘要（Cursor Cloud 本身不看图）…\n",
    });
    try {
      const visionModel = String(
        config?.visionModel || config?.openaiModel || config?.model || ""
      ).trim();
      const desc = await describeReqImagesBrief({
        baseUrl: visionBase,
        apiKey: visionKey,
        model: visionModel,
        requirementText: specReqText,
        images,
        signal,
      });
      return (
        specReqText +
        `\n\n【附图识图摘要（${pickVisionModel(visionModel)}）】\n` +
        String(desc || "").trim()
      );
    } catch (e) {
      return (
        specReqText +
        `\n\n【附图识图失败】${String(e.message || e)}。请确认 OpenAI 兼容 Base URL / API Key / 识图 Model ID 有效且模型支持视觉（如 gpt-4o 或对应 ep-）；或改用「OpenAI 兼容」后端做总结需求。`
      );
    }
  }
  return (
    specReqText +
    `\n\n【说明】已保存 ${saved} 张参考图到会话目录 req-refs/，但 Cursor Cloud 无法直接看图。请在「模型配置」中填写 OpenAI 兼容 API Key（仅用于识图摘要），或切换为 OpenAI 兼容后端后再点「总结需求」。`
  );
}

async function buildPmVisionUserContent({ requirement, solution, images, specDoc }) {
  const base = await buildPmMessages(requirement, solution, specDoc);
  const txt = typeof base[1].content === "string" ? base[1].content : "";
  const parts = [{ type: "text", text: txt }];
  for (const im of images || []) {
    const mime = String(im?.mime || "image/png");
    const b64 = String(im?.base64 || "").trim();
    if (!b64) continue;
    const url = /^data:/.test(im?.dataUrl || "")
      ? String(im.dataUrl).trim()
      : `data:${mime};base64,${b64}`;
    parts.push({ type: "image_url", image_url: { url } });
  }
  return [...base.slice(0, 1), { role: "user", content: parts }];
}

async function buildPmMessages(requirement, solution = {}, specDoc = "") {
  const sys = await loadRoleSkill("pm", PM_FALLBACK_SYS);
  const title = String(solution.title || "").trim();
  const summary = String(solution.summary || "").trim();
  const idx = Math.max(0, Math.min(2, Number(solution.index) || 0));
  const spec = String(specDoc || "").trim();
  const specBlock = spec
    ? `【标准需求文档（生成原型时必须遵循）】\n${spec}\n\n`
    : "";
  const angle =
    idx === 1
      ? "本轮请按「体验增强」方向设计：强化状态反馈、空态、错误提示与适度动效，仍保持单页可演示。"
      : idx === 2
        ? "本轮请按「可演进架构」方向设计：模块分区清晰、配置/主题可替换感，便于后续扩展，仍输出单页 HTML。"
        : "本轮请按「MVP 快速落地」方向设计：优先打通最小可用路径，单页演示核心流程。";
  return [
    { role: "system", content: sys },
    {
      role: "user",
      content: `${specBlock}【用户原始需求摘要】\n${requirement}\n\n【本轮产品方案 ${idx + 1}】${title}\n${summary}\n${angle}\n\n直接输出 HTML。`,
    },
  ];
}

async function buildUiMessages(requirement, html, solution = {}) {
  const sys = await loadRoleSkill("ui", UI_FALLBACK_SYS);
  const title = String(solution.title || "").trim();
  const philosophy = String(solution.philosophy || "").trim();
  const idx = Math.max(0, Math.min(2, Number(solution.index) || 0));
  return [
    { role: "system", content: sys },
    {
      role: "user",
      content: `原始需求摘要：\n${requirement}\n\n【本轮视觉方案 ${idx + 1}】${title}\n${philosophy}\n\n请在保持交互与信息结构的前提下，严格按该视觉方向优化排版、色彩、圆角与层级。\n\n当前原型 HTML：\n${html}\n\n请输出优化后的完整 HTML。`,
    },
  ];
}

async function buildFsMessages(requirement, html) {
  const sys = await loadRoleSkill("fullstack", FS_FALLBACK_SYS);
  return [
    { role: "system", content: sys },
    {
      role: "user",
      content: `需求：\n${requirement}\n\n参考 HTML（单页）：\n${html}\n\n请按模板输出四个 FILE 段落。`,
    },
  ];
}

const QA_FALLBACK_SYS =
  "你是资深测试工程师。根据「业务需求」「已有页面 HTML 节选（若有）」「用户粘贴的说明与素材」产出可执行的测试点文档，使用简体中文 Markdown。\n要求：层级清晰（可按模块或用例编号）；每条尽量含：前置条件、操作步骤、预期结果；补充边界条件、异常与回归要点；可读、可拷贝到项目管理工具。\n禁止输出与文档无关的解释性开场白；不要使用 Markdown 代码围栏包裹全文；最终内容应可直接保存为 .md。";

async function buildQaMessages({
  requirement,
  contextHtml,
  material,
  styleHint,
  standalone,
  qaMode,
  framework,
  pageContext,
  businessScenarios,
  pageFunctionMd,
  specialMd,
  reviewFeedback,
  priorDraft,
  priorReviewReport,
}) {
  if (standalone && qaMode === "framework") {
    return buildStandaloneFrameworkMessages({
      material,
      skill: styleHint,
      pageContext,
      reviewFeedback,
      priorDraft,
    });
  }
  if (standalone && qaMode === "biz") {
    return buildStandaloneBizScenarioMessages({
      material,
      skill: styleHint,
      framework,
      pageContext,
      reviewFeedback,
      priorDraft,
    });
  }
  if (standalone && qaMode === "special") {
    return buildStandaloneSpecialMessages({
      material,
      skill: styleHint,
      framework,
      businessScenarios,
      pageFunctionMd,
      pageContext,
      reviewFeedback,
      priorDraft,
    });
  }
  if (standalone && qaMode === "review") {
    return buildStandaloneReviewMessages({
      material,
      skill: styleHint,
      framework,
      businessScenarios,
      pageContext,
      pageFunctionMd,
      specialMd,
      priorReviewReport,
    });
  }
  if (standalone) {
    return buildStandaloneQaMessages({
      material,
      skill: styleHint,
      framework,
      businessScenarios,
      pageContext,
      reviewFeedback,
      priorDraft,
    });
  }
  const mat = String(material || "").trim();
  let style = String(styleHint || "").trim();
  if (/敏捷流水线|测试点列表专用|一句话场景/.test(style + mat)) {
    style = style
      ? `${QA_PIPELINE_STYLE_HINT}\n\n${style}`
      : QA_PIPELINE_STYLE_HINT;
  }
  const ctx = String(contextHtml || "").trim().slice(0, 14000);
  const styleBlock =
    style.length > 0
      ? `【用户希望的测试文档风格 / 大纲 / 粒度】\n${style}\n\n`
      : "";
  const pipelineMode = /敏捷流水线|测试点列表专用|一句话场景/.test(style + mat);
  const sys = pipelineMode
    ? QA_PIPELINE_GEN_SYS
    : await loadRoleSkill("qa", QA_FALLBACK_SYS);
  const textBody = pipelineMode
    ? `${styleBlock}【业务需求】\n${String(requirement || "").trim() || "（见需求框）"}\n\n${ctx ? `【页面节选】\n${ctx.slice(0, 12000)}\n` : ""}\n请按「## 业务测试点」再「## 功能测试点」两段输出全部测试点。`
    : `${styleBlock}【业务需求摘要】\n${String(requirement || "").trim() || "（用户未写在需求框，请参阅下方原型说明）"}\n\n【用户整理的说明 / 用例关注点】\n${mat || "（未填写，仅从需求与页面推断）"}\n\n${ctx ? `【当前会话已有页面节选（截取，可能与最新不完全一致）】\n${ctx}\n` : ""}`;
  return [
    { role: "system", content: sys },
    { role: "user", content: textBody },
  ];
}

async function buildQaVisionUserContent({
  requirement,
  contextHtml,
  material,
  styleHint,
  images,
  standalone,
  qaMode,
  framework,
  pageContext,
  businessScenarios,
  pageFunctionMd,
  specialMd,
  reviewFeedback,
  priorDraft,
  priorReviewReport,
}) {
  const base = await buildQaMessages({
    requirement,
    contextHtml,
    material,
    styleHint,
    standalone,
    qaMode,
    framework,
    pageContext,
    businessScenarios,
    pageFunctionMd,
    specialMd,
    reviewFeedback,
    priorDraft,
    priorReviewReport,
  });
  const txt = typeof base[1].content === "string" ? base[1].content : "";
  const parts = [{ type: "text", text: txt }];
  for (const im of images || []) {
    const mime = String(im?.mime || "image/png");
    const b64 = String(im?.base64 || "").trim();
    if (!b64) continue;
    const url = /^data:/.test(im?.dataUrl || "")
      ? String(im.dataUrl).trim()
      : `data:${mime};base64,${b64}`;
    parts.push({ type: "image_url", image_url: { url } });
  }
  return [...base.slice(0, 1), { role: "user", content: parts }];
}

const OPS_FALLBACK_SYS =
  "你是资深运维 / SRE。根据「业务需求」「已有页面节选（若有）」「用户粘贴的部署与运行说明」输出运维交接文档，使用简体中文 Markdown。\n覆盖建议：部署要求（环境 / 端口 / 依赖）、配置与密钥管理、静态资源/CDN（如适用）、健康检查与监控告警、备份与恢复、常见问题排障步骤、交付检查清单。\n口语化寒暄禁止；不要使用 Markdown 代码围栏包裹全文；内容应可直接保存为 .md。";

async function buildOpsMessages({ requirement, contextHtml, material, styleHint }) {
  const style = String(styleHint || "").trim();
  const mat = String(material || "").trim();
  const ctx = String(contextHtml || "").trim().slice(0, 14000);
  const styleBlock =
    style.length > 0
      ? `【用户希望的运维文档风格 / 模板】\n${style}\n\n`
      : "";
  const sys = await loadRoleSkill("ops", OPS_FALLBACK_SYS);
  const textBody = `${styleBlock}【业务需求摘要】\n${String(requirement || "").trim() || "（用户未写在需求框，请参阅下方说明）"}\n\n【用户整理的运维 / 环境与说明】\n${mat || "（未填写，请结合需求与页面合理推断静态站运维要点）"}\n\n${ctx ? `【当前会话已有页面节选（截取）】\n${ctx}\n` : ""}`;
  return [
    { role: "system", content: sys },
    { role: "user", content: textBody },
  ];
}

async function buildOpsVisionUserContent({ requirement, contextHtml, material, styleHint, images }) {
  const base = await buildOpsMessages({ requirement, contextHtml, material, styleHint });
  const txt = typeof base[1].content === "string" ? base[1].content : "";
  const parts = [{ type: "text", text: txt }];
  for (const im of images || []) {
    const mime = String(im?.mime || "image/png");
    const b64 = String(im?.base64 || "").trim();
    if (!b64) continue;
    const url = /^data:/.test(im?.dataUrl || "")
      ? String(im.dataUrl).trim()
      : `data:${mime};base64,${b64}`;
    parts.push({ type: "image_url", image_url: { url } });
  }
  return [...base.slice(0, 1), { role: "user", content: parts }];
}

async function readSessionAppExcerpt(sessionDir) {
  const chunks = [];
  for (const name of ["index.html", "app.js", "styles.css"]) {
    try {
      const t = await readFile(path.join(sessionDir, "app", name), "utf8");
      if (t) chunks.push(`/* app/${name} */\n${t.slice(0, 8000)}`);
    } catch {
      /* ignore */
    }
  }
  return chunks.join("\n\n");
}

async function readSessionPrototypeContext(sessionDir) {
  const chunks = [];
  for (const name of ["prototype.html", "ui.html"]) {
    try {
      const t = await readFile(path.join(sessionDir, name), "utf8");
      if (t) chunks.push(`<!-- ${name} -->\n${t}`);
    } catch {
      /* ignore */
    }
  }
  try {
    const t = await readFile(path.join(sessionDir, "app", "index.html"), "utf8");
    if (t) chunks.push(`<!-- app/index.html -->\n${t}`);
  } catch {
    /* ignore */
  }
  return chunks.join("\n\n");
}

const CURSOR_API = "https://api.cursor.com";

function cursorBasicAuth(apiKey) {
  const u = `${String(apiKey).trim()}:`;
  return "Basic " + Buffer.from(u, "utf8").toString("base64");
}

function normalizeCursorModelId(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s === "composer-2" || s === "composer2" || s === "composer-2-fast") return "composer-2.5";
  return s;
}

/** 列出 Cursor API Key 账号下可用模型（Cloud Agents） */
app.post("/api/debug/cursor-models", async (req, res) => {
  const apiKey = String(req.body?.cursorApiKey || "").trim();
  if (!apiKey) {
    return res.status(400).json({ error: "缺少 cursorApiKey" });
  }
  try {
    const r = await fetch(`${CURSOR_API}/v1/models`, {
      headers: { Authorization: cursorBasicAuth(apiKey) },
    });
    const t = await r.text();
    if (!r.ok) {
      return res
        .status(r.status)
        .type("json")
        .send(t.length > 2000 ? t.slice(0, 2000) : t);
    }
    const j = JSON.parse(t);
    const items = Array.isArray(j.items) ? j.items : Array.isArray(j.data) ? j.data : [];
    const ids = items
      .map((x) => x?.id || x?.name)
      .filter(Boolean)
      .slice(0, 80);
    res.json({
      ok: true,
      total: ids.length,
      ids,
      note: "Model ID 填下方列表中的 id；留空则让 Cursor 使用默认模型。若报 invalid_model，请改用 composer-2.5 或点本接口核对账号可用模型。",
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

/** 列出 Cursor API Key 在 Integrations 下可见的 GitHub 仓库（官方限流，勿频繁调用） */
app.post("/api/debug/cursor-repositories", async (req, res) => {
  const apiKey = String(req.body?.cursorApiKey || "").trim();
  if (!apiKey) {
    return res.status(400).json({ error: "缺少 cursorApiKey" });
  }
  try {
    const r = await fetch(`${CURSOR_API}/v1/repositories`, {
      headers: { Authorization: cursorBasicAuth(apiKey) },
    });
    const t = await r.text();
    if (!r.ok) {
      return res
        .status(r.status)
        .type("json")
        .send(t.length > 2000 ? t.slice(0, 2000) : t);
    }
    const j = JSON.parse(t);
    const items = Array.isArray(j.items) ? j.items : [];
    res.json({
      ok: true,
      total: items.length,
      items: items.slice(0, 80),
      note: "若目标仓库不在列表中，请到 Cursor Dashboard → Integrations → GitHub 授权该仓库。此接口有严格限流。",
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

async function readCursorCloudAgentId(sessionDir) {
  try {
    const p = path.join(sessionDir, "cursor_cloud.json");
    const j = JSON.parse(await readFile(p, "utf8"));
    return j.agentId ? String(j.agentId) : null;
  } catch {
    return null;
  }
}

async function writeCursorCloudAgentId(sessionDir, agentId) {
  const p = path.join(sessionDir, "cursor_cloud.json");
  await writeFile(
    p,
    JSON.stringify({ agentId, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

async function cursorCloudCreateAgent({
  apiKey,
  prompt,
  model,
  repoUrl,
  repoRef,
  signal,
}) {
  const repoCfg = { url: repoUrl };
  const ref = repoRef != null ? String(repoRef).trim() : "";
  if (ref) repoCfg.startingRef = ref;
  const body = {
    prompt: { text: prompt },
    repos: [repoCfg],
    autoCreatePR: false,
  };
  const mid = normalizeCursorModelId(model);
  if (mid) body.model = { id: mid };
  let r;
  try {
    r = await fetch(`${CURSOR_API}/v1/agents`, {
      method: "POST",
      headers: {
        Authorization: cursorBasicAuth(apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    const raw = String(e?.cause?.message || e?.message || e);
    throw new Error(
      `无法连接 api.cursor.com 创建 Agent（${raw}）。请检查本机/Node 是否可访问外网与 HTTPS，代理是否对 Node 生效；或稍后重试。`
    );
  }
  const t = await r.text();
  if (!r.ok) {
    let hint = "";
    try {
      const j = JSON.parse(t);
      const msg = String(j?.error?.message || "");
      const code = String(j?.error?.code || "");
      if (/verify existence of branch|branch.*repository/i.test(msg)) {
        hint =
          " — 若 GitHub 上确有该分支，多为 Cursor 的 GitHub 集成未授权该仓库：请到 cursor.com → Integrations → GitHub 勾选该仓库（或整个组织）；并可使用本页「Cursor 可见仓库列表」核对 URL 是否在列表中。";
      } else if (code === "invalid_model" || /not available or invalid/i.test(msg)) {
        hint =
          " — Model ID 无效或账号不可用。请到「其他配置」把 Model ID 改为 composer-2.5，或留空使用默认；也可点「Cursor 可用模型列表」查看本 Key 支持的 id。";
      } else if (
        /Upgrade to Ultra|more Cloud Agents|reached the limit|simultaneously/i.test(
          msg
        )
      ) {
        hint =
          " — Cursor Cloud Agents 并发/额度已满。请到 cursor.com → Agents 结束闲置任务后再试；测试点一键流水线已改为复用同一 Agent（需刷新后重跑）。也可临时改用 OpenAI 兼容接口。";
      }
    } catch {
      /* ignore */
    }
    throw new Error(`Cursor Create Agent ${r.status}: ${t.slice(0, 1200)}${hint}`);
  }
  return JSON.parse(t);
}

function sleepMs(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function cursorCloudCreateRun({ apiKey, agentId, prompt, signal }) {
  const maxAttempts = 10;
  let lastErr = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let r;
    try {
      r = await fetch(`${CURSOR_API}/v1/agents/${agentId}/runs`, {
        method: "POST",
        headers: {
          Authorization: cursorBasicAuth(apiKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: { text: prompt } }),
        signal,
      });
    } catch (e) {
      const raw = String(e?.cause?.message || e?.message || e);
      throw new Error(
        `无法连接 api.cursor.com 创建 Run（${raw}）。请检查网络与代理设置后重试。`
      );
    }
    const t = await r.text();
    if (r.ok) return JSON.parse(t);

    lastErr = t.slice(0, 1200);
    let code = "";
    let msg = "";
    try {
      const j = JSON.parse(t);
      code = String(j?.error?.code || "");
      msg = String(j?.error?.message || "");
    } catch {
      /* ignore */
    }
    const busy =
      r.status === 409 ||
      /agent_busy/i.test(code) ||
      /already has an active run/i.test(msg + t);
    if (busy && attempt < maxAttempts) {
      const wait = Math.min(20_000, 1500 * attempt);
      dbg("cursorCloudCreateRun agent_busy, retry", { attempt, wait });
      await sleepMs(wait, signal);
      continue;
    }
    let hint = "";
    if (busy) {
      hint =
        " — 同一 Agent 上一轮 Run 尚未结束（游戏流水线连续多步常见）。请稍后再试，或到 cursor.com 结束该 Agent 的活跃 Run；已内置自动重试仍失败则改用 OpenAI 兼容接口。";
    } else if (
      /Upgrade to Ultra|more Cloud Agents|reached the limit|simultaneously/i.test(
        msg
      )
    ) {
      hint =
        " — Cloud Agents 并发已满。请到 cursor.com 结束闲置 Agents；测试点步骤应复用同一 Agent（刷新后重跑）。";
    }
    throw new Error(`Cursor Create Run ${r.status}: ${lastErr}${hint}`);
  }
  throw new Error(`Cursor Create Run failed after retries: ${lastErr}`);
}

/** Cursor 单轮 Run 的 SSE 最长等待（毫秒），避免上游不 close 时永远挂起 */
const CURSOR_SSE_MAX_MS = Math.max(
  120_000,
  Number(process.env.AGILE_SIM_CURSOR_SSE_MAX_MS || 45 * 60 * 1000)
);

async function cursorCloudGetRun({ apiKey, agentId, runId, signal }) {
  let r;
  try {
    r = await fetch(`${CURSOR_API}/v1/agents/${agentId}/runs/${runId}`, {
      headers: {
        Authorization: cursorBasicAuth(apiKey),
        Accept: "application/json",
      },
      signal,
    });
  } catch (e) {
    const raw = String(e?.cause?.message || e?.message || e);
    throw new Error(`无法连接 api.cursor.com 查询 Run（${raw}）`);
  }
  const t = await r.text();
  if (!r.ok) throw new Error(`Cursor Get Run ${r.status}: ${t.slice(0, 800)}`);
  return JSON.parse(t);
}

function isCursorStreamGone(status, bodyOrMsg) {
  const t = String(bodyOrMsg || "");
  return (
    Number(status) === 410 ||
    /stream_expired|no longer available|stream.*unavailable|run stream is no longer/i.test(
      t
    )
  );
}

/** 流过期/不可用时轮询 Get Run，取终态 result */
async function waitCursorRunResult({
  apiKey,
  agentId,
  runId,
  signal,
  onStatus,
  maxTries = 90,
  intervalMs = 2000,
}) {
  const terminal =
    /^(FINISHED|ERROR|CANCELLED|EXPIRED|completed|finished|failed|canceled|cancelled|done|error)$/i;
  for (let i = 0; i < maxTries; i++) {
    if (signal?.aborted) {
      throw Object.assign(new Error("Aborted"), { name: "AbortError" });
    }
    const run = await cursorCloudGetRun({ apiKey, agentId, runId, signal });
    const st = String(run?.status || "");
    if (onStatus) onStatus(st, run);
    if (terminal.test(st)) return run;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    "等待 Cursor Run 终态超时。请到 https://cursor.com 查看该 Agent，或改用 OpenAI 兼容后端重试。"
  );
}

async function consumeCursorRunSse({ apiKey, agentId, runId, signal, onSse }) {
  const url = `${CURSOR_API}/v1/agents/${agentId}/runs/${runId}/stream`;

  const timeoutAc = new AbortController();
  const tid = setTimeout(() => {
    timeoutAc.abort(
      new Error(
        `Cursor 运行流已超过 ${Math.round(CURSOR_SSE_MAX_MS / 60000)} 分钟未正常结束，已断开本地连接。请在 https://cursor.com 查看该 Agent/Run 是否仍在执行；也可改用 OpenAI 兼容接口或稍后重试。`
      )
    );
  }, CURSOR_SSE_MAX_MS);

  const mergedAc = new AbortController();
  const forward = (reason) => mergedAc.abort(reason);

  const onParentAbort = () => {
    clearTimeout(tid);
    forward(signal.reason);
  };

  if (signal) {
    if (signal.aborted) {
      clearTimeout(tid);
      throw Object.assign(new Error("Aborted"), { name: "AbortError" });
    }
    signal.addEventListener("abort", onParentAbort, { once: true });
  }

  timeoutAc.signal.addEventListener(
    "abort",
    () => {
      forward(timeoutAc.signal.reason);
    },
    { once: true }
  );

  try {
    const r = await fetch(url, {
      headers: {
        Authorization: cursorBasicAuth(apiKey),
        Accept: "text/event-stream",
      },
      signal: mergedAc.signal,
    });

    if (!r.ok) {
      const t = await r.text();
      if (isCursorStreamGone(r.status, t)) {
        throw Object.assign(
          new Error(
            `Cursor 运行流已不可用（HTTP ${r.status}）：${t.slice(0, 400)}`
          ),
          { code: "CURSOR_STREAM_GONE" }
        );
      }
      throw new Error(`Cursor Stream ${r.status}: ${t.slice(0, 800)}`);
    }
    const reader = r.body?.getReader();
    if (!reader) throw new Error("Cursor Stream: no body");
    const dec = new TextDecoder();
    let buf = "";
    let eventName = null;

    outer: for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
          continue;
        }
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        let data = null;
        try {
          data = JSON.parse(raw);
        } catch {
          continue;
        }

        const ev = (eventName || "").toLowerCase();
        if (ev === "error") {
          const em = String(data?.message || data?.code || JSON.stringify(data));
          if (isCursorStreamGone(null, em)) {
            throw Object.assign(new Error(em), { code: "CURSOR_STREAM_GONE" });
          }
        }

        await onSse(eventName, data);

        let terminal = ev === "result" || ev === "done";
        if (
          data &&
          typeof data === "object" &&
          !terminal &&
          (String(data.type || "").toLowerCase() === "result" ||
            String(data.event || "").toLowerCase() === "result")
        ) {
          terminal = true;
        }
        if (
          ev === "status" &&
          /^(completed|finished|failed|canceled|cancelled|done|error|FINISHED|ERROR|CANCELLED|EXPIRED)$/i.test(
            String(data?.status ?? "")
          )
        ) {
          terminal = true;
        }
        if (terminal) {
          await reader.cancel().catch(() => {});
          break outer;
        }
      }
    }
  } finally {
    clearTimeout(tid);
    if (signal) signal.removeEventListener("abort", onParentAbort);
  }
}

function messagesToCursorPrompt(messages) {
  const parts = [];
  for (const m of messages || []) {
    const tag =
      m.role === "system" ? "系统说明" : m.role === "user" ? "用户需求" : m.role;
    let body = m.content;
    if (Array.isArray(body)) {
      body = body
        .map((part) => {
          if (!part || typeof part !== "object") return "";
          if (part.type === "text" && typeof part.text === "string")
            return part.text;
          if (part.type === "image_url")
            return "[参考图：本地已接收，但 Cursor Cloud 此轮仅传文字；请结合上文对界面与流程的描述理解需求。]";
          return "";
        })
        .filter(Boolean)
        .join("\n");
    }
    parts.push(`【${tag}】\n${body}`);
  }
  return parts.join("\n\n----------\n\n");
}

async function streamCursorPhaseToClient(res, opts) {
  const {
    label,
    apiKey,
    model,
    messages,
    onFullText,
    signal,
    sessionDir,
    cursorMode,
    cursorRepoUrl,
    cursorRepoRef,
  } = opts;
  const cursorPersistDir = opts.cursorSessionDir ?? sessionDir;

  sseSend(res, {
    type: "step",
    label: `${label} · Cursor Cloud API（api.cursor.com）`,
  });

  if (!apiKey) {
    sseSend(res, { type: "error", message: "未配置 Cursor API Key" });
    return;
  }

  const promptBase = messagesToCursorPrompt(messages);
  const prompt =
    String(opts.provider || "").toLowerCase() === "cursor"
      ? `${promptBase}\n\n${
          opts.cursorTail ||
          `【对本条回复的要求】请把可交付的源码直接写在回复正文里（若本阶段要求单页 HTML，须输出完整可保存为 .html 的源码；若要求多文件，须按任务用 ### FILE: 分段写出）。不要仅用 GitHub/PR/分支链接或文件路径列表代替正文。`
        }`
      : promptBase;
  let agentId = null;
  let runId = null;
  let full = "";

  try {
    if (cursorMode === "create") {
      const repo = String(cursorRepoUrl || "").trim();
      if (!repo) {
        sseSend(res, {
          type: "error",
          message:
            "Cursor Cloud 要求在已连接 GitHub 的仓库上运行，请填写仓库 HTTPS 地址（Integrations 中可访问的 repo）",
        });
        return;
      }
      const refRaw = String(cursorRepoRef ?? "").trim();
      const refLabel = refRaw || "默认分支（未传 startingRef）";
      sseSend(res, {
        type: "thought",
        text: `[Cursor Cloud] 将基于仓库 ${repo}（${refLabel}）创建 Agent；助手回复流会用于本地写入 prototype/ui/app，与仓库内实际改动可能不一致，以流式文本为准。\n`,
      });
      sseSend(res, {
        type: "thought",
        text: "正在请求 Cursor 创建 Agent（远端常需数十秒～数分钟，请勿刷新或切换页面）…\n",
      });
      dbg("cursorCloudCreateAgent →", { repo, ref: refRaw || "(omit)", promptLen: prompt.length });
      const created = await cursorCloudCreateAgent({
        apiKey,
        prompt,
        model,
        repoUrl: repo,
        repoRef: refRaw,
        signal,
      });
      dbg("cursorCloudCreateAgent ←", {
        agentId: created.agent?.id,
        runId: created.run?.id,
      });
      agentId = created.agent?.id;
      runId = created.run?.id;
      if (!agentId || !runId) {
        sseSend(res, { type: "error", message: "Cursor 创建 Agent 响应缺少 id" });
        return;
      }
      await writeCursorCloudAgentId(cursorPersistDir, agentId);
    } else {
      agentId = await readCursorCloudAgentId(cursorPersistDir);
      if (!agentId) {
        sseSend(res, {
          type: "error",
          message: "未找到本会话的 Cursor Agent，请先完成「产品经理」阶段",
        });
        return;
      }
      sseSend(res, { type: "step", label: `${label} · 发起后续 Run` });
      sseSend(res, {
        type: "thought",
        text: "正在请求 Cursor 发起新一轮 Run（可能需要较长时间，请勿刷新）…\n",
      });
      dbg("cursorCloudCreateRun →", { agentId: agentId?.slice?.(0, 16) });
      const runBody = await cursorCloudCreateRun({
        apiKey,
        agentId,
        prompt,
        signal,
      });
      dbg("cursorCloudCreateRun ←", { runId: runBody.run?.id });
      runId = runBody.run?.id;
      if (!runId) {
        sseSend(res, { type: "error", message: "Cursor 创建 Run 响应缺少 id" });
        return;
      }
    }

    sseSend(res, { type: "step", label: `${label} · 订阅运行流（SSE）` });

    try {
      await consumeCursorRunSse({
        apiKey,
        agentId,
        runId,
        signal,
        onSse: async (ev, data) => {
          if (signal?.aborted) return;
          if (ev === "assistant") {
            const piece = cursorStreamAssistantDelta(data);
            if (piece) {
              full += piece;
              sseSend(res, { type: "delta", text: piece });
            }
          }
          if (ev === "thinking" && data?.text) {
            sseSend(res, { type: "thought", text: data.text });
          }
          if (ev === "tool_call") {
            const name = data?.name || data?.toolName || "tool_call";
            sseSend(res, {
              type: "thought",
              text: `\n[Cursor] ${name} ${JSON.stringify(data).slice(0, 280)}\n`,
            });
          }
          if (ev === "status" && data?.status) {
            sseSend(res, {
              type: "thought",
              text: `\n[Cursor] run status → ${data.status}\n`,
            });
          }
          if (ev === "error") {
            const em = String(data?.message || JSON.stringify(data));
            // 流过期类错误由外层 catch 转轮询；其它错误仍上报
            if (!isCursorStreamGone(null, em)) {
              sseSend(res, { type: "error", message: em });
            }
          }
          if (ev === "result") {
            if (data?.text && !full.trim()) {
              full += String(data.text);
              sseSend(res, { type: "delta", text: String(data.text) });
            }
            if (data?.status) {
              sseSend(res, {
                type: "thought",
                text: `\n[Cursor Cloud] run 结束 status=${data.status}\n`,
              });
            }
          }
        },
      });
    } catch (streamErr) {
      const sm = String(streamErr?.message || streamErr);
      const gone =
        streamErr?.code === "CURSOR_STREAM_GONE" || isCursorStreamGone(null, sm);
      if (!gone) throw streamErr;
      sseSend(res, {
        type: "thought",
        text:
          "Cursor 运行流已过期/不可用（Run stream is no longer available）。按官方建议改为查询 Run 终态…\n",
      });
      const run = await waitCursorRunResult({
        apiKey,
        agentId,
        runId,
        signal,
        onStatus: (st) => {
          sseSend(res, {
            type: "thought",
            text: `[Cursor] 轮询 Run status → ${st}\n`,
          });
        },
      });
      const st = String(run?.status || "");
      const resultText = String(run?.result || "").trim();
      if (/ERROR|failed|CANCELLED|canceled|EXPIRED/i.test(st) && !resultText) {
        throw new Error(
          `Cursor Run 结束为 ${st}，且无可用正文。请到 https://cursor.com 查看该 Agent，或改用 OpenAI 兼容后端重试。`
        );
      }
      if (resultText) {
        full += resultText;
        sseSend(res, { type: "delta", text: resultText });
        sseSend(res, {
          type: "thought",
          text: `\n[Cursor Cloud] 已从 Get Run 取回结果（status=${st}）\n`,
        });
      } else {
        throw new Error(
          `Cursor 运行流不可用，且 Get Run（${st || "未知"}）未返回 result 正文。可稍后重试，或切换到 OpenAI 兼容后端。`
        );
      }
    }
  } catch (e) {
    const msg = String(e?.message || e);
    dbg("streamCursorPhaseToClient catch", e?.name, msg.slice(0, 200));
    if (e?.name === "AbortError" || /aborted/i.test(msg)) {
      sseSend(res, {
        type: "error",
        message:
          "请求已中断（多为浏览器或网络取消了连接）。请 F12→Network 查看 pipeline/pm 是否红色取消；勿在开跑后刷新。若反复出现可设 AGILE_SIM_DEBUG=1 看服务端 [agile-sim] 日志。",
      });
      return;
    }
    if (isCursorStreamGone(null, msg) || e?.code === "CURSOR_STREAM_GONE") {
      sseSend(res, {
        type: "error",
        message:
          "Cursor 运行流已不可用（Run stream is no longer available）：远端流保留窗口已过或连接中断。请勿长时间停在扫描页不点完；可点「清空」后立刻重试，或暂时改用 OpenAI 兼容后端。也可到 https://cursor.com 查看该 Agent 是否已跑完。",
      });
      return;
    }
    sseSend(res, { type: "error", message: msg });
  }

  if (onFullText && full.trim()) await onFullText(full.trim());
}

async function streamOpenAiPhaseToClient(res, opts) {
  const {
    label,
    baseUrl,
    apiKey,
    model,
    messages,
    onFullText,
    signal,
    temperature = 0.4,
  } = opts;

  sseSend(res, { type: "step", label: `${label} · 发起模型请求` });

  if (!apiKey) {
    sseSend(res, { type: "error", message: "未配置 API Key" });
    return;
  }

  let full = "";
  try {
    const body = await openAiStyleStream({
      baseUrl,
      apiKey,
      model,
      messages,
      signal,
      temperature,
    });
    const reader = body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    sseSend(res, { type: "step", label: `${label} · 流式生成中` });
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const data = s.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const j = JSON.parse(data);
          const piece = j.choices?.[0]?.delta?.content ?? "";
          if (piece) {
            full += piece;
            sseSend(res, { type: "delta", text: piece });
          }
        } catch {
          /* ignore */
        }
      }
    }
  } catch (e) {
    const msg = String(e?.message || e);
    const aborted =
      e?.name === "AbortError" ||
      /aborted/i.test(msg) ||
      (signal && signal.aborted);
    if (aborted) {
      sseSend(res, {
        type: "error",
        message:
          "请求已被中断（常见：刷新或关闭了页面、网络闪断、开发代理断开长连接）。请保持本页打开勿刷新，再点一次执行。",
      });
      return;
    }
    sseSend(res, {
      type: "thought",
      text: `\n[回退] 流式失败，尝试非流式：${msg}\n`,
    });
    try {
      full = await nonStreamCompletion({
        baseUrl,
        apiKey,
        model,
        messages,
        temperature,
      });
      sseSend(res, { type: "delta", text: full });
    } catch (e2) {
      sseSend(res, { type: "error", message: String(e2?.message || e2) });
    }
  }

  if (onFullText && full.trim()) await onFullText(full.trim());
}

async function streamPhaseToClient(res, opts) {
  const p = String(opts.provider || "openai").toLowerCase();
  if (p === "cursor") {
    return streamCursorPhaseToClient(res, opts);
  }
  return streamOpenAiPhaseToClient(res, opts);
}

app.post("/api/pipeline/pm-spec", async (req, res) => {
  sseInit(res);
  const stopKeepalive = startSseKeepalive(res);
  const ac = new AbortController();
  bindClientDisconnectAbort(req, res, ac, "POST /api/pipeline/pm-spec");

  try {
    const { requirement, config, sessionId: sidIn, images: imagesIn } = req.body || {};
    let requirementText = String(requirement || "").trim();
    const images = normalizeVisionImages(imagesIn);
    if (!requirementText && images.length === 0) {
      sseSend(res, { type: "error", message: "请填写需求文字或上传/粘贴参考图" });
      sseSend(res, { type: "done" });
      return res.end();
    }
    if (!requirementText && images.length > 0) {
      requirementText =
        "（用户通过附图描述需求，请结合图片整理为标准需求文档）";
    }

    const sessionId =
      sidIn || `s_${Date.now()}_${randomBytes(3).toString("hex")}`;
    const sessionDir = path.join(GEN, sessionId);
    await mkdir(sessionDir, { recursive: true });

    const provider = String(config?.provider || "openai").toLowerCase();
    const apiKey =
      provider === "cursor"
        ? String(config?.cursorApiKey || "").trim()
        : String(config?.apiKey || "").trim();
    const { baseUrl, model } = config || {};
    const cursorRepoUrl = String(config?.cursorRepoUrl || "").trim();
    const cursorRepoRef = String(config?.cursorRepoRef ?? "").trim();

    let specReqText = requirementText;
    if (images.length > 0 && provider === "cursor") {
      specReqText = await appendImageContextForCursor({
        res,
        specReqText,
        images,
        config,
        sessionDir,
        signal: ac.signal,
      });
    }

    const specMessages =
      provider === "openai" && images.length > 0
        ? await buildPmSpecVisionUserContent({
            requirementText: specReqText,
            images,
          })
        : await buildPmSpecMessages(specReqText);

    sseSend(res, { type: "meta", sessionId, phase: "pm_spec" });
    sseSend(res, { type: "thought", text: "【产品经理】整理并输出标准需求文档…\n" });

    await streamPhaseToClient(res, {
      label: "产品经理 · 需求文档",
      provider,
      baseUrl,
      apiKey,
      model,
      sessionDir,
      cursorMode: provider === "cursor" ? (sidIn ? "followup" : "create") : undefined,
      cursorRepoUrl,
      cursorRepoRef,
      cursorSessionDir: sessionDir,
      messages: specMessages,
      signal: ac.signal,
      onFullText: async (raw) => {
        const md = extractMarkdown(raw);
        const fp = PM_SPEC_FILE;
        await writeFile(path.join(sessionDir, fp), md, "utf8");
        sseSend(res, {
          type: "exec",
          label: `写入 ${fp}（${md.length} 字符）`,
        });
        sseSend(res, {
          type: "artifact",
          name: fp,
          mime: "text/markdown",
          preview: md.slice(0, 400),
        });
      },
    });

    sseSend(res, { type: "done", sessionId, phase: "pm_spec" });
    res.end();
  } catch (e) {
    sseSend(res, { type: "error", message: String(e.message || e) });
    sseSend(res, { type: "done" });
    res.end();
  } finally {
    stopKeepalive();
  }
});

app.post("/api/pipeline/pm", async (req, res) => {
  sseInit(res);
  const stopKeepalive = startSseKeepalive(res);
  const ac = new AbortController();
  bindClientDisconnectAbort(req, res, ac, "POST /api/pipeline/pm");

  try {
    const {
      requirement,
      config,
      sessionId: sidIn,
      solutionIndex,
      solutionTitle,
      solutionSummary,
      images: imagesIn,
      requirementSpec: requirementSpecIn,
    } = req.body || {};
    let requirementText = String(requirement || "").trim();
    const images = normalizeVisionImages(imagesIn);
    if (!requirementText && images.length === 0) {
      sseSend(res, { type: "error", message: "请填写需求文字或上传/粘贴参考图" });
      sseSend(res, { type: "done" });
      return res.end();
    }
    if (!requirementText && images.length > 0) {
      requirementText =
        "（用户通过附图描述需求，请结合图片中的界面、流程与标注设计可交互原型）";
    }

    const solIdx = Math.max(0, Math.min(2, Number(solutionIndex) || 0));
    const solution = {
      index: solIdx,
      title: solutionTitle,
      summary: solutionSummary,
    };

    const sessionId =
      sidIn || `s_${Date.now()}_${randomBytes(3).toString("hex")}`;
    const sessionDir = path.join(GEN, sessionId);
    await mkdir(sessionDir, { recursive: true });

    let specDoc = String(requirementSpecIn || "").trim();
    if (!specDoc) {
      try {
        specDoc = await readFile(
          path.join(sessionDir, PM_SPEC_FILE),
          "utf8"
        );
        specDoc = specDoc.trim();
      } catch {
        /* no spec file */
      }
    }
    if (!specDoc) {
      sseSend(res, {
        type: "error",
        message: "请先点击「总结需求」生成标准需求文档，再生成原型",
      });
      sseSend(res, { type: "done" });
      return res.end();
    }

    const provider = String(config?.provider || "openai").toLowerCase();
    const apiKey =
      provider === "cursor"
        ? String(config?.cursorApiKey || "").trim()
        : String(config?.apiKey || "").trim();
    const { baseUrl, model } = config || {};
    const cursorRepoUrl = String(config?.cursorRepoUrl || "").trim();
    const cursorRepoRef = String(config?.cursorRepoRef ?? "").trim();

    sseSend(res, { type: "meta", sessionId, phase: "pm" });
    sseSend(res, { type: "thought", text: "【产品经理】理解需求并构思可交互原型结构…\n" });

    let pmReqText = requirementText;
    if (images.length > 0 && provider === "cursor") {
      pmReqText = await appendImageContextForCursor({
        res,
        specReqText: pmReqText,
        images,
        config,
        sessionDir,
        signal: ac.signal,
      });
    }

    const pmMessages =
      provider === "openai" && images.length > 0
        ? await buildPmVisionUserContent({
            requirement: pmReqText,
            solution,
            images,
            specDoc,
          })
        : await buildPmMessages(pmReqText, solution, specDoc);

    await streamPhaseToClient(res, {
      label: "产品经理",
      provider,
      baseUrl,
      apiKey,
      model,
      sessionDir,
      cursorMode: provider === "cursor" ? "create" : undefined,
      cursorRepoUrl,
      cursorRepoRef,
      cursorSessionDir: sessionDir,
      messages: pmMessages,
      signal: ac.signal,
      onFullText: async (raw) => {
        const html = extractHtml(raw);
        const fp = pmVariantFile(solIdx);
        await writeFile(path.join(sessionDir, fp), html, "utf8");
        sseSend(res, {
          type: "exec",
          label: `写入 ${fp}（${html.length} 字符）`,
        });
        sseSend(res, { type: "artifact", name: fp, mime: "text/html", preview: html.slice(0, 400) });
      },
    });

    sseSend(res, { type: "done", sessionId, phase: "pm" });
    res.end();
  } catch (e) {
    sseSend(res, { type: "error", message: String(e.message || e) });
    sseSend(res, { type: "done" });
    res.end();
  } finally {
    stopKeepalive();
  }
});

app.post("/api/pipeline/ui", async (req, res) => {
  sseInit(res);
  const stopKeepalive = startSseKeepalive(res);
  const ac = new AbortController();
  bindClientDisconnectAbort(req, res, ac, "POST /api/pipeline/ui");

  try {
    const {
      requirement,
      prototypeHtml,
      config,
      sessionId,
      solutionIndex,
      solutionTitle,
      solutionPhilosophy,
    } = req.body || {};
    const requirementText = String(requirement || "").trim();
    const htmlIn = String(prototypeHtml || "").trim();
    if (!htmlIn || !sessionId) {
      sseSend(res, { type: "error", message: "缺少 prototype 或 sessionId" });
      sseSend(res, { type: "done" });
      return res.end();
    }

    const solIdx = Math.max(0, Math.min(2, Number(solutionIndex) || 0));

    const sessionDir = path.join(GEN, String(sessionId));
    await mkdir(sessionDir, { recursive: true });
    const provider = String(config?.provider || "openai").toLowerCase();
    const apiKey =
      provider === "cursor"
        ? String(config?.cursorApiKey || "").trim()
        : String(config?.apiKey || "").trim();
    const { baseUrl, model } = config || {};
    const cursorRepoUrl = String(config?.cursorRepoUrl || "").trim();
    const cursorRepoRef = String(config?.cursorRepoRef ?? "").trim();

    sseSend(res, { type: "meta", sessionId, phase: "ui" });
    sseSend(res, { type: "thought", text: "【UI 设计】在原型基础上优化视觉与可读性…\n" });

    await streamPhaseToClient(res, {
      label: "UI 设计",
      provider,
      baseUrl,
      apiKey,
      model,
      sessionDir,
      cursorMode: provider === "cursor" ? "followup" : undefined,
      cursorRepoUrl,
      cursorRepoRef,
      cursorSessionDir: sessionDir,
      messages: await buildUiMessages(
        requirementText || "（沿用上一阶段需求）",
        htmlIn,
        {
          index: solIdx,
          title: solutionTitle,
          philosophy: solutionPhilosophy,
        }
      ),
      signal: ac.signal,
      onFullText: async (raw) => {
        const html = extractHtml(raw);
        const fp = uiVariantFile(solIdx);
        await writeFile(path.join(sessionDir, fp), html, "utf8");
        sseSend(res, { type: "exec", label: `写入 ${fp}` });
        sseSend(res, { type: "artifact", name: fp, mime: "text/html", preview: html.slice(0, 400) });
      },
    });

    sseSend(res, { type: "done", sessionId, phase: "ui" });
    res.end();
  } catch (e) {
    sseSend(res, { type: "error", message: String(e.message || e) });
    sseSend(res, { type: "done" });
    res.end();
  } finally {
    stopKeepalive();
  }
});

app.post("/api/pipeline/fullstack", async (req, res) => {
  sseInit(res);
  const stopKeepalive = startSseKeepalive(res);
  const ac = new AbortController();
  bindClientDisconnectAbort(req, res, ac, "POST /api/pipeline/fullstack");

  try {
    const { requirement, uiHtml, config, sessionId } = req.body || {};
    const requirementText = String(requirement || "").trim();
    const htmlIn = String(uiHtml || "").trim();
    if (!htmlIn || !sessionId) {
      sseSend(res, { type: "error", message: "缺少 ui 或 sessionId" });
      sseSend(res, { type: "done" });
      return res.end();
    }

    const sessionDir = path.join(GEN, String(sessionId));
    const outDir = path.join(sessionDir, "app");
    await mkdir(outDir, { recursive: true });
    const provider = String(config?.provider || "openai").toLowerCase();
    const apiKey =
      provider === "cursor"
        ? String(config?.cursorApiKey || "").trim()
        : String(config?.apiKey || "").trim();
    const { baseUrl, model } = config || {};
    const cursorRepoUrl = String(config?.cursorRepoUrl || "").trim();
    const cursorRepoRef = String(config?.cursorRepoRef ?? "").trim();

    sseSend(res, { type: "meta", sessionId, phase: "fullstack" });
    sseSend(res, {
      type: "thought",
      text: "【全栈开发】拆分静态资源、补齐脚本逻辑与 README…\n",
    });

    await streamPhaseToClient(res, {
      label: "全栈开发",
      provider,
      baseUrl,
      apiKey,
      model,
      sessionDir: outDir,
      cursorMode: provider === "cursor" ? "followup" : undefined,
      cursorRepoUrl,
      cursorRepoRef,
      cursorSessionDir: sessionDir,
      messages: await buildFsMessages(
        requirementText || "（沿用上一阶段需求）",
        htmlIn
      ),
      signal: ac.signal,
      onFullText: async (raw) => {
        let files = parseDelimitedFiles(raw);
        if (!files.length) {
          sseSend(res, {
            type: "thought",
            text: "\n[解析] 未识别 ### FILE 分段，尝试整段作为单文件 index.html\n",
          });
          files = [{ path: "index.html", content: extractHtml(raw) }];
        }
        for (const f of files) {
          const safe = f.path.replace(/\.\./g, "").replace(/[:*?"<>|]/g, "_");
          const dest = path.join(outDir, path.basename(safe));
          await writeFile(dest, f.content, "utf8");
          sseSend(res, { type: "exec", label: `写入 app/${path.basename(safe)}` });
        }
        sseSend(res, {
          type: "artifact",
          name: "app/",
          mime: "dir",
          preview: files.map((f) => f.path).join(", "),
        });
      },
    });

    sseSend(res, {
      type: "done",
      sessionId,
      phase: "fullstack",
      outputDir: formatGeneratedRelative(
        path.relative(ROOT, path.join(sessionDir, "app"))
      ),
    });
    res.end();
  } catch (e) {
    sseSend(res, { type: "error", message: String(e.message || e) });
    sseSend(res, { type: "done" });
    res.end();
  } finally {
    stopKeepalive();
  }
});

/** 校验 images：{ mime, base64 | dataUrl }[]，控制体积以防爆 JSON */
function normalizeVisionImages(images) {
  const out = [];
  const arr = Array.isArray(images) ? images : [];
  const maxImages = 4;
  // 约 1.2MB base64；超限直接丢弃该图（切勿截断，截断必导致 Invalid base64）
  const maxB64Chars = 1_200_000;
  for (const im of arr.slice(0, maxImages)) {
    let mime = String(im?.mime || "image/png").split(";")[0].trim();
    if (!/^image\/[\w.+-]+$/.test(mime)) mime = "image/png";
    const dataUrl = String(im?.dataUrl || "").trim();
    let b64 = String(im?.base64 || "").trim().replace(/\s/g, "");
    if (dataUrl.startsWith("data:")) {
      const m = /^data:(image\/[\w.+-]+);base64,([\s\S]+)$/i.exec(dataUrl);
      if (m) {
        mime = m[1];
        b64 = m[2].replace(/\s/g, "");
      }
    }
    if (!b64 || b64.length < 32) continue;
    if (b64.length > maxB64Chars) {
      console.warn(
        `[vision] skip oversized image mime=${mime} b64Len=${b64.length}`
      );
      continue;
    }
    const pad = b64.length % 4;
    if (pad) b64 = b64.slice(0, b64.length - pad);
    if (!/^[A-Za-z0-9+/]+=*$/.test(b64)) continue;
    out.push({
      mime,
      base64: b64,
      dataUrl: `data:${mime};base64,${b64}`,
    });
  }
  return out;
}

function markdownCursorTail(kind, standalone = false, qaMode = "") {
  const name = kind === "ops" ? "运维交接 Markdown 文档" : "测试点 Markdown 文档";
  if (standalone && kind === "qa" && qaMode === "framework") {
    return (
      "【对本条回复的要求】请只输出「项目页面框架」Markdown：用 # ## ### 与缩进 - 分层。" +
      "一级 ## 只给 Tab/主导航/后台一级菜单；页内 ### 按上→下左→右；" +
      "能跳转的入口下必须挂载目标页整树（入口→页名→区块/态→控件），禁止把内页全部摊平成与首页平级的一长列 ##。" +
      "授权登录等挂在自然入口下。禁止「原型说明」「更新记录」列为页面；禁止详细测试点、禁止 JSON/Playwright。"
    );
  }
  if (standalone && kind === "qa" && qaMode === "biz") {
    return (
      "【对本条回复的要求】请只输出「业务场景测试点」Markdown，必须含两段：" +
      "「## 冒烟门禁」（≤15条主链路通不通）+「## 业务场景」（按业务能力分组，叶子为条件+业务结果）。" +
      "必须覆盖框架各一级模块下的主要业务能力（对照框架入口/区块），禁止只写首页相关能力就结束；" +
      "冒烟须含工作台/首页可点待办卡片跳转；开关须开/关成对；" +
      "禁止只写功能名词；禁止按每个 UI 页平铺；禁止吸顶/音乐/弹窗文案等展示与逐步 UI；" +
      "禁止「正向业务/逆向业务」两大章。叶子写结果级断言；条件须含原型具体数字。" +
      "禁止把「原型说明」「更新记录」当被测对象；禁止 JSON/Playwright。"
    );
  }
  if (standalone && kind === "qa" && qaMode === "special") {
    return (
      "【对本条回复的要求】请只输出「专项测试点」Markdown：" +
      "五个一级 ## 必须齐全——权限与多角色、并发与幂等、弱网与异常网络、兼容性、安全；" +
      "叶子 [P0]/[P1]/[P2] +（条件）+ 可观察结果；写专项风险勿重复③普通点击；" +
      "覆盖支付/审核/抢号连点、越权、弱网重试、主端兼容、退出后不可操作；禁止空话；禁止 JSON/Playwright。"
    );
  }
  if (standalone && kind === "qa" && qaMode === "review") {
    return (
      "【对本条回复的要求】请只输出「测试点评审报告（①②③④）」Markdown：" +
      "须含 ## 总评，以及 ## ① 页面框架 / ## ② 业务场景 / ## ③ 页面功能 / ## ④ 专项测试（各含严重问题、遗漏、建议改进含待核实），末尾 ## 可保留的优点；" +
      "严重问题每条必须有「证据：」摘自原型抓取；禁止「若无可见菜单则为臆造」假设句；多入口可并存；" +
      "抓取未写清的提示文案勿轻易判臆造；吃不准放建议改进；③ 注意 P0 膨胀与易漏清单；④ 查五章是否齐；" +
      "禁止输出完整重写后的框架/场景/功能/专项全文；禁止 JSON/Playwright。"
    );
  }
  if (standalone && kind === "qa" && qaMode === "playwright-spec") {
    return (
      "【对本条回复的要求】请只输出一份 @playwright/test 的 TypeScript 文件，包在 ```typescript 代码块中。" +
      "含 import { test, expect } from '@playwright/test'；4～10 条主路径用例；优先 getByRole/getByText。" +
      "禁止 Markdown 测试点列表；禁止自定义 JSON 步骤 DSL。"
    );
  }
  if (standalone && kind === "qa") {
    return (
      "【对本条回复的要求】请直接输出完整简体中文 Markdown 页面功能测试点（③）：测行为、少抄皮；" +
      "≥70% 交互/校验/空态，≤30% 静态展示；叶子标 [P0]/[P1]/[P2]，且 [P0]≤25%；" +
      "短句「操作，能/会/不会+结果」；成对取消/确定；校验失败写清提示；禁止「界面与原型一致」；" +
      "禁止逐商品抄价格；禁止业务结果型叶子（归②）；入口导航每入口最多1条。" +
      "落实易漏清单：待办卡片、支付弹窗、用尽弹窗、成功闭环、多入口、详情、售罄限购、空态、售后分流。" +
      "必须覆盖框架每一个一级 ##，禁止只写首页就结束；" +
      "Tab 本页细测写在对应 ##，勿把全部细测堆在首页入口挂载下导致后续模块缺失。" +
      "按钮结果：交互轨迹/可见演示优先于说明；禁止臆造跳转。" +
      "禁止重复业务场景/冒烟主链路/专项；禁止给「原型说明」「更新记录」写用例；禁止 JSON/Playwright。"
    );
  }
  const qaExtra =
    kind === "qa"
      ? " 必须含 ## 冒烟自动化（Playwright）、## 业务测试点、## 功能测试点 三段；业务/功能段用 - 列表写一句话场景，禁止只输出裸 JSON。"
      : "";
  return `【对本条回复的要求】请在回复正文里直接输出完整可保存为 .md 的${name}，勿用外层 Markdown 代码围栏包裹全文；不要仅用链接、路径或「见仓库」代替正文。${qaExtra}`;
}

async function fetchPrototypePageContext(material) {
  const text = String(material || "");

  function normalizeProtoUrlKey(raw) {
    const s = String(raw || "").trim().replace(/[),.;；，。]+$/, "");
    if (!s) return "";
    try {
      const u = new URL(s);
      u.hash = "";
      return (u.origin + u.pathname + u.search).replace(/\/+$/, "");
    } catch {
      return s;
    }
  }

  /** 从素材识别前台/后台，或多原型独立 */
  function parseDualRoles(mat) {
    const multiMarked = /【多原型[·・.]?独立】/.test(mat);
    const dualMarked = /【双原型】/.test(mat);
    const frontM = mat.match(
      /(?:前台|C\s*端|客户端|小程序|用户端)\s*[:：]\s*(https?:\/\/[^\s)\]>"'；，。]+)/i
    );
    const backM = mat.match(
      /(?:后台|管理端|运营端|B\s*端|管理后台)\s*[:：]\s*(https?:\/\/[^\s)\]>"'；，。]+)/i
    );
    const aM = mat.match(
      /原型\s*A(?:（([^）]+)）|\(([^)]+)\))?\s*[:：]\s*(https?:\/\/[^\s)\]>"'；，。]+)/i
    );
    const bM = mat.match(
      /原型\s*B(?:（([^）]+)）|\(([^)]+)\))?\s*[:：]\s*(https?:\/\/[^\s)\]>"'；，。]+)/i
    );
    const frontKey = normalizeProtoUrlKey(frontM?.[1] || aM?.[3] || "");
    const backKey = normalizeProtoUrlKey(backM?.[1] || bM?.[3] || "");
    const labelA = String(aM?.[1] || aM?.[2] || "").trim();
    const labelB = String(bM?.[1] || bM?.[2] || "").trim();
    const multi = multiMarked || (!!aM && !!bM);
    const dual = !multi && (dualMarked || (!!frontKey && !!backKey));
    return {
      dual,
      multi,
      frontKey,
      backKey,
      labelA,
      labelB,
    };
  }

  function roleForUrl(url, roles) {
    const key = normalizeProtoUrlKey(url);
    if (!key) return "";
    if (roles.multi) {
      if (roles.frontKey && key === roles.frontKey) {
        return roles.labelA ? `原型A·${roles.labelA}` : "原型A";
      }
      if (roles.backKey && key === roles.backKey) {
        return roles.labelB ? `原型B·${roles.labelB}` : "原型B";
      }
      return "";
    }
    if (roles.frontKey && key === roles.frontKey) return "前台";
    if (roles.backKey && key === roles.backKey) return "后台";
    return "";
  }

  /** 素材声明仅测某版本时，抓取侧栏前写入 biz_ver_view（商务端原型） */
  function parseBizVerView(mat) {
    const t = String(mat || "");
    if (
      /【本版范围】[\s\S]{0,200}?V2|仅(?:生成)?\s*V2|按版本查看\s*[=：]\s*V2|biz_ver_view\s*[=：]\s*v2/i.test(
        t
      )
    ) {
      return "v2";
    }
    if (
      /【本版范围】[\s\S]{0,200}?V1|仅(?:生成)?\s*V1|按版本查看\s*[=：]\s*V1|biz_ver_view\s*[=：]\s*v1/i.test(
        t
      )
    ) {
      return "v1";
    }
    return "";
  }

  const dualRoles = parseDualRoles(text);
  const bizVerView = parseBizVerView(text);

  /** file:///F:/a/b.html → F:\a\b.html；兼容已百分号编码的中文路径 */
  function fileUrlToLocalPath(raw) {
    const s = String(raw || "").trim().replace(/[.,;:!?)]+$/, "");
    if (!s) return "";
    // 禁止把 http(s) URL 误判成盘符（Windows 上 path.normalize('p://host/…') → p:\host\…）
    if (/^https?:\/\//i.test(s) || /^\/\//.test(s)) return "";
    try {
      if (/^file:/i.test(s)) {
        const u = new URL(s);
        let p = decodeURIComponent(u.pathname || "");
        // Windows: /F:/xxx → F:/xxx
        if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
        return path.normalize(p.replace(/\//g, path.sep));
      }
    } catch {
      /* fall through */
    }
    // 裸盘符路径 F:\... 或 F:/...（排除 p://host 这类伪路径）
    if (/^[A-Za-z]:[\\/]/.test(s) && !/^[A-Za-z]:\/\//.test(s)) {
      try {
        return path.normalize(decodeURIComponent(s));
      } catch {
        return path.normalize(s);
      }
    }
    return "";
  }

  function isLocalPrototypeRef(u) {
    return /^file:/i.test(u) || !!fileUrlToLocalPath(u);
  }

  // 中文说明常直接跟在 URL 后（例如“https://...；需抓工作台页面”）。
  // 必须在中文标点处截断，否则整段说明会被当作 URL，随后模型只能臆造字段。
  const httpSeeds = [
    ...text.matchAll(/https?:\/\/[^\s\]>"'；，。、“”]+/gi),
  ].map((m) =>
    m[0].replace(/[.,;:!?；，。]+$/g, "").replace(/\)+$/g, "")
  );
  const fileSeeds = [
    ...text.matchAll(/file:\/\/\/[^\s\]>"'；，。、“”]+/gi),
  ].map((m) =>
    m[0].replace(/[.,;:!?；，。]+$/g, "")
  );
  // 允许文件名含空格与括号：index (2).html
  const winPathSeeds = [
    ...text.matchAll(
      /(?<![A-Za-z])([A-Za-z]:[\\/](?:[^\\/:*?"<>|\r\n]+[\\/])*[^\\/:*?"<>|\r\n]*\.html?\b)/gi
    ),
  ]
    .map((m) => m[1] || m[0])
    .map((s) => s.replace(/[.,;:!?]+$/g, ""))
    // 排除从 http:// 里误切出的 p:/127.0.0.1/...
    .filter((s) => !/^p:\/\//i.test(s) && !/^[A-Za-z]:\/\d/.test(s));

  const seedUrls = [...httpSeeds, ...fileSeeds, ...winPathSeeds].filter((u) => {
    const s = String(u || "");
    if (!s) return false;
    // 真 http(s) 一律保留（含 127.0.0.1:5180/generated/proto-local）
    if (/^https?:\/\//i.test(s) || /^file:/i.test(s)) return true;
    // 拦截伪盘符 p:/127.0.0.1:port/...
    if (/^[A-Za-z]:\/\//.test(s)) return false;
    if (/^[A-Za-z]:\/\d/.test(s) && /127\.0\.0\.1|localhost/.test(s)) return false;
    return true;
  });
  // 素材整段就是一条路径/URL 时直接用
  if (!seedUrls.length) {
    const bare = text.trim().replace(/^["']|["']$/g, "");
    if (/^https?:\/\//i.test(bare) || /^file:/i.test(bare) || fileUrlToLocalPath(bare)) {
      seedUrls.push(bare);
    } else {
      return { context: "", scan: null, meta: { usableContext: false } };
    }
  }

  const instructionText = text
    .replace(/https?:\/\/[^\s)\]>"'；，。、“”]+/gi, " ")
    .replace(/file:\/\/\/[^\s)\]>"'；，。、“”]+/gi, " ");
  const requestedPages = instructionText
    .split(/[；;，,、。\n\r]+/)
    .map((part) =>
      part
        .replace(/^(?:需抓|需要抓取|抓取|请抓取|包含|查看|页面包括)\s*/i, "")
        .replace(/\s*(?:页面)?\s*$/i, "")
        .trim()
    )
    .filter((part) => part && part.length <= 24)
    .filter((part, i, arr) => arr.indexOf(part) === i);

  /** 把 input/select 当前值提升为可见文本，避免 strip 标签后丢失默认值 */
  function promoteFormValues(html) {
    let h = String(html || "");
    h = h.replace(/<input\b([^>]*)\/?>/gi, (_full, attrs) => {
      const typeM = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i);
      const type = (typeM ? typeM[1] : "text").toLowerCase();
      if (/^(hidden|submit|button|file|image|reset)$/.test(type)) return " ";
      const checked = /\bchecked\b/i.test(attrs);
      if (type === "checkbox" || type === "radio") {
        return checked ? " [开启/选中] " : " [关闭/未选] ";
      }
      const valM = attrs.match(/\bvalue\s*=\s*["']([^"']*)["']/i);
      const val = valM ? valM[1].trim() : "";
      return val ? ` 【表单值:${val}】 ` : " ";
    });
    h = h.replace(
      /<option\b([^>]*)>([\s\S]*?)<\/option>/gi,
      (_full, attrs, label) => {
        if (!/\bselected\b/i.test(attrs)) return " ";
        const t = String(label || "")
          .replace(/<[^>]+>/g, "")
          .trim();
        const valM = attrs.match(/\bvalue\s*=\s*["']([^"']*)["']/i);
        const val = valM ? valM[1].trim() : "";
        return t || val ? ` 【选项:${t || val}】 ` : " ";
      }
    );
    h = h.replace(
      /<(?:textarea)[^>]*>([\s\S]*?)<\/textarea>/gi,
      (_full, body) => {
        const t = String(body || "").trim();
        return t ? ` 【表单值:${t.slice(0, 80)}】 ` : " ";
      }
    );
    return h;
  }

  function sameOrigin(a, b) {
    try {
      return new URL(a).origin === new URL(b).origin;
    } catch {
      return false;
    }
  }

  function discoverRelatedUrls(baseUrl, html) {
    const found = [];
    const re = /["']([^"']+\.html(?:\?[^"']*)?)["']/gi;
    let m;
    while ((m = re.exec(html))) {
      try {
        const abs = new URL(m[1], baseUrl).href;
        if (sameOrigin(baseUrl, abs)) found.push(abs);
      } catch {
        /* ignore */
      }
    }
    const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
    while ((m = hrefRe.exec(html))) {
      const raw = m[1];
      if (!/\.html(\?|$)/i.test(raw) && !/vertical\//i.test(raw)) continue;
      try {
        const abs = new URL(raw, baseUrl).href;
        if (sameOrigin(baseUrl, abs)) found.push(abs);
      } catch {
        /* ignore */
      }
    }
    return [...new Set(found)];
  }

  function pagePriority(u) {
    const s = decodeURIComponent(String(u));
    let score = 0;
    if (/个人中心|半遮屏|横屏/.test(s)) score += 100;
    if (/注册/.test(s)) score += 40;
    if (/忘记密码|重置密码/.test(s)) score += 35;
    if (/登录|login/i.test(s)) score += 20;
    if (/vertical|竖版/.test(s)) score += 10;
    return score;
  }

  async function fetchHtml(url) {
    const localPath = fileUrlToLocalPath(url);
    if (localPath) {
      try {
        if (!existsSync(localPath) || !statSync(localPath).isFile()) {
          return { ok: false, status: 404, html: "", localPath };
        }
        const html = await readFile(localPath, "utf8");
        return { ok: true, status: 200, html, localPath };
      } catch (e) {
        return {
          ok: false,
          status: 0,
          html: "",
          localPath,
          error: String(e?.message || e),
        };
      }
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    let fetchUrl = url;
    try {
      fetchUrl = new URL(url).href;
    } catch {
      try {
        fetchUrl = encodeURI(decodeURI(url));
      } catch {
        /* keep raw */
      }
    }
    try {
      const r = await fetch(fetchUrl, {
        signal: ctrl.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (!r.ok) return { ok: false, status: r.status, html: "" };
      return { ok: true, status: r.status, html: await r.text() };
    } finally {
      clearTimeout(timer);
    }
  }

  function discoverLocalRelated(baseFilePath, html) {
    const dir = path.dirname(baseFilePath);
    const found = [];
    const re = /["']([^"']+\.html(?:\?[^"']*)?)["']/gi;
    let m;
    while ((m = re.exec(html))) {
      const rel = String(m[1] || "").split("?")[0];
      if (!rel || /^https?:/i.test(rel) || rel.startsWith("#")) continue;
      try {
        const abs = path.normalize(path.resolve(dir, decodeURIComponent(rel)));
        if (abs.startsWith(dir) && existsSync(abs) && abs !== baseFilePath) {
          found.push(abs);
        }
      } catch {
        /* ignore */
      }
    }
    return [...new Set(found)];
  }

  function sliceDocSection(stripped, markers, maxLen = 14000) {
    let docIdx = -1;
    for (const marker of markers) {
      const i = stripped.indexOf(marker);
      if (i >= 0 && (docIdx < 0 || i < docIdx)) docIdx = i;
    }
    if (docIdx < 0) return "";
    return stripped.slice(docIdx, docIdx + maxLen).trim();
  }

  function htmlToContextBlock(url, html) {
    const withValues = promoteFormValues(html);
    const stripped = withValues
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();

    const numFacts = [
      ...stripped.matchAll(
        /([\u4e00-\u9fa5A-Za-z]{2,12}.{0,12})【表单值:(\d+(?:\.\d+)?)】\s*(元|天|%|个)?/g
      ),
    ]
      .slice(0, 40)
      .map((m) => `${m[1].replace(/\s+/g, "")}${m[2]}${m[3] || ""}`.trim());
    const factBlock =
      numFacts.length > 0
        ? `\n【原型表单具体数值（须写入测试点）】\n- ${[...new Set(numFacts)].join("\n- ")}\n`
        : "";

    const docBody = sliceDocSection(stripped, [
      "原型说明",
      "📋 原型说明",
      "整体概述",
      "🎯 整体概述",
    ]);
    let updateBody = sliceDocSection(stripped, ["更新记录", "📋 更新记录"], 12000);
    if (
      updateBody &&
      (updateBody.length < 40 ||
        !/202\d|优化|新增|规则|原型|菜单|Tab|字段|弹窗|话术|结构/i.test(updateBody))
    ) {
      updateBody = "";
    }
    const docIdx = docBody ? stripped.indexOf(docBody.slice(0, 12)) : -1;
    if (docIdx >= 0 || updateBody) {
      const uiBrief = stripped.slice(0, Math.min(docIdx >= 0 ? docIdx : 5000, 5000));
      const parts = [`来源：${url}`, factBlock];
      if (docBody) {
        parts.push(
          `【HTML 原型 · 原型说明正文（业务规则参考；与可点演示/交互轨迹冲突时以演示为准；禁止当作被测页面）】\n${docBody}`
        );
      }
      if (updateBody) {
        parts.push(
          `【HTML 原型 · 更新记录正文（PM 追加需求变更，须精读；禁止当作被测页面/禁止写打开更新记录用例）】\n${updateBody}`
        );
      }
      parts.push(
        `【页面 UI 结构线索（导航/入口从上到下、从左到右列模块；勿把「原型说明」「更新记录」列入框架）】\n${uiBrief}`
      );
      return parts.filter(Boolean).join("\n\n");
    }
    return (
      `来源：${url}\n` +
      factBlock +
      `【页面正文节选 · 请按界面上→下、左→右识别模块】\n${stripped.slice(0, 12000)}\n\n` +
      `【提醒】若页面存在「原型说明」或「更新记录」弹窗，请以其正文理解业务，但不要把它们列为被测模块。`
    );
  }

  function isSpaShellHtml(html) {
    const h = String(html || "");
    if (!h) return true;
    if (/<iframe[\s\S]*src=/i.test(h) && /preview|prototype|files\/index/i.test(h)) {
      return true;
    }
    const stripped = h
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // Vite/React 壳：几乎只有 title + root
    if (/id=["']root["']/i.test(h) && stripped.length < 120) return true;
    return stripped.length < 40;
  }

  /** 预览站 / SPA 壳：必须浏览器渲染，禁止只吃静态「产品系统」标题 */
  function shouldForceBrowserRender(url) {
    const u = String(url || "");
    // 本地原文件 / proto-local：含 PAGE_PROTO·#protoBody，必须走 Playwright 才能截图+热区+多页相册
    if (/\/generated\/proto-local\/|proto-local/i.test(u)) return true;
    if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/.*\.html?/i.test(u)) return true;
    if (fileUrlToLocalPath(u)) return true;
    return /wanxiayc\.com|\/preview\/|\/prototypes\/|xm\./i.test(u);
  }

  /**
   * 本地 .html → 写入 /generated/proto-local/ 并用本机 HTTP 打开，
   * 才能 Playwright 截多页图册（file:// 限制多且无法被 Vite 同源代理）。
   */
  async function ensureLocalProtoHttpUrl(localPath, html) {
    const abs = path.resolve(String(localPath || ""));
    if (!abs || !html) return "";
    const dir = path.join(GEN, "proto-local");
    await mkdir(dir, { recursive: true });
    const key = createHash("sha1")
      .update(html)
      .digest("hex")
      .slice(0, 16);
    const fname = `local_${key}.html`;
    const fp = path.join(dir, fname);
    if (!existsSync(fp)) {
      await writeFile(fp, html, "utf8");
    }
    return `http://127.0.0.1:${PORT}/generated/proto-local/${fname}`;
  }

  function isThinSpaShellContext(html) {
    const h = String(html || "");
    if (!isSpaShellHtml(h)) return false;
    const stripped = h
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return (
      stripped.length < 80 ||
      /^(产品系统|加载中|loading)/i.test(stripped) ||
      (stripped.length < 200 && /产品系统/.test(stripped) && !/商务管理|工作台|预警/.test(stripped))
    );
  }

  const queue = [];
  const seen = new Set();
  // 双原型保留前台+后台两个入口；单原型最多 3 个种子
  const seedLimit = dualRoles.dual || dualRoles.multi ? 4 : 3;
  for (const u of seedUrls.slice(0, seedLimit)) {
    if (seen.has(u)) continue;
    seen.add(u);
    queue.push(u);
  }

  const chunks = [];
  let bestScan = null;
  let bestMeta = null;
  let usableContextCount = 0;
  const MAX_PAGES = dualRoles.dual || dualRoles.multi ? 8 : 5;

  function takeScan(rendered) {
    if (rendered?.meta && (!bestMeta || (rendered.meta.extraPages?.length || 0) > (bestMeta.extraPages?.length || 0))) {
      bestMeta = rendered.meta;
    }
    if (!rendered?.scan?.screenshot) return;
    const next = rendered.scan;
    const nextPages = Array.isArray(next.pages) ? next.pages.length : 0;
    const curPages = Array.isArray(bestScan?.pages) ? bestScan.pages.length : 0;
    const nextRegs = Array.isArray(next.regions) ? next.regions.length : 0;
    const curRegs = Array.isArray(bestScan?.regions) ? bestScan.regions.length : 0;
    if (
      !bestScan ||
      nextPages > curPages ||
      (nextPages === curPages && nextRegs > curRegs)
    ) {
      bestScan = next;
    }
  }

  function pushContextChunk(url, body) {
    const role = roleForUrl(url, dualRoles);
    const label = role
      ? `【${role}原型】来源：${url}`
      : dualRoles.dual || dualRoles.multi
        ? `【同系统关联页】来源：${url}`
        : "";
    const textBody = String(body || "");
    if (label && !textBody.startsWith("【")) {
      chunks.push(`${label}\n${textBody}`);
    } else if (role && textBody.startsWith("来源：")) {
      chunks.push(textBody.replace(/^来源：/, `【${role}原型】来源：`));
    } else if (role) {
      chunks.push(`【${role}原型】\n${textBody}`);
    } else {
      chunks.push(textBody);
    }
  }

  for (let i = 0; i < queue.length && chunks.length < MAX_PAGES; i++) {
    const url = queue[i];
    try {
      const isHttp = /^https?:\/\//i.test(url);
      const localRef = fileUrlToLocalPath(url);

      // 本地 HTML：先静态读正文，再挂到 proto-local 用 Playwright 切页截图（蜂巢 showView 等）
      if (localRef) {
        const result = await fetchHtml(url);
        const { ok, status, html, localPath, error } = result;
        if (!ok) {
          pushContextChunk(
            url,
            `[本地文件读取失败${status ? ` ${status}` : ""}] ${localPath || localRef}${
              error ? ` · ${error}` : "（请确认路径存在且服务机能访问）"
            }`
          );
          continue;
        }
        pushContextChunk(url, htmlToContextBlock(localPath || localRef, html));
        usableContextCount += 1;
        try {
          const openUrl = await ensureLocalProtoHttpUrl(localPath || localRef, html);
          if (openUrl) {
            const rendered = await fetchRenderedPrototypeContext(openUrl, {
              targetPages: requestedPages,
              bizVerView,
            });
            takeScan(rendered);
            if (rendered.ok && rendered.context) {
              pushContextChunk(
                openUrl,
                `【本地原文件 · 浏览器多页截图】源：${localPath || localRef}\n` +
                  rendered.context
              );
            } else if (rendered.scan?.screenshot) {
              pushContextChunk(
                openUrl,
                `【本地原文件 · 已截图】源：${localPath || localRef}\n` +
                  (rendered.context || "正文抽取不足，已保留图册供溯源切页。")
              );
            }
          }
        } catch (e) {
          pushContextChunk(
            url,
            `[本地原型浏览器渲染失败] ${localPath || localRef} · ${String(e?.message || e)}`
          );
        }
        continue;
      }

      // 远程 SPA / iframe 预览：优先浏览器渲染（可自动登录）
      if (isHttp) {
        let preferRender = shouldForceBrowserRender(url);
        if (!preferRender) {
          try {
            const probe = await fetchHtml(url);
            if (!probe.ok || isSpaShellHtml(probe.html) || isThinSpaShellContext(probe.html)) {
              preferRender = true;
            } else if (probe.html.length > 8000) {
              preferRender = false;
            } else {
              preferRender = true;
            }
          } catch {
            preferRender = true;
          }
        }
        if (preferRender) {
          const rendered = await fetchRenderedPrototypeContext(url, {
            targetPages: requestedPages,
            bizVerView,
          });
          takeScan(rendered);
          if (rendered.ok && rendered.context) {
            pushContextChunk(url, rendered.context);
            usableContextCount += 1;
            continue;
          }
          // 部分成功：有截图/有限正文时仍写入，供溯源台展示
          if (rendered.context || rendered.scan?.screenshot) {
            pushContextChunk(
              url,
              rendered.context ||
                `来源（浏览器渲染）：${url}\n【提醒】正文抽取不足，但已截取当前视口。`
            );
            if (rendered.scan?.screenshot) usableContextCount += 1;
            continue;
          }
          pushContextChunk(
            url,
            `[浏览器渲染抓取未完成] ${url} · ${rendered.error || "未知错误"}；` +
              `请确认已执行 npm run setup:playwright。以下不会用空壳「产品系统」冒充框架。`
          );
          continue;
        }
      }

      const result = await fetchHtml(url);
      const { ok, status, html, localPath, error } = result;
      if (!ok) {
        pushContextChunk(
          url,
          localPath
            ? `[本地文件读取失败${status ? ` ${status}` : ""}] ${localPath}${
                error ? ` · ${error}` : "（请确认路径存在且服务机能访问）"
              }`
            : `[抓取失败 ${status}] ${url}`
        );
        continue;
      }
      // 静态壳几乎无内容时再强行走渲染（例如误判成非 SPA）
      if (isHttp && (isSpaShellHtml(html) || isThinSpaShellContext(html))) {
        const rendered = await fetchRenderedPrototypeContext(url, {
          targetPages: requestedPages,
          bizVerView,
        });
        takeScan(rendered);
        if (rendered.ok && rendered.context) {
          pushContextChunk(url, rendered.context);
          usableContextCount += 1;
          continue;
        }
        if (rendered.context || rendered.scan?.screenshot) {
          pushContextChunk(
            url,
            rendered.context ||
              `来源（浏览器渲染）：${url}\n【提醒】正文抽取不足，但已截取当前视口。`
          );
          if (rendered.scan?.screenshot) usableContextCount += 1;
          continue;
        }
        pushContextChunk(
          url,
          `[警告] ${url} 仅静态壳（如标题「产品系统」），浏览器渲染也未进入内部；请安装 Playwright 后重试。`
        );
        continue;
      }
      const sourceLabel = localPath || url;
      pushContextChunk(url, htmlToContextBlock(sourceLabel, html));
      usableContextCount += 1;
      // 同站 / 同目录自动发现相关 html
      if (chunks.length < MAX_PAGES) {
        const related = (
          localPath
            ? discoverLocalRelated(localPath, html)
            : discoverRelatedUrls(url, html)
        )
          .filter((u) => !seen.has(u))
          .sort((a, b) => pagePriority(b) - pagePriority(a));
        for (const u of related) {
          if (seen.has(u)) continue;
          seen.add(u);
          queue.push(u);
          if (queue.length >= MAX_PAGES + 2) break;
        }
      }
    } catch (e) {
      pushContextChunk(url, `[抓取异常] ${url} · ${String(e?.message || e)}`);
    }
  }

  if (dualRoles.multi && chunks.length) {
    chunks.unshift(
      "【多原型·独立合并说明】以下为两套彼此独立的系统原型（不是前台/后台关系）。" +
        "框架按「## 系统一（或原型标签名）」与「## 系统二」两大段组织；" +
        "业务场景各自成章，禁止硬写跨端闭环、禁止把一端叫成前台/后台。" +
        (bizVerView
          ? `已按版本过滤 biz_ver_view=${bizVerView} 抓取侧栏；生成测点勿展开未纳入该版本的菜单。`
          : "")
    );
  } else if (dualRoles.dual && chunks.length) {
    chunks.unshift(
      "【双原型合并说明】以下分别为前台与后台原型抓取（可能含同端关联页）。" +
        "梳理框架时按「## 前台」与「## 后台」两大段组织（或 C 端 / 管理后台）；" +
        "业务场景必须写跨端闭环：前台操作 → 后台列表/状态可见或可处理 → 后台操作后前台结果变化；" +
        "禁止只写单端、忽略另一端配置/审核/履约。"
    );
  } else if (chunks.length > 1) {
    chunks.unshift(
      "【多页原型合并说明】以下为入口页及同站自动发现的相关页面（如注册/忘记密码/个人中心）。" +
        "梳理框架时按「用户旅程」组织一级模块（登录相关 → 登录后个人中心等），" +
        "页面内按从上到下、从左到右列导航与功能；禁止把所有叶子功能摊平成一长列。" +
        (bizVerView
          ? `已按版本过滤 biz_ver_view=${bizVerView}；勿生成该版本未改菜单的全量测点。`
          : "")
    );
  } else if (bizVerView && chunks.length) {
    chunks.unshift(
      `【本版范围】抓取已按原型「按版本查看=${bizVerView}」过滤侧栏；` +
        "只写该版本可见/改动的模块与页面；禁止把隐藏的历史版本菜单写成待测范围。"
    );
  }
  return {
    context: chunks.join("\n\n"),
    scan: bestScan,
    meta: {
      ...(bestMeta || {}),
      usableContext: usableContextCount > 0,
      requestedPages,
      dualPrototype: dualRoles.dual,
      multiIndependent: dualRoles.multi,
      bizVerView: bizVerView || "",
    },
  };
}

/** 溯源台截图/说明缓存目录（按 URL 哈希落盘，下次免重复抓取） */
const TRACE_CACHE_DIR = path.join(GEN, "trace-cache");
const TRACE_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 天

function traceCacheKey(material) {
  return createHash("sha1")
    .update(String(material || "").trim())
    .digest("hex")
    .slice(0, 24);
}

async function readTraceCache(key) {
  const metaPath = path.join(TRACE_CACHE_DIR, `${key}.json`);
  if (!existsSync(metaPath)) return null;
  try {
    const raw = await readFile(metaPath, "utf8");
    const meta = JSON.parse(raw);
    const age = Date.now() - Number(meta.cachedAt || 0);
    if (!Number.isFinite(age) || age < 0 || age > TRACE_CACHE_TTL_MS) return null;
    const shotFile = path.join(TRACE_CACHE_DIR, `${key}.jpg`);
    let screenshotUrl = "";
    if (existsSync(shotFile) && statSync(shotFile).isFile()) {
      screenshotUrl = `/generated/trace-cache/${key}.jpg`;
    }
    // 没有截图的失败缓存不复用，避免「永远暂无截图」
    if (!screenshotUrl) return null;
    return { ...meta, screenshotUrl, fromCache: true };
  } catch {
    return null;
  }
}

async function writeTraceCache(key, payload) {
  await mkdir(TRACE_CACHE_DIR, { recursive: true });
  const shotB64 = String(payload.screenshot || "");
  let screenshotUrl = "";
  const m = /^data:image\/\w+;base64,(.+)$/i.exec(shotB64);
  if (m) {
    const shotPath = path.join(TRACE_CACHE_DIR, `${key}.jpg`);
    await writeFile(shotPath, Buffer.from(m[1], "base64"));
    screenshotUrl = `/generated/trace-cache/${key}.jpg`;
  }
  // 无截图不落盘，否则会挡住后续重试
  if (!screenshotUrl) return { screenshotUrl: "", pages: [] };

  const pagesOut = [];
  const rawPages = Array.isArray(payload.pages) ? payload.pages : [];
  for (let i = 0; i < rawPages.length; i++) {
    const p = rawPages[i] || {};
    const pageId = String(p.pageId || `p${i}`);
    let pageShotUrl = "";
    const pb = String(p.screenshot || "");
    const pm = /^data:image\/\w+;base64,(.+)$/i.exec(pb);
    if (pm) {
      const fname = `${key}_${pageId}.jpg`;
      await writeFile(
        path.join(TRACE_CACHE_DIR, fname),
        Buffer.from(pm[1], "base64")
      );
      pageShotUrl = `/generated/trace-cache/${fname}`;
    } else if (i === 0 && screenshotUrl) {
      pageShotUrl = screenshotUrl;
    }
    if (!pageShotUrl) continue;
    pagesOut.push({
      pageId,
      title: String(p.title || `页面${i + 1}`),
      hash: String(p.hash || ""),
      screenshotUrl: pageShotUrl,
      regions: Array.isArray(p.regions) ? p.regions : [],
      viewport: p.viewport || payload.viewport || { w: 1440, h: 900 },
    });
  }

  const meta = {
    cachedAt: Date.now(),
    material: String(payload.material || "").slice(0, 500),
    contextText: String(payload.contextText || "").slice(0, 200000),
    paragraphs: Array.isArray(payload.paragraphs) ? payload.paragraphs : [],
    regions: Array.isArray(payload.regions) ? payload.regions : [],
    viewport: payload.viewport || { w: 1440, h: 900 },
    usableContext: !!payload.usableContext,
    hasScreenshot: true,
    pages: pagesOut,
    tracePack: payload.tracePack || null,
  };
  await writeFile(
    path.join(TRACE_CACHE_DIR, `${key}.json`),
    JSON.stringify(meta),
    "utf8"
  );
  return { ...meta, screenshotUrl, pages: pagesOut };
}

/** 从说明段落 + 热区组装 Trace Pack（生成/溯源共用） */
function buildTracePackFromParts({ paragraphs = [], regions = [], pages = [] }) {
  function clean(s) {
    return String(s || "")
      .replace(/\s+/g, " ")
      .trim();
  }
  function slugId(prefix, text, idx) {
    const base = clean(text)
      .slice(0, 24)
      .replace(/[^\u4e00-\u9fa5\w]+/g, "");
    return `${prefix}_${idx}_${base || "x"}`;
  }
  function tokensOf(text) {
    const s = clean(text).toLowerCase();
    const out = new Set();
    const en = s.match(/[a-z0-9]{2,}/g) || [];
    en.forEach((w) => out.add(w));
    const cn = s.replace(/[a-z0-9]+/g, " ");
    for (let i = 0; i < cn.length - 1; i++) {
      if (/[\u4e00-\u9fa5]/.test(cn[i]) && /[\u4e00-\u9fa5]/.test(cn[i + 1])) {
        out.add(cn[i] + cn[i + 1]);
      }
    }
    return [...out];
  }
  function scoreMatch(a, b) {
    const ta = tokensOf(a);
    const tb = tokensOf(b);
    if (!ta.length || !tb.length) return 0;
    const setB = new Set(tb);
    let hit = 0;
    for (const t of ta) if (setB.has(t)) hit += 1;
    const jaccard = hit / Math.max(1, new Set([...ta, ...tb]).size);
    const aClean = clean(a);
    const bClean = clean(b);
    if (aClean && bClean && (aClean.includes(bClean) || bClean.includes(aClean))) {
      return Math.max(jaccard, 0.55);
    }
    return jaccard;
  }

  const pageList = (pages || []).map((p, i) => ({
    pageId: p.pageId || `p${i}`,
    title: p.title || `页面${i + 1}`,
    hash: p.hash || "",
    screenshotUrl: p.screenshotUrl || "",
  }));
  const homeId = pageList[0]?.pageId || "p0";
  const blocks = [];
  const usedPara = new Set();
  let i = 0;

  // 合并首页热区 + 各图册页热区（带 pageId），避免全部钉死在 p0
  const regionPool = [];
  const seenReg = new Set();
  const pushReg = (r, pageId) => {
    if (!r) return;
    const key = `${pageId}|${r.id || ""}|${clean(r.title || "")}|${JSON.stringify(r.rect || null)}`;
    if (seenReg.has(key)) return;
    seenReg.add(key);
    regionPool.push({ ...r, pageId: r.pageId || pageId || homeId });
  };
  for (const r of regions || []) pushReg(r, r.pageId || homeId);
  for (const p of pages || []) {
    const pid = p.pageId || homeId;
    for (const r of p.regions || []) pushReg(r, pid);
  }

  for (const region of regionPool) {
    const title = clean(region.title || region.id || `区域${i + 1}`);
    let bestPara = null;
    let bestSc = 0;
    for (const para of paragraphs || []) {
      if (usedPara.has(para.id)) continue;
      const sc = scoreMatch(title, `${para.title || ""} ${para.body || ""}`);
      if (sc > bestSc) {
        bestSc = sc;
        bestPara = para;
      }
    }
    if (bestPara && bestSc >= 0.12) usedPara.add(bestPara.id);
    const kws = [];
    if (region.keyword) kws.push(region.keyword);
    if (title) kws.push(title);
    blocks.push({
      blockId: slugId("b", title, i++),
      pageId: region.pageId || homeId,
      title,
      descText: bestPara ? `${bestPara.title}\n${bestPara.body}` : title,
      keywords: kws.slice(0, 6),
      protoRect: region.rect || null,
      descIds: bestPara ? [bestPara.id] : [],
      caseIds: [],
      source: region.source === "spec-keyword" ? "spec-keyword" : "region",
    });
  }

  for (const para of paragraphs || []) {
    if (usedPara.has(para.id)) continue;
    usedPara.add(para.id);
    const title = clean(para.title || "").slice(0, 40) || `段落${i + 1}`;
    // 说明段落尽量挂到标题匹配的图册页
    let paraPage = homeId;
    let bestPageSc = 0;
    for (const p of pageList) {
      const sc = scoreMatch(title, p.title || "");
      if (sc > bestPageSc) {
        bestPageSc = sc;
        paraPage = p.pageId;
      }
    }
    blocks.push({
      blockId: slugId("b", title, i++),
      pageId: bestPageSc >= 0.2 ? paraPage : homeId,
      title,
      descText: `${para.title || ""}\n${para.body || ""}`.trim(),
      keywords: [title].filter(Boolean),
      protoRect: null,
      descIds: [para.id],
      caseIds: [],
      source: "desc",
    });
  }

  return {
    version: 1,
    builtAt: Date.now(),
    pages: pageList,
    blocks,
  };
}

/** 溯源台：抓取原型说明段落 + 扫描热区（一期；默认读缓存） */
app.post("/api/qa/trace-context", async (req, res) => {
  try {
    const material = String(req.body?.material || req.body?.url || "").trim();
    if (!material) {
      return res.status(400).json({ ok: false, error: "缺少原型 URL" });
    }
    const force = !!(req.body?.force || req.body?.refresh);
    const cacheKey = traceCacheKey(material);

    if (!force) {
      const hit = await readTraceCache(cacheKey);
      if (hit) {
        return res.json({
          ok: true,
          fromCache: true,
          cachedAt: hit.cachedAt,
          contextText: hit.contextText || "",
          paragraphs: hit.paragraphs || [],
          regions: hit.regions || [],
          viewport: hit.viewport || { w: 1440, h: 900 },
          screenshot: "",
          screenshotUrl: hit.screenshotUrl || "",
          usableContext: !!hit.usableContext,
          pages: hit.pages || [],
          tracePack: hit.tracePack || null,
        });
      }
    }

    const fetched = await fetchPrototypePageContext(material);
    const contextText = String(fetched?.context || "");
    const regions = Array.isArray(fetched?.scan?.regions)
      ? fetched.scan.regions
      : [];
    const viewport = fetched?.scan?.viewport || { w: 1440, h: 900 };
    const screenshot = String(fetched?.scan?.screenshot || "");
    const rawPages = Array.isArray(fetched?.scan?.pages)
      ? fetched.scan.pages
      : [];

    // 切段落：优先「字段与功能」条目（标题：正文）
    function clean(s) {
      return String(s || "")
        .replace(/\s+/g, " ")
        .trim();
    }
    function slugId(prefix, text, idx) {
      const base = clean(text)
        .slice(0, 24)
        .replace(/[^\u4e00-\u9fa5\w]+/g, "");
      return `${prefix}_${idx}_${base || "x"}`;
    }
    let body = contextText;
    const mark = contextText.match(
      /【HTML 原型 · 原型说明正文[^\]]*】\s*([\s\S]*?)(?=【HTML 原型 · 更新记录|【更新记录|【导航|【当前页|【其它侧栏|【页面 UI|【页面正文|【双原型|【多页原型|$)/
    );
    if (mark) body = mark[1].trim();
    else {
      const ui = contextText.match(
        /【页面 UI 结构线索[^\]]*】\s*([\s\S]*?)(?=【|来源：|$)/
      );
      if (ui) body = ui[1].trim();
      else {
        const plain = contextText.match(
          /【页面正文节选[^\]]*】\s*([\s\S]*?)(?=【提醒】|【|$)/
        );
        if (plain) body = plain[1].trim();
      }
    }

    const paragraphs = [];
    const lines = String(body || "").split(/\r?\n/);
    let buf = [];
    let title = "";
    let idx = 0;
    const flush = () => {
      const textBody = buf.join("\n").trim();
      if (!textBody && !title) return;
      const t = title || clean(textBody).slice(0, 28) || `段落${idx + 1}`;
      paragraphs.push({
        id: slugId("d", t, idx++),
        title: t,
        body: textBody || t,
      });
      buf = [];
      title = "";
    };
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (buf.length) flush();
        continue;
      }
      if (/^(界面作用|字段与功能|原型说明)\s*$/.test(trimmed)) continue;
      const h = /^(#{1,3})\s+(.+)$/.exec(trimmed);
      if (h) {
        flush();
        title = clean(h[2]);
        continue;
      }
      const labeled =
        /^[-•·●]?\s*([^：:]{2,28})[：:]\s*(.+)$/.exec(trimmed) ||
        /^([^：:]{2,28})[：:]\s*(.+)$/.exec(trimmed);
      if (labeled && !/^(交互|边界|来源)/.test(labeled[1])) {
        flush();
        title = clean(labeled[1]);
        buf.push(trimmed);
        continue;
      }
      buf.push(trimmed);
      if (buf.join("").length > 220) flush();
    }
    flush();

    // 图册热区标题「前置」进说明段，避免被日报表类噪音段落挤出前 120 条
    const controlParas = [];
    const seenParaTitle = new Set();
    for (const pg of rawPages) {
      for (const r of pg.regions || []) {
        const t = clean(r.title || r.keyword || "");
        if (!t || t.length > 20 || seenParaTitle.has(t)) continue;
        if (/^(首页|工作台|消息|搜索好友或者群聊)$/.test(t)) continue;
        seenParaTitle.add(t);
        controlParas.push({
          id: slugId("d", t, idx++),
          title: t,
          body: `${t}（原型页「${clean(pg.title || "")}」控件热区；悬停测点可联动高亮）`,
        });
      }
    }
    const noiseTitle =
      /^(新增用户|活跃用户|付费用户|新增付费用户|新增设备|注册转化率|今日|昨日|近\d+天)$/;
    const filteredBodyParas = paragraphs.filter((p) => {
      const t = clean(p.title || "");
      if (!t) return false;
      if (noiseTitle.test(t)) return false;
      if (seenParaTitle.has(t)) return false;
      seenParaTitle.add(t);
      return true;
    });
    const paras = [...controlParas, ...filteredBodyParas].slice(0, 120);
    const packDraft = buildTracePackFromParts({
      paragraphs: paras,
      regions,
      pages: rawPages.map((p, i) => ({
        pageId: p.pageId || `p${i}`,
        title: p.title,
        hash: p.hash,
        screenshotUrl: "",
        regions: Array.isArray(p.regions) ? p.regions : [],
      })),
    });

    let screenshotUrl = "";
    let pagesOut = [];
    let tracePack = packDraft;
    try {
      const saved = await writeTraceCache(cacheKey, {
        material,
        contextText,
        paragraphs: paras,
        regions,
        viewport,
        screenshot,
        pages: rawPages,
        tracePack: packDraft,
        usableContext: !!fetched?.meta?.usableContext,
      });
      screenshotUrl = saved.screenshotUrl || "";
      pagesOut = saved.pages || [];
      if (saved.tracePack) {
        const urlById = new Map(
          (pagesOut || []).map((p) => [p.pageId, p.screenshotUrl])
        );
        tracePack = {
          ...saved.tracePack,
          pages: (saved.tracePack.pages || []).map((p) => ({
            ...p,
            screenshotUrl: urlById.get(p.pageId) || p.screenshotUrl || "",
          })),
        };
        try {
          const metaPath = path.join(TRACE_CACHE_DIR, `${cacheKey}.json`);
          if (existsSync(metaPath)) {
            const meta = JSON.parse(await readFile(metaPath, "utf8"));
            meta.tracePack = tracePack;
            await writeFile(metaPath, JSON.stringify(meta), "utf8");
          }
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      dbg("trace cache write failed", String(e?.message || e));
    }

    res.json({
      ok: true,
      fromCache: false,
      cachedAt: Date.now(),
      contextText,
      paragraphs: paras,
      regions,
      viewport,
      screenshot: screenshotUrl ? "" : screenshot,
      screenshotUrl,
      usableContext: !!fetched?.meta?.usableContext,
      pages: pagesOut,
      tracePack,
      meta: fetched?.meta || null,
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: String(e?.message || e),
    });
  }
});

app.post("/api/qa/scan-ack", (req, res) => {
  const sessionId = String(req.body?.sessionId || "").trim();
  if (!sessionId) return res.status(400).json({ ok: false, error: "缺少 sessionId" });
  const hit = resolveScanAck(sessionId);
  res.json({ ok: true, acknowledged: hit });
});

/** 写入 tests/playwright.spec.ts 并启动 Playwright UI */
app.post("/api/qa/open-playwright-ui", async (req, res) => {
  try {
    const rawTs = String(req.body?.typescript || "").trim();
    if (!rawTs || rawTs.length < 40) {
      return res.status(400).json({ ok: false, error: "无有效的 .spec.ts 内容" });
    }
    const baseHint =
      normalizePlaywrightBaseUrl(req.body?.baseUrl) ||
      guessPlaywrightBaseUrl(rawTs);
    let ts = sanitizePlaywrightSpecTs(rawTs, baseHint);
    if (normalizePlaywrightBaseUrl(req.body?.baseUrl)) {
      ts = rewritePlaywrightBaseUrl(ts, baseHint);
    }
    const testsDir = path.join(ROOT, "tests");
    await mkdir(testsDir, { recursive: true });
    const dest = path.join(testsDir, "playwright.spec.ts");
    await writeFile(dest, ts, "utf8");
    const child = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["playwright", "test", "--ui", "tests/playwright.spec.ts"],
      {
        cwd: ROOT,
        detached: true,
        stdio: "ignore",
        shell: process.platform === "win32",
        windowsHide: false,
      }
    );
    child.unref();
    res.json({
      ok: true,
      path: path.relative(ROOT, dest).replace(/\\/g, "/"),
      baseUrl: baseHint || undefined,
      typescript: ts,
      hint: "已写入 tests/playwright.spec.ts，并尝试启动 Playwright UI",
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/** 收集最近 Playwright 失败上下文（test-results 下各用例的 error-context.md） */
async function collectLatestPlaywrightErrors(limit = 5) {
  const root = path.join(ROOT, "test-results");
  if (!existsSync(root)) return [];
  let dirs = [];
  try {
    dirs = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const hits = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const fp = path.join(root, d.name, "error-context.md");
    if (!existsSync(fp)) continue;
    try {
      const st = statSync(fp);
      const text = await readFile(fp, "utf8");
      hits.push({
        folder: d.name,
        mtimeMs: st.mtimeMs,
        text: text.slice(0, 12000),
      });
    } catch {
      /* ignore */
    }
  }
  hits.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return hits.slice(0, limit);
}

app.get("/api/qa/pw-latest-errors", async (_req, res) => {
  try {
    const items = await collectLatestPlaywrightErrors(8);
    res.json({
      ok: true,
      count: items.length,
      items: items.map((x) => ({
        folder: x.folder,
        mtimeMs: x.mtimeMs,
        preview: x.text.slice(0, 400),
        text: x.text,
      })),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/** 无头跑一遍 tests/playwright.spec.ts */
function runPlaywrightSpecOnce(timeoutMs = 180000) {
  return new Promise((resolve) => {
    const child = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["playwright", "test", "tests/playwright.spec.ts", "--reporter=list"],
      {
        cwd: ROOT,
        shell: process.platform === "win32",
        env: { ...process.env, CI: "1" },
        windowsHide: true,
      }
    );
    let out = "";
    const onChunk = (buf) => {
      out += String(buf || "");
      if (out.length > 40000) out = out.slice(-30000);
    };
    child.stdout?.on("data", onChunk);
    child.stderr?.on("data", onChunk);
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      finish({
        ok: false,
        timedOut: true,
        code: -1,
        output: out.slice(-12000),
      });
    }, timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      finish({
        ok: false,
        timedOut: false,
        code: -1,
        output: String(e?.message || e) + "\n" + out.slice(-8000),
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish({
        ok: code === 0,
        timedOut: false,
        code: code ?? -1,
        output: out.slice(-12000),
      });
    });
  });
}

/**
 * 自动：写入 spec → 无头跑测 → 有失败则 AI 审查并修一版 → SSE 下发修复稿
 */
app.post("/api/qa/pw-auto-fix", async (req, res) => {
  sseInit(res);
  const stopKeepalive = startSseKeepalive(res);
  const ac = new AbortController();
  bindClientDisconnectAbort(req, res, ac, "POST /api/qa/pw-auto-fix");

  try {
    const {
      typescript: tsIn,
      baseUrl: testBaseIn,
      material,
      config,
      openUi,
    } = req.body || {};

    const provider = String(config?.provider || "openai").toLowerCase();
    const baseUrl = String(config?.baseUrl || "").trim();
    const apiKey =
      provider === "cursor"
        ? String(config?.cursorApiKey || "").trim()
        : String(config?.apiKey || "").trim();
    const model = String(config?.model || "").trim();
    if (provider === "cursor") {
      if (!apiKey) {
        sseSend(res, { type: "error", message: "请填写 Cursor API Key" });
        sseSend(res, { type: "done" });
        return res.end();
      }
      if (!String(config?.cursorRepoUrl || "").trim()) {
        sseSend(res, { type: "error", message: "Cursor Cloud 需要已授权仓库 URL" });
        sseSend(res, { type: "done" });
        return res.end();
      }
    } else if (!apiKey) {
      sseSend(res, { type: "error", message: "请填写 API Key" });
      sseSend(res, { type: "done" });
      return res.end();
    }

    let spec = String(tsIn || "").trim();
    if (!spec) {
      try {
        spec = await readFile(path.join(ROOT, "tests", "playwright.spec.ts"), "utf8");
      } catch {
        spec = "";
      }
    }
    if (!spec || spec.length < 40) {
      sseSend(res, { type: "error", message: "无有效的 .spec.ts，请先生成" });
      sseSend(res, { type: "done" });
      return res.end();
    }

    const testBase = normalizePlaywrightBaseUrl(testBaseIn);
    let prepared = sanitizePlaywrightSpecTs(spec, testBase || guessPlaywrightBaseUrl(spec));
    if (testBase) prepared = rewritePlaywrightBaseUrl(prepared, testBase);

    const testsDir = path.join(ROOT, "tests");
    await mkdir(testsDir, { recursive: true });
    const dest = path.join(testsDir, "playwright.spec.ts");
    await writeFile(dest, prepared, "utf8");
    sseSend(res, {
      type: "exec",
      label: `已写入 tests/playwright.spec.ts（${prepared.length} 字符）`,
    });
    sseSend(res, {
      type: "thought",
      text: "【自动】开始无头跑测 playwright.spec.ts…\n",
    });

    if (openUi) {
      try {
        const child = spawn(
          process.platform === "win32" ? "npx.cmd" : "npx",
          ["playwright", "test", "--ui", "tests/playwright.spec.ts"],
          {
            cwd: ROOT,
            detached: true,
            stdio: "ignore",
            shell: process.platform === "win32",
            windowsHide: false,
          }
        );
        child.unref();
        sseSend(res, { type: "thought", text: "已同时打开 Playwright UI（可稍后手动复验）。\n" });
      } catch {
        /* ignore */
      }
    }

    const run = await runPlaywrightSpecOnce(180000);
    if (ac.signal.aborted) {
      sseSend(res, { type: "done", phase: "pw_auto_fix", aborted: true });
      return res.end();
    }

    if (run.ok) {
      sseSend(res, {
        type: "thought",
        text: "【自动】跑测全部通过，无需修复。\n",
      });
      sseSend(res, {
        type: "delta",
        text:
          "## 自动审查结果\n\n" +
          "本轮 Playwright 用例**全部通过**。\n\n" +
          "结论：当前脚本与页面在测试环境下表现一致，无需改代码。\n\n" +
          "```\n" +
          (run.output || "").slice(-2500) +
          "\n```\n",
      });
      sseSend(res, {
        type: "done",
        phase: "pw_auto_fix",
        passed: true,
        failed: 0,
        fixed: false,
      });
      return res.end();
    }

    const errors = await collectLatestPlaywrightErrors(6);
    const errBlock = errors.length
      ? errors
          .map((e, i) => `### 失败 ${i + 1}：${e.folder}\n${e.text.slice(0, 8000)}`)
          .join("\n\n")
      : `（无 error-context.md，以下为终端输出节选）\n\`\`\`\n${(run.output || "").slice(-6000)}\n\`\`\``;

    sseSend(res, {
      type: "thought",
      text:
        `【自动】跑测未通过（exit=${run.code}${run.timedOut ? ", 超时" : ""}），` +
        `已收集 ${errors.length} 份失败报告，开始审查并尝试修复…\n`,
    });

    const sys =
      (await loadPlaywrightDebugSkill()) +
      "\n\n## 本轮任务（自动审查）\n" +
      "刚刚无头跑测已失败。请按 Skill 判断 A/B/C；属 A 则输出完整修复版 playwright.spec.ts。";

    const userContent =
      `【测试环境 BASE_URL】\n${testBase || "（未填）"}\n\n` +
      `【原型/说明摘录】\n${String(material || "").trim().slice(0, 2500) || "（无）"}\n\n` +
      `【当前 playwright.spec.ts】\n\`\`\`typescript\n${prepared.slice(0, 28000)}\n\`\`\`\n\n` +
      `【跑测摘要】exit=${run.code} timedOut=${!!run.timedOut}\n` +
      `\`\`\`\n${(run.output || "").slice(-4000)}\n\`\`\`\n\n` +
      `【失败上下文】\n${errBlock}\n\n` +
      "请审查并在需要时给出完整修复版 .spec.ts。";

    const sessionId = `pwauto_${Date.now()}_${randomBytes(2).toString("hex")}`;
    const sessionDir = path.join(GEN, sessionId);
    await mkdir(sessionDir, { recursive: true });

    await streamPhaseToClient(res, {
      label: "PW 自动审查修复",
      provider,
      baseUrl,
      apiKey,
      model,
      sessionDir,
      cursorMode: provider === "cursor" ? "create" : undefined,
      cursorRepoUrl: String(config?.cursorRepoUrl || "").trim(),
      cursorRepoRef: String(config?.cursorRepoRef || "").trim(),
      cursorSessionDir: sessionDir,
      cursorTail:
        "【对本条回复的要求】先中文结论（A/B/C）；若需改用例，必须输出完整 ```typescript 整份 playwright.spec.ts。",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userContent },
      ],
      signal: ac.signal,
      onFullText: async (raw) => {
        let fixed = extractPlaywrightSpecTs(String(raw || ""));
        if (!looksLikePlaywrightSpec(fixed)) return;
        if (testBase) fixed = rewritePlaywrightBaseUrl(fixed, testBase);
        fixed = sanitizePlaywrightSpecTs(
          fixed,
          testBase || guessPlaywrightBaseUrl(fixed)
        );
        try {
          await writeFile(dest, fixed, "utf8");
          await writeFile(path.join(sessionDir, "playwright.spec.ts"), fixed, "utf8");
        } catch {
          /* ignore */
        }
        sseSend(res, {
          type: "qa_playwright_spec",
          typescript: fixed,
          file: "playwright.spec.ts",
          autoApplied: true,
        });
        sseSend(res, {
          type: "exec",
          label: "已自动写回 tests/playwright.spec.ts，并下发预览",
        });
      },
    });

    sseSend(res, {
      type: "done",
      phase: "pw_auto_fix",
      passed: false,
      failed: Math.max(1, errors.length),
      fixed: true,
      sessionId,
    });
    res.end();
  } catch (e) {
    sseSend(res, { type: "error", message: String(e?.message || e) });
    sseSend(res, { type: "done", phase: "pw_auto_fix" });
    res.end();
  } finally {
    stopKeepalive();
  }
});

/**
 * Playwright 调试对话：自动注入当前 .spec.ts + 最近 test-results 报错。
 * 若助手输出 typescript 代码块，SSE 额外下发 qa_playwright_spec 供前端回写。
 */
app.post("/api/qa/pw-debug-chat", async (req, res) => {
  sseInit(res);
  const stopKeepalive = startSseKeepalive(res);
  const ac = new AbortController();
  bindClientDisconnectAbort(req, res, ac, "POST /api/qa/pw-debug-chat");

  try {
    const {
      message,
      typescript: tsIn,
      baseUrl: testBaseIn,
      material,
      history: historyIn,
      config,
      images: imagesIn,
    } = req.body || {};
    const chatImages = normalizeVisionImages(imagesIn);
    const userText = String(message || "").trim().slice(0, 6000);
    if (!userText) {
      sseSend(res, { type: "error", message: "消息为空" });
      sseSend(res, { type: "done" });
      return res.end();
    }

    const provider = String(config?.provider || "openai").toLowerCase();
    const baseUrl = String(config?.baseUrl || "").trim();
    const apiKey =
      provider === "cursor"
        ? String(config?.cursorApiKey || "").trim()
        : String(config?.apiKey || "").trim();
    const model = String(config?.model || "").trim();
    if (provider === "cursor") {
      if (!apiKey) {
        sseSend(res, { type: "error", message: "请填写 Cursor API Key" });
        sseSend(res, { type: "done" });
        return res.end();
      }
    } else if (!apiKey) {
      sseSend(res, { type: "error", message: "请填写 API Key" });
      sseSend(res, { type: "done" });
      return res.end();
    }

    let spec = String(tsIn || "").trim();
    if (!spec) {
      try {
        spec = await readFile(path.join(ROOT, "tests", "playwright.spec.ts"), "utf8");
      } catch {
        spec = "";
      }
    }
    const testBase = normalizePlaywrightBaseUrl(testBaseIn);
    const errors = await collectLatestPlaywrightErrors(5);
    const errBlock = errors.length
      ? errors
          .map(
            (e, i) =>
              `### 失败 ${i + 1}：${e.folder}\n${e.text.slice(0, 8000)}`
          )
          .join("\n\n")
      : "（暂无 test-results 报错文件；请先跑一遍 Playwright 或粘贴错误信息）";

    const sys =
      (await loadPlaywrightDebugSkill()) +
      "\n\n## 本轮任务（调试对话）\n" +
      "根据用户描述与失败报告排查；需要改代码时输出完整 typescript 代码块。";

    const hist = Array.isArray(historyIn)
      ? historyIn
          .filter(
            (m) =>
              m &&
              (m.role === "user" || m.role === "assistant") &&
              typeof m.content === "string"
          )
          .slice(-10)
          .map((m) => ({
            role: m.role,
            content: String(m.content).slice(0, 4000),
          }))
      : [];

    const contextUser =
      `【测试环境 BASE_URL】\n${testBase || "（未填，沿用脚本内常量）"}\n\n` +
      `【原型/说明摘录】\n${String(material || "").trim().slice(0, 3000) || "（无）"}\n\n` +
      `【当前 playwright.spec.ts】\n\`\`\`typescript\n${(spec || "（空）").slice(0, 28000)}\n\`\`\`\n\n` +
      `【最近 Playwright 失败上下文】\n${errBlock}\n\n` +
      `【用户问题】\n${userText}`;

    const messages = [
      { role: "system", content: sys },
      ...hist,
      { role: "user", content: contextUser },
    ];

    if (provider === "openai" && chatImages.length > 0) {
      const last = messages[messages.length - 1];
      const parts = [{ type: "text", text: last.content }];
      for (const im of chatImages) {
        const url = /^data:/.test(im?.dataUrl || "")
          ? String(im.dataUrl).trim()
          : "";
        if (!url) continue;
        parts.push({ type: "image_url", image_url: { url } });
      }
      messages[messages.length - 1] = { role: "user", content: parts };
    }

    const sessionId = `pwdbg_${Date.now()}_${randomBytes(2).toString("hex")}`;
    const sessionDir = path.join(GEN, sessionId);
    await mkdir(sessionDir, { recursive: true });

    sseSend(res, {
      type: "meta",
      phase: "pw_debug",
      sessionId,
      errorCount: errors.length,
    });
    if (errors.length) {
      sseSend(res, {
        type: "thought",
        text: `已自动带上最近 ${errors.length} 份 Playwright 失败报告。\n`,
      });
    }

    await streamPhaseToClient(res, {
      label: "PW 调试对话",
      provider,
      baseUrl,
      apiKey,
      model,
      sessionDir,
      cursorMode: provider === "cursor" ? "create" : undefined,
      cursorRepoUrl: String(config?.cursorRepoUrl || "").trim(),
      cursorRepoRef: String(config?.cursorRepoRef || "").trim(),
      cursorSessionDir: sessionDir,
      cursorTail:
        "【对本条回复的要求】先用中文分析原因；若需改用例，请输出完整 ```typescript 代码块（整份 playwright.spec.ts）。",
      messages,
      signal: ac.signal,
      onFullText: async (raw) => {
        const fullText = String(raw || "");
        let fixed = extractPlaywrightSpecTs(fullText);
        if (looksLikePlaywrightSpec(fixed)) {
          if (testBase) fixed = rewritePlaywrightBaseUrl(fixed, testBase);
          fixed = sanitizePlaywrightSpecTs(
            fixed,
            testBase || guessPlaywrightBaseUrl(fixed)
          );
          try {
            await writeFile(
              path.join(sessionDir, "playwright.spec.ts"),
              fixed,
              "utf8"
            );
          } catch {
            /* ignore */
          }
          sseSend(res, {
            type: "qa_playwright_spec",
            typescript: fixed,
            file: "playwright.spec.ts",
          });
          sseSend(res, {
            type: "exec",
            label: "已解析修复后的 playwright.spec.ts，可一键应用到预览",
          });
        }
      },
    });

    sseSend(res, { type: "done", phase: "pw_debug", sessionId });
    res.end();
  } catch (e) {
    sseSend(res, { type: "error", message: String(e?.message || e) });
    sseSend(res, { type: "done" });
    res.end();
  } finally {
    stopKeepalive();
  }
});

app.post("/api/pipeline/qa", async (req, res) => {
  sseInit(res);
  const stopKeepalive = startSseKeepalive(res);
  const ac = new AbortController();
  bindClientDisconnectAbort(req, res, ac, "POST /api/pipeline/qa");

  try {
    const {
      requirement,
      config,
      sessionId: sidIn,
      material,
      styleHint,
      images: imagesIn,
      standalone: standaloneIn,
      qaMode: qaModeIn,
      framework: frameworkIn,
      businessScenarios: bizIn,
      pageFunctionMd: pageFuncIn,
      specialMd: specialIn,
      reviewFeedback: reviewIn,
      priorDraft: priorDraftIn,
      priorReviewReport: priorReviewIn,
      generatePlaywrightSpec: genPwSpecIn,
      playwrightBaseUrl: pwBaseUrlIn,
    } = req.body || {};
    const standalone = !!standaloneIn;
    const qaModeRaw = String(qaModeIn || "").trim();
    const qaMode =
      standalone &&
      (qaModeRaw === "framework" ||
        qaModeRaw === "biz" ||
        qaModeRaw === "special" ||
        qaModeRaw === "review")
        ? qaModeRaw
        : "testpoints";
    const generatePlaywrightSpec =
      !!genPwSpecIn && qaMode === "testpoints";
    const frameworkText = String(frameworkIn || "").trim();
    const businessScenariosText = String(bizIn || "").trim();
    const pageFunctionText = String(pageFuncIn || "").trim();
    const specialText = String(specialIn || "").trim();
    const reviewFeedbackText = String(reviewIn || "").trim();
    const priorDraftText = String(priorDraftIn || "").trim();
    const priorReviewText = String(priorReviewIn || "").trim();
    const requirementText = String(requirement || "").trim();
    const materialText = String(material || "").trim();
    const styleText = String(styleHint || "").trim();
    const images = normalizeVisionImages(imagesIn);

    if (!requirementText && !materialText && images.length === 0) {
      sseSend(res, {
        type: "error",
        message: "请至少填写左侧「业务需求」「原型说明」之一，或上传参考图",
      });
      sseSend(res, { type: "done" });
      return res.end();
    }
    if (standalone && qaMode === "review") {
      if (!frameworkText && !businessScenariosText && !pageFunctionText && !specialText) {
        sseSend(res, {
          type: "error",
          message: "请先至少生成①框架 / ②场景 / ③功能 / ④专项之一，再点评审",
        });
        sseSend(res, { type: "done" });
        return res.end();
      }
    }

    const provider = String(config?.provider || "openai").toLowerCase();
    const sessionId = String(sidIn || "").trim() ||
      `s_${Date.now()}_${randomBytes(3).toString("hex")}`;
    const sessionDir = path.join(GEN, sessionId);
    await mkdir(sessionDir, { recursive: true });
    // 尽早下发 sessionId，供扫描动画 ack / 后续步骤复用同一 Cursor Agent
    sseSend(res, { type: "meta", sessionId, phase: "qa", qaMode });

    let contextHtml = "";
    try {
      contextHtml = await readSessionPrototypeContext(sessionDir);
    } catch {
      /* ignore */
    }

    let pageContext = "";
    let pageScan = null;
    if (
      standalone &&
      (qaMode === "framework" ||
        qaMode === "biz" ||
        qaMode === "special" ||
        qaMode === "testpoints" ||
        qaMode === "review" ||
        /https?:\/\//i.test(materialText) ||
        /file:\/\//i.test(materialText) ||
        /[A-Za-z]:[\\/].+\.html?/i.test(materialText))
    ) {
      const isLocalOnly =
        !/https?:\/\//i.test(materialText) &&
        (/file:\/\//i.test(materialText) ||
          /[A-Za-z]:[\\/].+\.html?/i.test(materialText));
      sseSend(res, {
        type: "thought",
        text: isLocalOnly
          ? "正在读取本地原型 HTML…\n"
          : /【双原型】|(?:前台|C\s*端)[\s\S]{0,40}https?:\/\/[\s\S]{0,200}(?:后台|管理端)[\s\S]{0,40}https?:\/\//i.test(
                materialText
              )
            ? "正在分别抓取前台与后台双原型（SPA 会浏览器渲染）…\n"
            : "正在用浏览器渲染抓取原型（SPA/登录页会自动处理）…\n",
      });
      const fetched = await fetchPrototypePageContext(materialText);
      pageContext = fetched?.context || "";
      pageScan = fetched?.scan || null;
      if (pageContext) {
        const hasRender = /浏览器渲染/.test(pageContext);
        const hasBizNav = /商务管理|预警中心|数据分析/.test(pageContext);
        const hasShellOnly =
          !hasBizNav &&
          (/仅可见系统名称|未识别到侧栏|id=["']root["']|仅静态壳|空壳|渲染抓取未完成/.test(
            pageContext
          ) ||
            (/产品系统/.test(pageContext) && pageContext.length < 800));
        sseSend(res, {
          type: "thought",
          text: hasRender
            ? hasBizNav
              ? `原型抓取完成（浏览器渲染 + 自动登录），已识别侧栏模块（含商务管理等）。\n`
              : `原型已浏览器渲染，但侧栏模块偏少，请核对登录是否成功。\n`
            : hasShellOnly
              ? `警告：未进入原型内部（仍像「产品系统」壳页）。请确认 Playwright 已安装后，再点一次「① 生成页面框架」。\n`
              : `原型静态抓取完成（${pageContext.length} 字）。\n`,
        });
      } else if (
        standalone &&
        (qaMode === "framework" || /https?:\/\//i.test(materialText))
      ) {
        sseSend(res, {
          type: "thought",
          text: "未能从网址抓取到正文，将仅按链接文字生成（结果可能很空）。\n",
        });
      }
    }

    // 框架 B1：先推扫描故事并等待前端播完，再调模型
    // 注意：截图勿用 base64 塞进 SSE（常数百 KB～数 MB），代理/JSON.parse 会静默失败，前端永远不播动画
    if (standalone && qaMode === "framework") {
      const regions = Array.isArray(pageScan?.regions) ? pageScan.regions : [];
      let screenshotUrl = "";
      const rawShot = String(pageScan?.screenshot || "");
      if (rawShot.startsWith("data:image")) {
        try {
          const m = /^data:image\/\w+;base64,(.+)$/i.exec(rawShot);
          if (m) {
            const rel = "scan-preview.jpg";
            await writeFile(
              path.join(sessionDir, rel),
              Buffer.from(m[1], "base64")
            );
            screenshotUrl = `/generated/${encodeURIComponent(sessionId)}/${rel}?bust=${Date.now()}`;
          }
        } catch (e) {
          dbg("persist scan screenshot failed", String(e?.message || e));
        }
      }
      if (screenshotUrl && regions.length) {
        const storyPayload = {
          type: "qa_scan_story",
          sessionId,
          screenshotUrl,
          regions,
          viewport: pageScan.viewport || { w: 1440, h: 900 },
        };
        dbg(
          "qa_scan_story",
          `regions=${regions.length}`,
          `sseBytes≈${JSON.stringify(storyPayload).length}`
        );
        sseSend(res, storyPayload);
        const waitMs = Math.min(
          45000,
          Math.max(12000, regions.length * 900 + 5000)
        );
        sseSend(res, {
          type: "thought",
          text: `正在播放结构扫描动画（${regions.length} 个模块）…\n`,
        });
        const ack = await waitForScanAck(sessionId, waitMs);
        sseSend(res, {
          type: "thought",
          text: ack.ok
            ? "扫描完成，开始生成页面框架…\n"
            : "扫描等待超时，继续生成页面框架…\n",
        });
      } else {
        dbg(
          "qa_scan_fallback",
          `hasShot=${!!screenshotUrl}`,
          `regions=${regions.length}`,
          `rawShotLen=${rawShot.length}`
        );
        sseSend(res, {
          type: "qa_scan_fallback",
          sessionId,
          steps: [
            "打开原型页面",
            "处理登录（如有）",
            "识别侧栏模块",
            "生成页面框架",
          ],
        });
        await waitForScanAck(sessionId, 9000);
        sseSend(res, {
          type: "thought",
          text: screenshotUrl
            ? "已抓到截图但未识别到侧栏模块，已用步骤条过渡…\n"
            : "无截图扫描数据，已用步骤条过渡，开始生成框架…\n",
        });
      }
    }

    const apiKey =
      provider === "cursor"
        ? String(config?.cursorApiKey || "").trim()
        : String(config?.apiKey || "").trim();
    const { baseUrl, model } = config || {};
    const cursorRepoUrl = String(config?.cursorRepoUrl || "").trim();
    const cursorRepoRef = String(config?.cursorRepoRef ?? "").trim();

    const qaMsgOpts = {
      requirement: requirementText,
      contextHtml,
      material: materialText,
      styleHint: styleText,
      standalone,
      qaMode,
      framework: frameworkText,
      pageContext,
      businessScenarios: businessScenariosText,
      pageFunctionMd: pageFunctionText,
      specialMd: specialText,
      reviewFeedback: reviewFeedbackText,
      priorDraft: priorDraftText,
      priorReviewReport: priorReviewText,
    };

    const qaMessages =
      provider === "openai" && images.length > 0
        ? await buildQaVisionUserContent({ ...qaMsgOpts, images })
        : await buildQaMessages(qaMsgOpts);

    const qaCursorMessages =
      provider === "cursor" && images.length > 0
        ? await buildQaVisionUserContent({
            ...qaMsgOpts,
            material:
              `${materialText || "（未填写）"}\n\n【说明】你已上传参考图若干张（${images.length}），Cloud Agent 此轮仅从文字理解，请据此补充测试关注点。`,
            images: [],
          })
        : null;

    sseSend(res, { type: "meta", sessionId, phase: "qa", qaMode });
    sseSend(res, {
      type: "thought",
      text:
        standalone && qaMode === "framework"
          ? reviewFeedbackText
            ? "【页面框架】按上一轮评审落实「①」后重写…\n"
            : "【页面框架】梳理项目页面与业务简介…\n"
          : standalone && qaMode === "biz"
            ? reviewFeedbackText
              ? "【业务场景】按上一轮评审落实「②」后重写…\n"
              : "【业务场景】输出冒烟门禁 + 条件结果双段…\n"
            : standalone && qaMode === "special"
              ? reviewFeedbackText
                ? "【专项测试】按上一轮评审落实「④」后重写…\n"
                : "【专项测试】输出权限/并发/弱网/兼容/安全…\n"
              : standalone && qaMode === "review"
                ? "【评审】对照原型一并检查①框架 / ②场景 / ③功能 / ④专项…\n"
                : standalone
                  ? reviewFeedbackText
                    ? "【页面功能测试点】按框架展开，并落实上一轮评审「③」…\n"
                    : "【页面功能测试点】按框架展开交互细节…\n"
                  : "【测试】梳理需求与原型，生成测试点 Markdown…\n",
    });

    let qaCursorMode;
    if (provider === "cursor") {
      // 独立测试点：①②③评审应复用同一 Cloud Agent（followup），避免一键流水线连开多个撞并发上限
      const existingAgent = await readCursorCloudAgentId(sessionDir);
      qaCursorMode = existingAgent ? "followup" : "create";
      if (existingAgent) {
        sseSend(res, {
          type: "thought",
          text: `【Cursor】复用本会话 Agent（${String(existingAgent).slice(0, 12)}…），发起后续 Run，不再新建 Cloud Agent。\n`,
        });
      }
    }

    let writtenTestPointMd = "";

    await streamPhaseToClient(res, {
      label: "测试 · 测试点",
      provider,
      baseUrl,
      apiKey,
      model,
      sessionDir,
      cursorMode: qaCursorMode,
      cursorRepoUrl,
      cursorRepoRef,
      cursorSessionDir: sessionDir,
      cursorTail: markdownCursorTail("qa", standalone, qaMode),
      messages: qaCursorMessages || qaMessages,
      signal: ac.signal,
      // ①框架压低温度减漂移；②场景略低；③功能保持默认
      temperature:
        standalone && qaMode === "framework"
          ? 0.2
          : standalone && qaMode === "biz"
            ? 0.25
            : standalone && qaMode === "special"
              ? 0.3
              : standalone && qaMode === "review"
                ? 0.3
                : 0.4,
      onFullText: async (raw) => {
        let md = String(raw || "").trim();
        if (standalone && (qaMode === "framework" || qaMode === "biz" || qaMode === "special" || qaMode === "review")) {
          // 仅当全文以 markdown fence 开头时才解包，避免误吃正文里的 ``` 示例导致整篇变空/只剩代码块
          if (/^```(?:md|markdown)?\b/i.test(md)) {
            md = extractMarkdown(md);
          }
          // 去掉文内多余代码块；若误伤导致全文被掏空，回退到提取结果（避免评审/框架「未产出」）
          const extracted = String(md || "").trim();
          const stripped = extracted
            .replace(/```[\s\S]*?```/g, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
          md = stripped || extracted;
          const fp =
            qaMode === "framework"
              ? "页面框架.md"
              : qaMode === "biz"
                ? "业务场景测试点.md"
                : qaMode === "special"
                  ? "专项测试点.md"
                  : "测试点评审报告.md";
          await writeFile(path.join(sessionDir, fp), md, "utf8");
          sseSend(res, {
            type: "exec",
            label: `写入 ${fp}（${md.length} 字符）`,
          });
          sseSend(res, {
            type: "artifact",
            name: fp,
            mime: "text/markdown",
            preview: md.slice(0, 400),
          });
          sseSend(res, {
            type:
              qaMode === "framework"
                ? "qa_framework"
                : qaMode === "biz"
                  ? "qa_biz"
                  : qaMode === "special"
                    ? "qa_special"
                    : "qa_review",
            markdown: md,
            ...(qaMode === "review"
              ? { needsRework: reviewNeedsRework(md) }
              : {}),
          });
          return;
        }
        md = standalone ? repairStandaloneTestPointMd(md) : repairTestPointMdIfNeeded(md);
        writtenTestPointMd = md;
        const fp = "测试点.md";
        await writeFile(path.join(sessionDir, fp), md, "utf8");
        const points = parseTestPointsFromMd(md);
        sseSend(res, {
          type: "exec",
          label: `写入 ${fp}（${md.length} 字符）`,
        });
        sseSend(res, {
          type: "artifact",
          name: fp,
          mime: "text/markdown",
          preview: md.slice(0, 400),
        });
        sseSend(res, {
          type: "qa_points",
          points,
          count: points.length,
        });
      },
    });

    if (generatePlaywrightSpec) {
      const pageFuncMd =
        writtenTestPointMd ||
        (await readSessionTestMd(sessionDir).catch(() => ""));
      const pwBaseUrl =
        normalizePlaywrightBaseUrl(pwBaseUrlIn) ||
        guessPlaywrightBaseUrl(materialText);
      sseSend(res, {
        type: "thought",
        text: `【Playwright Test】正在额外生成 .spec.ts（baseURL=${pwBaseUrl}）…\n`,
      });
      const pwMessages = buildStandalonePlaywrightSpecMessages({
        material: materialText,
        framework: frameworkText,
        businessScenarios: businessScenariosText,
        pageFunctionMd: pageFuncMd,
        pageContext,
        baseUrl: pwBaseUrl,
        skillHint: await loadPlaywrightDebugSkill(),
      });
      let pwCursorMode;
      if (provider === "cursor") {
        const existingAgent = await readCursorCloudAgentId(sessionDir);
        pwCursorMode = existingAgent ? "followup" : "create";
      }
      await streamPhaseToClient(res, {
        label: "测试 · Playwright Spec",
        provider,
        baseUrl,
        apiKey,
        model,
        sessionDir,
        cursorMode: pwCursorMode,
        cursorRepoUrl,
        cursorRepoRef,
        cursorSessionDir: sessionDir,
        cursorTail: markdownCursorTail("qa", true, "playwright-spec"),
        messages: pwMessages,
        signal: ac.signal,
        onFullText: async (raw) => {
          let spec = sanitizePlaywrightSpecTs(
            extractPlaywrightSpecTs(raw),
            pwBaseUrl
          );
          if (normalizePlaywrightBaseUrl(pwBaseUrlIn)) {
            spec = rewritePlaywrightBaseUrl(spec, pwBaseUrl);
          }
          if (!looksLikePlaywrightSpec(spec)) {
            sseSend(res, {
              type: "thought",
              text: "警告：本轮 .spec.ts 结构不完整，仍已写入供你手工修订。\n",
            });
          }
          const fp = "playwright.spec.ts";
          await writeFile(path.join(sessionDir, fp), spec, "utf8");
          sseSend(res, {
            type: "exec",
            label: `写入 ${fp}（${spec.length} 字符）`,
          });
          sseSend(res, {
            type: "artifact",
            name: fp,
            mime: "text/typescript",
            preview: spec.slice(0, 400),
          });
          sseSend(res, {
            type: "qa_playwright_spec",
            typescript: spec,
            file: fp,
            baseUrl: pwBaseUrl,
          });
        },
      });
    }

    const doneFile =
      qaMode === "framework"
        ? "页面框架.md"
        : qaMode === "biz"
          ? "业务场景测试点.md"
          : qaMode === "special"
            ? "专项测试点.md"
            : qaMode === "review"
              ? "测试点评审报告.md"
              : "测试点.md";
    sseSend(res, {
      type: "done",
      sessionId,
      phase: "qa",
      qaMode,
      playwrightSpec: generatePlaywrightSpec ? "playwright.spec.ts" : undefined,
      mdPath: path.relative(ROOT, path.join(sessionDir, doneFile)),
    });
    res.end();
  } catch (e) {
    sseSend(res, { type: "error", message: String(e.message || e) });
    sseSend(res, { type: "done" });
    res.end();
  } finally {
    stopKeepalive();
  }
});

app.post("/api/pipeline/ops", async (req, res) => {
  sseInit(res);
  const stopKeepalive = startSseKeepalive(res);
  const ac = new AbortController();
  bindClientDisconnectAbort(req, res, ac, "POST /api/pipeline/ops");

  try {
    const {
      requirement,
      config,
      sessionId: sidIn,
      material,
      styleHint,
      images: imagesIn,
    } = req.body || {};
    const requirementText = String(requirement || "").trim();
    const materialText = String(material || "").trim();
    const styleText = String(styleHint || "").trim();
    const images = normalizeVisionImages(imagesIn);

    if (!requirementText && !materialText && images.length === 0) {
      sseSend(res, {
        type: "error",
        message: "请至少填写「业务需求」「运维说明」之一，或上传架构/部署示意",
      });
      sseSend(res, { type: "done" });
      return res.end();
    }

    const provider = String(config?.provider || "openai").toLowerCase();
    const sessionId =
      String(sidIn || "").trim() ||
      `s_${Date.now()}_${randomBytes(3).toString("hex")}`;
    const sessionDir = path.join(GEN, sessionId);
    await mkdir(sessionDir, { recursive: true });

    let contextHtml = "";
    try {
      contextHtml = await readSessionPrototypeContext(sessionDir);
    } catch {
      /* ignore */
    }

    const apiKey =
      provider === "cursor"
        ? String(config?.cursorApiKey || "").trim()
        : String(config?.apiKey || "").trim();
    const { baseUrl, model } = config || {};
    const cursorRepoUrl = String(config?.cursorRepoUrl || "").trim();
    const cursorRepoRef = String(config?.cursorRepoRef ?? "").trim();

    const opsMessages =
      provider === "openai" && images.length > 0
        ? await buildOpsVisionUserContent({
            requirement: requirementText,
            contextHtml,
            material: materialText,
            styleHint: styleText,
            images,
          })
        : await buildOpsMessages({
            requirement: requirementText,
            contextHtml,
            material: materialText,
            styleHint: styleText,
          });

    const opsCursorMessages =
      provider === "cursor" && images.length > 0
        ? await buildOpsVisionUserContent({
            requirement: requirementText,
            contextHtml,
            material:
              `${materialText || "（未填写）"}\n\n【说明】你已上传参考图 ${images.length} 张，Cloud Agent 此轮仅从文字理解，请结合说明推断部署与架构要点。`,
            styleHint: styleText,
            images: [],
          })
        : null;

    sseSend(res, { type: "meta", sessionId, phase: "ops" });
    sseSend(res, {
      type: "thought",
      text: "【运维】整理部署与运行要点，生成运维 Markdown…\n",
    });

    await streamPhaseToClient(res, {
      label: "运维 · 交接文档",
      provider,
      baseUrl,
      apiKey,
      model,
      sessionDir,
      cursorMode: provider === "cursor" ? "followup" : undefined,
      cursorRepoUrl,
      cursorRepoRef,
      cursorSessionDir: sessionDir,
      cursorTail: markdownCursorTail("ops"),
      messages: opsCursorMessages || opsMessages,
      signal: ac.signal,
      onFullText: async (raw) => {
        const md = extractMarkdown(raw);
        const fp = "运维手册.md";
        await writeFile(path.join(sessionDir, fp), md, "utf8");
        sseSend(res, {
          type: "exec",
          label: `写入 ${fp}（${md.length} 字符）`,
        });
        sseSend(res, {
          type: "artifact",
          name: fp,
          mime: "text/markdown",
          preview: md.slice(0, 400),
        });
      },
    });

    sseSend(res, {
      type: "done",
      sessionId,
      phase: "ops",
      mdPath: path.relative(ROOT, path.join(sessionDir, "运维手册.md")),
    });
    res.end();
  } catch (e) {
    sseSend(res, { type: "error", message: String(e.message || e) });
    sseSend(res, { type: "done" });
    res.end();
  } finally {
    stopKeepalive();
  }
});

/* ============================================================
 * 角色追问对话：POST /api/role/chat（SSE，OpenAI 兼容 / Cursor follow-up）
 * 历史：generated/<sessionId>/conversations/<role>.jsonl，每行 {role,user|assistant,content,ts}
 * 上下文：自动注入 SKILL.md + 业务需求 + 会话目录下原型 / UI / app 节选
 * 落盘：助手回复中的 ### FILE: 段落 → safeJoinUnderSession 写入 sessionDir
 * ============================================================ */

const CHAT_ROLE_LABELS = {
  pm: "产品经理",
  ui: "UI 设计",
  fs: "全栈落地",
  fullstack: "全栈落地",
  qa: "测试岗",
  ops: "运维岗",
};

const CHAT_FALLBACK_SYS = {
  pm: PM_FALLBACK_SYS,
  ui: UI_FALLBACK_SYS,
  fs: FS_FALLBACK_SYS,
  fullstack: FS_FALLBACK_SYS,
  qa: QA_FALLBACK_SYS,
  ops: OPS_FALLBACK_SYS,
};

const MAX_CHAT_HISTORY_TURNS = 16;
const MAX_CHAT_MESSAGE_CHARS = 6000;

function normalizeChatRole(role) {
  const r = String(role || "").toLowerCase();
  if (r === "fullstack") return "fs";
  if (["pm", "ui", "fs", "qa", "ops"].includes(r)) return r;
  return null;
}

async function readChatHistory(sessionDir, role) {
  const fp = path.join(sessionDir, "conversations", `${role}.jsonl`);
  try {
    const t = await readFile(fp, "utf8");
    const out = [];
    for (const line of t.split(/\r?\n/)) {
      const s = line.trim();
      if (!s) continue;
      try {
        const j = JSON.parse(s);
        if (j && (j.role === "user" || j.role === "assistant") && typeof j.content === "string") {
          out.push({ role: j.role, content: j.content });
        }
      } catch {
        /* ignore */
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function appendChatHistory(sessionDir, role, userText, assistantText) {
  const dir = path.join(sessionDir, "conversations");
  await mkdir(dir, { recursive: true });
  const fp = path.join(dir, `${role}.jsonl`);
  const lines = [
    JSON.stringify({ role: "user", content: userText, ts: new Date().toISOString() }),
    JSON.stringify({ role: "assistant", content: assistantText, ts: new Date().toISOString() }),
  ];
  const prev = (await readFile(fp, "utf8").catch(() => "")).replace(/\s+$/, "");
  const next = (prev ? prev + "\n" : "") + lines.join("\n") + "\n";
  await writeFile(fp, next, "utf8");
}

app.get("/api/role/chat/history", async (req, res) => {
  const role = normalizeChatRole(req.query?.role);
  const sessionId = String(req.query?.sessionId || "").trim();
  if (!role || !sessionId) {
    return res.status(400).json({ ok: false, error: "缺少 role 或 sessionId" });
  }
  const sessionDir = path.join(GEN, sessionId);
  const history = await readChatHistory(sessionDir, role);
  res.json({ ok: true, role, sessionId, history });
});

app.post("/api/role/chat", async (req, res) => {
  sseInit(res);
  const stopKeepalive = startSseKeepalive(res);
  const ac = new AbortController();
  bindClientDisconnectAbort(req, res, ac, "POST /api/role/chat");

  try {
    const {
      role: roleRaw,
      sessionId: sidIn,
      message,
      requirement,
      config,
      images: imagesIn,
    } = req.body || {};
    const chatImages = normalizeVisionImages(imagesIn);
    const role = normalizeChatRole(roleRaw);
    if (!role) {
      sseSend(res, { type: "error", message: `role 非法：${roleRaw}` });
      sseSend(res, { type: "done" });
      return res.end();
    }
    const sessionId = String(sidIn || "").trim();
    if (!sessionId) {
      sseSend(res, { type: "error", message: "sessionId 不能为空（请先完成主输出）" });
      sseSend(res, { type: "done" });
      return res.end();
    }
    const userText = String(message || "").trim().slice(0, MAX_CHAT_MESSAGE_CHARS);
    if (!userText) {
      sseSend(res, { type: "error", message: "消息为空" });
      sseSend(res, { type: "done" });
      return res.end();
    }

    const sessionDir = path.join(GEN, sessionId);
    await mkdir(sessionDir, { recursive: true });

    const provider = String(config?.provider || "openai").toLowerCase();
    const apiKey =
      provider === "cursor"
        ? String(config?.cursorApiKey || "").trim()
        : String(config?.apiKey || "").trim();
    const { baseUrl, model } = config || {};
    const cursorRepoUrl = String(config?.cursorRepoUrl || "").trim();
    const cursorRepoRef = String(config?.cursorRepoRef ?? "").trim();

    const sys = await loadRoleSkill(role, CHAT_FALLBACK_SYS[role] || "");
    const history = await readChatHistory(sessionDir, role);
    const recent = history.slice(-MAX_CHAT_HISTORY_TURNS * 2);

    let contextHtml = "";
    try {
      contextHtml = await readSessionPrototypeContext(sessionDir);
    } catch {
      /* ignore */
    }
    const ctxBlock = contextHtml
      ? `【会话目录现有页面节选（截取）】\n${contextHtml.slice(0, 12_000)}\n`
      : "";
    const reqBlock = String(requirement || "").trim()
      ? `【业务需求摘要】\n${String(requirement).trim()}\n`
      : "";
    const imgNote =
      chatImages.length > 0
        ? `\n【用户附 ${chatImages.length} 张截图，请结合界面细节回答】\n`
        : "";
    const userPayload =
      `${reqBlock}${ctxBlock}【追问】\n${userText}${imgNote}\n\n` +
      `（你正处于 agile-sim 「${CHAT_ROLE_LABELS[role]}」追问对话。` +
      `全栈修改产物时：必须用 ### FILE: app/index.html、app/styles.css、app/app.js 等（带 app/ 前缀），` +
      `每段必须是可直接保存的完整源码，禁止「见仓库」「git clone」等占位；` +
      `平台预览只加载 generated/…/app/index.html，写到会话根目录的文件会自动同步进 app/。）`;

    let userContent = userPayload;
    if (provider === "openai" && chatImages.length > 0) {
      const parts = [{ type: "text", text: userPayload }];
      for (const im of chatImages) {
        const url = im.dataUrl || `data:${im.mime};base64,${im.base64}`;
        parts.push({ type: "image_url", image_url: { url } });
      }
      userContent = parts;
    }

    const messages = [{ role: "system", content: sys }, ...recent, { role: "user", content: userContent }];

    sseSend(res, { type: "meta", sessionId, phase: `${role}_chat`, role });
    sseSend(res, {
      type: "thought",
      text: `【${CHAT_ROLE_LABELS[role]} 追问】已加载历史 ${recent.length / 2} 轮…\n`,
    });

    let fullText = "";
    await streamPhaseToClient(res, {
      label: `${CHAT_ROLE_LABELS[role]} · 追问`,
      provider,
      baseUrl,
      apiKey,
      model,
      sessionDir,
      cursorMode: provider === "cursor" ? "followup" : undefined,
      cursorRepoUrl,
      cursorRepoRef,
      cursorSessionDir: sessionDir,
      cursorTail:
        role === "fs" || role === "fullstack"
          ? `【对本条回复的要求】保持全栈身份。改代码必须用 ### FILE: app/index.html 等（带 app/），写出完整文件正文，禁止省略或让用户自己去 Git 拉取。`
          : `【对本条回复的要求】保持「${CHAT_ROLE_LABELS[role]}」身份。若需要改产物，请用 ### FILE: 相对路径 段落覆盖式输出整份新文件；否则直接口语化作答（< 200 字）。`,
      messages,
      signal: ac.signal,
      onFullText: async (raw) => {
        fullText = String(raw || "").trim();
        const files = parseDelimitedFiles(fullText);
        let wroteApp = false;
        const isFsRole = role === "fs" || role === "fullstack";
        for (const f of files) {
          const normPath = isFsRole ? normalizeFsChatPath(f.path) : f.path.replace(/^[/\\]+/, "");
          if (!normPath) {
            sseSend(res, { type: "thought", text: `【跳过非法路径】${f.path}\n` });
            continue;
          }
          if (isFsRole && !isValidArtifactContent(normPath, f.content)) {
            sseSend(res, {
              type: "thought",
              text: `【跳过无效内容】${normPath}（模型未给出完整源码，请追问「请输出完整的 app/ 下文件正文」）\n`,
            });
            continue;
          }
          const abs = safeJoinUnderSession(sessionDir, normPath);
          if (!abs) {
            sseSend(res, { type: "thought", text: `【跳过非法路径】${normPath}\n` });
            continue;
          }
          await mkdir(path.dirname(abs), { recursive: true });
          await writeFile(abs, f.content, "utf8");
          const rel = path.relative(sessionDir, abs).replace(/\\/g, "/");
          if (rel.startsWith("app/")) wroteApp = true;
          sseSend(res, { type: "exec", label: `写入 ${rel}（${f.content.length} 字符）` });
          sseSend(res, {
            type: "artifact",
            name: rel,
            mime: rel.endsWith(".html") ? "text/html" : "text/markdown",
            preview: f.content.slice(0, 400),
          });
        }
        if (isFsRole) {
          const synced = await syncRootAppFilesIntoAppDir(sessionDir);
          if (synced.length) {
            wroteApp = true;
            sseSend(res, {
              type: "thought",
              text: `【已同步到 app/】${synced.join("、")}（原写在会话根目录）\n`,
            });
          }
        }
        if (isFsRole && wroteApp) {
          const appDir = path.join(sessionDir, "app");
          try {
            const smoke = await smokeCheckAppDir(appDir);
            if (smoke.ok) {
              sseSend(res, {
                type: "thought",
                text: "\n[自检] app/ 静态检查通过（按钮绑定与脚本语法未见明显问题）。\n",
              });
            } else {
              sseSend(res, {
                type: "thought",
                text: `\n[自检] app/ 发现问题：\n- ${smoke.issues.join("\n- ")}\n请在本轮或下一轮追问中修复。\n`,
              });
            }
          } catch (e) {
            sseSend(res, {
              type: "thought",
              text: `[自检] 跳过：${String(e?.message || e)}\n`,
            });
          }
        }
      },
    });

    if (fullText) {
      try {
        await appendChatHistory(sessionDir, role, userText, fullText);
      } catch (e) {
        sseSend(res, { type: "thought", text: `[历史写入失败] ${String(e?.message || e)}\n` });
      }
    }

    sseSend(res, { type: "done", sessionId, phase: `${role}_chat`, role });
    res.end();
  } catch (e) {
    sseSend(res, { type: "error", message: String(e.message || e) });
    sseSend(res, { type: "done" });
    res.end();
  } finally {
    stopKeepalive();
  }
});

/* ========== 测试岗 · 敏捷流水线工作台 ========== */

app.get("/api/qa/pipeline/points", async (req, res) => {
  const sessionId = String(req.query?.sessionId || "").trim();
  if (!sessionId) return res.status(400).json({ ok: false, error: "缺少 sessionId" });
  const sessionDir = path.join(GEN, sessionId);
  const md = await readSessionTestMd(sessionDir);
  const fromMd = parseTestPointsFromMd(md);
  const fromFile = await readSessionPlaywrightSmoke(sessionDir);
  const seen = new Set(fromMd.map((p) => p.title));
  const points = [...fromMd];
  for (const s of fromFile) {
    if (!seen.has(s.title)) points.unshift(s);
  }
  const smokeCount = points.filter((p) => p.kind === "smoke" && p.steps?.length).length;
  res.json({ ok: true, sessionId, md, points, smokeCount });
});

app.post("/api/qa/pipeline/generate", async (req, res) => {
  res.status(400).json({
    ok: false,
    error:
      "请改用流式接口 POST /api/pipeline/qa（前端「生成测试点」已自动使用）；本接口仅保留兼容提示。",
  });
});

async function runSinglePipelinePoint({
  sessionId,
  sessionDir,
  point,
  requirement,
  config,
  page,
  pageUrl,
  usePlaywright,
  includeStaticSmoke,
}) {
  const issues = [];
  const warnings = [];
  const appDir = path.join(sessionDir, "app");

  if (includeStaticSmoke) {
    const smoke = await smokeCheckAppDir(appDir);
    if (!smoke.ok) {
      for (const msg of smoke.issues) {
        issues.push({ pointId: point.id, title: point.title, reason: `[静态自检] ${msg}` });
      }
    }
  }

  if (usePlaywright && page && pageUrl) {
    const pw = await runPlaywrightForTestPoint({ page, pageUrl, point });
    for (const msg of pw.issues || []) {
      issues.push({ pointId: point.id, title: point.title, reason: `[Playwright] ${msg}` });
    }
  }

  const provider = String(config?.provider || "openai").toLowerCase();
  const apiKey =
    provider === "cursor"
      ? String(config?.cursorApiKey || "").trim()
      : String(config?.apiKey || "").trim();
  if (apiKey && point && provider !== "cursor") {
    const appExcerpt = await readSessionAppExcerpt(sessionDir);
    const checkMsgs = buildPointCheckMessages({ requirement, point, appExcerpt });
    try {
      const raw = await nonStreamCompletion({
        baseUrl: config?.baseUrl,
        apiKey,
        model: config?.model,
        messages: checkMsgs,
      });
      const verdict = parsePointCheckJson(raw);
      if (verdict.status === "fail") {
        issues.push({
          pointId: point.id,
          title: point.title,
          reason: verdict.reason || "模型判定未通过",
        });
      }
    } catch (e) {
      issues.push({
        pointId: point.id,
        title: point.title,
        reason: `LLM 校验失败：${String(e?.message || e).slice(0, 200)}`,
      });
    }
  }

  return { issues, warnings };
}

app.post("/api/qa/pipeline/run", async (req, res) => {
  try {
    const {
      sessionId: sidIn,
      points: pointsIn,
      requirement,
      config,
      activeIndex = 0,
      usePlaywright = true,
    } = req.body || {};
    const sessionId = String(sidIn || "").trim();
    if (!sessionId) return res.status(400).json({ ok: false, error: "缺少 sessionId" });

    const sessionDir = path.join(GEN, sessionId);
    const appDir = path.join(sessionDir, "app");
    if (!existsSync(path.join(appDir, "index.html"))) {
      return res.status(400).json({ ok: false, error: "请先完成全栈落地（app/index.html 不存在）" });
    }

    const points = Array.isArray(pointsIn) && pointsIn.length
      ? pointsIn
      : parseTestPointsFromMd(await readSessionTestMd(sessionDir));
    if (!points.length) {
      return res.status(400).json({ ok: false, error: "无测试点，请先生成测试点列表" });
    }

    const idx = Math.max(0, Math.min(points.length - 1, Number(activeIndex) || 0));
    const point = points[idx];
    const port = Number(process.env.AGILE_SIM_PORT) || 5180;
    const pageUrl = `http://127.0.0.1:${port}/generated/${encodeURIComponent(sessionId)}/app/index.html`;

    let browser;
    let page;
    const warnings = [];
    if (usePlaywright) {
      const launched = await launchPlaywrightBrowser();
      if (launched.error) warnings.push(launched.error);
      else {
        browser = launched.browser;
        page = await browser.newPage();
      }
    }

    const { issues } = await runSinglePipelinePoint({
      sessionId,
      sessionDir,
      point,
      requirement,
      config,
      page,
      pageUrl,
      usePlaywright: !!page,
      includeStaticSmoke: true,
    });

    await browser?.close?.().catch(() => {});

    res.json({
      ok: true,
      sessionId,
      activeIndex: idx,
      pointTitle: point?.title,
      issues,
      warnings,
      passed: issues.length === 0,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/** 按列表顺序依次测试全部测试点（SSE 推送进度） */
app.post("/api/qa/pipeline/run-batch", async (req, res) => {
  sseInit(res);
  const stopKeepalive = startSseKeepalive(res);
  try {
    const {
      sessionId: sidIn,
      points: pointsIn,
      requirement,
      config,
      usePlaywright = true,
      smokeOnly = false,
    } = req.body || {};
    const sessionId = String(sidIn || "").trim();
    if (!sessionId) {
      sseSend(res, { type: "error", message: "缺少 sessionId" });
      return res.end();
    }

    const sessionDir = path.join(GEN, sessionId);
    const appDir = path.join(sessionDir, "app");
    if (!existsSync(path.join(appDir, "index.html"))) {
      sseSend(res, { type: "error", message: "请先完成全栈落地（app/index.html 不存在）" });
      return res.end();
    }

    let points = Array.isArray(pointsIn) && pointsIn.length
      ? pointsIn
      : parseTestPointsFromMd(await readSessionTestMd(sessionDir));
    if (smokeOnly) {
      points = points.filter((p) => p.kind === "smoke" && p.steps?.length);
      const extra = await readSessionPlaywrightSmoke(sessionDir);
      const seen = new Set(points.map((p) => p.title));
      for (const s of extra) {
        if (!seen.has(s.title)) points.push(s);
      }
    }
    if (!points.length) {
      sseSend(res, {
        type: "error",
        message: smokeOnly
          ? "无冒烟自动化用例：请重新「生成测试点」并确保含 ## 冒烟自动化（Playwright）与 ```json 步骤"
          : "无测试点，请先生成测试点列表",
      });
      return res.end();
    }

    const port = Number(process.env.AGILE_SIM_PORT) || 5180;
    const pageUrl = `http://127.0.0.1:${port}/generated/${encodeURIComponent(sessionId)}/app/index.html`;
    const allIssues = [];
    const warnings = [];

    const smoke = await smokeCheckAppDir(appDir);
    if (!smoke.ok) {
      for (const msg of smoke.issues) {
        warnings.push(`[静态自检] ${msg}`);
      }
    }

    let browser;
    let page;
    if (usePlaywright) {
      const launched = await launchPlaywrightBrowser();
      if (launched.error) warnings.push(launched.error);
      else {
        browser = launched.browser;
        page = await browser.newPage();
      }
    }

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      sseSend(res, {
        type: "progress",
        index: i,
        total: points.length,
        title: point.title,
        kind: point.kind || "functional",
      });

      const { issues: pointIssues } = await runSinglePipelinePoint({
        sessionId,
        sessionDir,
        point,
        requirement,
        config,
        page,
        pageUrl,
        usePlaywright: !!page,
        includeStaticSmoke: false,
      });

      allIssues.push(...pointIssues);
      sseSend(res, {
        type: "point_done",
        index: i,
        title: point.title,
        passed: pointIssues.length === 0,
        issues: pointIssues,
      });
    }

    await browser?.close?.().catch(() => {});

    sseSend(res, {
      type: "done",
      sessionId,
      total: points.length,
      issues: allIssues,
      warnings,
      passed: allIssues.length === 0,
      failCount: allIssues.length,
    });
    res.end();
  } catch (e) {
    sseSend(res, { type: "error", message: String(e?.message || e) });
    res.end();
  } finally {
    stopKeepalive();
  }
});

app.post("/api/qa/pipeline/notify-fs", async (req, res) => {
  const { sessionId, issues, requirement } = req.body || {};
  const sid = String(sessionId || "").trim();
  if (!sid) return res.status(400).json({ ok: false, error: "缺少 sessionId" });
  const list = Array.isArray(issues) ? issues : [];
  if (!list.length) return res.status(400).json({ ok: false, error: "没有问题可通知" });

  const lines = list.map(
    (it, i) =>
      `${i + 1}. [${it.title || "测试项"}] ${String(it.reason || "").trim()}`
  );
  const message =
    `【测试岗反馈 · 请修复 app/】\n` +
    `会话：${sid}\n` +
    (requirement ? `需求摘要：${String(requirement).trim().slice(0, 500)}\n` : "") +
    `\n问题列表：\n${lines.join("\n")}\n\n` +
    `请用 ### FILE: app/... 覆盖修复，并确保所有按钮可点击、无控制台报错。`;

  res.json({ ok: true, sessionId: sid, message });
});

/** 数据验证：从原型提取字段（SSE：进度 + 扫描动画 + 结果） */
app.post("/api/data-verify/extract", async (req, res) => {
  sseInit(res);
  const stopKeepalive = startSseKeepalive(res);
  const ac = new AbortController();
  bindClientDisconnectAbort(req, res, ac, "POST /api/data-verify/extract");
  const fail = (message) => {
    sseSend(res, { type: "error", message: String(message || "提取失败") });
    sseSend(res, { type: "done" });
    try {
      res.end();
    } catch {
      /* ignore */
    }
  };
  try {
    const {
      material,
      config,
      images: imagesIn,
      skill: skillIn,
    } = req.body || {};
    const materialText = String(material || "").trim();
    // 有原型链接时默认不塞截图（Playwright 已抓页），降低代理/模型体积失败率
    const hasUrl =
      /https?:\/\//i.test(materialText) ||
      /file:\/\//i.test(materialText) ||
      /[A-Za-z]:[\\/].+\.html?/i.test(materialText);
    let images = normalizeVisionImages(imagesIn);
    if (hasUrl && images.length) {
      sseSend(res, {
        type: "thought",
        text: "已检测到原型链接，将优先用浏览器抓取页面；粘贴截图仅作补充（若识图失败会自动降级）…\n",
      });
      images = images.slice(0, 1);
    }
    if (!materialText && images.length === 0) {
      return fail("请填写原型链接/说明，或粘贴截图");
    }
    const llm = resolveDataVerifyLlm(config);
    if (llm.error) return fail(llm.error);

    const sessionId = `dv_${Date.now()}_${randomBytes(3).toString("hex")}`;
    const sessionDir = path.join(GEN, sessionId);
    await mkdir(sessionDir, { recursive: true });
    sseSend(res, { type: "meta", sessionId, phase: "data-verify" });
    sseSend(res, { type: "step", label: "准备提取" });

    let pageContext = "";
    let pageScan = null;
    let fetchMeta = { llmVia: llm.via, llmModel: llm.model };
    if (hasUrl) {
      sseSend(res, {
        type: "thought",
        text: "正在打开原型并抓取页面结构（SPA/登录页会自动处理）…\n",
      });
      sseSend(res, { type: "step", label: "抓取原型" });
      try {
        const fetched = await fetchPrototypePageContext(materialText);
        pageContext = fetched?.context || "";
        pageScan = fetched?.scan || null;
        const extraPages = fetched?.meta?.extraPages || [];
        const requestedPages = fetched?.meta?.requestedPages || [];
        const missingRequestedPages =
          fetched?.meta?.missingRequestedPages || [];
        const usableContext = fetched?.meta?.usableContext !== false;
        fetchMeta = {
          ...fetchMeta,
          hasContext: !!pageContext && usableContext,
          contextLen: pageContext.length,
          extraPages,
          requestedPages,
          missingRequestedPages,
        };
        if (!usableContext) {
          return fail(
            "原型链接未抓取成功，已停止生成，避免把页面名称臆造成数据字段。" +
              "请稍后重试；URL 后可继续写中文说明（现已支持中文分号）。"
          );
        }
        if (requestedPages.length && missingRequestedPages.length) {
          return fail(
            `以下指定页面未抓到正文：${missingRequestedPages.join("、")}。` +
              "已停止生成，避免用页面名称冒充数据字段。请确认菜单可点击后重试。"
          );
        }
        sseSend(res, {
          type: "thought",
          text: pageContext
            ? `原型抓取完成（${pageContext.length} 字${
                extraPages.length
                  ? `，已抓 ${extraPages.length} 个侧栏页：${extraPages.join("、")}`
                  : ""
              }）。\n`
            : "未能抓到正文，将主要依据链接文字与截图提取。\n",
        });
      } catch (e) {
        const msg = String(e?.message || e);
        fetchMeta = {
          ...fetchMeta,
          hasContext: false,
          prototypeError: msg.slice(0, 240),
        };
        return fail(
          `原型抓取异常：${msg.slice(0, 220)}。已停止生成，避免产生虚假字段。`
        );
      }
    }

    // 扫描动画（截图落盘，SSE 只传 URL）
    const regions = Array.isArray(pageScan?.regions) ? pageScan.regions : [];
    let screenshotUrl = "";
    const rawShot = String(pageScan?.screenshot || "");
    if (rawShot.startsWith("data:image")) {
      try {
        const m = /^data:image\/\w+;base64,(.+)$/i.exec(rawShot);
        if (m) {
          const rel = "scan-preview.jpg";
          await writeFile(path.join(sessionDir, rel), Buffer.from(m[1], "base64"));
          screenshotUrl = `/generated/${encodeURIComponent(sessionId)}/${rel}?bust=${Date.now()}`;
        }
      } catch (e) {
        console.warn("[data-verify] persist scan failed", e?.message || e);
      }
    }
    if (screenshotUrl || regions.length) {
      sseSend(res, {
        type: "dv_scan_story",
        sessionId,
        screenshotUrl,
        regions,
        viewport: pageScan?.viewport || { w: 1440, h: 900 },
      });
      sseSend(res, {
        type: "thought",
        text: regions.length
          ? `正在播放结构扫描（${regions.length} 个模块）…\n`
          : "正在展示原型预览…\n",
      });
    }

    const fileSkill = await loadDataVerifySkill(SKILLS_DIR, "extract");
    const customSkill = String(skillIn || "").trim();
    let messages = buildExtractMessages({
      skillText: fileSkill,
      material: materialText,
      pageContext,
      customSkill,
    });
    let usedImages = 0;
    // 已有足够页面正文时不再传截图，避免大请求触发火山 HEADERS_TIMEOUT
    const allowVision = images.length > 0 && pageContext.length < 1500;
    if (allowVision) {
      const withImg = buildExtractVisionMessages(messages, images);
      usedImages = Array.isArray(withImg[1]?.content)
        ? withImg[1].content.filter((p) => p?.type === "image_url").length
        : 0;
      if (usedImages > 0) messages = withImg;
    } else if (images.length && pageContext.length >= 1500) {
      sseSend(res, {
        type: "thought",
        text: "页面正文已足够，本次不附带截图以加快模型响应…\n",
      });
    }

    const callLlm = (msgs) =>
      nonStreamCompletion({
        baseUrl: llm.baseUrl,
        apiKey: llm.apiKey,
        model: llm.model,
        messages: msgs,
        signal: ac.signal,
        preferStream: true,
        temperature: 0.2,
      });

    sseSend(res, { type: "step", label: "模型提取字段" });
    sseSend(res, {
      type: "thought",
      text: `正在用模型提取数据字段（${llm.model}，流式）…\n`,
    });

    let raw = "";
    try {
      raw = await callLlm(messages);
    } catch (e) {
      const msg = String(e?.message || e);
      const canRetrySlim =
        /HEADERS_TIMEOUT|网络失败|fetch failed|ECONNRESET|ETIMEDOUT|Invalid base64|image_url|BadRequest/i.test(
          msg
        );
      if (!canRetrySlim) {
        return fail(
          /HEADERS_TIMEOUT|fetch failed|网络失败/i.test(msg)
            ? `模型接口超时/网络失败：${msg}\n可检查「识图用 OpenAI 兼容」的 ep 与网络，或稍后重试。`
            : msg
        );
      }
      sseSend(res, {
        type: "thought",
        text: "首次调用超时或失败，正在用精简上下文重试（不带截图）…\n",
      });
      const slimCtx = String(pageContext || "").slice(0, 6000);
      messages = buildExtractMessages({
        skillText: fileSkill,
        material: materialText,
        pageContext: slimCtx,
        customSkill,
      });
      try {
        raw = await callLlm(messages);
        fetchMeta = {
          ...fetchMeta,
          visionFallback: true,
          retrySlim: true,
          visionError: msg.slice(0, 240),
        };
      } catch (e2) {
        return fail(String(e2?.message || e2));
      }
    }

    let parsed = parseJsonLoose(raw);
    if (!parsed) {
      sseSend(res, {
        type: "thought",
        text: "模型回复不是合法 JSON，正在强制重写为 JSON…\n",
      });
      try {
        const preview = String(raw || "").slice(0, 3500);
        raw = await callLlm([
          {
            role: "system",
            content:
              "你只输出一个合法 JSON 对象，不要 markdown，不要解释。结构：{\"title\":\"...\",\"fields\":[{\"name\":\"\",\"source\":\"数据库统计\",\"formula\":\"\",\"pageValue\":\"\",\"format\":\"number\",\"dependsOn\":[],\"note\":\"\"}]}",
          },
          {
            role: "user",
            content:
              `把下面内容改写成上述 JSON。若原文已是接近 JSON，请修好语法后原样输出字段。\n\n【原文】\n${preview || "（空）"}`,
          },
        ]);
        parsed = parseJsonLoose(raw);
        fetchMeta = { ...fetchMeta, jsonRepair: true };
      } catch (e3) {
        /* fall through */
      }
    }
    if (!parsed) {
      const snip = String(raw || "").replace(/\s+/g, " ").slice(0, 180);
      return fail(
        `模型已响应，但内容不是可解析 JSON${snip ? `：${snip}` : ""}。\n` +
          `可再点一次重试；若多次失败，到「模型」→「识图用 OpenAI 兼容」换一个更强的 ep 接入点（如 Doubao-pro / DeepSeek），不要改 Cursor 的 composer。`
      );
    }
    const result = normalizeExtractResult(parsed);
    if (!result.fields.length) {
      return fail(
        "模型返回了 JSON，但 fields 为空。请确认原型页有数据指标，或补充说明后重试。"
      );
    }
    sseSend(res, {
      type: "result",
      ok: true,
      title: result.title,
      fields: result.fields,
      fetchMeta,
      usedImages,
      sessionId,
    });
    sseSend(res, {
      type: "thought",
      text: `已提取 ${result.fields.length} 个字段，请核对后点「确定」。\n`,
    });
    sseSend(res, { type: "done" });
    res.end();
  } catch (e) {
    const msg = String(e?.message || e);
    if (/aborted|AbortError/i.test(msg)) {
      return fail("请求已取消（页面关闭或中断）");
    }
    return fail(msg);
  } finally {
    stopKeepalive();
  }
});

/** 数据验证：生成 / 修复 SQL */
app.post("/api/data-verify/sql", async (req, res) => {
  const ac = new AbortController();
  bindClientDisconnectAbort(req, res, ac, "POST /api/data-verify/sql");
  try {
    const {
      config,
      skill: skillIn,
      fieldName,
      source,
      formula,
      pageValue,
      userNote,
      schemaText,
      existingSql,
      errorText,
      mode,
      images: imagesIn,
    } = req.body || {};
    const images = normalizeVisionImages(imagesIn);
    if (!String(fieldName || "").trim() && !String(userNote || "").trim() && !images.length) {
      return res.status(400).json({ ok: false, error: "请至少提供字段名或说明/截图" });
    }
    const llm = resolveDataVerifyLlm(config);
    if (llm.error) {
      return res.status(400).json({ ok: false, error: llm.error });
    }
    const fileSkill = await loadDataVerifySkill(SKILLS_DIR, "sql");
    const customSkill = String(skillIn || "").trim();
    let schema = String(schemaText || "").trim();
    if (images.length) {
      try {
        const brief = await describeReqImagesBrief({
          baseUrl: llm.baseUrl,
          apiKey: llm.apiKey,
          model: llm.model,
          requirementText: "请描述表结构/字段截图中的表名、列名与注释",
          images,
          signal: ac.signal,
        });
        if (brief) schema = `${schema}\n\n【表结构截图摘要】\n${brief}`.trim();
      } catch (e) {
        console.warn("[data-verify-sql] vision failed", e?.message || e);
      }
    }
    const messages = buildSqlMessages({
      skillText: fileSkill,
      customSkill,
      fieldName,
      source,
      formula,
      pageValue,
      userNote,
      schemaText: schema,
      existingSql,
      errorText,
      mode,
    });
    const raw = await nonStreamCompletion({
      baseUrl: llm.baseUrl,
      apiKey: llm.apiKey,
      model: llm.model,
      messages,
      signal: ac.signal,
    });
    const parsed = parseJsonLoose(raw);
    if (!parsed) {
      return res.status(502).json({
        ok: false,
        error: "模型未返回可解析 JSON",
        raw: String(raw || "").slice(0, 2000),
      });
    }
    return res.json({ ok: true, ...normalizeSqlResult(parsed) });
  } catch (e) {
    const msg = String(e?.message || e);
    if (/aborted|AbortError/i.test(msg)) {
      return res.status(499).json({ ok: false, error: "请求已取消（页面关闭或中断）" });
    }
    return res.status(500).json({ ok: false, error: msg });
  }
});

/** 直连执行 SQL · 预留（尚未接通真实数据库） */
app.post("/api/data-verify/sql/execute", async (req, res) => {
  return res.status(501).json({
    ok: false,
    reserved: true,
    error: "直连数据库执行尚未启用，请先手工跑 SQL，把结果填回「数据库统计值」",
    hint: "后续将支持连接配置 + SELECT 回填",
  });
});

/* static serve generated for simple preview — use absolute path */
app.use(
  "/generated",
  express.static(GEN, { fallthrough: true, etag: true })
);

const PORT = Number(process.env.AGILE_SIM_PORT) || 5180;
const HOST = process.env.AGILE_SIM_HOST || "127.0.0.1";

/** 从单文件原型 HTML 里抽 registerProto('route', ...) 路由名（原文件联动用） */
function parseRegisterProtoRoutes(html) {
  const routes = [];
  const re = /registerProto\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(String(html || "")))) {
    routes.push(m[1]);
  }
  return [...new Set(routes)];
}

/** 读取产品系统登录凭据（环境变量 + workbench/.env） */
async function loadProductSystemCreds() {
  let user = String(process.env.PRODUCT_SYSTEM_USER || "").trim();
  let pass = String(process.env.PRODUCT_SYSTEM_PASS || "").trim();
  let base = String(
    process.env.PRODUCT_SYSTEM_BASE_URL || "https://product.example.com"
  )
    .trim()
    .replace(/\/+$/, "");
  const tryPaths = [
    process.env.PRODUCT_SYSTEM_ENV_FILE,
    path.join(ROOT, ".env"),
    path.join(ROOT, "..", "..", "工作控制台", "workbench", ".env"),
      ].filter(Boolean);
  for (const p of tryPaths) {
    try {
      if (!existsSync(p)) continue;
      const text = await readFile(p, "utf8");
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith("#") || !line.includes("=")) continue;
        const i = line.indexOf("=");
        const key = line.slice(0, i).trim();
        let val = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
        if (key === "PRODUCT_SYSTEM_USER" && !user) user = val;
        if (key === "PRODUCT_SYSTEM_PASS" && !pass) pass = val;
        if (key === "PRODUCT_SYSTEM_BASE_URL" && val) {
          base = val.replace(/\/+$/, "");
        }
      }
      if (user && pass) break;
    } catch {
      /* ignore */
    }
  }
  return {
    base: base || "https://product.example.com",
    user: user || "pancaiyuan",
    pass,
  };
}

function cookieHeaderFromFetch(res) {
  try {
    if (typeof res.headers.getSetCookie === "function") {
      const arr = res.headers.getSetCookie() || [];
      if (arr.length) {
        return arr.map((c) => String(c).split(";")[0]).join("; ");
      }
    }
  } catch {
    /* ignore */
  }
  const one = res.headers.get("set-cookie");
  if (!one) return "";
  return one
    .split(/,(?=[^=;]+=)/)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

function normalizeProtoName(s) {
  return String(s || "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function scoreProtoNameMatch(query, name) {
  const q = normalizeProtoName(query);
  const n = normalizeProtoName(name);
  if (!q || !n) return 0;
  if (q === n) return 100;
  if (n.includes(q) || q.includes(n)) return 80;
  // 共同子串粗分
  let hit = 0;
  for (let i = 0; i < q.length - 1; i++) {
    if (n.includes(q.slice(i, i + 2))) hit += 1;
  }
  return Math.min(70, hit * 3);
}

/**
 * 从灵巅云产品系统下载原型 HTML → proto-local
 * body: { name?: "源之蜂巢1.4.6 联运功能", id?: "uuid", previewUrl?: "https://xm.../preview/uuid" }
 */
app.post("/api/qa/proto-from-product", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    let protoId = String(req.body?.id || "").trim();
    const previewUrl = String(req.body?.previewUrl || req.body?.url || "").trim();
    if (!protoId && previewUrl) {
      const m = previewUrl.match(
        /\/preview\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
      );
      if (m) protoId = m[1];
    }
    if (!protoId && (!name || name.length < 2)) {
      return res.status(400).json({
        ok: false,
        error: "请输入原型名称，或提供预览 URL / 原型 id",
      });
    }
    const cred = await loadProductSystemCreds();
    if (!cred.pass) {
      return res.status(500).json({
        ok: false,
        error:
          "未配置 PRODUCT_SYSTEM_PASS（可写在工作台 workbench/.env 或环境变量）",
      });
    }

    const loginRes = await fetch(`${cred.base}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username: cred.user, password: cred.pass }),
    });
    const loginBody = await loginRes.json().catch(() => ({}));
    if (
      loginRes.status >= 400 ||
      (loginBody.code !== 0 && loginBody.code !== "0")
    ) {
      return res.status(401).json({
        ok: false,
        error: `产品系统登录失败：${loginBody.message || loginRes.status}`,
      });
    }
    const cookie = cookieHeaderFromFetch(loginRes);
    if (!cookie) {
      return res.status(401).json({
        ok: false,
        error: "产品系统登录成功但未拿到 Cookie，无法下载",
      });
    }

    let best = null;
    let bestSc = -1;

    // 有 id：直接拉详情
    if (protoId) {
      const detailRes = await fetch(
        `${cred.base}/api/v1/prototypes/${encodeURIComponent(protoId)}`,
        { headers: { Accept: "application/json", Cookie: cookie } }
      );
      const detailBody = await detailRes.json().catch(() => ({}));
      if (detailRes.ok && detailBody?.data?.id) {
        best = detailBody.data;
        bestSc = 100;
      }
    }

    if (!best && name) {
      const keyword =
        name.replace(/\s+/g, " ").trim().slice(0, 40) || name.slice(0, 20);
      const listRes = await fetch(
        `${cred.base}/api/v1/prototypes?page=1&pageSize=50&keyword=${encodeURIComponent(keyword)}`,
        {
          headers: { Accept: "application/json", Cookie: cookie },
        }
      );
      const listBody = await listRes.json().catch(() => ({}));
      const items = Array.isArray(listBody?.data?.list)
        ? listBody.data.list
        : [];
      if (!items.length) {
        const shortKw = (name.match(/蜂巢|联运|[\u4e00-\u9fa5]{2,8}/) || [
          name.slice(0, 6),
        ])[0];
        const listRes2 = await fetch(
          `${cred.base}/api/v1/prototypes?page=1&pageSize=50&keyword=${encodeURIComponent(shortKw)}`,
          { headers: { Accept: "application/json", Cookie: cookie } }
        );
        const listBody2 = await listRes2.json().catch(() => ({}));
        const items2 = Array.isArray(listBody2?.data?.list)
          ? listBody2.data.list
          : [];
        items.push(...items2);
      }
      if (!items.length) {
        return res.status(404).json({
          ok: false,
          error: `未找到名称含「${name}」的原型，请核对产品系统「原型管理」`,
        });
      }
      for (const it of items) {
        const sc = scoreProtoNameMatch(name, it?.name || "");
        if (sc > bestSc) {
          bestSc = sc;
          best = it;
        }
      }
      if (!best || bestSc < 20) {
        return res.status(404).json({
          ok: false,
          error: `未匹配到「${name}」。候选：${items
            .slice(0, 5)
            .map((x) => x.name)
            .join("、")}`,
          candidates: items.slice(0, 8).map((x) => ({
            id: x.id,
            name: x.name,
          })),
        });
      }
    }

    if (!best?.id) {
      return res.status(404).json({
        ok: false,
        error: protoId
          ? `未找到原型 id=${protoId}`
          : "未匹配到原型",
      });
    }

    const dlRes = await fetch(
      `${cred.base}/api/v1/prototypes/${encodeURIComponent(best.id)}/download`,
      { headers: { Cookie: cookie, Accept: "*/*" } }
    );
    if (!dlRes.ok) {
      return res.status(502).json({
        ok: false,
        error: `下载失败 HTTP ${dlRes.status}`,
        matched: { id: best.id, name: best.name },
      });
    }
    const html = await dlRes.text();
    if (!html || html.length < 80) {
      return res.status(502).json({
        ok: false,
        error: "下载内容为空或过短",
        matched: { id: best.id, name: best.name },
      });
    }

    const dir = path.join(GEN, "proto-local");
    await mkdir(dir, { recursive: true });
    const key = createHash("sha1").update(html).digest("hex").slice(0, 16);
    const safeName = String(best.name || name)
      .replace(/[^\w.\u4e00-\u9fa5\-]+/g, "_")
      .slice(0, 40);
    const fname = `ps_${key}_${safeName}.html`;
    await writeFile(path.join(dir, fname), html, "utf8");
    const urlPath = `/generated/proto-local/${fname}`;
    const openUrl = `http://127.0.0.1:${PORT}${urlPath}`;
    const routes = parseRegisterProtoRoutes(html);

    res.json({
      ok: true,
      openUrl,
      url: urlPath,
      localFile: path.join(dir, fname),
      matched: {
        id: best.id,
        name: best.name,
        score: bestSc,
        htmlEntry: best.htmlEntry || "",
        previewUrl: best.previewUrl
          ? `${cred.base}${String(best.previewUrl).startsWith("/") ? "" : "/"}${best.previewUrl}`
          : "",
      },
      size: html.length,
      routes,
      hasProtoPanel: /id=["']protoPanel["']|id=["']protoBody["']/.test(html),
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: String(e?.message || e).slice(0, 240),
    });
  }
});

/**
 * 导入本地原型原文件（.html）→ /generated/proto-local/
 * 比 xm 预览壳更适合三栏联动：可直接读 #protoPanel / PAGE_PROTO / hash 路由。
 */
app.post("/api/qa/proto-local", async (req, res) => {
  try {
    const html = String(req.body?.html || "");
    const role = String(req.body?.role || "front").trim() || "front";
    let name = String(req.body?.name || "proto.html").trim() || "proto.html";
    name = name.replace(/[^\w.\u4e00-\u9fa5\-]+/g, "_");
    if (!html || html.length < 80) {
      return res.status(400).json({ ok: false, error: "缺少 HTML 内容" });
    }
    if (html.length > 12_000_000) {
      return res.status(400).json({ ok: false, error: "文件过大（上限约 12MB）" });
    }
    const dir = path.join(GEN, "proto-local");
    await mkdir(dir, { recursive: true });
    const key = createHash("sha1").update(html).digest("hex").slice(0, 16);
    const safeRole = /^(front|back|other)$/i.test(role) ? role.toLowerCase() : "front";
    const fname = `${safeRole}_${key}.html`;
    await writeFile(path.join(dir, fname), html, "utf8");
    const routes = parseRegisterProtoRoutes(html);
    const urlPath = `/generated/proto-local/${fname}`;
    const openUrl = `http://127.0.0.1:${PORT}${urlPath}`;
    res.json({
      ok: true,
      url: urlPath,
      openUrl,
      name,
      role: safeRole,
      routes,
      hasPageProto: routes.length > 0,
      hasProtoPanel: /id=["']protoPanel["']|id=["']protoBody["']/.test(html),
      size: html.length,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e).slice(0, 200) });
  }
});

registerGameDevPipeline(app, {
  GEN,
  ROOT,
  sseInit,
  sseSend,
  streamPhaseToClient,
  bindClientDisconnectAbort,
  startSseKeepalive,
});

app.listen(PORT, HOST, () => {
  console.log(`agile-sim API http://${HOST}:${PORT}  generated -> ${GEN}`);
  console.log(`[agile-sim] 游戏流水线 GET/POST /api/game-pipeline/*`);
  if (HOST === "0.0.0.0") {
    console.log(
      `[agile-sim] 局域网请只访问 Vite 端口（默认 5173），由前端代理 /api；勿让同事直连 ${PORT}`
    );
  }
});
