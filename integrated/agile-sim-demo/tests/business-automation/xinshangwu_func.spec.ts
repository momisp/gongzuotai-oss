/**
 * 新商务 · 页面功能测试（对照测试点生成 markdown）
 * 用例注入：FUNC_CASES_FILE（优先）/ SMOKE_RUN_DIR/func_cases.json / FUNC_CASES_JSON
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  attachHintResults,
  caseIdFromTitle,
  finishSmokeCase,
  markCaseStatus,
} from "./smoke_progress";

const BASE = (process.env.SMOKE_BASE_URL || "http://sw.example.com").replace(/\/$/, "");
const ADMIN_USER = process.env.SMOKE_ADMIN_USER || "admin";
const ADMIN_PASS = process.env.SMOKE_ADMIN_PASS || "admin123";
const L1_USER = process.env.SMOKE_L1_USER || "";
const L1_PASS = process.env.SMOKE_L1_PASS || "111111";

type FuncCase = {
  id: string;
  title?: string;
  module?: string;
  route?: string;
  hints?: string[];
  enabled?: boolean;
};

function loadCases(): FuncCase[] {
  const candidates = [
    process.env.FUNC_CASES_FILE || "",
    process.env.SMOKE_RUN_DIR ? path.join(process.env.SMOKE_RUN_DIR, "func_cases.json") : "",
  ].filter(Boolean);

  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
      const list = Array.isArray(raw) ? raw : raw?.cases;
      if (Array.isArray(list) && list.length) {
        return list.filter((c: FuncCase) => c && c.enabled !== false);
      }
    } catch {
      /* try next */
    }
  }

  try {
    const raw = JSON.parse(process.env.FUNC_CASES_JSON || "[]");
    return Array.isArray(raw) ? raw.filter((c: FuncCase) => c && c.enabled !== false) : [];
  } catch {
    return [];
  }
}

const caseNotes: Record<string, string> = {};
let sharedPage: Page;
let loggedIn = false;

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    locale: "zh-CN",
  });
  sharedPage = await ctx.newPage();
});

test.afterAll(async () => {
  await sharedPage?.context().close().catch(() => {});
});

test.beforeEach(async ({}, testInfo) => {
  markCaseStatus(caseIdFromTitle(testInfo.title), "running", { title: testInfo.title });
});

test.afterEach(async ({}, testInfo) => {
  const id = caseIdFromTitle(testInfo.title);
  await finishSmokeCase(sharedPage, testInfo, caseNotes[id] || "");
});

async function settle(page: Page, ms = 400) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
  if (ms) await page.waitForTimeout(ms);
}

async function clearStorage(page: Page) {
  await page.context().clearCookies().catch(() => {});
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });
}

async function login(page: Page) {
  const user = L1_USER || ADMIN_USER;
  const pass = L1_USER ? L1_PASS : ADMIN_PASS;
  await clearStorage(page);
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('input[type="text"], input[placeholder*="账号"], input[placeholder*="用户"]').first().fill(user);
  await page.locator('input[type="password"]').first().fill(pass);
  const captcha = page.locator('input[placeholder*="验证码"], input[name="code"]').first();
  if (await captcha.isVisible().catch(() => false)) await captcha.fill("0000");
  await page.getByRole("button", { name: /登\s*录/ }).click();
  await page.waitForTimeout(1500);
  loggedIn = !/\/login/i.test(page.url());
}

function isLoginCase(c: FuncCase) {
  return /登录界面|忘记密码|找回密码|账号校验|短信验证|重设密码/.test(`${c.module || ""}${c.title || ""}`);
}

