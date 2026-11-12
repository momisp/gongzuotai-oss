import { useCallback, useEffect, useMemo, useState } from "react";
import FrameworkScanPlayer, {
  FrameworkScanFallback,
} from "./FrameworkScanPlayer.jsx";
import DataVerifyOptimized from "./DataVerifyOptimized.jsx";

const DRAFT_KEY = "dv_draft_v1";
const HANDOFF_KEY = "dv_handoff_v1";

/** 与后端 SSE step 对齐的真实进度（不再定时假打钩） */
const DV_PROGRESS_STEPS = [
  "打开原型链接",
  "浏览器渲染页面",
  "识别数据展示字段",
  "生成验证表格",
];

const API_ORIGIN = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

/** AI 辅助验证比对表：按工作台卡片分组（三合一） */
const AI_COMPARE_METRICS = [
  {
    key: "todayReg",
    name: "今日渠道玩家注册",
    sqlKey: "todayRegCount",
    format: "number",
    group: "reg",
    groupTitle: "① 工作台卡片：今日渠道玩家注册",
    groupHint: "三合一：主值=今日注册；副文案=环比昨日。期望=商户旗下全会长汇总（非仅一级会长）",
    note: "卡片主数字",
  },
  {
    key: "yesterdayReg",
    name: "昨日渠道玩家注册",
    sqlKey: "yesterdayRegCount",
    format: "number",
    group: "reg",
    groupTitle: "① 工作台卡片：今日渠道玩家注册",
    groupHint: "三合一：主值=今日注册；副文案=环比昨日。期望=商户旗下全会长汇总（非仅一级会长）",
    note: "用于算环比，页上通常不单独展示",
  },
  {
    key: "momRatio",
    name: "环比昨日（注册）",
    sqlKey: "momHint",
    format: "percent",
    group: "reg",
    groupTitle: "① 工作台卡片：今日渠道玩家注册",
    groupHint: "三合一：主值=今日注册；副文案=环比昨日。期望=商户旗下全会长汇总（非仅一级会长）",
    note: "页上「较昨日」",
  },
  {
    key: "todayLogin",
    name: "今日渠道活跃玩家",
    sqlKey: "todayLogin",
    format: "number",
    group: "login",
    groupTitle: "② 工作台卡片：今日渠道活跃玩家",
    groupHint: "三合一：主值=今日活跃；副文案=较昨日。期望=商户旗下全会长 active_cnt 求和（与 L3 页一致）",
    note: "卡片主数字；tab_user_day_login 去重 user_id",
  },
  {
    key: "yesterdayLogin",
    name: "昨日渠道活跃玩家",
    sqlKey: "yesterdayLogin",
    format: "number",
    group: "login",
    groupTitle: "② 工作台卡片：今日渠道活跃玩家",
    groupHint: "三合一：主值=今日活跃；副文案=较昨日。期望=商户旗下全会长 active_cnt 求和（与 L3 页一致）",
    note: "页上通常不单独展示；用于算环比",
  },
  {
    key: "loginMomRatio",
    name: "环比昨日（活跃）",
    sqlKey: "loginMomHint",
    format: "percent",
    group: "login",
    groupTitle: "② 工作台卡片：今日渠道活跃玩家",
    groupHint: "三合一：主值=今日活跃；副文案=较昨日。期望=商户旗下全会长 active_cnt 求和（与 L3 页一致）",
    note: "页上「较昨日」；若仍见 +190.5%/61 多为造数前缓存",
  },
  {
    key: "todayPay",
    name: "今日渠道玩家充值金额",
    sqlKey: "todayPay",
    format: "number",
    group: "pay",
    groupTitle: "③ 工作台卡片：今日充值金额",
    groupHint: "三合一：主值=今日充值；副文案=较昨日。期望=商户旗下全会长 total_pay 求和",
    note: "卡片主数字（¥）",
  },
  {
    key: "yesterdayPay",
    name: "昨日渠道玩家充值金额",
    sqlKey: "yesterdayPay",
    format: "number",
    group: "pay",
    groupTitle: "③ 工作台卡片：今日充值金额",
    groupHint: "三合一：主值=今日充值；副文案=较昨日。期望=商户旗下全会长 total_pay 求和",
    note: "页上通常不单独展示；用于算环比",
  },
  {
    key: "payMomRatio",
    name: "环比昨日（充值）",
    sqlKey: "payMomHint",
    format: "percent",
    group: "pay",
    groupTitle: "③ 工作台卡片：今日充值金额",
    groupHint: "三合一：主值=今日充值；副文案=较昨日。期望=商户旗下全会长 total_pay 求和",
    note: "页上「较昨日」；对不上先跑商务日汇总-今日/昨日",
  },
  {
    key: "monthPay",
    name: "本月充值金额",
    sqlKey: "monthPay",
    format: "number",
    group: "monthPay",
    groupTitle: "④ 工作台卡片：本月充值金额",
    groupHint: "三合一：主值=本月1号~今天；副文案=较上月同期。期望=商户旗下全会长日汇总 total_pay 求和",
    note: "卡片主数字（¥）；常见 4740=昨2650+今2090",
  },
  {
    key: "lastMonthPay",
    name: "上月充值金额",
    sqlKey: "lastMonthPay",
    format: "number",
    group: "monthPay",
    groupTitle: "④ 工作台卡片：本月充值金额",
    groupHint: "三合一：主值=本月1号~今天；副文案=较上月同期。期望=商户旗下全会长日汇总 total_pay 求和",
    note: "上月整月（至上月末）；页上通常不单独展示",
  },
  {
    key: "monthPayMomRatio",
    name: "环比上月（较上月同期）",
    sqlKey: "monthPayMomHint",
    format: "percent",
    group: "monthPay",
    groupTitle: "④ 工作台卡片：本月充值金额",
    groupHint: "三合一：主值=本月1号~今天；副文案=较上月同期。期望=商户旗下全会长日汇总 total_pay 求和",
    note: "页「较上月同期」；上月同期为0时常显示 0.0%",
  },
  {
    key: "todayActiveChannels",
    name: "今日活跃渠道数",
    sqlKey: "todayActiveChannels",
    format: "number",
    group: "activeChannel",
    groupTitle: "⑤ 工作台卡片：活跃渠道数",
    groupHint: "三合一：主值=今日活跃渠道；副文案=环比昨日%。同会长多笔只计1",
    note: "旗下渠道当日有注册或充值则+1",
  },
  {
    key: "yesterdayActiveChannels",
    name: "昨日活跃渠道数",
    sqlKey: "yesterdayActiveChannels",
    format: "number",
    group: "activeChannel",
    groupTitle: "⑤ 工作台卡片：活跃渠道数",
    groupHint: "三合一：主值=今日活跃渠道；副文案=环比昨日%。同会长多笔只计1",
    note: "页上通常不单独展示；用于算环比",
  },
  {
    key: "activeChannelDelta",
    name: "环比昨日（活跃渠道）",
    sqlKey: "activeChannelDeltaHint",
    format: "percent",
    group: "activeChannel",
    groupTitle: "⑤ 工作台卡片：活跃渠道数",
    groupHint: "三合一：主值=今日活跃渠道；副文案=环比昨日%。同会长多笔只计1",
    note: "页「环比昨日」=(今−昨)/昨；造数昨2今4→+100%（差值会是+2）",
  },
  {
    key: "todayNewChannels",
    name: "今日新增渠道数",
    sqlKey: "todayNewChannels",
    format: "number",
    group: "newChannel",
    groupTitle: "⑥ 工作台卡片：新增渠道数",
    groupHint: "三合一：主值=今日新增；副文案=环比昨日%。造数昨2今4→+100%",
    note: "busier 下一级渠道 create_time=今天",
  },
  {
    key: "yesterdayNewChannels",
    name: "昨日新增渠道数",
    sqlKey: "yesterdayNewChannels",
    format: "number",
    group: "newChannel",
    groupTitle: "⑥ 工作台卡片：新增渠道数",
    groupHint: "三合一：主值=今日新增；副文案=环比昨日%。造数昨2今4→+100%",
    note: "页通常不单独展示；create_time 改到昨天后计入",
  },
  {
    key: "newChannelDelta",
    name: "环比昨日（新增渠道）",
    sqlKey: "newChannelDeltaHint",
    format: "percent",
    group: "newChannel",
    groupTitle: "⑥ 工作台卡片：新增渠道数",
    groupHint: "三合一：主值=今日新增；副文案=环比昨日%。造数昨2今4→+100%",
    note: "页「环比昨日」=(今−昨)/昨；差值会是+2，对得上才是环比",
  },
  { key: "topTodayReg", name: "渠道注册 TOP（今日合计）", sqlKey: "topTodayReg", format: "number", group: "other", groupTitle: "其它指标（后续逐组对齐）", groupHint: "", note: "wb_top_* 今日注册合计" },
  { key: "topYesterdayReg", name: "渠道注册 TOP（昨日合计）", sqlKey: "topYesterdayReg", format: "number", group: "other", groupTitle: "其它指标（后续逐组对齐）", groupHint: "", note: "wb_top_* 昨日注册合计" },
  { key: "topTodayPay", name: "渠道充值 TOP（今日合计）", sqlKey: "topTodayPay", format: "number", group: "other", groupTitle: "其它指标（后续逐组对齐）", groupHint: "", note: "wb_top_* 今日充值合计" },
  { key: "topChannels", name: "TOP 渠道数", sqlKey: "topChannels", format: "number", group: "other", groupTitle: "其它指标（后续逐组对齐）", groupHint: "", note: "清单渠道个数" },
  { key: "subPlayers", name: "下级 L2/L3 玩家数", sqlKey: "subPlayers", format: "number", group: "other", groupTitle: "其它指标（后续逐组对齐）", groupHint: "", note: "下级玩家总数" },
];

function judgeAiCompareRow(expected, pageVal, format) {
  if (expected == null && (pageVal == null || pageVal === "")) return "pending";
  if (pageVal == null || pageVal === "") return "page_missing";
  if (expected == null) return "db_only";
  const a = Number(expected);
  let b = Number(pageVal);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "mismatch";
  if (format === "percent") {
    let x = a;
    let y = b;
    if (Math.abs(x) > 1.5) x /= 100;
    if (Math.abs(y) > 1.5) y /= 100;
    return Math.abs(x - y) <= 0.005 ? "ok" : "mismatch";
  }
  return Math.abs(a - b) <= 0.01 ? "ok" : "mismatch";
}

function buildAiCompareRows(dbMetrics, pageMetrics = {}, prevRows = []) {
  const db = normalizeAiDbMetrics(dbMetrics);
  const page = pageMetrics || {};
  const prevMap = Object.fromEntries((prevRows || []).map((r) => [r.key, r]));
  return AI_COMPARE_METRICS.map((m) => {
    const prev = prevMap[m.key] || {};
    const expected = db[m.key] != null ? db[m.key] : prev.expected;
    const pageVal =
      page[m.key] != null
        ? page[m.key]
        : prev.pageInput != null && prev.pageInput !== ""
          ? prev.pageInput
          : prev.page;
    return {
      key: m.key,
      sqlKey: m.sqlKey,
      name: m.name,
      format: m.format,
      group: m.group,
      groupTitle: m.groupTitle,
      groupHint: m.groupHint,
      expected,
      page: pageVal,
      pageInput: pageVal == null || pageVal === "" ? "" : String(pageVal),
      status: judgeAiCompareRow(expected, pageVal, m.format),
      note: m.note,
    };
  });
}

/** 库缺环比时用今/昨回算，避免「环比无期望」 */
function normalizeAiDbMetrics(dbMetrics) {
  const db = { ...(dbMetrics || {}) };
  const fillMom = (momKey, todayKey, yKey) => {
    if (db[momKey] != null && db[momKey] !== "") return;
    const t = Number(db[todayKey]);
    const y = Number(db[yKey]);
    if (!Number.isFinite(t) || !Number.isFinite(y)) return;
    if (y > 0) db[momKey] = Math.round(((t - y) / y) * 10000) / 10000;
    else if (t === 0) db[momKey] = 0;
  };
  fillMom("momRatio", "todayReg", "yesterdayReg");
  fillMom("loginMomRatio", "todayLogin", "yesterdayLogin");
  fillMom("payMomRatio", "todayPay", "yesterdayPay");
  fillMom("activeChannelDelta", "todayActiveChannels", "yesterdayActiveChannels");
  fillMom("newChannelDelta", "todayNewChannels", "yesterdayNewChannels");
  // 本月环比：优先用上月同期；缺省时用上月整月；分母0→0（对齐页）
  if (db.monthPayMomRatio == null || db.monthPayMomRatio === "") {
    const t = Number(db.monthPay);
    const y = Number(
      db.lastMonthSamePeriodPay != null ? db.lastMonthSamePeriodPay : db.lastMonthPay
    );
    if (Number.isFinite(t) && Number.isFinite(y)) {
      db.monthPayMomRatio = y > 0 ? Math.round(((t - y) / y) * 10000) / 10000 : 0;
    }
  }
  return db;
}

