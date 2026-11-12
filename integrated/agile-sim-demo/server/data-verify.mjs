/**
 * 数据验证：字段提取 / SQL 生成 的 prompt 与 JSON 解析
 */
import { readFile } from "fs/promises";
import path from "path";

const EXTRACT_FALLBACK = `你是资深数据测试工程师。从原型/截图提取数据字段，只输出 JSON：
{"title":"...","fields":[{"name":"...","source":"数据库统计","formula":"","pageValue":"","format":"number","dependsOn":[],"note":""}]}
派生字段（环比/同比/占比）必须补齐 dependsOn 与 formula。`;

const SQL_FALLBACK = `你是资深数据库工程师。为数据字段生成或修复 SELECT SQL，只输出 JSON：
{"sql":"...","explanation":"...","assumptions":[]}`;

export async function loadDataVerifySkill(skillsDir, kind = "extract") {
  const rel =
    kind === "sql"
      ? path.join("data-verify-sql", "SKILL.md")
      : path.join("data-verify", "SKILL.md");
  const fallback = kind === "sql" ? SQL_FALLBACK : EXTRACT_FALLBACK;
  const p = path.join(skillsDir, rel);
  try {
    let md = await readFile(p, "utf8");
    if (/^---\s*\r?\n/.test(md)) {
      md = md.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/, "");
    }
    md = md.trim();
    return md || fallback;
  } catch {
    return fallback;
  }
}

/** 从模型回复中抠出 JSON 对象 */
export function parseJsonLoose(raw) {
  let t = String(raw || "").trim();
  if (!t) return null;
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1].trim();
  // 去掉常见前后缀说明
  t = t
    .replace(/^[^{]*?(?=\{)/, "")
    .replace(/\}[^}]*$/, "}");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  const tryParse = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };
  let obj = tryParse(t);
  if (obj) return obj;
  // 宽松修复：中文引号、尾逗号、单引号键
  let soft = t
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":')
    .replace(/:\s*'([^']*)'/g, ': "$1"');
  obj = tryParse(soft);
  if (obj) return obj;
  return null;
}

function normFormat(f) {
  const s = String(f || "number").toLowerCase();
  if (s.includes("percent") || s.includes("百分") || s === "%") return "percent";
  if (s.includes("text") || s.includes("文本")) return "text";
  if (s.includes("rank") || s.includes("排行")) return "ranking";
  return "number";
}

