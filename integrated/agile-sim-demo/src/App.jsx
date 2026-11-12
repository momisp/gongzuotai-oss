import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FrameworkMindmap from "./FrameworkMindmap.jsx";
import TpEmbedWorkbench from "./TpEmbedWorkbench.jsx";
import DataVerifyWorkbench from "./DataVerifyWorkbench.jsx";
import TpPwDebugModal from "./TpPwDebugModal.jsx";
import TpTraceWorkbench, {
  readTpTracePopoutPayload,
} from "./TpTraceWorkbench.jsx";
import TimelineSequence, {
  timelineProgressFromMetrics,
} from "./TimelineSequence.jsx";
import { reviewNeedsRework as clientReviewNeedsRework } from "./reviewNeedsRework.js";
import GameDevPipeline from "./GameDevPipeline.jsx";
import "./GameDevPipeline.css";

const LS = {
  provider: "agile_sim_provider",
  baseUrl: "agile_sim_base_url",
  apiKey: "agile_sim_api_key",
  cursorApiKey: "agile_sim_cursor_api_key",
  cursorRepoUrl: "agile_sim_cursor_repo_url",
  cursorRepoRef: "agile_sim_cursor_repo_ref",
  /** @deprecated 旧版共用 Model ID；迁移后写入 openaiModel / cursorModel */
  model: "agile_sim_model",
  openaiModel: "agile_sim_openai_model",
  cursorModel: "agile_sim_cursor_model",
  projectHistory: "agile_sim_project_history",
};

function looksLikeCursorModelId(m) {
  return /^composer/i.test(String(m || "").trim());
}

/** 从旧版共用 model 拆出两侧默认值（只读一次） */
function migrateSplitModels() {
  const legacy = localStorage.getItem(LS.model) || "";
  let openaiM = localStorage.getItem(LS.openaiModel);
  let cursorM = localStorage.getItem(LS.cursorModel);
  if (openaiM == null || openaiM === "") {
    // 旧版共用字段若是 OpenAI/火山类 id，归到 openai；composer* 不归这边
    openaiM =
      legacy && !looksLikeCursorModelId(legacy) ? legacy : "gpt-4o-mini";
  }
  if (cursorM == null || cursorM === "") {
    cursorM =
      legacy && looksLikeCursorModelId(legacy) ? legacy : "composer-2.5";
  }
  if (
    cursorM === "composer-2" ||
    cursorM === "composer2" ||
    cursorM === "composer-2-fast"
  ) {
    cursorM = "composer-2.5";
  }
  return { openaiM, cursorM };
}

/**
 * 开发环境走 Vite 同源代理（/api、/generated → 5180），本机与局域网访问均可用。
 * 工作台内嵌时 base=/agile-sim/，路径前缀由 import.meta.env.BASE_URL 提供。
 */
const API_ORIGIN = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_ORIGIN}${p}`;
}

async function workbenchApi(path, opts = {}) {
  const p = path.startsWith("/") ? path : `/${path}`;
  const res = await fetch(p, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  return res.json();
}

/** 将 OpenAI 兼容配置同步到工作台，供业务精灵 / 桌面精灵复用 */
async function syncOpenAiConfigToWorkbenchSprite(cfg) {
  const payload = {
    baseUrl: String(cfg?.baseUrl || "").trim(),
    model: String(cfg?.model || "").trim(),
    apiKey: String(cfg?.apiKey || "").trim(),
    source: "agile-sim",
  };
  if (!payload.apiKey) return;
  const bases = ["", "http://127.0.0.1:8765"];
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/api/auto-qa/sprite/llm-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) return;
    } catch (_) {
      /* 独立 dev 时工作台可能未启动 */
    }
  }
}

/** 去掉模型流式前言，避免「正在抓取…」进标题/文件名 */
function cleanGeneratedMd(md) {
  return String(md || "")
    .replace(/^(正在[^\n]*\n)+/gm, "")
    .replace(/^(继续[^\n]*\n)+/gm, "")
    .trim();
}

/** 导出 XMind 前去掉叶子 [P0]/[P1]/[P2]（含全角括号），脑图名称不带级别 */
function stripPriorityForXmind(md) {
  return String(md || "").replace(
    /^(\s*[-*+]?\s*)[\[［【]\s*P\s*[012]\s*[\]］】]\s*/gim,
    "$1"
  );
}

/** 导出/导入用例前去掉溯源锚点〔源:…〕（溯源台仍可用原稿） */
function stripTraceAnchorsForExport(md) {
  return String(md || "")
    .replace(/[〔【\[]\s*源\s*[:：][^〕】\]]*[〕】\]]/g, "")
    .replace(/\(\s*源\s*[:：][^)]*\)/g, "")
    .replace(/[ \t]+$/gm, "");
}

/**
 * 把文本里的 URL 百分号编码还原成可读中文（粘贴/导入时常已是 %E6… 形式）。
 * 用 decodeURI，避免把 ?&=/# 等保留字符解坏。
 */
function decodeUrlsInText(text) {
  return String(text || "").replace(
    /(?:https?:\/\/|file:\/\/\/)[^\s)\]>"']+/gi,
    (raw) => {
      const trimmed = raw.replace(/[.,;:!?)]+$/, "");
      const trail = raw.slice(trimmed.length);
      if (!/%[0-9A-Fa-f]{2}/.test(trimmed)) return raw;
      try {
        return decodeURI(trimmed) + trail;
      } catch {
        try {
          return (
            trimmed.replace(/%[0-9A-Fa-f]{2}/g, (m) => {
              try {
                return decodeURIComponent(m);
              } catch {
                return m;
              }
            }) + trail
          );
        } catch {
          return raw;
        }
      }
    }
  );
}

function extractProjectName(...blobs) {
  const skip = /^(正在|继续|请稍|生成中)/;
  for (const blob of blobs) {
    const cleaned = cleanGeneratedMd(blob);
    for (const raw of cleaned.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith(">")) continue;
      if (skip.test(line)) continue;
      if (line.startsWith("# ")) {
        return line
          .slice(2)
          .replace(/[·•]\s*(页面框架|业务场景测试点|页面功能测试点|测试点)\s*$/u, "")
          .replace(/\s*(页面框架|业务场景测试点|页面功能测试点|测试点)\s*$/u, "")
          .trim()
          .slice(0, 48);
      }
    }
  }
  return "测试点";
}

function extractPrototypeUrl(material) {
  const m = String(material || "").match(/https?:\/\/[^\s)\]>'"]+/i);
  if (!m) return "";
  try {
    const u = new URL(m[0]);
    u.hash = "";
    return (u.origin + u.pathname + u.search).replace(/\/+$/, "");
  } catch {
    return m[0].replace(/[),.;]+$/, "");
  }
}

/** 规范化原型 URL，便于前后台比对 */
function normalizeProtoUrl(raw) {
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

/** 默认「仅 V2」范围说明（商务端这类含历史版本的原型） */
const DEFAULT_V2_SCOPE_NOTE =
  "【本版范围】新商务侧仅生成 V2 近期改版（有效端治理 / 商务绩效 / 小组设置 / 预警·免预警·设置等本版改动）；" +
  "原型虽含 V1 历史内容，禁止按「全部页面」展开未改菜单的全量测点。" +
  "抓取侧栏请按「按版本查看 = V2」。OA 换绑页若另有链接，单独成章，禁止写成前台/后台跨端闭环。";

/** 从素材解析双链（前后台 或 多原型独立） */
function parseDualPrototypeMaterial(material) {
  const text = String(material || "");
  const multiMarked = /【多原型[·・.]?独立】/.test(text);
  const dualMarked = /【双原型】/.test(text);
  const frontM = text.match(
    /(?:前台|C\s*端|客户端|小程序|用户端)\s*[:：]\s*(https?:\/\/[^\s)\]>'"；，。]+)/i
  );
  const backM = text.match(
    /(?:后台|管理端|运营端|B\s*端|管理后台)\s*[:：]\s*(https?:\/\/[^\s)\]>'"；，。]+)/i
  );
  const aM = text.match(
    /原型\s*A(?:（[^）]+）|\([^)]+\))?\s*[:：]\s*(https?:\/\/[^\s)\]>'"；，。]+)/i
  );
  const bM = text.match(
    /原型\s*B(?:（[^）]+）|\([^)]+\))?\s*[:：]\s*(https?:\/\/[^\s)\]>'"；，。]+)/i
  );
  const frontUrl = normalizeProtoUrl(frontM?.[1] || aM?.[1] || "");
  const backUrl = normalizeProtoUrl(backM?.[1] || bM?.[1] || "");
  let notes = text
    .replace(/【多原型[·・.]?独立】\s*/g, "")
    .replace(/【双原型】\s*/g, "")
    .replace(/(?:前台|C\s*端|客户端|小程序|用户端)\s*[:：]\s*https?:\/\/[^\s)\]>'"；，。]+/gi, "")
    .replace(/(?:后台|管理端|运营端|B\s*端|管理后台)\s*[:：]\s*https?:\/\/[^\s)\]>'"；，。]+/gi, "")
    .replace(/原型\s*[AB](?:（[^）]+）|\([^)]+\))?\s*[:：]\s*https?:\/\/[^\s)\]>'"；，。]+/gi, "")
    .trim();
  const kind =
    multiMarked || (!!aM && !!bM)
      ? "multi"
      : dualMarked || (!!frontM && !!backM) || (!!frontUrl && !!backUrl && dualMarked)
        ? "dual"
        : dualMarked || (!!frontUrl && !!backUrl)
          ? "dual"
          : "single";
  return {
    dual: kind === "dual" || kind === "multi",
    kind,
    frontUrl,
    backUrl,
    notes,
  };
}

/** 拼装前后台双原型素材 */
function buildDualPrototypeMaterial(frontUrl, backUrl, notes) {
  const f = normalizeProtoUrl(frontUrl);
  const b = normalizeProtoUrl(backUrl);
  const n = String(notes || "").trim();
  const lines = ["【双原型】"];
  if (f) lines.push(`前台：${f}`);
  if (b) lines.push(`后台：${b}`);
  if (n) lines.push("", n);
  return lines.join("\n");
}

/** 拼装多原型·独立（非前后台；禁止跨端闭环话术） */
function buildMultiIndependentMaterial(urlA, urlB, notes, labelA = "", labelB = "") {
  const a = normalizeProtoUrl(urlA);
  const b = normalizeProtoUrl(urlB);
  const n = String(notes || "").trim();
  const la = String(labelA || "").trim() || "系统一";
  const lb = String(labelB || "").trim() || "系统二";
  const lines = ["【多原型·独立】"];
  if (a) lines.push(`原型A（${la}）：${a}`);
  if (b) lines.push(`原型B（${lb}）：${b}`);
  if (n) lines.push("", n);
  else if (/v2|近期改版/i.test(la + lb)) lines.push("", DEFAULT_V2_SCOPE_NOTE);
  return lines.join("\n");
}

function isDualPrototypeMaterial(material) {
  const p = parseDualPrototypeMaterial(material);
  return p.kind === "dual";
}

function isMultiIndependentMaterial(material) {
  return parseDualPrototypeMaterial(material).kind === "multi";
}

function recordTheme(rec) {
  if (rec?.theme) return rec.theme;
  const fromMd = extractProjectName(
    rec?.framework,
    rec?.businessScenarios,
    rec?.markdown
  );
  if (fromMd && fromMd !== "测试点") return fromMd;
  const title = String(rec?.title || "").replace(/\s*·\s*\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}.*$/, "").trim();
  return title || "测试点";
}

function collectGanttPrototypes(ganttIds) {
  const ids = new Set((ganttIds || []).map(String).filter(Boolean));
  if (!ids.size) return [];
  try {
    const raw = localStorage.getItem("gantt-schedule-v1");
    const data = raw ? JSON.parse(raw) : {};
    const projects = Array.isArray(data.projects) ? data.projects : [];
    const out = [];
    const seen = new Set();
    for (const p of projects) {
      if (!ids.has(String(p.id))) continue;
      for (const link of p.prototypeLinks || []) {
        const url = String(link?.url || "").trim();
        if (!url || seen.has(url)) continue;
        seen.add(url);
        out.push({
          label: String(link.label || "").trim() || url,
          url,
          ganttName: p.name || "",
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function protoUrlKeyFromText(raw) {
  const m = String(raw || "").match(/https?:\/\/[^\s)\]>'"]+/i);
  if (!m) return "";
  try {
    const u = new URL(m[0]);
    u.hash = "";
    return (u.origin + u.pathname + u.search).replace(/\/+$/, "");
  } catch {
    return m[0].replace(/[),.;]+$/, "");
  }
}

/** 当前选中的排期原型标签 → 禅道模块顶层（小程序 / 后台…） */
function resolveZentaoModuleRoot(qaMaterial, ganttPrototypes) {
  const key = protoUrlKeyFromText(qaMaterial);
  if (key && Array.isArray(ganttPrototypes)) {
    const hit = ganttPrototypes.find((p) => protoUrlKeyFromText(p.url) === key);
    if (hit) {
      const label = String(hit.label || "").trim();
      const url = String(hit.url || "").trim();
      if (label && label !== url) return label.slice(0, 40);
    }
  }
  return "";
}

const PRODUCT_SYS_CFG_KEY = "tp-product-system-config-v1";

function loadProductSystemConfig() {
  const defaults = {
    baseUrl: "https://product.example.com",
    writeKey: "",
    suiteId: "",
    versionId: "",
    reporterName: "测试同学",
    assigneeMap: {},
  };
  try {
    const raw = localStorage.getItem(PRODUCT_SYS_CFG_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return { ...defaults, ...(parsed && typeof parsed === "object" ? parsed : {}) };
  } catch {
    return defaults;
  }
}

function saveProductSystemConfig(cfg) {
  try {
    localStorage.setItem(PRODUCT_SYS_CFG_KEY, JSON.stringify(cfg || {}));
  } catch {
    /* ignore */
  }
}

/** 交互收集产品系统写配置；取消返回 null。
 * 写密钥可留空：优先用浏览器已存，其次用工作台 .env 的 OPEN_API_WRITE_KEY。
 */
function promptProductSystemConfig({ needSuite = false, needVersion = false } = {}) {
  const cfg = loadProductSystemConfig();
  const keyHint = cfg.writeKey
    ? `写密钥已保存（…${String(cfg.writeKey).slice(-6)}），留空沿用；也可留空改用服务端 .env`
    : "产品系统写密钥（可留空，若工作台 workbench/.env 已配置 OPEN_API_WRITE_KEY）";
  const keyRaw = window.prompt(keyHint, "");
  if (keyRaw == null) return null;
  const writeKey = String(keyRaw).trim() || cfg.writeKey || "";
  // 允许空：后端会读 OPEN_API_WRITE_KEY

  let suiteId = cfg.suiteId || "";
  if (needSuite) {
    const suiteRaw = window.prompt(
      "测试套件 suiteId（UUID，用例必须挂在套件下）",
      suiteId
    );
    if (suiteRaw == null) return null;
    suiteId = String(suiteRaw).trim();
    if (!suiteId) {
      window.alert("suiteId 必填");
      return null;
    }
  }

  let versionId = cfg.versionId || "";
  if (needVersion) {
    const verRaw = window.prompt(
      "发现版本 versionId（UUID，可留空）",
      versionId
    );
    if (verRaw == null) return null;
    versionId = String(verRaw).trim();
  }

  const reporterRaw = window.prompt(
    "记录人姓名 reporterName",
    cfg.reporterName || "测试同学"
  );
  if (reporterRaw == null) return null;
  const reporterName = String(reporterRaw).trim() || "测试同学";

  const next = {
    ...cfg,
    writeKey,
    suiteId: suiteId || cfg.suiteId || "",
    versionId: versionId || cfg.versionId || "",
    reporterName,
    baseUrl: cfg.baseUrl || "https://product.example.com",
  };
  saveProductSystemConfig(next);
  return next;
}

async function readSseJsonStream(res, onEvent) {
  if (!res.ok || !res.body) {
    let msg = "请求失败";
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let donePayload = null;
  let lastErr = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const chunks = buf.split("\n\n");
    buf = chunks.pop() || "";
    for (const chunk of chunks) {
      const line = chunk
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith("data:"));
      if (!line) continue;
      let evt = null;
      try {
        evt = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      if (evt.type === "error") lastErr = String(evt.message || "失败");
      if (evt.type === "done") donePayload = evt;
      onEvent?.(evt);
    }
  }
  return { donePayload, lastErr };
}

function mdLineDiff(oldText, newText) {
  const oldLines = String(oldText || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const newLines = String(newText || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  return {
    added: newLines.filter((l) => !oldSet.has(l)),
    removed: oldLines.filter((l) => !newSet.has(l)),
  };
}

function readWorkbenchProject() {
  try {
    const q = new URLSearchParams(window.location.search);
    const raw = sessionStorage.getItem("workbench_project_context");
    const fromS = raw ? JSON.parse(raw) : {};
    return {
      projectId: fromS.projectId || q.get("projectId") || "",
      projectName: fromS.projectName || q.get("projectName") || "",
      assetId: fromS.assetId || "",
      ganttProjectIds: Array.isArray(fromS.ganttProjectIds) && fromS.ganttProjectIds.length
        ? fromS.ganttProjectIds
        : String(q.get("ganttIds") || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
    };
  } catch {
    return {};
  }
}

/** 测试点草稿按项目隔离；旧键 tp_draft_v1 为全局污染源 */
const TP_DRAFT_LEGACY_KEY = "tp_draft_v1";

function tpDraftStorageKey(projectId) {
  const pid = String(projectId || "").trim();
  return pid ? `tp_draft_v1:${pid}` : "tp_draft_v1:_none";
}

function readTpDraftForProject(projectId) {
  const pid = String(projectId || "").trim();
  const scopedKey = tpDraftStorageKey(pid);
  try {
    const scopedRaw = localStorage.getItem(scopedKey);
    if (scopedRaw) {
      const d = JSON.parse(scopedRaw);
      if (!pid || !d.projectId || String(d.projectId) === pid) return d;
    }
    const legacyRaw = localStorage.getItem(TP_DRAFT_LEGACY_KEY);
    if (!legacyRaw) return null;
    const legacy = JSON.parse(legacyRaw);
    const legacyPid = String(legacy.projectId || "").trim();
    // 有当前项目时：仅当旧草稿明确属于该项目才迁移；无项目上下文时：仅接手未标注项目的旧草稿
    if (pid) {
      if (legacyPid !== pid) return null;
    } else if (legacyPid) {
      return null;
    }
    try {
      localStorage.setItem(
        scopedKey,
        JSON.stringify({ ...legacy, projectId: pid || legacyPid || "" })
      );
      localStorage.removeItem(TP_DRAFT_LEGACY_KEY);
    } catch {
      /* quota / private mode */
    }
    return legacy;
  } catch {
    return null;
  }
}

function writeTpDraftForProject(projectId, payload) {
  const pid = String(projectId || "").trim();
  const key = tpDraftStorageKey(pid);
  localStorage.setItem(
    key,
    JSON.stringify({ ...payload, projectId: pid })
  );
  try {
    localStorage.removeItem(TP_DRAFT_LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

function clearTpDraftForProject(projectId) {
  try {
    localStorage.removeItem(tpDraftStorageKey(projectId));
    localStorage.removeItem(TP_DRAFT_LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

function formatStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function formatHumanTime(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function safeFilePart(name) {
  return String(name || "项目")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "")
    .slice(0, 40) || "项目";
}

function buildXmindFilename(projectName, kindLabel) {
  const label =
    kindLabel === "功能测试点"
      ? "测试点"
      : kindLabel === "业务场景"
        ? "业务场景"
        : kindLabel === "页面框架"
          ? "页面框架"
          : safeFilePart(kindLabel || "测试点");
  return `${label}（${safeFilePart(projectName)}）.xmind`;
}

function openTpFullView({ kind, title, markdown, mindmap }) {
  const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const payload = {
    id,
    kind: kind || "text",
    title: title || "预览",
    markdown: String(markdown || ""),
    mindmap: !!mindmap,
    createdAt: Date.now(),
  };
  try {
    // sessionStorage 不跨标签页共享；必须用 localStorage
    localStorage.setItem(`tp_full_view_${id}`, JSON.stringify(payload));
    localStorage.setItem("tp_full_view_latest", id);
    // 清理 2 小时前的旧预览缓存
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith("tp_full_view_") || k === "tp_full_view_latest") continue;
      try {
        const old = JSON.parse(localStorage.getItem(k) || "{}");
        if (Number(old.createdAt) && Number(old.createdAt) < cutoff) {
          localStorage.removeItem(k);
        }
      } catch {
        localStorage.removeItem(k);
      }
    }
  } catch {
    window.alert("无法打开全页预览（浏览器存储受限，内容可能过大）");
    return;
  }
  const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
  const url = `${window.location.origin}${base}?tpView=${encodeURIComponent(id)}`;
  const win = window.open(url, "_blank");
  if (!win) {
    window.alert("弹窗被拦截，请允许本站打开新窗口后再试");
  }
}

function readTpFullViewPayload() {
  try {
    const sp = new URLSearchParams(window.location.search);
    const id = String(sp.get("tpView") || "").trim();
    if (!id || id === "0") return null;
    let raw =
      id === "1"
        ? null
        : localStorage.getItem(`tp_full_view_${id}`);
    if (!raw && id === "1") {
      const latest = localStorage.getItem("tp_full_view_latest");
      if (latest) raw = localStorage.getItem(`tp_full_view_${latest}`);
    }
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

function TpFullViewPage({ data }) {
  const title = data?.title || "预览";
  const md = String(data?.markdown || "");
  const isMap = !!data?.mindmap;
  return (
    <div className="tp-full-page">
      <header className="tp-full-page-head">
        <div>
          <div className="tp-full-page-badge">全页查看</div>
          <h1>{title}</h1>
          <p className="tp-full-page-hint">
            {isMap ? "脑图可横向滚动查看完整结构" : "全文可滚动完整阅读"}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => {
            try {
              window.close();
            } catch {
              /* ignore */
            }
            // 部分浏览器禁止脚本关页时，退回空白提示
            window.setTimeout(() => {
              if (!window.closed) {
                document.body.innerHTML =
                  '<p style="padding:24px;font-family:sans-serif">可直接关闭本标签页。</p>';
              }
            }, 200);
          }}
        >
          关闭
        </button>
      </header>
      <main className="tp-full-page-body">
        {!md.trim() ? (
          <div className="tp-full-page-empty">暂无内容可预览</div>
        ) : isMap ? (
          <div className="tp-full-page-map">
            <FrameworkMindmap markdown={md} />
          </div>
        ) : (
          <pre className="tp-full-page-pre">{md}</pre>
        )}
      </main>
    </div>
  );
}

function reqImagesPayload(items, cap = 4) {
  return (items || []).slice(0, cap).map(({ dataUrl }) => ({ dataUrl }));
}

function dataUrlToImagePayload(dataUrl) {
  const raw = String(dataUrl || "").trim();
  const m = /^data:(image\/[\w.+-]+);base64,([\s\S]+)$/i.exec(raw);
  if (!m) return null;
  return { mime: m[1], base64: m[2].replace(/\s/g, ""), dataUrl: raw };
}

function projectTitleFromRequirement(req) {
  const t = String(req || "").trim();
  if (!t) return "当前项目";
  const head = t.slice(0, 24) + (t.length > 24 ? "…" : "");
  return `测试 · ${head}`;
}

function buildPmSolutions(req) {
  const t = (req || "").trim();
  const head = t ? t.slice(0, 80) + (t.length > 80 ? "…" : "") : "（请先在左侧填写用户需求）";
  return [
    {
      title: "方案一：MVP 快速落地",
      summary: `围绕「${head}」优先打通最小可用路径，单页演示核心流程，便于快速验证。`,
    },
    {
      title: "方案二：体验增强",
      summary:
        "在 MVP 基础上强化状态反馈、空态与动效，适合对交互细腻度有更高预期的产品形态。",
    },
    {
      title: "方案三：可演进架构",
      summary:
        "模块拆分与配置化预留，主题与接口可替换，为后续增功能、换视觉与接后端打基础。",
    },
  ];
}

function pmVariantFile(idx) {
  return `prototype-${Math.max(0, Math.min(2, Number(idx) || 0))}.html`;
}

function uiVariantFile(idx) {
  return `ui-${Math.max(0, Math.min(2, Number(idx) || 0))}.html`;
}

function buildUiSolutions(req) {
  const t = (req || "").trim();
  const head = t ? t.slice(0, 48) + (t.length > 48 ? "…" : "") : "业务需求";
  return [
    {
      title: "视觉方案 A · 清透极简",
      philosophy:
        "大留白、轻拟物层次与低对比分割线，强调阅读效率与信息分组；主色点缀引导操作。",
      fitFor: `与「${head}」的信息密集型展示相契合。`,
    },
    {
      title: "视觉方案 B · 温润亲和",
      philosophy:
        "圆角与柔和渐变、微动画过渡，营造轻松情绪；适合强调易用与情感连接的产品。",
      fitFor: "偏工具+轻度内容场景，降低学习成本。",
    },
    {
      title: "视觉方案 C · 干练效率",
      philosophy:
        "高密度栅格、强对比与克制动效，突出任务完成路径；适合生产力与专业用户。",
      fitFor: "流程短、操作频繁、强调反馈速度的场景。",
    },
  ];
}

function formatStreamElapsed(sec) {
  const s = Math.max(0, Math.floor(sec));
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m} 分 ${String(r).padStart(2, "0")} 秒`;
}

/** 用流式字数估算「活动度」0–97%，非真实总进度 */
function streamActivityPercent(deltaChars) {
  if (!deltaChars) return 2;
  return Math.min(97, Math.floor(100 * (1 - Math.exp(-deltaChars / 16_500))));
}

/** 流水线五步高亮：0=PM 1=UI 2=FS 3=全栈后待命测试 4=测试进行中/完成 5=运维完成 */
function flowHighlightStep(phase) {
  if (phase === "idle") return -1;
  if (phase === "pm" || phase === "pm_review") return 0;
  if (phase === "ui" || phase === "ui_review") return 1;
  if (phase === "fs") return 2;
  if (phase === "done") return 3;
  if (phase === "qa" || phase === "qa_review") return 4;
  if (phase === "ops" || phase === "ops_review") return 5;
  return -1;
}

const PHASE_STATUS = {
  idle: "待开始 · 填写需求后先「总结需求」",
  pm: "进行中 · 产品经理",
  pm_review: "产品经理完成 · 可追问或进入 UI",
  ui: "进行中 · UI 设计",
  ui_review: "UI 完成 · 可追问或全栈落地",
  fs: "进行中 · 全栈落地",
  done: "全栈完成 · 可测试 / 运维",
  qa: "进行中 · 测试岗",
  qa_review: "测试岗 · 可生成测试点 / Playwright",
  ops: "进行中 · 运维岗",
  ops_review: "运维手册已生成",
};

function phaseStatusText(phase) {
  return PHASE_STATUS[phase] || "—";
}

function kindSectionTitle(kind) {
  if (kind === "smoke") return "冒烟自动化";
  if (kind === "business") return "业务测试点";
  return "功能测试点";
}

function classifyIssueReason(reason) {
  const r = String(reason || "");
  if (r.includes("[静态自检]")) return "static";
  if (r.includes("[Playwright]")) return "pw";
  if (r.includes("LLM") || r.includes("模型")) return "llm";
  return "other";
}

const ISSUE_TAG_LABEL = { static: "静态", pw: "Playwright", llm: "模型", other: "其他" };

function isAbortError(err) {
  if (!err) return false;
  if (err.name === "AbortError") return true;
  const msg = String(err.message || err);
  return /aborted|已取消|The user aborted/i.test(msg);
}

function makeAbortError(msg = "已取消") {
  const e = new Error(msg);
  e.name = "AbortError";
  return e;
}

