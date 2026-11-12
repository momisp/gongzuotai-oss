import express from "express";
import cors from "cors";
import { mkdir, writeFile, readFile, copyFile, access } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";
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
  parseTestPointsFromMd,
  repairTestPointMdIfNeeded,
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
    generatedDir: GEN,
    skillsDir: SKILLS_DIR,
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

async function openAiStyleStream({ baseUrl, apiKey, model, messages, signal }) {
  const url = `${normalizeBaseUrl(baseUrl)}/chat/completions`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.4,
    }),
    signal,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`LLM HTTP ${r.status}: ${t.slice(0, 800)}`);
  }
  return r.body;
}

async function nonStreamCompletion({ baseUrl, apiKey, model, messages, signal }) {
  const url = `${normalizeBaseUrl(baseUrl)}/chat/completions`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      temperature: 0.4,
    }),
    signal,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`LLM HTTP ${r.status}: ${t.slice(0, 800)}`);
  }
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "";
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
  if (/4o|vision|vl|glm-4v|qwen.*vl|gemini/i.test(m)) return m;
  return "gpt-4o-mini";
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
      const desc = await describeReqImagesBrief({
        baseUrl: visionBase,
        apiKey: visionKey,
        model: config?.model,
        requirementText: specReqText,
        images,
        signal,
      });
      return (
        specReqText +
        `\n\n【附图识图摘要（${pickVisionModel(config?.model)}）】\n` +
        String(desc || "").trim()
      );
    } catch (e) {
      return (
        specReqText +
        `\n\n【附图识图失败】${String(e.message || e)}。请确认 OpenAI 兼容 Base URL / API Key 有效且模型支持视觉（如 gpt-4o）；或改用「OpenAI 兼容」后端做总结需求。`
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

async function buildQaMessages({ requirement, contextHtml, material, styleHint }) {
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

async function buildQaVisionUserContent({ requirement, contextHtml, material, styleHint, images }) {
  const base = await buildQaMessages({ requirement, contextHtml, material, styleHint });
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
      }
    } catch {
      /* ignore */
    }
    throw new Error(`Cursor Create Agent ${r.status}: ${t.slice(0, 1200)}${hint}`);
  }
  return JSON.parse(t);
}

async function cursorCloudCreateRun({ apiKey, agentId, prompt, signal }) {
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
  if (!r.ok) throw new Error(`Cursor Create Run ${r.status}: ${t.slice(0, 1200)}`);
  return JSON.parse(t);
}

/** Cursor 单轮 Run 的 SSE 最长等待（毫秒），避免上游不 close 时永远挂起 */
const CURSOR_SSE_MAX_MS = Math.max(
  120_000,
  Number(process.env.AGILE_SIM_CURSOR_SSE_MAX_MS || 45 * 60 * 1000)
);

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
        await onSse(eventName, data);

        const ev = (eventName || "").toLowerCase();
        let terminal = ev === "result";
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
          /^(completed|finished|failed|canceled|cancelled|done|error)$/i.test(
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
          sseSend(res, {
            type: "error",
            message: data?.message || JSON.stringify(data),
          });
        }
        if (ev === "result" && data?.status) {
          sseSend(res, {
            type: "thought",
            text: `\n[Cursor Cloud] run 结束 status=${data.status}\n`,
          });
        }
      },
    });
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
  const maxB64Chars = 1_600_000;
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
    if (!b64) continue;
    if (b64.length > maxB64Chars) {
      b64 = b64.slice(0, maxB64Chars);
    }
    out.push({
      mime,
      base64: b64,
      dataUrl: /^data:/.test(dataUrl) ? dataUrl : "",
    });
  }
  return out;
}

function markdownCursorTail(kind) {
  const name = kind === "ops" ? "运维交接 Markdown 文档" : "测试点 Markdown 文档";
  const qaExtra =
    kind === "qa"
      ? " 必须含 ## 冒烟自动化（Playwright）、## 业务测试点、## 功能测试点 三段；业务/功能段用 - 列表写一句话场景，禁止只输出裸 JSON。"
      : "";
  return `【对本条回复的要求】请在回复正文里直接输出完整可保存为 .md 的${name}，勿用外层 Markdown 代码围栏包裹全文；不要仅用链接、路径或「见仓库」代替正文。${qaExtra}`;
}

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
    } = req.body || {};
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

    const qaMessages =
      provider === "openai" && images.length > 0
        ? await buildQaVisionUserContent({
            requirement: requirementText,
            contextHtml,
            material: materialText,
            styleHint: styleText,
            images,
          })
        : await buildQaMessages({
            requirement: requirementText,
            contextHtml,
            material: materialText,
            styleHint: styleText,
          });

    const qaCursorMessages =
      provider === "cursor" && images.length > 0
        ? await buildQaVisionUserContent({
            requirement: requirementText,
            contextHtml,
            material:
              `${materialText || "（未填写）"}\n\n【说明】你已上传参考图若干张（${images.length}），Cloud Agent 此轮仅从文字理解，请据此补充测试关注点。`,
            styleHint: styleText,
            images: [],
          })
        : null;

    sseSend(res, { type: "meta", sessionId, phase: "qa" });
    sseSend(res, {
      type: "thought",
      text: "【测试】梳理需求与原型，生成测试点 Markdown…\n",
    });

    await streamPhaseToClient(res, {
      label: "测试 · 测试点",
      provider,
      baseUrl,
      apiKey,
      model,
      sessionDir,
      cursorMode: provider === "cursor" ? "followup" : undefined,
      cursorRepoUrl,
      cursorRepoRef,
      cursorSessionDir: sessionDir,
      cursorTail: markdownCursorTail("qa"),
      messages: qaCursorMessages || qaMessages,
      signal: ac.signal,
      onFullText: async (raw) => {
        let md = extractMarkdown(raw);
        md = repairTestPointMdIfNeeded(md);
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

    sseSend(res, {
      type: "done",
      sessionId,
      phase: "qa",
      mdPath: path.relative(ROOT, path.join(sessionDir, "测试点.md")),
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

/* static serve generated for simple preview — use absolute path */
app.use(
  "/generated",
  express.static(GEN, { fallthrough: true, etag: true })
);

const PORT = Number(process.env.AGILE_SIM_PORT) || 5180;
const HOST = process.env.AGILE_SIM_HOST || "127.0.0.1";
app.listen(PORT, HOST, () => {
  console.log(`agile-sim API http://${HOST}:${PORT}  generated -> ${GEN}`);
  if (HOST === "0.0.0.0") {
    console.log(
      `[agile-sim] 局域网请只访问 Vite 端口（默认 5173），由前端代理 /api；勿让同事直连 ${PORT}`
    );
  }
});
