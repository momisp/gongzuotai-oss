import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  caseIdFromTitle,
  finishSmokeCase,
  markCaseStatus,
  recordSmokeAccount,
} from "./smoke_progress";

/**
 * 新商务业务冒烟 S1–S18
 * 创建商务走页面；S8/S9 走工作台 OA 审核接口；S10–S11 工作台指标；
 * S12–S15 数据分析；S16–S18 预警中心（列表 / 规则落库 / 处理或空态跳转）。
 */

const BASE = (process.env.SMOKE_BASE_URL || "http://sw.example.com").replace(/\/$/, "");
const WORKBENCH = (process.env.SMOKE_WORKBENCH_URL || "http://127.0.0.1:8765").replace(/\/$/, "");
const ADMIN_USER = process.env.SMOKE_ADMIN_USER || "admin";
const ADMIN_PASS = process.env.SMOKE_ADMIN_PASS || "admin123";
const SEED_L1_USER = process.env.SMOKE_L1_USER || "";
const SEED_L1_PASS = process.env.SMOKE_L1_PASS || "111111";
const SEED_L2_USER = process.env.SMOKE_L2_USER || "";
const SEED_L2_PASS = process.env.SMOKE_L2_PASS || "111111";
const SEED_L3_USER = process.env.SMOKE_L3_USER || "";
const SEED_L3_PASS = process.env.SMOKE_L3_PASS || "111111";
const SDK_USER = process.env.SMOKE_SDK_USER || "龙翔一级商务";
const SDK_PASS = process.env.SMOKE_SDK_PASS || "111111";
/** 驳回路径用的第二套游戏商务账号；未配则 S9 尝试复用/跳过 */
const SDK_USER_2 = (process.env.SMOKE_SDK_USER_2 || "").trim();
const SDK_PASS_2 = process.env.SMOKE_SDK_PASS_2 || SDK_PASS;
const SDK_SOURCE_DB = (process.env.SMOKE_SDK_SOURCE_DB || "lx").trim().toLowerCase();
const ENABLE_SDK = String(process.env.SMOKE_ENABLE_SDK || "1").trim() !== "0";
const ENABLE_OA_AUDIT = String(process.env.SMOKE_OA_AUDIT_ENABLED || "1").trim() !== "0";
const ENABLE_DATA_METRICS = String(process.env.SMOKE_DATA_METRICS_ENABLED || "0").trim() === "1";
/** 主流程造数后：工作台指标需出现非 0 数字 */
const EXPECT_NONEMPTY_METRICS = String(process.env.SMOKE_EXPECT_NONEMPTY_METRICS || "0").trim() === "1";

const chain = {
  l1User: SEED_L1_USER,
  l1Pass: SEED_L1_PASS,
  l2User: SEED_L2_USER,
  l2Pass: SEED_L2_PASS,
  l3User: SEED_L3_USER,
  l3Pass: SEED_L3_PASS,
};

const caseNotes: Record<string, string> = {};
let currentLoginUser = "";
let sharedPage: Page;
let sharedContext: import("@playwright/test").BrowserContext;

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

test.beforeAll(async ({ browser }) => {
  // 大窗口演示：用明确 viewport，避免 null viewport 与 deviceScaleFactor 冲突秒失败
  sharedContext = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    locale: "zh-CN",
  });
  sharedPage = await sharedContext.newPage();
  try {
    await Promise.race([
      (async () => {
        const session = await sharedContext.newCDPSession(sharedPage);
        const { windowId } = await session.send("Browser.getWindowForTarget");
        await session.send("Browser.setWindowBounds", {
          windowId,
          bounds: { windowState: "maximized" },
        });
      })(),
      sharedPage.waitForTimeout(2500),
    ]);
  } catch {
    /* 无头或非 Chromium 时忽略 */
  }
});

test.afterAll(async () => {
  await sharedPage?.close().catch(() => {});
  await sharedContext?.close().catch(() => {});
});

test.beforeEach(async ({}, testInfo) => {
  markCaseStatus(caseIdFromTitle(testInfo.title), "running", { title: testInfo.title });
});

test.afterEach(async ({}, testInfo) => {
  const id = caseIdFromTitle(testInfo.title);
  await finishSmokeCase(sharedPage, testInfo, caseNotes[id] || "");
});

function uniqName(prefix: string) {
  return `${prefix}_${Date.now().toString().slice(-8)}`;
}

async function settleSpa(page: Page, extraMs = 800) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
  if (extraMs > 0) await page.waitForTimeout(extraMs);
}

async function waitForAnyText(page: Page, pattern: RegExp, timeout = 35000, label = "页面关键文案") {
  const loc = page.getByText(pattern).first();
  await expect(loc, `${label}未出现：${pattern}`).toBeVisible({ timeout });
  return loc;
}

function sidebarScope(page: Page): Locator {
  return page.locator(".sidebar-container, .el-aside, #sidebar, .layout-menu, .menu-wrapper, .left-menu").first();
}

/** 优先点侧栏菜单（SPA 内切换，不整页刷新）；失败再软跳路由，尽量不 reload */
async function openByMenu(
  page: Page,
  opts: {
    item: string | RegExp;
    parent?: string | RegExp;
    ready: RegExp;
    fallbackPath?: string;
    label?: string;
  },
) {
  const label = opts.label || String(opts.item);
  const side = sidebarScope(page);
  const hasSide = (await side.count().catch(() => 0)) > 0 && (await side.isVisible().catch(() => false));
  const scope: Page | Locator = hasSide ? side : page;

  if (opts.parent) {
    const parentTitle = scope
      .locator(".el-sub-menu__title, .el-menu-item, .menu-title, .submenu-title, span")
      .filter({ hasText: opts.parent })
      .first();
    if (await parentTitle.isVisible().catch(() => false)) {
      const sub = scope.locator(".el-sub-menu").filter({ hasText: opts.parent }).first();
      const opened = await sub
        .evaluate((el) => el.classList.contains("is-opened") || el.classList.contains("is-active"))
        .catch(() => false);
      if (!opened) {
        await parentTitle.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(350);
      }
    }
  }

  const menuCandidates = [
    scope.locator(".el-menu-item").filter({ hasText: opts.item }).first(),
    scope.getByRole("menuitem", { name: opts.item }).first(),
    scope.locator("a, span").filter({ hasText: opts.item }).first(),
  ];
  let clicked = false;
  for (const menuItem of menuCandidates) {
    if (!(await menuItem.isVisible().catch(() => false))) continue;
    clicked = await menuItem
      .click({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (clicked) break;
  }

  if (clicked) {
    await settleSpa(page, 1000);
    const ok = await page.getByText(opts.ready).first().isVisible({ timeout: 12000 }).catch(() => false);
    if (ok) return;
  }

  // 次选：点带路由的链接（仍是前端路由，一般不整页刷）
  if (opts.fallbackPath) {
    const path = opts.fallbackPath.startsWith("/") ? opts.fallbackPath : `/${opts.fallbackPath}`;
    const link = page.locator(`a[href*="${path}"], a[href*="${path.replace(/^\//, "")}"]`).first();
    if (await link.isVisible().catch(() => false)) {
      await link.click().catch(() => {});
      await settleSpa(page, 1000);
      const ok = await page.getByText(opts.ready).first().isVisible({ timeout: 12000 }).catch(() => false);
      if (ok) return;
    }
    // 最后才硬跳（仅兜底）
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await settleSpa(page, 1500);
  }

  await waitForAnyText(page, opts.ready, 35000, label);
}

async function clearAuthOnce(page: Page) {
  // 必须清 cookie，否则 SPA 会带着旧会话直接回工作台，登录框找不到
  await page.context().clearCookies().catch(() => {});
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });
  // 清完存储再进一次登录页，避免仍停在已登录态
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settleSpa(page, 800);
  currentLoginUser = "";
}