/** 只更新指定组；其它组页值/比对结论原样保留 */
function applyAiGroupCompare(prevRows, groupId, dbMetrics, pageMetrics) {
  const db = normalizeAiDbMetrics(dbMetrics);
  const page = pageMetrics || {};
  const prevList = prevRows?.length ? prevRows : buildAiCompareRows(db, {}, []);
  const prevMap = Object.fromEntries(prevList.map((r) => [r.key, r]));

  return AI_COMPARE_METRICS.map((m) => {
    const prev = prevMap[m.key] || {
      key: m.key,
      sqlKey: m.sqlKey,
      name: m.name,
      format: m.format,
      group: m.group,
      groupTitle: m.groupTitle,
      groupHint: m.groupHint,
      expected: null,
      page: null,
      pageInput: "",
      status: "pending",
      note: m.note,
    };
    const base = {
      ...prev,
      key: m.key,
      sqlKey: m.sqlKey,
      name: m.name,
      format: m.format,
      group: m.group,
      groupTitle: m.groupTitle,
      groupHint: m.groupHint,
      note: m.note,
    };

    if (m.group !== groupId) return base;

    const expected = db[m.key] != null ? db[m.key] : prev.expected;
    const isYesterdayDetail =
      m.key === "yesterdayReg" ||
      m.key === "yesterdayLogin" ||
      m.key === "yesterdayPay" ||
      m.key === "lastMonthPay" ||
      m.key === "yesterdayActiveChannels" ||
      m.key === "yesterdayNewChannels";
    let pageVal = page[m.key] != null ? page[m.key] : null;
    if (isYesterdayDetail && (pageVal == null || pageVal === "")) {
      return { ...base, expected, page: null, pageInput: "", status: "db_only" };
    }
    if (pageVal == null || pageVal === "") {
      pageVal =
        prev.pageInput !== "" && prev.pageInput != null ? prev.pageInput : prev.page;
    }
    return {
      ...base,
      expected,
      page: pageVal,
      pageInput: pageVal == null || pageVal === "" ? "" : String(pageVal),
      status: judgeAiCompareRow(expected, pageVal, m.format),
    };
  });
}

/**
 * 按当前 AI_COMPARE_METRICS 补齐行。
 * session 里若是旧版（缺⑤活跃渠道等），只刷期望会一直看不到新组。
 */
function mergeAiCompareRowsWithDefs(prevRows, dbMetrics = {}) {
  const db = normalizeAiDbMetrics(dbMetrics);
  const prevMap = Object.fromEntries((prevRows || []).map((r) => [r.key, r]));
  return AI_COMPARE_METRICS.map((m) => {
    const prev = prevMap[m.key];
    if (!prev) {
      const expected = db[m.key] != null ? db[m.key] : null;
      return {
        key: m.key,
        sqlKey: m.sqlKey,
        name: m.name,
        format: m.format,
        group: m.group,
        groupTitle: m.groupTitle,
        groupHint: m.groupHint,
        expected,
        page: null,
        pageInput: "",
        status: judgeAiCompareRow(expected, null, m.format),
        note: m.note,
      };
    }
    return {
      ...prev,
      key: m.key,
      sqlKey: m.sqlKey,
      name: m.name,
      format: m.format,
      group: m.group,
      groupTitle: m.groupTitle,
      groupHint: m.groupHint,
      note: m.note,
      expected: db[m.key] != null ? db[m.key] : prev.expected,
    };
  });
}

/** 刷期望并补齐新指标组；已有行的页值/比对结论保留 */
function refreshAiExpectedOnly(prevRows, dbMetrics) {
  return mergeAiCompareRowsWithDefs(prevRows, dbMetrics);
}

function groupAiCompareRows(rows) {
  const order = [];
  const map = {};
  for (const r of rows) {
    const g = r.group || "other";
    if (!map[g]) {
      map[g] = {
        id: g,
        title: r.groupTitle || g,
        hint: r.groupHint || "",
        rows: [],
      };
      order.push(g);
    }
    map[g].rows.push(r);
  }
  return order.map((id) => map[id]);
}

function fmtAiCompareVal(v, format) {
  if (v == null || v === "") return "—";
  if (format === "percent") {
    let n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    if (Math.abs(n) <= 1.5) n *= 100;
    return `${n.toFixed(2)}%`;
  }
  const n = Number(v);
  if (Number.isFinite(n) && String(v).includes(".")) return n.toFixed(2);
  return String(v);
}

function aiCompareStorageKey(projectId) {
  return `dv_ai_compare_rows::${projectId || "proj_xinshangwu"}`;
}

function loadPersistedAiCompareRows(projectId) {
  try {
    const raw = sessionStorage.getItem(aiCompareStorageKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed?.rows) ? parsed.rows : Array.isArray(parsed) ? parsed : [];
    const cleaned = rows.filter((r) => r && r.key);
    // 旧 session 可能缺⑤活跃渠道等新组，加载时按定义补齐
    return cleaned.length ? mergeAiCompareRowsWithDefs(cleaned, {}) : [];
  } catch {
    return [];
  }
}

function persistAiCompareRows(projectId, rows) {
  try {
    if (!Array.isArray(rows) || !rows.length) return;
    sessionStorage.setItem(
      aiCompareStorageKey(projectId),
      JSON.stringify({ at: Date.now(), rows })
    );
  } catch {
    /* ignore quota */
  }
}

function clearPersistedAiCompareRows(projectId) {
  try {
    sessionStorage.removeItem(aiCompareStorageKey(projectId));
  } catch {
    /* ignore */
  }
}

function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_ORIGIN}${p}`;
}

async function consumeSse(url, body, onEvt) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    throw new Error(t.slice(0, 500) || `HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const chunks = buf.split("\n\n");
    buf = chunks.pop() || "";
    for (const block of chunks) {
      for (const line of block.split("\n")) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const json = s.slice(5).trim();
        if (!json) continue;
        try {
          onEvt(JSON.parse(json));
        } catch (err) {
          console.warn("[dv sse] JSON 解析失败", json.length, err?.message);
        }
      }
    }
  }
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
  if (res.headers.get("content-type")?.includes("application/json")) {
    return res.json();
  }
  return { ok: res.ok, status: res.status };
}

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function decodeUrlsInText(text) {
  return String(text || "").replace(
    /(?:https?:\/\/|file:\/\/\/)[^\s)\]>"']+/gi,
    (raw) => {
      try {
        return decodeURI(raw);
      } catch {
        return raw;
      }
    }
  );
}

function parseNum(raw) {
  let s = String(raw ?? "").trim();
  if (!s) return null;
  let neg = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    neg = true;
    s = s.slice(1, -1);
  }
  const hadPct = s.includes("%");
  s = s.replace(/[,，+\s]/g, "").replace(/%/g, "");
  s = s.replace(/[^\d.\-]/g, "");
  if (!s || s === "-" || s === "." || s === "-.") return null;
  let n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (neg) n = -n;
  if (hadPct && Math.abs(n) > 1.5) n = n / 100;
  else if (hadPct) {
    /* already ratio-like */
  }
  return n;
}