function stripMetricNoise(name) {
  return String(name || "")
    .replace(/环比昨日|环比上周|同比|环比|较昨日|较上周/g, "")
    .replace(/[+\-−]?\d+(\.\d+)?%?/g, "")
    .replace(/[（(].*?[)）]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

/**
 * 把「今日 / 昨日 / 环比」等同卡指标聚成一组，并紧挨排序。
 * 返回带 groupId / groupLabel / groupEdge 的新数组。
 */
export function groupRelatedFields(fields) {
  const list = Array.isArray(fields) ? fields.map((f, i) => ({ ...f, _i: i })) : [];
  const n = list.length;
  if (n <= 1) {
    return list.map((f) => {
      const { _i, ...rest } = f;
      return { ...rest, groupId: "", groupLabel: "", groupEdge: "" };
    });
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

  // 1) dependsOn 双向连边
  list.forEach((f, i) => {
    for (const dep of f.dependsOn || []) {
      const j = nameIndex.get(dep);
      if (j != null) unite(i, j);
    }
    // formula 里出现的其它字段名
    const formula = String(f.formula || "");
    if (formula) {
      list.forEach((o, j) => {
        if (i === j || !o.name) return;
        if (formula.includes(o.name)) unite(i, j);
      });
    }
  });

  // 2) 名称启发式：同指标今日/昨日/环比
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = list[i].name;
      const b = list[j].name;
      if (!a || !b) continue;
      const sa = stripMetricNoise(a);
      const sb = stripMetricNoise(b);
      if (sa && sb && (sa === sb || a.includes(sb) || b.includes(sa))) {
        const ratio =
          /环比|同比|较昨|较上/.test(a) || /环比|同比|较昨|较上/.test(b);
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

  const orderedRoots = [...buckets.keys()].sort((a, b) => {
    const ia = Math.min(...buckets.get(a).map((x) => x._i));
    const ib = Math.min(...buckets.get(b).map((x) => x._i));
    return ia - ib;
  });

  const score = (f) => {
    let s = 0;
    if (/环比|同比|较昨|较上|占比/.test(f.name) || f.formula) s += 20;
    if (/昨日|上周|上期/.test(f.name)) s += 10;
    if (/今日|当天|本期/.test(f.name)) s += 5;
    return s;
  };

  const out = [];
  let gSeq = 0;
  for (const root of orderedRoots) {
    const members = buckets.get(root).sort((a, b) => score(a) - score(b) || a._i - b._i);
    const isGroup = members.length >= 2;
    const gid = isGroup ? `g${++gSeq}` : "";
    const label = isGroup
      ? stripMetricNoise(members[0].name) || members[0].name || `指标组${gSeq}`
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
      out.push({
        ...rest,
        groupId: gid,
        groupLabel: label,
        groupEdge,
      });
    });
  }
  return out;
}

export function normalizeExtractResult(obj) {
  const title = String(obj?.title || "").trim() || "数据验证";
  const arr = Array.isArray(obj?.fields) ? obj.fields : [];
  const fields = [];
  for (const raw of arr) {
    const name = String(raw?.name || "").trim();
    if (!name) continue;
    const pageValue = String(raw?.pageValue ?? raw?.value ?? "").trim();
    // 抓取失败时模型可能把用户列出的页面名扩写成“××数据字段待核对”。
    // 这不是原型中的数据字段，禁止进入验证表。
    if (
      !pageValue &&
      /(?:数据字段|页面字段|指标字段)(?:待核对|待确认|待提取)?$/.test(name)
    ) {
      continue;
    }
    const dependsOn = Array.isArray(raw?.dependsOn)
      ? raw.dependsOn.map((x) => String(x || "").trim()).filter(Boolean)
      : [];
    fields.push({
      name,
      source: String(raw?.source || "待确认").trim() || "待确认",
      formula: String(raw?.formula || "").trim(),
      pageValue,
      dbValue: String(raw?.dbValue ?? "").trim(),
      format: normFormat(raw?.format),
      dependsOn,
      note: String(raw?.note || "").trim(),
      sql: String(raw?.sql || "").trim(),
      page: String(raw?.page || raw?.module || "").trim(),
      kind: String(raw?.kind || "").trim(),
    });
  }
  return { title, fields: groupRelatedFields(fields) };
}

export function normalizeSqlResult(obj) {
  return {
    sql: String(obj?.sql || "").trim(),
    explanation: String(obj?.explanation || "").trim(),
    assumptions: Array.isArray(obj?.assumptions)
      ? obj.assumptions.map((x) => String(x || "").trim()).filter(Boolean)
      : [],
  };
}

export function buildExtractMessages({
  skillText,
  material,
  pageContext,
  customSkill,
}) {
  const sys = String(customSkill || skillText || EXTRACT_FALLBACK).trim();
  const mat = String(material || "").trim();
  // 控制上下文体积；多页抓取后允许稍大
  const ctx = String(pageContext || "").trim().slice(0, 22000);
  const textBody =
    `【原型链接 / 说明】\n${mat || "（未填写）"}\n\n` +
    (ctx ? `【原型抓取上下文】\n${ctx}\n\n` : "") +
    `请按 Skill 要求输出字段 JSON。`;
  return [
    { role: "system", content: sys },
    { role: "user", content: textBody },
  ];
}

/** 清洗并重建 data URL；火山对残缺/含空白的 base64 会直接 400 */
export function toSafeImageDataUrl(im) {
  let mime = String(im?.mime || "image/png").split(";")[0].trim();
  if (!/^image\/[\w.+-]+$/.test(mime)) mime = "image/png";
  let b64 = String(im?.base64 || "").trim().replace(/\s/g, "");
  const dataUrl = String(im?.dataUrl || "").trim();
  if ((!b64 || b64.length < 32) && dataUrl.startsWith("data:")) {
    const m = /^data:(image\/[\w.+-]+);base64,([\s\S]+)$/i.exec(dataUrl);
    if (m) {
      mime = m[1];
      b64 = m[2].replace(/\s/g, "");
    }
  }
  if (!b64 || b64.length < 32) return null;
  // base64 长度须为 4 的倍数，否则视为损坏（常见于草稿截断）
  const pad = b64.length % 4;
  if (pad) b64 = b64.slice(0, b64.length - pad);
  if (b64.length < 32) return null;
  if (!/^[A-Za-z0-9+/]+=*$/.test(b64)) return null;
  return `data:${mime};base64,${b64}`;
}

export function buildExtractVisionMessages(baseMessages, images) {
  const txt =
    typeof baseMessages[1]?.content === "string"
      ? baseMessages[1].content
      : "";
  const parts = [{ type: "text", text: txt }];
  for (const im of images || []) {
    const url = toSafeImageDataUrl(im);
    if (!url) continue;
    parts.push({ type: "image_url", image_url: { url } });
  }
  return [baseMessages[0], { role: "user", content: parts }];
}

/**
 * 数据验证统一走 OpenAI 兼容 HTTP（要稳定 JSON）。
 * 用户选 Cursor 时：用「识图用 OpenAI 兼容」的 baseUrl/apiKey/visionModel，
 * 切勿把 composer-* 丢给火山/OpenAI。
 */
export function resolveDataVerifyLlm(config) {
  const provider = String(config?.provider || "openai").toLowerCase();
  const baseUrl = String(config?.baseUrl || "").trim();
  const apiKey = String(config?.apiKey || "").trim();
  const visionModel = String(config?.visionModel || "").trim();
  const model = String(config?.model || "").trim();

  if (provider === "cursor") {
    const useModel = visionModel || (!/^composer/i.test(model) ? model : "");
    if (!apiKey || !baseUrl) {
      return {
        error:
          "你当前选的是 Cursor Cloud。数据验证需要结构化 JSON，请在「模型」下方填写「识图用 OpenAI 兼容」的 URL / API Key / Model ID（火山一般是 ep- 开头）。",
      };
    }
    if (!useModel || /^composer/i.test(useModel)) {
      return {
        error:
          "请在「识图用 OpenAI 兼容」里填写 Model ID（火山接入点 ep-…）。上方 Cursor 的 composer-2.5 不能用来打火山接口。",
      };
    }
    return { baseUrl, apiKey, model: useModel, via: "vision-compat" };
  }

  if (!apiKey) {
    return { error: "未配置模型 API Key，请先点「模型」填写" };
  }
  if (!model) {
    return {
      error: "未填写模型 ID。火山引擎请填接入点（ep-…）；点「模型」修改",
    };
  }
  if (/^composer/i.test(model)) {
    return {
      error:
        "OpenAI 兼容后端不要填 composer。请改选 Cursor，或在 Model 填 ep-… / gpt-4o 等",
    };
  }
  return { baseUrl, apiKey, model, via: "openai" };
}

export function buildSqlMessages({
  skillText,
  customSkill,
  fieldName,
  source,
  formula,
  pageValue,
  userNote,
  schemaText,
  existingSql,
  errorText,
  mode,
}) {
  const sys = String(customSkill || skillText || SQL_FALLBACK).trim();
  const isFix = mode === "fix" || String(errorText || "").trim();
  const textBody =
    `【模式】${isFix ? "修复 SQL" : "生成 SQL"}\n` +
    `【字段名称】${String(fieldName || "").trim() || "（未命名）"}\n` +
    `【计算来源】${String(source || "").trim() || "数据库统计"}\n` +
    `【计算公式】${String(formula || "").trim() || "（无）"}\n` +
    `【页面显示值】${String(pageValue || "").trim() || "（无）"}\n` +
    `【用户补充说明】\n${String(userNote || "").trim() || "（无）"}\n\n` +
    `【表结构 / 业务口径】\n${String(schemaText || "").trim() || "（无，请合理假设并写入 assumptions）"}\n\n` +
    (existingSql
      ? `【原 SQL】\n${String(existingSql).trim()}\n\n`
      : "") +
    (errorText
      ? `【数据库报错】\n${String(errorText).trim()}\n\n`
      : "") +
    `请按 Skill 要求输出 JSON。`;
  return [
    { role: "system", content: sys },
    { role: "user", content: textBody },
  ];
}