async function findLoginInputs(page: Page) {
  const userInput = page
    .locator(
      [
        'input[placeholder*="用户名"]',
        'input[placeholder*="账号"]',
        'input[placeholder*="账户"]',
        'input[name="username"]',
        'input[name="account"]',
        "#username",
        'input[type="text"]',
      ].join(", "),
    )
    .or(page.getByRole("textbox", { name: /用户名|账号|账户/ }))
    .or(page.getByPlaceholder(/用户名|账号|账户|请输入/))
    .first();
  const passInput = page
    .locator('input[type="password"], input[placeholder*="密码"], input[name="password"], #password')
    .or(page.getByPlaceholder(/密码/))
    .or(page.getByLabel(/密码/))
    .first();
  return { userInput, passInput };
}

async function login(page: Page, username: string, password: string) {
  // 同一账号已登录则不重登，避免有头演示时来回刷登录页
  if (currentLoginUser === username && !/\/login/i.test(page.url())) {
    const stillIn = await page
      .getByText(/工作台|商务管理|商务列表|数据分析|渠道列表/)
      .first()
      .isVisible()
      .catch(() => false);
    if (stillIn) {
      await settleSpa(page, 400);
      return;
    }
  }

  await clearAuthOnce(page);

  // 若清 cookie 后仍被踢回首页，再强制回登录页
  for (let i = 0; i < 2; i++) {
    const { userInput } = await findLoginInputs(page);
    const onLogin =
      /\/login/i.test(page.url()) ||
      (await userInput.isVisible().catch(() => false)) ||
      (await page.getByRole("button", { name: /登\s*录/ }).isVisible().catch(() => false));
    if (onLogin && (await userInput.isVisible().catch(() => false))) break;
    await page.context().clearCookies().catch(() => {});
    await page.goto(`${BASE}/login?_=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await settleSpa(page, 1000);
  }

  const { userInput, passInput } = await findLoginInputs(page);
  await expect(userInput, "登录页用户名/账号输入框未出现（可能仍停留在旧会话工作台）").toBeVisible({
    timeout: 30000,
  });
  await userInput.click({ clickCount: 3 }).catch(() => {});
  await userInput.fill(username);
  await expect(passInput, "登录页密码输入框未出现").toBeVisible({ timeout: 10000 });
  await passInput.fill(password);

  // 后端 captchaEnabled=false，但前端仍可能渲染验证码框并做必填校验（图裂）
  const captcha = page
    .locator('input[placeholder*="验证码"], input[name="code"], #code')
    .or(page.getByPlaceholder(/验证码/))
    .or(page.getByLabel(/验证码/))
    .first();
  if (await captcha.isVisible().catch(() => false)) {
    await captcha.fill("0000");
  }

  await page.getByRole("button", { name: /登\s*录/ }).click();

  // 若仍停在登录页，再试一次：点验证码图刷新后填码重登
  const stillLogin = await page.waitForURL((u) => !/\/login/i.test(u.toString()), { timeout: 12000 }).then(() => false).catch(() => true);
  if (stillLogin) {
    const captchaImg = page.locator(".login-code img, .el-image img, img[src*='data:image'], .captcha img").first();
    if (await captchaImg.isVisible().catch(() => false)) {
      await captchaImg.click().catch(() => {});
      await page.waitForTimeout(500);
    }
    if (await captcha.isVisible().catch(() => false)) {
      await captcha.fill("1234");
    }
    await page.getByRole("button", { name: /登\s*录/ }).click();
  }

  await expect(page).not.toHaveURL(/\/login/i, { timeout: 35000 });
  await settleSpa(page, 1200);
  currentLoginUser = username;
}

async function openWorkbench(page: Page) {
  // 登录后通常已在首页；优先点侧栏「工作台」，不要再 goto /
  const already = await page.getByText(/工作台|商务管理|数据分析/).first().isVisible().catch(() => false);
  if (already) {
    await settleSpa(page, 500);
    return;
  }
  await openByMenu(page, {
    item: /工作台/,
    ready: /工作台|商务管理|数据分析|商务列表/,
    fallbackPath: "/",
    label: "工作台",
  });
}

async function openBusinessList(page: Page) {
  await openByMenu(page, {
    parent: /商务管理|业务管理/,
    item: /商务列表/,
    // 勿用「商务列表」做 ready：侧栏也有同文案，会误判仍停在工作台
    ready: /商务名称|全部等级|添加子商务|绑定列表|旗下渠道|子商务账号/,
    fallbackPath: "/BusMgmt/BusinessList",
    label: "商务列表",
  });
  const mainOk =
    (await page.locator(".el-tabs__item").filter({ hasText: /绑定列表/ }).first().isVisible().catch(() => false)) ||
    (await page.getByPlaceholder(/商务名称|商务账号|请输入/).first().isVisible().catch(() => false)) ||
    (await page.getByRole("button", { name: /搜索|新增|添加/ }).first().isVisible().catch(() => false));
  if (!mainOk) {
    await page.goto(`${BASE}/BusMgmt/BusinessList`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await settleSpa(page, 1200);
  }
}

async function openChannelList(page: Page) {
  await openByMenu(page, {
    parent: /商务管理|业务管理|渠道管理/,
    item: /渠道列表/,
    // 勿仅用「渠道列表」：侧栏同文案会误判
    ready: /渠道名称|渠道编号|添加渠道|所属平台|渠道账号/,
    fallbackPath: "/BusMgmt/ChannelList",
    label: "渠道列表",
  });
  const mainOk =
    (await page.getByPlaceholder(/渠道|请输入/).first().isVisible().catch(() => false)) ||
    (await page.getByRole("button", { name: /搜索|新增|添加/ }).first().isVisible().catch(() => false)) ||
    (await page.getByText(/暂无数据|渠道名称|渠道编号/).first().isVisible().catch(() => false));
  if (!mainOk) {
    await page.goto(`${BASE}/BusMgmt/ChannelList`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await settleSpa(page, 1200);
  }
}

/** 侧栏子页：ready 用主区文案，避免侧栏同名误判 */
async function openSidebarChildPage(
  page: Page,
  opts: {
    parent: RegExp;
    item: RegExp;
    fallbackPath: string;
    ready: RegExp;
    label: string;
  },
) {
  await openByMenu(page, {
    parent: opts.parent,
    item: opts.item,
    ready: opts.ready,
    fallbackPath: opts.fallbackPath,
    label: opts.label,
  });
  const mainOk = await page.getByText(opts.ready).first().isVisible({ timeout: 8000 }).catch(() => false);
  if (!mainOk) {
    await page.goto(`${BASE}${opts.fallbackPath}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await settleSpa(page, 1200);
  }
  await waitForAnyText(page, opts.ready, 35000, opts.label);
}

async function openDataAnalysisPage(
  page: Page,
  opts: { item: RegExp; fallbackPath: string; ready: RegExp; label: string },
) {
  await openSidebarChildPage(page, { parent: /数据分析/, ...opts });
}

async function openAlertCenterPage(
  page: Page,
  opts: { item: RegExp; fallbackPath: string; ready: RegExp; label: string },
) {
  await openSidebarChildPage(page, { parent: /预警中心/, ...opts });
}

async function clickSearchOrQuery(page: Page) {
  const btn = page
    .getByRole("button", { name: /搜\s*索|查\s*询/ })
    .or(page.locator("button").filter({ hasText: /搜\s*索|查\s*询/ }))
    .first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click().catch(() => {});
    await settleSpa(page, 1000);
  }
}

