/**
 * 轻量抓取：登录 L3 工作台，写出今日注册 / 环比 JSON。
 * 环境变量：SMOKE_BASE_URL, AI_ASSIST_L3_USER, AI_ASSIST_L3_PASS, AI_ASSIST_OUT
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = (process.env.SMOKE_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || "http://sw.example.com").replace(
  /\/$/,
  "",
);
const USER = process.env.AI_ASSIST_L3_USER || "smoke_l3_24874175";
const PASS = process.env.AI_ASSIST_L3_PASS || "111111";
const OUT = process.env.AI_ASSIST_OUT || path.join(process.cwd(), "ai_assist_compare_out.json");

function write(payload) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf-8");
}

async function fillLogin(page, username, password) {
  const userInput = page
    .locator(
      'input[placeholder*="用户名"], input[placeholder*="账号"], input[placeholder*="账户"], input[placeholder*="商务"], input[name="username"], input[type="text"]',
    )
    .first();
  const passInput = page.locator('input[type="password"], input[placeholder*="密码"], input[name="password"]').first();
  await userInput.waitFor({ state: "visible", timeout: 20000 });
  await userInput.click({ clickCount: 3 }).catch(() => {});
  await userInput.fill(username);
  await passInput.waitFor({ state: "visible", timeout: 10000 });
  await passInput.click({ force: true }).catch(() => {});
  await page.evaluate(() => {
    document.querySelectorAll('input[type="password"]').forEach((el) => {
      el.removeAttribute("readonly");
      el.readOnly = false;
    });
  });
  await passInput.fill(password);
  const captcha = page.locator('input[placeholder*="验证码"], input[name="code"], #code').first();
  if (await captcha.isVisible().catch(() => false)) {
    await captcha.fill("0000");
  }
  const loginBtn = page.getByRole("button", { name: /登\s*录|登录/ }).first();
  for (let i = 0; i < 25; i++) {
    const disabled = await loginBtn.isDisabled().catch(() => true);
    const loading = await loginBtn.evaluate((el) => el.classList.contains("is-loading")).catch(() => false);
    if (!disabled && !loading) break;
    await page.waitForTimeout(200);
  }
  if (await loginBtn.isEnabled().catch(() => false)) {
    await loginBtn.click({ force: true });
  } else {
    await passInput.press("Enter");
  }
}

const browser = await chromium.launch({ headless: process.env.AI_ASSIST_HEADED !== "1" });
const context = await browser.newContext();
const page = await context.newPage();
page.setDefaultTimeout(30000);

try {
  await context.clearCookies();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });
  await page.goto(`${BASE}/login?_=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(800);

  let loggedIn = false;
  for (let attempt = 0; attempt < 3 && !loggedIn; attempt++) {
    await fillLogin(page, USER, PASS);
    await page.waitForTimeout(2000);
    loggedIn = !/\/login/i.test(page.url());
    if (!loggedIn) {
      const captcha = page.locator('input[placeholder*="验证码"], input[name="code"], #code').first();
      if (await captcha.isVisible().catch(() => false)) {
        await captcha.fill(String(1000 + attempt));
      }
      const loginBtn = page.getByRole("button", { name: /登\s*录|登录/ }).first();
      if (await loginBtn.isEnabled().catch(() => false)) {
        await loginBtn.click({ force: true }).catch(() => {});
      }
      await page.waitForTimeout(2500);
      loggedIn = !/\/login/i.test(page.url());
    }
  }

  if (!loggedIn) {
    const bodyText = (await page.locator("body").innerText().catch(() => "")) || "";
    write({
      ok: false,
      error: "登录失败，仍停在登录页",
      baseUrl: BASE,
      user: USER,
      bodyText: bodyText.slice(0, 2000),
      url: page.url(),
      at: new Date().toISOString(),
    });
    await browser.close();
    process.exit(1);
  }

  await page
    .getByText(/工作台|商务管理|今日渠道|核心指标|数据分析/)
    .first()
    .waitFor({ timeout: 25000 })
    .catch(() => null);
  await page.waitForTimeout(1000);

  let bodyText = (await page.locator("body").innerText().catch(() => "")) || "";
  for (let retry = 0; retry < 3 && !/今日渠道玩家注册/.test(bodyText); retry++) {
    const wb = page.locator(".el-menu-item, .menu-item, a, span").filter({ hasText: /工作台/ }).first();
    if (await wb.isVisible().catch(() => false)) {
      await wb.click();
    }
    const refresh = page.getByText(/^刷新$/).first();
    if (await refresh.isVisible().catch(() => false)) {
      await refresh.click().catch(() => {});
    }
    await page.waitForTimeout(1800);
    bodyText = (await page.locator("body").innerText().catch(() => "")) || "";
  }

  const text = bodyText.replace(/[ \t]+/g, " ");

  function firstNum(...patterns) {
    for (const pat of patterns) {
      const m = text.match(pat);
      if (!m) continue;
      const raw = String(m[1]).replace(/,/g, "");
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  const todayReg = firstNum(/今日渠道玩家注册\s*[：:]?\s*([\d,]+)/, /今日渠道玩家注册[\s\S]{0,60}?(\d[\d,]*)/);
  const yesterdayReg = firstNum(/昨日渠道玩家注册\s*[：:]?\s*([\d,]+)/, /昨日渠道玩家注册[\s\S]{0,60}?(\d[\d,]*)/);
  const todayLogin = firstNum(
    /今日渠道活跃玩家\s*[：:]?\s*([\d,]+)/,
    /今日渠道玩家登录\s*[：:]?\s*([\d,]+)/,
    /今日(?:渠道)?(?:活跃)?(?:玩家)?(?:登录)?\s*[：:]?\s*([\d,]+)/,
  );
  const yesterdayLogin = firstNum(
    /昨日渠道活跃玩家\s*[：:]?\s*([\d,]+)/,
    /昨日渠道玩家登录\s*[：:]?\s*([\d,]+)/,
    /昨日(?:渠道)?(?:活跃)?(?:玩家)?(?:登录)?\s*[：:]?\s*([\d,]+)/,
  );
  let loginMomRatio = null;
  let mLoginMom = text.match(/今日渠道活跃玩家[\s\S]{0,80}?([+\-]?\d+(?:\.\d+)?\s*%)\s*(?:环比|较昨)/);
  if (!mLoginMom) {
    mLoginMom = text.match(/今日渠道玩家登录[\s\S]{0,80}?([+\-]?\d+(?:\.\d+)?\s*%)\s*(?:环比|较昨)/);
  }
  if (!mLoginMom) {
    mLoginMom = text.match(/今日(?:渠道)?(?:活跃|登录)[\s\S]{0,60}?(?:环比昨日|较昨日)\s*[：:]?\s*([+\-]?\d+(?:\.\d+)?\s*%?)/);
  }
  if (mLoginMom) {
    const raw = (mLoginMom[1] || "").trim();
    const num = Number(String(raw).replace(/[^\d.\-+]/g, ""));
    if (Number.isFinite(num)) {
      loginMomRatio = /%/.test(raw) || Math.abs(num) > 1.5 ? num / 100 : num;
    }
  }
  const todayPay = firstNum(/今日(?:渠道玩家)?充值(?:金额)?\s*[：:]?\s*[¥￥]?\s*([\d,.]+)/, /今日充值\s*[：:]?\s*[¥￥]?\s*([\d,.]+)/);
  const yesterdayPay = firstNum(/昨日(?:渠道玩家)?充值(?:金额)?\s*[：:]?\s*[¥￥]?\s*([\d,.]+)/, /昨日充值\s*[：:]?\s*[¥￥]?\s*([\d,.]+)/);
  const monthPay = firstNum(/本月(?:渠道玩家)?充值(?:金额)?\s*[：:]?\s*[¥￥]?\s*([\d,.]+)/, /本月充值\s*[：:]?\s*[¥￥]?\s*([\d,.]+)/);
  const lastMonthPay = firstNum(/上月(?:渠道玩家)?充值(?:金额)?\s*[：:]?\s*[¥￥]?\s*([\d,.]+)/, /上月充值\s*[：:]?\s*[¥￥]?\s*([\d,.]+)/);
  let monthPayMomRatio = null;
  let mMonthMom = text.match(/本月充值金额[\s\S]{0,80}?([+\-]?\d+(?:\.\d+)?\s*%)\s*(?:较上月同期|环比上月|较上月)/);
  if (!mMonthMom) {
    mMonthMom = text.match(/本月(?:渠道玩家)?充值(?:金额)?[\s\S]{0,80}?([+\-]?\d+(?:\.\d+)?\s*%)\s*(?:较上月同期|环比上月|较上月)/);
  }
  if (!mMonthMom) {
    mMonthMom = text.match(/本月(?:渠道玩家)?充值(?:金额)?[\s\S]{0,60}?(?:较上月同期|环比上月|较上月)\s*[：:]?\s*([+\-]?\d+(?:\.\d+)?\s*%?)/);
  }
  if (mMonthMom) {
    const raw = (mMonthMom[1] || "").trim();
    const num = Number(String(raw).replace(/[^\d.\-+]/g, ""));
    if (Number.isFinite(num)) {
      monthPayMomRatio = /%/.test(raw) || Math.abs(num) > 1.5 ? num / 100 : num;
    }
  }
  let payMomRatio = null;
  let mPayMom = text.match(/今日充值金额[\s\S]{0,80}?([+\-]?\d+(?:\.\d+)?\s*%)\s*(?:环比|较昨)/);
  if (!mPayMom) {
    mPayMom = text.match(/今日(?:渠道玩家)?充值(?:金额)?[\s\S]{0,80}?([+\-]?\d+(?:\.\d+)?\s*%)\s*(?:环比|较昨)/);
  }
  if (!mPayMom) {
    mPayMom = text.match(/今日(?:渠道玩家)?充值(?:金额)?[\s\S]{0,60}?(?:环比昨日|较昨日)\s*[：:]?\s*([+\-]?\d+(?:\.\d+)?\s*%?)/);
  }
  if (mPayMom) {
    const raw = (mPayMom[1] || "").trim();
    const num = Number(String(raw).replace(/[^\d.\-+]/g, ""));
    if (Number.isFinite(num)) {
      payMomRatio = /%/.test(raw) || Math.abs(num) > 1.5 ? num / 100 : num;
    }
  }

  const todayActiveChannels = firstNum(/活跃渠道数\s*[：:]?\s*([\d,]+)/, /今日活跃渠道(?:数)?\s*[：:]?\s*([\d,]+)/);
  let activeChannelDelta = null;
  let mAcDelta = text.match(/活跃渠道数[\s\S]{0,60}?([+\-]?\d+)\s*较昨/);
  if (!mAcDelta) {
    mAcDelta = text.match(/活跃渠道数[\s\S]{0,40}?([+\-]?\d+)\s*(?:环比昨日|较昨日)/);
  }
  if (mAcDelta) {
    const num = Number(String(mAcDelta[1] || "").replace(/[^\d.\-+]/g, ""));
    if (Number.isFinite(num)) activeChannelDelta = num;
  }

  let momRatio = null;
  let momRaw = "";
  let m2 = text.match(/(?:环比昨日|较昨日)\s*[：:]?\s*([+\-]?\d+(?:\.\d+)?\s*%?)/);
  if (!m2) m2 = text.match(/([+\-]?\d+(?:\.\d+)?\s*%)\s*(?:环比昨日|较昨日)/);
  if (!m2) m2 = text.match(/(?:环比|较昨)[^\n%]{0,16}([+\-]?\d+(?:\.\d+)?\s*%)/);
  if (!m2) {
    const near = text.match(/今日渠道玩家注册[\s\S]{0,80}?([+\-]?\d+(?:\.\d+)?\s*%)\s*(?:环比|较昨)/);
    if (near) m2 = near;
  }
  if (m2) {
    momRaw = (m2[1] || "").trim();
    const num = Number(String(momRaw).replace(/[^\d.\-+]/g, ""));
    if (Number.isFinite(num)) {
      momRatio = /%/.test(momRaw) || Math.abs(num) > 1.5 ? num / 100 : num;
    }
  }

  const ok = todayReg != null;
  write({
    ok,
    error: ok ? "" : "未解析到「今日渠道玩家注册」",
    baseUrl: BASE,
    user: USER,
    metrics: {
      todayReg,
      yesterdayReg,
      momRatio,
      momRaw,
      todayLogin,
      yesterdayLogin,
      loginMomRatio,
      todayPay,
      yesterdayPay,
      payMomRatio,
      monthPay,
      lastMonthPay,
      monthPayMomRatio,
      todayActiveChannels,
      activeChannelDelta,
    },
    bodyText: bodyText.slice(0, 4000),
    url: page.url(),
    at: new Date().toISOString(),
  });
  await browser.close();
  process.exit(ok ? 0 : 2);
} catch (e) {
  write({
    ok: false,
    error: String(e && e.message ? e.message : e),
    baseUrl: BASE,
    user: USER,
    at: new Date().toISOString(),
  });
  try {
    await browser.close();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
}