/** 简单公式求值：字段名替换为数值后计算 + - * / () */
function evalFormula(formula, valueMap) {
  const f = String(formula || "").trim();
  if (!f) return null;
  let expr = f.startsWith("=") ? f.slice(1) : f;
  const names = Object.keys(valueMap).sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (!name || !expr.includes(name)) continue;
    const v = valueMap[name];
    if (v == null || !Number.isFinite(v)) return null;
    expr = expr.split(name).join(`(${v})`);
  }
  expr = expr
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/\s+/g, "");
  if (/[^0-9+\-*/().eE]/.test(expr)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const n = Function(`"use strict"; return (${expr});`)();
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function formatDisplay(n, format) {
  if (n == null || !Number.isFinite(n)) return "";
  if (format === "percent") {
    return `${(n * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
  }
  return String(Math.round(n * 1000) / 1000);
}

function compareValues(pageRaw, dbRaw, format) {
  const a = parseNum(pageRaw);
  const b = parseNum(dbRaw);
  if (a == null || b == null) return { status: "pending", diff: null };
  let aa = a;
  let bb = b;
  // 页面 12.5% 已在 parseNum 转成 0.125；若一边是百分数一边是小数已处理
  if (format === "percent") {
    if (Math.abs(aa) > 1.5) aa /= 100;
    if (Math.abs(bb) > 1.5) bb /= 100;
  }
  const diff = aa - bb;
  const tol = format === "percent" ? 0.0005 : Math.max(0.01, Math.abs(aa) * 0.001);
  if (Math.abs(diff) <= tol) return { status: "ok", diff };
  return { status: "mismatch", diff };
}

function friendlyLlmError(err) {
  const s = String(err || "");
  if (/识图用 OpenAI 兼容|composer-2|Cursor Cloud|截图格式|草稿截断/i.test(s)) {
    return s;
  }
  if (/Invalid base64|image_url/i.test(s)) {
    return "截图发不过去（base64 无效）。请删掉缩略图，重新 Ctrl+V 贴一张较小的图，或先去掉图只靠链接提取。";
  }
  if (/InvalidEndpointOrModel|does not exist|NotFound/i.test(s)) {
    const m = /model or endpoint\s+(\S+)/i.exec(s)?.[1] || "";
    return (
      `当前模型「${m || "（未识别）"}」在你的 API 上不存在或无权限。\n` +
      `你选的是 Cursor：上方 composer-2.5 不用改。\n` +
      `请到「模型」弹窗最下方「识图用 OpenAI 兼容」，把 Model ID 填成火山接入点（ep- 开头），保存后再提取。`
    );
  }
  if (/aborted|已取消/i.test(s)) {
    return "提取被中断了。请再点一次「读取原型并提取字段」。";
  }
  if (/代理失败|timed out|超时|timeout|网络失败|fetch failed|Failed to fetch/i.test(s)) {
    return (
      "网络请求失败（常见于代理中断或访问模型接口失败）。\n" +
      "请再试一次；可先去掉截图只靠链接提取。若持续失败，重启 start.bat 后再试。"
    );
  }
  return s;
}

/** 压缩截图，避免火山 Invalid base64 / 体积过大 */
function compressImageFile(file, maxSide = 1280, quality = 0.82) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const src = String(reader.result || "");
      if (!src.startsWith("data:image/")) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (!w || !h) {
          resolve({ name: file.name || "paste.png", dataUrl: src });
          return;
        }
        const scale = Math.min(1, maxSide / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        let dataUrl = "";
        try {
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        } catch {
          dataUrl = src;
        }
        resolve({
          name: (file.name || "paste").replace(/\.\w+$/, "") + ".jpg",
          dataUrl,
        });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

function isValidImageDataUrl(dataUrl) {
  const m = /^data:image\/[\w.+-]+;base64,([A-Za-z0-9+/]+=*)$/i.exec(
    String(dataUrl || "").replace(/\s/g, "")
  );
  if (!m) return false;
  return m[1].length >= 32 && m[1].length % 4 === 0;
}

function emptyField(partial = {}) {
  return {
    id: uid(),
    name: "",
    source: "数据库统计",
    formula: "",
    pageValue: "",
    dbValue: "",
    format: "number",
    dependsOn: [],
    note: "",
    sql: "",
    page: "",
    kind: "",
    groupId: "",
    groupLabel: "",
    groupEdge: "",
    selected: true,
    ...partial,
  };
}

function stripMetricNoise(name) {
  return String(name || "")
    .replace(/环比昨日|环比上周|同比|环比|较昨日|较上周/g, "")
    .replace(/[+\-−]?\d+(\.\d+)?%?/g, "")
    .replace(/[（(].*?[)）]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

/** 前端再聚一次：今日/昨日/环比同卡紧挨，并标 groupEdge 供框选 */
function regroupFieldsForUi(fields) {
  const list = (fields || []).map((f, i) => ({ ...f, _i: i }));
  const n = list.length;
  if (n <= 1) {
    return list.map(({ _i, ...rest }) => ({
      ...rest,
      groupId: rest.groupId || "",
      groupLabel: rest.groupLabel || "",
      groupEdge: rest.groupId ? "only" : "",
    }));
  }
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const unite = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  const nameIndex = new Map();
  list.forEach((f, i) => {
    if (f.name) nameIndex.set(f.name, i);
  });
  list.forEach((f, i) => {
    for (const dep of f.dependsOn || []) {
      const j = nameIndex.get(dep);
      if (j != null) unite(i, j);
    }
    const formula = String(f.formula || "");
    if (formula) {
      list.forEach((o, j) => {
        if (i !== j && o.name && formula.includes(o.name)) unite(i, j);
      });
    }
  });
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = list[i].name;
      const b = list[j].name;
      if (!a || !b) continue;
      if (list[i].groupId && list[i].groupId === list[j].groupId) {
        unite(i, j);
        continue;
      }
      const sa = stripMetricNoise(a);
      const sb = stripMetricNoise(b);
      if (sa && sb && (sa === sb || a.includes(sb) || b.includes(sa))) {
        const ratio = /环比|同比|较昨|较上/.test(a) || /环比|同比|较昨|较上/.test(b);
        const dayPair =
          (/今日|当天/.test(a) && /昨日|前天/.test(b)) ||
          (/今日|当天/.test(b) && /昨日|前天/.test(a));
        if (ratio || dayPair) unite(i, j);
      }
    }
  }
  const buckets = new Map();
  list.forEach((f, i) => {
    const r = find(i);
    if (!buckets.has(r)) buckets.set(r, []);
    buckets.get(r).push(f);
  });
  const roots = [...buckets.keys()].sort(
    (a, b) =>
      Math.min(...buckets.get(a).map((x) => x._i)) -
      Math.min(...buckets.get(b).map((x) => x._i))
  );
  const score = (f) => {
    let s = 0;
    if (/环比|同比|较昨|较上|占比/.test(f.name) || f.formula) s += 20;
    if (/昨日|上周|上期/.test(f.name)) s += 10;
    if (/今日|当天|本期/.test(f.name)) s += 5;
    return s;
  };
  const out = [];
  let gSeq = 0;
  for (const root of roots) {
    const members = buckets
      .get(root)
      .sort((a, b) => score(a) - score(b) || a._i - b._i);
    const isGroup = members.length >= 2;
    const gid = isGroup ? members[0].groupId || `g${++gSeq}` : "";
    if (isGroup && !members[0].groupId) gSeq = Math.max(gSeq, 1);
    const label = isGroup
      ? members[0].groupLabel || stripMetricNoise(members[0].name) || `指标组`
      : "";
    members.forEach((f, idx) => {
      const { _i, ...rest } = f;
      let groupEdge = "";
      if (isGroup) {
        if (members.length === 1) groupEdge = "only";
        else if (idx === 0) groupEdge = "start";
        else if (idx === members.length - 1) groupEdge = "end";
        else groupEdge = "mid";
      }
      out.push({ ...rest, groupId: gid, groupLabel: label, groupEdge });
    });
  }
  return out;
}

/**
 * 数据验证工作台（embed=data-verify）
 */
export default function DataVerifyWorkbench({
  config,
  onOpenConfig,
  configSummary,
}) {
  const [material, setMaterial] = useState("");
  const [images, setImages] = useState([]);
  const [title, setTitle] = useState("数据验证");
  const [projectContext, setProjectContext] = useState(() => {
    try {
      const raw = sessionStorage.getItem("workbench_project_context");
      const value = raw ? JSON.parse(raw) : {};
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  });
  const [fields, setFields] = useState([]);
  const [phase, setPhase] = useState("idle"); // idle | draft | confirmed
  const [busy, setBusy] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [skill, setSkill] = useState("");
  const [sqlSkill, setSqlSkill] = useState("");
  const [defaultSkill, setDefaultSkill] = useState("");
  const [defaultSqlSkill, setDefaultSqlSkill] = useState("");
  const [records, setRecords] = useState([]);
  const [skillOpen, setSkillOpen] = useState(false);
  const [skillTab, setSkillTab] = useState("extract");
  const [sqlModal, setSqlModal] = useState(null); // field id
  const [sqlNote, setSqlNote] = useState("");
  const [sqlSchema, setSqlSchema] = useState("");
  const [sqlError, setSqlError] = useState("");
  const [sqlImages, setSqlImages] = useState([]);
  const [sqlBusy, setSqlBusy] = useState("");
  const [sqlResult, setSqlResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanStory, setScanStory] = useState(null);
  /** 0~3 进行中；4 全完成。由 SSE 推进，不靠定时器 */
  const [progressIdx, setProgressIdx] = useState(0);
  const [liveThought, setLiveThought] = useState("");
  const [scanAnimDone, setScanAnimDone] = useState(false);
  const [hadRealScan, setHadRealScan] = useState(false);
  const scopedRecords = useMemo(
    () =>
      projectContext.projectId
        ? records.filter((rec) => rec.projectId === projectContext.projectId)
        : records,
    [records, projectContext.projectId]
  );

  // 初始化：handoff + draft + state
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const handoffRaw = sessionStorage.getItem(HANDOFF_KEY);
        if (handoffRaw) {
          sessionStorage.removeItem(HANDOFF_KEY);
          const h = JSON.parse(handoffRaw);
          if (!cancelled) {
            if (h.projectId) {
              setProjectContext({
                projectId: String(h.projectId),
                projectName: String(h.projectName || ""),
                assetId: String(h.assetId || ""),
              });
            }
            if (h.material) setMaterial(decodeUrlsInText(String(h.material)));
            if (Array.isArray(h.images) && h.images.length) {
              setImages(
                h.images
                  .filter((x) => isValidImageDataUrl(x?.dataUrl))
                  .slice(0, 8)
                  .map((x, i) => ({
                    name: x.name || `handoff-${i}.jpg`,
                    dataUrl: x.dataUrl,
                  }))
              );
            }
          }
        } else {
          const draftRaw = localStorage.getItem(DRAFT_KEY);
          if (draftRaw) {
            const d = JSON.parse(draftRaw);
            if (!cancelled && d) {
              if (d.material) setMaterial(String(d.material));
              // 草稿里的图常被截断，只恢复仍合法的
              if (Array.isArray(d.images)) {
                setImages(
                  d.images
                    .filter((x) => isValidImageDataUrl(x?.dataUrl))
                    .slice(0, 4)
                );
              }
              if (Array.isArray(d.fields)) setFields(d.fields);
              if (d.title) setTitle(String(d.title));
              if (d.phase) setPhase(d.phase);
              if (d.projectContext) setProjectContext(d.projectContext);
            }
          }
        }
      } catch {
        /* ignore */
      }
      try {
        const st = await workbenchApi("/api/data-verify/state");
        if (cancelled) return;
        setSkill(st.skill || "");
        setSqlSkill(st.sqlSkill || "");
        setDefaultSkill(st.defaultSkill || "");
        setDefaultSqlSkill(st.defaultSqlSkill || "");
        setRecords(Array.isArray(st.records) ? st.records : []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 草稿
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        // 图片只保留较小的合法 dataUrl；绝不截断 base64（截断会触发火山 Invalid base64）
        const draftImages = images
          .filter((x) => isValidImageDataUrl(x?.dataUrl) && String(x.dataUrl).length < 400000)
          .slice(0, 2)
          .map((x) => ({ name: x.name, dataUrl: x.dataUrl }));
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            material,
            images: draftImages,
            fields,
            title,
            phase,
            projectContext,
          })
        );
      } catch {
        /* quota */
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [material, images, fields, title, phase, projectContext]);

  const patchField = useCallback((id, patch) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);

  const removeField = useCallback((id) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const addField = useCallback(() => {
    setFields((prev) => [...prev, emptyField({ name: `字段${prev.length + 1}` })]);
    if (phase === "idle") setPhase("draft");
  }, [phase]);

  const enrichedFields = useMemo(() => {
    const ordered = regroupFieldsForUi(fields);
    const pageMap = {};
    const dbMap = {};
    for (const f of ordered) {
      const pn = parseNum(f.pageValue);
      const dn = parseNum(f.dbValue);
      if (pn != null) pageMap[f.name] = f.format === "percent" && Math.abs(pn) > 1.5 ? pn / 100 : pn;
      if (dn != null) dbMap[f.name] = f.format === "percent" && Math.abs(dn) > 1.5 ? dn / 100 : dn;
    }
    return ordered.map((f) => {
      let computedDb = f.dbValue;
      if (f.formula && !String(f.dbValue || "").trim()) {
        const n = evalFormula(f.formula, dbMap);
        if (n != null) computedDb = formatDisplay(n, f.format);
      }
      const cmp = compareValues(f.pageValue, computedDb || f.dbValue, f.format);
      return { ...f, computedDb, cmp };
    });
  }, [fields]);

  const onPasteImages = useCallback((fileList, target = "main") => {
    const files = [...fileList].filter(Boolean).slice(0, 6);
    files.forEach(async (file) => {
      const item = await compressImageFile(file);
      if (!item || !isValidImageDataUrl(item.dataUrl)) return;
      if (target === "sql") {
        setSqlImages((prev) => [...prev, item].slice(0, 4));
      } else {
        setImages((prev) => [...prev, item].slice(0, 6));
      }
    });
  }, []);

  const clearWorkspace = useCallback(() => {
    if (!window.confirm("清空当前输入、字段与草稿？（不影响已保存列表）")) return;
    setMaterial("");
    setImages([]);
    setFields([]);
    setTitle("数据验证");
    setPhase("idle");
    setStatusMsg("");
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const runExtract = useCallback(async () => {
    if (!material.trim() && images.length === 0) {
      window.alert("请先填写原型链接/说明，或 Ctrl+V 粘贴截图");
      return;
    }
    if (!config?.apiKey && config?.provider !== "cursor") {
      window.alert("未配置模型，请先点「模型」填写");
      onOpenConfig?.();
      return;
    }
    if (config?.provider === "cursor" && !config?.apiKey && !config?.visionModel) {
      window.alert(
        "请在「模型」下方填写「识图用 OpenAI 兼容」的 URL / Key / ep- 模型"
      );
      onOpenConfig?.();
      return;
    }

    setBusy("正在读取原型并提取字段…");
    setScanning(true);
    setScanStory(null);
    setScanAnimDone(false);
    setHadRealScan(false);
    setProgressIdx(0);
    setLiveThought("准备中…");
    setStatusMsg("");

    let gotResult = false;
    let lastError = "";
    const bumpProgress = (idx) => {
      setProgressIdx((prev) => Math.max(prev, idx));
    };

    try {
      await consumeSse(
        apiUrl("/api/data-verify/extract"),
        {
          material,
          config,
          skill,
          // 有链接时少传图，避免体积打挂请求
          images: (/https?:\/\//i.test(material) ? images.slice(0, 1) : images.slice(0, 3))
            .filter((x) => isValidImageDataUrl(x?.dataUrl))
            .map((x) => ({ dataUrl: x.dataUrl })),
        },
        (evt) => {
          if (evt.type === "thought" && evt.text) {
            setLiveThought((p) => (p + evt.text).slice(-400));
          }
          if (evt.type === "step" && evt.label) {
            const label = String(evt.label);
            setBusy(label);
            if (/准备|打开/i.test(label)) bumpProgress(0);
            else if (/抓取|渲染|原型/i.test(label)) bumpProgress(1);
            else if (/模型|提取|识别/i.test(label)) bumpProgress(2);
          }
          if (evt.type === "dv_scan_story") {
            const shot = evt.screenshotUrl
              ? apiUrl(evt.screenshotUrl)
              : "";
            const regions = Array.isArray(evt.regions) ? evt.regions : [];
            if (shot || regions.length) {
              setHadRealScan(true);
              setScanStory({
                screenshot: shot,
                regions,
                viewport: evt.viewport || { w: 1440, h: 900 },
              });
              bumpProgress(1);
            }
          }
          if (evt.type === "result" && evt.ok) {
            gotResult = true;
            bumpProgress(4);
            const next = regroupFieldsForUi(
              (evt.fields || []).map((f, i) =>
                emptyField({
                  name: f.name || `字段${i + 1}`,
                  source: f.source || "数据库统计",
                  formula: f.formula || "",
                  pageValue: f.pageValue || "",
                  dbValue: f.dbValue || "",
                  format: f.format || "number",
                  dependsOn: f.dependsOn || [],
                  note: f.note || "",
                  sql: f.sql || "",
                  page: f.page || "",
                  kind: f.kind || "",
                  groupId: f.groupId || "",
                  groupLabel: f.groupLabel || "",
                  groupEdge: f.groupEdge || "",
                  selected: true,
                })
              )
            );
            setFields(next);
            setTitle(evt.title || "数据验证");
            setPhase("draft");
            setStatusMsg(
              `已提取 ${next.length} 个字段，请核对后点「确定」` +
                (evt.fetchMeta?.hasContext ? "（已抓取原型）" : "") +
                (evt.fetchMeta?.visionFallback ? "（截图已降级）" : "")
            );
          }
          if (evt.type === "error") {
            lastError = String(evt.message || "提取失败");
          }
        }
      );

      if (!gotResult) {
        window.alert(friendlyLlmError(lastError || "未收到提取结果，请重试"));
      }
    } catch (e) {
      window.alert(
        friendlyLlmError(e.message || e) +
          "\n请确认已重启 start.bat，且 5180 正常"
      );
    } finally {
      setBusy("");
      setScanning(false);
      setScanStory(null);
      setLiveThought("");
      setHadRealScan(false);
      setScanAnimDone(false);
    }
  }, [material, images, config, skill, onOpenConfig]);

  const onScanDone = useCallback(() => {
    setScanAnimDone(true);
  }, []);

  const showScanPlayer = !!(
    scanStory &&
    (scanStory.screenshot || scanStory.regions?.length)
  );

  const confirmFields = useCallback(() => {
    const kept = fields.filter((f) => f.selected !== false && f.name.trim());
    if (!kept.length) {
      window.alert("请至少保留一个字段");
      return;
    }
    setFields(kept.map((f) => ({ ...f, selected: true })));
    setPhase("confirmed");
    setStatusMsg(`已确认 ${kept.length} 个字段，可继续改值 / 生成 SQL / 导出`);
  }, [fields]);

  const saveSkill = useCallback(async () => {
    try {
      const r = await workbenchApi("/api/data-verify/skill", {
        method: "PUT",
        body: JSON.stringify({ skill, sqlSkill }),
      });
      if (r.ok) setStatusMsg("Skill 已保存");
      else window.alert(r.error || "保存失败");
    } catch {
      window.alert("保存 Skill 失败");
    }
  }, [skill, sqlSkill]);

  const saveRecord = useCallback(async () => {
    if (!fields.length) {
      window.alert("没有可保存的字段");
      return;
    }
    try {
      const r = await workbenchApi("/api/data-verify/records", {
        method: "POST",
        body: JSON.stringify({
          title,
          projectId: projectContext.projectId || "",
          projectName: projectContext.projectName || "",
          assetId: projectContext.assetId || "",
          material,
          fields,
          confirmed: phase === "confirmed",
        }),
      });
      if (!r.ok) {
        window.alert(r.error || "保存失败");
        return;
      }
      setRecords(r.records || []);
      setStatusMsg("已保存到列表");
    } catch {
      window.alert("保存失败，请确认工作台服务已启动");
    }
  }, [title, projectContext, material, fields, phase]);

  const loadRecord = useCallback((rec) => {
    if (!rec) return;
    if (rec.projectId) {
      setProjectContext({
        projectId: rec.projectId,
        projectName: rec.projectName || "",
        assetId: rec.assetId || "",
      });
    }
    setTitle(String(rec.title || "数据验证").replace(/\s*·\s*\d{4}-\d{2}-\d{2}.*/, "") || "数据验证");
    setMaterial(String(rec.material || ""));
    setFields(
      (rec.fields || []).map((f) =>
        emptyField({
          ...f,
          id: f.id || uid(),
          selected: true,
        })
      )
    );
    setPhase(rec.confirmed ? "confirmed" : "draft");
    setStatusMsg(`已加载：${rec.title}`);
  }, []);

  const deleteRecord = useCallback(async (id) => {
    if (!window.confirm("删除该条记录？")) return;
    try {
      const r = await workbenchApi(`/api/data-verify/records/${id}`, {
        method: "DELETE",
      });
      if (r.ok) setRecords(r.records || []);
    } catch {
      window.alert("删除失败");
    }
  }, []);

  const exportExcel = useCallback(async () => {
    if (!fields.length) {
      window.alert("没有可导出的字段");
      return;
    }
    setBusy("正在导出 Excel…");
    try {
      const filename = `${(title || "数据验证").slice(0, 40)}_${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`;
      const res = await fetch("/api/data-verify/export-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          fields: regroupFieldsForUi(fields),
          filename,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        window.alert(j.error || `导出失败 HTTP ${res.status}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setStatusMsg("Excel 已下载（含真公式）");
    } catch (e) {
      window.alert(`导出失败：${e.message || e}`);
    } finally {
      setBusy("");
    }
  }, [fields, title]);

  const openSqlModal = useCallback((field) => {
    setSqlModal(field.id);
    setSqlNote("");
    setSqlSchema("");
    setSqlError("");
    setSqlImages([]);
    setSqlResult(field.sql ? { sql: field.sql, explanation: "", assumptions: [] } : null);
  }, []);

  const activeSqlField = useMemo(
    () => fields.find((f) => f.id === sqlModal) || null,
    [fields, sqlModal]
  );

  const runSqlGen = useCallback(
    async (mode) => {
      if (!activeSqlField) return;
      if (!config?.apiKey) {
        window.alert("未配置模型");
        onOpenConfig?.();
        return;
      }
      setSqlBusy(mode === "fix" ? "正在修复 SQL…" : "正在生成 SQL…");
      try {
        const r = await fetch(apiUrl("/api/data-verify/sql"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            config,
            skill: sqlSkill,
            mode,
            fieldName: activeSqlField.name,
            source: activeSqlField.source,
            formula: activeSqlField.formula,
            pageValue: activeSqlField.pageValue,
            userNote: sqlNote,
            schemaText: sqlSchema,
            existingSql: activeSqlField.sql || sqlResult?.sql || "",
            errorText: sqlError,
            images: sqlImages.slice(0, 3).map((x) => ({ dataUrl: x.dataUrl })),
          }),
        });
        const j = await r.json();
        if (!j.ok) {
          window.alert(j.error || "SQL 生成失败");
          return;
        }
        setSqlResult(j);
      } catch (e) {
        window.alert(String(e.message || e));
      } finally {
        setSqlBusy("");
      }
    },
    [
      activeSqlField,
      config,
      onOpenConfig,
      sqlSkill,
      sqlNote,
      sqlSchema,
      sqlError,
      sqlImages,
      sqlResult,
    ]
  );

  const applySqlToField = useCallback(() => {
    if (!activeSqlField || !sqlResult?.sql) return;
    patchField(activeSqlField.id, {
      sql: sqlResult.sql,
      source: activeSqlField.source || "数据库统计",
    });
    setStatusMsg(`已写入 SQL → ${activeSqlField.name}`);
    setSqlModal(null);
  }, [activeSqlField, sqlResult, patchField]);

  const tryExecuteSql = useCallback(async () => {
    const sql = sqlResult?.sql || activeSqlField?.sql || "";
    if (!sql) {
      window.alert("没有可执行的 SQL");
      return;
    }
    try {
      const r = await workbenchApi("/api/data-verify/sql/execute", {
        method: "POST",
        body: JSON.stringify({ sql }),
      });
      window.alert(r.error || "直连执行尚未启用");
    } catch (e) {
      window.alert(String(e.message || e));
    }
  }, [sqlResult, activeSqlField]);

  const backToTestPoint = useCallback(() => {
    try {
      sessionStorage.setItem("workbench_embed", "standalone-qa");
    } catch {
      /* ignore */
    }
    const u = new URL(window.location.href);
    u.searchParams.set("embed", "standalone-qa");
    window.location.href = u.toString();
  }, []);

  const [mainTab, setMainTab] = useState("fields"); // fields | ai | optimized
  const [aiBusy, setAiBusy] = useState("");
  const [aiMsg, setAiMsg] = useState("");
  const [aiDefaults, setAiDefaults] = useState({
    l3User: "smoke_l3_24874175",
    l3Pass: "111111",
    sourceDb: "lx",
    platformLabel: "龙翔",
    baseUrl: "http://sw.example.com",
    sdkBusinessAccount: "龙翔一级商务",
    presidentAccount: "一级会长",
    promoteId: "",
    todayCount: 10,
    yesterdayCount: 20,
    expectedMomPercent: -50,
  });
  const [aiPromoteCtx, setAiPromoteCtx] = useState(null);
  const [aiDossier, setAiDossier] = useState(null);
  const [aiDbStats, setAiDbStats] = useState(null);
  const [aiCompareRows, setAiCompareRows] = useState(() =>
    loadPersistedAiCompareRows(projectContext?.projectId || "proj_xinshangwu")
  );
  const [aiSqlKey, setAiSqlKey] = useState("todayRegCount");
  const [aiIncludeSubChannels, setAiIncludeSubChannels] = useState(() => {
    try {
      return sessionStorage.getItem("dv_ai_include_sub::proj_xinshangwu") === "1";
    } catch {
      return false;
    }
  });
  const aiProjectId = projectContext?.projectId || "proj_xinshangwu";

  const setIncludeSubChannels = useCallback((on) => {
    const next = !!on;
    setAiIncludeSubChannels(next);
    try {
      sessionStorage.setItem(
        `dv_ai_include_sub::${projectContext?.projectId || "proj_xinshangwu"}`,
        next ? "1" : "0"
      );
    } catch {
      /* ignore */
    }
  }, [projectContext?.projectId]);

  const commitAiCompareRows = useCallback(
    (updater) => {
      setAiCompareRows((prev) => {
        const base =
          Array.isArray(prev) && prev.length
            ? prev
            : loadPersistedAiCompareRows(projectContext?.projectId || "proj_xinshangwu");
        const next = typeof updater === "function" ? updater(base) : updater;
        const rows = Array.isArray(next) ? next : base;
        persistAiCompareRows(projectContext?.projectId || "proj_xinshangwu", rows);
        return rows;
      });
    },
    [projectContext?.projectId]
  );

  const copyText = useCallback(async (text) => {
    const s = String(text || "");
    if (!s) return;
    try {
      await navigator.clipboard.writeText(s);
      setAiMsg("已复制到剪贴板，可粘贴到数据库客户端执行");
    } catch {
      window.prompt("复制以下 SQL：", s);
    }
  }, []);

  const loadAiState = useCallback(async () => {
    try {
      const qs = projectContext.projectId
        ? `?projectId=${encodeURIComponent(projectContext.projectId)}`
        : "";
      const st = await workbenchApi(`/api/ai-assist-verify/state${qs}`);
      if (st?.defaults) {
        setAiDefaults((prev) => ({
          ...prev,
          ...st.defaults,
          l3User: st.defaults.l3User || prev.l3User,
          l3Pass: st.defaults.l3Pass || prev.l3Pass,
        }));
      }
      setAiPromoteCtx(st?.promoteContext || null);
      if (st?.dossier) {
        setAiDossier(st.dossier);
        if (st.dossier.dbStats) {
          setAiDbStats({ ok: true, metrics: st.dossier.dbStats });
          commitAiCompareRows((prev) => {
            const base =
              prev.length > 0
                ? prev
                : loadPersistedAiCompareRows(projectContext.projectId || "proj_xinshangwu");
            return refreshAiExpectedOnly(base, st.dossier.dbStats);
          });
        }
      }
    } catch (e) {
      setAiMsg(`加载 AI 验证状态失败：${e.message || e}`);
    }
  }, [projectContext.projectId, commitAiCompareRows]);

  useEffect(() => {
    if (mainTab === "ai" || mainTab === "optimized") loadAiState();
  }, [mainTab, loadAiState]);

  const openBizFlow = useCallback(() => {
    try {
      if (window.parent && window.parent !== window && typeof window.parent.openTool === "function") {
        window.parent.openTool("biz-flow");
        return;
      }
    } catch {
      /* ignore */
    }
    window.alert("请在工作台左侧打开「渠道主流程」（biz-flow），跑到三级会长就绪后再造数。");
  }, []);

  const runAiSeed = useCallback(async () => {
    setAiBusy("正在一键造数（今10/昨20）…");
    setAiMsg("");
    try {
      const r = await workbenchApi("/api/ai-assist-verify/seed", {
        method: "POST",
        body: JSON.stringify({
          l3User: aiDefaults.l3User,
          l3Pass: aiDefaults.l3Pass,
          sourceDb: aiDefaults.sourceDb || "lx",
          promoteId: aiDefaults.promoteId || undefined,
          sdkBusinessAccount: aiDefaults.sdkBusinessAccount,
          projectId: projectContext.projectId || "proj_xinshangwu",
          projectName: projectContext.projectName || "新商务",
          todayCount: 10,
          yesterdayCount: 20,
        }),
      });
      if (r.dossier) setAiDossier(r.dossier);
      else if (r.run?.dossier) setAiDossier(r.run.dossier);
      if (r.dbStats) setAiDbStats(r.dbStats);
      if (!r.ok) {
        setAiMsg(r.error || "造数失败");
      } else {
        const m = r.dbStats?.metrics || r.run?.dbStats || {};
        const d = r.dossier || r.run?.dossier || {};
        setAiMsg(
          `造数完成 · 商户=${d.sdkBusinessAccount || "—"} · 会长=${d.presidentAccount || "—"}(p=${d.promoteId}) · 库今日=${m.todayReg ?? "?"} 昨日=${m.yesterdayReg ?? "?"}`
        );
      }
      await loadAiState();
    } catch (e) {
      setAiMsg(String(e.message || e));
    } finally {
      setAiBusy("");
    }
  }, [aiDefaults, projectContext, loadAiState]);

  const runAiDbStats = useCallback(async () => {
    setAiBusy("刷新库统计…");
    try {
      const r = await workbenchApi("/api/ai-assist-verify/db-stats", {
        method: "POST",
        body: JSON.stringify({
          sourceDb: aiDefaults.sourceDb || "lx",
          promoteId: aiDefaults.promoteId || aiDossier?.promoteId || undefined,
          sdkBusinessAccount: aiDefaults.sdkBusinessAccount,
          includeSubChannels: aiIncludeSubChannels,
        }),
      });
      setAiDbStats(r);
      if (r?.ok && r.metrics) {
        commitAiCompareRows((prev) => refreshAiExpectedOnly(prev, r.metrics));
      }
      setAiMsg(
        r.ok
          ? `库统计 · ${r.metricsScopeLabel || ""} · 今日=${r.metrics?.todayReg} 昨日=${r.metrics?.yesterdayReg} 环比=${r.metrics?.momPercent}%（仅刷新期望列）`
          : r.error || "库统计失败"
      );
    } catch (e) {
      setAiMsg(String(e.message || e));
    } finally {
      setAiBusy("");
    }
  }, [aiDefaults, aiDossier, aiIncludeSubChannels, commitAiCompareRows]);

  const runAiCompare = useCallback(async () => {
    setAiBusy("抓取工作台指标并比对…");
    try {
      const r = await workbenchApi("/api/ai-assist-verify/compare", {
        method: "POST",
        body: JSON.stringify({
          l3User: aiDefaults.l3User,
          l3Pass: aiDefaults.l3Pass,
          baseUrl: aiDefaults.baseUrl,
          sourceDb: aiDefaults.sourceDb || "lx",
          promoteId: aiDefaults.promoteId || aiDossier?.promoteId || undefined,
          sdkBusinessAccount: aiDefaults.sdkBusinessAccount,
          projectId: projectContext.projectId || "proj_xinshangwu",
          projectName: projectContext.projectName || "新商务",
          includeSubChannels: aiIncludeSubChannels,
        }),
      });
      commitAiCompareRows(
        buildAiCompareRows(
          r.dbStats?.metrics || r.run?.dbStats || {},
          r.run?.pageMetrics || r.scrape?.page?.metrics || {},
          Array.isArray(r.rows) ? r.rows : aiCompareRows
        )
      );
      if (r.dbStats) setAiDbStats(r.dbStats);
      setAiMsg(r.run?.note || (r.ok ? "对验通过" : r.error || "对验完成（见结果表）"));
      // 不再 loadAiState 重刷表，避免冲掉刚写入的比对结论
    } catch (e) {
      setAiMsg(String(e.message || e));
    } finally {
      setAiBusy("");
    }
  }, [aiDefaults, aiDossier, projectContext, commitAiCompareRows, aiCompareRows, aiIncludeSubChannels]);

  const setAiRowPageInput = useCallback(
    (key, value) => {
      commitAiCompareRows((rows) =>
        (rows.length ? rows : buildAiCompareRows({}, {})).map((r) =>
          r.key === key ? { ...r, pageInput: value, page: value } : r
        )
      );
    },
    [commitAiCompareRows]
  );

  const compareAiGroup = useCallback(
    async (groupId) => {
      setAiBusy(
        groupId === "login"
          ? "抓取并比对「活跃」组…"
          : groupId === "pay"
            ? "抓取并比对「充值」组…"
            : groupId === "monthPay"
              ? "抓取并比对「本月充值」组…"
              : groupId === "activeChannel"
                ? "抓取并比对「活跃渠道」组…"
                : groupId === "newChannel"
                  ? "抓取并比对「新增渠道」组…"
                  : "抓取并比对本组…"
      );
      try {
        // 先刷库期望
        const stats = await workbenchApi("/api/ai-assist-verify/db-stats", {
          method: "POST",
          body: JSON.stringify({
            sourceDb: aiDefaults.sourceDb || "lx",
            promoteId: aiDefaults.promoteId || aiDossier?.promoteId || undefined,
            sdkBusinessAccount: aiDefaults.sdkBusinessAccount,
            includeSubChannels: aiIncludeSubChannels,
          }),
        });
        if (stats?.ok) setAiDbStats(stats);

        const r = await workbenchApi("/api/ai-assist-verify/compare", {
          method: "POST",
          body: JSON.stringify({
            l3User: aiDefaults.l3User,
            l3Pass: aiDefaults.l3Pass,
            baseUrl: aiDefaults.baseUrl,
            sourceDb: aiDefaults.sourceDb || "lx",
            promoteId: aiDefaults.promoteId || aiDossier?.promoteId || undefined,
            sdkBusinessAccount: aiDefaults.sdkBusinessAccount,
            projectId: projectContext.projectId || "proj_xinshangwu",
            projectName: projectContext.projectName || "新商务",
            includeSubChannels: aiIncludeSubChannels,
          }),
        });

        const dbm = normalizeAiDbMetrics(
          stats?.metrics || r.dbStats?.metrics || r.run?.dbStats || {}
        );
        const pagem = r.run?.pageMetrics || r.scrape?.page?.metrics || {};

        commitAiCompareRows((prev) => applyAiGroupCompare(prev, groupId, dbm, pagem));

        const gRows = AI_COMPARE_METRICS.filter((m) => m.group === groupId);
        const main = gRows.find(
          (m) =>
            m.key === "todayReg" ||
            m.key === "todayLogin" ||
            m.key === "todayPay" ||
            m.key === "monthPay" ||
            m.key === "todayActiveChannels" ||
            m.key === "todayNewChannels"
        );
        const mom = gRows.find(
          (m) =>
            m.key === "momRatio" ||
            m.key === "loginMomRatio" ||
            m.key === "payMomRatio" ||
            m.key === "monthPayMomRatio" ||
            m.key === "activeChannelDelta" ||
            m.key === "newChannelDelta"
        );
        const mainExp = dbm[main?.key];
        const mainPage = pagem[main?.key];
        const momExp = dbm[mom?.key];
        const momPage = pagem[mom?.key];
        const momFmt = mom?.format === "percent" ? "percent" : "number";
        const mainOk = judgeAiCompareRow(mainExp, mainPage, "number") === "ok";
        const momOk = judgeAiCompareRow(momExp, momPage, momFmt) === "ok";
        let tip = "";
        if (groupId === "login" && Number(mainExp) === 10 && Number(mainPage) === 61) {
          tip =
            "口径/同步：库(会长29640)造活跃组后=10；页61/+190.5%像造数前缓存。请先执行定时任务「商务日汇总-今日」，必要时再跑「商务日汇总-昨日」，然后刷新工作台再抓。";
        } else if (groupId === "activeChannel" && Number(mainExp) === Number(mainPage) && Number(momExp) === 0 && Number(momPage) === 0) {
          tip =
            "活跃渠道组一致。若你期望环比≠0：同会长多笔仍只计1；需昨/今活跃渠道数不同（造数昨2今4→+100%）。";
        } else if (mainOk && momOk) {
          tip =
            groupId === "newChannel"
              ? "新增渠道组主值+环比一致（(今−昨)/昨；昨2今4应为+100%）"
              : groupId === "activeChannel"
              ? "活跃渠道组主值+环比一致（(今−昨)/昨；昨2今4应为+100%）"
              : groupId === "monthPay"
                ? "本月充值组主值+环比一致（汇总月累加；较上月同期）"
                : groupId === "pay"
                  ? "充值组主值+环比一致（仅更新本组，其它组记录已保留）"
                  : "本组主值+环比一致（仅更新本组，其它组记录已保留）";
        } else if (mainPage == null && momPage == null) {
          tip = "本组页值未抓到，可手填主值与环比后再点「本组比对」";
        } else {
          tip = `本组结果：主值${mainOk ? "一致" : "不一致"}，环比${momOk ? "一致" : "不一致"}（其它组未改）`;
          if (
            groupId === "pay" ||
            groupId === "monthPay" ||
            groupId === "activeChannel" ||
            groupId === "newChannel"
          ) {
            tip += "。对不上请确认日汇总/创建时间已同步后再抓";
          }
        }
        setAiMsg(tip);
      } catch (e) {
        setAiMsg(String(e.message || e));
      } finally {
        setAiBusy("");
      }
    },
    [aiDefaults, aiDossier, projectContext, commitAiCompareRows, aiIncludeSubChannels]
  );

  const ensureAiCompareRows = useCallback(() => {
    const db = aiDbStats?.metrics || aiDossier?.dbStats || {};
    commitAiCompareRows((prev) => {
      if (prev.length) return mergeAiCompareRowsWithDefs(prev, db);
      const stored = loadPersistedAiCompareRows(aiProjectId);
      if (stored.length) return mergeAiCompareRowsWithDefs(stored, db);
      return buildAiCompareRows(db);
    });
  }, [aiDbStats, aiDossier, aiProjectId, commitAiCompareRows]);

  const clearAiCompareRecords = useCallback(() => {
    clearPersistedAiCompareRows(aiProjectId);
    commitAiCompareRows(
      buildAiCompareRows(aiDbStats?.metrics || aiDossier?.dbStats || {})
    );
    setAiMsg("已清空本页比对记录（库期望仍可刷）");
  }, [aiProjectId, aiDbStats, aiDossier, commitAiCompareRows]);

  const onToggleIncludeSubChannels = useCallback(
    async (checked) => {
      setIncludeSubChannels(checked);
      setAiBusy(checked ? "按含下级口径刷新库期望…" : "按仅一级口径刷新库期望…");
      try {
        const r = await workbenchApi("/api/ai-assist-verify/db-stats", {
          method: "POST",
          body: JSON.stringify({
            sourceDb: aiDefaults.sourceDb || "lx",
            promoteId: aiDefaults.promoteId || aiDossier?.promoteId || undefined,
            sdkBusinessAccount: aiDefaults.sdkBusinessAccount,
            includeSubChannels: checked,
          }),
        });
        if (r?.ok) {
          setAiDbStats(r);
          if (r.metrics) {
            commitAiCompareRows((prev) => refreshAiExpectedOnly(prev, r.metrics));
          }
          setAiMsg(
            `已切换：${r.metricsScopeLabel || (checked ? "含下级" : "仅一级")} · 今日活跃期望=${r.metrics?.todayLogin ?? "—"}`
          );
        } else {
          setAiMsg(r?.error || "刷新库期望失败");
        }
      } catch (e) {
        setAiMsg(String(e.message || e));
      } finally {
        setAiBusy("");
      }
    },
    [aiDefaults, aiDossier, setIncludeSubChannels, commitAiCompareRows]
  );

  useEffect(() => {
    if (mainTab === "ai") ensureAiCompareRows();
  }, [mainTab, ensureAiCompareRows]);

  const runAiSeedLogin = useCallback(async () => {
    setAiBusy("造活跃组（今10/昨20）…");
    try {
      const r = await workbenchApi("/api/ai-assist-verify/seed-login", {
        method: "POST",
        body: JSON.stringify({
          sourceDb: aiDefaults.sourceDb || "lx",
          promoteId: aiDefaults.promoteId || aiDossier?.promoteId || undefined,
          sdkBusinessAccount: aiDefaults.sdkBusinessAccount,
          todayCount: 10,
          yesterdayCount: 20,
        }),
      });
      if (r?.dbStats) {
        setAiDbStats(r.dbStats);
        if (r.dbStats.metrics) {
          commitAiCompareRows((prev) =>
            applyAiGroupCompare(prev, "login", r.dbStats.metrics, {})
          );
        }
      }
      setAiMsg(
        r?.ok
          ? `活跃组造数完成：今${r.todayCount}/昨${r.yesterdayCount}；库活跃=${r.dbStats?.metrics?.todayLogin}/${r.dbStats?.metrics?.yesterdayLogin} 环比=${r.dbStats?.metrics?.loginMomPercent}%（页若仍61请刷新工作台）`
          : r?.error || "活跃组造数失败"
      );
    } catch (e) {
      setAiMsg(String(e.message || e));
    } finally {
      setAiBusy("");
    }
  }, [aiDefaults, aiDossier, commitAiCompareRows]);

  const runAiSeedTop10Reg = useCallback(async () => {
    setAiBusy("造渠道注册 TOP10（约需几分钟）…");
    try {
      const r = await workbenchApi("/api/ai-assist-verify/seed-top10-reg", {
        method: "POST",
        body: JSON.stringify({ clear: true }),
      });
      const v = (r?.verify || []).slice(0, 3);
      setAiMsg(
        r?.ok
          ? `TOP10 注册造数完成：11 渠道；库抽样 ${v
              .map((x) => `${x.account}=今${x.dbToday}/昨${x.dbYday}/7d${x.db7}/30d${x.db30}`)
              .join(" · ") || "见结果文件"}。请刷新 L3「渠道注册 TOP10」切换时段查看`
          : r?.error || "TOP10 注册造数失败"
      );
    } catch (e) {
      setAiMsg(String(e.message || e));
    } finally {
      setAiBusy("");
    }
  }, []);

  const runAiSeedTop10Pay = useCallback(async () => {
    setAiBusy("造渠道充值 TOP10…");
    try {
      const r = await workbenchApi("/api/ai-assist-verify/seed-top10-pay", {
        method: "POST",
        body: JSON.stringify({ clear: true }),
      });
      const v = (r?.verify || []).slice(0, 3);
      setAiMsg(
        r?.ok
          ? `TOP10 充值造数完成：每玩家 10万→5千；抽样 ${v
              .map((x) => `${x.account}=今${x.dbToday}/昨${x.dbYday}`)
              .join(" · ") || "见结果"}。请刷新 L3「渠道充值 TOP10」切换时段`
          : r?.error || "TOP10 充值造数失败"
      );
    } catch (e) {
      setAiMsg(String(e.message || e));
    } finally {
      setAiBusy("");
    }
  }, []);

  const runAiSeedNewChannels = useCallback(async () => {
    setAiBusy("造渠道环比（昨2今4）…");
    try {
      const r = await workbenchApi("/api/ai-assist-verify/seed-channel-mom", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const after = r?.after || {};
      if (r?.dbStats) {
        setAiDbStats(r.dbStats);
      }
      if (after.todayNewChannels != null || r?.dbStats?.metrics) {
        const metrics = r?.dbStats?.metrics || {
          todayNewChannels: after.todayNewChannels,
          yesterdayNewChannels: after.yesterdayNewChannels,
          newChannelDelta: after.newChannelMomRatio,
          todayActiveChannels: after.todayActiveChannels,
          yesterdayActiveChannels: after.yesterdayActiveChannels,
          activeChannelDelta: after.activeChannelMomRatio,
        };
        commitAiCompareRows((prev) => {
          const mid = applyAiGroupCompare(prev, "newChannel", metrics, {});
          return applyAiGroupCompare(mid, "activeChannel", metrics, {});
        });
      }
      const exp = r?.expectPage || {};
      setAiMsg(
        r?.ok
          ? `渠道环比造数完成：活跃今${after.todayActiveChannels}/昨${after.yesterdayActiveChannels} 期望环比 ${exp["活跃环比昨日"] || ""}；新增今${after.todayNewChannels}/昨${after.yesterdayNewChannels} 期望环比 ${exp["新增环比昨日"] || ""}。请刷新 L3 工作台：副文案应是 +100.0%，若出现 +2 则仍是差值。`
          : r?.error || "渠道环比造数失败"
      );
    } catch (e) {
      setAiMsg(String(e.message || e));
    } finally {
      setAiBusy("");
    }
  }, [commitAiCompareRows]);

  const runAiSeedLastMonthPay = useCallback(async () => {
    setAiBusy("造上月充值一笔…");
    try {
      const r = await workbenchApi("/api/ai-assist-verify/seed-last-month-pay", {
        method: "POST",
        body: JSON.stringify({
          sourceDb: aiDefaults.sourceDb || "lx",
          promoteId: aiDefaults.promoteId || aiDossier?.promoteId || undefined,
          sdkBusinessAccount: aiDefaults.sdkBusinessAccount,
          amount: 2370,
        }),
      });
      if (r?.dbStats) {
        setAiDbStats(r.dbStats);
        if (r.dbStats.metrics) {
          commitAiCompareRows((prev) =>
            applyAiGroupCompare(prev, "monthPay", r.dbStats.metrics, {})
          );
        }
      }
      setAiMsg(
        r?.ok
          ? `上月充值造数完成：${r.statDate} ¥${r.amount}；库上月=${r.dbStats?.metrics?.lastMonthPay} 较上月同期=${r.dbStats?.metrics?.monthPayMomPercent}%（请刷新 L3 工作台后再「本组比对」）`
          : r?.error || "上月充值造数失败"
      );
    } catch (e) {
      setAiMsg(String(e.message || e));
    } finally {
      setAiBusy("");
    }
  }, [aiDefaults, aiDossier, commitAiCompareRows]);

  const ensureAiContext = useCallback(async () => {
    setAiBusy("补齐 L3 上下文…");
    try {
      const r = await workbenchApi("/api/ai-assist-verify/ensure-context", {
        method: "POST",
        body: JSON.stringify({
          sourceDb: aiDefaults.sourceDb || "lx",
          sdkBusinessAccount: aiDefaults.sdkBusinessAccount,
        }),
      });
      setAiPromoteCtx(r);
      if (r.promoteId) {
        setAiDefaults((prev) => ({ ...prev, promoteId: String(r.promoteId) }));
      }
      setAiMsg(r.hint || (r.ok ? "上下文已就绪" : r.error || "上下文不完整"));
    } catch (e) {
      setAiMsg(String(e.message || e));
    } finally {
      setAiBusy("");
    }
  }, [aiDefaults]);

  const cmpLabel = (status) => {
    if (status === "ok") return "一致";
    if (status === "mismatch") return "不一致";
    if (status === "page_missing") return "页面未抓到";
    if (status === "db_only") return "仅库侧";
    if (status === "pending") return "待验";
    return "待验";
  };

  const sqlBlocks = [
    { key: "todayRegCount", title: "今日渠道玩家注册数量" },
    { key: "yesterdayRegCount", title: "昨日渠道玩家注册数量" },
    { key: "momHint", title: "环比昨日（库侧计算）" },
    { key: "todayLogin", title: "今日渠道活跃玩家" },
    { key: "yesterdayLogin", title: "昨日渠道活跃玩家" },
    { key: "loginMomHint", title: "环比昨日（活跃·库侧）" },
    { key: "todayPay", title: "今日渠道玩家充值金额" },
    { key: "yesterdayPay", title: "昨日渠道玩家充值金额" },
    { key: "payMomHint", title: "环比昨日（充值·库侧）" },
    { key: "monthPay", title: "本月充值金额" },
    { key: "lastMonthPay", title: "上月充值金额" },
    { key: "monthPayMomHint", title: "环比上月（较上月同期·库侧）" },
    { key: "todayActiveChannels", title: "今日活跃渠道数" },
    { key: "yesterdayActiveChannels", title: "昨日活跃渠道数" },
    { key: "activeChannelDeltaHint", title: "环比昨日（活跃渠道）" },
    { key: "todayNewChannels", title: "今日新增渠道数" },
    { key: "yesterdayNewChannels", title: "昨日新增渠道数" },
    { key: "newChannelDeltaHint", title: "环比昨日（新增渠道）" },
    { key: "topTodayReg", title: "渠道注册 TOP（今日）" },
    { key: "topYesterdayReg", title: "渠道注册 TOP（昨日）" },
    { key: "topTodayPay", title: "渠道充值 TOP（今日）" },
    { key: "topChannels", title: "TOP 渠道清单" },
    { key: "subPlayers", title: "下级 L2/L3 玩家" },
    { key: "todayPlayers", title: "今日玩家明细（一级会长）" },
    { key: "yesterdayPlayers", title: "昨日玩家明细（一级会长）" },
    { key: "todayByAccounts", title: "按造数账号核对（今日）" },
    { key: "yesterdayByAccounts", title: "按造数账号核对（昨日）" },
    { key: "sdkBusiness", title: "商户 / 会长挂靠" },
  ];
  const activeSql = aiDossier?.verifySqls?.[aiSqlKey] || "";
  const full = aiDossier?.fullStrategy || null;
  const top10 = Array.isArray(full?.top10) ? full.top10 : [];
  const subPlayers = Array.isArray(full?.subordinates?.players) ? full.subordinates.players : [];
  const newActive = full?.newAndActive || {};

  return (
    <div className="dv-shell">
      <aside className="dv-side">
        <div className="dv-side-head">
          <h3>
            {mainTab === "ai" || mainTab === "optimized" ? "造数清单" : "历史记录"}
          </h3>
          <button type="button" className="btn btn-small" onClick={backToTestPoint}>
            ← 测试点
          </button>
        </div>
        {mainTab === "ai" || mainTab === "optimized" ? (
          <div className="dv-ai-dossier">
            {!aiDossier?.ok && !(aiDossier?.todayAccounts || []).length && !full ? (
              <p className="dv-empty">
                {mainTab === "optimized"
                  ? "优化版：在右侧完成造数/加载全量后，清单会出现在这里。"
                  : "尚无造数。点「一键造数」或先跑全量策略后这里会列出清单。"}
              </p>
            ) : (
              <>
                <div className="dv-ai-dossier-block">
                  <div className="dv-ai-dossier-label">游戏商户</div>
                  <div className="dv-ai-dossier-value">
                    {aiDossier?.sdkBusinessAccount || aiDefaults.sdkBusinessAccount || "龙翔一级商务"}
                  </div>
                </div>
                <div className="dv-ai-dossier-block">
                  <div className="dv-ai-dossier-label">会长（渠道）</div>
                  <div className="dv-ai-dossier-value">
                    {aiDossier?.presidentAccount || aiDefaults.presidentAccount || "—"}
                    {aiDossier?.promoteId ? (
                      <span className="hint"> · promote_id={aiDossier.promoteId}</span>
                    ) : null}
                  </div>
                </div>
                <div className="dv-ai-dossier-block">
                  <div className="dv-ai-dossier-label">
                    今日注册玩家（{aiDossier?.todayAccounts?.length || 0}）
                  </div>
                  <ul className="dv-ai-acc-list">
                    {(aiDossier?.todayAccounts || []).length ? (
                      (aiDossier.todayAccounts || []).map((a) => (
                        <li key={`t-${a}`}>
                          <button type="button" className="dv-ai-acc" onClick={() => copyText(a)}>
                            {a}
                          </button>
                        </li>
                      ))
                    ) : (
                      <li className="hint">暂无</li>
                    )}
                  </ul>
                </div>
                <div className="dv-ai-dossier-block">
                  <div className="dv-ai-dossier-label">
                    昨日注册玩家（{aiDossier?.yesterdayAccounts?.length || 0}）
                  </div>
                  <ul className="dv-ai-acc-list">
                    {(aiDossier?.yesterdayAccounts || []).length ? (
                      (aiDossier.yesterdayAccounts || []).map((a) => (
                        <li key={`y-${a}`}>
                          <button type="button" className="dv-ai-acc" onClick={() => copyText(a)}>
                            {a}
                          </button>
                        </li>
                      ))
                    ) : (
                      <li className="hint">暂无</li>
                    )}
                  </ul>
                </div>

                {full?.login ? (
                  <div className="dv-ai-dossier-block">
                    <div className="dv-ai-dossier-label">
                      登录造数 · 今{full.login.today ?? "—"} / 昨{full.login.yesterday ?? "—"}
                    </div>
                    <div className="hint">今日登录账号（点复制）</div>
                    <ul className="dv-ai-acc-list">
                      {(full.login.todayAccounts || []).slice(0, 12).map((a) => (
                        <li key={`lt-${a}`}>
                          <button type="button" className="dv-ai-acc" onClick={() => copyText(a)}>
                            {a}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {full?.pay ? (
                  <div className="dv-ai-dossier-block">
                    <div className="dv-ai-dossier-label">充值造数</div>
                    <div className="dv-ai-dossier-value hint">
                      今日成功 {(full.pay.todayAccounts || []).length} 笔 · 昨日成功{" "}
                      {(full.pay.yesterdayAccounts || []).length} 笔
                      {full.pay.month?.account
                        ? ` · 本月/上月样例账号 ${full.pay.month.account}`
                        : ""}
                    </div>
                    <ul className="dv-ai-acc-list">
                      {(full.pay.todayAccounts || []).slice(0, 8).map((a) => (
                        <li key={`pt-${a}`}>
                          <button type="button" className="dv-ai-acc" onClick={() => copyText(a)}>
                            今充 {a}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {(newActive.today || newActive.yesterday) && (
                  <div className="dv-ai-dossier-block">
                    <div className="dv-ai-dossier-label">新增 / 活跃渠道</div>
                    <ul className="dv-ai-acc-list">
                      {newActive.today?.channelAccount ? (
                        <li>
                          <button
                            type="button"
                            className="dv-ai-acc"
                            onClick={() => copyText(newActive.today.channelAccount)}
                          >
                            今日新增 {newActive.today.channelAccount}
                            {newActive.today.promoteId ? `(${newActive.today.promoteId})` : ""}
                          </button>
                        </li>
                      ) : null}
                      {newActive.yesterday?.channelAccount ? (
                        <li>
                          <button
                            type="button"
                            className="dv-ai-acc"
                            onClick={() => copyText(newActive.yesterday.channelAccount)}
                          >
                            昨日新增 {newActive.yesterday.channelAccount}
                            {newActive.yesterday.promoteId
                              ? `(${newActive.yesterday.promoteId})`
                              : ""}
                          </button>
                        </li>
                      ) : null}
                    </ul>
                  </div>
                )}

                {top10.length ? (
                  <div className="dv-ai-dossier-block">
                    <div className="dv-ai-dossier-label">TOP 渠道（{top10.length}）</div>
                    <ul className="dv-ai-acc-list dv-ai-acc-list-tall">
                      {top10.map((ch) => (
                        <li key={`top-${ch.promoteId || ch.account}`}>
                          <button
                            type="button"
                            className="dv-ai-acc"
                            onClick={() => copyText(String(ch.account || ""))}
                            title={`今注册${ch.todayReg} 昨注册${ch.yesterdayReg} 今充${ch.todayPay}`}
                          >
                            #{ch.rankHint} {ch.account}
                            <span className="hint">
                              {" "}
                              p={ch.promoteId} · 今注{ch.todayReg ?? "—"} · 昨注
                              {ch.yesterdayReg ?? "—"}
                              {ch.lastLoginDaysAgo != null
                                ? ` · 未登${ch.lastLoginDaysAgo}天`
                                : ""}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {subPlayers.length || full?.subordinates?.l2 ? (
                  <div className="dv-ai-dossier-block">
                    <div className="dv-ai-dossier-label">包含下级</div>
                    <div className="hint">
                      L2={full?.subordinates?.l2?.account || "—"}(
                      {full?.subordinates?.l2?.promoteId || "—"}) · L3=
                      {full?.subordinates?.l3?.account || "—"}(
                      {full?.subordinates?.l3?.promoteId || "—"})
                    </div>
                    <ul className="dv-ai-acc-list">
                      {subPlayers.map((p) => (
                        <li key={`sub-${p.account}`}>
                          <button
                            type="button"
                            className="dv-ai-acc"
                            onClick={() => copyText(String(p.account || ""))}
                          >
                            {p.tier} 玩家 {p.account}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {full?.subordinates?.hint ? (
                      <p className="hint">{full.subordinates.hint}</p>
                    ) : null}
                  </div>
                ) : null}

                <p className="hint dv-ai-dossier-tip">
                  库：{aiDossier?.database || "game_lx"} · 点账号可复制 · 右侧复制 SQL 查验
                  {full?.resultFile ? ` · ${full.resultFile}` : ""}
                </p>
              </>
            )}
          </div>
        ) : (
          <ul className="dv-records">
            {scopedRecords.length === 0 ? (
              <li className="dv-empty">暂无保存记录</li>
            ) : (
              scopedRecords.map((rec) => (
                <li key={rec.id} className="dv-record">
                  <button type="button" className="dv-record-main" onClick={() => loadRecord(rec)}>
                    <span className="dv-record-title">{rec.title}</span>
                    <span className="dv-record-meta">
                      {rec.projectName ? `${rec.projectName} · ` : ""}
                      {(rec.fields || []).length} 字段
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-small dv-record-del"
                    onClick={() => deleteRecord(rec.id)}
                  >
                    删
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </aside>

      <main className="dv-main">
        <div className="dv-tabs">
          <button
            type="button"
            className={"dv-tab" + (mainTab === "fields" ? " is-active" : "")}
            onClick={() => setMainTab("fields")}
          >
            字段对账
          </button>
          <button
            type="button"
            className={"dv-tab" + (mainTab === "ai" ? " is-active" : "")}
            onClick={() => setMainTab("ai")}
          >
            AI辅助验证
          </button>
          <button
            type="button"
            className={"dv-tab" + (mainTab === "optimized" ? " is-active" : "")}
            onClick={() => setMainTab("optimized")}
          >
            数据验证-优化版
          </button>
        </div>

        {mainTab === "optimized" ? (
          <DataVerifyOptimized
            projectContext={projectContext}
            onOpenBizFlow={openBizFlow}
            onRefreshParent={loadAiState}
          />
        ) : mainTab === "ai" ? (
          <div className="dv-ai-panel">
            <header className="dv-ai-head">
              <div>
                <h3>AI辅助验证 · 工作台指标对验</h3>
                <p className="hint">
                  绑定项目：
                  {projectContext.projectName || projectContext.projectId || "新商务（proj_xinshangwu）"}
                  {" · "}当前指标：今日渠道玩家注册 + 环比昨日
                </p>
              </div>
            </header>

            <div className="dv-ai-form">
              <label>
                三级商务账号（看页面）
                <input
                  value={aiDefaults.l3User}
                  onChange={(e) => setAiDefaults((p) => ({ ...p, l3User: e.target.value }))}
                />
              </label>
              <label>
                密码
                <input
                  type="password"
                  value={aiDefaults.l3Pass}
                  onChange={(e) => setAiDefaults((p) => ({ ...p, l3Pass: e.target.value }))}
                />
              </label>
              <label>
                平台
                <input value={aiDefaults.platformLabel || "龙翔"} readOnly />
              </label>
              <label>
                promoteId
                <input
                  value={aiDefaults.promoteId || ""}
                  onChange={(e) => setAiDefaults((p) => ({ ...p, promoteId: e.target.value }))}
                  placeholder="一级会长渠道 id"
                />
              </label>
            </div>

            <div className="dv-ai-actions">
              <button type="button" className="btn btn-primary" disabled={!!aiBusy} onClick={runAiSeed}>
                一键造数（今10/昨20）
              </button>
              <button type="button" className="btn" disabled={!!aiBusy} onClick={runAiDbStats}>
                刷新库统计
              </button>
              <button type="button" className="btn" disabled={!!aiBusy} onClick={ensureAiContext}>
                补齐 L3 上下文
              </button>
              <button type="button" className="btn" onClick={openBizFlow}>
                打开渠道主流程
              </button>
            </div>

            {aiBusy ? <p className="dv-status">{aiBusy}</p> : null}
            {aiMsg ? <p className="dv-status">{aiMsg}</p> : null}

            <div className="dv-ai-metrics">
              <span>
                期望口径：
                <b>
                  {aiDbStats?.metricsScopeLabel ||
                    (aiIncludeSubChannels
                      ? "商户旗下汇总（含 L2/L3）"
                      : "商户旗下一级汇总（不含下级）")}
                </b>
              </span>
              <span>
                库今日注册：<b>{aiDbStats?.metrics?.todayReg ?? aiDossier?.dbStats?.todayReg ?? "—"}</b>
              </span>
              <span>
                库昨日注册：
                <b>{aiDbStats?.metrics?.yesterdayReg ?? aiDossier?.dbStats?.yesterdayReg ?? "—"}</b>
              </span>
              <span>
                库环比：
                <b>
                  {(aiDbStats?.metrics?.momPercent ?? aiDossier?.dbStats?.momPercent) != null
                    ? `${aiDbStats?.metrics?.momPercent ?? aiDossier?.dbStats?.momPercent}%`
                    : "—"}
                </b>
              </span>
              <span className="hint">造数仍挂一级会长；卡片比对用全商户汇总</span>
            </div>

            <section className="dv-ai-sql-section">
              <div className="dv-ai-sql-head">
                <h4>数据库查验 SQL（复制后直接执行）</h4>
                <button
                  type="button"
                  className="btn btn-small btn-primary"
                  disabled={!activeSql}
                  onClick={() => copyText(activeSql)}
                >
                  复制当前 SQL
                </button>
              </div>
              <div className="dv-ai-sql-tabs">
                {sqlBlocks.map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    className={"dv-ai-sql-tab" + (aiSqlKey === b.key ? " is-active" : "")}
                    onClick={() => setAiSqlKey(b.key)}
                  >
                    {b.title}
                  </button>
                ))}
              </div>
              <pre className="dv-ai-sql-body">{activeSql || "先造数或加载造数清单后显示 SQL"}</pre>
              <ol className="dv-ai-howto hint">
                {(aiDossier?.howToCheck || [
                  "左侧看商户/会长/玩家账号",
                  "复制「今日渠道玩家注册数量」SQL 到库客户端执行",
                ]).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
            </section>

            <section className="dv-ai-compare-section">
              <div className="dv-ai-sql-head">
                <h4>指标比对（按工作台卡片分组）</h4>
                <div className="dv-ai-compare-actions">
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={!!aiBusy}
                    onClick={runAiSeedLogin}
                  >
                    造活跃组（今10/昨20）
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={!!aiBusy}
                    onClick={runAiSeedNewChannels}
                  >
                    造渠道环比（昨2今4/+100%）
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={!!aiBusy}
                    onClick={runAiSeedTop10Reg}
                    title="造 11 个 wb_top_* 渠道；TOP1~10 注册：今日10→1、昨日20→11、近7天30→21、近30天40→31"
                  >
                    造渠道注册 TOP10
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={!!aiBusy}
                    onClick={runAiSeedTop10Pay}
                    title="对 wb_top 玩家充值：每玩家 10万→5千；pay_time 覆盖今日/昨日/近7天/近30天"
                  >
                    造渠道充值 TOP10
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={!!aiBusy}
                    onClick={runAiSeedLastMonthPay}
                  >
                    造上月充值一笔（¥2370）
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={!!aiBusy}
                    onClick={clearAiCompareRecords}
                    title="清空 session 中保存的比对结论"
                  >
                    清空比对记录
                  </button>
                  <label
                    className="dv-ai-include-sub"
                    title="勾选后库期望含 2/3 级下级渠道；不勾选仅统计一级（与 L3 页常见口径一致）"
                  >
                    <input
                      type="checkbox"
                      checked={aiIncludeSubChannels}
                      disabled={!!aiBusy}
                      onChange={(e) => onToggleIncludeSubChannels(e.target.checked)}
                    />
                    包含下级渠道数据
                  </label>
                  <button
                    type="button"
                    className="btn btn-small btn-primary"
                    disabled={!!aiBusy}
                    onClick={runAiCompare}
                  >
                    抓取工作台指标并填入页值
                  </button>
                </div>
              </div>
              <p className="hint" style={{ marginTop: 0 }}>
                同组三行=一张工作台卡。「本组比对」只更新该组。勾选「包含下级渠道数据」后库期望会计入 2/3
                级；不勾选仅一级（与页常见口径一致，活跃今时期望 94）。
              </p>
              <div className="dv-table-wrap">
                <table className="dv-table dv-ai-compare-table">
                  <thead>
                    <tr>
                      <th>指标名</th>
                      <th>期望（库）</th>
                      <th>页面显示</th>
                      <th>比对</th>
                      <th>操作</th>
                      <th>说明</th>
                    </tr>
                  </thead>
                  {groupAiCompareRows(
                    aiCompareRows.length
                      ? aiCompareRows
                      : buildAiCompareRows(aiDbStats?.metrics || aiDossier?.dbStats || {})
                  ).map((g) => (
                    <tbody key={g.id} className={"dv-ai-metric-group is-" + g.id}>
                      <tr className="dv-ai-group-head">
                        <td colSpan={6}>
                          <strong>{g.title}</strong>
                          {g.hint ? <span className="hint"> · {g.hint}</span> : null}
                        </td>
                      </tr>
                      {g.rows.map((row, idx) => (
                        <tr key={row.key || row.name}>
                          <td>
                            <button
                              type="button"
                              className="dv-ai-metric-link"
                              onClick={() => row.sqlKey && setAiSqlKey(row.sqlKey)}
                              title="查看对应 SQL"
                            >
                              {row.name}
                            </button>
                          </td>
                          <td>{fmtAiCompareVal(row.expected, row.format)}</td>
                          <td>
                            <input
                              className="dv-ai-page-input"
                              value={row.pageInput ?? (row.page == null ? "" : String(row.page))}
                              placeholder="手填或抓取"
                              onChange={(e) => setAiRowPageInput(row.key, e.target.value)}
                            />
                          </td>
                          <td>
                            <span className={"dv-cmp dv-cmp-" + (row.status || "pending")}>
                              {cmpLabel(row.status)}
                            </span>
                          </td>
                          {idx === 0 ? (
                            <td rowSpan={g.rows.length} className="dv-ai-group-action">
                              <button
                                type="button"
                                className="btn btn-small btn-primary"
                                disabled={!!aiBusy}
                                onClick={() => compareAiGroup(g.id)}
                              >
                                本组比对
                              </button>
                            </td>
                          ) : null}
                          <td className="hint">{row.note || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
            </section>
          </div>
        ) : (
          <>
        <header className="dv-top">
          <div className="dv-material">
            <div className="dv-material-head">
              <div>
                <h3>原型图 / 说明</h3>
                <span className="hint">URL / 文字；截图 Ctrl+V</span>
              </div>
              <div className="dv-top-actions">
                <button type="button" className="btn btn-small" disabled={!!busy} onClick={clearWorkspace}>
                  清空
                </button>
                <button type="button" className="btn btn-small" onClick={() => setSkillOpen(true)}>
                  Skill
                </button>
                <button type="button" className="btn btn-small" onClick={() => onOpenConfig?.()}>
                  模型
                </button>
              </div>
            </div>
            <textarea
              className="req-textarea dv-material-ta"
              rows={2}
              placeholder="粘贴 http(s) 原型链接，或说明文字…（截图直接粘贴即可）"
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              onPaste={(e) => {
                const files = [...(e.clipboardData?.items || [])]
                  .filter((it) => it.type.startsWith("image/"))
                  .map((it) => it.getAsFile())
                  .filter(Boolean);
                if (files.length) {
                  e.preventDefault();
                  onPasteImages(files, "main");
                  return;
                }
                const clip = e.clipboardData?.getData("text");
                if (!clip || !/%[0-9A-Fa-f]{2}/.test(clip)) return;
                e.preventDefault();
                const ta = e.currentTarget;
                const start = ta.selectionStart ?? material.length;
                const end = ta.selectionEnd ?? material.length;
                setMaterial(
                  material.slice(0, start) + decodeUrlsInText(clip) + material.slice(end)
                );
              }}
            />
            {images.length > 0 ? (
              <ul className="thumb-strip dv-thumbs">
                {images.map((item, idx) => (
                  <li key={item.name + idx} className="thumb-strip-item">
                    <img src={item.dataUrl} alt={item.name} />
                    <button
                      type="button"
                      className="thumb-remove"
                      onClick={() => setImages((prev) => prev.filter((_, j) => j !== idx))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </header>

        <div className="dv-toolbar">
          <input
            className="dv-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="页面标题"
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!!busy}
            onClick={runExtract}
          >
            {busy || "读取原型并提取字段"}
          </button>
          {phase === "draft" ? (
            <button type="button" className="btn" disabled={!!busy} onClick={confirmFields}>
              确定字段
            </button>
          ) : null}
          <button type="button" className="btn" disabled={!fields.length || !!busy} onClick={addField}>
            加一行
          </button>
          <button type="button" className="btn" disabled={!fields.length || !!busy} onClick={saveRecord}>
            保存到列表
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!fields.length || !!busy}
            onClick={exportExcel}
          >
            导出 Excel
          </button>
          <span className="dv-config-hint">{configSummary || ""}</span>
        </div>

        {statusMsg ? <p className="dv-status">{statusMsg}</p> : null}
        {scanning && liveThought ? (
          <p className="dv-status dv-live">{liveThought.slice(-180)}</p>
        ) : null}

        <div className={"dv-table-wrap" + (scanning ? " is-scanning" : "")}>
          {scanning ? (
            <div className="dv-scan-panel">
              {showScanPlayer ? (
                <FrameworkScanPlayer
                  screenshot={scanStory.screenshot}
                  regions={scanStory.regions}
                  viewport={scanStory.viewport}
                  onDone={onScanDone}
                />
              ) : (
                <div className="tp-scan-wait" aria-live="polite">
                  <div className="tp-scan-wait-orb" />
                  <p>{busy || "正在打开原型并抓取页面…"}</p>
                  <p className="hint">
                    {progressIdx < 2
                      ? "抓到页面截图后会在此播放扫描；若无截图则只显示下方真实进度"
                      : "页面已抓取，模型正在识别字段（此阶段可能较久）"}
                  </p>
                </div>
              )}
              <FrameworkScanFallback
                steps={DV_PROGRESS_STEPS}
                activeIndex={progressIdx}
              />
              {busy && progressIdx >= 2 ? (
                <p className="dv-scan-tail hint">
                  {hadRealScan && scanAnimDone
                    ? "扫描预览已播完，模型仍在提取字段…"
                    : hadRealScan && !scanAnimDone
                      ? "正在播放扫描预览，同时模型在提取字段…"
                      : "模型正在提取字段，请稍候（进度条随真实步骤更新）…"}
                </p>
              ) : null}
            </div>
          ) : enrichedFields.length === 0 ? (
            <p className="dv-empty-main">
              填入原型链接后点「读取原型并提取字段」。表格按纵向字段排布，含页面显示值与数据库统计值比对。
            </p>
          ) : (
            <table className="dv-table">
              <thead>
                <tr>
                  {phase === "draft" ? <th>选</th> : null}
                  <th>字段序号</th>
                  <th>所属页面</th>
                  <th>字段名称</th>
                  <th>计算来源</th>
                  <th>计算公式</th>
                  <th>页面显示值</th>
                  <th>数据库统计值</th>
                  <th>比对</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {enrichedFields.map((f, i) => (
                  <tr
                    key={f.id}
                    className={
                      [
                        f.cmp.status === "mismatch"
                          ? "dv-row-bad"
                          : f.cmp.status === "ok"
                            ? "dv-row-ok"
                            : "",
                        f.groupId ? "dv-group-row" : "",
                        f.groupEdge ? `dv-group-${f.groupEdge}` : "",
                      ]
                        .filter(Boolean)
                        .join(" ")
                    }
                  >
                    {phase === "draft" ? (
                      <td>
                        <input
                          type="checkbox"
                          checked={f.selected !== false}
                          onChange={(e) => patchField(f.id, { selected: e.target.checked })}
                        />
                      </td>
                    ) : null}
                    <td className="dv-idx">
                      字段{i + 1}
                      {f.groupEdge === "start" || f.groupEdge === "only" ? (
                        <span className="dv-group-tag" title="同卡指标组">
                          组
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <input
                        value={f.page || ""}
                        placeholder="页面"
                        onChange={(e) => patchField(f.id, { page: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        value={f.name}
                        onChange={(e) => patchField(f.id, { name: e.target.value })}
                      />
                      {f.groupLabel && (f.groupEdge === "start" || f.groupEdge === "only") ? (
                        <div className="dv-group-label">同卡：{f.groupLabel}</div>
                      ) : null}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="dv-source-btn"
                        title="点击打开 SQL Skill"
                        onClick={() => openSqlModal(f)}
                      >
                        {f.source || "数据库统计"}
                        {f.sql ? " · 有SQL" : ""}
                      </button>
                    </td>
                    <td>
                      <input
                        value={f.formula}
                        placeholder="(今日-昨日)/昨日"
                        onChange={(e) => patchField(f.id, { formula: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        value={f.pageValue}
                        onChange={(e) => patchField(f.id, { pageValue: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        value={f.dbValue}
                        placeholder={f.computedDb && !f.dbValue ? `自动 ${f.computedDb}` : "手工填入"}
                        onChange={(e) => patchField(f.id, { dbValue: e.target.value })}
                      />
                    </td>
                    <td className={`dv-cmp dv-cmp-${f.cmp.status}`}>
                      {f.cmp.status === "ok"
                        ? "一致"
                        : f.cmp.status === "mismatch"
                          ? "不一致"
                          : "待填"}
                    </td>
                    <td>
                      <button type="button" className="btn btn-small" onClick={() => removeField(f.id)}>
                        删
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
          </>
        )}
      </main>

      {skillOpen ? (
        <div className="modal-backdrop" onClick={() => setSkillOpen(false)}>
          <div className="modal dv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>数据验证 Skill</h3>
              <button type="button" className="btn btn-small" onClick={() => setSkillOpen(false)}>
                关闭
              </button>
            </div>
            <div className="dv-skill-tabs">
              <button
                type="button"
                className={skillTab === "extract" ? "active" : ""}
                onClick={() => setSkillTab("extract")}
              >
                字段提取
              </button>
              <button
                type="button"
                className={skillTab === "sql" ? "active" : ""}
                onClick={() => setSkillTab("sql")}
              >
                SQL 生成
              </button>
            </div>
            <textarea
              className="req-textarea"
              rows={14}
              value={skillTab === "extract" ? skill || defaultSkill : sqlSkill || defaultSqlSkill}
              onChange={(e) =>
                skillTab === "extract"
                  ? setSkill(e.target.value)
                  : setSqlSkill(e.target.value)
              }
            />
            <div className="dv-modal-actions">
              <button
                type="button"
                className="btn"
                onClick={() =>
                  skillTab === "extract"
                    ? setSkill(defaultSkill)
                    : setSqlSkill(defaultSqlSkill)
                }
              >
                恢复默认
              </button>
              <button type="button" className="btn btn-primary" onClick={saveSkill}>
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeSqlField ? (
        <div className="modal-backdrop" onClick={() => setSqlModal(null)}>
          <div className="modal dv-modal dv-sql-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>SQL Skill · {activeSqlField.name}</h3>
              <button type="button" className="btn btn-small" onClick={() => setSqlModal(null)}>
                关闭
              </button>
            </div>
            <p className="hint">说明 + 表结构截图 Ctrl+V；生成后可写回字段。直连执行已预留未启用。</p>
            <textarea
              className="req-textarea"
              rows={3}
              placeholder="补充业务口径 / 表名提示…"
              value={sqlNote}
              onChange={(e) => setSqlNote(e.target.value)}
              onPaste={(e) => {
                const files = [...(e.clipboardData?.items || [])]
                  .filter((it) => it.type.startsWith("image/"))
                  .map((it) => it.getAsFile())
                  .filter(Boolean);
                if (files.length) {
                  e.preventDefault();
                  onPasteImages(files, "sql");
                }
              }}
            />
            <textarea
              className="req-textarea"
              rows={3}
              placeholder="表结构文字（可选）"
              value={sqlSchema}
              onChange={(e) => setSqlSchema(e.target.value)}
            />
            <textarea
              className="req-textarea"
              rows={2}
              placeholder="数据库报错（修复时粘贴）"
              value={sqlError}
              onChange={(e) => setSqlError(e.target.value)}
            />
            {sqlImages.length > 0 ? (
              <ul className="thumb-strip">
                {sqlImages.map((item, idx) => (
                  <li key={item.name + idx} className="thumb-strip-item">
                    <img src={item.dataUrl} alt="" />
                    <button
                      type="button"
                      className="thumb-remove"
                      onClick={() => setSqlImages((p) => p.filter((_, j) => j !== idx))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="dv-modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!!sqlBusy}
                onClick={() => runSqlGen("generate")}
              >
                {sqlBusy || "生成 SQL"}
              </button>
              <button
                type="button"
                className="btn"
                disabled={!!sqlBusy}
                onClick={() => runSqlGen("fix")}
              >
                修复 SQL
              </button>
              <button type="button" className="btn" disabled title="直连预留">
                执行（预留）
              </button>
              <button type="button" className="btn" onClick={tryExecuteSql}>
                试连预留接口
              </button>
            </div>
            {sqlResult?.sql ? (
              <div className="dv-sql-out">
                <pre>{sqlResult.sql}</pre>
                {sqlResult.explanation ? <p>{sqlResult.explanation}</p> : null}
                <div className="dv-modal-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => navigator.clipboard.writeText(sqlResult.sql)}
                  >
                    复制 SQL
                  </button>
                  <button type="button" className="btn btn-primary" onClick={applySqlToField}>
                    写回字段
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