/** 顶栏「包含下级渠道数据」轻点一次（对照测试点全局开关）；失败不阻断 */
async function toggleIncludeSubChannels(page: Page) {
  const sw = page.getByText(/包含下级渠道数据/).first();
  if (!(await sw.isVisible().catch(() => false))) return false;
  await sw.click().catch(() => {});
  await settleSpa(page, 800);
  return true;
}

async function assertDataPageAlive(page: Page, label: string, cues: RegExp) {
  const body = ((await page.locator("body").innerText().catch(() => "")) || "").replace(/\s+/g, " ");
  expect(cues.test(body), `${label}页关键文案未出现`).toBeTruthy();
  expect(!/500|系统错误|页面不存在|Cannot GET/i.test(body), `${label}页疑似错误页`).toBeTruthy();
  return body;
}

function activeDialog(page: Page, textFilter: RegExp = /添加子商务|新增|添加/) {
  return page
    .locator(".el-drawer:visible, .el-dialog:visible, [role='dialog']:visible")
    .filter({ hasText: textFilter })
    .last();
}

function activeBindDialog(page: Page) {
  // S7 弹窗标题是「绑定游戏商务」，不能复用「添加子商务」过滤
  return page
    .locator(".el-drawer:visible, .el-dialog:visible, [role='dialog']:visible")
    .filter({ hasText: /绑定游戏商务|绑定SDK|绑定.?商务|游戏商务账号/ })
    .last();
}

async function fillFormItem(dialog: Locator, label: RegExp, value: string) {
  const item = dialog.locator(".el-form-item, .form-item, .el-row").filter({ hasText: label }).first();
  await expect(item, `表单项不可见: ${label}`).toBeVisible({ timeout: 10000 });
  const input = item.locator("input:not([type='hidden']), textarea").first();
  await expect(input, `输入框不可见: ${label}`).toBeVisible({ timeout: 5000 });
  await input.click({ clickCount: 3 }).catch(() => {});
  await input.fill(value);
}

async function tryFillFormItem(dialog: Locator, label: RegExp, value: string) {
  const item = dialog.locator(".el-form-item, .form-item, .el-row").filter({ hasText: label }).first();
  if (!(await item.isVisible().catch(() => false))) return false;
  const input = item.locator("input:not([type='hidden']), textarea").first();
  if (!(await input.isVisible().catch(() => false))) return false;
  await input.click({ clickCount: 3 }).catch(() => {});
  await input.fill(value);
  return true;
}

async function selectRoleIfPresent(page: Page, dialog: Locator, roleName: string) {
  const item = dialog.locator(".el-form-item").filter({ hasText: /角色/ }).first();
  if (!(await item.isVisible().catch(() => false))) return;
  const select = item.locator(".el-select, .el-select__wrapper").first();
  await select.click();
  const option = page
    .locator(
      ".el-select-dropdown:visible .el-option, .el-popper:visible .el-select-dropdown__item, .el-select__popper:visible .el-option",
    )
    .filter({ hasText: roleName })
    .first();
  if (await option.isVisible().catch(() => false)) {
    await option.click();
    return;
  }
  await page.keyboard.press("Escape").catch(() => {});
}

async function clickAddBusiness(page: Page) {
  const btn = page.getByRole("button", { name: /添加子商务|新增商务|新\s*增|添\s*加/ }).first();
  await expect(btn, "未找到新增/添加子商务按钮").toBeVisible({ timeout: 15000 });
  await btn.click();
  const dialog = activeDialog(page);
  await expect(dialog, "添加子商务抽屉/弹窗未出现").toBeVisible({ timeout: 10000 });
  return dialog;
}

async function submitDialog(page: Page, dialog: Locator) {
  const confirm = dialog.getByRole("button", { name: /确认添加|确\s*定|保\s*存|提\s*交/ }).first();
  await expect(confirm, "未找到确认添加按钮").toBeVisible({ timeout: 8000 });
  await confirm.click();
  // 若仍有校验错误，不要空等太久
  const nameErr = dialog.getByText(/请输入姓名/).first();
  if (await nameErr.isVisible().catch(() => false)) {
    throw new Error("提交失败：姓名未填（请输入姓名）");
  }
  const toastOk = await page
    .getByText(/成功|操作成功|新增成功|创建成功|添加成功/)
    .first()
    .waitFor({ timeout: 12000 })
    .then(() => true)
    .catch(() => false);
  const closed = await dialog
    .waitFor({ state: "hidden", timeout: 12000 })
    .then(() => true)
    .catch(() => false);
  expect(toastOk || closed, "提交后未见成功提示，抽屉也未关闭").toBeTruthy();
  await page.waitForTimeout(500);
}

async function assertUserVisibleInList(page: Page, userName: string) {
  // 创建后通常已在商务列表，避免再点菜单造成多余切换
  const onList = await page
    .getByText(/商务列表|子商务账号|添加子商务|商务账号/)
    .first()
    .isVisible()
    .catch(() => false);
  if (!onList) await openBusinessList(page);
  const namedSearch = page
    .getByPlaceholder(/子商务账号|用户名称|用户账号|商务账号|登录账号|请输入/)
    .first();
  if (await namedSearch.isVisible().catch(() => false)) {
    await namedSearch.fill(userName);
    const searchBtn = page.getByRole("button", { name: /搜\s*索|查\s*询/ }).first();
    if (await searchBtn.isVisible().catch(() => false)) await searchBtn.click();
    await page.waitForTimeout(900);
  }
  await expect(page.getByText(userName).first(), `列表未出现账号 ${userName}`).toBeVisible({
    timeout: 15000,
  });
}

async function createBusinessOnPage(
  page: Page,
  opts: {
    userName: string;
    nickName: string;
    password?: string;
    roleName?: string;
    remark?: string;
    phone?: string;
  },
) {
  await openBusinessList(page);
  const dialog = await clickAddBusiness(page);

  // 实际表单：子商务账号 / 登录密码 / 姓名 / 联系电话 / QQ号 / 确认添加
  const accountOk = await tryFillFormItem(
    dialog,
    /子商务账号|用户名称|用户账号|登录账号|商务账号/,
    opts.userName,
  );
  if (!accountOk) {
    await dialog.locator("input:not([type='hidden']):not([type='password'])").first().fill(opts.userName);
  }

  await tryFillFormItem(dialog, /登录密码|密码/, opts.password || "111111");

  // 姓名为必填（当前卡点）
  const nameOk = await tryFillFormItem(dialog, /^姓名$|真实姓名|用户昵称|昵称/, opts.nickName);
  if (!nameOk) {
    // 再按 placeholder 兜底
    const byPh = dialog.getByPlaceholder(/姓名|请输入姓名/).first();
    if (await byPh.isVisible().catch(() => false)) {
      await byPh.fill(opts.nickName);
    } else {
      throw new Error("未找到「姓名」输入框，无法提交添加子商务");
    }
  }

  if (opts.phone) {
    await tryFillFormItem(dialog, /联系电话|手机号|手机号码/, opts.phone);
  }

  // 该抽屉通常无「角色」下拉，等级由当前登录账号决定；有角色项才尝试选择
  if (opts.roleName) {
    await selectRoleIfPresent(page, dialog, opts.roleName);
  }
  if (opts.remark) {
    await tryFillFormItem(dialog, /备注/, opts.remark);
  }

  await submitDialog(page, dialog);
  await assertUserVisibleInList(page, opts.userName);
}

