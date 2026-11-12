import { readFile, writeFile } from "fs/promises";
import path from "path";
import { runPlaywrightSteps, normalizeStepList } from "./playwright-steps.mjs";

/** 去掉编号、模块号等，得到列表展示用的一句话名称 */
export function cleanTestPointTitle(raw) {
  let t = String(raw || "").trim();
  t = t.replace(/^#{1,6}\s+/, "");
  t = t.replace(/^[A-Z]{0,3}?\d{0,2}-?\d{2,4}\s+/, "");
  t = t.replace(/^M\d{1,3}(?:-\d{3})?\s+/i, "");
  t = t.replace(/^(?:P\d+|TC\d+|用例\s*\d+)[:：\s]*/i, "");
  t = t.replace(/\*\*/g, "");
  t = t.replace(/^[-*+]\s+/, "");
  t = t.replace(/^【[^】]+】\s*/, "");
  return t.trim();
}

const SKIP_TITLE =
  /^(测试点|功能测试|测试对象|模块编号|基于最新|项目.+测试点$|#)/i;

/** 是否像「一句话测试场景」（非步骤列表碎片） */
function looksLikeScenarioLine(title) {
  const t = cleanTestPointTitle(title);
  if (t.length < 8 || t.length > 120) return false;
  if (SKIP_TITLE.test(t)) return false;
  if (/^`/.test(t) || /^F12|^Console|^HTTP/i.test(t)) return false;
  if (
    /^(点击|输入|选择|切换|加载|新建|删除|打开|关闭|在|当|未|已|项目名|首次|页面|切换至)/.test(
      t
    ) &&
    /(能够|可以|应|会|显示|提示|弹出|变为|不可|禁用|成功|失败|清空|出现)/.test(t)
  ) {
    return true;
  }
  return /，.*(能够|可以|显示|提示|弹出)/.test(t);
}

function sectionKindFromHeading(heading) {
  const h = String(heading || "").trim();
  if (/业务/.test(h)) return "business";
  if (/功能/.test(h)) return "functional";
  return null;
}

function tryParseStepsJson(raw) {
  try {
    const j = JSON.parse(String(raw || "").trim());
    const steps = normalizeStepList(j.steps || j);
    return steps.length ? steps : null;
  } catch {
    return null;
  }
}

function makeSmokePoint(title, steps) {
  return {
    id: `smoke_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title: cleanTestPointTitle(title) || "冒烟自动化主流程",
    detail: "",
    kind: "smoke",
    automatable: true,
    steps,
  };
}

/** 模型只输出裸 JSON / 无 ## 冒烟 段时，仍解析为可执行冒烟项 */
export function parseLooseJsonSmokeFromMd(md) {
  const text = String(md || "").trim();
  if (!text) return [];
  const out = [];
  const seen = new Set();

  const push = (title, steps) => {
    const key = `${title}:${steps.length}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(makeSmokePoint(title, steps));
  };

  const stripped = text.replace(/^json\s*/im, "").trim();
  const whole = tryParseStepsJson(stripped);
  if (whole) {
    push("冒烟自动化主流程", whole);
    return out;
  }

  for (const m of text.matchAll(/```json\s*([\s\S]*?)```/gi)) {
    const steps = tryParseStepsJson(m[1]);
    if (steps) push("冒烟自动化（JSON 块）", steps);
  }
  if (out.length) return out;

  const brace = text.match(/\{[\s\S]*"steps"\s*:\s*\[[\s\S]*?\][\s\S]*?\}/);
  if (brace) {
    const steps = tryParseStepsJson(brace[0]);
    if (steps) push("冒烟自动化主流程", steps);
  }
  return out;
}

/** 放宽：任意 ## 段下的列表项 / ### 标题 */
function parseRelaxedBulletsFromMd(md) {
  const text = String(md || "").trim();
  if (!text) return [];
  const items = [];
  let sectionKind = "functional";

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(">") || trimmed === "---") continue;

    const h2 = /^##\s+(.+)$/.exec(trimmed);
    if (h2) {
      const kind = sectionKindFromHeading(h2[1]);
      if (kind) sectionKind = kind;
      else if (/冒烟/.test(h2[1])) sectionKind = "smoke";
      continue;
    }

    if (sectionKind === "smoke") continue;

    const h3 = /^###\s+(.+)$/.exec(trimmed);
    if (h3) {
      const title = cleanTestPointTitle(h3[1]);
      if (title.length >= 4 && !SKIP_TITLE.test(title)) {
        items.push({
          id: `tp_${items.length}_${Date.now().toString(36)}`,
          title,
          detail: "",
          kind: sectionKind === "smoke" ? "functional" : sectionKind || "functional",
        });
      }
      continue;
    }

    const bullet = /^[-*+]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      const title = cleanTestPointTitle(bullet[1]);
      if (
        title.length >= 6 &&
        title.length <= 200 &&
        !SKIP_TITLE.test(title) &&
        !/^（.*(请重新|手工|补充).*$/.test(title)
      ) {
        items.push({
          id: `tp_${items.length}_${Date.now().toString(36)}`,
          title,
          detail: "",
          kind: sectionKind === "smoke" ? "functional" : sectionKind || "functional",
        });
      }
      continue;
    }

    const num = /^\d+[.)]\s+(.+)$/.exec(trimmed);
    if (num) {
      const title = cleanTestPointTitle(num[1]);
      if (title.length >= 6 && title.length <= 200 && !SKIP_TITLE.test(title)) {
        items.push({
          id: `tp_${items.length}_${Date.now().toString(36)}`,
          title,
          detail: "",
          kind: sectionKind || "functional",
        });
      }
    }
  }
  return items;
}

/** 从测试点 Markdown 解析条目（先业务后功能；列表只展示 title 一句话） */
export function parseTestPointsFromMd(md) {
  const text = String(md || "").trim();
  if (!text) return [];

  const items = [];
  let current = null;
  let buf = [];
  let sectionKind = "functional";

  const flush = () => {
    if (!current) return;
    const title = cleanTestPointTitle(current.title);
    if (title && title.length >= 4 && !SKIP_TITLE.test(title)) {
      current.title = title;
      current.detail = buf.join("\n").trim();
      items.push(current);
    }
    current = null;
    buf = [];
  };

  const pushBullet = (rawTitle) => {
    if (!looksLikeScenarioLine(rawTitle)) return;
    flush();
    items.push({
      id: `tp_${items.length}_${Date.now().toString(36)}`,
      title: cleanTestPointTitle(rawTitle),
      detail: "",
      kind: sectionKind || "functional",
    });
  };

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith(">")) continue;
    if (trimmed === "---") continue;
    if (/^\*\*[^*]+\*\*$/.test(trimmed)) continue;

    const h2 = /^##\s+(.+)$/.exec(trimmed);
    if (h2) {
      flush();
      const kind = sectionKindFromHeading(h2[1]);
      if (kind) sectionKind = kind;
      continue;
    }

    const bullet = /^[-*+]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      pushBullet(bullet[1]);
      continue;
    }

    if (current) buf.push(line);
  }
  flush();

  const seen = new Set();
  const business = [];
  const functional = [];
  const other = [];
  for (const it of items) {
    const key = it.title;
    if (seen.has(key)) continue;
    seen.add(key);
    if (it.kind === "business") business.push(it);
    else if (it.kind === "functional") functional.push(it);
    else other.push(it);
  }

  let smoke = parseSmokePlaywrightFromMd(text);
  if (!smoke.length) smoke = parseLooseJsonSmokeFromMd(text);

  let merged = [...smoke, ...business, ...functional, ...other];
  if (merged.length === 0) {
    merged = [...parseLooseJsonSmokeFromMd(text), ...parseRelaxedBulletsFromMd(text)];
  } else if (!business.length && !functional.length && !other.length && smoke.length) {
    const relaxed = parseRelaxedBulletsFromMd(text).filter((p) => p.kind !== "smoke");
    if (relaxed.length) merged = [...smoke, ...relaxed];
  }

  const dedupe = new Set();
  const final = [];
  for (const p of merged) {
    const k = `${p.kind}:${p.title}`;
    if (dedupe.has(k)) continue;
    dedupe.add(k);
    final.push(p);
  }
  return final.slice(0, 80);
}

/** 解析 ## 冒烟自动化 下 ### 标题 + json 步骤块；无标准段落时回退全文件 json 块 */
export function parseSmokePlaywrightFromMd(md) {
  const text = String(md || "");
  const items = [];
  const seen = new Set();

  const pushBlock = (titleRaw, jsonRaw) => {
    try {
      const j = JSON.parse(String(jsonRaw).trim());
      const steps = normalizeStepList(j.steps || j);
      if (!steps.length) return;
      const title = cleanTestPointTitle(titleRaw) || "冒烟自动化";
      const key = `${title}:${steps.length}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push(makeSmokePoint(title, steps));
    } catch {
      /* 非法 JSON 跳过 */
    }
  };

  const sec = /##\s*冒烟/.test(text)
    ? text.match(/##\s*冒烟[^\n]*\r?\n([\s\S]*?)(?=\r?\n##\s+|$)/i)
    : null;
  const body = sec ? sec[1] : text;

  for (const m of body.matchAll(/###\s*(.+?)\r?\n[\s\S]*?```json\s*([\s\S]*?)```/gi)) {
    pushBlock(m[1], m[2]);
  }
  if (items.length) return items;

  for (const m of body.matchAll(/###\s*(.+?)\r?\n[\s\S]*?```\s*json\s*([\s\S]*?)```/gi)) {
    pushBlock(m[1], m[2]);
  }
  if (items.length) return items;

  for (const m of text.matchAll(/```json\s*([\s\S]*?)```/gi)) {
    pushBlock("冒烟自动化", m[1]);
  }
  return items;
}

export async function readSessionPlaywrightSmoke(sessionDir) {
  try {
    const raw = await readFile(path.join(sessionDir, "qa", "playwright-smoke.json"), "utf8");
    const j = JSON.parse(raw);
    const cases = Array.isArray(j.cases) ? j.cases : Array.isArray(j) ? j : [];
    return cases
      .map((c, i) => ({
        id: c.id || `smoke_file_${i}`,
        title: cleanTestPointTitle(c.title || c.name || `冒烟${i + 1}`),
        detail: "",
        kind: "smoke",
        automatable: true,
        steps: normalizeStepList(c.steps),
      }))
      .filter((c) => c.steps.length > 0);
  } catch {
    return [];
  }
}

export const QA_PIPELINE_STYLE_HINT =
  "【敏捷流水线 · 测试点列表专用格式 · 固定顺序】\n" +
  "必须按以下结构输出（禁止颠倒）：\n" +
  "# （项目名）测试点\n\n" +
  "## 冒烟自动化（Playwright）\n" +
  "写 3～5 条核心主流程，每条：### 一句话标题 + 紧跟 ```json 步骤数组（可被执行，替代人工冒烟）。\n" +
  "步骤 op 仅允许：goto,clearStorage,reload,wait,fill,click,clickRole,selectOption,expectText,expectVisible,expectEnabled,expectDisabled,expectCountMin。\n" +
  "selector 必须用 app 源码真实 id（如 #projName #taskName #addProjBtn #addTaskBtn #tabSingle #demoBtn）。\n" +
  "示例：\n" +
  "### 主流程：新建项目并添加任务后甘特可见\n" +
  "```json\n" +
  "{\"steps\":[\n" +
  "{\"op\":\"goto\"},\n" +
  "{\"op\":\"clearStorage\"},\n" +
  "{\"op\":\"reload\"},\n" +
  "{\"op\":\"fill\",\"selector\":\"#projName\",\"value\":\"冒烟项目A\"},\n" +
  "{\"op\":\"clickRole\",\"role\":\"button\",\"name\":\"新建项目\"},\n" +
  "{\"op\":\"expectText\",\"text\":\"已创建项目\"},\n" +
  "{\"op\":\"fill\",\"selector\":\"#taskName\",\"value\":\"联调任务\"},\n" +
  "{\"op\":\"clickRole\",\"role\":\"button\",\"name\":\"添加任务\"},\n" +
  "{\"op\":\"expectCountMin\",\"selector\":\".bar\",\"min\":1}\n" +
  "]}\n" +
  "```\n\n" +
  "## 业务测试点\n" +
  "- （用户价值/主流程/空状态，一句完整场景，给人看）\n" +
  "- …\n\n" +
  "## 功能测试点\n" +
  "- （具体按钮/输入/校验，一句：操作 + 可验证结果）\n" +
  "禁止：用例编号（M01-001）、模块号、优先级、表格、引用块（>）。\n" +
  "业务/功能段不要用代码围栏；冒烟段必须用 ```json。";

/** 模型只输出裸 Playwright JSON 时，整理为带章节的 Markdown，便于列表解析与人工编辑 */
export function repairTestPointMdIfNeeded(md) {
  const text = String(md || "").trim();
  if (!text) return text;
  const points = parseTestPointsFromMd(text);
  const hasListItems = points.some((p) => p.kind === "business" || p.kind === "functional");
  if (hasListItems) return text;

  const smoke = parseLooseJsonSmokeFromMd(text);
  if (!smoke.length) return text;

  const title = smoke[0].title || "冒烟自动化主流程";
  const jsonBody = JSON.stringify({ steps: smoke[0].steps }, null, 2);
  return (
    `# 测试点（已自动整理）\n\n` +
    `## 冒烟自动化（Playwright）\n` +
    `### ${title}\n` +
    "```json\n" +
    jsonBody +
    "\n```\n\n" +
    `## 业务测试点\n` +
    `- 请结合需求补充主流程与空状态场景（模型本轮未输出业务条目）\n\n` +
    `## 功能测试点\n` +
    `- 请结合 app 源码补充按钮、校验与异常场景（模型本轮未输出功能条目）\n`
  );
}

export async function readSessionTestMd(sessionDir) {
  try {
    return await readFile(path.join(sessionDir, "测试点.md"), "utf8");
  } catch {
    return "";
  }
}

export async function writeSessionTestMd(sessionDir, md) {
  await writeFile(path.join(sessionDir, "测试点.md"), md, "utf8");
}

export const QA_PIPELINE_GEN_SYS =
  "你是资深测试工程师。根据业务需求、原型与全栈 app 源码，输出「测试点列表」。\n" +
  QA_PIPELINE_STYLE_HINT;

export function buildPipelineTestGenMessages({ requirement, contextHtml, appExcerpt }) {
  const req = String(requirement || "").trim() || "（见会话需求）";
  const ctx = String(contextHtml || "").trim().slice(0, 10000);
  const app = String(appExcerpt || "").trim().slice(0, 12000);
  return [
    { role: "system", content: QA_PIPELINE_GEN_SYS },
    {
      role: "user",
      content:
        `【业务需求】\n${req}\n\n` +
        (ctx ? `【原型/UI 节选】\n${ctx}\n\n` : "") +
        (app ? `【全栈 app 节选】\n${app}\n\n` : "") +
        "请按「## 冒烟自动化（Playwright）」→「## 业务测试点」→「## 功能测试点」顺序输出；冒烟段写可执行 json 步骤，业务/功能段写 - 列表。",
    },
  ];
}

const PW_INSTALL_HINT =
  "Playwright 浏览器未安装，已跳过自动化点击。请在 agile-sim-demo 目录执行：npx playwright install chromium（约 150MB，仅需一次）";

function extractQuotedNames(text) {
  const names = [];
  for (const m of String(text).matchAll(/「([^」]+)」/g)) names.push(m[1]);
  return [...new Set(names)];
}

function extractExpectedSnippets(text) {
  const t = String(text || "");
  const out = [];
  if (/请输入项目名称/.test(t)) out.push("请输入项目名称");
  if (/暂无数据/.test(t)) out.push("暂无数据");
  if (/暂无项目/.test(t)) out.push("暂无项目");
  for (const m of t.matchAll(/提示[「"]([^」"]+)[」"]/g)) out.push(m[1]);
  for (const m of t.matchAll(/显示[「"]([^」"]+)[」"]/g)) out.push(m[1]);
  for (const m of t.matchAll(/状态栏[^，。]*[「"]([^」"]+)[」"]/g)) out.push(m[1]);
  return [...new Set(out)].filter((s) => s.length >= 2 && s.length <= 80);
}

export async function launchPlaywrightBrowser() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return { error: "未安装 playwright 包" };
  }
  try {
    const browser = await chromium.launch({ headless: true });
    return { browser };
  } catch (e) {
    const msg = String(e?.message || e);
    const missingBrowser =
      /Executable doesn't exist|browserType\.launch|chrome-headless-shell|ms-playwright/i.test(
        msg
      );
    return {
      error: missingBrowser ? PW_INSTALL_HINT : `Playwright 启动失败：${msg.slice(0, 200)}`,
    };
  }
}

function attachPageListeners(page, consoleErrors) {
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err.message || err)));
}

/** 按单条测试点场景做 Playwright：有 steps 则执行步骤引擎，否则标题启发式 */
export async function runPlaywrightForTestPoint({ page, pageUrl, point, timeoutMs = 25000 }) {
  const issues = [];
  const consoleErrors = [];
  const title = String(point?.title || "");
  const steps = normalizeStepList(point?.steps);

  if (steps.length > 0) {
    attachPageListeners(page, consoleErrors);
    const r = await runPlaywrightSteps({ page, pageUrl, steps, timeoutMs });
    for (const msg of r.issues) issues.push(msg);
    if (consoleErrors.length) {
      issues.push(
        ...consoleErrors.slice(0, 4).map((t) => `控制台错误：${String(t).slice(0, 200)}`)
      );
    }
    return { issues, consoleErrors };
  }

  await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });

  if (/首次进入|无数据|空状态/.test(title)) {
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* ignore */
      }
    });
    await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
  }

  if (/留空|为空/.test(title) && /项目名/.test(title)) {
    await page.locator("#projName").fill("").catch(() => {});
  } else {
    const nameM = title.match(/项目名称[「"]([^」"]+)[」"]|输入项目名称[「"]([^」"]+)[」"]/);
    const name = nameM?.[1] || nameM?.[2];
    if (name) await page.locator("#projName").fill(name).catch(() => {});
  }

  const btnNames = extractQuotedNames(title);
  for (const name of btnNames) {
    try {
      const loc = page.getByRole("button", { name });
      const n = await loc.count();
      if (n === 0) {
        issues.push(`未找到按钮「${name}」`);
        continue;
      }
      const el = loc.first();
      await el.scrollIntoViewIfNeeded({ timeout: 4000 });
      const disabled = await el.isDisabled();
      if (disabled) {
        if (/不可|禁用|未创建|不能|留空/.test(title)) continue;
        issues.push(`按钮「${name}」不可点击（disabled）`);
        continue;
      }
      await el.click({ timeout: 6000 });
      await page.waitForTimeout(350);
    } catch (e) {
      issues.push(`按钮「${name}」：${String(e.message || e).slice(0, 100)}`);
    }
  }

  for (const exp of extractExpectedSnippets(title)) {
    try {
      const body = await page.locator("body").innerText({ timeout: 5000 });
      if (!body.includes(exp)) {
        issues.push(`未在页面找到预期文案「${exp}」`);
      }
    } catch (e) {
      issues.push(`校验文案「${exp}」失败：${String(e.message || e).slice(0, 80)}`);
    }
  }

  if (consoleErrors.length) {
    issues.push(
      ...consoleErrors.slice(0, 4).map((t) => `控制台错误：${String(t).slice(0, 200)}`)
    );
  }

  return { issues, consoleErrors };
}

