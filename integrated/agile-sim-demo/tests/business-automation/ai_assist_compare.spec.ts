/**
 * AI 辅助验证：登录三级商务工作台，抓取「今日渠道玩家注册」与「环比昨日」。
 * 环境变量：
 *   SMOKE_BASE_URL / PLAYWRIGHT_BASE_URL
 *   AI_ASSIST_L3_USER / AI_ASSIST_L3_PASS
 *   AI_ASSIST_OUT — 结果 JSON 路径
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

const BASE = (process.env.SMOKE_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || "http://sw.example.com").replace(
  /\/$/,
  "",
);
const USER = process.env.AI_ASSIST_L3_USER || "smoke_l3_24874175";
const PASS = process.env.AI_ASSIST_L3_PASS || "111111";
const OUT = process.env.AI_ASSIST_OUT || path.join(process.cwd(), "ai_assist_compare_out.json");

function writeOut(payload: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf-8");
}

async function settleSpa(page: Page, ms = 800) {
  await page.waitForTimeout(ms);
}

async function login(page: Page, username: string, password: string) {
  await page.context().clearCookies();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settleSpa(page, 600);
  // 若已登录落到首页，先找退出再进登录
  const onLogin = await page
    .locator('input[placeholder*="账号"], input[placeholder*="用户"], input[type="text"]')
    .first()
    .isVisible()
    .catch(() => false);
  if (!onLogin) {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await settleSpa(page, 500);
  }
  const userInput = page
    .locator(
      'input[placeholder*="账号"], input[placeholder*="用户名"], input[placeholder*="用户"], input[name="username"], input[type="text"]',
    )
    .first();
  await expect(userInput, "登录页用户名输入框未出现").toBeVisible({ timeout: 20000 });
  await userInput.fill(username);
  const passInput = page.locator('input[type="password"]').first();
  await passInput.fill(password);
  const loginBtn = page.getByRole("button", { name: /登\s*录|登录/ }).first();
  await loginBtn.click();
  await settleSpa(page, 1500);
  await page
    .getByText(/工作台|商务管理|数据分析|渠道列表/)
    .first()
    .waitFor({ timeout: 25000 })
    .catch(() => null);
}

async function openWorkbench(page: Page) {
  const already = await page.getByText(/今日渠道玩家注册|核心指标|今日渠道活跃/).first().isVisible().catch(() => false);
  if (already) return;
  const item = page.locator(".el-menu-item, .menu-item, a, span").filter({ hasText: /^工作台$/ }).first();
  if (await item.isVisible().catch(() => false)) {
    await item.click();
    await settleSpa(page, 1000);
    return;
  }
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settleSpa(page, 1000);
}

function parseMetrics(body: string) {
  const text = String(body || "").replace(/[ \t]+/g, " ");
  let todayReg: number | null = null;
  let momRatio: number | null = null;
  let momRaw = "";

  let m = text.match(/今日渠道玩家注册\s*[：:]?\s*([\d,]+)/);
  if (!m) m = text.match(/今日渠道玩家注册[\s\S]{0,60}?(\d[\d,]*)/);
  if (m) todayReg = Number(String(m[1]).replace(/,/g, ""));

  let m2 = text.match(/环比昨日\s*[：:]?\s*([+\-]?\d+(?:\.\d+)?\s*%?)/);
  if (!m2) m2 = text.match(/环比[^\n%]{0,16}([+\-]?\d+(?:\.\d+)?\s*%)/);
  if (m2) {
    momRaw = m2[1].trim();
    const num = Number(String(momRaw).replace(/[^\d.\-+]/g, ""));
    if (Number.isFinite(num)) {
      momRatio = /%/.test(momRaw) || Math.abs(num) > 1.5 ? num / 100 : num;
    }
  }

  return { todayReg, momRatio, momRaw };
}

test("AI辅助验证 · 抓取三级工作台指标", async ({ page }) => {
  test.setTimeout(120000);
  try {
    await login(page, USER, PASS);
    await openWorkbench(page);
    await settleSpa(page, 1200);
    const bodyText = (await page.locator("body").innerText().catch(() => "")) || "";
    const metrics = parseMetrics(bodyText);
    const ok = metrics.todayReg != null;
    writeOut({
      ok,
      error: ok ? "" : "未解析到「今日渠道玩家注册」",
      baseUrl: BASE,
      user: USER,
      metrics,
      bodyText: bodyText.slice(0, 4000),
      at: new Date().toISOString(),
    });
    expect(ok, "工作台未见「今日渠道玩家注册」").toBeTruthy();
  } catch (e) {
    writeOut({
      ok: false,
      error: String((e as Error)?.message || e),
      baseUrl: BASE,
      user: USER,
      at: new Date().toISOString(),
    });
    throw e;
  }
});