test.describe("新商务 · 业务冒烟", () => {
  test("S1 超管：工作台 / 商务列表 / 渠道列表", async () => {
    const page = sharedPage;
    await login(page, ADMIN_USER, ADMIN_PASS);
    await openWorkbench(page);
    await openBusinessList(page);
    await openChannelList(page);
    caseNotes.S1 = "侧栏进入工作台/商务列表/渠道列表";
  });

  test("S2 超管：新增一级商务", async () => {
    const page = sharedPage;
    await login(page, ADMIN_USER, ADMIN_PASS);
    const uname = uniqName("smoke_l1");
    await createBusinessOnPage(page, {
      userName: uname,
      nickName: `冒烟一级${uname.slice(-4)}`,
      password: "111111",
      remark: "smoke-ui-l1",
    });
    chain.l1User = uname;
    chain.l1Pass = "111111";
    recordSmokeAccount({ level: "一级", username: uname, password: "111111", note: "超管页面创建" });
    caseNotes.S2 = `页面已建 ${uname}（角色走页面选择/默认）`;
  });

  test("S3 一级：登录并查看工作台", async () => {
    const page = sharedPage;
    const user = chain.l1User || SEED_L1_USER;
    test.skip(!user, "无一级账号可测");
    await login(page, user, chain.l1Pass || SEED_L1_PASS);
    await openWorkbench(page);
    caseNotes.S3 = "一级可登录，页面可见业务入口";
  });

  test("S4 一级：新增二级商务", async () => {
    const page = sharedPage;
    const user = chain.l1User || SEED_L1_USER;
    test.skip(!user, "无一级账号可测");
    await login(page, user, chain.l1Pass || SEED_L1_PASS);
    const uname = uniqName("smoke_l2");
    await createBusinessOnPage(page, {
      userName: uname,
      nickName: `冒烟二级${uname.slice(-4)}`,
      password: "111111",
      remark: "smoke-ui-l2",
    });
    chain.l2User = uname;
    recordSmokeAccount({ level: "二级", username: uname, password: "111111", note: "一级页面自建" });
    caseNotes.S4 = `页面已建 ${uname}（角色用页面默认）`;
  });

  test("S5 二级：新增三级商务", async () => {
    const page = sharedPage;
    test.skip(!chain.l2User, "无二级账号可测");
    await login(page, chain.l2User, chain.l2Pass);
    const uname = uniqName("smoke_l3");
    await createBusinessOnPage(page, {
      userName: uname,
      nickName: `冒烟三级${uname.slice(-4)}`,
      password: "111111",
      remark: "smoke-ui-l3",
    });
    chain.l3User = uname;
    recordSmokeAccount({ level: "三级", username: uname, password: "111111", note: "二级页面自建" });
    caseNotes.S5 = `页面已建 ${uname}（角色用页面默认）`;
  });

  test("S6 三级：登录", async () => {
    const page = sharedPage;
    const user = chain.l3User || SEED_L3_USER;
    const pass = chain.l3Pass || SEED_L3_PASS;
    test.skip(!user, "无三级账号可测");
    await login(page, user, pass);
    chain.l3User = user;
    chain.l3Pass = pass;
    await openWorkbench(page);
    const text = (await page.locator("body").innerText().catch(() => "")) || "";
    const is404 = /404|页面不存在|找不到/.test(text);
    const hasBiz = /工作台|商务管理|商务列表|数据分析|绑定/.test(text);
    if (is404 && !hasBiz) {
      caseNotes.S6 = "能登录，但首页疑似 404/空路由";
      expect(false, "三级登录后首页 404 或无业务入口").toBeTruthy();
    } else {
      expect(hasBiz, "三级登录后未见业务入口").toBeTruthy();
      caseNotes.S6 = "三级可登录，页面有内容";
    }
  });

async function callOaAudit(body: Record<string, unknown>) {
  const res = await fetch(`${WORKBENCH}/api/smoke/oa/audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: true, ...body }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { httpStatus: res.status, ...data };
}

async function openBindListTab(page: Page) {
  await openBusinessList(page);
  await settleSpa(page, 600);

  const tab = page
    .locator(".el-tabs__item")
    .filter({ hasText: /绑定列表/ })
    .or(page.getByRole("tab", { name: /绑定列表/ }))
    .first();
  await expect(tab, "商务列表页未见「绑定列表」页签").toBeVisible({ timeout: 15000 });
  await tab.click({ force: true });
  await page.waitForTimeout(1000);
  await settleSpa(page, 800);

  const bindBtnVisible = await page
    .getByRole("button", { name: /绑定/ })
    .or(page.locator("button").filter({ hasText: /绑定/ }))
    .first()
    .isVisible()
    .catch(() => false);
  if (!bindBtnVisible) {
    await tab.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1200);
  }
}

async function submitSdkBind(page: Page, sdkUser: string, sdkPass: string) {
  await openBindListTab(page);
  const bindBtn = page
    .getByRole("button", { name: /绑定sdk商务|绑定SDK商务|绑定SDK|绑定游戏商务|发起绑定|绑定商务/i })
    .or(page.locator("button").filter({ hasText: /绑定\s*SDK|绑定游戏商务|绑定商务/i }))
    .first();
  await expect(bindBtn, "未找到「绑定 SDK 商务」按钮（请确认已在绑定列表页签）").toBeVisible({ timeout: 20000 });
  await bindBtn.click();
  await page.waitForTimeout(600);
  const dialog = activeBindDialog(page);
  await expect(dialog, "绑定弹窗/抽屉未出现").toBeVisible({ timeout: 15000 });
  await selectBindPlatform(page, dialog);

  const accountOk = await tryFillFormItem(dialog, /游戏商务账号|商务账号|平台账号|账号|账户/, sdkUser);
  if (!accountOk) {
    const byPh = dialog.getByPlaceholder(/账号|账户|请输入/).first();
    await expect(byPh, "未找到游戏商务账号输入框").toBeVisible({ timeout: 8000 });
    await byPh.fill(sdkUser);
  }
  const passOk = await tryFillFormItem(dialog, /密码|登录密码/, sdkPass);
  if (!passOk) {
    const pwd = dialog.locator("input[type='password']").first();
    await expect(pwd, "未找到密码输入框").toBeVisible({ timeout: 8000 });
    await pwd.fill(sdkPass);
  }

  const confirm = dialog
    .getByRole("button", { name: /校验并绑定|确认添加|确认绑定|确\s*定|提\s*交|保\s*存/ })
    .first();
  await expect(confirm, "未找到「校验并绑定」按钮").toBeVisible({ timeout: 8000 });
  await confirm.click();

  const toastOk = await page
    .getByText(/成功|已提交|待审核|等待.?OA|操作成功|绑定成功|校验成功/)
    .first()
    .waitFor({ timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  const closed = await dialog
    .waitFor({ state: "hidden", timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  const listed = await page
    .getByText(sdkUser)
    .first()
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  expect(toastOk || closed || listed, "SDK 绑定提交后未见成功提示/列表记录").toBeTruthy();
}

async function assertWorkbenchMetricsVisible(page: Page, roleLabel: string) {
  await openWorkbench(page);
  await settleSpa(page, 1000);
  const bodyText = (await page.locator("body").innerText().catch(() => "")) || "";
  // 对照测试点：核心指标卡文案（注册/活跃/充值）或数字看板
  const hasMetricLabel =
    /今日.?注册|今日.?活跃|今日.?充值|本月.?充值|渠道玩家|核心指标|注册|活跃|充值/.test(bodyText);
  const hasNumber = /\d{1,3}(?:,\d{3})+|\d+\.\d{2}|\d{2,}/.test(bodyText);
  expect(hasMetricLabel || hasNumber, `${roleLabel}工作台未见指标卡/数据`).toBeTruthy();
  if (EXPECT_NONEMPTY_METRICS) {
    // 主流程造数后：至少有一个业务指标不是纯 0（兼容 ¥0 / 0.0% 环比噪音）
    const nonzero =
      /今日渠道玩家注册[\s\S]{0,80}[1-9]\d*/.test(bodyText) ||
      /今日渠道活跃玩家[\s\S]{0,80}[1-9]\d*/.test(bodyText) ||
      /今日充值金额[\s\S]{0,80}[1-9]/.test(bodyText) ||
      /本月充值金额[\s\S]{0,80}[1-9]/.test(bodyText) ||
      /(?<![\d.])([1-9]\d{0,2}(?:,\d{3})*|[1-9]\d*)(?:\.\d+)?(?!\d)/.test(
        bodyText.replace(/0\.0%/g, "").replace(/环比[^\n]*/g, ""),
      );
    // 更稳：在指标卡片区域内找非零
    const cards = page.locator(".el-card, .metric, .stat, [class*='card'], [class*='metric']");
    const cardCount = await cards.count().catch(() => 0);
    let cardHit = false;
    for (let i = 0; i < Math.min(cardCount, 12); i++) {
      const t = (await cards.nth(i).innerText().catch(() => "")) || "";
      if (/[1-9]/.test(t.replace(/0\.0%/g, "").replace(/环比[^\n]*/g, ""))) {
        cardHit = true;
        break;
      }
    }
    expect(
      nonzero || cardHit,
      `${roleLabel}工作台指标仍全为 0（已开 SMOKE_EXPECT_NONEMPTY_METRICS，请确认绑定商务下有今日造数）`,
    ).toBeTruthy();
  }
  // 侧栏业务入口仍在
  const hasBiz = /工作台|商务管理|商务列表|数据分析|渠道列表/.test(bodyText);
  expect(hasBiz, `${roleLabel}登录后未见业务入口`).toBeTruthy();
}

async function selectBindPlatform(page: Page, dialog: Locator) {
  // 图一：所属平台下拉 → 选「龙翔」（必选，否则校验并绑定会失败）
  const platformLabel = SDK_SOURCE_DB === "lx" ? "龙翔" : SDK_SOURCE_DB;
  const platformItem = dialog
    .locator(".el-form-item, .form-item")
    .filter({ hasText: /所属平台|运营平台|平台/ })
    .first();
  await expect(platformItem, "绑定抽屉未找到「所属平台」").toBeVisible({ timeout: 10000 });

  const select = platformItem.locator(".el-select, .el-select__wrapper, .el-input__wrapper").first();
  await expect(select, "所属平台下拉不可点").toBeVisible({ timeout: 8000 });
  await select.click();
  await page.waitForTimeout(400);

  // Element Plus 下拉常 teleport 到 body，不在抽屉内部
  const option = page
    .locator(
      [
        ".el-select-dropdown:visible .el-select-dropdown__item",
        ".el-select-dropdown:visible .el-option",
        ".el-popper:visible .el-select-dropdown__item",
        ".el-popper:visible .el-option",
        "[role='listbox']:visible [role='option']",
      ].join(", "),
    )
    .filter({ hasText: new RegExp(`^\\s*${platformLabel}\\s*$|${platformLabel}`, "i") })
    .first();
  await expect(option, `所属平台下拉未出现选项「${platformLabel}」`).toBeVisible({ timeout: 10000 });
  await option.click();
  await page.waitForTimeout(300);

  // 确认已选中（输入框/选择器上能看到平台名）
  const selected = await platformItem
    .getByText(new RegExp(platformLabel, "i"))
    .first()
    .isVisible()
    .catch(() => false);
  const placeholderGone = !(await platformItem.getByText(/请选择/).first().isVisible().catch(() => false));
  expect(selected || placeholderGone, `所属平台未成功选择「${platformLabel}」`).toBeTruthy();
}

  test("S7 三级：SDK 绑定", async () => {
    const page = sharedPage;
    test.skip(!ENABLE_SDK, "未开启 SDK 冒烟（smoke_plans.enableSdk）");
    test.skip(!SDK_USER, "未配置游戏商务账号 SMOKE_SDK_USER");
    const user = chain.l3User || SEED_L3_USER;
    const pass = chain.l3Pass || SEED_L3_PASS;
    test.skip(!user, "无三级账号可测（S5 未建出且无种子 l3）");

    await login(page, user, pass);
    await submitSdkBind(page, SDK_USER, SDK_PASS);
    recordSmokeAccount({
      level: "SDK游戏商务",
      username: SDK_USER,
      password: SDK_PASS,
      note: `sourceDb=${SDK_SOURCE_DB}；所属平台已选；由三级 ${user} 发起绑定`,
    });
    caseNotes.S7 = `已选所属平台「${SDK_SOURCE_DB === "lx" ? "龙翔" : SDK_SOURCE_DB}」，用 ${SDK_USER} 校验并绑定，等待 OA 审核属正常`;
  });

  test("S8 OA：绑定审核通过（接口）", async () => {
    test.skip(!ENABLE_OA_AUDIT, "未开启 OA 接口审核（smoke_plans.oaAudit.enabled）");
    const promote = chain.l3User || SEED_L3_USER;
    test.skip(!promote, "无三级账号，无法按 promoteAccount 审单");

    // 等绑定单落库
    await sharedPage.waitForTimeout(1500);
    const result = await callOaAudit({
      action: "approve",
      promoteAccount: promote,
      sourceDb: SDK_SOURCE_DB,
    });
    expect(result.ok, `OA 审核通过失败：${result.error || JSON.stringify(result)}`).toBeTruthy();
    caseNotes.S8 = `approveAudit platformBusierId=${result.platformBusierId} userId=${result.userId} promote=${promote}`;
  });

  test("S9 OA：通过后再绑 → 审核驳回", async () => {
    // 稳定路径：S7 绑定 → S8 通过 → 本步再建一条绑定 → 驳回（不复用已通过那条）
    test.skip(!ENABLE_OA_AUDIT, "未开启 OA 接口审核");
    test.skip(!ENABLE_SDK, "未开启 SDK");
    const page = sharedPage;
    const user = chain.l3User || SEED_L3_USER;
    const pass = chain.l3Pass || SEED_L3_PASS;
    test.skip(!user, "无三级账号");

    let sdkUser = SDK_USER_2;
    let sdkPass = SDK_USER_2 ? SDK_PASS_2 : SDK_PASS;
    if (!sdkUser) {
      // 自动创建临时游戏商务，避免与已通过的「龙翔一级商务」冲突
      const created = await fetch(`${WORKBENCH}/api/smoke/sdk/temp-promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceDb: SDK_SOURCE_DB }),
      }).then((r) => r.json() as Promise<Record<string, unknown>>);
      expect(created.ok, `创建驳回用游戏商务失败：${created.error || JSON.stringify(created)}`).toBeTruthy();
      sdkUser = String(created.account || "");
      sdkPass = String(created.password || "111111");
      recordSmokeAccount({
        level: "SDK游戏商务-驳回用",
        username: sdkUser,
        password: sdkPass,
        note: "S9 临时创建，专用于二次绑定后驳回",
      });
    }

    await login(page, user, pass);
    await submitSdkBind(page, sdkUser, sdkPass);
    await page.waitForTimeout(1500);

    const result = await callOaAudit({
      action: "reject",
      promoteAccount: user,
      sourceDb: SDK_SOURCE_DB,
      rejectReason: "smoke-reject",
    });
    expect(result.ok, `OA 审核驳回失败：${result.error || JSON.stringify(result)}`).toBeTruthy();

    // 绑定列表应能看到驳回痕迹（文案宽松）
    await openBindListTab(page);
    const bindText = (await page.locator("body").innerText().catch(() => "")) || "";
    const hasReject = /驳回|未通过|拒绝/.test(bindText);
    const hasSecond = bindText.includes(sdkUser);
    expect(hasReject || hasSecond, "二次绑定驳回后列表未见驳回状态/第二账号").toBeTruthy();

    caseNotes.S9 = `S8通过后二次绑定 ${sdkUser} → rejectAudit platformBusierId=${result.platformBusierId}`;
  });

  test("S10 一/二/三级：审核通过后工作台可见", async () => {
    const page = sharedPage;
    const l3 = chain.l3User || SEED_L3_USER;
    const l2 = chain.l2User || SEED_L2_USER;
    const l1 = chain.l1User || SEED_L1_USER;
    test.skip(!l3, "无三级账号");

    // 三级：工作台指标 + 绑定列表有「通过/已通过」类状态更佳
    await login(page, l3, chain.l3Pass || SEED_L3_PASS);
    await assertWorkbenchMetricsVisible(page, "三级");
    await openBindListTab(page);
    const bindText = (await page.locator("body").innerText().catch(() => "")) || "";
    const hasPassBadge = /已通过|通过|审核通过|成功/.test(bindText);
    const hasSdkRow = SDK_USER ? bindText.includes(SDK_USER) : true;
    expect(hasPassBadge || hasSdkRow, "三级绑定列表未见通过状态/绑定记录").toBeTruthy();

    if (l2) {
      await login(page, l2, chain.l2Pass || SEED_L2_PASS);
      await assertWorkbenchMetricsVisible(page, "二级");
      await openBusinessList(page);
      const l2Text = (await page.locator("body").innerText().catch(() => "")) || "";
      expect(/商务|账号|用户|列表/.test(l2Text), "二级商务列表页异常").toBeTruthy();
    }

    if (l1) {
      await login(page, l1, chain.l1Pass || SEED_L1_PASS);
      await assertWorkbenchMetricsVisible(page, "一级");
      await openChannelList(page);
      const l1Text = (await page.locator("body").innerText().catch(() => "")) || "";
      expect(/渠道|列表|商务|数据/.test(l1Text), "一级渠道列表页异常").toBeTruthy();
    }

    caseNotes.S10 = `已验三级${l2 ? "+二级" : ""}${l1 ? "+一级" : ""}工作台/列表（对照测试点：指标卡+业务入口）`;
  });

  test("S11 数据：页面指标可见（库对账可选）", async () => {
    const page = sharedPage;
    const l3 = chain.l3User || SEED_L3_USER;
    test.skip(!l3, "无三级账号");
    await login(page, l3, chain.l3Pass || SEED_L3_PASS);
    await assertWorkbenchMetricsVisible(page, "三级-S11");
    if (ENABLE_DATA_METRICS) {
      caseNotes.S11 = "页面指标可见；dataMetrics 已启用，后续可接 smoke_db/sw6 对账";
    } else {
      caseNotes.S11 =
        "页面指标可见（冒烟主路径）。库对账未开：game_* 用 smoke_db_config；新商务用户表在 sw6，需造数时再配";
    }
  });

  test("S12 数据分析：渠道数据统计", async () => {
    // 对照测试点：进入页 → 搜索区/汇总卡可见；可点搜索；空表或有数均可；轻验「包含下级」开关
    const page = sharedPage;
    const user = chain.l1User || SEED_L1_USER || chain.l3User || SEED_L3_USER;
    const pass = chain.l1User || SEED_L1_USER ? chain.l1Pass || SEED_L1_PASS : chain.l3Pass || SEED_L3_PASS;
    test.skip(!user, "无一级/三级账号可进数据分析");

    await login(page, user, pass);
    await openDataAnalysisPage(page, {
      item: /渠道数据统计/,
      fallbackPath: "/DataAnalysis/ChannelDataStatistics",
      ready: /渠道总数|渠道总注册|新增注册|活跃玩家|暂无数据/,
      label: "渠道数据统计",
    });
    const body = await assertDataPageAlive(
      page,
      "渠道数据统计",
      /渠道总数|渠道总注册玩家|渠道总充值|搜索|所属平台/,
    );
    await clickSearchOrQuery(page);
    const toggled = await toggleIncludeSubChannels(page);
    await clickSearchOrQuery(page);
    const after = ((await page.locator("body").innerText().catch(() => "")) || "").replace(/\s+/g, " ");
    const hasTableOrEmpty = /暂无数据|新增注册|活跃玩家|付费率|渠道名称/.test(after);
    expect(hasTableOrEmpty, "渠道数据统计：搜索后未见表格/空状态").toBeTruthy();
    caseNotes.S12 = `渠道数据统计可进可搜${toggled ? "；已点包含下级渠道数据" : ""}；${/暂无数据/.test(after) ? "当前空表" : "有汇总/列表"}；账号=${user}`;
    void body;
  });

  test("S13 数据分析：充值明细", async () => {
    // 对照测试点：选平台后可查充值流水；冒烟验页通 + 列表/空态；有造数时可见成功订单
    const page = sharedPage;
    const user = chain.l1User || SEED_L1_USER || chain.l3User || SEED_L3_USER;
    const pass = chain.l1User || SEED_L1_USER ? chain.l1Pass || SEED_L1_PASS : chain.l3Pass || SEED_L3_PASS;
    test.skip(!user, "无一级/三级账号");

    await login(page, user, pass);
    await openDataAnalysisPage(page, {
      item: /充值明细/,
      fallbackPath: "/DataAnalysis/RechargeDetails",
      ready: /玩家ID|订单号|实付金额|充值时间|暂无数据|导出/,
      label: "充值明细",
    });
    let body = await assertDataPageAlive(page, "充值明细", /订单号|实付金额|充值时间|搜索|所属平台/);
    await clickSearchOrQuery(page);
    body = ((await page.locator("body").innerText().catch(() => "")) || "").replace(/\s+/g, " ");
    const hasRow = /成功|支付宝|微信|SP_|¥\d/.test(body);
    const emptyOk = /暂无数据/.test(body);
    expect(hasRow || emptyOk, "充值明细：未见订单行也未见空状态").toBeTruthy();
    if (EXPECT_NONEMPTY_METRICS) {
      expect(hasRow, "SMOKE_EXPECT_NONEMPTY_METRICS=1 但充值明细无订单行").toBeTruthy();
    }
    caseNotes.S13 = hasRow ? `充值明细有流水（含成功/金额）；账号=${user}` : `充值明细空态可展示；账号=${user}`;
  });

  test("S14 数据分析：注册明细", async () => {
    const page = sharedPage;
    const user = chain.l1User || SEED_L1_USER || chain.l3User || SEED_L3_USER;
    const pass = chain.l1User || SEED_L1_USER ? chain.l1Pass || SEED_L1_PASS : chain.l3Pass || SEED_L3_PASS;
    test.skip(!user, "无一级/三级账号");

    await login(page, user, pass);
    await openDataAnalysisPage(page, {
      item: /注册明细/,
      fallbackPath: "/DataAnalysis/RegistrationDetails",
      ready: /玩家ID|注册时间|注册IP|暂无数据|累计充值/,
      label: "注册明细",
    });
    let body = await assertDataPageAlive(page, "注册明细", /玩家ID|注册时间|搜索|所属平台/);
    await clickSearchOrQuery(page);
    body = ((await page.locator("body").innerText().catch(() => "")) || "").replace(/\s+/g, " ");
    const hasRow = /注册时间|注册IP|机型|\d{6,}/.test(body) && !/^.*暂无数据.*$/.test(body.slice(0, 80));
    const hasPlayerish = /\b\d{6,}\b/.test(body) || /神速传奇|渠道|归属商务/.test(body);
    const emptyOk = /暂无数据/.test(body) && !hasPlayerish;
    expect(hasPlayerish || emptyOk || hasRow, "注册明细：未见注册行也未见空状态").toBeTruthy();
    if (EXPECT_NONEMPTY_METRICS) {
      expect(hasPlayerish, "SMOKE_EXPECT_NONEMPTY_METRICS=1 但注册明细无玩家行").toBeTruthy();
    }
    caseNotes.S14 = hasPlayerish ? `注册明细有流水；账号=${user}` : `注册明细空态可展示；账号=${user}`;
  });

  test("S15 数据分析：游戏数据 / 区服分析 / 排行榜", async () => {
    // 对照测试点：三个子菜单均可进入；游戏数据/排行有造数时可见；区服允许空表
    const page = sharedPage;
    const user = chain.l1User || SEED_L1_USER || chain.l3User || SEED_L3_USER;
    const pass = chain.l1User || SEED_L1_USER ? chain.l1Pass || SEED_L1_PASS : chain.l3Pass || SEED_L3_PASS;
    test.skip(!user, "无一级/三级账号");

    await login(page, user, pass);

    await openDataAnalysisPage(page, {
      item: /游戏数据/,
      fallbackPath: "/DataAnalysis/GameAnalytics",
      ready: /核心指标|游戏名称|ARPU|ARPPU|新增注册|请选择游戏/,
      label: "游戏数据",
    });
    await clickSearchOrQuery(page);
    const gameBody = await assertDataPageAlive(page, "游戏数据", /游戏名称|新增注册|充值金额|核心指标/);

    await openDataAnalysisPage(page, {
      item: /区服分析/,
      fallbackPath: "/DataAnalysis/ServerAnalysis",
      ready: /区服数据|区服编号|区服名称|开服日期|暂无数据|请选择所属平台/,
      label: "区服分析",
    });
    await clickSearchOrQuery(page);
    await assertDataPageAlive(page, "区服分析", /区服|搜索|所属平台/);

    await openDataAnalysisPage(page, {
      item: /排行榜/,
      fallbackPath: "/DataAnalysis/RankingAnalysis",
      ready: /渠道排行|商务排行|游戏排行|玩家注册量|今日|近7天/,
      label: "排行榜",
    });
    const rankBody = await assertDataPageAlive(page, "排行榜", /渠道排行|玩家注册量|今日/);
    const hasRank = /渠道\d+|注册量|#\s*1|龙翔/.test(rankBody);
    caseNotes.S15 = `游戏/区服/排行均可进；游戏页${/神速传奇|¥\d|合计/.test(gameBody) ? "有数" : "可空"}；排行${hasRank ? "有榜" : "占位"}；账号=${user}`;
  });

  test("S16 预警中心：预警列表", async () => {
    // 对照测试点：进预警列表 → 搜索区/统计卡 → 搜索；有行可点详情/查看（不强制处理提交）
    const page = sharedPage;
    const user = chain.l1User || SEED_L1_USER || chain.l3User || SEED_L3_USER;
    const pass = chain.l1User || SEED_L1_USER ? chain.l1Pass || SEED_L1_PASS : chain.l3Pass || SEED_L3_PASS;
    test.skip(!user, "无一级/三级账号");

    await login(page, user, pass);
    await openAlertCenterPage(page, {
      item: /预警列表/,
      fallbackPath: "/AlertCenter/AlertList",
      // 勿用「所属平台/搜索」：工作台也有，会误判未离开首页
      ready: /未处理|待审核|审核驳回|预警对象|数据权限隔离|请选择平台/,
      label: "预警列表",
    });
    expect(page.url(), "未进入预警列表路由").toMatch(/AlertList|AlertCenter/i);
    let body = await assertDataPageAlive(
      page,
      "预警列表",
      /未处理|处理中|已处理|预警对象|触发时间|数据权限隔离/,
    );
    await clickSearchOrQuery(page);
    body = ((await page.locator("body").innerText().catch(() => "")) || "").replace(/\s+/g, " ");
    const hasRow = /查看|处理|环比|注册异常|充值异常|登录异常/.test(body) && !/暂无数据/.test(body);
    const emptyOk = /暂无数据/.test(body);
    expect(hasRow || emptyOk || /未处理|已处理/.test(body), "预警列表：页面主路径未通").toBeTruthy();

    let detailOk = false;
    const viewBtn = page
      .locator(".el-table, .el-table__body, table")
      .getByRole("button", { name: /查看|详情|处理/ })
      .or(page.locator(".el-table button, .el-table a").filter({ hasText: /查看|详情/ }))
      .first();
    if (await viewBtn.isVisible().catch(() => false)) {
      await viewBtn.click().catch(() => {});
      await page.waitForTimeout(600);
      const dlg = page.locator(".el-dialog, .el-drawer").filter({ hasText: /预警|详情|处理/ }).first();
      detailOk = await dlg.isVisible().catch(() => false);
      if (detailOk) {
        const close = dlg.getByRole("button", { name: /关闭|取\s*消/ }).first();
        if (await close.isVisible().catch(() => false)) await close.click().catch(() => {});
        else await page.keyboard.press("Escape").catch(() => {});
      }
    }

    caseNotes.S16 = `预警列表可进可搜；${hasRow ? "有事件行" : emptyOk ? "空态" : "有统计卡"}；详情弹窗${detailOk ? "可开" : "未测/无行"}；账号=${user}`;
  });

  test("S17 预警中心：新建规则保存并清理", async () => {
    // 加深：新建 → 填名称/类型 → 保存成功落库 → 列表可见 → 编辑可开 → 删除清理
    const page = sharedPage;
    const user = chain.l1User || SEED_L1_USER || chain.l3User || SEED_L3_USER;
    const pass = chain.l1User || SEED_L1_USER ? chain.l1Pass || SEED_L1_PASS : chain.l3Pass || SEED_L3_PASS;
    test.skip(!user, "无一级/三级账号");
    const ruleName = `smoke_rule_${Date.now().toString().slice(-6)}`;

    await login(page, user, pass);
    await openAlertCenterPage(page, {
      item: /预警规则/,
      fallbackPath: "/AlertCenter/AlertRules",
      ready: /AI 预警规则|新建规则|暂无规则|预警去重规则|全部规则类型/,
      label: "预警规则",
    });
    expect(page.url(), "未进入预警规则路由").toMatch(/AlertRules|AlertCenter/i);

    await page.getByRole("button", { name: /新建规则/ }).click();
    const dlg = page.locator(".el-dialog, .el-drawer").filter({ hasText: /新建规则/ }).first();
    await expect(dlg, "新建规则抽屉未出现").toBeVisible({ timeout: 10000 });
    await dlg.getByPlaceholder(/请输入规则名称/).fill(ruleName);
    await dlg.getByPlaceholder(/注册异常|充值异常|登录异常/).fill("注册异常");
    await dlg.getByRole("button", { name: /保\s*存|确\s*定/ }).click();

    const toastOk = await page
      .getByText(/保存成功|操作成功/)
      .first()
      .waitFor({ timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    await settleSpa(page, 1200);
    let body = ((await page.locator("body").innerText().catch(() => "")) || "").replace(/\s+/g, " ");
    const listed = body.includes(ruleName);
    expect(toastOk || listed, `规则保存后未见成功提示/列表：${ruleName}`).toBeTruthy();
    expect(listed, `规则未出现在列表：${ruleName}`).toBeTruthy();

    const row = page.locator(".el-table__row, tr, .el-card").filter({ hasText: ruleName }).first();
    await expect(row, "未找到新建规则行").toBeVisible({ timeout: 10000 });
    await row
      .getByRole("button", { name: /编辑/ })
      .or(row.locator("button, a").filter({ hasText: /编辑/ }))
      .first()
      .click();
    const editDlg = page.locator(".el-dialog, .el-drawer").filter({ hasText: /编辑规则|新建规则|规则名称/ }).first();
    const editOk = await editDlg.isVisible({ timeout: 8000 }).catch(() => false);
    if (editOk) {
      const nameInEdit = await editDlg.getByPlaceholder(/请输入规则名称/).inputValue().catch(() => "");
      expect(
        nameInEdit === ruleName || (await editDlg.getByText(ruleName).count()) > 0,
        "编辑抽屉未带回规则名",
      ).toBeTruthy();
      const cancel = editDlg.getByRole("button", { name: /取\s*消|关闭/ }).first();
      if (await cancel.isVisible().catch(() => false)) await cancel.click();
      else await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    }

    await row
      .getByRole("button", { name: /删除/ })
      .or(row.locator("button, a").filter({ hasText: /删除/ }))
      .first()
      .click();
    await page.waitForTimeout(400);
    const confirm = page
      .locator(".el-message-box, .el-popconfirm, .el-overlay")
      .getByRole("button", { name: /确\s*定|删除/ })
      .first();
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    else {
      const boxOk = page.locator(".el-message-box__btns button").filter({ hasText: /确\s*定/ }).first();
      if (await boxOk.isVisible().catch(() => false)) await boxOk.click();
    }
    await settleSpa(page, 1200);
    body = ((await page.locator("body").innerText().catch(() => "")) || "").replace(/\s+/g, " ");
    expect(!body.includes(ruleName), `删除后规则仍在列表：${ruleName}`).toBeTruthy();

    caseNotes.S17 = `新建 ${ruleName} 保存成功；编辑${editOk ? "可开" : "弱"}；已删除清理；账号=${user}`;
  });

  test("S18 预警中心：工作台跳转 + 处理预警（有单则落库）", async () => {
    // 加深：工作台「查看全部」→ 预警列表；有未处理单则走处理提交；无单则记空态（无造单接口）
    const page = sharedPage;
    const user = chain.l1User || SEED_L1_USER || chain.l3User || SEED_L3_USER;
    const pass = chain.l1User || SEED_L1_USER ? chain.l1Pass || SEED_L1_PASS : chain.l3Pass || SEED_L3_PASS;
    test.skip(!user, "无一级/三级账号");

    await login(page, user, pass);
    // 勿用 openWorkbench 的「侧栏有工作台/数据分析即返回」——从规则页会误判
    await openByMenu(page, {
      item: /^工作台$/,
      ready: /今日渠道|今日充值|AI 实时预警|活跃渠道|新增渠道/,
      fallbackPath: "/index",
      label: "工作台",
    });
    if (!/今日渠道|AI 实时预警|活跃渠道/.test(((await page.locator("body").innerText().catch(() => "")) || ""))) {
      await page.goto(`${BASE}/index`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await settleSpa(page, 1500);
    }

    const viewAll = page
      .locator(".main-container, .app-main, .dashboard, #app")
      .getByText(/查看全部/)
      .or(page.getByRole("link", { name: /查看全部/ }))
      .or(page.getByText(/查看全部/))
      .first();
    const viewAllVisible = await viewAll.isVisible({ timeout: 8000 }).catch(() => false);
    if (viewAllVisible) {
      await viewAll.click();
      await settleSpa(page, 1500);
    } else {
      // 工作台无「查看全部」时直接进预警列表（环境可能折叠 AI 区块）
      await openAlertCenterPage(page, {
        item: /预警列表/,
        fallbackPath: "/AlertCenter/AlertList",
        ready: /未处理|待审核|预警对象|数据权限隔离/,
        label: "预警列表",
      });
    }

    const onAlertList =
      /AlertList/i.test(page.url()) ||
      (await page.getByText(/数据权限隔离|预警对象|未处理/).first().isVisible().catch(() => false));
    if (!onAlertList) {
      await openAlertCenterPage(page, {
        item: /预警列表/,
        fallbackPath: "/AlertCenter/AlertList",
        ready: /未处理|待审核|预警对象|数据权限隔离/,
        label: "预警列表-兜底",
      });
    }
    expect(page.url(), "未进入预警列表").toMatch(/AlertList|AlertCenter/i);

    await clickSearchOrQuery(page);
    const body = ((await page.locator("body").innerText().catch(() => "")) || "").replace(/\s+/g, " ");
    const empty = /暂无数据|暂无待处理/.test(body);

    const processBtn = page
      .locator(".el-table__body, .el-table, table")
      .getByRole("button", { name: /处理/ })
      .or(page.locator(".el-table button").filter({ hasText: /^处理$/ }))
      .first();
    const hasProcess = await processBtn.isVisible().catch(() => false);

    if (!hasProcess) {
      expect(empty || /未处理\s*0/.test(body), "无处理按钮且非空态，页面异常").toBeTruthy();
      caseNotes.S18 = `已进预警列表（查看全部=${viewAllVisible ? "点到" : "无入口直达"}）；当前无待处理单，处理落库待有数据后再验`;
      return;
    }

    await processBtn.click();
    await page.waitForTimeout(700);
    const dlg = page.locator(".el-dialog, .el-drawer").filter({ hasText: /预警处理|处理预警|上报|备注/ }).first();
    await expect(dlg, "处理弹窗未出现").toBeVisible({ timeout: 10000 });

    const submit = dlg.getByRole("button", { name: /确\s*定|提\s*交|保存/ }).first();
    if (await submit.isVisible().catch(() => false)) {
      await submit.click().catch(() => {});
      await page.waitForTimeout(500);
    }
    const stillOpen = await dlg.isVisible().catch(() => false);
    const tip = await page.getByText(/不能为空|请输入|必填|上报说明/).first().isVisible().catch(() => false);

    const note = dlg.locator("textarea").or(dlg.getByPlaceholder(/备注|说明|上报/)).first();
    await expect(note, "处理弹窗未见备注/说明输入").toBeVisible({ timeout: 8000 });
    await note.fill(`smoke-process-${Date.now().toString().slice(-6)}`);
    await submit.click();
    await settleSpa(page, 1500);

    const toastOk = await page
      .getByText(/成功|已处理|提交成功|操作成功/)
      .first()
      .waitFor({ timeout: 12000 })
      .then(() => true)
      .catch(() => false);
    const after = ((await page.locator("body").innerText().catch(() => "")) || "").replace(/\s+/g, " ");
    const statusMoved = /已处理|处理中|待审核/.test(after);
    expect(
      toastOk || statusMoved || !(await dlg.isVisible().catch(() => false)),
      "处理提交后未见成功/状态变化",
    ).toBeTruthy();

    caseNotes.S18 = `查看全部跳转OK；已处理一条预警落库；空提交拦截=${stillOpen || tip ? "是" : "弱"}；账号=${user}`;
  });
});