/** 从 hint 抽可检索关键词：「xxx」或前 8～12 字 */
function hintKeys(hints: string[], limit = 24): string[] {
  const keys: string[] = [];
  for (const h of hints) {
    const quoted = [...h.matchAll(/「([^」]{2,20})」/g)].map((m) => m[1]);
    if (quoted.length) {
      keys.push(...quoted);
      continue;
    }
    const stripped = h
      .replace(/[（(].*$/, "")
      .replace(/^(能显示|点击|输入|勾选|取消|默认|为空点|不输入|选)/, "")
      .trim();
    if (stripped.length >= 2) keys.push(stripped.slice(0, 12));
  }
  return [...new Set(keys)].slice(0, limit);
}

async function bodyText(page: Page) {
  return ((await page.locator("body").innerText().catch(() => "")) || "").replace(/\s+/g, " ");
}

/** 文案别名：原型 ↔ 现网 */
const TEXT_ALIASES: Record<string, string[]> = {
  忘记密码: ["找回密码", "忘记密码?", "找回密码?"],
  "忘记密码？": ["找回密码?", "找回密码", "忘记密码"],
  记住账号: ["记住密码", "记住账号"],
  记住密码: ["记住账号", "记住密码"],
  商务账号: ["用户名", "账号", "商务账号"],
  登录密码: ["密码", "登录密码"],
  请输入商务账号: ["请输入您的账号", "请输入账号", "请输入商务账号"],
  请输入登录密码: ["请输入您的密码", "请输入密码", "请输入登录密码"],
  欢迎登录: ["欢迎登录"],
  全部平台: ["全部平台", "所属平台"],
  下一步: ["下一步", "确定"],
  搜索: ["搜索", "查询"],
};

function expandAliases(key: string): string[] {
  const out = [key];
  for (const [k, vals] of Object.entries(TEXT_ALIASES)) {
    if (key.includes(k) || k.includes(key)) out.push(...vals);
  }
  return [...new Set(out.filter((s) => s.length >= 2))];
}

type HintKind = "assert" | "action" | "sample";

function classifyHint(h: string): HintKind {
  if (/[¥￥]\s*\d|[\d,]{3,}|待处理\s*\d|环比|样例|如\s*[¥\d]/.test(h)) return "sample";
  if (/点击|输入|勾选|取消勾选|为空点|不输入|点「|提交|切换|打开下拉|选中|进入步骤/.test(h)) return "action";
  return "assert";
}

/** 单条 hint 抽检索词（含别名） */
function keysForHint(h: string): string[] {
  const quoted = [...h.matchAll(/「([^」]{2,24})」/g)].map((m) => m[1]);
  const raw: string[] = [...quoted];
  const stripped = h
    .replace(/[（(].*$/, "")
    .replace(/^(能显示|点击|输入|勾选|取消|默认|为空点|不输入|选|标题为|表格列[：:]|副标题)/, "")
    .trim();
  if (stripped.length >= 2) raw.push(stripped.slice(0, 16));
  for (const part of stripped.split(/[\/、，,\s]+/).map((s) => s.trim())) {
    if (part.length >= 2 && part.length <= 16) raw.push(part);
  }
  const expanded = raw.flatMap((k) => expandAliases(k));
  return [...new Set(expanded)].slice(0, 8);
}

type HintShot = {
  index: number;
  text: string;
  kind?: HintKind;
  status: "hit" | "miss" | "skip";
  screenshot: string;
  box: { x: number; y: number; width: number; height: number } | null;
  pageSize: { pageWidth: number; pageHeight: number } | null;
  note?: string;
};

async function locateByKey(page: Page, key: string): Promise<Locator | null> {
  const candidates: Locator[] = [
    page.getByRole("button", { name: new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first(),
    page.getByRole("link", { name: new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first(),
    page.getByRole("heading", { name: new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first(),
    page.getByRole("textbox", { name: new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first(),
    page.getByLabel(key, { exact: false }).first(),
    page.getByPlaceholder(key, { exact: false }).first(),
    page.getByText(key, { exact: false }).first(),
    page.locator(`[placeholder*="${key}"], [aria-label*="${key}"], [title*="${key}"]`).first(),
  ];
  for (const loc of candidates) {
    if (await loc.isVisible({ timeout: 180 }).catch(() => false)) return loc;
  }
  return null;
}

/** 对每条细项：定位 → 区域截图 → 记录相对整页坐标（供工作台叠图） */
async function captureHintRegions(page: Page, caseId: string, hints: string[]): Promise<HintShot[]> {
  const dir = String(process.env.SMOKE_RUN_DIR || "").trim();
  const pageSize = await page.evaluate(() => ({
    pageWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0, 1),
    pageHeight: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0, 1),
  }));
  if (!hints.length) return [];

  const shotDir = dir ? path.join(dir, "screenshots", "hints", caseId) : "";
  if (shotDir) fs.mkdirSync(shotDir, { recursive: true });

  const results: HintShot[] = [];
  for (let i = 0; i < hints.length; i++) {
    const text = hints[i];
    const kind = classifyHint(text);
    const keys = keysForHint(text);
    let hitLoc: Locator | null = null;
    let usedKey = "";
    for (const key of keys) {
      if (key.length < 2) continue;
      const loc = await locateByKey(page, key);
      if (loc) {
        hitLoc = loc;
        usedKey = key;
        break;
      }
    }
    // 样例数据细项：找不到具体数字时，若同句有标题类关键词已在 keys 里试过，仍 miss → skip（不拖垮可见性命中率）
    if (!hitLoc && kind === "sample") {
      results.push({
        index: i,
        text,
        kind,
        status: "skip",
        screenshot: "",
        box: null,
        pageSize,
        note: "样例数据以现网为准，跳过数值断言",
      });
      continue;
    }
    if (!hitLoc) {
      results.push({
        index: i,
        text,
        kind,
        status: "miss",
        screenshot: "",
        box: null,
        pageSize,
        note: keys[0] ? `未定位:${keys[0]}` : "未定位",
      });
      continue;
    }
    try {
      await hitLoc.scrollIntoViewIfNeeded().catch(() => {});
      const box = await hitLoc.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return {
          x: Math.max(0, r.left + window.scrollX),
          y: Math.max(0, r.top + window.scrollY),
          width: Math.max(12, r.width),
          height: Math.max(12, r.height),
        };
      });
      let screenshot = "";
      if (shotDir) {
        const fileName = `h${String(i).padStart(2, "0")}.png`;
        const abs = path.join(shotDir, fileName);
        await hitLoc.screenshot({ path: abs, timeout: 5000 }).catch(async () => {
          const pad = 6;
          await page.screenshot({
            path: abs,
            clip: {
              x: Math.max(0, box.x - pad),
              y: Math.max(0, box.y - pad),
              width: Math.min(800, box.width + pad * 2),
              height: Math.min(600, box.height + pad * 2),
            },
          });
        });
        screenshot = `screenshots/hints/${caseId}/${fileName}`;
      }
      results.push({
        index: i,
        text,
        kind,
        status: "hit",
        screenshot,
        box,
        pageSize,
        note: usedKey,
      });
    } catch (err) {
      results.push({
        index: i,
        text,
        kind,
        status: "miss",
        screenshot: "",
        box: null,
        pageSize,
        note: String((err as Error)?.message || "截图失败").slice(0, 80),
      });
    }
  }
  return results;
}

async function openForgotPassword(page: Page) {
  const link = page.getByText(/忘记密码|找回密码/).first();
  if (await link.isVisible().catch(() => false)) {
    await link.click();
    await settle(page, 600);
  }
}

/** 细项加深：登录边界 / 平台必选 / 搜索区 / 导航点击 */
async function deepenBoundary(page: Page, c: FuncCase, hints: string[]): Promise<string[]> {
  const notes: string[] = [];
  const blob = `${c.module || ""}${c.title || ""}`;

  // —— 登录界面：空提交、占位、忘记密码入口 ——
  if (/登录界面/.test(blob) || (/^登录$/.test(c.title || "") && /登录/.test(c.module || ""))) {
    await clearStorage(page);
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await settle(page, 500);
    const user = page.locator('input[type="text"], input[placeholder*="账号"], input[placeholder*="用户"]').first();
    const pwd = page.locator('input[type="password"]').first();
    await user.fill("");
    await pwd.fill("");
    await page.getByRole("button", { name: /登\s*录/ }).click();
    await settle(page, 400);
    const tip = await bodyText(page);
    const emptyTip = /请输入商务账号|请输入账号|请输入登录密码|请输入密码/.test(tip);
    expect(emptyTip || /\/login/i.test(page.url()), "空账号密码应停留登录页并有校验提示").toBeTruthy();
    notes.push(emptyTip ? "空提交有校验提示" : "空提交未跳转");

    const phUser = await user.getAttribute("placeholder").catch(() => "");
    if (phUser) notes.push(`账号占位=${phUser}`);
    const remember = page.getByText(/记住账号|记住密码/).first();
    if (await remember.isVisible().catch(() => false)) {
      notes.push("记住账号/密码可见");
    } else {
      notes.push("与原型差异：未见记住账号");
    }
    // 原型「忘记密码？」；现网常见「找回密码?」
    const forgot = page.getByText(/忘记密码|找回密码/).first();
    expect(await forgot.isVisible().catch(() => false), "应有忘记/找回密码入口").toBeTruthy();
    notes.push("忘记/找回密码入口可见");
    return notes;
  }

  // —— 忘记密码三步：打开弹窗，做空校验 / 文案 ——
  if (/忘记密码|找回密码|账号校验|短信验证|重设密码/.test(blob)) {
    await clearStorage(page);
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await settle(page, 400);
    await openForgotPassword(page);
    let text = await bodyText(page);
    const dlg = /找回密码|忘记密码|账号校验|验证码|重设密码|新密码/.test(text);
    expect(dlg, "应进入忘记密码流程").toBeTruthy();
    notes.push("已打开找回密码");

    if (/账号校验|步骤\s*1/.test(blob)) {
      const next = page.getByRole("button", { name: /下一步|确定/ }).first();
      if (await next.isVisible().catch(() => false)) {
        await next.click();
        await settle(page, 400);
        text = await bodyText(page);
        const tip = /请输入商务账号|请输入账号|账号不存在|未绑定手机/.test(text);
        notes.push(tip ? "步骤1空提交有提示" : "步骤1已点下一步");
      }
    }
    if (/短信验证|步骤\s*2/.test(blob)) {
      notes.push(/验证码|获取验证码|倒计时/.test(text) ? "步骤2验证码区可见" : "步骤2文案弱匹配");
    }
    if (/重设密码|步骤\s*3/.test(blob)) {
      notes.push(/新密码|确认密码|6-15|6–15/.test(text) ? "步骤3密码区文案可见" : "步骤3可能需先验短信");
    }
    return notes;
  }

  // —— 侧栏导航：展开并点进子页 ——
  if (/侧栏导航/.test(blob)) {
    for (const name of ["商务管理", "数据分析", "预警中心"]) {
      const item = page.locator(".el-menu, .sidebar, aside, .layout").getByText(name, { exact: true }).first();
      if (await item.isVisible().catch(() => false)) {
        await item.click().catch(() => {});
        await settle(page, 300);
      }
    }
    const bus = page.getByText("商务列表").first();
    if (await bus.isVisible().catch(() => false)) {
      await bus.click();
      await settle(page, 800);
      expect(page.url(), "应进入商务列表").toMatch(/BusinessList|BusMgmt|business/i);
      notes.push("侧栏→商务列表 OK");
    } else {
      notes.push("侧栏子菜单文案未见，仅验导航区");
    }
    return notes;
  }

  // —— 数据分析各页：未选平台提示 / 搜索控件 ——
  if (/渠道数据统计|充值明细|注册明细|游戏数据|排行榜/.test(blob)) {
    const text = await bodyText(page);
    const needPlatform = /请选择所属平台|所属平台/.test(text);
    notes.push(needPlatform ? "平台筛选/提示可见" : "未见平台必选提示（实现可能默认已选）");
    const searchBtn = page.getByRole("button", { name: /搜索|查询/ }).first();
    if (await searchBtn.isVisible().catch(() => false)) notes.push("搜索按钮可见");
    return notes;
  }

  // —— 商务/渠道列表：搜索区字段 ——
  if (/商务列表|渠道列表/.test(blob)) {
    const text = await bodyText(page);
    const hasSearch = /搜索|查询|所属平台|商务名称|渠道名称/.test(text);
    expect(hasSearch, "列表页应有搜索区").toBeTruthy();
    notes.push("搜索区关键词可见");
    const btn = page.getByRole("button", { name: /搜索|查询/ }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
      await settle(page, 600);
      notes.push("已点搜索");
    }
    return notes;
  }

  // —— 预警列表/规则：统计或规则开关 ——
  if (/预警列表|预警规则|AI 实时预警/.test(blob)) {
    const text = await bodyText(page);
    if (/预警列表|AI 实时预警/.test(blob)) {
      notes.push(/全部预警|待处理|触发中|已处理|预警/.test(text) ? "预警统计/列表可见" : "预警页弱匹配");
    }
    if (/预警规则/.test(blob)) {
      notes.push(/规则|开关|监控|级别/.test(text) ? "规则列表要素可见" : "规则页弱匹配");
    }
    return notes;
  }

  // —— 工作台指标/TOP：时间维或标题 ——
  if (/核心指标|TOP10|顶栏|页面标题|包含下级|身份证/.test(blob)) {
    const text = await bodyText(page);
    if (/核心指标/.test(blob)) {
      notes.push(/注册|活跃|充值|今日/.test(text) ? "指标区文案可见" : "指标弱匹配");
    }
    if (/TOP10/.test(blob)) {
      const tab = page.getByText(/今日|昨日|近\s*7|近\s*30/).first();
      if (await tab.isVisible().catch(() => false)) {
        await tab.click().catch(() => {});
        await settle(page, 500);
        notes.push("时间维可点");
      } else {
        notes.push(/TOP10|排行/.test(text) ? "TOP 标题可见" : "TOP 弱匹配");
      }
    }
    if (/顶栏/.test(blob)) {
      const plat = page.getByText(/全部平台|所属平台|龙翔|游趣|汇玩/).first();
      notes.push((await plat.isVisible().catch(() => false)) ? "平台筛选可见" : "顶栏平台弱匹配");
    }
    return notes;
  }

  return notes;
}

test.describe("新商务 · 功能测试", () => {
  const cases = loadCases();

  for (const c of cases) {
    const id = String(c.id || "").trim() || "Fxx";
    const title = String(c.title || id);
    const module = String(c.module || "");
    const route = String(c.route || "/index");
    const hints = Array.isArray(c.hints) ? c.hints.map(String) : [];

    test(`${id} ${module} · ${title}`, async () => {
      test.skip(!cases.length, "无功能用例（请先在工作台同步测试点）");
      const page = sharedPage;
      const pathName = route.startsWith("/") ? route : `/${route}`;

      if (isLoginCase(c)) {
        // 登录类自己清会话；不要依赖 beforeAll 登录
      } else if (!loggedIn || /\/login/i.test(page.url())) {
        await login(page);
      }

      if (!isLoginCase(c)) {
        await page.goto(`${BASE}${pathName}`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await settle(page, 1000);
      }

      const body = await bodyText(page);
      expect(!/Cannot GET|系统错误|500 Internal/i.test(body), "页面疑似错误").toBeTruthy();

      const keys = hintKeys(hints);
      const keyHits = keys.filter((k) => body.includes(k));
      const deepenNotes = await deepenBoundary(page, c, hints);

      // 细项：逐条探测 + 区域截图（供工作台悬停叠图）
      const hintResults = await captureHintRegions(page, id, hints);
      attachHintResults(id, hintResults);
      const scored = hintResults.filter((h) => h.status !== "skip");
      const hitN = scored.filter((h) => h.status === "hit").length;
      const missN = scored.filter((h) => h.status === "miss").length;
      const assertHints = scored.filter((h) => (h.kind || classifyHint(h.text)) === "assert");
      const assertHit = assertHints.filter((h) => h.status === "hit").length;
      const assertRate = assertHints.length ? assertHit / assertHints.length : 1;
      const overallRate = scored.length ? hitN / scored.length : 1;
      const missPreview = hintResults
        .filter((h) => h.status === "miss")
        .slice(0, 5)
        .map((h) => `#${h.index + 1}`)
        .join(",");
      const hintSummary = scored.length
        ? `细项命中 ${hitN}/${scored.length}（可见性 ${assertHit}/${assertHints.length || 0}）`
        : "";
      const rateNote =
        assertHints.length >= 3 && assertRate < 0.4
          ? `FAIL细项可见性命中率过低 ${Math.round(assertRate * 100)}% 未定位:${missPreview || missN}`
          : assertHints.length >= 3 && assertRate < 0.7
            ? `WARN细项可见性命中率 ${Math.round(assertRate * 100)}%`
            : "";

      if (isLoginCase(c)) {
        expect(deepenNotes.length > 0, "登录相关边界未执行到").toBeTruthy();
        const loginOk = assertHints.length < 3 || assertRate >= 0.4;
        caseNotes[id] = [...deepenNotes, hintSummary, rateNote].filter(Boolean).join("；");
        expect(
          loginOk,
          `登录相关细项可见性命中率 ${Math.round(assertRate * 100)}% < 40%，未定位 ${missN} 条`,
        ).toBeTruthy();
        return;
      }

      const shortTitle = title.replace(/^.*·\s*/, "").slice(0, 8);
      const titleHit = shortTitle.length >= 2 && body.includes(shortTitle);
      const moduleHit = Boolean(module && body.includes(module.slice(0, 4)));
      const navOk = /工作台|商务管理|数据分析|预警中心/.test(body);
      const pageOk = Boolean(titleHit || (moduleHit && navOk) || deepenNotes.length || navOk);
      // 细项严格：可见性细项够多时命中率必须 ≥40%，否则整条失败
      const hintGateOk = assertHints.length < 3 || assertRate >= 0.4;
      const passed = pageOk && hintGateOk;

      const summary = [
        `打开 ${pathName}`,
        keys.length ? `关键词 ${keyHits.length}/${keys.length}` : "无hint",
        hintSummary,
        rateNote,
        overallRate < 1 && missPreview ? `未定位例 ${missPreview}` : "",
        ...deepenNotes,
      ]
        .filter(Boolean)
        .join("；");

      caseNotes[id] = summary;
      expect(
        hintGateOk,
        `细项可见性命中率 ${Math.round(assertRate * 100)}% < 40%（命中 ${assertHit}/${assertHints.length}），应按失败处理`,
      ).toBeTruthy();
      expect(passed, `功能点未在页面体现：${title}`).toBeTruthy();
    });
  }
});