async function consumeSse(url, body, onEvt, opts = {}) {
  const signal = opts.signal;
  if (signal?.aborted) throw makeAbortError();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const t = await res.text();
    throw new Error(t.slice(0, 500) || `HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const onAbort = () => {
    try {
      reader.cancel();
    } catch {
      /* ignore */
    }
  };
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  const dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      if (signal?.aborted) throw makeAbortError();
      const { value, done } = await reader.read();
      // reader.cancel() 常令 read 以 done:true 结束，不会抛 AbortError —— 必须再查一次
      if (signal?.aborted) throw makeAbortError();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const chunks = buf.split("\n\n");
      buf = chunks.pop() || "";
      for (const block of chunks) {
        if (signal?.aborted) throw makeAbortError();
        for (const line of block.split("\n")) {
          const s = line.trim();
          if (!s.startsWith("data:")) continue;
          const json = s.slice(5).trim();
          if (!json) continue;
          try {
            onEvt(JSON.parse(json));
          } catch (err) {
            // 超大 SSE（旧版把整图 base64 塞进来）会在此静默失败 → 扫描动画不播
            console.warn(
              "[agile-sim sse] JSON 解析失败",
              `len=${json.length}`,
              String(err?.message || err).slice(0, 120),
              json.slice(0, 96)
            );
          }
        }
      }
    }
  } finally {
    if (signal) signal.removeEventListener("abort", onAbort);
  }
  // 流被 cancel 后循环可能「正常」结束，出口再拦一次，避免流水线继续下一步
  if (signal?.aborted) throw makeAbortError();
}

/** 工作台嵌入模式：测试点生成 / 数据验证。嵌入时不得恢复「游戏流水线」本地模式。 */
function readWorkbenchEmbedMode() {
  try {
    const q = new URLSearchParams(window.location.search).get("embed");
    if (q === "data-verify" || q === "standalone-qa") return q;
    const s = sessionStorage.getItem("workbench_embed");
    if (s === "data-verify" || s === "standalone-qa") return s;
  } catch {
    /* ignore */
  }
  return "";
}

export default function App() {
  const tpFullView = useMemo(() => readTpFullViewPayload(), []);
  const tpTracePop = useMemo(() => readTpTracePopoutPayload(), []);
  const workbenchEmbed = useMemo(() => readWorkbenchEmbedMode(), []);
  const [appMode, setAppMode] = useState(() => {
    // 从侧栏进「测试点生成 / 数据验证」时强制 web，避免上次打开游戏流水线后卡在 game
    if (readWorkbenchEmbedMode()) return "web";
    try {
      return localStorage.getItem("agile_sim_app_mode") || "web";
    } catch {
      return "web";
    }
  });
  useEffect(() => {
    if (workbenchEmbed) return;
    try {
      localStorage.setItem("agile_sim_app_mode", appMode);
    } catch {
      /* ignore */
    }
  }, [appMode, workbenchEmbed]);
  if (tpFullView) return <TpFullViewPage data={tpFullView} />;
  if (tpTracePop) {
    return (
      <div className="tp-trace-popout-page">
        <TpTraceWorkbench
          popout
          qaMaterial={tpTracePop.qaMaterial || ""}
          qaFrontUrl={tpTracePop.qaFrontUrl || ""}
          qaBackUrl={tpTracePop.qaBackUrl || ""}
          tpDualMode={!!tpTracePop.tpDualMode}
          qaFrameworkPreview={tpTracePop.qaFrameworkPreview || ""}
          qaMdPreview={tpTracePop.qaMdPreview || ""}
          projectId={tpTracePop.projectId || ""}
          projectName={tpTracePop.projectName || ""}
          recordId={tpTracePop.recordId || ""}
          tpScanStory={tpTracePop.tpScanStory || null}
          apiUrl={apiUrl}
        />
      </div>
    );
  }
  if (appMode === "game" && !workbenchEmbed) {
    return <GameDevPipeline onBack={() => setAppMode("web")} />;
  }
  return (
    <AgileSimApp
      onOpenGamePipeline={workbenchEmbed ? undefined : () => setAppMode("game")}
    />
  );
}

function AgileSimApp({ onOpenGamePipeline }) {
  const [provider, setProvider] = useState(
    () => localStorage.getItem(LS.provider) || "openai"
  );
  const [baseUrl, setBaseUrl] = useState(
    () => localStorage.getItem(LS.baseUrl) || "https://api.openai.com/v1"
  );
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem(LS.apiKey) || ""
  );
  const [cursorApiKey, setCursorApiKey] = useState(
    () => localStorage.getItem(LS.cursorApiKey) || ""
  );
  const [cursorRepoUrl, setCursorRepoUrl] = useState(
    () => localStorage.getItem(LS.cursorRepoUrl) || ""
  );
  const [cursorRepoRef, setCursorRepoRef] = useState(
    () => localStorage.getItem(LS.cursorRepoRef) ?? ""
  );
  const [openaiModel, setOpenaiModel] = useState(() => {
    try {
      return migrateSplitModels().openaiM;
    } catch {
      return "gpt-4o-mini";
    }
  });
  const [cursorModel, setCursorModel] = useState(() => {
    try {
      return migrateSplitModels().cursorM;
    } catch {
      return "composer-2.5";
    }
  });
  const embedMode = useMemo(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("embed");
      if (q === "data-verify" || q === "standalone-qa") return q;
      const s = sessionStorage.getItem("workbench_embed");
      if (s === "data-verify" || s === "standalone-qa") return s;
      return "";
    } catch {
      return "";
    }
  }, []);
  const embedStandaloneQa = embedMode === "standalone-qa";
  const embedDataVerify = embedMode === "data-verify";
  const embedWorkbench = embedStandaloneQa || embedDataVerify;
  const [requirement, setRequirement] = useState(
    "做一个倒数计时器：可设置分钟数，开始后显示剩余时间，可暂停与重置。"
  );
  /** 用户需求区附图 { name, dataUrl }[] */
  const [reqImageItems, setReqImageItems] = useState([]);
  const [pmSpecMd, setPmSpecMd] = useState("");
  const [pmSpecModalOpen, setPmSpecModalOpen] = useState(false);
  const [pmSpecGenerating, setPmSpecGenerating] = useState(false);

  const [sessionId, setSessionId] = useState("");
  const [phase, setPhase] = useState("idle");
  const [liveThought, setLiveThought] = useState("");
  const [logLines, setLogLines] = useState([]);
  /** 右侧主 Tab：产品经理 / UI / 全栈 / 测试 / 运维 / 她自己 */
  const [roleTab, setRoleTab] = useState("pm");
  const [pmSolutionIdx, setPmSolutionIdx] = useState(0);
  const [uiSolutionIdx, setUiSolutionIdx] = useState(0);
  /** 各方案是否已生成可预览 HTML */
  const [pmVariantReady, setPmVariantReady] = useState([false, false, false]);
  const [uiVariantReady, setUiVariantReady] = useState([false, false, false]);
  /** 定稿方案索引；下游角色据此读取 canonical 与变体 */
  const [pmFinalizedIdx, setPmFinalizedIdx] = useState(null);
  const [uiFinalizedIdx, setUiFinalizedIdx] = useState(null);
  /** 当前正在生成的方案 { role: 'pm'|'ui', idx } */
  const [variantBusy, setVariantBusy] = useState(null);
  /** 旧会话仅存在 prototype.html / ui.html 而无变体文件 */
  const [pmFile0IsLegacy, setPmFile0IsLegacy] = useState(false);
  const [uiFile0IsLegacy, setUiFile0IsLegacy] = useState(false);
  const [qaMaterial, setQaMaterial] = useState("");
  /**
   * 双链模式：
   * - off：单链
   * - dual：前后台（会写跨端闭环）
   * - multi：多原型独立（如新商务 v2 + OA 页，禁止当前后台）
   */
  const [tpLinkMode, setTpLinkMode] = useState("off"); // off | dual | multi
  const tpDualMode = tpLinkMode !== "off";
  const [qaFrontUrl, setQaFrontUrl] = useState("");
  const [qaBackUrl, setQaBackUrl] = useState("");
  const [qaDualNotes, setQaDualNotes] = useState("");
  const [qaProtoLabelA, setQaProtoLabelA] = useState("");
  const [qaProtoLabelB, setQaProtoLabelB] = useState("");
  const tpDualSyncLockRef = useRef(false);
  const setTpDualMode = (next) => {
    if (typeof next === "function") {
      setTpLinkMode((prev) => {
        const curOn = prev !== "off";
        const wantOn = next(curOn);
        if (!wantOn) return "off";
        return prev === "off" ? "dual" : prev;
      });
      return;
    }
    setTpLinkMode(next ? (tpLinkMode === "multi" ? "multi" : "dual") : "off");
  };
  const [workbenchProject, setWorkbenchProject] = useState(() => readWorkbenchProject());
  const [ganttPrototypes, setGanttPrototypes] = useState([]);
  const [tpDiffOpen, setTpDiffOpen] = useState(false);
  const [qaStyleHint, setQaStyleHint] = useState("");
  /** 独立测试 / 工作台测试点生成 · Skill（可编辑保存） */
  const [qaSkill, setQaSkill] = useState("");
  const [qaSkillDefault, setQaSkillDefault] = useState("");
  const [tpRecords, setTpRecords] = useState([]);
  const [tpSkillMsg, setTpSkillMsg] = useState("");
  const [tpActiveRecordId, setTpActiveRecordId] = useState("");
  /** { name: string; dataUrl: string }[] */
  const [qaImageItems, setQaImageItems] = useState([]);
  const [qaMdPreview, setQaMdPreview] = useState("");
  /** 独立模式：项目页面框架（XMind 式页面梳理） */
  const [qaFrameworkPreview, setQaFrameworkPreview] = useState("");
  const [qaBizPreview, setQaBizPreview] = useState("");
  const [qaSpecialPreview, setQaSpecialPreview] = useState("");
  /** ①②③合订评审报告（对照原型）；重生成对应步骤时会注入 */
  const [qaReviewPreview, setQaReviewPreview] = useState("");
  /** 评审轮次历史（报告+①②③快照） */
  const [qaReviewHistory, setQaReviewHistory] = useState([]);
  /** 一键流水线真实进度 */
  const [tpAutoPipe, setTpAutoPipe] = useState(null);
  const tpAutoPipeAbortRef = useRef(false);
  /** 一键流水线当前 SSE 的 AbortController；点取消立即 abort */
  const tpAutoPipeAbortCtrlRef = useRef(null);
  /** 仅一键流水线持有 AbortController 时拦截；单步生成不受上次取消残留影响 */
  const assertAutoPipeNotAborted = () => {
    const ctrl = tpAutoPipeAbortCtrlRef.current;
    if (!ctrl) return;
    if (tpAutoPipeAbortRef.current || ctrl.signal.aborted) {
      throw new Error("已取消");
    }
  };
  /** 禅道导入真实进度 */
  const [tpZentaoPipe, setTpZentaoPipe] = useState(null);
  /** 产品系统导入进度（用例 / Bug） */
  const [tpProductPipe, setTpProductPipe] = useState(null);
  const qaFrameworkRef = useRef("");
  const qaBizRef = useRef("");
  const qaSpecialRef = useRef("");
  const qaFuncRef = useRef("");
  const qaReviewRef = useRef("");
  const [qaBusyMode, setQaBusyMode] = useState("");
  const [qaFrameworkView, setQaFrameworkView] = useState("mindmap"); // mindmap | text
  /** 第③步额外生成 Playwright Test .spec.ts */
  const [qaGenPwSpec, setQaGenPwSpec] = useState(() => {
    try {
      return localStorage.getItem("tp_gen_pw_spec") === "1";
    } catch {
      return false;
    }
  });
  const [qaPwSpecPreview, setQaPwSpecPreview] = useState("");
  /** Playwright 跑测用的测试环境地址（可与上方原型 URL 分离） */
  const [qaPwTestBaseUrl, setQaPwTestBaseUrl] = useState(() => {
    try {
      return localStorage.getItem("tp_pw_test_base_url") || "";
    } catch {
      return "";
    }
  });
  /** 测试点生成改版：Skill 默认收起；预览 Tab */
  const [tpSkillOpen, setTpSkillOpen] = useState(false);
  const [tpSkillModalOpen, setTpSkillModalOpen] = useState(false);
  const [tpAssetModalOpen, setTpAssetModalOpen] = useState(false);
  const [tpPreviewTab, setTpPreviewTab] = useState("framework"); // framework | biz | func | special | review | pw
  const [tpScanStory, setTpScanStory] = useState(null);
  const [tpScanFallbackSteps, setTpScanFallbackSteps] = useState(null);
  const [tpScanning, setTpScanning] = useState(false);
  const [openPwBusy, setOpenPwBusy] = useState(false);
  const [tpPwDebugModalOpen, setTpPwDebugModalOpen] = useState(false);
  const [pwDebugChatHistory, setPwDebugChatHistory] = useState([]);
  const [pwDebugChatInput, setPwDebugChatInput] = useState("");
  const [pwDebugChatBusy, setPwDebugChatBusy] = useState(false);
  const [pwDebugPendingSpec, setPwDebugPendingSpec] = useState("");
  const [pwDebugErrorHint, setPwDebugErrorHint] = useState("");
  const [pwDebugAutoApplied, setPwDebugAutoApplied] = useState(false);
  const tpScanAckSentRef = useRef(false);
  const tpDraftTimerRef = useRef(null);
  /** 当前 QA 忙碌模式（SSE 流式里用来把评审 delta 写入预览） */
  const qaBusyModeRef = useRef("");
  const [opsMaterial, setOpsMaterial] = useState("");
  const [opsStyleHint, setOpsStyleHint] = useState("");
  const [opsImageItems, setOpsImageItems] = useState([]);
  const [opsMdPreview, setOpsMdPreview] = useState("");
  /** 5 个角色 Tab 共用的「追问对话」状态：{pm:[...], ui:[...], fs:[...], qa:[...], ops:[...]} */
  const [chatHistory, setChatHistory] = useState({ pm: [], ui: [], fs: [], qa: [], ops: [] });
  const [chatInput, setChatInput] = useState({ pm: "", ui: "", fs: "", qa: "", ops: "" });
  /** 追问附图的 dataUrl 列表，按角色分桶 */
  const [chatImageItems, setChatImageItems] = useState({
    pm: [],
    ui: [],
    fs: [],
    qa: [],
    ops: [],
  });
  /** 测试岗子 Tab：pipeline=敏捷流水线 / standalone=独立对外 */
  const [qaSubTab, setQaSubTab] = useState("pipeline");


  useEffect(() => {
    qaFrameworkRef.current = qaFrameworkPreview;
  }, [qaFrameworkPreview]);
  useEffect(() => {
    qaBizRef.current = qaBizPreview;
  }, [qaBizPreview]);
  useEffect(() => {
    qaSpecialRef.current = qaSpecialPreview;
  }, [qaSpecialPreview]);
  useEffect(() => {
    qaFuncRef.current = qaMdPreview;
  }, [qaMdPreview]);
  useEffect(() => {
    qaReviewRef.current = qaReviewPreview;
  }, [qaReviewPreview]);

  useEffect(() => {
    if (embedStandaloneQa) {
      setRoleTab("qa");
      setQaSubTab("standalone");
      setSessionId("");
      setPhase("idle");
      setPipelineError(null);
      document.title = "测试点生成";
      document.body.classList.add("tp-embed-body");
      return () => document.body.classList.remove("tp-embed-body");
    }
  }, [embedStandaloneQa]);

  useEffect(() => {
    if (!embedStandaloneQa || !qaBusyMode) return;
    if (qaBusyMode === "framework") setTpPreviewTab("framework");
    else if (qaBusyMode === "biz") setTpPreviewTab("biz");
    else if (qaBusyMode === "testpoints") setTpPreviewTab("func");
    else if (qaBusyMode === "special") setTpPreviewTab("special");
    else if (qaBusyMode === "review") setTpPreviewTab("review");
  }, [embedStandaloneQa, qaBusyMode]);

  useEffect(() => {
    try {
      localStorage.setItem("tp_gen_pw_spec", qaGenPwSpec ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [qaGenPwSpec]);

  useEffect(() => {
    try {
      localStorage.setItem("tp_pw_test_base_url", qaPwTestBaseUrl.trim());
    } catch {
      /* ignore */
    }
  }, [qaPwTestBaseUrl]);

  /** 未保存列表时的本地草稿缓存（按 projectId 隔离，避免魁星岩草稿泄漏到宇宙直播等） */
  useEffect(() => {
    if (!embedStandaloneQa) return;
    const d = readTpDraftForProject(workbenchProject.projectId);
    if (!d) return;
    tpDualSyncLockRef.current = true;
    if (d.material) setQaMaterial(String(d.material));
    {
      const parsed = parseDualPrototypeMaterial(d.material || "");
      const mode =
        d.linkMode === "multi" || d.linkMode === "dual" || d.linkMode === "off"
          ? d.linkMode
          : parsed.kind === "multi"
            ? "multi"
            : d.dualMode || parsed.kind === "dual"
              ? "dual"
              : "off";
      setTpLinkMode(mode);
      if (mode !== "off") {
        setQaFrontUrl(String(d.frontUrl || parsed.frontUrl || ""));
        setQaBackUrl(String(d.backUrl || parsed.backUrl || ""));
        setQaDualNotes(String(d.dualNotes != null ? d.dualNotes : parsed.notes || ""));
        setQaProtoLabelA(String(d.protoLabelA || ""));
        setQaProtoLabelB(String(d.protoLabelB || ""));
      } else {
        setQaFrontUrl("");
        setQaBackUrl("");
        setQaDualNotes("");
        setQaProtoLabelA("");
        setQaProtoLabelB("");
      }
    }
    if (d.framework) setQaFrameworkPreview(String(d.framework));
    if (d.biz) setQaBizPreview(String(d.biz));
    if (d.func) setQaMdPreview(String(d.func));
    if (d.special) setQaSpecialPreview(String(d.special));
    if (d.review) setQaReviewPreview(String(d.review));
    if (Array.isArray(d.reviewHistory)) setQaReviewHistory(d.reviewHistory.slice(0, 20));
    if (d.pw) setQaPwSpecPreview(String(d.pw));
    if (Array.isArray(d.images)) setQaImageItems(d.images.slice(0, 6));
    if (d.previewTab) setTpPreviewTab(d.previewTab);
    queueMicrotask(() => {
      tpDualSyncLockRef.current = false;
    });
    // 仅进页恢复一次（以当前 URL 项目为准）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedStandaloneQa, workbenchProject.projectId]);

  /** 双链字段 → 统一写入 qaMaterial，供抓取/生成/存档 */
  useEffect(() => {
    if (!embedStandaloneQa || tpLinkMode === "off" || tpDualSyncLockRef.current) return;
    const next =
      tpLinkMode === "multi"
        ? buildMultiIndependentMaterial(
            qaFrontUrl,
            qaBackUrl,
            qaDualNotes,
            qaProtoLabelA,
            qaProtoLabelB
          )
        : buildDualPrototypeMaterial(qaFrontUrl, qaBackUrl, qaDualNotes);
    setQaMaterial((prev) => (prev === next ? prev : next));
  }, [
    embedStandaloneQa,
    tpLinkMode,
    qaFrontUrl,
    qaBackUrl,
    qaDualNotes,
    qaProtoLabelA,
    qaProtoLabelB,
  ]);

  useEffect(() => {
    if (!embedStandaloneQa) return;
    if (tpDraftTimerRef.current) clearTimeout(tpDraftTimerRef.current);
    tpDraftTimerRef.current = setTimeout(() => {
      try {
        const payload = {
          material: qaMaterial,
          dualMode: tpDualMode,
          linkMode: tpLinkMode,
          frontUrl: qaFrontUrl,
          backUrl: qaBackUrl,
          dualNotes: qaDualNotes,
          protoLabelA: qaProtoLabelA,
          protoLabelB: qaProtoLabelB,
          framework: qaFrameworkPreview,
          biz: qaBizPreview,
          func: qaMdPreview,
          special: qaSpecialPreview,
          review: qaReviewPreview,
          reviewHistory: qaReviewHistory.slice(-10),
          pw: qaPwSpecPreview,
          images: qaImageItems.slice(0, 4).map(({ name, dataUrl }) => ({
            name,
            dataUrl:
              dataUrl.length > 180000
                ? dataUrl.slice(0, 180000)
                : dataUrl,
          })),
          previewTab: tpPreviewTab,
          savedAt: Date.now(),
        };
        writeTpDraftForProject(workbenchProject.projectId, payload);
      } catch {
        /* quota */
      }
    }, 800);
    return () => {
      if (tpDraftTimerRef.current) clearTimeout(tpDraftTimerRef.current);
    };
  }, [
    embedStandaloneQa,
    workbenchProject.projectId,
    qaMaterial,
    tpDualMode,
    tpLinkMode,
    qaFrontUrl,
    qaBackUrl,
    qaDualNotes,
    qaProtoLabelA,
    qaProtoLabelB,
    qaFrameworkPreview,
    qaBizPreview,
    qaMdPreview,
    qaSpecialPreview,
    qaReviewPreview,
    qaReviewHistory,
    qaPwSpecPreview,
    qaImageItems,
    tpPreviewTab,
  ]);

  const ackTpScan = useCallback(async () => {
    if (tpScanAckSentRef.current) return;
    tpScanAckSentRef.current = true;
    setTpScanning(false);
    const sid = sessionFromStreamRef.current || sessionId;
    if (!sid) return;
    try {
      await fetch(apiUrl("/api/qa/scan-ack"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid }),
      });
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  const onPasteQaImages = useCallback((files) => {
    const list = [...(files || [])].slice(0, 8);
    list.forEach((file) => {
      if (!file?.type?.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        if (!dataUrl) return;
        setQaImageItems((prev) =>
          [...prev, { name: file.name || "paste.png", dataUrl }].slice(0, 12)
        );
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const [tpAssetPickerOpen, setTpAssetPickerOpen] = useState(false);
  const [tpAssetList, setTpAssetList] = useState([]);
  const [tpAssetQuery, setTpAssetQuery] = useState("");
  const [tpAssetLoading, setTpAssetLoading] = useState(false);
  const [pipelineTestPoints, setPipelineTestPoints] = useState([]);
  const [pipelineActiveIdx, setPipelineActiveIdx] = useState(0);
  const [pipelineTestIssues, setPipelineTestIssues] = useState([]);
  const [pipelineTesting, setPipelineTesting] = useState(false);
  const [pipelineTestingIdx, setPipelineTestingIdx] = useState(-1);
  const [pipelineTestProgress, setPipelineTestProgress] = useState({
    current: 0,
    total: 0,
    title: "",
  });
  const [pipelineGenerating, setPipelineGenerating] = useState(false);

  useEffect(() => {
    if (!embedStandaloneQa) return;
    let cancelled = false;

    function applyTpImportPayload(payload, extraCtx) {
      if (!payload || typeof payload !== "object") return;
      const url = decodeUrlsInText(String(payload.url || "").trim());
      const note = String(payload.note || "").trim();
      const name = String(payload.name || "").trim();
      const text = decodeUrlsInText(String(payload.text || "").trim());
      const ctx = extraCtx && typeof extraCtx === "object" ? extraCtx : {};
      if (payload.projectId || ctx.projectId) {
        setWorkbenchProject((prev) => ({
          ...prev,
          projectId: String(payload.projectId || ctx.projectId || prev.projectId || ""),
          projectName: String(payload.projectName || ctx.projectName || prev.projectName || ""),
          assetId: String(payload.assetId || ctx.assetId || prev.assetId || ""),
          ganttProjectIds: Array.isArray(ctx.ganttProjectIds)
            ? ctx.ganttProjectIds
            : Array.isArray(payload.ganttProjectIds)
              ? payload.ganttProjectIds
              : prev.ganttProjectIds || [],
        }));
      }
      const parts = [];
      if (url) parts.push(url);
      else if (name) parts.push(`【资产】${name}`);
      if (note && note !== url) parts.push(note);
      if (text) parts.push(text);
      if (parts.length) setQaMaterial(parts.join("\n\n"));
    }

    (async () => {
      try {
        const data = await workbenchApi("/api/test-point-gen/state");
        if (cancelled) return;
        const saved = String(data.skill || "").trim();
        const fallback = String(data.defaultSkill || "").trim();
        setQaSkillDefault(fallback);
        setQaSkill(saved || fallback);
        setTpRecords(Array.isArray(data.records) ? data.records : []);
      } catch {
        /* 工作台 API 不可用时仍可生成（服务端用内置默认 Skill） */
      }
      try {
        const raw = sessionStorage.getItem("tp_gen_import");
        if (!raw || cancelled) return;
        sessionStorage.removeItem("tp_gen_import");
        applyTpImportPayload(JSON.parse(raw), readWorkbenchProject());
      } catch {
        /* ignore */
      }
    })();

    function onMsg(ev) {
      const data = ev?.data;
      if (!data || data.type !== "workbench-tp-context") return;
      if (data.context?.projectId) {
        setWorkbenchProject((prev) => ({
          ...prev,
          projectId: String(data.context.projectId || prev.projectId || ""),
          projectName: String(data.context.projectName || prev.projectName || ""),
          assetId: String(data.context.assetId || prev.assetId || ""),
          ganttProjectIds: Array.isArray(data.context.ganttProjectIds)
            ? data.context.ganttProjectIds
            : prev.ganttProjectIds || [],
        }));
      }
      if (Array.isArray(data.prototypes) && data.prototypes.length) {
        setGanttPrototypes((prev) => {
          const seen = new Set(prev.map((x) => x.url));
          const merged = [...prev];
          for (const it of data.prototypes) {
            if (!it?.url || seen.has(it.url)) continue;
            seen.add(it.url);
            merged.push(it);
          }
          return merged.length ? merged : prev;
        });
      }
      if (data.importPayload) {
        try {
          sessionStorage.removeItem("tp_gen_import");
        } catch {
          /* ignore */
        }
        applyTpImportPayload(data.importPayload, data.context);
      }
    }
    window.addEventListener("message", onMsg);
    return () => {
      cancelled = true;
      window.removeEventListener("message", onMsg);
    };
  }, [embedStandaloneQa]);

  useEffect(() => {
    if (!embedStandaloneQa) return;
    const ids = workbenchProject.ganttProjectIds || [];
    const localItems = collectGanttPrototypes(ids);
    if (localItems.length) setGanttPrototypes(localItems);
    if (!workbenchProject.projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await workbenchApi(
          `/api/projects/${encodeURIComponent(workbenchProject.projectId)}/prototypes`
        );
        if (cancelled || !Array.isArray(r?.items) || !r.items.length) return;
        setGanttPrototypes((prev) => {
          const seen = new Set(prev.map((x) => x.url));
          const merged = [...prev];
          for (const it of r.items) {
            if (!it.url || seen.has(it.url)) continue;
            seen.add(it.url);
            merged.push(it);
          }
          return merged.length ? merged : prev;
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [embedStandaloneQa, workbenchProject.projectId, workbenchProject.ganttProjectIds]);
  /** 单独的 chat 进行中标记，避免与主流水线 busy 互相干扰 */
  const [chatBusyRole, setChatBusyRole] = useState("");
  /** 最近一次全栈落地时的方案快照，用于「确认变动」 */
  const [fsAppliedSnapshot, setFsAppliedSnapshot] = useState(null);
  const [outputDir, setOutputDir] = useState("");
  const [busyLabel, setBusyLabel] = useState("");
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(true);
  const [overlayCompact, setOverlayCompact] = useState(false);
  const logScrollRef = useRef(null);
  /** 避免 iframe / fetch 在文件写入前就 404 后被浏览器缓存，导致成功后仍显示 Cannot GET */
  const [previewBust, setPreviewBust] = useState(0);
  const [historyRecords, setHistoryRecords] = useState(() => {
    try {
      const raw = localStorage.getItem(LS.projectHistory);
      const a = raw ? JSON.parse(raw) : [];
      return Array.isArray(a) ? a : [];
    } catch {
      return [];
    }
  });
  const [historyDetail, setHistoryDetail] = useState(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  /** 整段流水线进行中（含读文件、等 SSE），避免遮罩仅在 phase 切换时闪一下 */
  const [pipeActive, setPipeActive] = useState(false);
  /** 最近一次流水线失败（含服务端 SSE error 事件），便于看清「一闪而过」的原因 */
  const [pipelineError, setPipelineError] = useState(null);

  /** 遮罩层流式进度（ref 高频更新，用 tick 定时刷到界面） */
  const streamMetricsRef = useRef({
    startedAt: 0,
    deltaChars: 0,
    lastLines: [],
  });
  const [sseUiTick, setSseUiTick] = useState(0);
  /** SSE meta 下发的 sessionId（避免刚结束流式时 React state 仍未更新导致读不到会话） */
  const sessionFromStreamRef = useRef("");

  const requirementRef = useRef(requirement);
  const pmSolutionIdxRef = useRef(pmSolutionIdx);
  const uiSolutionIdxRef = useRef(uiSolutionIdx);
  useEffect(() => {
    requirementRef.current = requirement;
  }, [requirement]);
  useEffect(() => {
    pmSolutionIdxRef.current = pmSolutionIdx;
  }, [pmSolutionIdx]);
  useEffect(() => {
    uiSolutionIdxRef.current = uiSolutionIdx;
  }, [uiSolutionIdx]);

  const buildPlanSnapshot = useCallback(() => {
    return JSON.stringify({
      requirement: requirement.trim(),
      pm: pmFinalizedIdx ?? pmSolutionIdx,
      ui: uiFinalizedIdx ?? uiSolutionIdx,
      pmFinalized: pmFinalizedIdx,
      uiFinalized: uiFinalizedIdx,
    });
  }, [requirement, pmSolutionIdx, uiSolutionIdx, pmFinalizedIdx, uiFinalizedIdx]);

  const pmSolutions = useMemo(() => buildPmSolutions(requirement), [requirement]);
  const uiSolutions = useMemo(() => buildUiSolutions(requirement), [requirement]);

  const refreshSessionArtifacts = useCallback(async (sid) => {
    if (!sid) return;
    const bust = Date.now();
    const headOk = async (rel) => {
      try {
        const r = await fetch(
          apiUrl(`/generated/${encodeURIComponent(sid)}/${rel}?bust=${bust}`)
        );
        return r.ok;
      } catch {
        return false;
      }
    };
    const pmReady = [false, false, false];
    const uiReady = [false, false, false];
    for (let i = 0; i < 3; i++) {
      pmReady[i] = await headOk(pmVariantFile(i));
      uiReady[i] = await headOk(uiVariantFile(i));
    }
    const hasPm0 = pmReady[0];
    const hasPmLegacy = await headOk("prototype.html");
    if (!hasPm0 && hasPmLegacy) pmReady[0] = true;
    setPmFile0IsLegacy(!hasPm0 && hasPmLegacy);

    const hasUi0 = uiReady[0];
    const hasUiLegacy = await headOk("ui.html");
    if (!hasUi0 && hasUiLegacy) uiReady[0] = true;
    setUiFile0IsLegacy(!hasUi0 && hasUiLegacy);

    setPmVariantReady(pmReady);
    setUiVariantReady(uiReady);
    try {
      const r = await fetch(
        apiUrl(`/generated/${encodeURIComponent(sid)}/plan.json?bust=${bust}`)
      );
      if (r.ok) {
        const plan = await r.json();
        if (plan.pmFinalized != null) setPmFinalizedIdx(plan.pmFinalized);
        if (plan.uiFinalized != null) setUiFinalizedIdx(plan.uiFinalized);
      }
    } catch {
      /* ignore */
    }
    try {
      const r = await fetch(
        apiUrl(`/generated/${encodeURIComponent(sid)}/需求文档.md?bust=${bust}`)
      );
      if (r.ok) setPmSpecMd(await r.text());
      else setPmSpecMd("");
    } catch {
      setPmSpecMd("");
    }
  }, []);

  useEffect(() => {
    refreshSessionArtifacts(sessionId);
  }, [sessionId, previewBust, refreshSessionArtifacts]);

  const appendHistoryRecord = useCallback((rec) => {
    setHistoryRecords((prev) => {
      const item = {
        sessionId: rec.sessionId,
        outputDir: rec.outputDir,
        requirement: rec.requirement,
        finishedAt: rec.finishedAt || Date.now(),
      };
      const next = [
        item,
        ...prev.filter((r) => r.sessionId !== item.sessionId),
      ].slice(0, 40);
      try {
        localStorage.setItem(LS.projectHistory, JSON.stringify(next));
      } catch {
        /* ignore quota */
      }
      return next;
    });
  }, []);

  const config = useMemo(
    () => ({
      provider: provider === "cursor" ? "cursor" : "openai",
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      cursorApiKey: cursorApiKey.trim(),
      cursorRepoUrl: cursorRepoUrl.trim(),
      cursorRepoRef: cursorRepoRef.trim(),
      /** 当前推理后端使用的 Model ID */
      model: (provider === "cursor" ? cursorModel : openaiModel).trim(),
      /** Cursor 识图专用：始终走 OpenAI 兼容侧的模型，勿与 Cursor Model ID 混用 */
      visionModel: openaiModel.trim(),
    }),
    [
      provider,
      baseUrl,
      apiKey,
      cursorApiKey,
      cursorRepoUrl,
      cursorRepoRef,
      openaiModel,
      cursorModel,
    ]
  );

  const configSummary = useMemo(() => {
    if (provider === "cursor") {
      const r = cursorRepoUrl.trim();
      return `Cursor · ${cursorModel.trim() || "默认模型"}${r ? "" : " · 未填仓库"}`;
    }
    return `OpenAI 兼容 · ${openaiModel.trim() || "默认模型"}`;
  }, [provider, openaiModel, cursorModel, cursorRepoUrl]);

  useEffect(() => {
    localStorage.setItem(LS.provider, provider);
  }, [provider]);
  useEffect(() => {
    localStorage.setItem(LS.baseUrl, baseUrl);
  }, [baseUrl]);
  useEffect(() => {
    localStorage.setItem(LS.apiKey, apiKey);
  }, [apiKey]);
  useEffect(() => {
    localStorage.setItem(LS.cursorApiKey, cursorApiKey);
  }, [cursorApiKey]);
  useEffect(() => {
    localStorage.setItem(LS.cursorRepoUrl, cursorRepoUrl);
  }, [cursorRepoUrl]);
  useEffect(() => {
    localStorage.setItem(LS.cursorRepoRef, cursorRepoRef);
  }, [cursorRepoRef]);
  useEffect(() => {
    localStorage.setItem(LS.openaiModel, openaiModel);
    localStorage.setItem(LS.model, openaiModel);
  }, [openaiModel]);
  useEffect(() => {
    let m = cursorModel;
    if (m === "composer-2" || m === "composer2" || m === "composer-2-fast") {
      m = "composer-2.5";
      setCursorModel(m);
    }
    localStorage.setItem(LS.cursorModel, m);
  }, [cursorModel]);

  useEffect(() => {
    if (provider === "cursor") return;
    syncOpenAiConfigToWorkbenchSprite({
      baseUrl,
      model: openaiModel,
      apiKey,
    });
  }, [provider, baseUrl, openaiModel, apiKey]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (historyDetail) setHistoryDetail(null);
      else if (historyModalOpen) setHistoryModalOpen(false);
      else if (pmSpecModalOpen) setPmSpecModalOpen(false);
      else if (tpPwDebugModalOpen) setTpPwDebugModalOpen(false);
      else if (configModalOpen) setConfigModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [historyDetail, historyModalOpen, pmSpecModalOpen, tpPwDebugModalOpen, configModalOpen]);

  const checkBackendHealth = useCallback(async () => {
    try {
      const r = await fetch(apiUrl("/api/health"));
      const j = await r.json();
      window.alert(
        (j.hint ? `${j.hint}\n\n` : "") +
          `ok=${j.ok} · pipelineDebug=${j.pipelineDebug}\n生成目录: ${j.generatedDir ?? ""}\nskills 目录: ${j.skillsDir ?? ""}`
      );
    } catch (e) {
      window.alert(
        `无法访问 ${apiUrl("/api/health")}：${e.message || e}\n请确认已 npm run dev 且本机 5180 已监听。`
      );
    }
  }, []);

  const listCursorVisibleRepos = useCallback(async () => {
    const key = cursorApiKey.trim();
    if (!key) {
      window.alert("请先在弹层里填写 Cursor API Key");
      return;
    }
    try {
      const r = await fetch(apiUrl("/api/debug/cursor-repositories"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cursorApiKey: key }),
      });
      const t = await r.text();
      if (!r.ok) {
        window.alert(`列出仓库失败 HTTP ${r.status}:\n${t.slice(0, 1200)}`);
        return;
      }
      const j = JSON.parse(t);
      const lines = (j.items || []).map((x) => x.url).filter(Boolean);
      window.alert(
        `${j.note || ""}\n\n本 Key 当前可见 ${j.total ?? lines.length} 个仓库（最多展示 80 条）：\n\n${lines.join("\n") || "(无 — 请到 Integrations 授权 GitHub 仓库)"}`
      );
    } catch (e) {
      window.alert(String(e.message || e));
    }
  }, [cursorApiKey]);

  const listCursorModels = useCallback(async () => {
    const key = cursorApiKey.trim();
    if (!key) {
      window.alert("请先在弹层里填写 Cursor API Key");
      return;
    }
    try {
      const r = await fetch(apiUrl("/api/debug/cursor-models"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cursorApiKey: key }),
      });
      const t = await r.text();
      if (!r.ok) {
        window.alert(`列出模型失败 HTTP ${r.status}:\n${t.slice(0, 1200)}`);
        return;
      }
      const j = JSON.parse(t);
      const ids = j.ids || [];
      window.alert(
        `${j.note || ""}\n\n本 Key 可用 ${j.total ?? ids.length} 个模型 id（最多展示 80 条）：\n\n${ids.join("\n") || "(空 — 可留空 Model ID 或填 composer-2.5)"}`
      );
    } catch (e) {
      window.alert(String(e.message || e));
    }
  }, [cursorApiKey]);

  const pushLog = useCallback((text, muted) => {
    setLogLines((prev) => [
      ...prev,
      { t: Date.now(), text: String(text), muted: !!muted },
    ]);
  }, []);

  const openPlaywrightUi = useCallback(async () => {
    const ts = String(qaPwSpecPreview || "").trim();
    if (!ts) return alert("请先生成 Playwright .spec.ts");
    const testUrl = String(qaPwTestBaseUrl || "").trim();
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return window.alert("请填写 Cursor API Key");
      if (!config.cursorRepoUrl) return window.alert("Cursor Cloud 需要已授权仓库 URL");
    } else if (!config.apiKey) {
      return window.alert("请填写 API Key");
    }

    setOpenPwBusy(true);
    setTpPreviewTab("pw");
    setTpPwDebugModalOpen(true);
    setPwDebugAutoApplied(false);
    setPwDebugPendingSpec("");
    setPwDebugErrorHint("正在自动跑测 → 审查 → 修复…");
    setPwDebugChatHistory([
      {
        role: "user",
        content:
          "【自动】打开 Playwright 后先无头跑一遍；判断是网页问题还是用例问题；能修就给出完整修复版并自动应用。",
      },
      { role: "assistant", content: "开始自动跑测…" },
    ]);
    setPwDebugChatBusy(true);

    let assistantBuf = "开始自动跑测…\n";
    const updateAssistant = (delta) => {
      assistantBuf += delta;
      setPwDebugChatHistory((prev) => {
        const arr = [...prev];
        const last = arr[arr.length - 1];
        if (last?.role === "assistant") {
          arr[arr.length - 1] = { role: "assistant", content: assistantBuf };
        }
        return arr;
      });
    };

    try {
      await consumeSse(
        apiUrl("/api/qa/pw-auto-fix"),
        {
          typescript: ts,
          baseUrl: testUrl || undefined,
          material: qaMaterial,
          config,
          openUi: true,
        },
        (evt) => {
          if (evt.type === "delta" && evt.text) updateAssistant(evt.text);
          if (evt.type === "thought" && evt.text) {
            const t = String(evt.text).trim();
            pushLog(t, true);
            setPwDebugErrorHint(t.slice(0, 160));
            updateAssistant(`\n${t}\n`);
          }
          if (evt.type === "exec" && evt.label) {
            pushLog(`执行：${evt.label}`, true);
            updateAssistant(`\n▸ ${evt.label}\n`);
          }
          if (evt.type === "qa_playwright_spec" && evt.typescript) {
            const fixed = String(evt.typescript);
            setQaPwSpecPreview(fixed);
            setPwDebugPendingSpec("");
            setPwDebugAutoApplied(true);
            setPwDebugErrorHint("已自动把修复版应用到预览与 tests/playwright.spec.ts");
            pushLog("自动修复版 .spec.ts 已应用到预览", true);
          }
          if (evt.type === "error") {
            updateAssistant(`\n\n[错误] ${evt.message}`);
          }
          if (evt.type === "done") {
            if (evt.passed) {
              setPwDebugErrorHint("自动跑测全部通过，无需修复");
            } else if (evt.fixed) {
              setPwDebugErrorHint((h) =>
                /已自动/.test(h || "")
                  ? h
                  : "审查完成；若有修复稿已自动应用，可在 PW UI 里复验"
              );
            }
          }
        }
      );
    } catch (e) {
      updateAssistant(`\n\n[请求失败] ${String(e?.message || e)}`);
      window.alert(String(e?.message || e));
    } finally {
      setPwDebugChatBusy(false);
      setOpenPwBusy(false);
    }
  }, [
    qaPwSpecPreview,
    qaPwTestBaseUrl,
    qaMaterial,
    config,
    pushLog,
  ]);

  const fetchPwLatestErrors = useCallback(async () => {
    try {
      const r = await fetch(apiUrl("/api/qa/pw-latest-errors"));
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "读取失败");
      const n = j.count || 0;
      setPwDebugErrorHint(
        n
          ? `已找到 ${n} 份最近失败报告（发送对话时会自动带上全文）`
          : "暂无 test-results 报错；请先跑一遍 Playwright，或在对话里粘贴 Errors"
      );
    } catch (e) {
      setPwDebugErrorHint(`拉取失败：${String(e?.message || e)}`);
    }
  }, []);

  const sendPwDebugChat = useCallback(async () => {
    const text = String(pwDebugChatInput || "").trim();
    if (!text || pwDebugChatBusy) return;
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return window.alert("请填写 Cursor API Key");
      if (!config.cursorRepoUrl) return window.alert("Cursor Cloud 需要已授权仓库 URL");
    } else if (!config.apiKey) {
      return window.alert("请填写 API Key");
    }

    setPwDebugChatBusy(true);
    setPwDebugPendingSpec("");
    setPwDebugChatHistory((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);
    setPwDebugChatInput("");

    let assistantBuf = "";
    const updateAssistant = (delta) => {
      assistantBuf += delta;
      setPwDebugChatHistory((prev) => {
        const arr = [...prev];
        const last = arr[arr.length - 1];
        if (last?.role === "assistant") {
          arr[arr.length - 1] = { role: "assistant", content: assistantBuf };
        }
        return arr;
      });
    };

    try {
      await consumeSse(
        apiUrl("/api/qa/pw-debug-chat"),
        {
          message: text,
          typescript: qaPwSpecPreview,
          baseUrl: String(qaPwTestBaseUrl || "").trim() || undefined,
          material: qaMaterial,
          history: pwDebugChatHistory.slice(-8),
          config,
        },
        (evt) => {
          if (evt.type === "delta" && evt.text) updateAssistant(evt.text);
          if (evt.type === "thought" && evt.text) {
            pushLog(String(evt.text).trim(), true);
            if (/失败报告|test-results/i.test(evt.text)) {
              setPwDebugErrorHint(String(evt.text).trim());
            }
          }
          if (evt.type === "qa_playwright_spec" && evt.typescript) {
            setPwDebugPendingSpec(String(evt.typescript));
          }
          if (evt.type === "error") {
            updateAssistant(`\n\n[错误] ${evt.message}`);
          }
        }
      );
    } catch (e) {
      updateAssistant(`\n\n[请求失败] ${String(e?.message || e)}`);
    } finally {
      setPwDebugChatBusy(false);
    }
  }, [
    pwDebugChatInput,
    pwDebugChatBusy,
    pwDebugChatHistory,
    config,
    qaPwSpecPreview,
    qaPwTestBaseUrl,
    qaMaterial,
    pushLog,
  ]);

  const applyPwDebugSpec = useCallback(() => {
    const ts = String(pwDebugPendingSpec || "").trim();
    if (!ts) return;
    setQaPwSpecPreview(ts);
    setTpPreviewTab("pw");
    setPwDebugPendingSpec("");
    setPwDebugAutoApplied(true);
    pushLog("已将调试修复后的 playwright.spec.ts 应用到预览", true);
  }, [pwDebugPendingSpec, pushLog]);

  const openFolderInExplorer = useCallback(
    async (relativePath) => {
      let normalized = String(relativePath || "").replace(/\\/g, "/").trim();
      if (!normalized.startsWith("generated/") && sessionId) {
        normalized = `generated/${sessionId}/app`;
      }
      if (/\.(js|html|css)$/i.test(normalized)) {
        normalized = normalized.replace(/\/[^/]+\.(js|html|css)$/i, "/app");
      }
      if (!/\/app\/?$/i.test(normalized)) {
        normalized = `${normalized.replace(/\/$/, "")}/app`;
      }
      if (!normalized.startsWith("generated/")) {
        window.alert("只能打开 generated 下的路径");
        return;
      }
      const sid =
        sessionId ||
        (normalized.match(/^generated\/([^/]+)\//)?.[1] ?? "");
      try {
        const r = await fetch(apiUrl("/api/open-folder"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            relativePath: normalized,
            sessionId: sid || undefined,
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          window.alert(j.error || `打开失败 HTTP ${r.status}`);
          return;
        }
        const opened = j.openedAbs || j.path || normalized;
        pushLog(`已在资源管理器中打开：${opened}`, true);
        try {
          await navigator.clipboard.writeText(String(opened));
          window.alert(
            `已打开文件夹（若未看到窗口，请检查任务栏是否多了「文件资源管理器」）：\n\n${opened}\n\n路径已复制到剪贴板。`
          );
        } catch {
          window.alert(
            `已请求打开文件夹：\n\n${opened}\n\n若仍无窗口，请手动在资源管理器地址栏粘贴上述路径。`
          );
        }
      } catch (e) {
        window.alert(String(e.message || e));
      }
    },
    [sessionId, pushLog]
  );

  const resetPipeline = () => {
    setSessionId("");
    setPhase("idle");
    setLiveThought("");
    setLogLines([]);
    setOutputDir("");
    setRoleTab("pm");
    setReqImageItems([]);
    setPmSpecMd("");
    setPmSpecModalOpen(false);
    setPmSpecGenerating(false);
    setPmSolutionIdx(0);
    setUiSolutionIdx(0);
    setPmVariantReady([false, false, false]);
    setUiVariantReady([false, false, false]);
    setPmFinalizedIdx(null);
    setUiFinalizedIdx(null);
    setVariantBusy(null);
    setPmFile0IsLegacy(false);
    setUiFile0IsLegacy(false);
    setQaMaterial("");
    setQaStyleHint("");
    setQaImageItems([]);
    setQaMdPreview("");
    setQaPwSpecPreview("");
    setOpsMaterial("");
    setOpsStyleHint("");
    setOpsImageItems([]);
    setOpsMdPreview("");
    setChatHistory({ pm: [], ui: [], fs: [], qa: [], ops: [] });
    setChatInput({ pm: "", ui: "", fs: "", qa: "", ops: "" });
    setChatBusyRole("");
    sessionFromStreamRef.current = "";
    setFsAppliedSnapshot(null);
    setBusyLabel("");
    setPreviewBust(0);
    streamMetricsRef.current = {
      startedAt: 0,
      deltaChars: 0,
      lastLines: [],
    };
    setSseUiTick(0);
    setPipeActive(false);
    setPipelineError(null);
  };

  const beginStreamTracking = () => {
    setPipelineError(null);
    streamMetricsRef.current = {
      startedAt: Date.now(),
      deltaChars: 0,
      lastLines: [],
    };
    setSseUiTick(0);
  };

  const attachSseHandlers = useCallback(
    () => {
      let deltaBuf = "";
      let deltaMilestone = 0;
      let lastStreamError = "";
      let reviewMdFromEvt = "";
      let streamQaMode = "";
      const pushRecent = (text) => {
        const s = String(text).replace(/\s+/g, " ").trim().slice(0, 96);
        if (!s) return;
        const m = streamMetricsRef.current;
        m.lastLines = [...m.lastLines.slice(-8), s];
      };
      return {
        onEvent: async (evt) => {
          const m = streamMetricsRef.current;
          if (evt.type === "meta" && evt.sessionId) {
            setSessionId(evt.sessionId);
            sessionFromStreamRef.current = evt.sessionId;
            if (evt.qaMode) streamQaMode = String(evt.qaMode);
            pushRecent(`会话 ${evt.sessionId.slice(0, 24)}…`);
            pushLog(`会话 ${evt.sessionId} · 阶段 ${evt.phase}`, true);
          }
          if (evt.type === "thought") {
            pushLog(evt.text, false);
            setLiveThought((p) => p + evt.text);
            pushRecent(evt.text);
          }
          if (evt.type === "step") {
            setBusyLabel(evt.label || "");
            pushRecent(evt.label || "步骤更新");
            pushLog(`▸ ${evt.label}`, true);
          }
          if (evt.type === "delta" && evt.text) {
            deltaBuf += evt.text;
            const add = evt.text.length;
            m.deltaChars += add;
            const bracket = Math.floor(m.deltaChars / 8000);
            if (bracket > deltaMilestone) {
              deltaMilestone = bracket;
              pushRecent(
                `流式文本累计约 ${m.deltaChars.toLocaleString("zh-CN")} 字`
              );
            }
            setLiveThought((p) => p + evt.text);
            // 评审：边流式边写入预览，避免只依赖末尾大包 JSON（易解析失败）
            if (streamQaMode === "review") {
              setQaReviewPreview((p) => {
                const next = p + evt.text;
                qaReviewRef.current = next;
                return next;
              });
            }
          }
          if (evt.type === "exec") {
            pushLog(`执行：${evt.label}`, true);
            pushRecent(evt.label || "执行");
          }
          if (evt.type === "artifact") {
            pushLog(
              `产出：${evt.name}${
                evt.preview
                  ? `（${String(evt.preview).slice(0, 160)}${String(evt.preview).length > 160 ? "…" : ""}）`
                  : ""
              }`,
              true
            );
            pushRecent(`产出 ${evt.name}`);
          }
          if (evt.type === "qa_framework" && evt.markdown) {
            const md = cleanGeneratedMd(evt.markdown);
            qaFrameworkRef.current = md;
            setQaFrameworkPreview(md);
            pushLog("项目页面框架已更新", true);
            pushRecent("页面框架已生成");
          }
          if (evt.type === "qa_biz" && evt.markdown) {
            const md = cleanGeneratedMd(evt.markdown);
            qaBizRef.current = md;
            setQaBizPreview(md);
            pushLog("业务场景测试点已更新", true);
            pushRecent("业务场景已生成");
          }
          if (evt.type === "qa_special" && evt.markdown) {
            const md = cleanGeneratedMd(evt.markdown);
            qaSpecialRef.current = md;
            setQaSpecialPreview(md);
            pushLog("专项测试点已更新", true);
            pushRecent("专项测试已生成");
          }
          if (evt.type === "qa_review" && evt.markdown) {
            reviewMdFromEvt = String(evt.markdown);
            const md = cleanGeneratedMd(evt.markdown);
            qaReviewRef.current = md;
            setQaReviewPreview(md);
            setTpPreviewTab("review");
            pushLog("测试点评审报告（①②③④）已更新", true);
            pushRecent("评审报告已生成");
          }
          if (evt.type === "qa_points" && Array.isArray(evt.points)) {
            setPipelineTestPoints(evt.points);
            setPipelineActiveIdx(0);
            if (evt.count > 0) {
              pushLog(`测试点列表已更新（${evt.count} 条）`, true);
            }
          }
          if (evt.type === "qa_playwright_spec" && evt.typescript) {
            setQaPwSpecPreview(String(evt.typescript));
            setTpPreviewTab("pw");
            pushLog("Playwright Test（playwright.spec.ts）已生成", true);
            pushRecent("Playwright Spec 已生成");
          }
          if (evt.type === "done" && evt.qaMode) {
            streamQaMode = String(evt.qaMode);
          }
          if (evt.type === "qa_scan_story") {
            if (evt.sessionId) {
              setSessionId(evt.sessionId);
              sessionFromStreamRef.current = evt.sessionId;
            }
            tpScanAckSentRef.current = false;
            setTpScanFallbackSteps(null);
            const shotUrl = String(evt.screenshotUrl || "").trim();
            const shotData = String(evt.screenshot || "").trim();
            const resolvedShot = shotUrl
              ? apiUrl(shotUrl.startsWith("/") ? shotUrl : `/${shotUrl}`)
              : shotData;
            const regions = Array.isArray(evt.regions) ? evt.regions : [];
            console.info("[tp-scan] qa_scan_story", {
              regions: regions.length,
              shot: resolvedShot ? String(resolvedShot).slice(0, 120) : "(none)",
            });
            setTpScanStory({
              screenshot: resolvedShot,
              regions,
              viewport: evt.viewport || { w: 1440, h: 900 },
            });
            setTpScanning(true);
            setTpPreviewTab("framework");
            pushLog(`结构扫描：${regions.length} 个模块`, true);
            pushRecent("开始扫描原型结构");
          }
          if (evt.type === "qa_scan_fallback") {
            if (evt.sessionId) {
              setSessionId(evt.sessionId);
              sessionFromStreamRef.current = evt.sessionId;
            }
            tpScanAckSentRef.current = false;
            setTpScanStory(null);
            setTpScanFallbackSteps(
              Array.isArray(evt.steps) ? evt.steps : ["生成页面框架"]
            );
            setTpScanning(true);
            setTpPreviewTab("framework");
            pushLog("无截图，使用步骤条过渡", true);
          }
          if (evt.type === "error") {
            lastStreamError = String(evt.message || "");
            pushLog(`错误：${evt.message}`, false);
            pushRecent(`错误：${String(evt.message).slice(0, 80)}`);
          }
          if (evt.type === "done") {
            if (evt.qaMode) streamQaMode = String(evt.qaMode);
            if (evt.outputDir) setOutputDir(evt.outputDir);
            setBusyLabel("");
            if (evt.outputDir && evt.phase === "fullstack") {
              setFsAppliedSnapshot(
                JSON.stringify({
                  requirement: requirementRef.current.trim(),
                  pm: pmSolutionIdxRef.current,
                  ui: uiSolutionIdxRef.current,
                })
              );
              appendHistoryRecord({
                sessionId: evt.sessionId,
                outputDir: evt.outputDir,
                requirement: requirementRef.current.trim(),
                finishedAt: Date.now(),
              });
            }
          }
        },
        flushDeltaLog: () => {
          if (deltaBuf.trim()) {
            pushLog("[本段流式输出结束，已写入生成目录]", true);
          }
          deltaBuf = "";
          setLiveThought("");
        },
        getStreamError: () => lastStreamError,
        getReviewMd: () => reviewMdFromEvt || (streamQaMode === "review" ? deltaBuf : ""),
        getStreamQaMode: () => streamQaMode,
      };
    },
    [pushLog, appendHistoryRecord]
  );

  useEffect(() => {
    if (!sessionId) setFsAppliedSnapshot(null);
  }, [sessionId]);

  const loadPmSpecMd = useCallback(async (sid) => {
    const id = sid || sessionId || sessionFromStreamRef.current;
    if (!id) return;
    try {
      const r = await fetch(
        apiUrl(
          `/generated/${encodeURIComponent(id)}/需求文档.md?bust=${Date.now()}`
        )
      );
      if (r.ok) setPmSpecMd(await r.text());
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  const generatePmSpec = async () => {
    if (!requirement.trim() && !reqImageItems.length) {
      return alert("请先填写需求，或粘贴/上传参考图");
    }
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return alert("请填写 Cursor API Key");
      if (!config.cursorRepoUrl)
        return alert("Cursor Cloud 需要已连接 GitHub 的仓库地址");
    } else if (!config.apiKey) {
      return alert("请填写 OpenAI 兼容 API Key");
    }
    setPmSpecGenerating(true);
    setPipeActive(true);
    setPipelineError(null);
    beginStreamTracking();
    const h = attachSseHandlers();
    setBusyLabel("产品经理 · 总结需求");
    setLiveThought("");
    try {
      await consumeSse(
        apiUrl("/api/pipeline/pm-spec"),
        {
          requirement,
          config,
          sessionId: sessionId || undefined,
          images: reqImagesPayload(reqImageItems),
        },
        h.onEvent
      );
      const sseErr = h.getStreamError?.() || "";
      if (sseErr) {
        setPipelineError({
          step: "总结需求",
          detail: sseErr,
          isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(
            sseErr
          ),
        });
      } else {
        await loadPmSpecMd(sessionFromStreamRef.current || sessionId);
        pushLog("标准需求文档已生成（需求文档.md）", true);
      }
    } catch (e) {
      const msg = String(e.message || e);
      pushLog(`请求失败：${msg}`, false);
      setPipelineError({
        step: "总结需求",
        detail: msg,
        isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(msg),
      });
    } finally {
      setBusyLabel("");
      setPipeActive(false);
      setPmSpecGenerating(false);
    }
    h.flushDeltaLog();
    setPreviewBust((b) => b + 1);
  };

  const runPm = async (solutionIdx) => {
    const idx =
      solutionIdx != null
        ? Math.max(0, Math.min(2, solutionIdx))
        : pmSolutionIdxRef.current;
    setPmSolutionIdx(idx);
    if (!pmSpecMd.trim()) {
      return alert("请先点击「总结需求」生成标准需求文档，再生成原型");
    }
    if (config.provider === "cursor") {
      if (!config.cursorApiKey)
        return alert("请填写 Cursor API Key（cursor.com 控制台的 Integrations / Cloud Agents）");
      if (!config.cursorRepoUrl)
        return alert(
          "Cursor Cloud 需要已连接 GitHub 的仓库：请填写 HTTPS 地址，例如 https://github.com/org/repo"
        );
    } else {
      if (!config.apiKey) return alert("请填写 OpenAI 兼容 API Key");
    }
    setPipeActive(true);
    setPhase("pm");
    setVariantBusy({ role: "pm", idx });
    setLiveThought("");
    setOutputDir("");
    beginStreamTracking();
    const h = attachSseHandlers();
    setBusyLabel(`产品经理 · 方案${idx + 1}`);
    const sol = pmSolutions[idx];
    try {
      await consumeSse(
        apiUrl("/api/pipeline/pm"),
        {
          requirement,
          config,
          sessionId: sessionId || undefined,
          solutionIndex: idx,
          solutionTitle: sol?.title,
          solutionSummary: sol?.summary,
          images: reqImagesPayload(reqImageItems),
          requirementSpec: pmSpecMd,
        },
        h.onEvent
      );
      const sseErr = h.getStreamError?.() || "";
      if (sseErr) {
        setPipelineError({
          step: "产品经理阶段",
          detail: sseErr,
          isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(sseErr),
        });
      }
    } catch (e) {
      const msg = String(e.message || e);
      pushLog(`请求失败：${msg}`, false);
      setPipelineError({
        step: "产品经理阶段",
        detail: msg,
        isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(msg),
      });
    } finally {
      setBusyLabel("");
      setPipeActive(false);
      setVariantBusy(null);
    }
    h.flushDeltaLog();
    setPmVariantReady((prev) => {
      const next = [...prev];
      next[idx] = true;
      return next;
    });
    setPreviewBust((b) => b + 1);
    setPhase("pm_review");
  };

  const runUi = async (solutionIdx) => {
    const idx =
      solutionIdx != null
        ? Math.max(0, Math.min(2, solutionIdx))
        : uiSolutionIdxRef.current;
    setUiSolutionIdx(idx);
    if (!sessionId) return;
    if (pmFinalizedIdx === null) {
      return alert("请先在产品经理页对某一方案点击「定稿」，再生成 UI。");
    }
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return alert("请填写 Cursor API Key");
    } else {
      if (!config.apiKey) return alert("请填写 API Key");
    }
    setPipeActive(true);
    setPhase("ui");
    setVariantBusy({ role: "ui", idx });
    setLiveThought("");
    beginStreamTracking();
    const h = attachSseHandlers();
    setBusyLabel(`UI 设计 · 方案${idx + 1}`);
    const pmIdx = pmFinalizedIdx;
    const protoCandidates = [
      pmVariantFile(pmIdx),
      pmIdx === 0 ? "prototype.html" : null,
    ].filter(Boolean);
    let prototypeHtml = "";
    for (const rel of protoCandidates) {
      try {
        const r = await fetch(
          apiUrl(
            `/generated/${encodeURIComponent(sessionId)}/${rel}?bust=${previewBust}`
          )
        );
        if (r.ok) {
          prototypeHtml = await r.text();
          break;
        }
      } catch {
        /* try next */
      }
    }
    if (!prototypeHtml.trim()) {
      pushLog("读取定稿原型失败", false);
      setVariantBusy(null);
      setPipeActive(false);
      setBusyLabel("");
      return alert("未读到定稿原型文件，请确认产品经理已定稿且文件存在。");
    }
    const uiSol = uiSolutions[idx];
    try {
      await consumeSse(
        apiUrl("/api/pipeline/ui"),
        {
          requirement,
          prototypeHtml,
          sessionId,
          config,
          solutionIndex: idx,
          solutionTitle: uiSol?.title,
          solutionPhilosophy: uiSol?.philosophy,
        },
        h.onEvent
      );
      const sseErr = h.getStreamError?.() || "";
      if (sseErr) {
        setPipelineError({
          step: "UI 设计阶段",
          detail: sseErr,
          isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(sseErr),
        });
      }
    } catch (e) {
      const msg = String(e.message || e);
      pushLog(`请求失败：${msg}`, false);
      setPipelineError({
        step: "UI 设计阶段",
        detail: msg,
        isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(msg),
      });
    } finally {
      setBusyLabel("");
      setPipeActive(false);
      setVariantBusy(null);
    }
    h.flushDeltaLog();
    setUiVariantReady((prev) => {
      const next = [...prev];
      next[idx] = true;
      return next;
    });
    setPreviewBust((b) => b + 1);
    setPhase("ui_review");
  };

  const runFs = async () => {
    if (!sessionId) return;
    if (uiFinalizedIdx === null) {
      return alert("请先在 UI 设计页对某一方案点击「定稿」，再执行全栈落地。");
    }
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return alert("请填写 Cursor API Key");
    } else {
      if (!config.apiKey) return alert("请填写 API Key");
    }
    setPipeActive(true);
    setPhase("fs");
    setLiveThought("");
    beginStreamTracking();
    const h = attachSseHandlers();
    setBusyLabel("全栈开发 · 准备中");
    const uiIdx = uiFinalizedIdx;
    const uiCandidates = [uiVariantFile(uiIdx), uiIdx === 0 ? "ui.html" : null].filter(
      Boolean
    );
    let uiHtml = "";
    for (const rel of uiCandidates) {
      try {
        const r = await fetch(
          apiUrl(
            `/generated/${encodeURIComponent(sessionId)}/${rel}?bust=${previewBust}`
          )
        );
        if (r.ok) {
          uiHtml = await r.text();
          break;
        }
      } catch {
        /* try next */
      }
    }
    if (!uiHtml.trim()) {
      pushLog("读取定稿 UI 失败", false);
      return alert("未读到定稿 UI 文件，请确认 UI 已定稿。");
    }
    try {
      await consumeSse(
        apiUrl("/api/pipeline/fullstack"),
        { requirement, uiHtml, sessionId, config },
        h.onEvent
      );
      const sseErr = h.getStreamError?.() || "";
      if (sseErr) {
        setPipelineError({
          step: "全栈落地阶段",
          detail: sseErr,
          isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(sseErr),
        });
      }
    } catch (e) {
      const msg = String(e.message || e);
      pushLog(`请求失败：${msg}`, false);
      setPipelineError({
        step: "全栈落地阶段",
        detail: msg,
        isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(msg),
      });
    } finally {
      setBusyLabel("");
      setPipeActive(false);
    }
    h.flushDeltaLog();
    setPhase("done");
  };

  const runQa = async () => {
    const qaInputsReady =
      requirement.trim() || qaMaterial.trim() || qaImageItems.length > 0;
    if (!qaInputsReady) return alert("请填写需求或「测试岗 · 原型/说明」，或上传参考图");
    const isStandaloneQa = embedStandaloneQa || qaSubTab === "standalone";
    if (isStandaloneQa && !(qaBizRef.current || qaBizPreview).trim()) {
      return alert("请先完成「② 业务场景测试点」，再生成页面功能测试点");
    }
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return alert("请填写 Cursor API Key");
      if (!config.cursorRepoUrl)
        return alert("Cursor Cloud 需要已授权的 GitHub 仓库地址");
      if (!sessionId && qaSubTab !== "standalone")
        return alert("使用 Cursor Cloud 时请先完成「产品经理生成原型」，以便绑定远端 Agent");
    } else if (!config.apiKey) return alert("请填写 API Key");

    setPipeActive(true);
    setPhase("qa");
    setLiveThought("");
    beginStreamTracking();
    const h = attachSseHandlers();
    setBusyLabel("测试 · 生成测试点");
    setQaBusyMode("testpoints");
    // 独立模式复用已有会话，让 Cursor followup 同一 Agent
    if (!isStandaloneQa) {
      sessionFromStreamRef.current = sessionId;
    }
    const imagesPayload = qaImageItems.slice(0, 4).map(({ dataUrl }) => ({
      dataUrl,
    }));

    try {
      await consumeSse(
        apiUrl("/api/pipeline/qa"),
        {
          requirement: isStandaloneQa ? "" : requirement,
          material: qaMaterial,
          styleHint: isStandaloneQa ? qaSkill : qaStyleHint,
          images: imagesPayload,
          sessionId:
            (isStandaloneQa
              ? sessionFromStreamRef.current || sessionId
              : sessionId) || undefined,
          standalone: isStandaloneQa,
          qaMode: "testpoints",
          framework: isStandaloneQa
            ? qaFrameworkRef.current || qaFrameworkPreview
            : undefined,
          businessScenarios: isStandaloneQa
            ? qaBizRef.current || qaBizPreview
            : undefined,
          reviewFeedback: isStandaloneQa
            ? String(qaReviewRef.current || qaReviewPreview || "").trim() || undefined
            : undefined,
          priorDraft: isStandaloneQa &&
          String(qaReviewRef.current || qaReviewPreview || "").trim()
            ? String(qaFuncRef.current || qaMdPreview || "").trim() || undefined
            : undefined,
          generatePlaywrightSpec: !!qaGenPwSpec,
          playwrightBaseUrl: String(qaPwTestBaseUrl || "").trim() || undefined,
          config,
        },
        h.onEvent,
        tpAutoPipeAbortCtrlRef.current
          ? { signal: tpAutoPipeAbortCtrlRef.current.signal }
          : undefined
      );
      const sseErr = h.getStreamError?.() || "";
      if (sseErr) {
        setPipelineError({
          step: "测试岗 · 生成测试点",
          detail: sseErr,
          isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(
            sseErr
          ),
        });
      }
    } catch (e) {
      if (isAbortError(e)) throw new Error("已取消");
      const msg = String(e.message || e);
      pushLog(`请求失败：${msg}`, false);
      setPipelineError({
        step: "测试岗 · 生成测试点",
        detail: msg,
        isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(
          msg
        ),
      });
    } finally {
      setBusyLabel("");
      setPipeActive(false);
      setQaBusyMode("");
    }
    assertAutoPipeNotAborted();
    h.flushDeltaLog();
    const sidNow = sessionFromStreamRef.current || sessionId;
    if (sidNow) {
      try {
        const r = await fetch(
          `${apiUrl(`/generated/${encodeURIComponent(sidNow)}/测试点.md`)}?bust=${Date.now()}`
        );
        if (r.ok) {
          const md = cleanGeneratedMd(await r.text());
          qaFuncRef.current = md;
          setQaMdPreview(md);
        }
      } catch {
        pushLog("读取 测试点.md 失败（可稍后手动打开生成目录查看）", true);
      }
      if (qaGenPwSpec) {
        try {
          const r = await fetch(
            `${apiUrl(`/generated/${encodeURIComponent(sidNow)}/playwright.spec.ts`)}?bust=${Date.now()}`
          );
          if (r.ok) {
            setQaPwSpecPreview(await r.text());
            setTpPreviewTab("pw");
          }
        } catch {
          /* ignore */
        }
      }
      await loadPipelineTestPoints(sidNow);
      setPipelineActiveIdx(0);
    }
    setPhase("qa_review");
  };

  const runQaFramework = async () => {
    const qaInputsReady =
      requirement.trim() || qaMaterial.trim() || qaImageItems.length > 0;
    if (!qaInputsReady) return alert("请先填写原型网址 / 说明，或上传参考图");
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return alert("请填写 Cursor API Key");
      if (!config.cursorRepoUrl)
        return alert("Cursor Cloud 需要已授权的 GitHub 仓库地址");
    } else if (!config.apiKey) return alert("请填写 API Key");

    setPipeActive(true);
    setPhase("qa");
    setLiveThought("");
    beginStreamTracking();
    const h = attachSseHandlers();
    setBusyLabel("测试 · 梳理页面框架");
    setQaBusyMode("framework");
    const imagesPayload = qaImageItems.slice(0, 4).map(({ dataUrl }) => ({
      dataUrl,
    }));

    try {
      await consumeSse(
        apiUrl("/api/pipeline/qa"),
        {
          requirement: "",
          material: qaMaterial,
          styleHint: qaSkill,
          images: imagesPayload,
          sessionId: sessionFromStreamRef.current || sessionId || undefined,
          standalone: true,
          qaMode: "framework",
          reviewFeedback: String(qaReviewRef.current || qaReviewPreview || "").trim() || undefined,
          priorDraft: String(qaReviewRef.current || qaReviewPreview || "").trim()
            ? String(qaFrameworkRef.current || qaFrameworkPreview || "").trim() || undefined
            : undefined,
          config,
        },
        h.onEvent,
        tpAutoPipeAbortCtrlRef.current
          ? { signal: tpAutoPipeAbortCtrlRef.current.signal }
          : undefined
      );
      const sseErr = h.getStreamError?.() || "";
      if (sseErr) {
        setPipelineError({
          step: "测试点生成 · 页面框架",
          detail: sseErr,
          isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(
            sseErr
          ),
        });
      }
    } catch (e) {
      if (isAbortError(e)) throw new Error("已取消");
      const msg = String(e.message || e);
      pushLog(`请求失败：${msg}`, false);
      setPipelineError({
        step: "测试点生成 · 页面框架",
        detail: msg,
        isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(
          msg
        ),
      });
    } finally {
      setBusyLabel("");
      setPipeActive(false);
      setQaBusyMode("");
      setTpScanning(false);
    }
    assertAutoPipeNotAborted();
    h.flushDeltaLog();
    const sidNow = sessionFromStreamRef.current;
    if (sidNow) {
      try {
        const r = await fetch(
          `${apiUrl(`/generated/${encodeURIComponent(sidNow)}/页面框架.md`)}?bust=${Date.now()}`
        );
        if (r.ok) {
          const md = cleanGeneratedMd(await r.text());
          qaFrameworkRef.current = md;
          setQaFrameworkPreview(md);
        }
      } catch {
        /* ignore */
      }
    }
    setPhase("qa_review");
  };

  const runQaBiz = async () => {
    const qaInputsReady =
      requirement.trim() || qaMaterial.trim() || qaImageItems.length > 0;
    if (!qaInputsReady) return alert("请先填写原型网址 / 说明，或上传参考图");
    if (!(qaFrameworkRef.current || qaFrameworkPreview).trim()) {
      return alert("建议先点「① 梳理页面框架」，再生成业务场景测试点");
    }
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return alert("请填写 Cursor API Key");
      if (!config.cursorRepoUrl)
        return alert("Cursor Cloud 需要已授权的 GitHub 仓库地址");
    } else if (!config.apiKey) return alert("请填写 API Key");

    setPipeActive(true);
    setPhase("qa");
    setLiveThought("");
    beginStreamTracking();
    const h = attachSseHandlers();
    setBusyLabel("测试 · 业务场景测试点");
    setQaBusyMode("biz");
    const imagesPayload = qaImageItems.slice(0, 4).map(({ dataUrl }) => ({
      dataUrl,
    }));

    try {
      await consumeSse(
        apiUrl("/api/pipeline/qa"),
        {
          requirement: "",
          material: qaMaterial,
          styleHint: qaSkill,
          images: imagesPayload,
          sessionId: sessionFromStreamRef.current || sessionId || undefined,
          standalone: true,
          qaMode: "biz",
          framework: qaFrameworkRef.current || qaFrameworkPreview,
          reviewFeedback: String(qaReviewRef.current || qaReviewPreview || "").trim() || undefined,
          priorDraft: String(qaReviewRef.current || qaReviewPreview || "").trim()
            ? String(qaBizRef.current || qaBizPreview || "").trim() || undefined
            : undefined,
          config,
        },
        h.onEvent,
        tpAutoPipeAbortCtrlRef.current
          ? { signal: tpAutoPipeAbortCtrlRef.current.signal }
          : undefined
      );
      const sseErr = h.getStreamError?.() || "";
      if (sseErr) {
        setPipelineError({
          step: "测试点生成 · 业务场景",
          detail: sseErr,
          isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(
            sseErr
          ),
        });
      }
    } catch (e) {
      if (isAbortError(e)) throw new Error("已取消");
      const msg = String(e.message || e);
      pushLog(`请求失败：${msg}`, false);
      setPipelineError({
        step: "测试点生成 · 业务场景",
        detail: msg,
        isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(
          msg
        ),
      });
    } finally {
      setBusyLabel("");
      setPipeActive(false);
      setQaBusyMode("");
    }
    assertAutoPipeNotAborted();
    h.flushDeltaLog();
    const sidNow = sessionFromStreamRef.current;
    if (sidNow) {
      try {
        const r = await fetch(
          `${apiUrl(`/generated/${encodeURIComponent(sidNow)}/业务场景测试点.md`)}?bust=${Date.now()}`
        );
        if (r.ok) {
          const md = cleanGeneratedMd(await r.text());
          qaBizRef.current = md;
          setQaBizPreview(md);
        }
      } catch {
        /* ignore */
      }
    }
    setPhase("qa_review");
  };

  const runQaSpecial = async () => {
    const qaInputsReady =
      requirement.trim() || qaMaterial.trim() || qaImageItems.length > 0;
    if (!qaInputsReady) return alert("请先填写原型网址 / 说明，或上传参考图");
    if (!(qaFrameworkRef.current || qaFrameworkPreview).trim()) {
      return alert("请先完成第 1 步：页面框架");
    }
    if (!(qaFuncRef.current || qaMdPreview).trim()) {
      return alert("请先完成第 3 步：页面功能（专项需对照功能点）");
    }
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return alert("请填写 Cursor API Key");
      if (!config.cursorRepoUrl)
        return alert("Cursor Cloud 需要已授权的 GitHub 仓库地址");
    } else if (!config.apiKey) return alert("请填写 API Key");

    setPipeActive(true);
    setPhase("qa");
    setLiveThought("");
    beginStreamTracking();
    const h = attachSseHandlers();
    setBusyLabel("测试 · 专项测试点");
    setQaBusyMode("special");
    const imagesPayload = qaImageItems.slice(0, 4).map(({ dataUrl }) => ({
      dataUrl,
    }));

    try {
      await consumeSse(
        apiUrl("/api/pipeline/qa"),
        {
          requirement: "",
          material: qaMaterial,
          styleHint: qaSkill,
          images: imagesPayload,
          sessionId: sessionFromStreamRef.current || sessionId || undefined,
          standalone: true,
          qaMode: "special",
          framework: qaFrameworkRef.current || qaFrameworkPreview,
          businessScenarios: qaBizRef.current || qaBizPreview,
          pageFunctionMd: qaFuncRef.current || qaMdPreview,
          reviewFeedback: String(qaReviewRef.current || qaReviewPreview || "").trim() || undefined,
          priorDraft: String(qaReviewRef.current || qaReviewPreview || "").trim()
            ? String(qaSpecialRef.current || qaSpecialPreview || "").trim() || undefined
            : undefined,
          config,
        },
        h.onEvent,
        tpAutoPipeAbortCtrlRef.current
          ? { signal: tpAutoPipeAbortCtrlRef.current.signal }
          : undefined
      );
      const sseErr = h.getStreamError?.() || "";
      if (sseErr) {
        setPipelineError({
          step: "测试点生成 · 专项测试",
          detail: sseErr,
          isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(
            sseErr
          ),
        });
      }
    } catch (e) {
      if (isAbortError(e)) throw new Error("已取消");
      const msg = String(e.message || e);
      pushLog(`请求失败：${msg}`, false);
      setPipelineError({
        step: "测试点生成 · 专项测试",
        detail: msg,
        isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(
          msg
        ),
      });
    } finally {
      setBusyLabel("");
      setPipeActive(false);
      setQaBusyMode("");
    }
    assertAutoPipeNotAborted();
    h.flushDeltaLog();
    const sidNow = sessionFromStreamRef.current;
    if (sidNow) {
      try {
        const r = await fetch(
          `${apiUrl(`/generated/${encodeURIComponent(sidNow)}/专项测试点.md`)}?bust=${Date.now()}`
        );
        if (r.ok) {
          const md = cleanGeneratedMd(await r.text());
          qaSpecialRef.current = md;
          setQaSpecialPreview(md);
          setTpPreviewTab("special");
        }
      } catch {
        /* ignore */
      }
    }
    setPhase("qa_review");
  };

  /** 对照原型一并评审①框架 / ②场景 / ③功能 / ④专项；重生成对应步骤时会注入报告 */
  const appendReviewHistory = useCallback((entry) => {
    setQaReviewHistory((prev) => [...prev, entry].slice(-20));
  }, []);

  const runQaReview = async (opts = {}) => {
    const priorFromOpts = String(opts.priorReviewReport || "").trim();
    const priorFromCurrent = String(
      qaReviewRef.current || qaReviewPreview || ""
    ).trim();
    const priorFromHist = String(
      qaReviewHistory[qaReviewHistory.length - 1]?.report || ""
    ).trim();
    // 一键首轮会显式 kind:"review"；点「重新评审」无参时自动带上上一轮报告做复审
    const forceFresh = !!opts.forceFresh;
    const explicitFreshReview =
      opts.kind === "review" && !priorFromOpts && !opts.useCurrentAsPrior;
    const priorReport = forceFresh
      ? ""
      : priorFromOpts ||
        (explicitFreshReview
          ? ""
          : opts.useCurrentAsPrior || !opts.kind
            ? priorFromCurrent || priorFromHist
            : "");
    const kind =
      opts.kind || (priorReport ? "rereview" : "review");
    const qaInputsReady =
      requirement.trim() || qaMaterial.trim() || qaImageItems.length > 0;
    if (!qaInputsReady) return alert("请先填写原型网址 / 说明，或上传参考图");
    if (
      !(qaFrameworkRef.current || qaFrameworkPreview).trim() &&
      !(qaBizRef.current || qaBizPreview).trim() &&
      !(qaFuncRef.current || qaMdPreview).trim() &&
      !(qaSpecialRef.current || qaSpecialPreview).trim()
    ) {
      return alert("请先至少完成①框架 / ②场景 / ③功能之一，再点评审");
    }
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return alert("请填写 Cursor API Key");
      if (!config.cursorRepoUrl)
        return alert("Cursor Cloud 需要已授权的 GitHub 仓库地址");
    } else if (!config.apiKey) return alert("请填写 API Key");

    const snapFw = qaFrameworkRef.current || qaFrameworkPreview;
    const snapBiz = qaBizRef.current || qaBizPreview;
    const snapFunc = qaFuncRef.current || qaMdPreview;
    const snapSpecial = qaSpecialRef.current || qaSpecialPreview;

    setPipeActive(true);
    setPhase("qa");
    setLiveThought("");
    beginStreamTracking();
    const h = attachSseHandlers();
    setBusyLabel(kind === "rereview" ? "测试 · 复审①②③④" : "测试 · 评审①②③④");
    setQaBusyMode("review");
    setTpPreviewTab("review");
    setQaReviewPreview("");
    qaReviewRef.current = "";
    const imagesPayload = qaImageItems.slice(0, 4).map(({ dataUrl }) => ({
      dataUrl,
    }));

    let needsRework = false;
    try {
      await consumeSse(
        apiUrl("/api/pipeline/qa"),
        {
          requirement: "",
          material: qaMaterial,
          styleHint: qaSkill,
          images: imagesPayload,
          sessionId: sessionFromStreamRef.current || sessionId || undefined,
          standalone: true,
          qaMode: "review",
          framework: snapFw,
          businessScenarios: snapBiz,
          pageFunctionMd: snapFunc,
          specialMd: snapSpecial,
          priorReviewReport: priorReport || undefined,
          config,
        },
        async (evt) => {
          await h.onEvent(evt);
          if (evt.type === "qa_review") {
            if (typeof evt.needsRework === "boolean") needsRework = evt.needsRework;
          }
        },
        tpAutoPipeAbortCtrlRef.current
          ? { signal: tpAutoPipeAbortCtrlRef.current.signal }
          : undefined
      );
      const sseErr = h.getStreamError?.() || "";
      if (sseErr) {
        setPipelineError({
          step: "测试点生成 · 评审",
          detail: sseErr,
          isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(
            sseErr
          ),
        });
      }
    } catch (e) {
      if (isAbortError(e)) throw new Error("已取消");
      const msg = String(e.message || e);
      pushLog(`请求失败：${msg}`, false);
      setPipelineError({
        step: "测试点生成 · 评审",
        detail: msg,
        isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(
          msg
        ),
      });
    } finally {
      setBusyLabel("");
      setPipeActive(false);
      setQaBusyMode("");
    }
    assertAutoPipeNotAborted();
    const sidNow = sessionFromStreamRef.current;
    // 优先事件终稿 → 流式累积 → 预览 ref（避免只依赖末包导致空报告）
    let report = cleanGeneratedMd(
      h.getReviewMd?.() || qaReviewRef.current || ""
    );
    h.flushDeltaLog();
    if (sidNow) {
      const names = ["测试点评审报告.md", "功能测试点评审报告.md"];
      for (const name of names) {
        try {
          const r = await fetch(
            `${apiUrl(`/generated/${encodeURIComponent(sidNow)}/${name}`)}?bust=${Date.now()}`
          );
          if (r.ok) {
            const fromFile = cleanGeneratedMd(await r.text());
            if (fromFile) {
              report = fromFile;
              break;
            }
          }
        } catch {
          /* ignore */
        }
      }
    }
    const sseErrFinal = h.getStreamError?.() || "";
    if (report) {
      // 以终稿 Markdown 再判一次（与服务端同口径；覆盖 SSE 误判）
      needsRework = clientReviewNeedsRework(report);
      qaReviewRef.current = report;
      setQaReviewPreview(report);
      setTpPreviewTab("review");
      appendReviewHistory({
        id: `${Date.now().toString(36)}`,
        at: new Date().toISOString(),
        kind,
        report,
        framework: snapFw,
        biz: snapBiz,
        func: snapFunc,
        special: snapSpecial,
        needsRework: !!needsRework,
      });
    } else if (!opts.silent) {
      const mode = h.getStreamQaMode?.() || "";
      const hint =
        mode === "testpoints"
          ? "后端仍把「评审」当成功能点生成了（服务进程过旧）。请刷新工作台页或重启 start.bat 后再点一次评审。"
          : sseErrFinal
            ? `评审未写出报告：${sseErrFinal}`
            : "评审未写出报告。请确认模型配置正常后，再点一次「评审①②③」。";
      pushLog(hint, false);
      window.alert(hint);
    }
    setPhase("qa_review");
    return {
      report,
      needsRework: !!needsRework,
      ok: !!report,
      error: report
        ? ""
        : sseErrFinal || "评审未写出报告（模型/Cursor 无正文）",
    };
  };

  /** 一键：①→②→③→评1→(需返工则修订①②③)→评2；真实步骤进度 */
  const runTpAutoPipeline = async () => {
    const qaInputsReady =
      requirement.trim() || qaMaterial.trim() || qaImageItems.length > 0;
    if (!qaInputsReady) return alert("请先填写原型网址 / 说明，或上传参考图");
    if (busy || tpScanning) return;
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return alert("请填写 Cursor API Key");
      if (!config.cursorRepoUrl)
        return alert("Cursor Cloud 需要已授权的 GitHub 仓库地址");
    } else if (!config.apiKey) return alert("请填写 API Key");

    const steps = [
      { id: "fw", label: "① 生成页面框架", pct: 12 },
      { id: "biz", label: "② 生成业务场景", pct: 28 },
      { id: "func", label: "③ 生成页面功能", pct: 42 },
      { id: "special", label: "④ 生成专项测试", pct: 55 },
      { id: "rev1", label: "评审第 1 轮", pct: 68 },
      { id: "fix", label: "按评审修订①②③", pct: 82 },
      { id: "rev2", label: "评审第 2 轮（复审）", pct: 95 },
      { id: "done", label: "完成", pct: 100 },
    ];
    const setProg = (id, extra = {}) => {
      const i = steps.findIndex((s) => s.id === id);
      if (tpAutoPipeAbortRef.current) return;
      const cur = steps[i] || steps[0];
      setTpAutoPipe({
        active: true,
        stepId: id,
        stepIndex: i,
        label: cur.label,
        percent: cur.pct,
        steps: steps.map((s, idx) => ({
          ...s,
          status: idx < i ? "done" : idx === i ? "running" : "pending",
        })),
        ...extra,
      });
    };

    tpAutoPipeAbortRef.current = false;
    tpAutoPipeAbortCtrlRef.current?.abort();
    tpAutoPipeAbortCtrlRef.current = new AbortController();
    // 一键从干净稿开始：首轮①②③不带旧评审；历史本轮重记；新开会话以新建 1 个 Cursor Agent
    qaReviewRef.current = "";
    setQaReviewPreview("");
    setQaReviewHistory([]);
    sessionFromStreamRef.current = "";
    setSessionId("");
    setProg("fw");
    pushLog("一键流水线开始：①→②→③→④→评审→（按需修订）→复审", true);

    const requireMd = (refVal, label) => {
      if (!String(refVal || "").trim()) {
        throw new Error(
          `${label}未产出内容。请看右侧日志里的 Cursor/网络错误；勿把空步骤当成功。可单独重跑该步或稍后再试一键。`
        );
      }
    };

    try {
      // ①
      setProg("fw");
      await runQaFramework();
      if (tpAutoPipeAbortRef.current) throw new Error("已取消");
      requireMd(qaFrameworkRef.current, "① 页面框架");
      await new Promise((r) => setTimeout(r, 80));
      setProg("biz");
      await runQaBiz();
      if (tpAutoPipeAbortRef.current) throw new Error("已取消");
      requireMd(qaBizRef.current, "② 业务场景");
      await new Promise((r) => setTimeout(r, 80));
      setProg("func");
      // 关闭 PW 以免一键拖太久
      const prevPw = qaGenPwSpec;
      if (prevPw) setQaGenPwSpec(false);
      await runQa();
      if (prevPw) setQaGenPwSpec(prevPw);
      if (tpAutoPipeAbortRef.current) throw new Error("已取消");
      requireMd(qaFuncRef.current, "③ 页面功能");
      await new Promise((r) => setTimeout(r, 80));
      setProg("special");
      await runQaSpecial();
      if (tpAutoPipeAbortRef.current) throw new Error("已取消");
      requireMd(qaSpecialRef.current, "④ 专项测试");

      setProg("rev1");
      const r1 = await runQaReview({ silent: true, kind: "review" });
      if (!r1?.ok) {
        throw new Error(
          r1?.error
            ? `第 1 轮评审未产出报告：${r1.error}`
            : "第 1 轮评审未产出报告"
        );
      }
      if (tpAutoPipeAbortRef.current) throw new Error("已取消");

      if (r1.needsRework) {
        setProg("fix", { note: "第1轮需返工，按评审修订中…", label: "按评审修订①框架", percent: 68 });
        await runQaFramework();
        if (tpAutoPipeAbortRef.current) throw new Error("已取消");
        await new Promise((r) => setTimeout(r, 80));
        setProg("fix", { note: "第1轮需返工，按评审修订中…", label: "按评审修订②场景", percent: 74 });
        await runQaBiz();
        if (tpAutoPipeAbortRef.current) throw new Error("已取消");
        await new Promise((r) => setTimeout(r, 80));
        setProg("fix", { note: "第1轮需返工，按评审修订中…", label: "按评审修订③功能", percent: 82 });
        if (prevPw) setQaGenPwSpec(false);
        await runQa();
        if (prevPw) setQaGenPwSpec(prevPw);
        if (tpAutoPipeAbortRef.current) throw new Error("已取消");
        await new Promise((r) => setTimeout(r, 80));
        setProg("fix", { note: "第1轮需返工，按评审修订中…", label: "按评审修订④专项", percent: 86 });
        await runQaSpecial();
        if (tpAutoPipeAbortRef.current) throw new Error("已取消");

        setProg("rev2");
        await runQaReview({
          silent: true,
          kind: "rereview",
          priorReviewReport: r1.report,
        });
      } else {
        setProg("fix", { note: "第1轮已通过，跳过修订" });
        setTpAutoPipe((p) =>
          p
            ? {
                ...p,
                steps: p.steps.map((s) =>
                  s.id === "fix" || s.id === "rev2"
                    ? { ...s, status: "skipped", label: s.label + "（跳过）" }
                    : s
                ),
              }
            : p
        );
        await new Promise((r) => setTimeout(r, 400));
      }

      setProg("done");
      pushLog("一键流水线完成", true);
      setTpPreviewTab("review");
    } catch (e) {
      const msg = String(e?.message || e);
      const cancelled = isAbortError(e) || /已取消/.test(msg);
      pushLog(`一键流水线中断：${msg}`, false);
      setTpAutoPipe((p) =>
        p
          ? {
              ...p,
              active: false,
              error: cancelled ? "已取消" : msg,
              label: cancelled ? "已取消" : "已中断 · " + msg,
              note: cancelled ? "已中断当前请求" : p.note,
            }
          : p
      );
      return;
    } finally {
      tpAutoPipeAbortCtrlRef.current = null;
    }

    setTimeout(() => {
      setTpAutoPipe((p) => (p ? { ...p, active: false } : null));
    }, 1600);
  };

  const runOps = async () => {
    const opsInputsReady =
      requirement.trim() || opsMaterial.trim() || opsImageItems.length > 0;
    if (!opsInputsReady) return alert("请填写需求或「运维岗 · 说明」，或上传部署/架构参考图");
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return alert("请填写 Cursor API Key");
      if (!config.cursorRepoUrl)
        return alert("Cursor Cloud 需要已授权的 GitHub 仓库地址");
      if (!sessionId)
        return alert("使用 Cursor Cloud 时请先完成「产品经理生成原型」，以便绑定远端 Agent");
    } else if (!config.apiKey) return alert("请填写 API Key");

    setPipeActive(true);
    setPhase("ops");
    setLiveThought("");
    beginStreamTracking();
    const h = attachSseHandlers();
    setBusyLabel("运维 · 生成交接文档");
    sessionFromStreamRef.current = sessionId;
    const imagesPayload = opsImageItems.slice(0, 4).map(({ dataUrl }) => ({
      dataUrl,
    }));

    try {
      await consumeSse(
        apiUrl("/api/pipeline/ops"),
        {
          requirement,
          material: opsMaterial,
          styleHint: opsStyleHint,
          images: imagesPayload,
          sessionId: sessionId || undefined,
          config,
        },
        h.onEvent
      );
      const sseErr = h.getStreamError?.() || "";
      if (sseErr) {
        setPipelineError({
          step: "运维岗 · 生成交接文档",
          detail: sseErr,
          isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(
            sseErr
          ),
        });
      }
    } catch (e) {
      const msg = String(e.message || e);
      pushLog(`请求失败：${msg}`, false);
      setPipelineError({
        step: "运维岗 · 生成交接文档",
        detail: msg,
        isNetwork: /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(
          msg
        ),
      });
    } finally {
      setBusyLabel("");
      setPipeActive(false);
    }
    h.flushDeltaLog();
    const sidNow = sessionFromStreamRef.current || sessionId;
    if (sidNow) {
      try {
        const r = await fetch(
          `${apiUrl(`/generated/${encodeURIComponent(sidNow)}/运维手册.md`)}?bust=${Date.now()}`
        );
        if (r.ok) setOpsMdPreview(await r.text());
      } catch {
        pushLog("读取 运维手册.md 失败（可稍后手动打开生成目录查看）", true);
      }
    }
    setPhase("ops_review");
  };

  /** 切到含会话的角色 Tab 时拉取历史；同一 (sessionId, roleTab) 只拉一次 */
  const chatHistoryFetchedRef = useRef({});
  useEffect(() => {
    if (!sessionId) return;
    const r = roleTab;
    const key = `${sessionId}::${r}`;
    if (chatHistoryFetchedRef.current[key]) return;
    chatHistoryFetchedRef.current[key] = true;
    fetch(
      apiUrl(
        `/api/role/chat/history?role=${encodeURIComponent(r)}&sessionId=${encodeURIComponent(sessionId)}`
      )
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((j) => {
        if (!j || !j.ok) return;
        setChatHistory((prev) => ({ ...prev, [r]: Array.isArray(j.history) ? j.history : [] }));
      })
      .catch(() => {});
  }, [sessionId, roleTab]);

  const onPasteChatImages = (roleKey, e) => {
    const items = e.clipboardData?.items;
    if (!items?.length) return;
    const r = roleKey || roleTab;
    let added = false;
    for (const item of items) {
      if (!item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (!file) continue;
      e.preventDefault();
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        if (!dataUrl) return;
        setChatImageItems((prev) => ({
          ...prev,
          [r]: [...(prev[r] || []), { name: file.name || "粘贴图", dataUrl }].slice(0, 4),
        }));
      };
      reader.readAsDataURL(file);
      added = true;
    }
    if (added) e.preventDefault();
  };

  const loadPipelineTestPoints = useCallback(async (sid) => {
    const id = sid || sessionId;
    if (!id) return;
    try {
      const r = await fetch(
        apiUrl(`/api/qa/pipeline/points?sessionId=${encodeURIComponent(id)}`)
      );
      const j = await r.json();
      if (j?.ok && Array.isArray(j.points)) {
        setPipelineTestPoints(j.points);
        if (j.md) setQaMdPreview(cleanGeneratedMd(j.md));
      }
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  useEffect(() => {
    if (roleTab === "qa" && qaSubTab === "pipeline" && sessionId) {
      loadPipelineTestPoints(sessionId);
    }
  }, [roleTab, qaSubTab, sessionId, loadPipelineTestPoints]);

  const generatePipelineTestPoints = async () => {
    if (!sessionId) return alert("请先完成全栈落地，生成 app 目录");
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return alert("请填写 Cursor API Key");
      if (!config.cursorRepoUrl) {
        return alert("Cursor Cloud 需要已授权的 GitHub 仓库地址");
      }
    } else if (!config.apiKey) {
      return alert("请填写 API Key");
    }

    try {
      const hr = await fetch(apiUrl("/api/health"));
      if (!hr.ok) throw new Error("本机 API 未就绪，请确认 start.bat / npm run dev 已启动");
    } catch (e) {
      window.alert(
        `无法连接 ${apiUrl("/api/health")}。\n请先运行 start.bat（或 npm run dev），再重试。\n\n${String(e.message || e)}`
      );
      return;
    }

    setPipelineGenerating(true);
    pushLog("测试岗 · 流水线生成测试点（SSE，支持 Cursor / OpenAI）…", true);
    let sseErr = "";
    try {
      await consumeSse(
        apiUrl("/api/pipeline/qa"),
        {
          requirement,
          material:
            qaMaterial.trim() ||
            "（敏捷流水线）请结合本会话 prototype / ui / app 源码生成测试点：先业务、后功能。",
          styleHint:
            qaStyleHint.trim() ||
            [
              "【敏捷流水线 · 测试点 · 固定顺序】",
              "1) ## 冒烟自动化（Playwright）：3～5 条 ### 标题 + ```json steps（可替代人工冒烟）",
              "2) ## 业务测试点：- 一句话场景",
              "3) ## 功能测试点：- 一句话场景",
              "steps 的 selector 用真实 id：#projName #taskName #addProjBtn #addTaskBtn #demoBtn",
              "禁止编号（M01-001）、模块号、表格。",
            ].join("\n"),
          sessionId,
          config,
          images: [],
        },
        (evt) => {
          if (evt.type === "error") sseErr = String(evt.message || "");
          if (evt.type === "thought" && evt.text) pushLog(evt.text, false);
          if (evt.type === "step" && evt.label) pushLog(`▸ ${evt.label}`, true);
          if (evt.type === "exec" && evt.label) pushLog(`执行：${evt.label}`, true);
          if (evt.type === "qa_points" && Array.isArray(evt.points)) {
            setPipelineTestPoints(evt.points);
            setPipelineActiveIdx(0);
          }
        }
      );
      if (sseErr) throw new Error(sseErr);

      const sidNow = sessionFromStreamRef.current || sessionId;
      try {
        const r = await fetch(
          `${apiUrl(`/generated/${encodeURIComponent(sidNow)}/测试点.md`)}?bust=${Date.now()}`
        );
        if (r.ok) setQaMdPreview(cleanGeneratedMd(await r.text()));
      } catch {
        /* ignore */
      }
      await loadPipelineTestPoints(sidNow);
      setPipelineActiveIdx(0);
      setPhase("qa_review");
      pushLog("测试岗 · 测试点已写入会话目录并刷新列表", true);
    } catch (e) {
      const msg = String(e.message || e);
      const isNet = /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|network/i.test(
        msg
      );
      window.alert(
        isNet
          ? `网络请求失败。请确认：\n1) 终端里 API 已监听 http://127.0.0.1:5180\n2) 勿关闭运行 start.bat 的窗口\n3) F12 → Network 查看 /api/pipeline/qa 是否红色失败\n\n${msg}`
          : msg
      );
    } finally {
      setPipelineGenerating(false);
    }
  };

  const runPipelineSmokeTest = async () => {
    const smokePoints = pipelineTestPoints.filter(
      (p) => p.kind === "smoke" && p.steps?.length
    );
    if (!smokePoints.length) {
      return window.alert(
        "当前没有可执行的冒烟自动化用例。\n\n请重新「生成测试点」，并确保 AI 输出 ## 冒烟自动化（Playwright）段及 ```json 步骤。\n\n也可手工放置：generated/<会话>/qa/playwright-smoke.json"
      );
    }
    if (!sessionId) return alert("缺少会话");
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return alert("请填写 Cursor API Key");
    } else if (!config.apiKey) {
      return alert("请填写 API Key");
    }

    setPipelineTesting(true);
    setPipelineTestIssues([]);
    setPipelineTestProgress({ current: 0, total: smokePoints.length, title: "" });

    const allIssues = [];
    let sseErr = "";
    try {
      await consumeSse(
        apiUrl("/api/qa/pipeline/run-batch"),
        {
          sessionId,
          points: smokePoints,
          requirement,
          config,
          usePlaywright: true,
          smokeOnly: true,
        },
        (evt) => {
          if (evt.type === "error") sseErr = String(evt.message || "");
          if (evt.type === "progress") {
            const idx = Number(evt.index) || 0;
            setPipelineActiveIdx(
              pipelineTestPoints.findIndex((p) => p.title === evt.title)
            );
            setPipelineTestingIdx(idx);
            setPipelineTestProgress({
              current: idx + 1,
              total: Number(evt.total) || smokePoints.length,
              title: String(evt.title || ""),
            });
          }
          if (evt.type === "point_done" && Array.isArray(evt.issues)) {
            for (const it of evt.issues) allIssues.push(it);
            setPipelineTestIssues([...allIssues]);
          }
          if (evt.type === "done") {
            for (const w of evt.warnings || []) pushLog(w, true);
            setPipelineTestIssues(evt.issues || allIssues);
            pushLog(
              evt.passed
                ? `冒烟自动化全部通过（${evt.total} 条）`
                : `冒烟完成，${evt.failCount ?? allIssues.length} 项问题`,
              !!evt.passed
            );
          }
        }
      );
      if (sseErr) throw new Error(sseErr);
    } catch (e) {
      window.alert(String(e.message || e));
    } finally {
      setPipelineTesting(false);
      setPipelineTestingIdx(-1);
      setPipelineTestProgress({ current: 0, total: 0, title: "" });
    }
  };

  const runPipelineTest = async () => {
    if (!sessionId) return alert("缺少会话");
    if (!pipelineTestPoints.length) return alert("请先生成测试点");
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return alert("请填写 Cursor API Key");
    } else if (!config.apiKey) {
      return alert("请填写 API Key");
    }

    setPipelineTesting(true);
    setPipelineTestingIdx(-1);
    setPipelineTestIssues([]);
    setPipelineTestProgress({
      current: 0,
      total: pipelineTestPoints.length,
      title: "",
    });

    const allIssues = [];
    let sseErr = "";

    try {
      await consumeSse(
        apiUrl("/api/qa/pipeline/run-batch"),
        {
          sessionId,
          points: pipelineTestPoints,
          requirement,
          config,
          usePlaywright: true,
        },
        (evt) => {
          if (evt.type === "error") sseErr = String(evt.message || "");
          if (evt.type === "progress") {
            const idx = Number(evt.index) || 0;
            setPipelineActiveIdx(idx);
            setPipelineTestingIdx(idx);
            setPipelineTestProgress({
              current: idx + 1,
              total: Number(evt.total) || pipelineTestPoints.length,
              title: String(evt.title || ""),
            });
          }
          if (evt.type === "point_done" && Array.isArray(evt.issues)) {
            for (const it of evt.issues) allIssues.push(it);
            setPipelineTestIssues([...allIssues]);
            const passed = evt.passed !== false;
            pushLog(
              `${passed ? "✓" : "✗"} ${Number(evt.index) + 1}/${pipelineTestPoints.length} ${String(evt.title || pipelineTestPoints[evt.index]?.title || "")}`,
              passed
            );
          }
          if (evt.type === "done") {
            for (const w of evt.warnings || []) pushLog(w, true);
            const issues = evt.issues || allIssues;
            setPipelineTestIssues(issues);
            if (evt.passed) {
              pushLog(`全部 ${evt.total || pipelineTestPoints.length} 条测试点通过`, true);
            } else {
              pushLog(
                `完成：${evt.total || pipelineTestPoints.length} 条，发现 ${evt.failCount ?? issues.length} 个问题`,
                false
              );
            }
          }
        }
      );
      if (sseErr) throw new Error(sseErr);
    } catch (e) {
      const msg = String(e.message || e);
      if (/Executable doesn't exist|playwright install/i.test(msg)) {
        window.alert(
          `Playwright 浏览器未安装。\n\n请在项目目录执行：\n\nnpm run setup:playwright\n\n完成后重启 start.bat，再点「进行测试」。`
        );
      } else {
        window.alert(msg);
      }
    } finally {
      setPipelineTesting(false);
      setPipelineTestingIdx(-1);
      setPipelineTestProgress({ current: 0, total: 0, title: "" });
    }
  };

  const runPipelineTestOne = async () => {
    if (!sessionId) return alert("缺少会话");
    if (!pipelineTestPoints.length) return alert("请先生成测试点");
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return alert("请填写 Cursor API Key");
    } else if (!config.apiKey) {
      return alert("请填写 API Key");
    }

    const idx = Math.max(
      0,
      Math.min(pipelineActiveIdx, pipelineTestPoints.length - 1)
    );
    const point = pipelineTestPoints[idx];

    setPipelineTesting(true);
    setPipelineTestingIdx(idx);
    setPipelineTestIssues([]);
    setPipelineTestProgress({
      current: 1,
      total: 1,
      title: point?.title || "",
    });

    try {
      const r = await fetch(apiUrl("/api/qa/pipeline/run"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          points: pipelineTestPoints,
          activeIndex: idx,
          requirement,
          config,
          usePlaywright: true,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);

      setPipelineTestIssues(j.issues || []);
      for (const w of j.warnings || []) pushLog(w, true);

      if (j.passed) {
        pushLog(`✓ 单条测试通过：${j.pointTitle || point?.title || ""}`, true);
      } else {
        pushLog(
          `✗ 单条测试未通过：${j.pointTitle || point?.title || ""}（${(j.issues || []).length} 项问题）`,
          false
        );
      }
    } catch (e) {
      const msg = String(e.message || e);
      if (/Executable doesn't exist|playwright install/i.test(msg)) {
        window.alert(
          `Playwright 浏览器未安装。\n\n请在项目目录执行：\n\nnpm run setup:playwright\n\n完成后重启 start.bat。`
        );
      } else {
        window.alert(msg);
      }
    } finally {
      setPipelineTesting(false);
      setPipelineTestingIdx(-1);
      setPipelineTestProgress({ current: 0, total: 0, title: "" });
    }
  };

  /** 将「已完成项目」历史会话恢复进当前流水线，便于关服后继续全栈/测试/追问 */
  const embedHistoryIntoPipeline = useCallback(
    async (rec) => {
      const sid = String(rec?.sessionId || "").trim();
      if (!sid) return alert("无效的历史记录");

      const req = String(rec?.requirement || "").trim();
      let outDir = String(rec?.outputDir || "").replace(/\\/g, "/").trim();
      if (!outDir.startsWith("generated/")) {
        outDir = `generated/${sid}/app`;
      }
      if (!/\/app\/?$/i.test(outDir)) {
        outDir = `${outDir.replace(/\/$/, "")}/app`;
      }

      const bust = Date.now();
      const fileOk = async (relPath) => {
        try {
          const r = await fetch(
            apiUrl(`/generated/${encodeURIComponent(sid)}/${relPath}?bust=${bust}`)
          );
          return r.ok;
        } catch {
          return false;
        }
      };

      let phase = "idle";
      if (await fileOk("app/index.html")) {
        if (await fileOk("运维手册.md")) phase = "ops_review";
        else if (await fileOk("测试点.md")) phase = "qa_review";
        else phase = "done";
      } else if (await fileOk("ui.html")) phase = "ui_review";
      else if (await fileOk("prototype.html")) phase = "pm_review";
      else {
        return alert(
          `未在 generated/${sid}/ 下找到可恢复的产物（prototype / ui / app）。请确认服务已启动且目录仍在。`
        );
      }

      if (req) setRequirement(req);
      setSessionId(sid);
      sessionFromStreamRef.current = sid;
      setOutputDir(outDir);
      setPhase(phase);
      setPipelineError(null);
      setPipeActive(false);
      setBusyLabel("");
      setLiveThought("");
      setFsAppliedSnapshot(
        JSON.stringify({
          requirement: req || requirement,
          pm: pmSolutionIdx,
          ui: uiSolutionIdx,
        })
      );
      setPreviewBust((b) => b + 1);
      await refreshSessionArtifacts(sid);

      try {
        const r = await fetch(
          apiUrl(`/generated/${encodeURIComponent(sid)}/测试点.md?bust=${bust}`)
        );
        if (r.ok) setQaMdPreview(cleanGeneratedMd(await r.text()));
      } catch {
        /* ignore */
      }
      try {
        const r = await fetch(
          apiUrl(`/generated/${encodeURIComponent(sid)}/运维手册.md?bust=${bust}`)
        );
        if (r.ok) setOpsMdPreview(await r.text());
      } catch {
        /* ignore */
      }

      const roles = ["pm", "ui", "fs", "qa", "ops"];
      const histMap = { pm: [], ui: [], fs: [], qa: [], ops: [] };
      for (const role of roles) {
        delete chatHistoryFetchedRef.current[`${sid}::${role}`];
        try {
          const res = await fetch(
            apiUrl(
              `/api/role/chat/history?role=${encodeURIComponent(role)}&sessionId=${encodeURIComponent(sid)}`
            )
          );
          if (res.ok) {
            const j = await res.json();
            if (j?.ok && Array.isArray(j.history)) histMap[role] = j.history;
          }
          chatHistoryFetchedRef.current[`${sid}::${role}`] = true;
        } catch {
          /* ignore */
        }
      }
      setChatHistory(histMap);
      setChatInput({ pm: "", ui: "", fs: "", qa: "", ops: "" });
      setChatImageItems({ pm: [], ui: [], fs: [], qa: [], ops: [] });

      if (phase === "done" || phase === "qa_review" || phase === "ops_review") {
        await loadPipelineTestPoints(sid);
        setQaSubTab("pipeline");
      }

      const roleByPhase = {
        pm_review: "pm",
        ui_review: "ui",
        done: "fs",
        qa_review: "qa",
        ops_review: "ops",
      };
      setRoleTab(roleByPhase[phase] || "fs");

      try {
        localStorage.setItem(
          "agile_sim_active_session",
          JSON.stringify({ sessionId: sid, outputDir: outDir, requirement: req, phase })
        );
      } catch {
        /* ignore */
      }

      setHistoryDetail(null);
      setHistoryModalOpen(false);
      const phaseHint = {
        pm_review: "产品经理阶段（有原型）",
        ui_review: "UI 阶段（有 ui.html）",
        done: "全栈已完成，可继续全栈追问 / 测试 / 运维",
        qa_review: "已有测试点，可测试岗或全栈继续优化",
        ops_review: "已有运维手册，可运维或全栈继续优化",
      }[phase];
      pushLog(`嵌入流水线：${sid} · ${phaseHint}`, true);
      window.alert(
        `已嵌入流水线，可继续开发。\n\n会话：${sid}\n状态：${phaseHint}\n\n` +
          `已恢复：需求文案、预览、各角色追问历史（若有）。\n` +
          `Cursor Cloud 下将沿用该会话已绑定的远端 Agent（若曾跑过产品经理阶段）。`
      );
    },
    [requirement, pmSolutionIdx, uiSolutionIdx, loadPipelineTestPoints, pushLog]
  );

  const notifyFullStackFromQa = async () => {
    if (!sessionId) return alert("缺少会话");
    if (!pipelineTestIssues.length) return alert("当前没有可通知的问题");
    try {
      const r = await fetch(apiUrl("/api/qa/pipeline/notify-fs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          issues: pipelineTestIssues,
          requirement,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setRoleTab("fs");
      setChatInput((prev) => ({ ...prev, fs: j.message }));
      pushLog("已将测试问题填入「全栈落地」追问框，请点击发送", true);
    } catch (e) {
      window.alert(String(e.message || e));
    }
  };

  const refreshFsPreview = useCallback(async () => {
    if (!sessionId) return window.alert("请先完成全栈落地");
    setPreviewBust((b) => b + 1);
    setTimeout(() => setPreviewBust((b) => b + 1), 350);
    let syncMsg = "预览已刷新（读取 app/ 下最新文件）";
    try {
      const r = await fetch(apiUrl("/api/fs/sync-app-preview"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        const parts = [];
        if (j.synced?.length) parts.push(`根目录→app：${j.synced.join("、")}`);
        if (j.promoted?.promoted?.length) {
          parts.push(`子目录 app/${j.promoted.from}/→app/：${j.promoted.promoted.join("、")}`);
        }
        if (parts.length) syncMsg = `预览已刷新；${parts.join("；")}`;
      } else if (r.status === 404) {
        syncMsg +=
          "。根目录→app 同步需重启 start.bat（当前 API 未加载新接口，不影响你手动改好的 app/ 文件）";
      } else if (j.error) {
        syncMsg += `。同步跳过：${j.error}`;
      }
    } catch (e) {
      syncMsg += `。同步请求未达：${String(e?.message || e)}`;
    }
    pushLog(syncMsg, true);
  }, [sessionId, pushLog]);

  const sendRoleChat = async (roleKey) => {
    const r = roleKey || roleTab;
    const text = (chatInput[r] || "").trim();
    const imgs = (chatImageItems[r] || []).slice(0, 4);
    if (!text && imgs.length === 0) return;
    if (!sessionId) {
      window.alert("请先完成本角色的主输出（产品经理 / UI / 全栈 / 测试 / 运维），追问对话需要会话目录。");
      return;
    }
    if (config.provider === "cursor") {
      if (!config.cursorApiKey) return window.alert("请填写 Cursor API Key");
      if (!config.cursorRepoUrl) return window.alert("Cursor Cloud 需要已授权仓库 URL");
    } else if (!config.apiKey) {
      return window.alert("请填写 API Key");
    }

    const userDisplay =
      text || (imgs.length ? `[附图 ${imgs.length} 张]` : "");
    setChatBusyRole(r);
    setChatHistory((prev) => ({
      ...prev,
      [r]: [...(prev[r] || []), { role: "user", content: userDisplay }],
    }));
    setChatInput((prev) => ({ ...prev, [r]: "" }));
    const imagesPayload = imgs
      .map((it) => dataUrlToImagePayload(it.dataUrl))
      .filter(Boolean);
    setChatImageItems((prev) => ({ ...prev, [r]: [] }));

    let assistantBuf = "";
    setChatHistory((prev) => ({
      ...prev,
      [r]: [...(prev[r] || []), { role: "assistant", content: "" }],
    }));
    const updateAssistant = (delta) => {
      assistantBuf += delta;
      setChatHistory((prev) => {
        const arr = [...(prev[r] || [])];
        if (arr.length === 0) return prev;
        const last = arr[arr.length - 1];
        if (last?.role === "assistant") {
          arr[arr.length - 1] = { role: "assistant", content: assistantBuf };
        }
        return { ...prev, [r]: arr };
      });
    };

    let didWriteFile = false;
    try {
      await consumeSse(
        apiUrl("/api/role/chat"),
        {
          role: r,
          sessionId,
          message: text || "（见附图）",
          requirement,
          config,
          images: imagesPayload,
        },
        (evt) => {
          if (evt.type === "delta" && evt.text) updateAssistant(evt.text);
          if (evt.type === "thought" && evt.text && (r === "fs" || r === "fullstack")) {
            const t = String(evt.text).trim();
            if (t.includes("跳过")) pushLog(t.replace(/\n/g, " "), false);
          }
          if (evt.type === "exec") {
            didWriteFile = true;
            pushLog(`执行：${evt.label}`, true);
          }
          if (evt.type === "artifact") {
            pushLog(`产出：${evt.name}`, true);
            if (r === "fs" && evt.name?.startsWith("app/")) didWriteFile = true;
          }
          if (evt.type === "error") {
            updateAssistant(`\n\n[错误] ${evt.message}`);
          }
        }
      );
    } catch (e) {
      updateAssistant(`\n\n[请求失败] ${String(e?.message || e)}`);
    } finally {
      setChatBusyRole("");
    }
    if (didWriteFile) {
      setPreviewBust((b) => b + 1);
      if (r === "fs") {
        pushLog(
          "已写入 app/ 下文件；上方预览与平台 iframe 一致。本地请打开 generated/…/app/，勿单独 serve prototype.html 或 clone 子目录。",
          true
        );
        setTimeout(() => setPreviewBust((b) => b + 1), 400);
        fetch(apiUrl("/api/fs/smoke-check"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        })
          .then((res) => res.json())
          .then((j) => {
            if (!j?.ok) return;
            if (j.ok && !j.issues?.length) {
              pushLog("[全栈自检] app 静态检查通过", true);
            } else if (j.issues?.length) {
              pushLog(`[全栈自检] ${j.issues.join("；")}`, false);
            }
          })
          .catch(() => {});
      }
    }
  };

  const pmPreviewRel =
    pmSolutionIdx === 0 && pmFile0IsLegacy
      ? "prototype.html"
      : pmVariantFile(pmSolutionIdx);
  const uiPreviewRel =
    uiSolutionIdx === 0 && uiFile0IsLegacy ? "ui.html" : uiVariantFile(uiSolutionIdx);

  const prototypeFrame =
    sessionId && pmVariantReady[pmSolutionIdx]
      ? `${apiUrl(`/generated/${encodeURIComponent(sessionId)}/${pmPreviewRel}`)}?bust=${previewBust}`
      : "";
  const uiFrame =
    sessionId && uiVariantReady[uiSolutionIdx]
      ? `${apiUrl(`/generated/${encodeURIComponent(sessionId)}/${uiPreviewRel}`)}?bust=${previewBust}`
      : "";

  const pmPreviewGenerating =
    variantBusy?.role === "pm" && variantBusy.idx === pmSolutionIdx && phase === "pm";
  const uiPreviewGenerating =
    variantBusy?.role === "ui" && variantBusy.idx === uiSolutionIdx && phase === "ui";

  const showPmPrototypeIframe =
    !!prototypeFrame && !!sessionId && !pmPreviewGenerating;
  const showUiStageIframe = !!uiFrame && !!sessionId && !uiPreviewGenerating;

  const busy = pipeActive || !!busyLabel;

  /** 清空当前工作区（输入/截图/三步结果/草稿），保留已保存列表与模型配置 */
  const clearTpWorkspace = useCallback(() => {
    if (busy) return;
    const hasContent =
      !!qaMaterial.trim() ||
      qaImageItems.length > 0 ||
      !!qaFrameworkPreview.trim() ||
      !!qaBizPreview.trim() ||
      !!qaMdPreview.trim() ||
      !!qaReviewPreview.trim() ||
      !!qaPwSpecPreview.trim();
    if (
      hasContent &&
      !window.confirm(
        "清空当前原型说明、截图与已生成的框架/场景/功能/评审/PW？\n（已保存到列表的记录不会删除）"
      )
    ) {
      return;
    }
    if (tpDraftTimerRef.current) {
      clearTimeout(tpDraftTimerRef.current);
      tpDraftTimerRef.current = null;
    }
    clearTpDraftForProject(workbenchProject.projectId);
    setQaMaterial("");
    setTpLinkMode("off");
    setQaFrontUrl("");
    setQaBackUrl("");
    setQaDualNotes("");
    setQaProtoLabelA("");
    setQaProtoLabelB("");
    setQaImageItems([]);
    setQaFrameworkPreview("");
    setQaBizPreview("");
    setQaSpecialPreview("");
    setQaMdPreview("");
    setQaReviewPreview("");
    setQaReviewHistory([]);
    setTpAutoPipe(null);
    setQaPwSpecPreview("");
    setTpPreviewTab("framework");
    setTpActiveRecordId("");
    setTpScanStory(null);
    setTpScanFallbackSteps(null);
    setTpScanning(false);
    tpScanAckSentRef.current = false;
    qaFrameworkRef.current = "";
    qaBizRef.current = "";
    qaSpecialRef.current = "";
    qaFuncRef.current = "";
    qaReviewRef.current = "";
    setSessionId("");
    sessionFromStreamRef.current = "";
    setQaBusyMode("");
    setBusyLabel("");
    setPipeActive(false);
    setPipelineError(null);
    setLiveThought("");
  }, [
    busy,
    workbenchProject.projectId,
    qaMaterial,
    qaImageItems,
    qaFrameworkPreview,
    qaBizPreview,
    qaMdPreview,
    qaReviewPreview,
    qaPwSpecPreview,
  ]);

  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => setSseUiTick((n) => n + 1), 400);
    return () => clearInterval(id);
  }, [busy]);

  const canRunUi =
    !!sessionId &&
    !busy &&
    pmFinalizedIdx !== null &&
    pmVariantReady[pmFinalizedIdx] &&
    phase !== "idle" &&
    phase !== "pm";
  const canRunFs =
    !!sessionId &&
    !busy &&
    uiFinalizedIdx !== null &&
    uiVariantReady[uiFinalizedIdx] &&
    (phase === "ui_review" ||
      phase === "fs" ||
      phase === "done" ||
      phase === "qa" ||
      phase === "qa_review" ||
      phase === "ops" ||
      phase === "ops_review");
  const qaInputsReady =
    !!requirement.trim() ||
    (tpDualMode
      ? !!(String(qaFrontUrl || "").trim() || String(qaBackUrl || "").trim() || String(qaDualNotes || "").trim())
      : !!qaMaterial.trim()) ||
    qaImageItems.length > 0;
  const canRunQa =
    qaSubTab === "standalone" &&
    !busy &&
    qaInputsReady &&
    (config.provider === "cursor"
      ? !!(config.cursorApiKey && config.cursorRepoUrl)
      : !!config.apiKey);

  const canRunQaPipeline =
    qaSubTab === "pipeline" &&
    !!sessionId &&
    !busy &&
    !pipelineGenerating &&
    (phase === "done" ||
      phase === "qa" ||
      phase === "qa_review" ||
      phase === "ops" ||
      phase === "ops_review") &&
    (config.provider === "cursor"
      ? !!config.cursorApiKey
      : !!config.apiKey);

  const opsInputsReady =
    !!requirement.trim() ||
    !!opsMaterial.trim() ||
    opsImageItems.length > 0;
  const canRunOps =
    !busy &&
    opsInputsReady &&
    (config.provider !== "cursor" || !!sessionId) &&
    (config.provider === "cursor"
      ? !!(config.cursorApiKey && config.cursorRepoUrl)
      : !!config.apiKey);

  const reqInputsReady = !!requirement.trim() || reqImageItems.length > 0;
  const pmConfigReady =
    config.provider === "cursor"
      ? !!(config.cursorApiKey && config.cursorRepoUrl)
      : !!config.apiKey;

  const canSummarizeReq =
    reqInputsReady && !busy && !pmSpecGenerating && pmConfigReady;

  const canRunPmAction =
    !!pmSpecMd.trim() &&
    !busy &&
    !pmSpecGenerating &&
    pmConfigReady;

  const runPmForSolution = (solutionIdx) => runPm(solutionIdx);
  const runUiForSolution = (solutionIdx) => runUi(solutionIdx);

  const finalizePm = async (solutionIdx) => {
    const idx = Math.max(0, Math.min(2, solutionIdx));
    const sid = sessionId || sessionFromStreamRef.current;
    if (!sid) return alert("请先生成任一方案的原型");
    if (!pmVariantReady[idx]) return alert("请先生成该方案的原型预览");
    try {
      const r = await fetch(apiUrl("/api/session/finalize"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, role: "pm", solutionIndex: idx }),
      });
      const j = await r.json();
      if (!j.ok) return alert(j.error || "定稿失败");
      setPmFinalizedIdx(idx);
      setPmSolutionIdx(idx);
      setPreviewBust((b) => b + 1);
      pushLog(`产品经理已定稿：${pmSolutions[idx].title}`, true);
      if (phase === "idle" || phase === "pm") setPhase("pm_review");
    } catch (e) {
      alert(String(e.message || e));
    }
  };

  const finalizeUi = async (solutionIdx) => {
    const idx = Math.max(0, Math.min(2, solutionIdx));
    const sid = sessionId || sessionFromStreamRef.current;
    if (!sid) return alert("请先生成 UI");
    if (!uiVariantReady[idx]) return alert("请先生成该方案的 UI 预览");
    try {
      const r = await fetch(apiUrl("/api/session/finalize"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, role: "ui", solutionIndex: idx }),
      });
      const j = await r.json();
      if (!j.ok) return alert(j.error || "定稿失败");
      setUiFinalizedIdx(idx);
      setUiSolutionIdx(idx);
      setPreviewBust((b) => b + 1);
      pushLog(`UI 已定稿：${uiSolutions[idx].title}`, true);
      if (phase === "ui" || phase === "pm_review") setPhase("ui_review");
    } catch (e) {
      alert(String(e.message || e));
    }
  };

  const downloadMarkdown = (filename, text) => {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadXmind = useCallback(async (markdown, filename, title) => {
    const md = stripTraceAnchorsForExport(
      stripPriorityForXmind(cleanGeneratedMd(markdown))
    );
    if (!md) return;
    try {
      const res = await fetch("/api/test-point-gen/export-xmind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown: md,
          filename: filename || "导出.xmind",
          title: title || "画布 1",
        }),
      });
      if (!res.ok) {
        let msg = "导出失败";
        try {
          const j = await res.json();
          msg = j.error || msg;
        } catch {
          /* ignore */
        }
        window.alert(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "导出.xmind";
      a.click();
      URL.revokeObjectURL(url);
      pushLog(`已下载 ${filename || "导出.xmind"}`, true);
    } catch {
      window.alert("导出 XMind 失败，请确认工作台服务已启动");
    }
  }, [pushLog]);

  // 必须在 downloadZentaoCsv 等依赖它的 hook 之前声明，否则 TDZ 白屏
  const tpProjectName = useMemo(
    () =>
      extractProjectName(
        qaFrameworkPreview,
        qaBizPreview,
        qaMdPreview,
        qaMaterial
      ) || workbenchProject.projectName || "未命名项目",
    [
      qaFrameworkPreview,
      qaBizPreview,
      qaMdPreview,
      qaMaterial,
      workbenchProject.projectName,
    ]
  );

  const downloadZentaoCsv = useCallback(async () => {
    const framework = stripTraceAnchorsForExport(
      cleanGeneratedMd(qaFrameworkPreview)
    );
    const business = stripTraceAnchorsForExport(cleanGeneratedMd(qaBizPreview));
    const funcMd = stripTraceAnchorsForExport(cleanGeneratedMd(qaMdPreview));
    if (!framework && !business && !funcMd) {
      window.alert("请先生成框架 / 业务场景 / 功能测试点");
      return;
    }
    let zt = { url: "http://zentao.example.com", pathPrefix: "", user: "", password: "" };
    try {
      const raw = localStorage.getItem("gantt-zentao-config-v1");
      if (raw) zt = { ...zt, ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
    if (!zt.user || !zt.password) {
      window.alert("请先在甘特图「禅道账号」里配置地址/账号/密码");
      return;
    }
    const savedPid = localStorage.getItem("tp-zentao-product-id") || "";
    const productRaw = window.prompt(
      "禅道产品 ID（用例所属产品，每次可改，不固定）",
      savedPid
    );
    if (productRaw == null) return;
    const productId = parseInt(String(productRaw).trim(), 10);
    if (!productId) {
      window.alert("产品 ID 无效");
      return;
    }
    localStorage.setItem("tp-zentao-product-id", String(productId));

    const guessedRoot = resolveZentaoModuleRoot(qaMaterial, ganttPrototypes);
    const rootRaw = window.prompt(
      "禅道模块顶层（区分小程序/后台，避免模块混在一起）\n例如：小程序、魁星岩后台\n留空则不加顶层（旧行为）",
      guessedRoot || ""
    );
    if (rootRaw == null) return;
    const moduleRoot = String(rootRaw).trim().slice(0, 40);

    const mode = window.prompt(
      "导入方式：\n1 = 同步模块并一键导入禅道（推荐）\n2 = 仅同步模块并下载 CSV\n3 = 仅下载 CSV（不调禅道）",
      "1"
    );
    if (mode == null) return;
    const m = String(mode).trim();
    const pushToZentao = m === "1";
    const syncModules = m === "1" || m === "2";
    if (!pushToZentao && m !== "2" && m !== "3") {
      window.alert("请输入 1 / 2 / 3");
      return;
    }

    const filename =
      `${safeFilePart(tpProjectName)}` +
      (moduleRoot ? `_${safeFilePart(moduleRoot)}` : "") +
      `_禅道用例.csv`;

    // 方式 1：SSE 真实进度导入
    if (pushToZentao) {
      setTpZentaoPipe({
        active: true,
        percent: 5,
        label: moduleRoot ? `准备导入（${moduleRoot}）…` : "准备导入…",
        browseUrl: "",
        error: "",
        caseCount: 0,
      });
      try {
        const res = await fetch("/api/test-point-gen/import-zentao-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            framework,
            businessScenarios: business,
            specialMd: stripTraceAnchorsForExport(
              cleanGeneratedMd(qaSpecialPreview)
            ),
            markdown: funcMd,
            filename,
            syncModules: true,
            productId,
            moduleRoot,
            url: zt.url || "",
            pathPrefix: zt.pathPrefix || "",
            user: zt.user || "",
            password: zt.password || "",
          }),
        });
        if (!res.ok || !res.body) {
          let msg = "导入请求失败";
          try {
            const j = await res.json();
            msg = j.error || msg;
          } catch {
            /* ignore */
          }
          throw new Error(msg);
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let donePayload = null;
        let lastErr = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const chunks = buf.split("\n\n");
          buf = chunks.pop() || "";
          for (const chunk of chunks) {
            const line = chunk
              .split("\n")
              .map((l) => l.trim())
              .find((l) => l.startsWith("data:"));
            if (!line) continue;
            let evt = null;
            try {
              evt = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }
            if (evt.type === "progress") {
              setTpZentaoPipe((p) =>
                p
                  ? {
                      ...p,
                      active: true,
                      percent: Math.max(0, Math.min(100, Number(evt.percent) || 0)),
                      label: evt.step || p.label,
                    }
                  : p
              );
            } else if (evt.type === "error") {
              lastErr = String(evt.message || "导入失败");
              setTpZentaoPipe((p) =>
                p
                  ? {
                      ...p,
                      active: false,
                      error: lastErr,
                      label: "导入失败",
                    }
                  : p
              );
            } else if (evt.type === "done") {
              donePayload = evt;
            }
          }
        }
        if (!donePayload?.ok) {
          const errMsg =
            lastErr || "导入未完成（模块可能已同步，用例未写入）";
          setTpZentaoPipe((p) =>
            p
              ? {
                  ...p,
                  active: false,
                  error: errMsg,
                  label: "导入失败",
                }
              : {
                  active: false,
                  percent: 0,
                  label: "导入失败",
                  error: errMsg,
                  browseUrl: "",
                  caseCount: 0,
                }
          );
          pushLog(`禅道导入失败：${errMsg}`, false);
          return;
        }
        const n = Number(donePayload.caseCount || 0);
        const browse =
          donePayload.browseUrl ||
          donePayload.import?.browseUrl ||
          "";
        setTpZentaoPipe({
          active: false,
          percent: 100,
          label: `已写入禅道 ${n} 条用例`,
          browseUrl: browse,
          error: "",
          caseCount: n,
          builtCaseCount: donePayload.builtCaseCount || n,
        });
        pushLog(
          `已导入禅道 ${n} 条` +
            (moduleRoot ? ` · 顶层「${moduleRoot}」` : "") +
            (donePayload.sync?.synced ? " · 已同步模块" : "") +
            (donePayload.import?.confirmedPages != null
              ? ` · 确认 ${donePayload.import.confirmedPages} 页`
              : ""),
          true
        );
      } catch (e) {
        const msg = String(e?.message || e);
        setTpZentaoPipe({
          active: false,
          percent: 0,
          label: "导入失败",
          browseUrl: "",
          error: msg,
          caseCount: 0,
        });
        pushLog(`禅道导入失败：${msg}`, false);
      }
      return;
    }

    try {
      const res = await fetch("/api/test-point-gen/export-zentao-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          framework,
          businessScenarios: business,
          specialMd: stripTraceAnchorsForExport(
            cleanGeneratedMd(qaSpecialPreview)
          ),
          markdown: funcMd,
          filename,
          syncModules,
          pushToZentao: false,
          productId,
          moduleRoot,
          url: zt.url || "",
          pathPrefix: zt.pathPrefix || "",
          user: zt.user || "",
          password: zt.password || "",
        }),
      });
      if (!res.ok) {
        let msg = "操作失败";
        try {
          const j = await res.json();
          msg = j.error || msg;
        } catch {
          /* ignore */
        }
        window.alert(msg);
        return;
      }
      const blob = await res.blob();
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(dlUrl);
      const n = res.headers.get("X-Zentao-Case-Count") || "";
      pushLog(
        `已导出禅道 CSV${n ? `（${n} 条）` : ""}` +
          (moduleRoot ? ` · 顶层「${moduleRoot}」` : "") +
          (syncModules ? " · 已同步模块" : ""),
        true
      );
    } catch {
      window.alert("禅道导入/导出失败，请确认工作台服务已启动");
    }
  }, [
    cleanGeneratedMd,
    ganttPrototypes,
    pushLog,
    qaBizPreview,
    qaFrameworkPreview,
    qaMaterial,
    qaMdPreview,
    qaSpecialPreview,
    tpProjectName,
  ]);

  const importProductCases = useCallback(async () => {
    const framework = stripTraceAnchorsForExport(
      cleanGeneratedMd(qaFrameworkPreview)
    );
    const business = stripTraceAnchorsForExport(cleanGeneratedMd(qaBizPreview));
    const funcMd = stripTraceAnchorsForExport(cleanGeneratedMd(qaMdPreview));
    if (!framework && !business && !funcMd) {
      window.alert("请先生成框架 / 业务场景 / 功能测试点");
      return;
    }
    const cfg = promptProductSystemConfig({ needSuite: true });
    if (!cfg) return;
    const guessedRoot = resolveZentaoModuleRoot(qaMaterial, ganttPrototypes);
    const rootRaw = window.prompt(
      "模块顶层（区分小程序/后台，可留空）\n例如：小程序、魁星岩后台",
      guessedRoot || ""
    );
    if (rootRaw == null) return;
    const moduleRoot = String(rootRaw).trim().slice(0, 40);

    setTpProductPipe({
      active: true,
      kind: "cases",
      percent: 5,
      label: "准备导入用例到产品系统…",
      browseUrl: cfg.baseUrl || "https://product.example.com",
      error: "",
      caseCount: 0,
      bugCount: 0,
    });
    try {
      const res = await fetch("/api/test-point-gen/import-product-cases-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          framework,
          businessScenarios: business,
          specialMd: stripTraceAnchorsForExport(
            cleanGeneratedMd(qaSpecialPreview)
          ),
          markdown: funcMd,
          moduleRoot,
          writeKey: cfg.writeKey,
          suiteId: cfg.suiteId,
          baseUrl: cfg.baseUrl || "",
        }),
      });
      const { donePayload, lastErr } = await readSseJsonStream(res, (evt) => {
        if (evt.type === "progress") {
          setTpProductPipe((p) =>
            p
              ? {
                  ...p,
                  active: true,
                  percent: Math.max(0, Math.min(100, Number(evt.percent) || 0)),
                  label: evt.step || p.label,
                }
              : p
          );
        } else if (evt.type === "error") {
          setTpProductPipe((p) =>
            p
              ? {
                  ...p,
                  active: false,
                  error: String(evt.message || "导入失败"),
                  label: "导入失败",
                }
              : p
          );
        }
      });
      if (!donePayload?.ok) {
        const errMsg = lastErr || "导入未完成";
        setTpProductPipe((p) =>
          p
            ? { ...p, active: false, error: errMsg, label: "导入失败" }
            : {
                active: false,
                kind: "cases",
                percent: 0,
                label: "导入失败",
                error: errMsg,
                browseUrl: "",
                caseCount: 0,
                bugCount: 0,
              }
        );
        pushLog(`产品系统用例导入失败：${errMsg}`, false);
        return;
      }
      const n = Number(donePayload.caseCount || 0);
      const skipped = Number(donePayload.skipped || 0);
      setTpProductPipe({
        active: false,
        kind: "cases",
        percent: 100,
        label:
          `已写入产品系统 ${n} 条用例` + (skipped ? `（跳过 ${skipped}）` : ""),
        browseUrl: donePayload.browseUrl || cfg.baseUrl || "",
        error: "",
        caseCount: n,
        bugCount: 0,
        builtCaseCount: donePayload.builtCaseCount || n,
      });
      pushLog(
        `已导入产品系统用例 ${n} 条` +
          (moduleRoot ? ` · 顶层「${moduleRoot}」` : "") +
          (skipped ? ` · 跳过 ${skipped}` : ""),
        true
      );
    } catch (e) {
      const msg = String(e?.message || e);
      setTpProductPipe({
        active: false,
        kind: "cases",
        percent: 0,
        label: "导入失败",
        browseUrl: "",
        error: msg,
        caseCount: 0,
        bugCount: 0,
      });
      pushLog(`产品系统用例导入失败：${msg}`, false);
    }
  }, [
    cleanGeneratedMd,
    ganttPrototypes,
    pushLog,
    qaBizPreview,
    qaFrameworkPreview,
    qaMaterial,
    qaMdPreview,
    qaSpecialPreview,
  ]);

  const importProductBugsFromXmind = useCallback(async () => {
    const cfg = promptProductSystemConfig({ needVersion: true });
    if (!cfg) return;

    const file = await new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".xmind,application/vnd.xmind.workbook";
      input.onchange = () => resolve(input.files?.[0] || null);
      input.click();
    });
    if (!file) return;

    setTpProductPipe({
      active: true,
      kind: "bugs",
      percent: 4,
      label: `上传 ${file.name}…`,
      browseUrl: cfg.baseUrl || "https://product.example.com",
      error: "",
      caseCount: 0,
      bugCount: 0,
    });
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      fd.append("writeKey", cfg.writeKey);
      fd.append("baseUrl", cfg.baseUrl || "");
      fd.append("versionId", cfg.versionId || "");
      fd.append("reporterName", cfg.reporterName || "测试同学");
      fd.append("source", "工作台XMind");
      if (cfg.assigneeMap && typeof cfg.assigneeMap === "object") {
        fd.append("assigneeMap", JSON.stringify(cfg.assigneeMap));
      }
      const res = await fetch("/api/test-point-gen/import-product-bugs-stream", {
        method: "POST",
        body: fd,
      });
      const { donePayload, lastErr } = await readSseJsonStream(res, (evt) => {
        if (evt.type === "progress") {
          setTpProductPipe((p) =>
            p
              ? {
                  ...p,
                  active: true,
                  percent: Math.max(0, Math.min(100, Number(evt.percent) || 0)),
                  label: evt.step || p.label,
                }
              : p
          );
        } else if (evt.type === "error") {
          setTpProductPipe((p) =>
            p
              ? {
                  ...p,
                  active: false,
                  error: String(evt.message || "导入失败"),
                  label: "导入失败",
                }
              : p
          );
        }
      });
      if (!donePayload?.ok) {
        const errMsg = lastErr || "Bug 导入未完成";
        setTpProductPipe((p) =>
          p
            ? { ...p, active: false, error: errMsg, label: "导入失败" }
            : {
                active: false,
                kind: "bugs",
                percent: 0,
                label: "导入失败",
                error: errMsg,
                browseUrl: "",
                caseCount: 0,
                bugCount: 0,
              }
        );
        pushLog(`产品系统 Bug 导入失败：${errMsg}`, false);
        return;
      }
      const n = Number(donePayload.bugCount || 0);
      const skipped = Number(donePayload.skipped || 0);
      const withShot = Number(donePayload.withScreenshot || 0);
      setTpProductPipe({
        active: false,
        kind: "bugs",
        percent: 100,
        label:
          `已写入产品系统 ${n} 条 Bug` +
          (withShot ? `（${withShot} 条含截图）` : "") +
          (skipped ? ` · 跳过 ${skipped}` : ""),
        browseUrl: donePayload.browseUrl || cfg.baseUrl || "",
        error: "",
        caseCount: 0,
        bugCount: n,
        builtBugCount: donePayload.builtBugCount || n,
        withScreenshot: withShot,
      });
      pushLog(
        `已导入产品系统 Bug ${n} 条` +
          (withShot ? ` · 含截图 ${withShot}` : "") +
          (skipped ? ` · 跳过 ${skipped}` : ""),
        true
      );
    } catch (e) {
      const msg = String(e?.message || e);
      setTpProductPipe({
        active: false,
        kind: "bugs",
        percent: 0,
        label: "导入失败",
        browseUrl: "",
        error: msg,
        caseCount: 0,
        bugCount: 0,
      });
      pushLog(`产品系统 Bug 导入失败：${msg}`, false);
    }
  }, [pushLog]);

  const onPickQaImages = (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    const cap = Math.max(0, 12 - qaImageItems.length);
    files.slice(0, cap).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        if (dataUrl)
          setQaImageItems((prev) => [...prev, { name: file.name, dataUrl }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const onPasteReqImages = (e) => {
    const items = e.clipboardData?.items;
    if (!items?.length) return;
    let added = false;
    for (const item of items) {
      if (!item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (!file) continue;
      e.preventDefault();
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        if (dataUrl) {
          setReqImageItems((prev) =>
            [...prev, { name: file.name || "粘贴图", dataUrl }].slice(0, 12)
          );
        }
      };
      reader.readAsDataURL(file);
      added = true;
    }
    if (added) e.preventDefault();
  };

  const onPickReqImages = (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    const cap = Math.max(0, 12 - reqImageItems.length);
    files.slice(0, cap).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        if (dataUrl) setReqImageItems((prev) => [...prev, { name: file.name, dataUrl }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const onPickOpsImages = (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    const cap = Math.max(0, 12 - opsImageItems.length);
    files.slice(0, cap).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        if (dataUrl)
          setOpsImageItems((prev) => [...prev, { name: file.name, dataUrl }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const appFrame = sessionId
    ? `${apiUrl(`/generated/${encodeURIComponent(sessionId)}/app/index.html`)}?bust=${previewBust}`
    : "";

  const fsPlanDirty =
    !!outputDir &&
    !!fsAppliedSnapshot &&
    buildPlanSnapshot() !== fsAppliedSnapshot;

  const pipelinePointsGrouped = useMemo(() => {
    const rows = [];
    let lastKind = null;
    pipelineTestPoints.forEach((pt, idx) => {
      const kind = pt.kind || "functional";
      if (kind !== lastKind) {
        rows.push({ type: "header", kind });
        lastKind = kind;
      }
      rows.push({ type: "item", pt, idx });
    });
    return rows;
  }, [pipelineTestPoints]);

  useEffect(() => {
    if (!logOpen || !logScrollRef.current) return;
    logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
  }, [logLines, logOpen, pipelineTesting, liveThought]);

  useEffect(() => {
    if (!busy) setOverlayCompact(false);
  }, [busy]);

  const copyText = useCallback(
    async (text, okMsg) => {
      try {
        await navigator.clipboard.writeText(String(text || ""));
        pushLog(okMsg || "已复制", true);
      } catch {
        window.alert("复制失败");
      }
    },
    [pushLog]
  );

  const saveTpSkill = useCallback(async () => {
    try {
      const r = await workbenchApi("/api/test-point-gen/skill", {
        method: "PUT",
        body: JSON.stringify({ skill: qaSkill }),
      });
      if (r.ok) {
        setTpSkillMsg("Skill 已保存");
        window.setTimeout(() => setTpSkillMsg(""), 2500);
      } else {
        window.alert(r.error || "保存 Skill 失败");
      }
    } catch {
      window.alert("保存 Skill 失败，请确认工作台服务已启动");
    }
  }, [qaSkill]);

  const openTpAssetPicker = useCallback(async () => {
    setTpAssetPickerOpen(true);
    setTpAssetLoading(true);
    try {
      const q = encodeURIComponent(tpAssetQuery || "");
      const data = await workbenchApi(
        `/api/project-assets/for-test-point-gen${q ? `?q=${q}` : ""}`
      );
      setTpAssetList(Array.isArray(data.items) ? data.items : []);
    } catch {
      setTpAssetList([]);
      window.alert("加载项目资产失败");
    } finally {
      setTpAssetLoading(false);
    }
  }, [tpAssetQuery]);

  const applyTpAsset = useCallback(
    async (item) => {
      if (!item) return;
      const parts = [];
      const url = decodeUrlsInText(String(item.url || "").trim());
      const note = String(item.note || "").trim();
      const name = String(item.name || "").trim();
      if (url) parts.push(url);
      if (name) parts.push(`【资产】${name}${item.project ? ` · ${item.project}` : ""}`);
      if (note) parts.push(note);
      if (item.kind === "text" && item.path) {
        try {
          const t = await workbenchApi(
            `/api/project-assets/text-file?path=${encodeURIComponent(item.path)}`
          );
          if (t?.content) parts.push(decodeUrlsInText(String(t.content)));
        } catch {
          /* ignore */
        }
      }
      if (!parts.length) return window.alert("该资产没有可导入的 URL / 说明");
      setQaMaterial(parts.join("\n\n"));
      setTpAssetPickerOpen(false);
      pushLog(`已导入项目资产：${name || url}`, true);
    },
    [pushLog]
  );

  const resetTpSkill = useCallback(() => {
    setQaSkill(qaSkillDefault || "");
    setTpSkillMsg("已恢复默认 Skill（点「保存 Skill」写入磁盘）");
    window.setTimeout(() => setTpSkillMsg(""), 2500);
  }, [qaSkillDefault]);

  const canSaveTpRecord =
    !!(qaFrameworkPreview.trim() || qaBizPreview.trim() || qaMdPreview.trim() || qaSpecialPreview.trim());

  const tpStepDone = useMemo(
    () => ({
      1: !!qaFrameworkPreview.trim(),
      2: !!qaBizPreview.trim(),
      3: !!qaMdPreview.trim(),
      4: !!qaSpecialPreview.trim(),
    }),
    [qaFrameworkPreview, qaBizPreview, qaMdPreview, qaSpecialPreview]
  );

  const tpDoneCount =
    (tpStepDone[1] ? 1 : 0) +
    (tpStepDone[2] ? 1 : 0) +
    (tpStepDone[3] ? 1 : 0) +
    (tpStepDone[4] ? 1 : 0);

  const tpNextStep = !tpStepDone[1]
    ? 1
    : !tpStepDone[2]
      ? 2
      : !tpStepDone[3]
        ? 3
        : !tpStepDone[4]
          ? 4
          : null;

  const runTpStep = (step) => {
    if (step === 1) return runQaFramework();
    if (step === 2) return runQaBiz();
    if (step === 3) return runQa();
    if (step === 4) return runQaSpecial();
  };

  const scopedTpRecords = useMemo(
    () =>
      workbenchProject.projectId
        ? tpRecords.filter((rec) => rec.projectId === workbenchProject.projectId)
        : tpRecords,
    [tpRecords, workbenchProject.projectId]
  );

  const currentProtoUrl = useMemo(
    () => extractPrototypeUrl(qaMaterial),
    [qaMaterial]
  );

  const prevTpRecord = useMemo(() => {
    if (!currentProtoUrl) return null;
    return (
      scopedTpRecords.find((rec) => {
        const recUrl = rec.prototypeUrl || extractPrototypeUrl(rec.material);
        return recUrl && recUrl === currentProtoUrl;
      }) || null
    );
  }, [scopedTpRecords, currentProtoUrl]);

  const tpDiff = useMemo(() => {
    if (!prevTpRecord) return null;
    const packs = [
      { key: "framework", label: "页面框架", cur: qaFrameworkPreview, old: prevTpRecord.framework },
      { key: "biz", label: "业务场景", cur: qaBizPreview, old: prevTpRecord.businessScenarios },
      { key: "func", label: "页面功能", cur: qaMdPreview, old: prevTpRecord.markdown },
    ];
    const parts = packs.map((p) => {
      const cur = cleanGeneratedMd(p.cur);
      const old = cleanGeneratedMd(p.old);
      if (!cur && !old) return { ...p, added: [], removed: [] };
      const d = mdLineDiff(old, cur);
      return { ...p, ...d };
    });
    const added = parts.reduce((n, p) => n + p.added.length, 0);
    const removed = parts.reduce((n, p) => n + p.removed.length, 0);
    const hasCurrent = !!(qaFrameworkPreview.trim() || qaBizPreview.trim() || qaMdPreview.trim() || qaSpecialPreview.trim());
    return { parts, added, removed, hasCurrent };
  }, [prevTpRecord, qaFrameworkPreview, qaBizPreview, qaMdPreview]);

  const saveTpRecord = useCallback(async () => {
    if (!canSaveTpRecord) return;
    const theme = extractProjectName(
      qaFrameworkPreview,
      qaBizPreview,
      qaMdPreview,
      qaMaterial
    );
    const stamp = formatHumanTime();
    try {
      const r = await workbenchApi("/api/test-point-gen/records", {
        method: "POST",
        body: JSON.stringify({
          title: `${theme} · ${stamp}`,
          theme,
          prototypeUrl: extractPrototypeUrl(qaMaterial),
          projectId: workbenchProject.projectId || "",
          projectName: workbenchProject.projectName || "",
          assetId: workbenchProject.assetId || "",
          material: qaMaterial,
          framework: cleanGeneratedMd(qaFrameworkPreview),
          businessScenarios: cleanGeneratedMd(qaBizPreview),
          markdown: cleanGeneratedMd(qaMdPreview),
          specialMd: cleanGeneratedMd(qaSpecialPreview),
          reviewReport: cleanGeneratedMd(qaReviewPreview),
          reviewHistory: qaReviewHistory.slice(-20),
          playwrightSpec: String(qaPwSpecPreview || "").trim(),
          sessionId: sessionId || sessionFromStreamRef.current || "",
        }),
      });
      if (r.ok) {
        setTpRecords(r.records || []);
        setTpActiveRecordId(r.record?.id || "");
        pushLog("已保存到测试点列表（含框架 / 业务场景 / 页面测试点 / 评审）", true);
      } else {
        window.alert(r.error || "保存失败");
      }
    } catch {
      window.alert("保存失败，请确认工作台服务已启动");
    }
  }, [
    canSaveTpRecord,
    qaFrameworkPreview,
    qaBizPreview,
    qaMdPreview,
    qaReviewPreview,
    qaReviewHistory,
    qaPwSpecPreview,
    qaMaterial,
    workbenchProject,
    sessionId,
    pushLog,
  ]);

  const loadTpRecord = useCallback((rec) => {
    if (!rec) return;
    setTpActiveRecordId(rec.id || "");
    if (rec.projectId) {
      setWorkbenchProject((prev) => ({
        ...prev,
        projectId: rec.projectId,
        projectName: rec.projectName || "",
        assetId: rec.assetId || "",
      }));
    }
    const mat = rec.material || "";
    const parsed = parseDualPrototypeMaterial(mat);
    tpDualSyncLockRef.current = true;
    setQaMaterial(mat);
    if (parsed.kind === "multi" || parsed.kind === "dual") {
      setTpLinkMode(parsed.kind);
      setQaFrontUrl(parsed.frontUrl);
      setQaBackUrl(parsed.backUrl);
      setQaDualNotes(parsed.notes);
    } else {
      setTpLinkMode("off");
      setQaFrontUrl("");
      setQaBackUrl("");
      setQaDualNotes("");
      setQaProtoLabelA("");
      setQaProtoLabelB("");
    }
    queueMicrotask(() => {
      tpDualSyncLockRef.current = false;
    });
    setQaFrameworkPreview(rec.framework || "");
    setQaBizPreview(rec.businessScenarios || "");
    setQaSpecialPreview(rec.specialMd || "");
    qaSpecialRef.current = rec.specialMd || "";
    setQaMdPreview(rec.markdown || "");
    setQaReviewPreview(rec.reviewReport || "");
    setQaReviewHistory(Array.isArray(rec.reviewHistory) ? rec.reviewHistory.slice(0, 20) : []);
    setQaPwSpecPreview(rec.playwrightSpec || "");
    if (rec.playwrightSpec) setTpPreviewTab("pw");
    else if (rec.reviewReport) setTpPreviewTab("review");
    else if (rec.framework) setTpPreviewTab("framework");
    else if (rec.businessScenarios) setTpPreviewTab("biz");
    else if (rec.markdown) setTpPreviewTab("func");
  }, []);

  const deleteTpRecord = useCallback(
    async (id) => {
      if (!id) return;
      try {
        const r = await workbenchApi(`/api/test-point-gen/records/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (r.ok) {
          setTpRecords(r.records || []);
          if (tpActiveRecordId === id) setTpActiveRecordId("");
          pushLog("已删除记录", true);
        }
      } catch {
        window.alert("删除失败");
      }
    },
    [tpActiveRecordId, pushLog]
  );

  const copyTestIssuesMd = useCallback(() => {
    if (!pipelineTestIssues.length) return;
    const body = pipelineTestIssues
      .map((it, i) => `${i + 1}. ${it.title || "项"}\n   ${it.reason || ""}`)
      .join("\n\n");
    copyText(body, "已复制测试问题列表");
  }, [pipelineTestIssues, copyText]);

  const reqBullets = useMemo(() => {
    const t = requirement.trim();
    if (!t) return ["（请填写上方用户需求）"];
    const parts = t
      .split(/[\n。;；]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length ? parts : [t];
  }, [requirement]);

  const previewRailTitle = embedStandaloneQa
    ? "测试点文档预览"
    : roleTab === "pm"
      ? "原型预览"
      : roleTab === "ui"
        ? "UI 预览"
        : roleTab === "fs"
          ? "全栈 app 预览"
          : roleTab === "qa"
            ? qaSubTab === "pipeline"
              ? "被测 app 预览"
              : "测试点文档预览"
            : "运维手册预览";

  return (
    <div
      className={
        "shell" +
        (embedStandaloneQa ? " shell-embed-standalone-qa" : "") +
        (embedDataVerify ? " shell-embed-data-verify" : "")
      }
    >
      {/* 测试点改版布局：进度/扫描都在预览区内播，不再用旧版「盖住右侧 58%」浮层（会挤空白、挡住扫描动画） */}
      {busy && !(embedStandaloneQa && qaBusyMode) && !embedDataVerify ? (
        <div
          className={
            "overlay" +
            (overlayCompact ? " overlay-compact" : "")
          }
          aria-busy="true"
        >
          <div
            className={
              "overlay-inner overlay-progress-panel" +
              (qaBusyMode ? " overlay-timeline-panel" : "")
            }
            data-metrics-tick={sseUiTick}
          >
            {(() => {
              const m = streamMetricsRef.current;
              const elapsedSec = m.startedAt
                ? (Date.now() - m.startedAt) / 1000
                : 0;
              const activityPct = streamActivityPercent(m.deltaChars);
              const tl = timelineProgressFromMetrics(elapsedSec, m.deltaChars);
              const timelineSteps =
                qaBusyMode === "framework"
                  ? [
                      { id: 1, label: "准备" },
                      { id: 2, label: "梳理" },
                      { id: 3, label: "校验" },
                      { id: 4, label: "完成" },
                    ]
                  : qaBusyMode === "biz"
                    ? [
                        { id: 1, label: "准备" },
                        { id: 2, label: "主链路" },
                        { id: 3, label: "校验" },
                        { id: 4, label: "完成" },
                      ]
                    : qaBusyMode === "testpoints"
                      ? [
                          { id: 1, label: "准备" },
                          { id: 2, label: "写操作" },
                          { id: 3, label: "校验" },
                          { id: 4, label: "完成" },
                        ]
                      : null;
              const showTimeline = !!timelineSteps;

              return (
                <>
                  <div className="overlay-top-row">
                    {showTimeline ? null : <div className="spinner" />}
                    <div className="overlay-title">
                      {busyLabel || "处理中…"}
                    </div>
                    <button
                      type="button"
                      className="btn btn-small overlay-min-btn"
                      onClick={() => setOverlayCompact((c) => !c)}
                    >
                      {overlayCompact ? "展开" : "收起"}
                    </button>
                  </div>

                  {overlayCompact ? null : showTimeline ? (
                    <>
                      <TimelineSequence
                        title={
                          qaBusyMode === "framework"
                            ? "时间轴序列 · 页面框架"
                            : qaBusyMode === "biz"
                              ? "时间轴序列 · 业务场景"
                              : "时间轴序列 · 功能测试点"
                        }
                        subtitle="timeline 按顺序播放多段动画"
                        steps={timelineSteps}
                        activeStep={tl.step}
                        progress={Math.max(tl.progress, activityPct * 0.85)}
                      />
                      <div className="overlay-metrics overlay-metrics-compact">
                        <div className="overlay-metric">
                          <span className="overlay-metric-label">已耗时</span>
                          <strong>{formatStreamElapsed(elapsedSec)}</strong>
                        </div>
                        <div className="overlay-metric">
                          <span className="overlay-metric-label">流式字数</span>
                          <strong>
                            {m.deltaChars > 0
                              ? `≈ ${m.deltaChars.toLocaleString("zh-CN")} 字`
                              : "—"}
                          </strong>
                        </div>
                      </div>
                      {m.lastLines.length > 0 ? (
                        <div className="overlay-recent" aria-live="polite">
                          <div className="overlay-recent-title">最近动态</div>
                          <ul className="overlay-recent-list">
                            {m.lastLines.slice(-3).map((line, i) => (
                              <li key={`${sseUiTick}-${i}-${line.slice(0, 16)}`}>
                                {line}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div className="overlay-metrics">
                        <div className="overlay-metric">
                          <span className="overlay-metric-label">已耗时</span>
                          <strong>{formatStreamElapsed(elapsedSec)}</strong>
                        </div>
                        <div className="overlay-metric">
                          <span className="overlay-metric-label">流式字数</span>
                          <strong>
                            {m.deltaChars > 0
                              ? `≈ ${m.deltaChars.toLocaleString("zh-CN")} 字`
                              : "—"}
                          </strong>
                        </div>
                      </div>

                      <div
                        className="overlay-activity-wrap"
                        title="按流式输出量估算的活动度，不是准确剩余进度；数字在涨通常表示未卡死"
                      >
                        <div className="overlay-activity-bar">
                          <div
                            className="overlay-activity-fill"
                            style={{ width: `${activityPct}%` }}
                          />
                        </div>
                        <div className="overlay-activity-caption">
                          活动度约 {activityPct}%（仅表示有输出，非完成百分比）
                        </div>
                      </div>

                      {m.lastLines.length > 0 ? (
                        <div className="overlay-recent" aria-live="polite">
                          <div className="overlay-recent-title">最近动态</div>
                          <ul className="overlay-recent-list">
                            {m.lastLines.map((line, i) => (
                              <li key={`${sseUiTick}-${i}-${line.slice(0, 16)}`}>
                                {line}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <p className="hint overlay-hint-main">
                        Cursor Cloud 首轮常需数分钟。请保持本页打开；开发模式请求直连本机{" "}
                        <code>5180</code>。若<strong>耗时与流式字数长期不变</strong>
                        ，再按下方清单排查。
                      </p>

                      <details className="overlay-triage">
                        <summary>变慢 / 疑似卡住时怎么查</summary>
                        <ol className="overlay-triage-list">
                          <li>
                            <strong>F12 → Network</strong>，找到{" "}
                            <code>pipeline/pm</code>（或 ui/fullstack）：状态应长时间为
                            <strong> Pending</strong>；若为 <strong>(canceled)</strong>{" "}
                            表示连接被断开（勿刷新页面重试）。
                          </li>
                          <li>
                            终端运行目录下设置环境变量{" "}
                            <code>AGILE_SIM_DEBUG=1</code>（PowerShell：{" "}
                            <code>$env:AGILE_SIM_DEBUG=&quot;1&quot;</code>）后重启{" "}
                            <code>npm run dev</code>，看以{" "}
                            <code>[agile-sim]</code> 开头的日志。
                          </li>
                          <li>
                            打开浏览器{" "}
                            <a
                              href="https://cursor.com"
                              target="_blank"
                              rel="noreferrer"
                            >
                              cursor.com
                            </a>
                            ，确认 Cloud Agent / Run 是否仍在执行或已报错。
                          </li>
                          <li>
                            可改用「其他配置」中的 <strong>OpenAI 兼容</strong>
                            接口试跑同一需求，排除 Cursor 侧排队或仓库授权问题。
                          </li>
                        </ol>
                      </details>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      {configModalOpen ? (
            <div
              className="modal-backdrop"
              role="presentation"
              onClick={() => setConfigModalOpen(false)}
            >
              <div
                className="modal-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="config-modal-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-head">
                  <h2 id="config-modal-title">模型配置</h2>
                  <button
                    type="button"
                    className="modal-close"
                    aria-label="关闭"
                    onClick={() => setConfigModalOpen(false)}
                  >
                    ×
                  </button>
                </div>

                <div className="field">
                  <label>推理后端</label>
                  <div className="modal-radio-row">
                    <label className="modal-radio-label">
                      <input
                        type="radio"
                        name="llm-modal"
                        checked={provider === "openai"}
                        onChange={() => setProvider("openai")}
                      />
                      OpenAI 兼容（HTTP）
                    </label>
                    <label className="modal-radio-label">
                      <input
                        type="radio"
                        name="llm-modal"
                        checked={provider === "cursor"}
                        onChange={() => setProvider("cursor")}
                      />
                      Cursor Cloud Agents（HTTP）
                    </label>
                  </div>
                  <p className="hint" style={{ marginTop: 6, marginBottom: 0 }}>
                    两侧的 Key / Model ID 分开保存；切换后端不会互相覆盖。
                  </p>
                </div>
                {provider === "openai" ? (
                  <>
                    <div className="field">
                      <label>API Base URL</label>
                      <input
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        placeholder="https://api.openai.com/v1"
                      />
                    </div>
                    <div className="field">
                      <label>API Key</label>
                      <input
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="sk-…"
                        type="password"
                        autoComplete="off"
                      />
                    </div>
                    <div className="field">
                      <label>Model ID（OpenAI 兼容）</label>
                      <input
                        value={openaiModel}
                        onChange={(e) => setOpenaiModel(e.target.value)}
                        placeholder="gpt-4o-mini / ep-… 等"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="field">
                      <label>Cursor API Key</label>
                      <input
                        value={cursorApiKey}
                        onChange={(e) => setCursorApiKey(e.target.value)}
                        placeholder="cursor_…（见 cursor.com → Integrations → User API Keys / Cloud Agents）"
                        type="password"
                        autoComplete="off"
                      />
                    </div>
                    <div className="field">
                      <label>GitHub 仓库 URL（HTTPS）</label>
                      <input
                        value={cursorRepoUrl}
                        onChange={(e) => setCursorRepoUrl(e.target.value)}
                        placeholder="https://github.com/you/your-repo"
                        autoComplete="off"
                      />
                    </div>
                    <div className="field">
                      <label>分支 / ref</label>
                      <input
                        value={cursorRepoRef}
                        onChange={(e) => setCursorRepoRef(e.target.value)}
                        placeholder="留空=让 Cursor 使用仓库默认分支；或填 main、master"
                        autoComplete="off"
                      />
                      <p className="hint" style={{ marginTop: 6, marginBottom: 0 }}>
                        GitHub 上<strong>明明有该分支</strong>却仍报{' '}
                        <code>Failed to verify existence of branch</code>：多半是{' '}
                        <strong>Cursor 的 GitHub 集成未授权此仓库</strong>
                        （浏览器里能看到，不代表 Cursor Cloud 能访问）。请到{' '}
                        <strong>cursor.com → Integrations → GitHub</strong>{' '}
                        为该仓库或组织开启访问，并点下方<strong>「Cursor 可见仓库列表」</strong>确认是否包含您的 URL。
                      </p>
                    </div>
                    <div className="field">
                      <label>Model ID（Cursor）</label>
                      <input
                        value={cursorModel}
                        onChange={(e) => setCursorModel(e.target.value)}
                        placeholder="composer-2.5（或留空=默认）"
                      />
                      <p className="hint" style={{ marginTop: 6, marginBottom: 0 }}>
                        若报 <code>invalid_model</code>：旧版 <code>composer-2</code> 已不可用，请改为{" "}
                        <strong>composer-2.5</strong> 或留空；可点下方「Cursor 可用模型列表」核对。
                      </p>
                    </div>
                    <p className="hint" style={{ marginTop: 8 }}>
                      Cloud Agent 必须在 Cursor Integrations
                      已授权的仓库上创建；本页仍会根据流式回复在本地 generated 目录写入 prototype / ui /
                      app，与远端 PR 变更可能不一致，以控制台流式文本为准。
                    </p>
                    <div className="field" style={{ marginTop: 12 }}>
                      <label>识图用 OpenAI 兼容（可选，与上方 Cursor 配置独立）</label>
                      <input
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        placeholder="https://api.openai.com/v1"
                      />
                      <input
                        style={{ marginTop: 8 }}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="sk-…（总结需求/生成原型前把参考图转成文字）"
                        type="password"
                        autoComplete="off"
                      />
                      <input
                        style={{ marginTop: 8 }}
                        value={openaiModel}
                        onChange={(e) => setOpenaiModel(e.target.value)}
                        placeholder="识图 Model ID：gpt-4o / ep-…（勿填 composer）"
                      />
                      <p className="hint" style={{ marginTop: 6, marginBottom: 0 }}>
                        顶部需求区的参考图 Cursor 本身无法读取；填写此项后会在写 PRD 前自动识图摘要。
                        此处使用的是 <strong>OpenAI 兼容</strong> 的 URL / Key / Model，与 Cursor Model ID 分开保存。
                      </p>
                    </div>
                  </>
                )}

                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn"
                    onClick={listCursorModels}
                    disabled={provider !== "cursor"}
                  >
                    Cursor 可用模型列表
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={listCursorVisibleRepos}
                    disabled={provider !== "cursor"}
                  >
                    Cursor 可见仓库列表
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={checkBackendHealth}
                  >
                    测试后端连接
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setConfigModalOpen(false)}
                  >
                    完成
                  </button>
                </div>
              </div>
            </div>
          ) : null}

      {tpSkillModalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setTpSkillModalOpen(false)}
        >
          <div
            className="modal-panel modal-panel-wide"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2>测试点生成 Skill</h2>
              <button
                type="button"
                className="modal-close"
                aria-label="关闭"
                onClick={() => setTpSkillModalOpen(false)}
              >
                ×
              </button>
            </div>
            <textarea
              className="req-textarea tp-skill-textarea"
              rows={14}
              value={qaSkill}
              onChange={(e) => setQaSkill(e.target.value)}
            />
            <div className="modal-footer">
              <button type="button" className="btn btn-small" onClick={saveTpSkill}>
                保存 Skill
              </button>
              <button type="button" className="btn btn-small btn-ghost" onClick={resetTpSkill}>
                恢复默认
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setTpSkillModalOpen(false)}
              >
                完成
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <TpPwDebugModal
        open={tpPwDebugModalOpen}
        onClose={() => setTpPwDebugModalOpen(false)}
        qaPwTestBaseUrl={qaPwTestBaseUrl}
        setQaPwTestBaseUrl={setQaPwTestBaseUrl}
        qaGenPwSpec={qaGenPwSpec}
        setQaGenPwSpec={setQaGenPwSpec}
        chatHistory={pwDebugChatHistory}
        chatInput={pwDebugChatInput}
        setChatInput={setPwDebugChatInput}
        chatBusy={pwDebugChatBusy}
        pendingSpec={pwDebugPendingSpec}
        autoApplied={pwDebugAutoApplied}
        onApplySpec={applyPwDebugSpec}
        onSend={sendPwDebugChat}
        onFetchErrors={fetchPwLatestErrors}
        errorHint={pwDebugErrorHint}
      />

      {tpAssetModalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setTpAssetModalOpen(false)}
        >
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2>从项目资产导入</h2>
              <button
                type="button"
                className="modal-close"
                aria-label="关闭"
                onClick={() => setTpAssetModalOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="tp-asset-picker-bar">
              <input
                className="tp-asset-search"
                value={tpAssetQuery}
                placeholder="搜索项目 / 名称…"
                onChange={(e) => setTpAssetQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openTpAssetPicker();
                }}
              />
              <button type="button" className="btn btn-small" onClick={openTpAssetPicker}>
                搜索
              </button>
            </div>
            {tpAssetLoading ? (
              <p className="hint">加载中…</p>
            ) : tpAssetList.length === 0 ? (
              <p className="hint">暂无 URL/文本类资产</p>
            ) : (
              <ul className="tp-asset-list">
                {tpAssetList.map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      className="tp-asset-item"
                      onClick={() => {
                        applyTpAsset(it);
                        setTpAssetModalOpen(false);
                      }}
                    >
                      <strong>{it.name}</strong>
                      <span className="hint">
                        {it.project}
                        {it.env_group ? ` · ${it.env_group}` : ""}
                      </span>
                      <span className="tp-asset-url">
                        {it.url || it.path || it.note || ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {!embedDataVerify ? (
      <header className={"top" + (embedStandaloneQa ? " tp-topbar" : "")}>
        <div className="top-main">
          {embedStandaloneQa ? (
            <>
              <div className="tp-topbar-title-row">
                <h1 className="top-title">测试点生成</h1>
                {workbenchProject.projectName ? (
                  <span className="tp-project-badge" title={workbenchProject.projectName}>
                    {workbenchProject.projectName}
                  </span>
                ) : null}
              </div>
              <p className="top-tagline">
                {workbenchProject.projectName
                  ? `${workbenchProject.projectName} 的测试点 · 从原型说明与截图，三步生成可导入 XMind 的 Markdown`
                  : "从原型说明与截图，三步生成可导入 XMind 的 Markdown"}
              </p>
            </>
          ) : (
            <>
              <span className="badge">Demo · 内网自建</span>
              <h1 className="top-title">敏捷多角色流水线</h1>
              <p className="top-tagline">{phaseStatusText(phase)}</p>
            </>
          )}
        </div>
        <div className="top-actions">
          {!embedStandaloneQa ? (
            <button
              type="button"
              className="btn btn-small"
              disabled={busy}
              onClick={() => setHelpOpen((o) => !o)}
              aria-expanded={helpOpen}
            >
              {helpOpen ? "收起说明" : "使用说明"}
            </button>
          ) : null}
          {!embedStandaloneQa && typeof onOpenGamePipeline === "function" ? (
            <button
              type="button"
              className="btn btn-small"
              disabled={busy}
              onClick={onOpenGamePipeline}
              title="两轮开发↔四 skill 评审，进度条实时高亮"
            >
              游戏开发流水线
            </button>
          ) : null}
          {!embedStandaloneQa ? (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setHistoryModalOpen(true)}
            >
              已完成项目
              {historyRecords.length > 0 ? (
                <span className="top-action-badge">{historyRecords.length}</span>
              ) : null}
            </button>
          ) : null}
          <button
            type="button"
            className={embedStandaloneQa ? "btn btn-small" : "btn btn-primary"}
            disabled={busy}
            onClick={() => setConfigModalOpen(true)}
          >
            模型配置
          </button>
        </div>
      </header>
      ) : null}

      {!embedStandaloneQa && helpOpen ? (
        <details className="help-panel card" open>
          <summary className="help-panel-summary">平台说明</summary>
          <div className="help-panel-body hint">
            流程：产品经理原型 → UI → 全栈 <code>app/</code> → 测试点 / 运维手册。角色画像在{" "}
            <code>skills/roles/&lt;role&gt;/SKILL.md</code>，可热改；各 Tab 底部可「追问」并落盘{" "}
            <code>### FILE:</code>。推理支持 OpenAI 兼容 HTTP 或 Cursor Cloud；密钥仅存本机
            localStorage。
          </div>
        </details>
      ) : null}

      {pipelineError ? (
        <div className="pipeline-error-banner" role="alert">
          <div className="pipeline-error-body">
            <strong className="pipeline-error-step">{pipelineError.step}</strong>
            <span className="pipeline-error-text">{pipelineError.detail}</span>
            {pipelineError.isNetwork && provider === "cursor" ? (
              <p className="hint pipeline-error-extra">
                日志中的 <code>fetch failed</code> 常见于本机访问{" "}
                <code>api.cursor.com</code> 失败（例如仅浏览器走了代理、而 Node
                未走；防火墙/网络策略；DNS）。可在项目目录终端执行{" "}
                <code>curl -I https://api.cursor.com</code> 测试；或临时改用「其他配置」里的{" "}
                <strong>OpenAI 兼容</strong> 后端验证流水线其余环节。
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-small pipeline-error-dismiss"
            onClick={() => setPipelineError(null)}
          >
            关闭
          </button>
        </div>
      ) : null}

      {!embedStandaloneQa && sessionId ? (
        <div className="session-bar card">
          <div className="session-bar-main">
            <span className="session-bar-label">当前会话</span>
            <code className="session-bar-id">{sessionId}</code>
            <span className="session-bar-phase">{phaseStatusText(phase)}</span>
          </div>
          <div className="session-bar-actions">
            <button
              type="button"
              className="btn btn-small"
              onClick={() => copyText(sessionId, "已复制 sessionId")}
            >
              复制 ID
            </button>
            {outputDir ? (
              <button
                type="button"
                className="btn btn-small"
                onClick={() => openFolderInExplorer(outputDir)}
              >
                打开目录
              </button>
            ) : null}
            {appFrame ? (
              <a
                className="btn btn-small"
                href={appFrame}
                target="_blank"
                rel="noreferrer"
              >
                预览新标签
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {!embedWorkbench ? (
      <div className="flow-rail card">
        <div className="flow-rail-head">
          <span className="flow-rail-title">流程</span>
          <span className="hint flow-rail-sub">上需求 · 左方案 · 右预览 · 定稿后下游沿用</span>
        </div>
        <div className="flow-rail-steps" aria-label="流水线步骤">
          {[
            "① 产品经理 · 原型",
            "② UI 设计",
            "③ 全栈落地",
            "④ 测试岗",
            "⑤ 运维岗",
          ].map((label, i) => {
            const hi = flowHighlightStep(phase);
            const done = hi > i;
            const on = hi === i;
            return (
              <div key={label} className="flow-step-group">
                {i > 0 ? <span className="flow-connector" aria-hidden /> : null}
                <span
                  className={
                    "flow-node" +
                    (on ? " on" : "") +
                    (done ? " done" : "") +
                    (hi < 0 ? " pending" : "")
                  }
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
        {provider === "cursor" ? (
          <details className="flow-rail-cursor-details">
            <summary className="hint">Cursor Cloud 会话说明</summary>
            <p className="hint flow-rail-cursor">
              首次「产品经理」会新建远端 Agent；同 <code>sessionId</code> 后续步骤复用该
              Agent。重置会话会换新 Agent。
            </p>
          </details>
        ) : null}
      </div>
      ) : null}

      <div className="workspace workspace-v3">
        {embedDataVerify ? (
          <DataVerifyWorkbench
            config={config}
            configSummary={configSummary}
            onOpenConfig={() => setConfigModalOpen(true)}
          />
        ) : null}
        {embedStandaloneQa ? (
          <TpEmbedWorkbench
            busy={busy}
            qaBusyMode={qaBusyMode}
            tpNextStep={tpNextStep}
            tpStepDone={tpStepDone}
            tpDoneCount={tpDoneCount}
            runTpStep={runTpStep}
            runQaSpecial={runQaSpecial}
            setTpPreviewTab={setTpPreviewTab}
            tpPreviewTab={tpPreviewTab}
            qaMaterial={qaMaterial}
            setQaMaterial={setQaMaterial}
            tpDualMode={tpDualMode}
            tpLinkMode={tpLinkMode}
            cycleTpLinkMode={() => {
              tpDualSyncLockRef.current = true;
              const next =
                tpLinkMode === "off" ? "dual" : tpLinkMode === "dual" ? "multi" : "off";
              if (next === "off") {
                const composed =
                  tpLinkMode === "multi"
                    ? buildMultiIndependentMaterial(
                        qaFrontUrl,
                        qaBackUrl,
                        qaDualNotes,
                        qaProtoLabelA,
                        qaProtoLabelB
                      )
                    : buildDualPrototypeMaterial(qaFrontUrl, qaBackUrl, qaDualNotes);
                setQaMaterial(
                  composed
                    .replace(/^【双原型】\s*\n?/, "")
                    .replace(/^【多原型[·・.]?独立】\s*\n?/, "")
                    .trim() || qaMaterial
                );
                setTpLinkMode("off");
              } else {
                const parsed = parseDualPrototypeMaterial(qaMaterial);
                const urls = [
                  ...String(qaMaterial || "").matchAll(/https?:\/\/[^\s)\]>'"；，。]+/gi),
                ].map((m) => normalizeProtoUrl(m[0]));
                setQaFrontUrl(parsed.frontUrl || urls[0] || qaFrontUrl || "");
                setQaBackUrl(parsed.backUrl || urls[1] || qaBackUrl || "");
                let notes =
                  parsed.notes ||
                  (!parsed.frontUrl && !urls.length ? qaMaterial : qaDualNotes);
                if (next === "multi" && !/【本版范围】/.test(notes || "")) {
                  notes = notes
                    ? `${notes.trim()}\n\n${DEFAULT_V2_SCOPE_NOTE}`
                    : DEFAULT_V2_SCOPE_NOTE;
                }
                setQaDualNotes(notes);
                if (next === "multi" && ganttPrototypes.length) {
                  const a = ganttPrototypes[0];
                  const b = ganttPrototypes[1];
                  if (a?.label) setQaProtoLabelA(String(a.label));
                  if (b?.label) setQaProtoLabelB(String(b.label));
                  if (a?.url && !qaFrontUrl && !urls[0]) {
                    setQaFrontUrl(decodeUrlsInText(a.url));
                  }
                  if (b?.url && !qaBackUrl && !urls[1]) {
                    setQaBackUrl(decodeUrlsInText(b.url));
                  }
                }
                setTpLinkMode(next);
              }
              queueMicrotask(() => {
                tpDualSyncLockRef.current = false;
              });
            }}
            qaFrontUrl={qaFrontUrl}
            setQaFrontUrl={setQaFrontUrl}
            qaBackUrl={qaBackUrl}
            setQaBackUrl={setQaBackUrl}
            qaDualNotes={qaDualNotes}
            setQaDualNotes={setQaDualNotes}
            qaProtoLabelA={qaProtoLabelA}
            qaProtoLabelB={qaProtoLabelB}
            decodeUrlsInText={decodeUrlsInText}
            onPasteImages={onPasteQaImages}
            qaImageItems={qaImageItems}
            setQaImageItems={setQaImageItems}
            qaGenPwSpec={qaGenPwSpec}
            setQaGenPwSpec={setQaGenPwSpec}
            onOpenSkill={() => setTpSkillModalOpen(true)}
            onOpenAssets={async () => {
              setTpAssetModalOpen(true);
              await openTpAssetPicker();
            }}
            onOpenConfig={() => setConfigModalOpen(true)}
            onOpenDataVerify={() => {
              try {
                sessionStorage.setItem(
                  "dv_handoff_v1",
                  JSON.stringify({
                    material: qaMaterial,
                    projectId: workbenchProject.projectId || "",
                    projectName: workbenchProject.projectName || "",
                    assetId: workbenchProject.assetId || "",
                    images: qaImageItems.slice(0, 8).map((x) => ({
                      name: x.name,
                      dataUrl: x.dataUrl,
                    })),
                  })
                );
                sessionStorage.setItem("workbench_embed", "data-verify");
              } catch {
                /* ignore */
              }
              const u = new URL(window.location.href);
              u.searchParams.set("embed", "data-verify");
              window.location.href = u.toString();
            }}
            onClearWorkspace={clearTpWorkspace}
            canRunQa={canRunQa}
            runTpNext={() => tpNextStep && runTpStep(tpNextStep)}
            canSaveTpRecord={canSaveTpRecord}
            saveTpRecord={saveTpRecord}
            downloadMarkdown={downloadMarkdown}
            downloadXmind={downloadXmind}
            downloadZentaoCsv={downloadZentaoCsv}
            importProductCases={importProductCases}
            importProductBugsFromXmind={importProductBugsFromXmind}
            buildXmindFilename={buildXmindFilename}
            tpProjectName={tpProjectName}
            cleanGeneratedMd={cleanGeneratedMd}
            qaFrameworkPreview={qaFrameworkPreview}
            qaBizPreview={qaBizPreview}
            qaSpecialPreview={qaSpecialPreview}
            qaMdPreview={qaMdPreview}
            qaReviewPreview={qaReviewPreview}
            onRunReview={runQaReview}
            onRunAutoPipeline={runTpAutoPipeline}
            onAbortAutoPipeline={() => {
              tpAutoPipeAbortRef.current = true;
              try {
                tpAutoPipeAbortCtrlRef.current?.abort();
              } catch {
                /* ignore */
              }
              setPipeActive(false);
              setBusyLabel("");
              setQaBusyMode("");
              setTpScanning(false);
              setTpAutoPipe((p) =>
                p
                  ? {
                      ...p,
                      active: false,
                      error: "已取消",
                      label: "已取消",
                      note: "已中断当前请求",
                      steps: (p.steps || []).map((s) =>
                        s.status === "running"
                          ? { ...s, status: "pending", label: s.label }
                          : s
                      ),
                    }
                  : p
              );
              pushLog("一键流水线：用户取消", true);
            }}
            qaReviewHistory={qaReviewHistory}
            tpAutoPipe={tpAutoPipe}
            onDismissAutoPipe={() => setTpAutoPipe(null)}
            tpZentaoPipe={tpZentaoPipe}
            onDismissZentaoPipe={() => setTpZentaoPipe(null)}
            tpProductPipe={tpProductPipe}
            onDismissProductPipe={() => setTpProductPipe(null)}
            onLoadReviewHistory={(entry) => {
              if (!entry?.report) return;
              qaReviewRef.current = entry.report;
              setQaReviewPreview(entry.report);
              setTpPreviewTab("review");
            }}
            qaPwSpecPreview={qaPwSpecPreview}
            qaPwTestBaseUrl={qaPwTestBaseUrl}
            setQaPwTestBaseUrl={setQaPwTestBaseUrl}
            qaFrameworkView={qaFrameworkView}
            setQaFrameworkView={setQaFrameworkView}
            tpRecords={scopedTpRecords}
            recordTheme={recordTheme}
            tpActiveRecordId={tpActiveRecordId}
            loadTpRecord={loadTpRecord}
            deleteTpRecord={deleteTpRecord}
            projectLabel={workbenchProject.projectName || ""}
            projectId={workbenchProject.projectId || ""}
            apiUrl={apiUrl}
            ganttPrototypes={ganttPrototypes}
            onPickPrototype={(item) => {
              if (!item?.url) return;
              const url = decodeUrlsInText(item.url);
              const label = String(item.label || "");
              if (tpLinkMode === "multi") {
                if (!qaFrontUrl || protoUrlKeyFromText(qaFrontUrl) === protoUrlKeyFromText(url)) {
                  setQaFrontUrl(url);
                  if (label) setQaProtoLabelA(label);
                } else if (
                  !qaBackUrl ||
                  protoUrlKeyFromText(qaBackUrl) === protoUrlKeyFromText(url)
                ) {
                  setQaBackUrl(url);
                  if (label) setQaProtoLabelB(label);
                } else {
                  setQaBackUrl(url);
                  if (label) setQaProtoLabelB(label);
                }
                return;
              }
              if (tpLinkMode === "dual") {
                if (/后台|管理|运营|admin/i.test(label) || /后台|管理/.test(url)) {
                  setQaBackUrl(url);
                } else if (qaFrontUrl && !qaBackUrl) {
                  setQaBackUrl(url);
                } else {
                  setQaFrontUrl(url);
                }
                return;
              }
              setQaMaterial(url);
            }}
            prevTpRecord={prevTpRecord}
            tpDiff={tpDiff}
            tpDiffOpen={tpDiffOpen}
            onToggleDiff={() => setTpDiffOpen((v) => !v)}
            tpScanStory={tpScanStory}
            tpScanFallbackSteps={tpScanFallbackSteps}
            tpScanning={tpScanning}
            onScanDone={ackTpScan}
            onOpenPlaywrightUi={openPlaywrightUi}
            openPwBusy={openPwBusy}
            onOpenPwDebug={() => {
              setTpPwDebugModalOpen(true);
              fetchPwLatestErrors();
            }}
          />
        ) : null}
        {!embedWorkbench ? (
        <div className="card workbench-req">
          <div className="workbench-req-head">
            <h2 className="sidebar-title">用户需求</h2>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              disabled={busy}
              onClick={resetPipeline}
            >
              重置会话
            </button>
          </div>
          <textarea
            className="req-textarea req-textarea-workbench"
            value={requirement}
            onChange={(e) => setRequirement(e.target.value)}
            onPaste={onPasteReqImages}
            placeholder="描述要做的产品或功能…可直接 Ctrl+V 粘贴截图"
          />
          <div className="image-pick-row workbench-req-images">
            <label className="btn btn-small">
              上传参考图
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={onPickReqImages}
              />
            </label>
            <span className="hint">
              最多 12 张；总结/生成时取前 4 张发给模型。
              {provider === "cursor"
                ? " Cursor Cloud 本身不看图；若已在配置里填写 OpenAI 兼容 API Key，会先自动识图成文字再写 PRD。"
                : " 请选用支持视觉的模型（如 gpt-4o）。"}
            </span>
          </div>
          {reqImageItems.length > 0 ? (
            <ul className="thumb-strip workbench-req-thumbs">
              {reqImageItems.map((item, idx) => (
                <li key={item.name + idx} className="thumb-strip-item">
                  <img src={item.dataUrl} alt={item.name} />
                  <button
                    type="button"
                    className="thumb-remove"
                    aria-label={`移除 ${item.name}`}
                    onClick={() =>
                      setReqImageItems((prev) => prev.filter((_, j) => j !== idx))
                    }
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {pmFinalizedIdx !== null || uiFinalizedIdx !== null ? (
            <p className="hint workbench-req-plan">
              {pmFinalizedIdx !== null
                ? `产品已定稿：${pmSolutions[pmFinalizedIdx]?.title || ""}`
                : ""}
              {pmFinalizedIdx !== null && uiFinalizedIdx !== null ? " · " : ""}
              {uiFinalizedIdx !== null
                ? `UI 已定稿：${uiSolutions[uiFinalizedIdx]?.title || ""}`
                : ""}
            </p>
          ) : null}
        </div>
        ) : null}

        {!embedWorkbench ? (
        <div className="workspace-body">
          <div className="card role-pane">
          <div className="role-tabs" role="tablist" aria-label="角色视图">
            <button
              type="button"
              role="tab"
              aria-selected={roleTab === "pm"}
              className={`role-trigger ${roleTab === "pm" ? "on" : ""}`}
              onClick={() => setRoleTab("pm")}
            >
              产品经理
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={roleTab === "ui"}
              className={`role-trigger ${roleTab === "ui" ? "on" : ""}`}
              onClick={() => setRoleTab("ui")}
            >
              UI设计
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={roleTab === "fs"}
              className={`role-trigger ${roleTab === "fs" ? "on" : ""}`}
              onClick={() => setRoleTab("fs")}
            >
              全栈落地
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={roleTab === "qa"}
              className={`role-trigger ${roleTab === "qa" ? "on" : ""}`}
              onClick={() => setRoleTab("qa")}
            >
              测试岗
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={roleTab === "ops"}
              className={`role-trigger ${roleTab === "ops" ? "on" : ""}`}
              onClick={() => setRoleTab("ops")}
            >
              运维岗
            </button>
          </div>

          <div className="role-pane-scroll">
          {roleTab === "pm" ? (
            <div className="scheme-pane">
              <div className="pane-title">需求整理</div>
              <p className="pane-desc">
                对原始需求进行拆分与评审要点归纳（可按条款浏览，便于评审会议使用）。
              </p>
              <ul className="req-bullets">
                {reqBullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
              <div className="hint" style={{ marginTop: 12 }}>
                <strong>评审提示：</strong>范围是否清晰？关键路径是否闭环？边界条件（空态、错误、权限）是否覆盖？
              </div>
              <div className="pm-spec-actions role-action-bar">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canSummarizeReq}
                  onClick={generatePmSpec}
                >
                  {pmSpecGenerating ? "总结中…" : "总结需求"}
                </button>
                {pmSpecMd.trim() ? (
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => setPmSpecModalOpen(true)}
                  >
                    查看需求文档
                  </button>
                ) : null}
                {pmSpecMd.trim() ? (
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => downloadMarkdown("需求文档.md", pmSpecMd)}
                  >
                    下载需求文档
                  </button>
                ) : null}
              </div>
              <p className="hint pm-spec-hint">
                {pmSpecMd.trim()
                  ? "需求文档已就绪，可为各方案生成原型；修改上方需求后请重新「总结需求」。"
                  : "请先在上方填写需求并点击「总结需求」，生成标准需求文档后再生成原型。"}
              </p>
              <div className="pane-subtitle">产品方案（不少于 3 种）</div>
              <div className="solution-pick">
                {pmSolutions.map((s, i) => (
                  <div key={i} className="solution-row">
                    <button
                      type="button"
                      className={`solution-chip ${pmSolutionIdx === i ? "on" : ""}`}
                      onClick={() => setPmSolutionIdx(i)}
                    >
                      {s.title}
                      {pmFinalizedIdx === i ? (
                        <span className="solution-badge">已定稿</span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className="btn btn-small btn-outline-primary"
                        disabled={!canRunPmAction || busy}
                        onClick={() => runPmForSolution(i)}
                        title={
                          !pmSpecMd.trim()
                            ? "请先总结需求并生成需求文档"
                            : undefined
                        }
                      >
                      {variantBusy?.role === "pm" && variantBusy.idx === i
                        ? "生成中…"
                        : "生成原型"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-small btn-finalize"
                      disabled={!pmVariantReady[i] || busy}
                      onClick={() => finalizePm(i)}
                    >
                      {pmFinalizedIdx === i ? "已定稿" : "定稿"}
                    </button>
                  </div>
                ))}
              </div>
              <div className="scheme-pane-detail">
                <div className="pane-title">{pmSolutions[pmSolutionIdx].title}</div>
                <p className="pane-body">{pmSolutions[pmSolutionIdx].summary}</p>
                <p className="hint">
                  点击「生成原型」后在右侧预览；定稿后 UI / 全栈将沿用该方案。
                </p>
              </div>
            </div>
          ) : roleTab === "ui" ? (
            <div className="scheme-pane">
              <div className="pane-title">UI 方案</div>
              <p className="pane-desc">至少三种视觉方向；定稿前请先在产品经理页定稿原型。</p>
              {pmFinalizedIdx === null ? (
                <p className="hint hint-warn">请先在「产品经理」页对某一方案定稿。</p>
              ) : (
                <p className="hint">
                  沿用产品定稿：{pmSolutions[pmFinalizedIdx]?.title}
                </p>
              )}
              <div className="ui-solution-list">
                {uiSolutions.map((s, i) => (
                  <div key={i} className="ui-solution-row">
                    <button
                      type="button"
                      className={`ui-solution-card ${uiSolutionIdx === i ? "on" : ""}`}
                      onClick={() => setUiSolutionIdx(i)}
                    >
                      <div className="ui-solution-title">
                        {s.title}
                        {uiFinalizedIdx === i ? (
                          <span className="solution-badge">已定稿</span>
                        ) : null}
                      </div>
                      <div className="ui-solution-philosophy">{s.philosophy}</div>
                      <div className="ui-solution-fit hint">{s.fitFor}</div>
                    </button>
                    <button
                      type="button"
                      className="btn btn-small btn-outline-primary ui-solution-gen"
                      disabled={!canRunUi || busy}
                      onClick={() => runUiForSolution(i)}
                      title={
                        !canRunUi && pmFinalizedIdx === null
                          ? "请先在产品经理页定稿某一方案"
                          : undefined
                      }
                    >
                      {variantBusy?.role === "ui" && variantBusy.idx === i
                        ? "生成中…"
                        : "生成 UI"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-small btn-finalize"
                      disabled={!uiVariantReady[i] || busy}
                      onClick={() => finalizeUi(i)}
                    >
                      {uiFinalizedIdx === i ? "已定稿" : "定稿"}
                    </button>
                  </div>
                ))}
              </div>
              <div className="scheme-pane-detail">
                <div className="pane-title">{uiSolutions[uiSolutionIdx].title}</div>
                <p className="pane-body">{uiSolutions[uiSolutionIdx].philosophy}</p>
                <p className="hint">{uiSolutions[uiSolutionIdx].fitFor}</p>
              </div>
            </div>
          ) : roleTab === "fs" ? (
            <div className="fs-panel workbench-main-stack">
              <div className="fs-toolbar">
                <div className="pane-title fs-toolbar-title">全栈落地</div>
                {fsPlanDirty ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!canRunFs}
                    onClick={runFs}
                  >
                    确认变动
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!canRunFs || busy}
                    onClick={runFs}
                    title={
                      uiFinalizedIdx === null
                        ? "请先在 UI 设计页定稿某一方案"
                        : !canRunFs
                          ? "请先完成 UI 定稿"
                          : undefined
                    }
                  >
                    {busy && phase === "fs" ? "落地中…" : "全栈落地"}
                  </button>
                )}
                {uiFinalizedIdx !== null ? (
                  <span className="hint fs-toolbar-hint">
                    沿用 UI 定稿：{uiSolutions[uiFinalizedIdx]?.title}
                  </span>
                ) : null}
              </div>
              <details className="pane-details">
                <summary className="hint">全栈说明与预览路径</summary>
                <p className="hint">
                  预览在右侧；路径 <code>generated/{sessionId || "…"}/app/index.html</code>
                </p>
              </details>
              {sessionId ? (
                <div className="preview-toolbar">
                  <button type="button" className="btn btn-small" onClick={refreshFsPreview}>
                    刷新预览
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => openFolderInExplorer(`generated/${sessionId}/app`)}
                  >
                    打开 app
                  </button>
                  {appFrame ? (
                    <a
                      className="btn btn-small"
                      href={appFrame}
                      target="_blank"
                      rel="noreferrer"
                    >
                      新标签打开
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : roleTab === "qa" ? (
            <div className="qa-workbench">
              {!embedStandaloneQa ? (
              <div className="qa-subtabs" role="tablist" aria-label="测试岗模式">
                <button
                  type="button"
                  role="tab"
                  aria-selected={qaSubTab === "pipeline"}
                  className={`qa-subtab ${qaSubTab === "pipeline" ? "on" : ""}`}
                  onClick={() => setQaSubTab("pipeline")}
                >
                  {projectTitleFromRequirement(requirement)}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={qaSubTab === "standalone"}
                  className={`qa-subtab ${qaSubTab === "standalone" ? "on" : ""}`}
                  onClick={() => setQaSubTab("standalone")}
                >
                  独立测试（对外）
                </button>
              </div>
              ) : null}

              {!embedStandaloneQa && qaSubTab === "pipeline" ? (
                <div className="qa-pipeline-layout qa-pipeline-layout-v2 workbench-main-stack">
                  <aside className="qa-pipeline-left">
                    <div className="pane-title">测试点列表</div>
                    <p className="hint qa-point-list-hint">
                      生成顺序固定：先<strong>业务测试点</strong>，再<strong>功能测试点</strong>。点击「进行测试」将按列表从上到下依次执行。
                    </p>
                    <ul className="qa-point-list">
                      {pipelineTestPoints.length === 0 ? (
                        <li className="qa-point-empty">
                          <p className="hint">尚无测试点</p>
                          <p className="qa-empty-cta">↓ 点击下方「生成测试点」</p>
                        </li>
                      ) : (
                        pipelinePointsGrouped.map((row, ri) =>
                          row.type === "header" ? (
                            <li key={`h-${row.kind}-${ri}`} className="qa-point-section-head">
                              {kindSectionTitle(row.kind)}
                            </li>
                          ) : (
                            <li key={row.pt.id || row.idx}>
                              <button
                                type="button"
                                className={
                                  "qa-point-item" +
                                  (row.idx === pipelineActiveIdx ? " active" : "") +
                                  (row.idx === pipelineTestingIdx && pipelineTesting
                                    ? " testing"
                                    : "") +
                                  (row.idx < pipelineTestingIdx && pipelineTesting
                                    ? " done"
                                    : "")
                                }
                                onClick={() => setPipelineActiveIdx(row.idx)}
                                disabled={pipelineTesting}
                              >
                                <span
                                  className={
                                    "qa-point-tag" +
                                    (row.pt.kind === "smoke"
                                      ? " smoke"
                                      : row.pt.kind === "business"
                                        ? " biz"
                                        : " fn")
                                  }
                                >
                                  {row.pt.kind === "smoke"
                                    ? "冒烟"
                                    : row.pt.kind === "business"
                                      ? "业务"
                                      : "功能"}
                                </span>
                                <span className="qa-point-title">{row.pt.title}</span>
                              </button>
                            </li>
                          )
                        )
                      )}
                    </ul>
                    <button
                      type="button"
                      className="btn btn-primary qa-gen-points-btn"
                      disabled={!canRunQaPipeline}
                      onClick={generatePipelineTestPoints}
                    >
                      {pipelineGenerating ? "生成中…" : "生成测试点"}
                    </button>
                  </aside>

                  <footer className="qa-pipeline-footer">
                    {pipelineTesting && pipelineTestProgress.total > 0 ? (
                      <div className="qa-test-progress" role="status" aria-live="polite">
                        <div className="qa-test-progress-track">
                          <div
                            className="qa-test-progress-bar"
                            style={{
                              width: `${Math.round(
                                (pipelineTestProgress.current /
                                  pipelineTestProgress.total) *
                                  100
                              )}%`,
                            }}
                          />
                        </div>
                        <span className="qa-test-progress-text">
                          正在测试 {pipelineTestProgress.current}/
                          {pipelineTestProgress.total}
                          {pipelineTestProgress.title
                            ? `：${pipelineTestProgress.title}`
                            : ""}
                        </span>
                      </div>
                    ) : null}
                    <div className="qa-pipeline-actions qa-pipeline-actions-row1">
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!sessionId || pipelineTesting || busy}
                        onClick={runPipelineSmokeTest}
                        title="仅执行带 Playwright json 步骤的冒烟用例（替代人工冒烟主流程）"
                      >
                        {pipelineTesting &&
                        pipelineTestProgress.total > 0 &&
                        pipelineTestPoints.some((p) => p.kind === "smoke")
                          ? `冒烟测试中…`
                          : "冒烟测试（Playwright）"}
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={
                          !sessionId ||
                          !pipelineTestPoints.length ||
                          pipelineTesting ||
                          busy
                        }
                        onClick={runPipelineTestOne}
                        title={
                          pipelineTestPoints[pipelineActiveIdx]?.title ||
                          "请先在列表中选中一条测试点"
                        }
                      >
                        {pipelineTesting && pipelineTestProgress.total === 1
                          ? "测试中…"
                          : `测试当前项（${pipelineActiveIdx + 1}/${pipelineTestPoints.length || 0}）`}
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={
                          !sessionId ||
                          !pipelineTestPoints.length ||
                          pipelineTesting ||
                          busy
                        }
                        onClick={runPipelineTest}
                      >
                        {pipelineTesting && pipelineTestProgress.total > 1
                          ? `全部测试中 ${pipelineTestProgress.current}/${pipelineTestProgress.total}`
                          : "全部测试"}
                      </button>
                    </div>
                    <div className="qa-pipeline-actions qa-pipeline-actions-row2">
                      <button
                        type="button"
                        className="btn"
                        disabled={!pipelineTestIssues.length}
                        onClick={notifyFullStackFromQa}
                      >
                        通知全栈修改
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={!pipelineTestIssues.length}
                        onClick={copyTestIssuesMd}
                      >
                        复制问题列表
                      </button>
                    </div>
                    <div className="qa-issues-panel">
                      <div className="qa-issues-head">
                        <div className="pane-subtitle">测试问题</div>
                        {pipelineTestIssues.length > 0 ? (
                          <span className="qa-issues-count">
                            {pipelineTestIssues.length} 项
                          </span>
                        ) : null}
                      </div>
                      {pipelineTestIssues.length === 0 ? (
                        <p className="hint">
                          选中列表条目 →「测试当前项」；或「冒烟 / 全部测试」批量执行。app 预览在右侧。
                        </p>
                      ) : (
                        <ul className="qa-issues-list">
                          {pipelineTestIssues.map((it, i) => {
                            const tag = classifyIssueReason(it.reason);
                            return (
                              <li key={i} className="qa-issue-card">
                                <div className="qa-issue-head">
                                  <span className={`qa-issue-tag tag-${tag}`}>
                                    {ISSUE_TAG_LABEL[tag]}
                                  </span>
                                  <strong className="qa-issue-title">
                                    {it.title || "项"}
                                  </strong>
                                </div>
                                <p className="qa-issue-reason">{it.reason}</p>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </footer>
                </div>
              ) : (
                <div className={"standalone-role-panel workbench-main-stack" + (embedStandaloneQa ? " tp-redesign-panel" : "")}>
                  {!embedStandaloneQa ? (
                    <>
                      <div className="pane-title">独立测试（对外）</div>
                      <p className="pane-desc">
                        不依赖本流水线前置步骤；填写说明与截图后生成测试点 Markdown，预览在右侧。
                      </p>
                    </>
                  ) : null}

                  {embedStandaloneQa ? (
                    <div className="tp-step-rail" aria-label="生成流水线">
                      <div className="tp-step-rail-head">
                        <span className="tp-step-rail-label">生成流水线</span>
                        <span className="hint">
                          {busy && qaBusyMode
                            ? qaBusyMode === "framework"
                              ? "正在梳理页面框架…"
                              : qaBusyMode === "biz"
                                ? "正在生成业务场景…"
                                : qaBusyMode === "special"
                                  ? "正在生成专项测试…"
                                  : "正在生成页面功能…"
                            : tpNextStep
                              ? "点卡片执行 · 需按顺序完成"
                              : "全部完成 · 可下载或保存"}
                        </span>
                      </div>
                      <div className="tp-steps">
                        {[
                          { n: 1, t: "页面框架", d: "梳理模块结构", mode: "framework", tab: "framework" },
                          { n: 2, t: "业务场景", d: "冒烟门禁+条件结果", mode: "biz", tab: "biz" },
                          { n: 3, t: "页面功能", d: "行为优先+优先级", mode: "testpoints", tab: "func" },
                          { n: 4, t: "专项测试", d: "权限/并发/弱网/兼容/安全", mode: "special", tab: "special" },
                        ].map((s) => {
                          const done = tpStepDone[s.n];
                          const locked = s.n > 1 && !tpStepDone[s.n - 1];
                          const isNext = tpNextStep === s.n;
                          const isBusy = busy && qaBusyMode === s.mode;
                          return (
                            <button
                              key={s.n}
                              type="button"
                              className={
                                "tp-step" +
                                (done ? " is-done" : "") +
                                (isNext && !busy ? " is-next" : "") +
                                (locked ? " is-locked" : "") +
                                (isBusy ? " is-busy" : "")
                              }
                              disabled={busy || (locked && !done)}
                              onClick={() => {
                                if (done) {
                                  setTpPreviewTab(s.tab);
                                  return;
                                }
                                if (locked) {
                                  alert(`请先完成第 ${s.n - 1} 步`);
                                  return;
                                }
                                runTpStep(s.n);
                              }}
                            >
                              <span className="tp-step-n">{done ? "✓" : s.n}</span>
                              <span className="tp-step-t">{s.t}</span>
                              <span className="tp-step-d">{s.d}</span>
                              {(done || (isNext && !busy)) ? (
                                <span className="tp-step-cta">
                                  {done ? "查看结果 →" : "点击生成 →"}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                      <div className="tp-progress-row">
                        <div
                          className={
                            "tp-progress-bar" +
                            (busy && qaBusyMode ? " is-running" : "")
                          }
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={4}
                          aria-valuenow={tpDoneCount}
                          aria-busy={!!(busy && qaBusyMode)}
                        >
                          <div
                            className={
                              "tp-progress-fill" +
                              (busy && qaBusyMode ? " is-running" : "")
                            }
                            style={{
                              width: `${
                                busy && qaBusyMode
                                  ? Math.max(
                                      ((tpDoneCount + 0.55) / 4) * 100,
                                      22
                                    )
                                  : (tpDoneCount / 4) * 100
                              }%`,
                            }}
                          />
                        </div>
                        <span className="tp-progress-label">{tpDoneCount} / 4</span>
                      </div>
                    </div>
                  ) : null}

                  <div className="tp-material-head">
                    <h3 className="sidebar-role-title">原型图 / 说明</h3>
                    {embedStandaloneQa ? (
                      <button
                        type="button"
                        className="btn btn-small"
                        onClick={openTpAssetPicker}
                      >
                        从项目资产导入
                      </button>
                    ) : null}
                  </div>
                  <textarea
                    className="req-textarea req-textarea-secondary"
                    rows={embedStandaloneQa ? 4 : 5}
                    placeholder="粘贴 http(s) 原型链接，或本地 file:/// / F:\路径\原型.html（会自动读取 HTML）…"
                    value={qaMaterial}
                    onChange={(e) => setQaMaterial(e.target.value)}
                    onPaste={(e) => {
                      const clip = e.clipboardData?.getData("text");
                      if (!clip || !/%[0-9A-Fa-f]{2}/.test(clip)) return;
                      e.preventDefault();
                      const ta = e.currentTarget;
                      const start = ta.selectionStart ?? qaMaterial.length;
                      const end = ta.selectionEnd ?? qaMaterial.length;
                      const next =
                        qaMaterial.slice(0, start) +
                        decodeUrlsInText(clip) +
                        qaMaterial.slice(end);
                      setQaMaterial(next);
                    }}
                  />
                  {tpAssetPickerOpen ? (
                    <div className="tp-asset-picker" role="dialog" aria-label="选择项目资产">
                      <div className="tp-asset-picker-bar">
                        <input
                          className="tp-asset-search"
                          value={tpAssetQuery}
                          placeholder="搜索项目 / 名称 / 备注…"
                          onChange={(e) => setTpAssetQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") openTpAssetPicker();
                          }}
                        />
                        <button type="button" className="btn btn-small" onClick={openTpAssetPicker}>
                          搜索
                        </button>
                        <button
                          type="button"
                          className="btn btn-small btn-ghost"
                          onClick={() => setTpAssetPickerOpen(false)}
                        >
                          关闭
                        </button>
                      </div>
                      {tpAssetLoading ? (
                        <p className="hint">加载中…</p>
                      ) : tpAssetList.length === 0 ? (
                        <p className="hint">暂无 URL/文本类资产。可先在「项目资产」登记原型链接。</p>
                      ) : (
                        <ul className="tp-asset-list">
                          {tpAssetList.map((it) => (
                            <li key={it.id}>
                              <button
                                type="button"
                                className="tp-asset-item"
                                onClick={() => applyTpAsset(it)}
                              >
                                <strong>{it.name}</strong>
                                <span className="hint">
                                  {it.project}
                                  {it.env_group ? ` · ${it.env_group}` : ""}
                                  {it.kind === "url" ? " · URL" : it.kind === "text" ? " · 文本" : ""}
                                </span>
                                <span className="tp-asset-url">
                                  {it.url || it.path || it.note || ""}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                  <div className="tp-skill-head">
                    <h3 className="sidebar-role-title">测试点生成 Skill</h3>
                    <div className="tp-skill-actions">
                      {embedStandaloneQa ? (
                        <button
                          type="button"
                          className="btn btn-small"
                          onClick={() => setTpSkillOpen((v) => !v)}
                        >
                          {tpSkillOpen ? "收起" : "展开编辑"}
                        </button>
                      ) : null}
                      {(!embedStandaloneQa || tpSkillOpen) ? (
                        <>
                          <button type="button" className="btn btn-small" onClick={saveTpSkill}>
                            保存 Skill
                          </button>
                          <button type="button" className="btn btn-small btn-ghost" onClick={resetTpSkill}>
                            恢复默认
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {tpSkillMsg ? <p className="hint tp-skill-msg">{tpSkillMsg}</p> : null}
                  {(!embedStandaloneQa || tpSkillOpen) ? (
                    <>
                      <textarea
                        className="req-textarea req-textarea-secondary tp-skill-textarea"
                        rows={embedStandaloneQa ? 8 : 6}
                        placeholder="定义测试点输出格式、粒度、层级结构等；生成时将作为系统 Skill 使用……"
                        value={qaSkill}
                        onChange={(e) => setQaSkill(e.target.value)}
                      />
                      <p className="hint tp-skill-hint">
                        建议：①框架 → ②业务场景（冒烟门禁 + 条件结果）→ ③页面功能（测行为少抄皮，标 P0/P1/P2）。HTML 原型会精读「原型说明」但不把它当被测页。请先「恢复默认 / 保存 Skill」。
                      </p>
                    </>
                  ) : (
                    <p className="hint tp-skill-hint">默认收起，降低信息密度。需要时展开编辑。</p>
                  )}
                  <div className="image-pick-row">
                    <label className="btn btn-small">
                      上传原型截图
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        hidden
                        onChange={onPickQaImages}
                      />
                    </label>
                    <span className="hint">
                      最多约 12 张；OpenAI 兼容且为视觉模型时对生成更有帮助。
                    </span>
                  </div>
                  {qaImageItems.length > 0 ? (
                    <ul className="thumb-strip">
                      {qaImageItems.map((item, idx) => (
                        <li key={item.name + idx} className="thumb-strip-item">
                          <img src={item.dataUrl} alt={item.name} />
                          <button
                            type="button"
                            className="thumb-remove"
                            aria-label={`移除 ${item.name}`}
                            onClick={() =>
                              setQaImageItems((prev) => prev.filter((_, j) => j !== idx))
                            }
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {(qaGenPwSpec || String(qaPwTestBaseUrl || "").trim()) ? (
                    <p className="tp-pw-debug-badge hint">
                      {qaGenPwSpec ? "已勾选生成 PW" : ""}
                      {qaGenPwSpec && String(qaPwTestBaseUrl || "").trim() ? " · " : ""}
                      {String(qaPwTestBaseUrl || "").trim() ? "测试环境已填" : ""}
                      {" · 点 PW 页「调试 pw」可改"}
                    </p>
                  ) : (
                    <p className="hint">需要生成/调试 Playwright 时，请打开 PW 页签点「调试 pw」</p>
                  )}
                  <div className={"role-action-bar" + (embedStandaloneQa ? " tp-action-dock" : "")}>
                    {!embedStandaloneQa ? (
                    <p className="hint role-action-hint">
                      {canRunQa
                        ? "待执行：生成测试点文档"
                        : config.provider === "cursor" && !sessionId && qaSubTab !== "standalone"
                          ? "Cursor 需先有会话并完成「产品经理」以绑定远端 Agent"
                          : !qaInputsReady
                            ? "请填写需求或测试说明，或上传参考图"
                            : "请补齐 API Key（或 Cursor 密钥与仓库）"}
                    </p>
                    ) : null}
                    <div className="req-footer">
                      {embedStandaloneQa ? (
                        <>
                          {(busy && qaBusyMode) ? (
                            <span className="tp-busy-chip" aria-live="polite">
                              <span className="tp-breath" />
                              生成中
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn-primary tp-run-next"
                            disabled={!canRunQa || !tpNextStep || busy}
                            onClick={() => tpNextStep && runTpStep(tpNextStep)}
                          >
                            {busy && qaBusyMode
                              ? "生成中…"
                              : tpNextStep === 1
                                ? "① 生成页面框架"
                                : tpNextStep === 2
                                  ? "② 生成业务场景"
                                  : tpNextStep === 3
                                    ? "③ 生成页面功能"
                                    : "全部完成"}
                          </button>
                          <span className="tp-dock-spacer" />
                          <button
                            type="button"
                            className="btn btn-small"
                            disabled={!canSaveTpRecord}
                            onClick={() => {
                              const blob = [
                                cleanGeneratedMd(qaFrameworkPreview),
                                cleanGeneratedMd(qaBizPreview),
                                cleanGeneratedMd(qaMdPreview),
                              ]
                                .filter(Boolean)
                                .join("\n\n---\n\n");
                              downloadMarkdown(
                                `${safeFilePart(tpProjectName)}_测试点_${formatStamp()}.md`,
                                blob
                              );
                            }}
                          >
                            下载.md
                          </button>
                          <button
                            type="button"
                            className="btn btn-small"
                            disabled={tpDoneCount < 3}
                            title={tpDoneCount < 3 ? "需完成三步后再导出汇总 XMind" : ""}
                            onClick={() =>
                              downloadXmind(
                                [
                                  cleanGeneratedMd(qaFrameworkPreview),
                                  cleanGeneratedMd(qaBizPreview),
                                  cleanGeneratedMd(qaMdPreview),
                                ]
                                  .filter(Boolean)
                                  .join("\n\n"),
                                buildXmindFilename(tpProjectName, "测试点汇总"),
                                `${tpProjectName} · 测试点汇总`
                              )
                            }
                          >
                            下载.xmind
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={!canRunQa}
                            onClick={runQa}
                          >
                            {busy && roleTab === "qa" ? "生成中…" : "生成测试点文档"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-small"
                            disabled={!qaMdPreview.trim()}
                            onClick={() =>
                              downloadMarkdown(
                                `${safeFilePart(tpProjectName)}_功能测试点_${formatStamp()}.md`,
                                cleanGeneratedMd(qaMdPreview)
                              )
                            }
                          >
                            下载.md
                          </button>
                        </>
                      )}
                      {embedStandaloneQa ? (
                        <button
                          type="button"
                          className="btn btn-small btn-ghost"
                          disabled={!canSaveTpRecord}
                          onClick={saveTpRecord}
                        >
                          保存到列表
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {embedStandaloneQa ? (
                    <div className="tp-records-panel">
                      <div className="tp-records-head">
                        <h3 className="sidebar-role-title">已保存的测试点</h3>
                        <span className="hint">{scopedTpRecords.length} 条</span>
                      </div>
                      {scopedTpRecords.length === 0 ? (
                        <p className="hint">
                          生成后点「保存到列表」，会一并保存右侧「页面框架 / 业务场景 / 页面功能 / 专项测试点」。
                        </p>
                      ) : (
                        <ul className="tp-records-list">
                          {scopedTpRecords.map((rec) => (
                            <li
                              key={rec.id}
                              className={
                                "tp-record-item" + (tpActiveRecordId === rec.id ? " active" : "")
                              }
                            >
                              <button
                                type="button"
                                className="tp-record-main"
                                onClick={() => loadTpRecord(rec)}
                              >
                                <span className="tp-record-title">{rec.title || "测试点"}</span>
                                <span className="tp-record-meta">
                                  {[
                                    rec.projectName || null,
                                    rec.framework ? "框架" : null,
                                    rec.businessScenarios ? "业务" : null,
                                    rec.markdown ? "功能" : null,
                                    rec.specialMd ? "专项" : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || "旧记录"}
                                  {rec.createdAt
                                    ? ` · ${rec.createdAt.replace("T", " ")}`
                                    : ""}
                                </span>
                              </button>
                              <button
                                type="button"
                                className="tp-record-del"
                                aria-label="删除"
                                onClick={() => deleteTpRecord(rec.id)}
                              >
                                ×
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : (
            <div className="standalone-role-panel workbench-main-stack">
              <div className="pane-title">运维岗</div>
              <p className="pane-desc">
                结合上方用户需求与下方说明生成运维手册；Markdown 预览在右侧。
              </p>
              <h3 className="sidebar-role-title">环境与交付说明</h3>
              <textarea
                className="req-textarea req-textarea-secondary"
                rows={5}
                placeholder="端口、宿主、CDN、密钥来源、上下游依赖、发布流程等……"
                value={opsMaterial}
                onChange={(e) => setOpsMaterial(e.target.value)}
              />
              <h3 className="sidebar-role-title">运维文档模板 / 粒度（可选）</h3>
              <textarea
                className="req-textarea req-textarea-secondary"
                rows={3}
                placeholder="例：我需要「部署拓扑 + checklist + FAQ」三节……"
                value={opsStyleHint}
                onChange={(e) => setOpsStyleHint(e.target.value)}
              />
              <div className="image-pick-row">
                <label className="btn btn-small">
                  上传拓扑 / 控制台截图
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={onPickOpsImages}
                  />
                </label>
                <span className="hint">可选；Cursor Cloud 仅能根据文字推断图片内容。</span>
              </div>
              {opsImageItems.length > 0 ? (
                <ul className="thumb-strip">
                  {opsImageItems.map((item, idx) => (
                    <li key={item.name + idx} className="thumb-strip-item">
                      <img src={item.dataUrl} alt={item.name} />
                      <button
                        type="button"
                        className="thumb-remove"
                        aria-label={`移除 ${item.name}`}
                        onClick={() =>
                          setOpsImageItems((prev) => prev.filter((_, j) => j !== idx))
                        }
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="role-action-bar">
                <p className="hint role-action-hint">
                  {canRunOps
                    ? "待执行：生成运维手册"
                    : config.provider === "cursor" && !sessionId
                      ? "Cursor 需先有会话并完成「产品经理」以绑定远端 Agent"
                      : !opsInputsReady
                        ? "请填写需求或运维说明，或上传参考图"
                        : "请补齐 API Key（或 Cursor 密钥与仓库）"}
                </p>
                <div className="req-footer">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!canRunOps}
                    onClick={runOps}
                  >
                    {busy && roleTab === "ops" ? "生成中…" : "生成运维手册"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={!opsMdPreview.trim()}
                    onClick={() => downloadMarkdown("运维手册.md", opsMdPreview)}
                  >
                    下载运维手册.md
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>
          </div>

          <div className="card preview-main">
          <div className="preview-rail-head">
            <span className="pane-title">
              {embedStandaloneQa ? "预览" : previewRailTitle}
            </span>
            {!embedStandaloneQa ? (
              <span className="hint config-bar-summary">{configSummary}</span>
            ) : null}
          </div>
          <div className="preview preview-rail-body">
            {embedStandaloneQa ? (
              <div className="tp-preview-stack tp-preview-tabs">
                <div className="tp-tabs" role="tablist" aria-label="结果步骤">
                  {[
                    { id: "framework", label: "框架", done: tpStepDone[1] },
                    { id: "biz", label: "场景", done: tpStepDone[2] },
                    { id: "func", label: "功能", done: tpStepDone[3] },
                    { id: "special", label: "专项", done: tpStepDone[4] },
                    {
                      id: "pw",
                      label: "PW",
                      done: !!qaPwSpecPreview.trim(),
                    },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={tpPreviewTab === t.id}
                      className={
                        "tp-tab" +
                        (tpPreviewTab === t.id ? " is-on" : "") +
                        (t.done ? " is-done" : "")
                      }
                      onClick={() => setTpPreviewTab(t.id)}
                    >
                      <span className="tp-tab-dot" />
                      {t.label}
                    </button>
                  ))}
                  <span className="hint tp-tab-meta">
                    {tpDoneCount === 0
                      ? "尚未生成 · 从左侧第 1 步开始"
                      : `已完成 ${tpDoneCount} / 4` +
                        (qaPwSpecPreview.trim() ? " · 含 .spec.ts" : "")}
                  </span>
                </div>

                {tpPreviewTab === "framework" ? (
                <section
                  className={
                    "tp-pv tp-panel-single" +
                    (busy && qaBusyMode === "framework" ? " is-loading" : "")
                  }
                  aria-label="项目页面框架"
                  aria-busy={busy && qaBusyMode === "framework"}
                >
                  <div className="tp-pv-head">
                    <div>
                      <span className="tp-pv-tag">Step 01</span>
                      <div className="tp-pv-title">项目页面框架</div>
                    </div>
                    <div className="tp-pv-actions">
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={!qaFrameworkPreview.trim()}
                        onClick={() =>
                          setQaFrameworkView((v) =>
                            v === "mindmap" ? "text" : "mindmap"
                          )
                        }
                      >
                        {qaFrameworkView === "mindmap" ? "纯文本" : "脑图"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={!qaFrameworkPreview.trim()}
                        onClick={() =>
                          downloadXmind(
                            cleanGeneratedMd(qaFrameworkPreview),
                            buildXmindFilename(tpProjectName, "页面框架"),
                            `${tpProjectName} · 页面框架`
                          )
                        }
                      >
                        .xmind
                      </button>
                    </div>
                  </div>
                  <div className={"tp-pv-body" + (qaFrameworkPreview.trim() ? " has-content" : "")}>
                    {qaFrameworkPreview.trim() ? (
                      qaFrameworkView === "mindmap" ? (
                        <FrameworkMindmap markdown={qaFrameworkPreview} />
                      ) : (
                        <pre className="md-preview md-preview-framework">
                          {qaFrameworkPreview}
                        </pre>
                      )
                    ) : (
                      <div className="tp-pv-empty">
                        <div className="tp-orb tp-orb-1" aria-hidden="true" />
                        {busy && qaBusyMode === "framework"
                          ? "正在梳理页面框架…"
                          : "点「① 生成页面框架」开始"}
                      </div>
                    )}
                  </div>
                </section>
                ) : null}

                {tpPreviewTab === "biz" ? (
                <section
                  className={
                    "tp-pv tp-panel-single" +
                    (busy && qaBusyMode === "biz" ? " is-loading" : "")
                  }
                  aria-label="业务场景测试点预览"
                  aria-busy={busy && qaBusyMode === "biz"}
                >
                  <div className="tp-pv-head">
                    <div>
                      <span className="tp-pv-tag tp-pv-tag-biz">Step 02</span>
                      <div className="tp-pv-title">业务场景测试点（冒烟门禁 + 场景）</div>
                    </div>
                    <div className="tp-pv-actions">
                      <button type="button" className="btn btn-small" disabled>
                        .md
                      </button>
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={!qaBizPreview.trim()}
                        onClick={() =>
                          downloadXmind(
                            cleanGeneratedMd(qaBizPreview),
                            buildXmindFilename(tpProjectName, "业务场景"),
                            `${tpProjectName} · 业务场景`
                          )
                        }
                      >
                        .xmind
                      </button>
                    </div>
                  </div>
                  <div className={"tp-pv-body" + (qaBizPreview.trim() ? " has-content" : "")}>
                    {qaBizPreview.trim() ? (
                      <pre className="md-preview md-preview-rail">{qaBizPreview}</pre>
                    ) : (
                      <div className="tp-pv-empty">
                        <div className="tp-orb tp-orb-2" aria-hidden="true" />
                        {busy && qaBusyMode === "biz"
                          ? "正在生成业务场景…"
                          : "完成框架后生成正/逆向路径"}
                      </div>
                    )}
                  </div>
                </section>
                ) : null}

                {tpPreviewTab === "func" ? (
                <section
                  className={
                    "tp-pv tp-panel-single" +
                    (busy && qaBusyMode === "testpoints" ? " is-loading" : "")
                  }
                  aria-label="页面功能测试点预览"
                  aria-busy={busy && qaBusyMode === "testpoints"}
                >
                  <div className="tp-pv-head">
                    <div>
                      <span className="tp-pv-tag tp-pv-tag-func">Step 03</span>
                      <div className="tp-pv-title">页面功能测试点</div>
                    </div>
                    <div className="tp-pv-actions">
                      <button type="button" className="btn btn-small" disabled>
                        .md
                      </button>
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={!qaMdPreview.trim()}
                        onClick={() =>
                          downloadXmind(
                            cleanGeneratedMd(qaMdPreview),
                            buildXmindFilename(tpProjectName, "功能测试点"),
                            `${tpProjectName} · 功能测试点`
                          )
                        }
                      >
                        .xmind
                      </button>
                    </div>
                  </div>
                  <div className={"tp-pv-body" + (qaMdPreview.trim() ? " has-content" : "")}>
                    {qaMdPreview.trim() ? (
                      <pre className="md-preview md-preview-rail">{qaMdPreview}</pre>
                    ) : (
                      <div className="tp-pv-empty">
                        <div className="tp-orb tp-orb-3" aria-hidden="true" />
                        {busy && qaBusyMode === "testpoints"
                          ? "正在展开页面功能…"
                          : "展开筛选、弹窗、字段校验"}
                      </div>
                    )}
                  </div>
                </section>
                ) : null}

                {tpPreviewTab === "special" ? (
                <section
                  className={
                    "tp-pv tp-panel-single" +
                    (busy && qaBusyMode === "special" ? " is-loading" : "")
                  }
                  aria-label="专项测试点预览"
                  aria-busy={busy && qaBusyMode === "special"}
                >
                  <div className="tp-pv-head">
                    <div>
                      <span className="tp-pv-tag tp-pv-tag-func">Step 04</span>
                      <div className="tp-pv-title">专项测试点</div>
                    </div>
                    <div className="tp-pv-actions">
                      <button type="button" className="btn btn-small" disabled>
                        .md
                      </button>
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={!qaSpecialPreview.trim()}
                        onClick={() =>
                          downloadXmind(
                            cleanGeneratedMd(qaSpecialPreview),
                            buildXmindFilename(tpProjectName, "专项测试点"),
                            `${tpProjectName} · 专项测试点`
                          )
                        }
                      >
                        .xmind
                      </button>
                    </div>
                  </div>
                  <div className={"tp-pv-body" + (qaSpecialPreview.trim() ? " has-content" : "")}>
                    {qaSpecialPreview.trim() ? (
                      <pre className="md-preview md-preview-rail">{qaSpecialPreview}</pre>
                    ) : (
                      <div className="tp-pv-empty">
                        <div className="tp-orb tp-orb-3" aria-hidden="true" />
                        {busy && qaBusyMode === "special"
                          ? "正在生成专项测试…"
                          : "权限 / 并发幂等 / 弱网 / 兼容 / 安全"}
                      </div>
                    )}
                  </div>
                </section>
                ) : null}

                {tpPreviewTab === "pw" ? (
                <section
                  className={
                    "tp-pv tp-panel-single" +
                    (busy && qaBusyMode === "testpoints" && qaGenPwSpec
                      ? " is-loading"
                      : "")
                  }
                  aria-label="Playwright Test 预览"
                  aria-busy={busy && qaBusyMode === "testpoints" && qaGenPwSpec}
                >
                  <div className="tp-pv-head">
                    <div>
                      <span className="tp-pv-tag tp-pv-tag-pw">Optional</span>
                      <div className="tp-pv-title">Playwright Test（.spec.ts）</div>
                    </div>
                    <div className="tp-pv-actions">
                      <button
                        type="button"
                        className="btn btn-small"
                        onClick={() => {
                          setTpPwDebugModalOpen(true);
                          fetchPwLatestErrors();
                        }}
                      >
                        调试 pw
                      </button>
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={!qaPwSpecPreview.trim()}
                        onClick={() =>
                          downloadMarkdown("playwright.spec.ts", qaPwSpecPreview)
                        }
                      >
                        下载 .spec.ts
                      </button>
                    </div>
                  </div>
                  <div className={"tp-pv-body" + (qaPwSpecPreview.trim() ? " has-content" : "")}>
                    {qaPwSpecPreview.trim() ? (
                      <pre className="md-preview md-preview-rail">{qaPwSpecPreview}</pre>
                    ) : (
                      <div className="tp-pv-empty">
                        <div className="tp-orb tp-orb-3" aria-hidden="true" />
                        {busy && qaBusyMode === "testpoints" && qaGenPwSpec
                          ? "Markdown 完成后将继续生成 .spec.ts…"
                          : "点「调试 pw」勾选生成并填写测试环境，再跑第③步"}
                      </div>
                    )}
                  </div>
                </section>
                ) : null}
              </div>
            ) : roleTab === "pm" ? (
              showPmPrototypeIframe ? (
                <iframe
                  title="prototype"
                  key={`pf-rail-${sessionId}-${previewBust}`}
                  src={prototypeFrame}
                />
              ) : (
                <div className="preview-placeholder">
                  {pmPreviewGenerating
                    ? `方案${pmSolutionIdx + 1} 原型生成中，请勿刷新…`
                    : pmVariantReady[pmSolutionIdx]
                      ? "若预览空白请点「刷新预览」或稍候写入完成。"
                      : "在左侧选择方案并点击「生成原型」。"}
                </div>
              )
            ) : roleTab === "ui" ? (
              showUiStageIframe ? (
                <iframe
                  title="ui-preview"
                  key={`ui-rail-${sessionId}-${previewBust}-${uiFrame ? "ui" : "proto"}`}
                  src={uiFrame || prototypeFrame}
                />
              ) : (
                <div className="preview-placeholder">
                  {uiPreviewGenerating
                    ? `方案${uiSolutionIdx + 1} UI 生成中…`
                    : uiVariantReady[uiSolutionIdx]
                      ? "若预览空白请稍候或切换方案后重试。"
                      : "在左侧 UI 方案处点击「生成 UI」后在此预览。"}
                </div>
              )
            ) : roleTab === "fs" ? (
              sessionId ? (
                <iframe
                  title="app"
                  key={`app-rail-${sessionId}-${previewBust}`}
                  src={appFrame}
                />
              ) : (
                <div className="preview-placeholder">
                  完成 UI 定稿并在左侧点击「全栈落地」后，将在此预览 app/index.html。
                </div>
              )
            ) : roleTab === "qa" ? (
              qaSubTab === "pipeline" ? (
                sessionId ? (
                  <iframe
                    title="qa-app"
                    key={`qa-app-rail-${sessionId}-${previewBust}`}
                    src={appFrame}
                  />
                ) : (
                  <div className="preview-placeholder">
                    请先完成全栈落地，右侧将展示可运行的 app。
                  </div>
                )
              ) : qaMdPreview.trim() ? (
                <pre className="md-preview md-preview-rail">{qaMdPreview}</pre>
              ) : (
                <div className="preview-placeholder md-placeholder">
                  在左侧「独立测试」页填写素材并生成后，测试点 Markdown 将显示于此。
                </div>
              )
            ) : opsMdPreview.trim() ? (
              <pre className="md-preview md-preview-rail">{opsMdPreview}</pre>
            ) : (
              <div className="preview-placeholder md-placeholder">
                在左侧填写运维说明并「生成运维手册」后，将在此展示 Markdown。
              </div>
            )}
          </div>
        </div>
        </div>
        ) : null}

        {!embedWorkbench ? (
        <div className="card workspace-bottom">
          {(() => {
            const r = roleTab;
            const ROLE_LABEL = {
              pm: "产品经理",
              ui: "UI 设计",
              fs: "全栈落地",
              qa: "测试岗",
              ops: "运维岗",
            }[r];
            const FILE_HINT = {
              pm: "prototype.html",
              ui: "ui.html",
              fs: "app/index.html / styles.css / app.js",
              qa: "测试点.md",
              ops: "运维手册.md",
            }[r];
            const hist = chatHistory[r] || [];
            const sending = chatBusyRole === r;
            const disabled =
              sending ||
              !sessionId ||
              busy ||
              (config.provider === "cursor"
                ? !(config.cursorApiKey && config.cursorRepoUrl)
                : !config.apiKey);
            return (
              <div className="role-chat" aria-label={`${ROLE_LABEL} 追问对话`}>
                <div className="role-chat-head">
                  <h3 className="role-chat-title">追问 {ROLE_LABEL}</h3>
                  <span className="role-chat-sub">
                    <code>skills/roles/{r === "fs" ? "fullstack" : r}/SKILL.md</code>
                    {" · "}
                    <code>### FILE: {FILE_HINT}</code>
                  </span>
                </div>
                <div className="role-chat-log" aria-live="polite">
                  {hist.length === 0 ? (
                    <div className="role-chat-msg-empty">
                      {sessionId
                        ? "尚无追问；完成主输出后可在此与该角色多轮对话。"
                        : "请先在本页完成主输出（如生成原型 / UI / 全栈落地），生成会话目录。"}
                    </div>
                  ) : (
                    hist.map((m, i) => (
                      <div
                        key={i}
                        className={`role-chat-msg role-chat-msg-${m.role}`}
                      >
                        {m.content || (m.role === "assistant" && sending && i === hist.length - 1
                          ? "…"
                          : "")}
                      </div>
                    ))
                  )}
                </div>
                <div className="role-chat-input-row">
                  <div className="role-chat-input-wrap">
                    <textarea
                      className="role-chat-input"
                      rows={2}
                      placeholder={
                        sessionId
                          ? `向${ROLE_LABEL}追问（Ctrl/⌘+Enter 发送，可直接粘贴截图）`
                          : "请先完成主输出"
                      }
                      value={chatInput[r] || ""}
                      onChange={(e) =>
                        setChatInput((prev) => ({ ...prev, [r]: e.target.value }))
                      }
                      onPaste={(e) => onPasteChatImages(r, e)}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                          e.preventDefault();
                          if (!disabled) sendRoleChat(r);
                        }
                      }}
                      disabled={disabled}
                    />
                    {(chatImageItems[r] || []).length > 0 ? (
                      <ul className="thumb-strip role-chat-thumbs">
                        {(chatImageItems[r] || []).map((item, idx) => (
                          <li key={item.name + idx} className="thumb-strip-item">
                            <img src={item.dataUrl} alt={item.name} />
                            <button
                              type="button"
                              className="thumb-remove"
                              aria-label="移除附图"
                              onClick={() =>
                                setChatImageItems((prev) => ({
                                  ...prev,
                                  [r]: (prev[r] || []).filter((_, j) => j !== idx),
                                }))
                              }
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div className="role-chat-actions">
                    <button
                      type="button"
                      className="btn btn-small btn-primary"
                      disabled={
                        disabled ||
                        (!(chatInput[r] || "").trim() && !(chatImageItems[r] || []).length)
                      }
                      onClick={() => sendRoleChat(r)}
                    >
                      {sending ? "回复中…" : "发送"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={sending || hist.length === 0}
                      onClick={() =>
                        setChatHistory((prev) => ({ ...prev, [r]: [] }))
                      }
                      title="只清空当前面板显示，磁盘 JSONL 历史仍保留"
                    >
                      清屏
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="log-panel">
            <div className="log-panel-head">
              <h3 className="log-section-title">思考与执行流</h3>
              <button
                type="button"
                className="btn btn-small btn-ghost"
                onClick={() => setLogOpen((o) => !o)}
                aria-expanded={logOpen}
              >
                {logOpen ? "收起日志" : "展开日志"}
              </button>
            </div>
            {logOpen ? (
              <>
                <details className="log-hint-details">
                  <summary className="hint">排查提示</summary>
                  <p className="hint log-hint">
                    「模型配置」→ 测试连接；终端 <code>AGILE_SIM_DEBUG=1</code>；F12 看{" "}
                    <code>/api/pipeline/*</code> 是否 canceled。
                  </p>
                </details>
                {liveThought ? (
                  <pre className="live-thought" aria-live="polite">
                    {liveThought}
                  </pre>
                ) : null}
                <div className="log-scroll" ref={logScrollRef}>
                  {logLines.length === 0 ? (
                    <div className="hint">尚无日志</div>
                  ) : (
                    logLines.map((l) => (
                      <div
                        key={l.t + l.text.slice(0, 12)}
                        className={
                          "line " +
                          (l.muted ? "muted" : "") +
                          (/^[✓✗]/.test(l.text) ? " log-line-marked" : "")
                        }
                      >
                        {l.text}
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <p className="hint log-collapsed-hint">
                {logLines.length} 条日志已折叠
              </p>
            )}
          </div>
        </div>
        ) : null}
      </div>


      {pmSpecModalOpen && pmSpecMd.trim() ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setPmSpecModalOpen(false)}
        >
          <div
            className="modal-panel modal-panel-spec"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pm-spec-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2 id="pm-spec-title">标准需求文档</h2>
              <button
                type="button"
                className="modal-close"
                aria-label="关闭"
                onClick={() => setPmSpecModalOpen(false)}
              >
                ×
              </button>
            </div>
            <p className="hint">
              路径：<code>generated/{sessionId || "…"}/需求文档.md</code>
            </p>
            <pre className="md-preview md-preview-modal">{pmSpecMd}</pre>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-small"
                onClick={() => downloadMarkdown("需求文档.md", pmSpecMd)}
              >
                下载
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setPmSpecModalOpen(false)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyModalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setHistoryModalOpen(false)}
        >
          <div
            className="modal-panel modal-panel-history"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-list-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2 id="history-list-title">已完成项目</h2>
              <button
                type="button"
                className="modal-close"
                aria-label="关闭"
                onClick={() => setHistoryModalOpen(false)}
              >
                ×
              </button>
            </div>
            <p className="hint history-modal-hint">
              全栈生成 <code>app/</code> 后写入本列表（仅保存在本浏览器）。点击一项查看详情，可
              <strong>嵌入流水线</strong>恢复会话。
            </p>
            {historyRecords.length === 0 ? (
              <div className="history-modal-empty hint">
                暂无记录；请先跑完整条流水线至全栈落地。
              </div>
            ) : (
              <ul className="history-list history-list-modal">
                {historyRecords.map((r) => (
                  <li key={r.sessionId}>
                    <button
                      type="button"
                      className="history-item"
                      onClick={() => {
                        setHistoryModalOpen(false);
                        setHistoryDetail(r);
                      }}
                    >
                      <span className="history-req">
                        {(r.requirement || "（无需求）").slice(0, 120)}
                        {(r.requirement || "").length > 120 ? "…" : ""}
                      </span>
                      <span className="history-meta">
                        {new Date(r.finishedAt).toLocaleString("zh-CN")} · {r.sessionId}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setHistoryModalOpen(false)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyDetail ? (
        <div
          className="modal-backdrop modal-backdrop-front"
          role="presentation"
          onClick={() => setHistoryDetail(null)}
        >
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2 id="history-detail-title">项目详情</h2>
              <button
                type="button"
                className="modal-close"
                aria-label="关闭"
                onClick={() => setHistoryDetail(null)}
              >
                ×
              </button>
            </div>
            <div className="field">
              <label>会话 ID</label>
              <div className="mono-p">{historyDetail.sessionId}</div>
            </div>
            <div className="field">
              <label>用户需求</label>
              <textarea
                readOnly
                value={historyDetail.requirement || ""}
                rows={6}
                style={{ resize: "vertical" }}
              />
            </div>
            <div className="field">
              <label>生成目录（点击打开）</label>
              <button
                type="button"
                className="path-open-btn"
                onClick={() => openFolderInExplorer(historyDetail.outputDir)}
              >
                {historyDetail.outputDir}
              </button>
            </div>
            <p className="hint" style={{ marginBottom: 0 }}>
              完成时间：{new Date(historyDetail.finishedAt).toLocaleString("zh-CN")}
            </p>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-embed-pipeline"
                onClick={() => embedHistoryIntoPipeline(historyDetail)}
                title="恢复该会话到左侧主流水线，继续全栈/测试/追问（不重新生成会话 ID）"
              >
                嵌入流水线
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => openFolderInExplorer(historyDetail.outputDir)}
              >
                打开文件夹
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setHistoryDetail(null)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