/** 兼容旧调用：仅打开页面检查控制台，不再盲目点击全部按钮 */
export async function runPlaywrightAppSmoke({ pageUrl, timeoutMs = 20000 }) {
  const launched = await launchPlaywrightBrowser();
  if (launched.error) {
    return { usedPlaywright: false, issues: [], warning: launched.error, consoleErrors: [] };
  }
  const consoleErrors = [];
  try {
    const page = await launched.browser.newPage();
    attachPageListeners(page, consoleErrors);
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const issues = consoleErrors.length
      ? consoleErrors.slice(0, 8).map((t) => `控制台错误：${String(t).slice(0, 200)}`)
      : [];
    return { usedPlaywright: true, issues, consoleErrors };
  } catch (e) {
    return {
      usedPlaywright: false,
      issues: [],
      warning: `Playwright 执行异常：${String(e?.message || e).slice(0, 200)}`,
      consoleErrors: [],
    };
  } finally {
    await launched.browser?.close?.().catch(() => {});
  }
}

export function buildPointCheckMessages({ requirement, point, appExcerpt }) {
  return [
    {
      role: "system",
      content:
        "你是测试工程师。根据测试点与 app 源码，判断该测试点最可能的结果：pass 或 fail。\n" +
        '只输出一行 JSON：{"status":"pass"|"fail","reason":"简短说明"}',
    },
    {
      role: "user",
      content:
        `【需求摘要】\n${String(requirement || "").slice(0, 2000)}\n\n` +
        `【当前测试点】\n${point.title}\n${point.detail || ""}\n\n` +
        `【app 源码节选】\n${String(appExcerpt || "").slice(0, 14000)}`,
    },
  ];
}

export function parsePointCheckJson(raw) {
  const t = String(raw || "").trim();
  const m = /\{[\s\S]*\}/.exec(t);
  if (!m) return { status: "fail", reason: "模型未返回可解析结果" };
  try {
    const j = JSON.parse(m[0]);
    const status = j.status === "pass" ? "pass" : "fail";
    return { status, reason: String(j.reason || "").slice(0, 500) };
  } catch {
    return { status: "fail", reason: t.slice(0, 300) };
  }
}
